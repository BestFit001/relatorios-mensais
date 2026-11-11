# Monitor de concorrentes

Página **Análise da concorrência** (`/concorrentes`). Abas: **Mercado Livre | Shopee | Amazon | Pesquisa de preços | Análise de mercado**.
As três primeiras acompanham, todo dia, preço e vendas dos anúncios de categorias/buscas; a quarta procura o item no Google; a quinta é a antiga página Análise de mercado (`/analise-mercado` redireciona para `/concorrentes?aba=analise-mercado`).

## Arquitetura
```
Tela  /concorrentes  (app/concorrentes/page.tsx = abas; ConcorrentesPainel.tsx = um canal; concorrentes/PesquisaImagem.tsx; AnaliseMercadoPainel.tsx)
 ├─ lê direto do Supabase (chave anon, só SELECT — RLS ligada nas 3 tabelas)
 └─ escreve via /api/concorrentes/*  (chave service_role, confere Origin = mesmo site)
        categorias  POST cadastra e raspa 2 páginas | PATCH pausa/retoma
        anuncios    POST adiciona avulso por link   | PATCH desativa/reativa e/ou marca favorito
        comparativos POST marca "igual ao meu" (link + SKU) | PATCH meu preço | DELETE
        capturar    POST = "Atualizar agora" (mesma captura do cron, em lotes)
        diagnostico POST testa API/HTML do ML a partir da Vercel
        importar    POST texto do favorito -> categoria/anúncios/ranking (canal vem do texto e da aba; texto de outra aba é recusado)
        pesquisas   POST cria (SKU + meu PDV + termo) | PATCH importa o texto do Google ou muda PDV/termo | DELETE

Vercel Cron (vercel.json, 09:00 UTC = 06:00 SP) -> GET /api/cron/daily-scraper
        Authorization: Bearer $CRON_SECRET (a Vercel envia sozinha) ou x-cron-secret

lib/concorrentes/
  canais.ts          marketplaces (leituraServidor: só o ML; canalAnalise = nome do canal na Análise de mercado)
  marketplaces.ts    registro de conectores; Shopee e Amazon usam fonteNavegador.ts (o servidor não lê esses sites)
  urls.ts            links por canal (amazon/url.ts: ASIN; shopee/url.ts: loja.item) — SSRF: só https nos domínios do canal
  pesquisa.ts        Pesquisa de preços: valida o texto lido no Google, loja -> canal meu, grava ofertas
  pesquisaCalculo.ts preço por canal, diferença para o meu PDV, lucro líquido com o meu custo (puro, testável)
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

Na tela, “Cadastrar categoria pelo servidor” e “Testar conexão” ficam num bloco fechado “Avançado”: só servem se o servidor conseguir ler o Mercado Livre (proxy pago ou API).

## Sub-abas da tela
- **Anúncios**: tabela por categoria, ★ favorito, marca, total em faixa (“+5.000”), média/dia estimada, selo ▼/▲ de mudança de preço (30 dias).
- **Mudanças de preço**: cada vez que o preço de uma captura difere do da captura anterior (período 7/30/90 dias, só quedas/altas, só favoritos). Só enxerga os dias em que houve captura.
- **Favoritos**: anúncios com ★ de todas as categorias (preço atual, mín–máx, evolução, total, média/dia).
- **Comparativo** (⚖️ no anúncio do concorrente): link do meu anúncio + SKU. Se o MLB está em `ml_anuncios_regras`, SKU, conta (1/2) e Clássico/Premium vêm de lá. Mostra os dois preços, comissão, tarifa fixa, frete estimado, imposto de 9%, o MEU custo (`tabela_custos_skus`, ou o custo digitado) e o lucro líquido/margem de cada lado. O meu preço é digitado, lido pelo favorito na página do meu anúncio, ou atualizado sozinho quando uma importação traz o mesmo MLB.

## Ranking "Mais vendidos"
O favorito também lê a página `mercadolivre.com.br/mais-vendidos/...` (tipo `ranking`, entra na categoria selecionada no painel) e qualquer cartão com a tag "Nº MAIS VENDIDO". A posição fica em `anuncios.ranking_posicao`; a leitura anterior em `ranking_anterior` (+ datas). A tela mostra a tag 🏆 com ▲/▼/=/novo/saiu. Na página Mais vendidos, anúncio que estava no ranking e não aparece mais "saiu" (só se a leitura trouxe ≥ 5 anúncios). Ler de novo no mesmo dia não perde a base do dia anterior.
Atenção: os links dessa página podem ser de catálogo (`/p/MLB…`); o anúncio é identificado pelo `wid=` quando existir, senão pelo id do link — se vier só o id de catálogo, ele entra como um anúncio novo da categoria.

## Vendas do dia: o que dá para medir
O Mercado Livre não divulga a venda diária de terceiros: só o total acumulado, em faixas a partir de certo volume (`ultimo_aproximado`/`vendas_aproximado` marcam isso). “Vendas do dia” só sai do zero quando a faixa muda; a **média/dia** (total da última captura − da primeira, ÷ dias; mínimo 7 dias, janela de 90) é uma estimativa cujo erro máximo é uma faixa ÷ dias.

## Preço "De" x "Por" e mudanças de preço
- `anuncios.ultimo_preco` é SEMPRE o preço **"Por"** (o atual, que o cliente paga): é ele que as análises, o preço médio, os comparativos e a Pesquisa de preços usam. O **"De"** (riscado) fica em `ultimo_preco_original` só quando for maior que o "Por" (`originalValido` em `precos.ts`); é lido do bloco `.andes-money-amount--previous` (ML), `.a-text-price` (Amazon) ou do primeiro preço riscado (Shopee) e vem da API em `original_price`. A tela mostra "De:" riscado, "Por:" e o selo de desconto (`PrecoDePor`).
- **Registro por leitura:** tabela `precos_eventos` (uma linha por mudança do "Por" + uma de partida na 1ª leitura), com `registrado_em` (hora em que o painel LEU o preço, não a da mudança na loja). Permite várias mudanças no mesmo dia. `historico_diario` continua com 1 linha por dia (o último preço do dia, e o "De").
- Quando há leitura: favorito/Importar do navegador (sempre), cron diário e **"Atualizar agora"**, que relê também o que já foi lido hoje há mais de 10 min (`lido_em`). Sem leitura não há como saber: o painel não vê o que acontece entre duas leituras. O cron é diário (09:00 UTC); para pegar mais mudanças no dia, use "Atualizar agora"/o favorito mais vezes ou aumente a frequência do cron (depende do plano da Vercel).
- Na tela: selo ▲/▼ com data e hora (clique abre o histórico do anúncio) e a sub-aba “Mudanças de preço” lista cada mudança com a hora. Antes do registro por leitura valia só a comparação entre dias, que continua aparecendo para o período antigo (`juntarMudancas`).

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

## Shopee e Amazon (só pelo favorito)
- Os dois sites bloqueiam leitura automática de servidor; por isso **não há captura diária automática** para eles: a cada dia você abre a mesma busca/categoria, clica no favorito e importa (o histórico de preço e a posição no Mais vendidos são formados assim).
- Mesmas tabelas (`categorias.canal` = `shopee`/`amazon`; `anuncios.mlb_id` guarda o ASIN da Amazon ou `loja.item` da Shopee). O cron ignora esses canais.
- **Shopee**: mostra o total de vendidos (às vezes “1,2mil”: faixa). A lista carrega aos poucos e é uma SPA: o favorito rola a página e lê só a que está aberta.
- **Amazon**: só informa “N compras no mês passado” (vendas dos últimos 30 dias, em faixas, só em parte dos produtos) → coluna `anuncios.ultimo_vendas_mes`; **não existe “vendas do dia”**. Mais vendidos: posição #N (`/gp/bestsellers/…`).
- Os seletores do favorito para Shopee, Amazon e Google foram escritos e testados em páginas simuladas; os sites mudam o HTML sem aviso. Se o favorito disser que não achou nada, o ajuste fica em `favorito.ts`.

## Pesquisa de preços (Google)
1. Cria-se a pesquisa (SKU + meu PDV + palavras). Não há busca por imagem (sem Google Lens): a busca é por texto, no **Google Shopping**.
2. No Google Shopping (botão “Abrir Google Shopping”) o favorito rola a página e lê cada resultado com preço: título, loja, preço, link (`/url?q=` é resolvido) e imagem (só se for https).
3. O servidor valida (`sanitizarPesquisa`), liga a loja ao canal meu (`canalDaLoja`: Mercado Livre, Amazon, Shopee, Magalu, Netshoes, Shein, TikTok Shop, Centauro; o resto fica “fora dos meus canais”) e grava em `pesquisa_resultados` (mesma loja + mesmo título = mesma linha; ler de novo atualiza o preço).
4. A tela mostra o menor preço por canal, a diferença para o meu PDV e o lucro líquido vendendo àquele preço, com o custo do SKU (`tabela_custos_skus`) e as taxas de `config_regras_tarifacao` (ML: cadastro dos anúncios do SKU, modalidade Clássico).
- O Google mostra produtos parecidos, não garantidamente idênticos, e personaliza por localização/histórico. Há “oferta à mão” para quando o favorito não lê.

## Vídeos "Com problemas" → Correções (fora do monitor, mas relacionado ao Início)
Veja `lib/videoCorrecoes.ts` e a migration `20261111180000_video_correcoes.sql`: tabelas `video_correcoes` (um registro por envio) e `video_correcoes_canais` (um por canal que não estava marcado). O produto some de Vídeos enquanto a correção está `aberta`.

## Buscar fotos (sem API)
Aba **📷 Buscar fotos** de `/concorrentes`. Código em `lib/fotos/` e `app/api/fotos/{importar,baixar}`. Não usa Google Cloud Vision nem nenhuma API paga (`GOOGLE_VISION_API_KEY` não existe mais).
1. A pessoa pesquisa no **Google Shopping** (por EAN, palavras ou pela imagem, como na Pesquisa de preços) e clica no mesmo favorito da Pesquisa de preços (`lerGoogle` em `favorito.ts`; só lê resultados com preço). O texto colado vai para `POST /api/fotos/importar` (`lib/fotos/importar.ts`).
2. O servidor valida com `sanitizarPesquisa`, escolhe até 30 páginas de loja (https público, sem repetir, sem páginas do próprio Google) e as abre (até 6 em paralelo, ~22 s no total, 1,5 MB e 8 s por página).
3. De cada página `lib/fotos/paginas.ts` tira as fotos do produto: JSON-LD (Product/ImageObject), `og:image`/`twitter:image`/`image_src`, ampliações da loja (`hiRes`, `data-a-dynamic-image`, `data-old-hires`) e testa versões maiores conhecidas (Amazon sem `._AC_…_`, Mercado Livre `-F`/`-O`, Shopee sem `_tn`, Magalu 1500x1500). Quem não existir some na medição.
4. `lib/fotos/busca.ts` lê só o começo de cada imagem (128 KB, `Range`) para saber largura e altura, descarta ícones (< 100 px), HTML e links quebrados, tira repetidas (mesmas dimensões e bytes) e ordena da maior resolução para a menor.
5. `POST /api/fotos/baixar` entrega o arquivo original (o navegador não consegue por CORS); o ZIP é montado no navegador (JSZip).
- **Segurança (as URLs vêm da internet):** só https público, porta 443, sem usuário/senha; o DNS é conferido na hora de conectar e cada redirecionamento é refeito (`lib/fotos/seguranca.ts`); mesma origem obrigatória; limite de 15 MB por foto. `FOTOS_PERMITIR_REDE_LOCAL` só vale fora da Vercel (testes).
- **Entrada alternativa:** o campo também aceita endereços de loja (https), um por linha, sem passar pelo Google. O painel avisa quantos resultados do Google vieram sem link direto da loja (apontam para a página do produto no Google ou são anúncios com redirecionamento; o servidor não abre esses, para não gerar cliques em anúncios).
- **Duplicadas:** a mesma foto em tamanhos diferentes (`-640-0`/`-480-0`, `._AC_…_`, `-F`/`-O`) fica só a maior (`chaveFamilia`); logotipos/ícones/banners (`ehLogo`) são descartados; Nuvemshop também tem variantes maiores testadas.
- **Limites:** lojas que bloqueiam acesso de servidor (Amazon, Mercado Livre e Shopee costumam bloquear) não entregam a foto; o painel mostra “X de Y páginas abertas”. As miniaturas do Google são pequenas e não são usadas. A tabela `fotos_buscas` (contador do Vision) foi removida.

## EAN
`lib/ean.ts` valida EAN/GTIN (8, 12, 13 ou 14 dígitos + dígito verificador). O SKU é interno (serve para custo e tarifas); o EAN é o código universal que o Google conhece. Na **Pesquisa de preços** o EAN (`pesquisas_imagem.ean`) vira a busca do Google Shopping, no lugar das palavras. Em **Buscar fotos** ele abre o Google Shopping pelo código e nomeia os arquivos.
