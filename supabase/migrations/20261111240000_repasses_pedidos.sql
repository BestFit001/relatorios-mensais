-- Repasse REAL por pedido (extrato do canal, hoje só TikTok). O dashboard usa este valor no lugar da fórmula estimada da aba Regras.
-- Fica numa tabela própria (e não em vendas_canais) porque subir as vendas de novo apaga e recria as linhas do mês.
-- Idempotente.

create table if not exists public.repasses_pedidos (
  id              bigint generated always as identity primary key,
  canal           text not null,
  id_pedido       text not null,                    -- no mesmo formato do dashboard: sem espaços, sem ".0" final, minúsculo
  repasse         numeric(14,2) not null,           -- soma do repasse de todas as linhas do pedido no extrato (carrinho = várias linhas)
  linhas_extrato  integer not null default 1,
  mes_referencia  text,
  arquivo         text,
  atualizado_em   timestamptz not null default now(),
  constraint repasses_pedidos_canal_pedido_uk unique (canal, id_pedido)
);
create index if not exists repasses_pedidos_canal_idx on public.repasses_pedidos (canal);

alter table public.repasses_pedidos enable row level security;
drop policy if exists "Acesso total livre" on public.repasses_pedidos;
create policy "Acesso total livre" on public.repasses_pedidos for all to public using (true) with check (true);
