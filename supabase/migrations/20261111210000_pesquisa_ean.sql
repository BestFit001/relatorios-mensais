-- Pesquisa de preços: EAN (código de barras) do produto; o Google Shopping acha o mesmo produto pelo EAN.
alter table public.pesquisas_imagem add column if not exists ean text;
