-- Monitor de concorrentes: categorias de marketplaces, anúncios raspados e histórico diário de preço/vendas.
-- Escrita só pelo servidor (rotas /api/concorrentes/* e o cron, com a chave service_role, que ignora RLS).
-- O navegador (chave anon) só LÊ.

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  canal text not null default 'mercadolivre',          -- mercadolivre | shopee | amazon ...
  url_origem text not null,
  ativo boolean not null default true,
  ultima_raspagem timestamptz,
  criado_em timestamptz not null default now(),
  constraint categorias_url_canal_uk unique (canal, url_origem)
);

create table if not exists public.anuncios (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  mlb_id text not null,                                 -- id do anúncio no marketplace (ex.: MLB123456789)
  titulo text not null,
  vendedor text,
  url_anuncio text not null,
  url_imagem text,                                      -- só o link; a imagem não é armazenada
  ativo boolean not null default true,
  manual boolean not null default false,                -- true = adicionado pelo painel (anúncio avulso)
  -- último valor capturado (evita ler o histórico inteiro para montar a tabela)
  ultimo_preco numeric(14,2),
  ultimo_total_vendas integer,
  ultimas_vendas_dia integer,
  ultima_captura date,
  criado_em timestamptz not null default now(),
  constraint anuncios_categoria_mlb_uk unique (categoria_id, mlb_id)
);
create index if not exists anuncios_categoria_ativo_idx on public.anuncios (categoria_id, ativo);

create table if not exists public.historico_diario (
  id bigint generated always as identity primary key,
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  data_captura date not null,                           -- dia (fuso de São Paulo) a que a captura se refere
  preco numeric(14,2),                                  -- preço de venda (PDV)
  total_vendas_acumulado integer,
  vendas_no_dia integer,                                -- hoje - ontem (null na 1ª captura; nunca negativo)
  vendas_aproximado boolean not null default false,     -- true quando o marketplace só informa faixa ("+500 vendidos")
  capturado_em timestamptz not null default now(),
  constraint historico_anuncio_dia_uk unique (anuncio_id, data_captura)
);
create index if not exists historico_data_idx on public.historico_diario (data_captura);

alter table public.categorias enable row level security;
alter table public.anuncios enable row level security;
alter table public.historico_diario enable row level security;

drop policy if exists categorias_leitura on public.categorias;
drop policy if exists anuncios_leitura on public.anuncios;
drop policy if exists historico_leitura on public.historico_diario;
create policy categorias_leitura on public.categorias for select to anon, authenticated using (true);
create policy anuncios_leitura on public.anuncios for select to anon, authenticated using (true);
create policy historico_leitura on public.historico_diario for select to anon, authenticated using (true);
