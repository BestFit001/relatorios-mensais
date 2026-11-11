-- Monitor de concorrentes: Shopee/Amazon (mesma tabela de anúncios) e Pesquisa por imagem (resultados lidos do Google).

-- Amazon mostra "N compras no mês passado" (vendas dos últimos 30 dias, não o total acumulado)
alter table public.anuncios add column if not exists ultimo_vendas_mes integer;

-- Uma pesquisa = um produto meu (SKU + meu PDV) e a lista de ofertas encontradas na concorrência
create table if not exists public.pesquisas_imagem (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  meu_pdv numeric(14,2),
  termo text,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);

create table if not exists public.pesquisa_resultados (
  id bigint generated always as identity primary key,
  pesquisa_id uuid not null references public.pesquisas_imagem(id) on delete cascade,
  chave text not null,           -- loja + título normalizado: ler o Google de novo atualiza a oferta em vez de duplicar
  titulo text not null,
  loja text,
  host text,
  canal text,                    -- canal MEU compatível (nome usado na Análise de mercado) ou null
  preco numeric(14,2),
  url text,
  url_imagem text,
  capturado_em timestamptz not null default now(),
  unique (pesquisa_id, chave)
);
create index if not exists pesquisa_resultados_pesquisa_idx on public.pesquisa_resultados (pesquisa_id);

alter table public.pesquisas_imagem enable row level security;
alter table public.pesquisa_resultados enable row level security;
drop policy if exists pesquisas_imagem_leitura on public.pesquisas_imagem;
drop policy if exists pesquisa_resultados_leitura on public.pesquisa_resultados;
create policy pesquisas_imagem_leitura on public.pesquisas_imagem for select to anon, authenticated using (true);
create policy pesquisa_resultados_leitura on public.pesquisa_resultados for select to anon, authenticated using (true);
-- gravações só pelo servidor (chave de serviço)
