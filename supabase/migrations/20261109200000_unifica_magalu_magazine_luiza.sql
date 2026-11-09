-- Magalu e Magazine Luiza são o mesmo canal: o nome oficial é "Magalu".

-- Mapa de cadastros: o que estava marcado como presente em "Magazine Luiza" passa para "Magalu"; depois some a duplicada
update public.mapeamento_canais_skus m
   set presente = true
  from public.mapeamento_canais_skus z
 where m.canal = 'Magalu' and z.canal = 'Magazine Luiza' and z.presente and z.sku = m.sku;
insert into public.mapeamento_canais_skus (canal, sku, presente)
select 'Magalu', z.sku, z.presente from public.mapeamento_canais_skus z
 where z.canal = 'Magazine Luiza'
   and not exists (select 1 from public.mapeamento_canais_skus m where m.canal = 'Magalu' and m.sku = z.sku);
delete from public.mapeamento_canais_skus where canal = 'Magazine Luiza';

-- Linha vazia da lista de canais (as regras reais estão em "Magalu") e configuração duplicada do PLP
delete from public.config_regras_canais
 where canal = 'Magazine Luiza' and formula_excel is null and col_id_pedido is null and col_sku is null and col_pdv is null;
delete from public.plp_config_canais where canal = 'Magazine Luiza';

-- Registros que já usavam o nome antigo
update public.plp_pedidos set canal = 'Magalu' where canal = 'Magazine Luiza';
update public.devolucoes set canal = 'Magalu' where canal = 'Magazine Luiza';
update public.checagem_cancelados c set canal = 'Magalu'
 where c.canal = 'Magazine Luiza'
   and not exists (select 1 from public.checagem_cancelados x where x.canal = 'Magalu' and x.id_pedido = c.id_pedido);
delete from public.checagem_cancelados where canal = 'Magazine Luiza';
