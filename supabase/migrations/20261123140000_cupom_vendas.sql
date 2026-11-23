-- Cupom / benefício da plataforma (TikTok, Shopee): valor que a plataforma paga por cima do preço de venda.
-- Entra na margem bruta do Painel Executivo (como o "benefício plat." da planilha Dash antiga).
alter table public.vendas_canais add column if not exists cupom numeric default 0;
alter table public.config_regras_canais add column if not exists col_cupom text;

-- No TikTok o cupom é a coluna P da planilha de vendas (a fórmula do repasse usa R2 + P2).
update public.config_regras_canais set col_cupom = 'P'
 where canal ilike '%tiktok%' and (col_cupom is null or col_cupom = '');
