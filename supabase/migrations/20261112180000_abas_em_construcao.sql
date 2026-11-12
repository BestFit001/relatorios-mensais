-- Aviso "Aba em construção, deseja continuar?" por página. O admin liga/desliga em Painel Admin > Configurações.
create table if not exists public.abas_em_construcao (
  rota           text primary key,               -- caminho da aba (ex.: /checagem-cancelados)
  ativo          boolean not null default true,
  atualizado_em  timestamptz not null default now()
);

alter table public.abas_em_construcao enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'abas_em_construcao' and policyname = 'Acesso total livre') then
    create policy "Acesso total livre" on public.abas_em_construcao for all to public using (true) with check (true);
  end if;
end $$;

-- Abas que já nascem com o aviso
insert into public.abas_em_construcao (rota, ativo) values
  ('/apresentacao-time', true), ('/checagem-cancelados', true), ('/marketing/ajustes', true), ('/concorrentes', true)
on conflict (rota) do nothing;
