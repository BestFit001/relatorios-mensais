-- Buscar fotos (Google Cloud Vision): cada busca gasta 1 uso da cota gratuita (1.000/mês). Este registro limita o gasto.
create table if not exists public.fotos_buscas (
  id         bigserial primary key,
  criado_em  timestamptz not null default now(),
  usuario    text,
  sku        text,
  achados    integer
);
create index if not exists ix_fotos_buscas_data on public.fotos_buscas (criado_em);
-- só o servidor (chave de serviço) lê e grava
alter table public.fotos_buscas enable row level security;
