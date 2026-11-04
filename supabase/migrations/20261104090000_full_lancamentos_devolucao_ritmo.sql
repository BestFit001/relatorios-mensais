-- Full: guarda a % de devolução (aba Devoluções) e o status de ritmo de vendas de cada SKU.
-- Idempotente. Execute no SQL Editor do Supabase.
alter table public.full_lancamentos add column if not exists taxa_devolucao numeric default 0;
alter table public.full_lancamentos add column if not exists qtd_devolucoes integer default 0;
alter table public.full_lancamentos add column if not exists ritmo_vendas   text    default '';
