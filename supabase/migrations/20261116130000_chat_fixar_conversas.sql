-- Conversas fixadas no topo da lista (por pessoa, como no WhatsApp)
alter table public.chat_membros add column if not exists fixada_em timestamptz;
