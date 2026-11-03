-- =============================================================================
-- Fulfillment v2 — remessas enviadas ao Full (data = dia do upload da planilha),
-- baixa FIFO pelas vendas válidas do mês e aviso de armazenagem:
--   a partir de 90 dias  => "Começará cobrar estoque — faltam X dias para 120"
--   a partir de 120 dias => "Armazenagem em cobrança"
-- Idempotente. Substitui os objetos da v1 (fulfillment_vendas_dia / consumos).
-- Execute no SQL Editor do Supabase.
-- =============================================================================

-- 0) Remove o que era exclusivo da v1 (venda por dia / ledger de consumo)
drop view     if exists public.vw_fulfillment_saldo_sku;
drop function if exists public.fulfillment_lotes_alerta(text, integer, integer, boolean);
drop function if exists public.fulfillment_recalcular_fifo(text, text);
drop function if exists public.fulfillment_recalcular_fifo(text);
drop table    if exists public.fulfillment_batch_consumos;
drop table    if exists public.fulfillment_vendas_dia;

-- 1) LOTES: cada upload de remessa vira um lote com a data do upload
create table if not exists public.fulfillment_batches (
  id                 bigserial primary key,
  canal              text        not null,
  sku                text        not null,                    -- normalizado (minúsculo, sem '.0')
  data_entrada       date        not null,                    -- dia em que a planilha foi enviada/upada
  qtd_enviada        integer     not null check (qtd_enviada > 0),
  qtd_remanescente   integer     not null check (qtd_remanescente >= 0),
  importacao_id      uuid,
  arquivo_origem     text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint fulfillment_batches_saldo_ok check (qtd_remanescente <= qtd_enviada)
);
create index if not exists ix_fulfillment_batches_fifo on public.fulfillment_batches (canal, sku, data_entrada, id);
create index if not exists ix_fulfillment_batches_saldo on public.fulfillment_batches (canal, qtd_remanescente) where qtd_remanescente > 0;
create index if not exists ix_fulfillment_batches_importacao on public.fulfillment_batches (importacao_id);

-- 2) VENDAS VÁLIDAS POR SKU/MÊS (já sem cancelados — o app grava ao "Gravar Análise")
create table if not exists public.fulfillment_vendas_mes (
  id              bigserial primary key,
  canal           text    not null,
  mes_referencia  text    not null,                           -- 'MM/AAAA'
  sku             text    not null,
  qtd             integer not null check (qtd > 0),
  criado_em       timestamptz not null default now(),
  unique (canal, mes_referencia, sku)
);
create index if not exists ix_fulfillment_vendas_mes_canal on public.fulfillment_vendas_mes (canal, mes_referencia);

-- 3) FIFO: refaz o saldo dos lotes do canal. Cada mês abate primeiro o lote MAIS ANTIGO
--    que já tinha entrado até o último dia daquele mês. Idempotente.
create or replace function public.fulfillment_recalcular_fifo(p_canal text)
returns table (out_sku text, out_vendido bigint, out_sem_lote bigint)
language plpgsql
as $$
declare
  v        record;
  l        record;
  v_faltam integer;
  v_abate  integer;
  v_fim    date;
begin
  update public.fulfillment_batches b
     set qtd_remanescente = b.qtd_enviada, atualizado_em = now()
   where b.canal = p_canal;

  create temp table if not exists _fifo_sem_lote (sku text, qtd integer) on commit drop;
  delete from _fifo_sem_lote;

  for v in
    select vm.sku, vm.qtd, vm.mes_referencia,
           (date_trunc('month', to_date('01/' || vm.mes_referencia, 'DD/MM/YYYY')) + interval '1 month - 1 day')::date as fim_mes
      from public.fulfillment_vendas_mes vm
     where vm.canal = p_canal
     order by to_date('01/' || vm.mes_referencia, 'DD/MM/YYYY'), vm.sku
  loop
    v_faltam := v.qtd;
    v_fim    := v.fim_mes;

    for l in
      select b.id, b.qtd_remanescente
        from public.fulfillment_batches b
       where b.canal = p_canal and b.sku = v.sku
         and b.data_entrada <= v_fim and b.qtd_remanescente > 0
       order by b.data_entrada, b.id          -- FIFO: lote mais antigo primeiro
       for update
    loop
      exit when v_faltam <= 0;
      v_abate := least(v_faltam, l.qtd_remanescente);
      update public.fulfillment_batches set qtd_remanescente = qtd_remanescente - v_abate where id = l.id;
      v_faltam := v_faltam - v_abate;
    end loop;

    if v_faltam > 0 then
      insert into _fifo_sem_lote values (v.sku, v_faltam);
    end if;
  end loop;

  return query
    select vm.sku,
           sum(vm.qtd)::bigint,
           coalesce((select sum(s.qtd) from _fifo_sem_lote s where s.sku = vm.sku), 0)::bigint
      from public.fulfillment_vendas_mes vm
     where vm.canal = p_canal
     group by vm.sku order by vm.sku;
end;
$$;

-- 4) AVISO DE ARMAZENAGEM
--    dias >= p_dias_alerta (90) e < p_dias_cobranca (120) => 'Começará cobrar estoque — faltam X dias para 120'
--    dias >= p_dias_cobranca (120)                       => 'Armazenagem em cobrança'
create or replace function public.fulfillment_lotes_alerta(
  p_canal text default null, p_dias_alerta integer default 90,
  p_dias_cobranca integer default 120, p_somente_alerta boolean default false
)
returns table (
  lote_id bigint, canal text, sku text, data_entrada date, qtd_enviada integer, qtd_remanescente integer,
  dias_em_estoque integer, dias_para_cobranca integer, nivel text, alerta text
)
language sql stable
as $$
  with base as (
    select b.id, b.canal, b.sku, b.data_entrada, b.qtd_enviada, b.qtd_remanescente,
           ((now() at time zone 'America/Sao_Paulo')::date - b.data_entrada) as dias
      from public.fulfillment_batches b
     where b.qtd_remanescente > 0 and (p_canal is null or b.canal = p_canal)
  )
  select id, canal, sku, data_entrada, qtd_enviada, qtd_remanescente,
         dias::integer, (p_dias_cobranca - dias)::integer,
         case when dias >= p_dias_cobranca then 'COBRANDO' when dias >= p_dias_alerta then 'ALERTA' else 'OK' end,
         case when dias >= p_dias_cobranca then 'Armazenagem em cobrança'
              when dias >= p_dias_alerta
                then 'Começará cobrar estoque — ' ||
                     case when (p_dias_cobranca - dias) = 1 then 'falta 1 dia' else 'faltam ' || (p_dias_cobranca - dias) || ' dias' end ||
                     ' para ' || p_dias_cobranca
              else null end
    from base
   where (not p_somente_alerta) or dias >= p_dias_alerta
   order by data_entrada, id;
$$;

create or replace view public.vw_fulfillment_saldo_sku as
select a.canal, a.sku,
       sum(a.qtd_remanescente)::integer as saldo_lotes,
       coalesce(sum(a.qtd_remanescente) filter (where a.nivel = 'ALERTA'), 0)::integer   as qtd_em_alerta,
       coalesce(sum(a.qtd_remanescente) filter (where a.nivel = 'COBRANDO'), 0)::integer as qtd_cobrando,
       max(a.dias_em_estoque)      as lote_mais_antigo_dias,
       min(a.dias_para_cobranca)   as dias_para_cobranca,
       case when bool_or(a.nivel = 'COBRANDO') then 'COBRANDO' when bool_or(a.nivel = 'ALERTA') then 'ALERTA' else 'OK' end as nivel
  from public.fulfillment_lotes_alerta(null, 90, 120, false) a
 group by a.canal, a.sku;

-- 5) Tabela cancelados (usada pelo dashboard/executivo para estorno) — garante estrutura
create table if not exists public.cancelados (
  id              bigserial primary key,
  canal           text not null,
  mes_referencia  text not null,
  id_pedido       text,
  sku             text,
  quantidade      numeric,
  valor           numeric,
  criado_em       timestamptz default now()
);
alter table public.cancelados add column if not exists id_pedido text;
alter table public.cancelados add column if not exists sku        text;
alter table public.cancelados add column if not exists quantidade numeric;
alter table public.cancelados add column if not exists valor      numeric;
create index if not exists ix_cancelados_pedido on public.cancelados (canal, id_pedido);

-- 6) Permissões (o app usa a chave anon; ajuste se usar RLS)
grant select, insert, update, delete on public.fulfillment_batches, public.fulfillment_vendas_mes, public.cancelados to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant select on public.vw_fulfillment_saldo_sku to anon, authenticated;
grant execute on function public.fulfillment_recalcular_fifo(text) to anon, authenticated;
grant execute on function public.fulfillment_lotes_alerta(text, integer, integer, boolean) to anon, authenticated;
