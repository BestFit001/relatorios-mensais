-- Validade (duração) das promoções do Mercado Livre: uma linha por anúncio x promoção (um MLB pode ter várias).
create table if not exists public.promocoes_validade_ml (
  id bigserial primary key,
  conta text not null,                       -- "Mercado Livre 1", "Mercado Livre 2"...
  mlb text not null,
  sku text,
  promocao text not null default '',
  data_inicio date,
  data_fim date not null,
  validade_texto text,                       -- como veio na planilha
  arquivo text,
  created_at timestamptz not null default now(),
  unique (conta, mlb, promocao, data_fim)
);
create index if not exists promocoes_validade_ml_mlb_idx on public.promocoes_validade_ml (mlb);
create index if not exists promocoes_validade_ml_fim_idx on public.promocoes_validade_ml (data_fim);

-- Anúncios que o usuário colocou em promoção fora da planilha ("já promovi"): saem da lista de itens fora de promoção.
create table if not exists public.promocoes_ml_marcados (
  id bigserial primary key,
  mlb text not null unique,
  conta text,
  marcado_em timestamptz not null default now(),
  marcado_por text
);

-- Configuração de colunas do inventário do Tiny é única para as contas do Mercado Livre (ML1, ML2 e ML3).
update public.config_regras_tiny set campo = 'promo_tiny_sku_ml' where campo = 'promo_tiny_sku_ml2'
  and not exists (select 1 from public.config_regras_tiny where campo = 'promo_tiny_sku_ml');
update public.config_regras_tiny set campo = 'promo_tiny_estoque_ml' where campo = 'promo_tiny_estoque_ml2'
  and not exists (select 1 from public.config_regras_tiny where campo = 'promo_tiny_estoque_ml');
delete from public.config_regras_tiny where campo in ('promo_tiny_sku_ml1','promo_tiny_estoque_ml1','promo_tiny_sku_ml3','promo_tiny_estoque_ml3','promo_tiny_sku_ml2','promo_tiny_estoque_ml2');
