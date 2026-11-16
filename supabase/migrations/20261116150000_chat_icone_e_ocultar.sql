-- Ícone dos grupos do chat (emoji escolhido na criação/edição) e conversa ocultada por pessoa ("excluir conversa")
alter table public.chat_salas add column if not exists icone text;
alter table public.chat_membros add column if not exists oculta_em timestamptz;
alter table public.chat_membros add column if not exists limpa_em timestamptz;   -- histórico apagado só para a pessoa (mensagens anteriores a isto não aparecem)
