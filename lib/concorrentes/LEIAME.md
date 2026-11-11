# Monitor de concorrentes

Acompanha, todo dia, preço e vendas dos anúncios de categorias de marketplaces (hoje: Mercado Livre).

## Arquitetura
```
Tela  /concorrentes  (app/components/ConcorrentesPainel.tsx)
 ├─ lê direto do Supabase (chave anon, só SELECT — RLS ligada nas 3 tabelas)
 └─ escreve via /api/concorrentes/*  (chave service_role, confere Origin = mesmo site)
        categorias  POST cadastra e raspa 2 páginas | PATCH pausa/retoma
        anuncios    POST adiciona avulso por link   | PATCH desativa/reativa e/ou marca favorito
        comparativos POST marca "igual ao meu" (link + SKU) | PATCH meu preço | DELETE
        capturar    POST = "Atualizar agora" (mesma captura do cron, em lotes)
        diagnostico POST testa API/HTML do ML a partir da Vercel

Vercel Cron (vercel.json, 09:00 UTC = 06:00 SP) -> GET /api/cron/daily-scraper
        Authorization: Bearer $CRON_SECRET (a Vercel envia sozinha) ou x-cron-secret

lib/concorrentes/
  canais.ts          lista de marketplaces (Shopee/Amazon "em breve")
  marketplaces.ts    registro de conectores  <- Shopee/Amazon entram aqui
  mercadolivre/      url (validação/SSRF), parsers (HTML), fontes (API + HTML + proxy), index (conector)
  captura.ts         cadastrar categoria, avulso, captura diária (vendas_no_dia)
  calculos.ts        vendas_no_dia, "N vendidos", datas de SP
  historico.ts       mudanças de preço, média de vendas/dia (estimativa), resumo de preço (sobre o histórico de um anúncio)
  marca.ts           "MARCA por VENDEDOR" -> marca e vendedor
  comparativo.ts     meu anúncio × concorrente: tarifas aproximadas e lucro líquido com o meu custo (usa lib/analiseMercado.ts)
  comparativos.ts    gravação do comparativo e atualização do meu preço (também pela importação)
  palavrasChave.ts   stopwords + Top 20
  servidor.ts        service_role, CRON_SECRET, checagem de origem
```

## Importar do navegador (quando o servidor é bloqueado pelo marketplace)
O Mercado Livre costuma barrar IPs de servidor, e proxies que passam por ele são pagos. Alternativa sem proxy, API nem senha:
1. No painel, arraste o botão "Capturar anúncios" para a barra de favoritos (código em `favorito.ts`).
2. Na página do ML (lista ou anúncio), clique no favorito: ele lê as 2 primeiras páginas no navegador do usuário e copia um texto (JSON).
3. Cole no painel e clique em Importar (`/api/concorrentes/importar`). A rota valida tudo (só links do ML, imagens https, limites).
Repetir no dia seguinte grava a captura do dia e calcula `vendas_no_dia`. Com `ML_ESTRATEGIA=manual` o servidor não busca nada (o cron e "Atualizar agora" ficam inativos).
O total de vendas só vem se a listagem do ML mostrar "N vendidos" no cartão; senão fica "—" (use o favorito na página do anúncio para os que importam).

## Sub-abas da tela
- **Anúncios**: tabela por categoria, ★ favorito, marca, total em faixa (“+5.000”), média/dia estimada, selo ▼/▲ de mudança de preço (30 dias).
- **Mudanças de preço**: cada vez que o preço de uma captura difere do da captura anterior (período 7/30/90 dias, só quedas/altas, só favoritos). Só enxerga os dias em que houve captura.
- **Favoritos**: anúncios com ★ de todas as categorias (preço atual, mín–máx, evolução, total, média/dia).
- **Comparativo** (⚖️ no anúncio do concorrente): link do meu anúncio + SKU. Se o MLB está em `ml_anuncios_regras`, SKU, conta (1/2) e Clássico/Premium vêm de lá. Mostra os dois preços, comissão, tarifa fixa, frete estimado, imposto de 9%, o MEU custo (`tabela_custos_skus`, ou o custo digitado) e o lucro líquido/margem de cada lado. O meu preço é digitado, lido pelo favorito na página do meu anúncio, ou atualizado sozinho quando uma importação traz o mesmo MLB.

## Vendas do dia: o que dá para medir
O Mercado Livre não divulga a venda diária de terceiros: só o total acumulado, em faixas a partir de certo volume (`ultimo_aproximado`/`vendas_aproximado` marcam isso). “Vendas do dia” só sai do zero quando a faixa muda; a **média/dia** (total da última captura − da primeira, ÷ dias; mínimo 7 dias, janela de 90) é uma estimativa cujo erro máximo é uma faixa ÷ dias.

## Variáveis de ambiente (Vercel)
| Variável | Obrigatória | Para quê |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | sim | gravar nas tabelas (RLS ignorada só no servidor) |
| `CRON_SECRET` | sim | autenticar o cron; sem ela a rota recusa rodar |
| `ML_SCRAPER_URL_TEMPLATE` | recomendada | serviço de raspagem/proxy, ex. `https://servico/?key=XXX&url={url}` (o ML costuma barrar IPs de datacenter) |
| `ML_CLIENT_ID` + `ML_CLIENT_SECRET` ou `ML_ACCESS_TOKEN` | opcional | chamadas autenticadas na API oficial |
| `ML_TIMEOUT_MS` | opcional | tempo máximo de uma página (padrão 45000 via proxy, 15000 direto) |
| `ML_CONCORRENCIA` | opcional | páginas lidas ao mesmo tempo (padrão 5; aumente se o plano do proxy permitir) |
| `ML_ESTRATEGIA` | opcional | `auto` (padrão: API e depois páginas) · `api` · `html` · `manual` (só importação pelo navegador) |
| `ML_API_BASE` | opcional | só para testes |

## Regras de negócio
- `vendas_no_dia = total de hoje − total da captura anterior`; `null` sem captura anterior; nunca negativo.
- Uma linha por anúncio por dia (`UNIQUE(anuncio_id, data_captura)`): rodar o cron de novo não duplica nem zera o dia.
- Desativar um anúncio mantém o histórico. A captura roda em lotes dentro de ~50 s e pode ser repetida.
- Totais "+500 vendidos" são faixas: o dia fica 0 até a faixa mudar.
- Palavras-chave: cada palavra conta uma vez por título; ignora pontuação, stopwords, números e unidades.
