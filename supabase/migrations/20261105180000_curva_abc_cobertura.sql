-- Curva ABC > sub-aba "Cobertura de Estoque"
-- 1) Retorno de compras por SKU (lista fixa + texto livre). Um valor por SKU (o mais recente).
create table if not exists public.curva_retorno_compras (
  id            bigserial primary key,
  sku           text not null unique,        -- SKU normalizado (minúsculo, só letras/números), igual ao da base do Tiny
  retorno       text not null,
  atualizado_por text,
  atualizado_em timestamptz default now()
);

-- 2) Configuração compartilhada: colunas que somem quando se clica em "Ocultar informações"
create table if not exists public.curva_cobertura_config (
  id              integer primary key default 1 check (id = 1),
  colunas_ocultas jsonb not null default '[]'::jsonb,
  atualizado_por  text,
  atualizado_em   timestamptz default now()
);

grant select, insert, update, delete on public.curva_retorno_compras, public.curva_cobertura_config to anon, authenticated;
grant usage, select on sequence public.curva_retorno_compras_id_seq to anon, authenticated;
