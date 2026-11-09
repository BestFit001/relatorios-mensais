-- Rebate dos pedidos (subsídio do TikTok): somado ao repasse, não é descontado do vendedor.
alter table public.vendas_lives_separadas add column if not exists rebate numeric default 0;
