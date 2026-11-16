-- Níveis de usuário (admin = Admin Geral | admin_area | analista | geral) e agendas por área (E-commerce, Compras, Financeiro).
-- Quem enxerga cada agenda passa a ser definido por usuário (usuarios_permissoes.agendas), e não mais por agenda_donos.
alter table public.usuarios_permissoes add column if not exists agendas jsonb not null default '[]'::jsonb;
alter table public.agenda_tarefas      add column if not exists area text;   -- ecommerce | compras | financeiro | null (outros responsáveis)

-- Tarefas antigas: Felipe -> E-commerce, Juliana -> Compras, Eduardo -> Financeiro (pelo primeiro nome do responsável)
update public.agenda_tarefas set area = case
  when lower(btrim(responsavel)) ~ '^felipe( |$)'  then 'ecommerce'
  when lower(btrim(responsavel)) ~ '^juliana( |$)' then 'compras'
  when lower(btrim(responsavel)) ~ '^eduardo( |$)' then 'financeiro'
  else null end
where area is null;

-- Quem já era dono de uma agenda continua com ela, agora como Admin de Área
update public.usuarios_permissoes set perfil = 'admin_area', agendas = '["ecommerce"]'::jsonb where lower(email) = 'felipe.camargo@usebestfit.com.br' and perfil = 'admin';
update public.usuarios_permissoes set perfil = 'admin_area', agendas = '["compras"]'::jsonb   where lower(email) = 'juliana.silva@usebestfit.com.br'  and perfil = 'admin';
