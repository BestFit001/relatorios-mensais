-- Medidas informadas no cadastro manual / planilha de pendentes (usadas na exportação para o Tiny)
alter table public.produtos_pendentes
  add column if not exists altura numeric,
  add column if not exists largura numeric,
  add column if not exists comprimento numeric;

alter table public.produtos_novos_cadastrados
  add column if not exists altura numeric,
  add column if not exists largura numeric,
  add column if not exists comprimento numeric;
