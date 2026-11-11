-- Monitor de concorrentes: posição no ranking "Mais vendidos" (tag "3º MAIS VENDIDO") e a posição da leitura anterior.
alter table public.anuncios add column if not exists ranking_posicao integer;        -- posição na última leitura (null = fora do ranking)
alter table public.anuncios add column if not exists ranking_anterior integer;       -- posição na leitura anterior
alter table public.anuncios add column if not exists ranking_data date;              -- dia da última leitura
alter table public.anuncios add column if not exists ranking_data_anterior date;     -- dia da leitura anterior
create index if not exists anuncios_ranking_idx on public.anuncios (categoria_id, ranking_posicao) where ranking_posicao is not null;
