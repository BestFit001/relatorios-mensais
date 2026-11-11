-- Monitor de concorrentes, parte 2: marca, favoritos, faixa de vendas e "igual ao meu" (comparativo).

alter table public.anuncios add column if not exists marca text;
alter table public.anuncios add column if not exists favorito boolean not null default false;
-- true = o total de vendas é uma faixa ("+500 vendidos"), não o número exato
alter table public.anuncios add column if not exists ultimo_aproximado boolean not null default false;

create index if not exists anuncios_favorito_idx on public.anuncios (favorito) where favorito;

-- Textos antigos "MARCA por VENDEDOR" -> marca e vendedor separados (só onde a marca ainda está vazia)
update public.anuncios
   set marca = btrim((regexp_match(vendedor, '^(.+?)\s+por\s+(.+)$', 'i'))[1]),
       vendedor = btrim((regexp_match(vendedor, '^(.+?)\s+por\s+(.+)$', 'i'))[2])
 where marca is null and vendedor ~* '^.+?\s+por\s+.+$';

-- Faixa de vendas do último dia capturado (vem do histórico)
update public.anuncios a
   set ultimo_aproximado = h.vendas_aproximado
  from (select distinct on (anuncio_id) anuncio_id, vendas_aproximado
          from public.historico_diario order by anuncio_id, data_captura desc) h
 where h.anuncio_id = a.id and h.vendas_aproximado is not null;

-- Um anúncio de concorrente marcado como "igual a um anúncio meu"
create table if not exists public.comparativos (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  sku text not null,
  meu_url text,
  meu_mlb_id text,
  meu_titulo text,
  meu_preco numeric(14,2),
  meu_preco_em timestamptz,
  -- modalidade usada para estimar as tarifas de cada lado
  canal_meu text not null default 'Mercado Livre 1 Clássico',
  canal_concorrente text not null default 'Mercado Livre 1 Clássico',
  -- usado só quando o SKU não tem custo na tabela de custos
  custo_manual numeric(14,2),
  criado_em timestamptz not null default now(),
  unique (anuncio_id)
);

create index if not exists comparativos_meu_mlb_idx on public.comparativos (meu_mlb_id);

alter table public.comparativos enable row level security;
drop policy if exists comparativos_leitura on public.comparativos;
create policy comparativos_leitura on public.comparativos for select to anon, authenticated using (true);
-- gravações só pelo servidor (chave de serviço), como nas outras tabelas do monitor
