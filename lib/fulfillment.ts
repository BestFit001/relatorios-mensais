/**
 * Fulfillment (Mercado Envios Full / FBA) — regras de negócio puras (sem React/Supabase).
 *
 *  - leitura da planilha de vendas do ML por NOME de coluna (layouts de 66 e 67 colunas)
 *  - classificação do status da venda (válida / cancelada / devolvida / troca)
 *  - leitura da planilha de remessas (entrada de estoque)
 *  - simulação FIFO por lote (espelha a função SQL fulfillment_recalcular_fifo)
 *  - regra dos 60 dias de armazenagem
 */

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

export function normTexto(v: any): string {
  return String(v ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizarSkuFull(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  return s.toLowerCase();
}

export function parseNumeroFull(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const MESES_PT: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

/** "3 de novembro de 2026 12:30 hs." -> "2026-11-03" */
export function parseDataVendaML(valor: any): string | null {
  const m = normTexto(valor).match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (!m) return null;
  const mes = MESES_PT[m[2]];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, "0")}`;
}

/** Aceita serial do Excel, Date, "DD/MM/AAAA", "AAAA-MM-DD", "DD-MM-AAAA" e "3 de novembro de 2026". -> "AAAA-MM-DD" */
export function parseDataFlex(valor: any): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (typeof valor === "number" && valor > 20000 && valor < 80000) {
    const d = new Date(Math.round((valor - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return parseDataVendaML(s);
}

/** Data de "hoje" no fuso de São Paulo (AAAA-MM-DD) */
export function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function diffDias(deISO: string, ateISO: string): number {
  const a = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10));
  const b = Date.UTC(+ateISO.slice(0, 4), +ateISO.slice(5, 7) - 1, +ateISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** "10/2026" -> true se a data ISO pertence ao mês */
export function dataNoMes(dataISO: string | null, mesAno: string): boolean {
  if (!dataISO) return false;
  const [mm, aaaa] = mesAno.split("/");
  return dataISO.slice(0, 7) === `${aaaa}-${mm.padStart(2, "0")}`;
}

/** Dias que o período já cobre (mês fechado = dias do mês; mês corrente = dias decorridos) */
export function diasDoPeriodo(mesAno: string, hojeISO = hojeSaoPaulo()): number {
  const [mm, aaaa] = mesAno.split("/").map(Number);
  const diasMes = new Date(aaaa, mm, 0).getDate();
  const ref = `${aaaa}-${String(mm).padStart(2, "0")}`;
  if (hojeISO.slice(0, 7) === ref) return Math.max(1, +hojeISO.slice(8, 10));
  return diasMes;
}

/** "outubro 2026" (coluna "Mês de faturamento das suas tarifas") x "10/2026" */
export function mesFaturamentoCorresponde(valor: any, mesAno: string): boolean {
  const m = normTexto(valor).match(/^([a-z]+) (\d{4})$/);
  if (!m) return false;
  const [mm, aaaa] = mesAno.split("/");
  return MESES_PT[m[1]] === mm.padStart(2, "0") && m[2] === aaaa;
}

export function colLetter(idx: number): string {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Planilha de vendas do Mercado Livre — mapeamento por cabeçalho       */
/* ------------------------------------------------------------------ */

export interface MapaColunasML {
  indiceCabecalho: number;
  /** valor sugerido para "Linha Inicial" (1-based, primeira linha de dados) */
  linhaInicial: number;
  pedido: string;
  dataVenda: string;
  deposito: string;
  status: string;
  unidades: string;
  receita: string;
  tarifaVenda: string;
  receitaEnvio: string;
  tarifaEnvio: string;
  descontos: string;
  cancelamentos: string;
  total: string;
  mesFaturamento: string;
  sku: string;
  mlb: string;
  pdv: string;
  formaEntrega: string;
  layout: string;
}

type ChaveCol = Exclude<keyof MapaColunasML, "indiceCabecalho" | "linhaInicial" | "layout">;

const CABECALHOS_ML: Array<[ChaveCol, (h: string) => boolean]> = [
  ["pedido", (h) => h.startsWith("n.") && h.includes("de venda")],
  ["dataVenda", (h) => h === "data de venda"],
  ["deposito", (h) => h === "deposito"],
  ["status", (h) => h === "estado"],
  ["unidades", (h) => h === "unidades"],
  ["receita", (h) => h.startsWith("receita por produtos")],
  ["tarifaVenda", (h) => h.startsWith("tarifa de venda e impostos")],
  ["receitaEnvio", (h) => h.startsWith("receita por envio")],
  ["tarifaEnvio", (h) => h.startsWith("tarifas de envio")],
  ["descontos", (h) => h.startsWith("descontos e bonus")],
  ["cancelamentos", (h) => h.startsWith("cancelamentos e reembolsos")],
  ["total", (h) => h.startsWith("total (")],
  ["mesFaturamento", (h) => h.startsWith("mes de faturamento")],
  ["sku", (h) => h === "sku"],
  ["mlb", (h) => h.startsWith("# de anuncio")],
  ["pdv", (h) => h.startsWith("preco unitario de venda")],
  ["formaEntrega", (h) => h === "forma de entrega"],
];

/**
 * Recebe a matriz de XLSX.utils.sheet_to_json(ws, { header: "A", defval: "" }) e devolve as
 * letras de coluna a partir dos NOMES dos cabeçalhos. Resolve o fato de a exportação "só Full"
 * ter 66 colunas e a completa 67 (falta "Custo de envio por troca de produto"), o que
 * deslocava SKU, preço, forma de entrega etc. em 1 coluna.
 */
export function detectarColunasML(matriz: Array<Record<string, any>>): MapaColunasML | null {
  const limite = Math.min(matriz.length, 40);
  for (let i = 0; i < limite; i++) {
    const row = matriz[i];
    if (!row) continue;
    const entradas = Object.entries(row);
    const temPedido = entradas.some(([, v]) => {
      const h = normTexto(v);
      return h.startsWith("n.") && h.includes("de venda");
    });
    if (!temPedido) continue;

    const achados: Partial<Record<ChaveCol, string>> = {};
    for (const [letra, valor] of entradas) {
      const h = normTexto(valor);
      if (!h) continue;
      for (const [chave, teste] of CABECALHOS_ML) {
        if (achados[chave] === undefined && teste(h)) achados[chave] = letra;
      }
    }
    if (!achados.pedido || !achados.sku || !achados.status) return null;

    const temTroca = entradas.some(([, v]) => normTexto(v).startsWith("custo de envio por troca"));
    return {
      indiceCabecalho: i,
      linhaInicial: i + 2,
      pedido: achados.pedido,
      dataVenda: achados.dataVenda || "B",
      deposito: achados.deposito || "C",
      status: achados.status,
      unidades: achados.unidades || "H",
      receita: achados.receita || "I",
      tarifaVenda: achados.tarifaVenda || "L",
      receitaEnvio: achados.receitaEnvio || "M",
      tarifaEnvio: achados.tarifaEnvio || "N",
      descontos: achados.descontos || "R",
      cancelamentos: achados.cancelamentos || "S",
      total: achados.total || "T",
      mesFaturamento: achados.mesFaturamento || "U",
      sku: achados.sku,
      mlb: achados.mlb || "Y",
      pdv: achados.pdv || "AC",
      formaEntrega: achados.formaEntrega || "AS",
      layout: temTroca ? "67 colunas (exportação completa)" : "66 colunas (exportação só-Full)",
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Classificação do status da venda                                     */
/* ------------------------------------------------------------------ */

export type TipoVenda = "VALIDA" | "CANCELADA" | "DEVOLVIDA" | "TROCA" | "ALTERACAO" | "PACOTE";

export function ehFormaFull(forma: any): boolean {
  return normTexto(forma).includes("full");
}

/**
 * Classifica a linha do relatório de vendas do ML.
 *  - CANCELADA / DEVOLVIDA: não é venda -> estorno integral (receita, tarifas e custo do SKU)
 *  - TROCA / ALTERACAO: tratadas à parte pelo motor (custo computado 1x)
 *  - PACOTE: linha-mãe de carrinho ("Pacote de N produtos"); os itens vêm nas N linhas seguintes
 *  - "Te demos o dinheiro" (mediação/reclamação ganha pelo vendedor) mantém a venda VÁLIDA
 */
export function classificarStatusML(estado: any, cancelamentos: any = 0): TipoVenda {
  const s = normTexto(estado);
  const canc = parseNumeroFull(cancelamentos);

  if (/^pacote\s*(de)?\s*\d+/.test(s) && !s.includes("cancelad")) return "PACOTE";
  if (s.includes("solicitacao de alteracao")) return "ALTERACAO";
  if (s.includes("troca")) return "TROCA";
  if (s.includes("te demos o dinheiro")) return "VALIDA";

  if (s.includes("cancelad") || s.includes("voce cancelou") || s.includes("nao envie")) return "CANCELADA";
  if (s.includes("devol") || s.includes("reembols") || s.includes("mediacao") || s.includes("reclam")) return "DEVOLVIDA";
  if (canc < 0) return "CANCELADA";
  return "VALIDA";
}

export function ehEstorno(tipo: TipoVenda): boolean {
  return tipo === "CANCELADA" || tipo === "DEVOLVIDA";
}

/* ------------------------------------------------------------------ */
/* Estorno integral de cancelamentos (receita + taxas + CMV)            */
/* ------------------------------------------------------------------ */

export interface LinhaVenda {
  sku: string;
  qtd: number;
  receitaBruta: number;
  liquidoCanal: number; // receita - comissões/tarifas/frete
  custoUnitario: number;
  custoEmbalagemUnit?: number;
}

export interface EstornoCancelamento {
  receita: number;
  taxasEFrete: number;
  cmv: number;
  qtd: number;
  /** Quanto deixa de existir no lucro quando a venda some (lucro que a venda teria) */
  impactoLucro: number;
}

/**
 * Cancelamento estorna a venda inteira. lucro(venda) = liquidoCanal - CMV - imposto;
 * ao cancelar, as três parcelas saem juntas => efeito líquido zero no resultado.
 */
export function calcularEstornoCancelamento(linha: LinhaVenda, aliquotaImpostoPct = 0): EstornoCancelamento {
  const cmv = (linha.custoUnitario + (linha.custoEmbalagemUnit || 0)) * linha.qtd;
  const imposto = linha.receitaBruta * (aliquotaImpostoPct / 100);
  return {
    receita: linha.receitaBruta,
    taxasEFrete: linha.receitaBruta - linha.liquidoCanal,
    cmv,
    qtd: linha.qtd,
    impactoLucro: linha.liquidoCanal - cmv - imposto,
  };
}

/* ------------------------------------------------------------------ */
/* Planilha de remessas (entrada de estoque)                            */
/* ------------------------------------------------------------------ */

export interface RemessaLinha {
  sku: string;
  qtdEnviada: number;
  dataEntrada: string; // AAAA-MM-DD
  linhaOrigem: number;
}

export interface ResultadoParseRemessas {
  remessas: RemessaLinha[];
  erros: string[];
  colunas: { sku: string; qtd: string; data: string } | null;
}

const ALIAS_SKU = ["sku", "codigo", "cod", "codigo sku", "cod sku", "codigo do produto"];
const ALIAS_QTD = ["quantidade enviada", "qtd enviada", "qtde enviada", "quantidade", "qtd", "qtde", "unidades"];
const ALIAS_DATA = [
  "data de envio/entrada", "data de envio / entrada", "data envio/entrada", "data de envio", "data envio",
  "data de entrada", "data entrada", "data", "data da remessa", "data remessa",
];

/**
 * Lê CSV/XLSX de remessas. Matriz: XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).
 * Colunas base: SKU | Quantidade Enviada | Data de Envio/Entrada (nomes alternativos aceitos).
 */
export function parsearRemessas(matriz: any[][]): ResultadoParseRemessas {
  const erros: string[] = [];
  let hIdx = -1;
  let cSku = -1, cQtd = -1, cData = -1;

  for (let i = 0; i < Math.min(matriz.length, 30); i++) {
    const heads = (matriz[i] || []).map((c) => normTexto(c));
    const s = heads.findIndex((h) => ALIAS_SKU.includes(h));
    const q = heads.findIndex((h) => ALIAS_QTD.includes(h));
    const d = heads.findIndex((h) => ALIAS_DATA.includes(h));
    if (s >= 0 && q >= 0 && d >= 0) { hIdx = i; cSku = s; cQtd = q; cData = d; break; }
  }
  if (hIdx < 0) {
    return { remessas: [], erros: ['Cabeçalho não encontrado. Use as colunas: "SKU", "Quantidade Enviada" e "Data de Envio/Entrada".'], colunas: null };
  }

  const remessas: RemessaLinha[] = [];
  for (let i = hIdx + 1; i < matriz.length; i++) {
    const row = matriz[i] || [];
    const sku = normalizarSkuFull(row[cSku]);
    const qtdRaw = row[cQtd];
    const dataRaw = row[cData];
    if (!sku && (qtdRaw === "" || qtdRaw === undefined) && (dataRaw === "" || dataRaw === undefined)) continue;
    if (!sku) { erros.push(`Linha ${i + 1}: SKU vazio.`); continue; }
    const qtd = Math.round(parseNumeroFull(qtdRaw));
    if (!(qtd > 0)) { erros.push(`Linha ${i + 1} (${sku}): quantidade inválida.`); continue; }
    const data = parseDataFlex(dataRaw);
    if (!data) { erros.push(`Linha ${i + 1} (${sku}): data inválida ("${dataRaw}").`); continue; }
    remessas.push({ sku, qtdEnviada: qtd, dataEntrada: data, linhaOrigem: i + 1 });
  }
  return { remessas, erros, colunas: { sku: colLetter(cSku), qtd: colLetter(cQtd), data: colLetter(cData) } };
}

/* ------------------------------------------------------------------ */
/* FIFO por lote                                                        */
/* ------------------------------------------------------------------ */

export interface Lote {
  id: number | string;
  sku: string;
  dataEntrada: string;
  qtdEnviada: number;
  qtdRemanescente: number;
}

export interface VendaFIFO {
  idVenda: string;
  sku: string;
  dataVenda: string;
  qtd: number;
}

export interface ConsumoLote {
  loteId: number | string | null; // null = venda sem lote registrado
  idVenda: string;
  sku: string;
  dataVenda: string;
  qtd: number;
}

export interface ResultadoFIFO {
  lotes: Lote[];
  consumos: ConsumoLote[];
  semLote: Record<string, number>;
}

/**
 * FIFO: cada venda abate primeiro o lote MAIS ANTIGO que já tinha entrado até a data da venda
 * e que ainda tem saldo; se não basta, o restante sai do próximo. Vendas sem lote elegível
 * ficam em `semLote` e nunca geram saldo negativo. Idempotente (parte de remanescente = enviado).
 */
export function simularFIFO(lotesEntrada: Lote[], vendas: VendaFIFO[]): ResultadoFIFO {
  const lotes: Lote[] = lotesEntrada.map((l) => ({ ...l, sku: normalizarSkuFull(l.sku), qtdRemanescente: l.qtdEnviada }));
  const consumos: ConsumoLote[] = [];
  const semLote: Record<string, number> = {};

  const ordemLote = (a: Lote, b: Lote) =>
    a.dataEntrada < b.dataEntrada ? -1 : a.dataEntrada > b.dataEntrada ? 1 : String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

  const porSku = new Map<string, Lote[]>();
  for (const l of lotes) {
    if (!porSku.has(l.sku)) porSku.set(l.sku, []);
    porSku.get(l.sku)!.push(l);
  }
  porSku.forEach((arr) => arr.sort(ordemLote));

  const vendasOrdenadas = vendas
    .map((v) => ({ ...v, sku: normalizarSkuFull(v.sku) }))
    .sort((a, b) => (a.dataVenda < b.dataVenda ? -1 : a.dataVenda > b.dataVenda ? 1 : a.idVenda.localeCompare(b.idVenda)));

  for (const v of vendasOrdenadas) {
    let faltam = v.qtd;
    for (const l of porSku.get(v.sku) || []) {
      if (faltam <= 0) break;
      if (l.dataEntrada > v.dataVenda || l.qtdRemanescente <= 0) continue;
      const abate = Math.min(faltam, l.qtdRemanescente);
      l.qtdRemanescente -= abate;
      faltam -= abate;
      consumos.push({ loteId: l.id, idVenda: v.idVenda, sku: v.sku, dataVenda: v.dataVenda, qtd: abate });
    }
    if (faltam > 0) {
      semLote[v.sku] = (semLote[v.sku] || 0) + faltam;
      consumos.push({ loteId: null, idVenda: v.idVenda, sku: v.sku, dataVenda: v.dataVenda, qtd: faltam });
    }
  }
  return { lotes, consumos, semLote };
}

/* ------------------------------------------------------------------ */
/* Regra dos 60 dias de armazenagem                                     */
/* ------------------------------------------------------------------ */

export const TAG_COMECARA_COBRAR = "Começará cobrar estoque";
export const TAG_COBRANDO = "Armazenagem em cobrança";
export const DIAS_ALERTA_PADRAO = 50;
export const DIAS_COBRANCA_PADRAO = 60;

export type NivelArmazenagem = "OK" | "ALERTA" | "COBRANDO";

export interface AlertaArmazenagem {
  nivel: NivelArmazenagem;
  tag: string | null;
  dias: number;
  diasParaCobranca: number;
}

export function statusArmazenagem(
  dataEntradaISO: string,
  qtdRemanescente: number,
  hojeISO = hojeSaoPaulo(),
  diasAlerta = DIAS_ALERTA_PADRAO,
  diasCobranca = DIAS_COBRANCA_PADRAO
): AlertaArmazenagem {
  const dias = diffDias(dataEntradaISO, hojeISO);
  const diasParaCobranca = diasCobranca - dias;
  if (qtdRemanescente <= 0) return { nivel: "OK", tag: null, dias, diasParaCobranca };
  if (dias >= diasCobranca) return { nivel: "COBRANDO", tag: TAG_COBRANDO, dias, diasParaCobranca };
  if (dias >= diasAlerta) return { nivel: "ALERTA", tag: TAG_COMECARA_COBRAR, dias, diasParaCobranca };
  return { nivel: "OK", tag: null, dias, diasParaCobranca };
}

export interface ResumoArmazenagemSku {
  sku: string;
  saldoLotes: number;
  qtdEmAlerta: number;
  qtdCobrando: number;
  loteMaisAntigoDias: number;
  nivel: NivelArmazenagem;
  tag: string | null;
}

/** Consolida os lotes com saldo por SKU (pior nível vence). */
export function resumirArmazenagemPorSku(
  lotes: Lote[],
  hojeISO = hojeSaoPaulo(),
  diasAlerta = DIAS_ALERTA_PADRAO,
  diasCobranca = DIAS_COBRANCA_PADRAO
): Map<string, ResumoArmazenagemSku> {
  const mapa = new Map<string, ResumoArmazenagemSku>();
  const peso = { OK: 0, ALERTA: 1, COBRANDO: 2 } as const;
  for (const l of lotes) {
    if (l.qtdRemanescente <= 0) continue;
    const sku = normalizarSkuFull(l.sku);
    const st = statusArmazenagem(l.dataEntrada, l.qtdRemanescente, hojeISO, diasAlerta, diasCobranca);
    const atual =
      mapa.get(sku) || { sku, saldoLotes: 0, qtdEmAlerta: 0, qtdCobrando: 0, loteMaisAntigoDias: 0, nivel: "OK" as NivelArmazenagem, tag: null };
    atual.saldoLotes += l.qtdRemanescente;
    if (st.nivel === "ALERTA") atual.qtdEmAlerta += l.qtdRemanescente;
    if (st.nivel === "COBRANDO") atual.qtdCobrando += l.qtdRemanescente;
    atual.loteMaisAntigoDias = Math.max(atual.loteMaisAntigoDias, st.dias);
    if (peso[st.nivel] > peso[atual.nivel]) { atual.nivel = st.nivel; atual.tag = st.tag; }
    mapa.set(sku, atual);
  }
  return mapa;
}
