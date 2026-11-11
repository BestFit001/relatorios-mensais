-- Vídeos > "Com problemas": o produto sai da aba Vídeos e vira uma CORREÇÃO na tela inicial dos analistas dos canais
-- que ainda não estavam marcados. Quando todos os canais da correção são marcados como feitos, o produto volta para Vídeos.
-- Idempotente. O app usa a chave anon (como nas demais tabelas da tela inicial).

create table if not exists public.video_correcoes (
  id            bigserial primary key,
  sku_pai       text not null,
  produto       text,
  origem        text,                                   -- 'realizado' (cadastrado) | 'manual' (incluído em Vídeos)
  status        text not null default 'aberta',         -- 'aberta' | 'concluida'
  criado_por    text,
  criado_em     timestamptz not null default now(),
  concluido_em  timestamptz
);
create index if not exists ix_video_correcoes_pai on public.video_correcoes (sku_pai, status);

-- Um canal por linha: quem é responsável pelo canal (home_responsaveis_canais) marca como feito
create table if not exists public.video_correcoes_canais (
  id            bigserial primary key,
  correcao_id   bigint not null references public.video_correcoes(id) on delete cascade,
  canal         text not null,
  feito         boolean not null default false,
  feito_por     text,
  feito_em      timestamptz,
  unique (correcao_id, canal)
);
create index if not exists ix_video_correcoes_canais_corr on public.video_correcoes_canais (correcao_id);

grant select, insert, update, delete on public.video_correcoes, public.video_correcoes_canais to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
