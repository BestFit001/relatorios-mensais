-- Registro (com data) de cada cadastro marcado como feito em um canal, para o Ranking contar "cadastros feitos no período".
-- Alimentado ao marcar na aba "Novos produtos > Canais" (origem 'novos') ou em "Mapa de Cadastros > SKUs por canal" (origem 'mapa').
-- Desmarcar em Novos produtos apaga o registro. Não é retroativo: só conta o que for marcado a partir de agora.
create table if not exists public.cadastros_feitos (
  sku      text        not null,                 -- SKU normalizado (minúsculo, só letras e números)
  canal    text        not null,
  feito_em timestamptz not null default now(),
  origem   text        not null default 'mapa',
  por      text,
  primary key (sku, canal)
);
create index if not exists cadastros_feitos_data_idx on public.cadastros_feitos (feito_em);

alter table public.cadastros_feitos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cadastros_feitos' and policyname = 'Acesso total livre') then
    create policy "Acesso total livre" on public.cadastros_feitos for all to public using (true) with check (true);
  end if;
end $$;
