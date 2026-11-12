-- Monitoramento prioritário (anúncios que o usuário quer acompanhar de perto) + conserto de links guardados.
-- Idempotente.

alter table public.anuncios add column if not exists prioritario boolean not null default false;
create index if not exists anuncios_prioritario_idx on public.anuncios (prioritario) where prioritario;

-- Links de rastreio (click1.mercadolivre.com.br/mclics/...) perderam o id quando a query foi cortada: o link guardado só redirecionava.
-- O id do anúncio (mlb_id) está certo; o link canônico é construído a partir dele.
update public.anuncios
   set url_anuncio = 'https://produto.mercadolivre.com.br/MLB-' || substring(mlb_id from 4)
 where url_anuncio like 'https://click%.mercadolivre.com.br/%'
   and mlb_id ~ '^MLB[0-9]+$';

-- Páginas de catálogo guardadas sem o anúncio escolhido (o "wid" vinha depois do "#" e era descartado): o preço lido ficava do produto, não da oferta.
update public.anuncios
   set url_anuncio = url_anuncio || '?wid=' || mlb_id
 where url_anuncio like 'https://www.mercadolivre.com.br/%'
   and url_anuncio not like '%?%'
   and position(mlb_id in url_anuncio) = 0;
