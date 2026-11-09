-- Guarda a data E HORA originais da venda da live (antes só ficava a data), para a análise de desempenho por horário.
alter table public.vendas_lives_separadas add column if not exists data_hora text;
