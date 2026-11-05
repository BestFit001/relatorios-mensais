-- Retorno de compras passa a valer por mês (AAAA-MM): em um mês novo todos os SKUs voltam sem retorno,
-- e ao filtrar um mês antigo reaparece o que foi escolhido naquele mês.
alter table public.curva_retorno_compras add column if not exists mes text;
update public.curva_retorno_compras set mes = to_char(coalesce(atualizado_em, now()) at time zone 'America/Sao_Paulo', 'YYYY-MM') where mes is null;
alter table public.curva_retorno_compras alter column mes set not null;
alter table public.curva_retorno_compras add constraint curva_retorno_compras_mes_formato check (mes ~ '^\d{4}-\d{2}$');
alter table public.curva_retorno_compras drop constraint if exists curva_retorno_compras_sku_key;
alter table public.curva_retorno_compras add constraint curva_retorno_compras_mes_sku_key unique (mes, sku);
