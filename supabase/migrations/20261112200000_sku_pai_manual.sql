-- SKU pai: padrão = 5 primeiros dígitos do SKU; esta tabela guarda os ajustes manuais (ex.: pais de 4 dígitos), valendo para todo o app.
create table if not exists public.sku_pai_manual (
  sku            text primary key,                -- SKU filho normalizado (minúsculo, só letras e números)
  pai            text not null,                   -- SKU pai normalizado
  atualizado_em  timestamptz not null default now()
);
create index if not exists sku_pai_manual_pai_idx on public.sku_pai_manual (pai);

alter table public.sku_pai_manual enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sku_pai_manual' and policyname = 'Acesso total livre') then
    create policy "Acesso total livre" on public.sku_pai_manual for all to public using (true) with check (true);
  end if;
end $$;
