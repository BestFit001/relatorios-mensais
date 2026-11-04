-- Aba "Dimensões e Peso": medidas e peso REAIS por SKU pai (usadas na exportação para o Tiny com prioridade máxima)
create table if not exists public.dimensoes_peso (
  sku_pai      text primary key,
  produto      text,
  largura      numeric not null check (largura > 0),
  altura       numeric not null check (altura > 0),
  comprimento  numeric not null check (comprimento > 0),
  peso         numeric not null check (peso > 0),   -- em kg
  criado_por   text,
  created_at   timestamptz default now(),
  atualizado_em timestamptz default now()
);

grant select, insert, update, delete on public.dimensoes_peso to anon, authenticated;
