-- Lives: guarda o valor pago pelo cliente e as colunas extras que a fórmula do canal usa (ex.: U2 da regra do TikTok).
-- O repasse passa a ser calculado pela fórmula de taxas e tarifas da aba Regras, em vez de ser lido direto da planilha.
alter table public.vendas_lives_separadas
  add column if not exists valor_pago numeric,
  add column if not exists variaveis jsonb;
