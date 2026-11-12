-- Lista de SKUs marcados "Para exclusão" (upload em Mapa de Cadastros > Configurações; filtro em SKUs por canal).
create table if not exists public.skus_para_exclusao (
  sku            text primary key,                -- SKU normalizado (minúsculo, só letras e números)
  atualizado_em  timestamptz not null default now()
);

alter table public.skus_para_exclusao enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'skus_para_exclusao' and policyname = 'Acesso total livre') then
    create policy "Acesso total livre" on public.skus_para_exclusao for all to public using (true) with check (true);
  end if;
end $$;
