-- Agenda: senha de acesso (pedida 1x a cada 30 dias) e vínculo agenda <-> e-mail de quem a usa.
create table if not exists public.agenda_acessos (
  email         text primary key,                 -- e-mail do usuário logado (minúsculo)
  senha_hash    text not null,                    -- SHA-256(salt + senha)
  salt          text not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.agenda_donos (
  chave text primary key,                         -- eduardo | juliana | felipe
  nome  text not null,
  email text                                      -- e-mail que enxerga esta agenda (a Gisele enxerga todas)
);

insert into public.agenda_donos (chave, nome, email) values
  ('eduardo', 'Eduardo', null),
  ('juliana', 'Juliana', 'juliana.silva@usebestfit.com.br'),
  ('felipe',  'Felipe',  'felipe.camargo@usebestfit.com.br')
on conflict (chave) do nothing;

alter table public.agenda_acessos enable row level security;
alter table public.agenda_donos   enable row level security;
do $$ declare t text; begin
  foreach t in array array['agenda_acessos','agenda_donos'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'Acesso total livre') then
      execute format('create policy "Acesso total livre" on public.%I for all to public using (true) with check (true)', t);
    end if;
  end loop;
end $$;
