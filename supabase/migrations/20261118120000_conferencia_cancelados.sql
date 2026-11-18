-- Checagem de Cancelados > Conferência: cancelados e notas (NF-e) de meses antigos, guardados à parte, só para conferência.
-- NÃO entram em faturados (não mexem em dashboards, rankings nem totais): é uma base separada e descartável.
create table if not exists public.conferencia_cancelados (
  id              bigint generated always as identity primary key,
  canal           text not null,
  id_pedido       text not null,
  chave           text not null,        -- id do pedido sem símbolos, maiúsculo (mesma chave usada para cruzar com as notas)
  status_planilha text,
  termo           text,
  arquivo         text,
  created_at      timestamptz default now(),
  unique (canal, chave)
);

create table if not exists public.conferencia_notas (
  id           bigint generated always as identity primary key,
  chave        text not null unique,
  id_pedido    text not null,
  nf_e         text,
  comprador    text,
  valor_pedido numeric,
  periodo      text,                    -- rótulo livre do período da planilha (ex.: "Ago/2026")
  arquivo      text,
  created_at   timestamptz default now()
);
create index if not exists conferencia_notas_periodo_idx on public.conferencia_notas (periodo);

grant select, insert, update, delete on public.conferencia_cancelados, public.conferencia_notas to anon, authenticated;
