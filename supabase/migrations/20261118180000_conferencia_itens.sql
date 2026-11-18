-- Conferência de cancelados: SKU e quantidade de cada pedido, para dar baixa no estoque antes de emitir a NF-e de devolução.
-- Base separada (não entra em Faturados nem em vendas_canais). Um pedido pode ter vários SKUs: uma linha por pedido + SKU.
create table if not exists public.conferencia_itens (
  id          bigint generated always as identity primary key,
  chave       text not null,                 -- número do pedido sem símbolos, maiúsculo (mesma chave de conferencia_cancelados)
  id_pedido   text not null,
  sku         text not null,
  quantidade  numeric not null default 1,
  produto     text,
  arquivo     text,
  created_at  timestamptz not null default now(),
  unique (chave, sku)
);
create index if not exists conferencia_itens_chave_idx on public.conferencia_itens (chave);

alter table public.conferencia_itens enable row level security;
create policy "conferencia_itens_all" on public.conferencia_itens for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.conferencia_itens to anon, authenticated;
