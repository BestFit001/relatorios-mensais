-- =============================================================================
-- Fulfillment: controle de remessas por lote (FIFO), alerta de armazenagem (60 dias)
-- e conciliação de cancelamentos (estorno integral: receita + taxas + CMV).
-- Idempotente (pode rodar mais de uma vez). Execute no SQL Editor do Supabase.
-- =============================================================================

-- 1) LOTES (entrada de estoque no Full)
create table if not exists public.fulfillment_batches (
  id                 bigserial primary key,
  canal              text        not null,
  sku                text        not null,                    -- normalizado (minúsculo, sem '.0')
  data_entrada       date        not null,
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

-- 2) VENDAS DO FULL, UMA LINHA POR ITEM (somente vendas VÁLIDAS; cancelamentos nunca abatem lote)
create table if not exists public.fulfillment_vendas_dia (
  id              bigserial primary key,
  canal           text    not null,
  mes_referencia  text    not null,                           -- 'MM/AAAA'
  id_venda        text    not null,
  sku             text    not null,
  data_venda      date    not null,
  qtd             integer not null check (qtd > 0),
  criado_em       timestamptz not null default now(),
  unique (canal, id_venda, sku, data_venda)
);
create index if not exists ix_fulfillment_vendas_dia_fifo on public.fulfillment_vendas_dia (canal, sku, data_venda, id);
create index if not exists ix_fulfillment_vendas_dia_mes on public.fulfillment_vendas_dia (canal, mes_referencia);

-- 3) LEDGER DE CONSUMO (qual venda abateu qual lote). lote_id NULL = venda sem lote registrado
create table if not exists public.fulfillment_batch_consumos (
  id          bigserial primary key,
  lote_id     bigint references public.fulfillment_batches (id) on delete cascade,
  canal       text    not null,
  sku         text    not null,
  id_venda    text    not null,
  data_venda  date    not null,
  qtd         integer not null check (qtd > 0),
  criado_em   timestamptz not null default now()
);
create index if not exists ix_fulfillment_consumos_lote on public.fulfillment_batch_consumos (lote_id);
create index if not exists ix_fulfillment_consumos_canal_sku on public.fulfillment_batch_consumos (canal, sku);

-- 4) FIFO — recalcula o saldo de todos os lotes do canal (ou de um SKU). Idempotente.
create or replace function public.fulfillment_recalcular_fifo(p_canal text, p_sku text default null)
returns table (out_sku text, out_vendido bigint, out_abatido bigint, out_sem_lote bigint)
language plpgsql
as $$
declare
  v        record;
  l        record;
  v_faltam integer;
  v_abate  integer;
  v_sku    text := lower(nullif(trim(p_sku), ''));
begin
  update public.fulfillment_batches b
     set qtd_remanescente = b.qtd_enviada, atualizado_em = now()
   where b.canal = p_canal and (v_sku is null or b.sku = v_sku);

  delete from public.fulfillment_batch_consumos c
   where c.canal = p_canal and (v_sku is null or c.sku = v_sku);

  for v in
    select vd.sku, vd.id_venda, vd.data_venda, vd.qtd, vd.id
      from public.fulfillment_vendas_dia vd
     where vd.canal = p_canal and (v_sku is null or vd.sku = v_sku)
     order by vd.sku, vd.data_venda, vd.id
  loop
    v_faltam := v.qtd;

    for l in
      select b.id, b.qtd_remanescente
        from public.fulfillment_batches b
       where b.canal = p_canal and b.sku = v.sku
         and b.data_entrada <= v.data_venda and b.qtd_remanescente > 0
       order by b.data_entrada, b.id          -- FIFO: lote mais antigo primeiro
       for update
    loop
      exit when v_faltam <= 0;
      v_abate := least(v_faltam, l.qtd_remanescente);

      update public.fulfillment_batches set qtd_remanescente = qtd_remanescente - v_abate where id = l.id;
      insert into public.fulfillment_batch_consumos (lote_id, canal, sku, id_venda, data_venda, qtd)
      values (l.id, p_canal, v.sku, v.id_venda, v.data_venda, v_abate);

      v_faltam := v_faltam - v_abate;
    end loop;

    if v_faltam > 0 then
      insert into public.fulfillment_batch_consumos (lote_id, canal, sku, id_venda, data_venda, qtd)
      values (null, p_canal, v.sku, v.id_venda, v.data_venda, v_faltam);
    end if;
  end loop;

  return query
    select c.sku, sum(c.qtd)::bigint,
           sum(c.qtd) filter (where c.lote_id is not null)::bigint,
           coalesce(sum(c.qtd) filter (where c.lote_id is null), 0)::bigint
      from public.fulfillment_batch_consumos c
     where c.canal = p_canal and (v_sku is null or c.sku = v_sku)
     group by c.sku order by c.sku;
end;
$$;

-- 5) REGRA DOS 60 DIAS
--    >= p_dias_alerta (50) e < p_dias_cobranca (60) => 'Começará cobrar estoque'
--    >= p_dias_cobranca (60)                        => 'Armazenagem em cobrança'
create or replace function public.fulfillment_lotes_alerta(
  p_canal text default null, p_dias_alerta integer default 50,
  p_dias_cobranca integer default 60, p_somente_alerta boolean default false
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
              when dias >= p_dias_alerta   then 'Começará cobrar estoque' else null end
    from base
   where (not p_somente_alerta) or dias >= p_dias_alerta
   order by data_entrada, id;
$$;

create or replace view public.vw_fulfillment_saldo_sku as
select a.canal, a.sku,
       sum(a.qtd_remanescente)::integer as saldo_lotes,
       coalesce(sum(a.qtd_remanescente) filter (where a.nivel = 'ALERTA'), 0)::integer   as qtd_em_alerta,
       coalesce(sum(a.qtd_remanescente) filter (where a.nivel = 'COBRANDO'), 0)::integer as qtd_cobrando,
       max(a.dias_em_estoque) as lote_mais_antigo_dias,
       case when bool_or(a.nivel = 'COBRANDO') then 'COBRANDO' when bool_or(a.nivel = 'ALERTA') then 'ALERTA' else 'OK' end as nivel,
       case when bool_or(a.nivel = 'COBRANDO') then 'Armazenagem em cobrança'
            when bool_or(a.nivel = 'ALERTA')   then 'Começará cobrar estoque' else null end as alerta
  from public.fulfillment_lotes_alerta(null, 50, 60, false) a
 group by a.canal, a.sku;

-- 6) CANCELAMENTOS — estorno integral (receita + taxas/comissões + CMV)
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

-- Vendas com flag de cancelamento e CMV do item ((custo + embalagem) × quantidade)
create or replace view public.vw_vendas_conciliadas as
select v.canal, v.mes_referencia, v.id_pedido, v.sku,
       coalesce(nullif(v.quantidade::text, '')::numeric, 1)      as quantidade,
       coalesce(nullif(v.preco_venda::text, '')::numeric, 0)     as preco_venda,
       coalesce(nullif(v.repasse_liquido::text, '')::numeric, 0) as repasse_liquido,
       (coalesce(nullif(t.custo_unitario::text, '')::numeric, 0)
        + coalesce(nullif(t.custo_embalagem::text, '')::numeric, 0))
        * coalesce(nullif(v.quantidade::text, '')::numeric, 1)   as cmv,
       exists (select 1 from public.cancelados c
                where lower(trim(c.id_pedido)) = lower(trim(v.id_pedido))
                  and lower(trim(c.canal))     = lower(trim(v.canal))) as cancelada
  from public.vendas_canais v
  left join public.tabela_custos_skus t on lower(trim(t.sku)) = lower(trim(v.sku));

-- Resultado por canal/mês conciliado: venda cancelada => saem receita, repasse (taxas/frete) e CMV juntos
create or replace view public.vw_conciliacao_canal_mes as
select canal, mes_referencia,
       sum(preco_venda)     filter (where not cancelada) as receita_liquida,
       sum(repasse_liquido) filter (where not cancelada) as repasse_liquido,
       sum(cmv)             filter (where not cancelada) as cmv,
       coalesce(sum(preco_venda)     filter (where cancelada), 0) as receita_estornada,
       coalesce(sum(repasse_liquido) filter (where cancelada), 0) as repasse_estornado,
       coalesce(sum(cmv)             filter (where cancelada), 0) as cmv_estornado,
       count(*) filter (where cancelada)                          as vendas_canceladas
  from public.vw_vendas_conciliadas
 group by canal, mes_referencia;

-- 7) Permissões (o app usa a chave anon; ajuste se usar RLS)
grant select, insert, update, delete on public.fulfillment_batches, public.fulfillment_vendas_dia,
      public.fulfillment_batch_consumos, public.cancelados to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant select on public.vw_fulfillment_saldo_sku, public.vw_vendas_conciliadas, public.vw_conciliacao_canal_mes to anon, authenticated;
grant execute on function public.fulfillment_recalcular_fifo(text, text) to anon, authenticated;
grant execute on function public.fulfillment_lotes_alerta(text, integer, integer, boolean) to anon, authenticated;
