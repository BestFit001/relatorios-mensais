-- Ferramentas > Checagem de Cancelados (aba provisória): pedidos cujo status, nas planilhas dos canais, contém as palavras procuradas.
create table if not exists public.checagem_cancelados (
  id              bigint generated always as identity primary key,
  canal           text not null,
  id_pedido       text not null,
  status_planilha text,                 -- status como veio na planilha (ex.: "Pedido cancelado em 15/09")
  rotulo          text not null,        -- escrita registrada (Configurações), ex.: "cancelado"
  termo           text,                 -- palavras procuradas no upload
  arquivo         text,
  created_at      timestamptz default now(),
  unique (canal, id_pedido)
);

create table if not exists public.checagem_cancelados_config (
  chave text primary key,
  valor text not null
);
insert into public.checagem_cancelados_config (chave, valor) values ('rotulo', 'cancelado') on conflict (chave) do nothing;

grant select, insert, update, delete on public.checagem_cancelados, public.checagem_cancelados_config to anon, authenticated;
