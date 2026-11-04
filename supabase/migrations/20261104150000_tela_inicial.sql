-- Tela inicial: canais por analista + tarefas definidas pelo administrador.
-- Idempotente. Execute no SQL Editor do Supabase.

-- 1) Quais canais cada analista acompanha (configurado pelo administrador na própria tela inicial)
create table if not exists public.home_responsaveis_canais (
  id          bigserial primary key,
  email       text not null,
  canal       text not null,
  created_at  timestamptz default now(),
  unique (email, canal)
);
create index if not exists ix_home_resp_email on public.home_responsaveis_canais (lower(email));

-- 2) Tarefas do administrador (uma linha por analista; "todos os analistas" gera uma linha para cada um)
create table if not exists public.home_tarefas (
  id                bigserial primary key,
  created_at        timestamptz default now(),
  titulo            text not null,
  descricao         text default '',
  prioridade        text default 'Média',
  data_entrega      date,
  responsavel_email text not null,
  criado_por        text,
  concluida         boolean default false,
  concluida_em      timestamptz,
  concluida_por     text,
  grupo_id          uuid
);
create index if not exists ix_home_tarefas_resp on public.home_tarefas (lower(responsavel_email), concluida);

-- 3) Permissões (o app usa a chave anon, como nas demais tabelas)
grant select, insert, update, delete on public.home_responsaveis_canais, public.home_tarefas to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
