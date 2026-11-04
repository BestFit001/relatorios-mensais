-- Tarefas da tela inicial v2: uma tarefa com VÁRIOS responsáveis (cada um com o seu status),
-- prazo com data/hora OU tarefa cíclica (diária/semanal), alerta antes do vencimento e anexos.
-- Idempotente e NÃO destrutivo: as linhas antigas (uma por analista) continuam no banco; apenas as repetidas
-- ficam marcadas como `legado` e deixam de aparecer na tela nova.

-- 1) Novas colunas na tarefa
alter table public.home_tarefas
  add column if not exists tipo             text default 'prazo',      -- 'prazo' | 'ciclica'
  add column if not exists ciclo            text,                      -- 'diaria' | 'semanal' (quando tipo = 'ciclica')
  add column if not exists ciclo_dia_semana smallint default 1,        -- 0=domingo ... 6=sábado (dia em que a semanal renova; padrão segunda)
  add column if not exists hora_entrega     time,                      -- horário limite (opcional)
  add column if not exists aviso_minutos    integer,                   -- avisar X minutos antes do vencimento (opcional)
  add column if not exists responsaveis     text[] default '{}',       -- e-mails em minúsculas
  add column if not exists legado           boolean default false;
alter table public.home_tarefas alter column responsavel_email drop not null;

-- 2) Status de cada responsável por ciclo (tarefa de prazo usa o ciclo fixo 2000-01-01; cíclica usa o início do ciclo)
create table if not exists public.home_tarefas_conclusoes (
  id            bigserial primary key,
  tarefa_id     bigint not null references public.home_tarefas(id) on delete cascade,
  email         text not null,
  ciclo         date not null default date '2000-01-01',
  concluida_em  timestamptz default now(),
  concluida_por text,
  unique (tarefa_id, email, ciclo)
);
create index if not exists ix_home_concl_tarefa on public.home_tarefas_conclusoes (tarefa_id);

-- 3) Arquivos anexados (planilhas, txt, etc.). Os arquivos ficam no bucket "anexos", pasta "tarefas/"
create table if not exists public.home_tarefas_anexos (
  id           bigserial primary key,
  tarefa_id    bigint not null references public.home_tarefas(id) on delete cascade,
  nome         text not null,
  caminho      text not null,
  tamanho      bigint,
  mime         text,
  enviado_por  text,
  created_at   timestamptz default now()
);
create index if not exists ix_home_anexos_tarefa on public.home_tarefas_anexos (tarefa_id);

-- 4) Consolida as tarefas antigas (uma linha por analista, ligadas por grupo_id) em UMA tarefa com vários responsáveis
do $$
begin
  create temp table _leg on commit drop as
    select id, coalesce(grupo_id::text, id::text) as k, lower(responsavel_email) as em,
           coalesce(concluida, false) as concluida, concluida_em, concluida_por
    from public.home_tarefas
    where coalesce(array_length(responsaveis, 1), 0) = 0 and responsavel_email is not null and coalesce(legado, false) = false;

  create temp table _keep on commit drop as
    select k, min(id) as kid, array_agg(distinct em) as ems from _leg group by k;

  insert into public.home_tarefas_conclusoes (tarefa_id, email, ciclo, concluida_em, concluida_por)
    select kp.kid, l.em, date '2000-01-01', coalesce(l.concluida_em, now()), l.concluida_por
    from _leg l join _keep kp on kp.k = l.k
    where l.concluida
  on conflict (tarefa_id, email, ciclo) do nothing;

  update public.home_tarefas t set responsaveis = kp.ems, tipo = coalesce(t.tipo, 'prazo')
    from _keep kp where t.id = kp.kid;

  update public.home_tarefas set legado = true
    where id in (select l.id from _leg l join _keep kp on kp.k = l.k where l.id <> kp.kid);
end $$;

-- 5) Permissões (o app usa a chave anon)
grant select, insert, update, delete on public.home_tarefas_conclusoes, public.home_tarefas_anexos to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
