-- Impacto dos cancelados: dados puxados da planilha de faturados (NF-e, comprador, valor do pedido)
alter table public.checagem_cancelados
  add column if not exists nf_e text,
  add column if not exists comprador text,
  add column if not exists valor_pedido numeric,
  add column if not exists impacto_arquivo text;
