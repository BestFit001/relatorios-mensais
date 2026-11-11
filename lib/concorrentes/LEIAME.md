# Monitor de concorrentes

Acompanha, todo dia, preço e vendas dos anúncios de categorias de marketplaces (hoje: Mercado Livre).

## Arquitetura
```
Tela  /concorrentes  (app/components/ConcorrentesPainel.tsx)
 ├─ lê direto do Supabase (chave anon, só SELECT — RLS ligada nas 3 tabelas)
 └─ escreve via /api/concorrentes/*  (chave service_role, confere Origin = mesmo site)
        categorias  POST cadastra e raspa 2 páginas | PATCH pausa/retoma
        anuncios    POST adiciona avulso por link   | PATCH desativa/reativa
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
  palavrasChave.ts   stopwords + Top 20
  servidor.ts        service_role, CRON_SECRET, checagem de origem
```

## Variáveis de ambiente (Vercel)
| Variável | Obrigatória | Para quê |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | sim | gravar nas tabelas (RLS ignorada só no servidor) |
| `CRON_SECRET` | sim | autenticar o cron; sem ela a rota recusa rodar |
| `ML_SCRAPER_URL_TEMPLATE` | recomendada | serviço de raspagem/proxy, ex. `https://servico/?key=XXX&url={url}` (o ML costuma barrar IPs de datacenter) |
| `ML_CLIENT_ID` + `ML_CLIENT_SECRET` ou `ML_ACCESS_TOKEN` | opcional | chamadas autenticadas na API oficial |
| `ML_ESTRATEGIA` | opcional | `auto` (padrão: API e depois páginas) · `api` · `html` |
| `ML_API_BASE` | opcional | só para testes |

## Regras de negócio
- `vendas_no_dia = total de hoje − total da captura anterior`; `null` sem captura anterior; nunca negativo.
- Uma linha por anúncio por dia (`UNIQUE(anuncio_id, data_captura)`): rodar o cron de novo não duplica nem zera o dia.
- Desativar um anúncio mantém o histórico. A captura roda em lotes dentro de ~50 s e pode ser repetida.
- Totais "+500 vendidos" são faixas: o dia fica 0 até a faixa mudar.
- Palavras-chave: cada palavra conta uma vez por título; ignora pontuação, stopwords, números e unidades.
