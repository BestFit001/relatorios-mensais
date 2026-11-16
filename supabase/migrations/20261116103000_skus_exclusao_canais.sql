-- Em "Mapa de Cadastros > SKUs para exclusão": registra em quais canais o SKU marcado "Para exclusão" já foi excluído.
create table if not exists public.skus_exclusao_canais (
  sku         text        not null,                 -- SKU normalizado (mesmo formato de skus_para_exclusao)
  canal       text        not null,
  excluido_em timestamptz not null default now(),
  primary key (sku, canal)
);

alter table public.skus_exclusao_canais enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'skus_exclusao_canais' and policyname = 'Acesso total livre') then
    create policy "Acesso total livre" on public.skus_exclusao_canais for all to public using (true) with check (true);
  end if;
end $$;
