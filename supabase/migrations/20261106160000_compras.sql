-- Compras: controle de estoque/vendas por grade e filial (substitui a planilha "0 - Estoque Geral" + "Venda Geral").
--   compras_produtos : cadastro por grade (marca, classe, família, custo, preços). Atualizado a cada upload do estoque Shop9.
--   compras_estoque  : saldo atual por grade+filial. Sempre substituído (sem histórico). "lote" separa o envio novo do antigo.
--   compras_vendas   : vendas por grade+filial+mês (periodo = AAAAMM). Mês reenviado substitui o anterior da mesma fonte.
--   compras_uploads  : registro de cada envio (para mostrar "última atualização").
--   compras_config   : ajustes simples (nomes das filiais, etc.).
create table if not exists public.compras_produtos (
  id          bigint generated always as identity primary key,
  grade       text not null unique,
  codigo      text default '',
  produto     text default '',
  cod_cor     text default '',
  cor         text default '',
  cod_tamanho text default '',
  tamanho     text default '',
  genero      text default '',
  marca       text default '',
  ean         text default '',
  classe      text default '',
  familia     text default '',
  fornecedor  text default '',
  custo       numeric,
  pdv_loja    numeric,
  pdv_ec      numeric,
  origem      text default 'shop9',
  atualizado_em timestamptz default now()
);

create table if not exists public.compras_estoque (
  id        bigint generated always as identity primary key,
  grade     text not null,
  filial    int  not null,
  estoque   numeric not null default 0,
  reservado numeric not null default 0,
  lote      bigint not null,
  created_at timestamptz default now()
);
create index if not exists compras_estoque_filial_idx on public.compras_estoque (filial);
create index if not exists compras_estoque_lote_idx   on public.compras_estoque (lote);

create table if not exists public.compras_vendas (
  id      bigint generated always as identity primary key,
  grade   text not null,
  filial  int  not null,
  periodo int  not null,                 -- AAAAMM
  fonte   text not null,                 -- 'shop9' | 'tiny'
  canal   text not null default '',
  qtd     numeric not null default 0,
  valor   numeric not null default 0,
  lote    bigint not null,
  created_at timestamptz default now()
);
create index if not exists compras_vendas_periodo_idx on public.compras_vendas (periodo, fonte);
create index if not exists compras_vendas_lote_idx    on public.compras_vendas (lote);

create table if not exists public.compras_uploads (
  id       bigint generated always as identity primary key,
  tipo     text not null,                -- estoque_shop9 | vendas_shop9 | estoque_tiny_8 | estoque_tiny_10 | vendas_tiny
  periodo  int,
  arquivo  text,
  linhas   int default 0,
  unidades numeric default 0,
  valor    numeric default 0,
  lote     bigint,
  created_at timestamptz default now()
);

create table if not exists public.compras_config (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

grant select, insert, update, delete on public.compras_produtos, public.compras_estoque, public.compras_vendas, public.compras_uploads, public.compras_config to anon, authenticated;
