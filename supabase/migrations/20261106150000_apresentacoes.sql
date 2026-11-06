-- Ferramentas > Apresentação Time: apresentações (slides) criadas, editadas ou importadas (PDF/PPTX) no app.
create table if not exists public.apresentacoes (
  id         bigint generated always as identity primary key,
  titulo     text not null default 'Nova apresentação',
  slides     jsonb not null default '[]'::jsonb,   -- lista de slides (layout, título, blocos, imagens)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant select, insert, update, delete on public.apresentacoes to anon, authenticated;
