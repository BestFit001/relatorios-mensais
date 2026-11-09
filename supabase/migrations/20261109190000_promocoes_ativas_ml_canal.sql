-- Promoções ativas do Mercado Livre passam a ser separadas por conta (Mercado Livre 1, 2, 3).
alter table public.promocoes_ativas_ml add column if not exists canal text;
update public.promocoes_ativas_ml p
   set canal = r.canal
  from public.ml_anuncios_regras r
 where p.canal is null and upper(trim(r.mlb)) = upper(trim(p.mlb));
