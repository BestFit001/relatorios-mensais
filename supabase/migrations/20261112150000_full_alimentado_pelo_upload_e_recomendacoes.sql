-- Full alimentado pelo upload de vendas do Mercado Livre + aba Recomendações.
-- 1) full_config_canal: configuração do Full/fora do Full por canal guardada no banco (antes só no navegador), para o upload usar a mesma
--    configuração de qualquer computador. 2) parâmetros das recomendações na aba Regras (config_regras_canais). Idempotente.

create table if not exists public.full_config_canal (
  canal          text not null,
  modo           text not null,                    -- 'full' ou 'padrao' (fora do Full)
  config         jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  primary key (canal, modo)
);

alter table public.full_config_canal enable row level security;
drop policy if exists "Acesso total livre" on public.full_config_canal;
create policy "Acesso total livre" on public.full_config_canal for all to public using (true) with check (true);

alter table public.config_regras_canais
  add column if not exists rec_vendas_min        integer       default 5,     -- vendas mínimas do SKU no mês para recomendar
  add column if not exists rec_lucro_min         numeric(14,2) default 100,   -- lucro líquido total mínimo do SKU no mês (R$)
  add column if not exists rec_margem_min        numeric(8,2)  default 12,    -- margem líquida mínima (%)
  add column if not exists rec_dev_max           numeric(8,2)  default 5,     -- devolução máxima (%) para recomendar
  add column if not exists rec_dias_cobertura    integer       default 30,    -- dias de venda a cobrir na quantidade sugerida
  add column if not exists rec_exigir_estoque    boolean       default true,  -- só recomendar SKU com estoque na Sede
  add column if not exists rec_margem_rever      numeric(8,2)  default 5;     -- abaixo desta margem, SKU que já está no Full entra em "Rever no Full"

-- Vendas fora do Full guardam as devoluções e o diagnóstico (usados nas recomendações); já existem na tabela original, garantidos aqui
alter table public.vendas_padrao_lancamentos
  add column if not exists taxa_devolucao numeric(8,2) default 0,
  add column if not exists qtd_devolucoes integer default 0,
  add column if not exists diagnostico text,
  add column if not exists ritmo_vendas text;
