# Acompanhamento de estoque da concorrência

Página `/estoque-concorrencia` (menu **Ferramentas › Acompanhamento de estoque**; a **Análise da concorrência** também fica em Ferramentas). Sub-abas: **Acompanhamento** (uma aba por canal à vista) e **Configurações** (quais canais ficam à vista; salvo em `config_regras_tiny`, campo `estoque_conc_canais`, ids separados por vírgula; sem registro = todos).

Canais (`links.ts` › `CANAIS_ESTOQUE`): Mercado Livre (leitor específico), TikTok Shop, Shopee, Amazon, Magalu, Shein, Netshoes, Centauro (leitor **genérico**). Cada canal tem sua regra de link/código do anúncio; links curtos (vt.tiktok.com, amzn.to) são abertos pelo servidor para achar o endereço real (`paginas.ts` › `resolverLinkCurto`); se não abrir, o painel pede o endereço completo.

Leitor genérico (`leitorJs.ts` › `lerEstoqueGenerico`): procura nos dados embutidos da página (`__UNIVERSAL_DATA_FOR_REHYDRATION__`, `__NEXT_DATA__`…) campos de estoque (`total_stock`, `stock`, `available_quantity`, `inStock`, `soldOut`…), restrito ao produto pelo código quando acha; depois JSON-LD `availability`; por último o texto ("esgotado" sem botão de compra). Sem sinal claro = `desconhecido`, com o motivo e trechos da página no `detalhe` (para ajustar o leitor com o link real). Nunca há aviso sem sinal claro.

Fluxo: o usuário cola links de anúncios → `POST /api/estoque-concorrencia/itens` (`adicionarLinks`, aceita link de catálogo `…/up/MLBU…?pdp_filters=item_id:MLB…`) → o estoque é lido todo dia → ao passar para **esgotado** nasce um aviso "Acabou na concorrência" (banner na página + Notificações do Início, aba 🚨) que some ao marcar **visto** (`aviso_visto_em`). Se o anúncio volta a ter estoque, o aviso some sozinho e `voltou_em` é gravado.

Tabelas (migration `20261116190000_estoque_concorrencia.sql`): `estoque_monitorados` (estado atual), `estoque_historico` (1 linha por anúncio/dia). RLS só leitura; escrita pelas rotas (service_role).

Leitura do estoque (`leitorJs.ts`, mesmo código no servidor e no favorito): sinais da página do ML — JSON-LD `availability`, "(+50 disponíveis)", "Última disponível", "Publicação pausada/finalizada", `available_quantity`. Sem sinal claro = `desconhecido`, que **nunca** dispara aviso (evita alarme falso). A coluna `detalhe` mostra a evidência usada. Página 404/410 = esgotado.

Dois caminhos de leitura (como na concorrência):
1. **Servidor** — cron diário `/api/cron/daily-scraper` (encadeado, para não criar um 3º cron na Vercel) e botão "Ler agora". Usa a API do ML se houver credenciais, senão baixa o HTML (`fontes.ts`, proxy/`ML_ESTRATEGIA`); os outros canais usam `paginas.ts` (proxy opcional em `ESTOQUE_SCRAPER_URL_TEMPLATE`, senão o mesmo `ML_SCRAPER_URL_TEMPLATE`). Os sites costumam bloquear IP de servidor; ao ser barrado, o canal é pulado na rodada.
2. **Favorito "Ler estoque"** (`favorito.ts`) — roda no navegador do usuário numa página do site do canal (mesmo endereço dos links), lê cada anúncio com a sessão dele e gera um JSON; cole em "Resultado da leitura" → `POST /api/estoque-concorrencia/importar`.

Permissão: rota `/estoque-concorrencia` (Painel Admin › páginas permitidas); admin vê tudo. A notificação no Início só aparece para quem tem a página e canal à vista.
