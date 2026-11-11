-- A busca de fotos deixou de usar o Google Cloud Vision (exigia cobrança): o contador de buscas não é mais necessário.
drop table if exists public.fotos_buscas;
