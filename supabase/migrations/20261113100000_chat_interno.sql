-- Chat interno em tempo real (sala Geral + conversas diretas). As mensagens duram 7 dias e depois são apagadas.
create table if not exists public.chat_mensagens (
  id          uuid primary key default gen_random_uuid(),
  sala        text not null,                       -- 'geral' ou 'dm:<email menor>|<email maior>'
  de_email    text not null,
  para_email  text,                                -- só nas conversas diretas
  texto       text not null check (char_length(texto) between 1 and 2000),
  criado_em   timestamptz not null default now()
);
create index if not exists chat_mensagens_sala_idx on public.chat_mensagens (sala, criado_em);
create index if not exists chat_mensagens_criado_idx on public.chat_mensagens (criado_em);

alter table public.chat_mensagens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_mensagens' and policyname = 'Acesso total livre') then
    create policy "Acesso total livre" on public.chat_mensagens for all to public using (true) with check (true);
  end if;
end $$;
grant select, insert, delete on public.chat_mensagens to anon, authenticated;

-- tempo real: avisa os navegadores a cada mensagem nova
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_mensagens') then
    alter publication supabase_realtime add table public.chat_mensagens;
  end if;
end $$;

-- limpeza: de hora em hora apaga o que passou de 7 dias (a tela também só mostra os últimos 7 dias)
create extension if not exists pg_cron;
select cron.schedule('chat-limpeza-7-dias', '17 * * * *', $$delete from public.chat_mensagens where criado_em < now() - interval '7 days'$$);
