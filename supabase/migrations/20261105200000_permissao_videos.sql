-- "Vídeos" virou uma aba própria em Relatórios (/videos), separada de Produtos (agora "Novos Cadastros").
-- Quem já tinha acesso a /produtos continua vendo os vídeos: ganha também /videos.
update public.usuarios_permissoes
set paginas_permitidas = paginas_permitidas || '["/videos"]'::jsonb
where jsonb_typeof(paginas_permitidas) = 'array'
  and paginas_permitidas ? '/produtos'
  and not (paginas_permitidas ? '/videos');
