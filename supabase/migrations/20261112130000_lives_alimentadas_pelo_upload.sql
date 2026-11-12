-- Lives alimentadas pelo upload de vendas: cada linha de venda de live guarda o canal, o mês do upload,
-- o pedido, o modal de venda e o vendedor. Idempotente.
alter table public.vendas_lives_separadas
  add column if not exists canal text,
  add column if not exists mes_referencia text,
  add column if not exists id_pedido text,
  add column if not exists modal_venda text,
  add column if not exists vendedor text;

create index if not exists vendas_lives_canal_mes_idx on public.vendas_lives_separadas (canal, mes_referencia);
