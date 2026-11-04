-- 1) Alertas de tarefa com o sistema FECHADO (Web Push): assinaturas dos navegadores + controle do que já foi enviado
create table if not exists public.push_assinaturas (
  id            bigserial primary key,
  email         text not null,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz default now(),
  atualizado_em timestamptz default now()
);
create index if not exists ix_push_assin_email on public.push_assinaturas (lower(email));

create table if not exists public.push_alertas_enviados (
  id          bigserial primary key,
  tarefa_id   bigint not null references public.home_tarefas(id) on delete cascade,
  email       text not null,
  referencia  text not null,
  enviado_em  timestamptz default now(),
  unique (tarefa_id, email, referencia)
);

-- 2) Análise de mercado
create table if not exists public.analise_concorrencia (
  id                bigserial primary key,
  data              date not null default current_date,
  canal             text not null,
  sku               text,
  nome              text,
  link              text,
  preco_concorrente numeric(12,2) not null,
  margem_desejada   numeric(6,2) not null,
  criado_por        text,
  created_at        timestamptz default now()
);
create index if not exists ix_analise_conc_data on public.analise_concorrencia (data desc);

create table if not exists public.analise_tendencias (
  id                bigserial primary key,
  nome              text not null,
  link              text,
  canal             text not null,
  preco_concorrente numeric(12,2) not null,
  margem_desejada   numeric(6,2) not null,
  custo_compra      numeric(12,2),
  criado_por        text,
  created_at        timestamptz default now()
);

grant select, insert, update, delete on public.push_assinaturas, public.push_alertas_enviados, public.analise_concorrencia, public.analise_tendencias to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- 3) Relógio do servidor: chama a rota de alertas a cada minuto (o agendamento em si é criado à parte, pois leva o segredo)
create extension if not exists pg_cron;
create extension if not exists pg_net;
