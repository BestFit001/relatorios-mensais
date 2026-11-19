-- PDV das marcas com compliance de preço: por SKU, o PDV permitido e quantos % o preço pode ficar abaixo dele.
-- A calculadora avisa (tela e Excel) quando um preço fica abaixo do mínimo (PDV x (1 - % abaixo)).
create table if not exists public.pdv_marcas (
  id              bigint generated always as identity primary key,
  sku             text not null unique,          -- chave normalizada (minúsculo, sem ".0")
  sku_original    text,
  marca           text,
  pdv             numeric not null check (pdv > 0),
  tolerancia_pct  numeric not null default 0 check (tolerancia_pct >= 0 and tolerancia_pct < 100),
  arquivo         text,
  atualizado_em   timestamptz not null default now()
);

alter table public.pdv_marcas enable row level security;
create policy "pdv_marcas_all" on public.pdv_marcas for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on public.pdv_marcas to anon, authenticated;
