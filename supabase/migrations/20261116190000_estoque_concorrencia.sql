-- Acompanhamento de estoque da concorrência: links de anúncios que o time quer vigiar; o painel lê o estoque todo dia
-- e avisa "acabou na concorrência". Escrita só pelo servidor (rotas /api/estoque-concorrencia/* e o cron, com a chave service_role);
-- o navegador (chave anon) só LÊ. Idempotente.

create table if not exists public.estoque_monitorados (
  id uuid primary key default gen_random_uuid(),
  canal text not null default 'mercadolivre',
  item_id text not null,                      -- id do anúncio no marketplace (ex.: MLB4959679393)
  url text not null,                          -- link guardado (mantém ?pdp_filters=item_id:... nas páginas de catálogo "up")
  titulo text,
  vendedor text,
  url_imagem text,
  ativo boolean not null default true,
  status text not null default 'desconhecido',  -- em_estoque | esgotado | desconhecido (ainda não lido ou sem sinal claro)
  estoque integer,                            -- quantidade, quando o anúncio mostra
  estoque_aproximado boolean not null default false,   -- true = "+50 disponíveis" (faixa)
  detalhe text,                               -- como a leitura chegou a esse resultado (para conferir)
  erro text,                                  -- motivo da última leitura que falhou (bloqueio, sem rede...)
  lido_em timestamptz,                        -- última leitura que funcionou
  ultima_captura date,                        -- dia (SP) dessa leitura
  esgotou_em timestamptz,                     -- quando o painel viu o anúncio acabar (null enquanto há estoque)
  voltou_em timestamptz,                      -- quando voltou a ter estoque depois de acabar
  aviso_visto_em timestamptz,                 -- quando alguém marcou o aviso "acabou" como visto
  criado_em timestamptz not null default now(),
  criado_por text,
  constraint estoque_monitorados_canal_item_uk unique (canal, item_id)
);
create index if not exists estoque_monitorados_status_idx on public.estoque_monitorados (canal, ativo, status);

create table if not exists public.estoque_historico (
  id bigint generated always as identity primary key,
  monitorado_id uuid not null references public.estoque_monitorados(id) on delete cascade,
  data_captura date not null,                 -- dia (SP) da leitura; a última do dia vale
  status text not null,
  estoque integer,
  capturado_em timestamptz not null default now(),
  constraint estoque_historico_dia_uk unique (monitorado_id, data_captura)
);
create index if not exists estoque_historico_data_idx on public.estoque_historico (data_captura);

alter table public.estoque_monitorados enable row level security;
alter table public.estoque_historico enable row level security;
drop policy if exists estoque_monitorados_leitura on public.estoque_monitorados;
drop policy if exists estoque_historico_leitura on public.estoque_historico;
create policy estoque_monitorados_leitura on public.estoque_monitorados for select to anon, authenticated using (true);
create policy estoque_historico_leitura on public.estoque_historico for select to anon, authenticated using (true);
