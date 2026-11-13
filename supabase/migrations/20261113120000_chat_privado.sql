-- Chat interno PRIVADO: salas (geral, conversas diretas e grupos), membros, mensagens com anexos e senha própria do chat.
-- Todas as tabelas ficam FECHADAS para o navegador (RLS ligado e nenhuma política): só a API do servidor (chave de serviço) lê e grava,
-- depois de conferir quem é a pessoa e se ela participa da conversa. Mensagens duram 7 dias.

-- versão anterior (aberta, sem salas) é substituída
select cron.unschedule(jobid) from cron.job where jobname = 'chat-limpeza-7-dias';
drop table if exists public.chat_mensagens cascade;

create table if not exists public.chat_salas (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('geral', 'dm', 'grupo')),
  nome          text,
  dm_chave      text unique,                        -- conversa direta: 'email menor|email maior'
  criado_por    text,
  criado_em     timestamptz not null default now(),
  ultima_msg_em timestamptz not null default now()
);

create table if not exists public.chat_membros (
  sala_id   uuid not null references public.chat_salas(id) on delete cascade,
  email     text not null,
  papel     text not null default 'membro' check (papel in ('admin', 'membro')),
  entrou_em timestamptz not null default now(),
  lido_ate  timestamptz not null default now(),
  primary key (sala_id, email)
);
create index if not exists chat_membros_email_idx on public.chat_membros (email);

create table if not exists public.chat_mensagens (
  id          uuid primary key default gen_random_uuid(),
  sala_id     uuid not null references public.chat_salas(id) on delete cascade,
  de_email    text not null,
  tipo        text not null default 'texto' check (tipo in ('texto', 'imagem', 'tarefa', 'notificacao', 'produto')),
  texto       text check (texto is null or char_length(texto) <= 2000),
  anexo_path  text,                                  -- imagem no bucket privado chat-anexos
  payload     jsonb,                                 -- cartão de tarefa / notificação / produto
  criado_em   timestamptz not null default now(),
  check (texto is not null or anexo_path is not null or payload is not null)
);
create index if not exists chat_mensagens_sala_idx on public.chat_mensagens (sala_id, criado_em);
create index if not exists chat_mensagens_criado_idx on public.chat_mensagens (criado_em);

-- senha do chat (guardada só como hash, com bloqueio depois de erros seguidos)
create table if not exists public.chat_usuarios (
  email          text primary key,
  pin_hash       text not null,
  pin_salt       text not null,
  tentativas     integer not null default 0,
  bloqueado_ate  timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

alter table public.chat_salas     enable row level security;
alter table public.chat_membros   enable row level security;
alter table public.chat_mensagens enable row level security;
alter table public.chat_usuarios  enable row level security;
revoke all on public.chat_salas, public.chat_membros, public.chat_mensagens, public.chat_usuarios from anon, authenticated;

-- sala Geral (fixa)
insert into public.chat_salas (id, tipo, nome) values ('00000000-0000-4000-8000-000000000001', 'geral', 'Geral') on conflict (id) do nothing;

-- anexos (imagens): bucket PRIVADO, acessado por links temporários gerados pelo servidor
insert into storage.buckets (id, name, public) values ('chat-anexos', 'chat-anexos', false) on conflict (id) do nothing;

-- limpeza: mensagens de texto/cartão com mais de 7 dias saem de hora em hora; as com imagem são apagadas pela API (que remove o arquivo junto)
select cron.schedule('chat-limpeza-7-dias', '17 * * * *', $$delete from public.chat_mensagens where criado_em < now() - interval '7 days' and anexo_path is null$$);
