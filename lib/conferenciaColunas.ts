// Checagem de Cancelados > Conferência: acha as colunas da planilha pelo texto do cabeçalho (ex.: "N.º de venda", "SKU", "Unidades"),
// para a pessoa não precisar digitar letras. Só lógica (sem rede nem tela).

/** Texto comparável: minúsculas, sem acento, sem pontuação ("N.º de venda" -> "no de venda"). */
export const normalizarCabecalho = (v: unknown): string =>
  String(v ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type RegrasCabecalho = Record<string, string[]>;

/** Cabeçalhos conhecidos da planilha de vendas (ML, TikTok, Shopee, Amazon...). A ordem de cada lista é a prioridade. */
export const CABECALHOS_VENDAS: RegrasCabecalho = {
  pedido: ["n.º de venda", "número do pedido", "id do pedido", "amazon-order-id", "order id", "order_id", "id do pedido no marketplace", "pedido", "n° do pedido"],
  status: ["estado", "status do pedido", "order status", "order-status", "status", "situação"],
  sku: ["sku", "seller sku", "sku do vendedor", "sku vendedor", "código sku", "sku do produto", "referência sku", "número de referência sku", "nº de referência do sku"],
  quantidade: ["unidades", "quantidade", "quantity", "quantity-purchased", "qtd", "qtde"],
  produto: ["título do anúncio", "nome do produto", "product name", "product-name", "produto", "descrição do produto"],
};

/** Cabeçalhos conhecidos da planilha de notas (NF-e de saída do Tiny). */
export const CABECALHOS_NOTAS: RegrasCabecalho = {
  pedido: ["observacoes", "observações", "observação", "obs"],
  nf: ["numero nota", "número da nota", "número nota", "nf-e", "nfe", "número nf"],
  comprador: ["contato", "nome do comprador", "cliente", "destinatário"],
  valor: ["valor nota", "valor da nota", "total faturado", "valor total"],
};

export interface CabecalhoAchado {
  /** posição (base 0) da linha do cabeçalho na planilha; -1 se não achou */
  linhaCabecalho: number;
  /** índice (base 0) da coluna de cada campo achado */
  colunas: Record<string, number>;
  /** texto do cabeçalho achado em cada campo, para mostrar na tela */
  textos: Record<string, string>;
}

/**
 * Procura, nas primeiras linhas, a linha de cabeçalho: a que reconhece mais campos (mínimo 2, e o pedido precisa estar entre eles).
 * Em cada campo vale a primeira coluna que bate com o nome de maior prioridade.
 */
export function acharCabecalho(linhas: any[][], regras: RegrasCabecalho, maxLinhas = 25): CabecalhoAchado {
  const nenhum: CabecalhoAchado = { linhaCabecalho: -1, colunas: {}, textos: {} };
  const aliases: Record<string, string[]> = {};
  for (const k of Object.keys(regras)) aliases[k] = regras[k].map(normalizarCabecalho);
  let melhor = nenhum, melhorN = 0;
  for (let i = 0; i < Math.min(linhas.length, maxLinhas); i++) {
    const cels = (linhas[i] || []).map(normalizarCabecalho);
    const colunas: Record<string, number> = {}, textos: Record<string, string> = {};
    for (const k of Object.keys(aliases)) {
      for (const a of aliases[k]) {
        const j = cels.findIndex((c) => c !== "" && c === a);
        if (j >= 0) { colunas[k] = j; textos[k] = String(linhas[i][j] ?? "").trim(); break; }
      }
    }
    const n = Object.keys(colunas).length;
    if (colunas.pedido !== undefined && n >= 2 && n > melhorN) { melhorN = n; melhor = { linhaCabecalho: i, colunas, textos }; }
  }
  return melhor;
}
