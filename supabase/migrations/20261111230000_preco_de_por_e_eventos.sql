-- Monitor de concorrentes: preço "De" (riscado) x "Por" (atual) e registro de TODA mudança de preço, inclusive no mesmo dia.
-- `ultimo_preco` continua sendo o preço "Por" (o que o cliente paga): é ele que vale nas análises.
-- Idempotente.

alter table public.anuncios add column if not exists ultimo_preco_original numeric(14,2);   -- "De" (riscado); null = sem promoção
alter table public.anuncios add column if not exists preco_anterior numeric(14,2);           -- preço "Por" antes da última mudança
alter table public.anuncios add column if not exists preco_mudou_em timestamptz;             -- quando a última mudança foi vista
alter table public.anuncios add column if not exists lido_em timestamptz;                    -- instante da última leitura (releitura no mesmo dia)
alter table public.historico_diario add column if not exists preco_original numeric(14,2);

-- Uma linha por mudança de preço vista (e uma de partida por anúncio): permite várias no mesmo dia, com a hora.
create table if not exists public.precos_eventos (
  id             bigint generated always as identity primary key,
  anuncio_id     uuid not null references public.anuncios(id) on delete cascade,
  registrado_em  timestamptz not null default now(),   -- instante em que o painel LEU o preço novo (não o da mudança na loja)
  preco          numeric(14,2) not null,               -- "Por" depois da mudança
  preco_anterior numeric(14,2),                        -- "Por" antes (null = primeira leitura do anúncio)
  preco_original numeric(14,2)                         -- "De" no momento da leitura
);
create index if not exists precos_eventos_anuncio_idx on public.precos_eventos (anuncio_id, registrado_em desc);
create index if not exists precos_eventos_data_idx on public.precos_eventos (registrado_em desc);

-- escrita só pelo servidor (service_role ignora RLS); o navegador só lê
alter table public.precos_eventos enable row level security;
drop policy if exists precos_eventos_leitura on public.precos_eventos;
create policy precos_eventos_leitura on public.precos_eventos for select to anon, authenticated using (true);
