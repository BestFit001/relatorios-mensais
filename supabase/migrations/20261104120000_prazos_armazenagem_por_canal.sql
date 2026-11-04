-- Prazos de armazenagem do Full por canal (configurados na aba Regras).
-- Idempotente. Execute no SQL Editor do Supabase.

alter table public.config_regras_canais add column if not exists dias_alerta_armazenagem   integer default 90;
alter table public.config_regras_canais add column if not exists dias_cobranca_armazenagem integer default 120;

-- Ritmo de vendas também na Logística Própria (usada para medir o que serve para o Full)
alter table public.vendas_padrao_lancamentos add column if not exists ritmo_vendas text default '';

-- Alerta e resumo por SKU passam a usar o prazo de cada canal (padrão 90/120 se não houver)
drop view     if exists public.vw_fulfillment_saldo_sku;
drop function if exists public.fulfillment_lotes_alerta(text, integer, integer, boolean);

create or replace function public.fulfillment_lotes_alerta(
  p_canal text default null, p_dias_alerta integer default null,
  p_dias_cobranca integer default null, p_somente_alerta boolean default false
)
returns table (
  lote_id bigint, canal text, sku text, data_entrada date, qtd_enviada integer, qtd_remanescente integer,
  dias_em_estoque integer, dias_para_cobranca integer, nivel text, alerta text
)
language sql stable
as $$
  with base as (
    select b.id, b.canal, b.sku, b.data_entrada, b.qtd_enviada, b.qtd_remanescente,
           ((now() at time zone 'America/Sao_Paulo')::date - b.data_entrada) as dias,
           coalesce(p_dias_alerta,   c.dias_alerta_armazenagem,   90)  as d_alerta,
           coalesce(p_dias_cobranca, c.dias_cobranca_armazenagem, 120) as d_cobranca
      from public.fulfillment_batches b
      left join public.config_regras_canais c on lower(trim(c.canal)) = lower(trim(b.canal))
     where b.qtd_remanescente > 0 and (p_canal is null or b.canal = p_canal)
  )
  select id, canal, sku, data_entrada, qtd_enviada, qtd_remanescente,
         dias::integer, (d_cobranca - dias)::integer,
         case when dias >= d_cobranca then 'COBRANDO' when dias >= d_alerta then 'ALERTA' else 'OK' end,
         case when dias >= d_cobranca then 'Armazenagem em cobrança'
              when dias >= d_alerta
                then 'Começará cobrar estoque — ' ||
                     case when (d_cobranca - dias) = 1 then 'falta 1 dia' else 'faltam ' || (d_cobranca - dias) || ' dias' end ||
                     ' para ' || d_cobranca
              else null end
    from base
   where (not p_somente_alerta) or dias >= d_alerta
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
  from public.fulfillment_lotes_alerta(null, null, null, false) a
 group by a.canal, a.sku;

grant select on public.vw_fulfillment_saldo_sku to anon, authenticated;
grant execute on function public.fulfillment_lotes_alerta(text, integer, integer, boolean) to anon, authenticated;
