/**
 * Fulfillment (Mercado Envios Full) — regras puras, sem React/Supabase.
 *
 *  - detecção das colunas do relatório de vendas do ML pelo NOME do cabeçalho
 *    (exportações de 66 e 67 colunas deslocam as letras)
 *  - status "cancelado" (coluna D) => a venda deixa de existir: sai PDV e custo
 *  - fórmula de repasse dos canais fora do ML (mesma da aba Regras)
 *  - lotes enviados ao Full: FIFO e alerta de armazenagem (aviso a partir de 90 dias, cobrança em 120)
 */

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

export function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function diffDias(deISO: string, ateISO: string): number {
  const a = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10));
  const b = Date.UTC(+ateISO.slice(0, 4), +ateISO.slice(5, 7) - 1, +ateISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/* ------------------------------------------------------------------ */
/* Status da venda (coluna D do relatório)                              */
/* ------------------------------------------------------------------ */

/**
 * Venda cancelada/devolvida: não é venda. Remove PDV (receita) e custo do produto.
 * "Te demos o dinheiro" (mediação ganha pelo vendedor) continua sendo venda.
 */
export function statusCancelado(status: any): boolean {
  const s = normTexto(status);
  if (!s) return false;
  if (s.includes("troca")) return false; // troca tem tratamento próprio no motor
  if (s.includes("te demos o dinheiro")) return false;
  return (
    s.includes("cancelad") ||
    s.includes("voce cancelou") ||
    s.includes("nao envie") ||
    s.includes("devolu") ||
    s.includes("reembols") ||
    s.includes("mediacao") ||
    s.includes("reclam")
  );
}

/* ------------------------------------------------------------------ */
/* Colunas do relatório de vendas do ML                                 */
/* ------------------------------------------------------------------ */

export interface MapaColunasML {
  linhaInicial: number;
  pedido: string;
  status: string;
  unidades: string;
  receita: string;
  total: string;
  sku: string;
  mlb: string;
  pdv: string;
  formaEntrega: string;
  layout: string;
}

type ChaveCol = "pedido" | "status" | "unidades" | "receita" | "total" | "sku" | "mlb" | "pdv" | "formaEntrega";

const CABECALHOS_ML: Array<[ChaveCol, (h: string) => boolean]> = [
  ["pedido", (h) => h.startsWith("n.") && h.includes("de venda")],
  ["status", (h) => h === "estado"],
  ["unidades", (h) => h === "unidades"],
  ["receita", (h) => h.startsWith("receita por produtos")],
  ["total", (h) => h.startsWith("total (")],
  ["sku", (h) => h === "sku"],
  ["mlb", (h) => h.startsWith("# de anuncio")],
  ["pdv", (h) => h.startsWith("preco unitario de venda")],
  ["formaEntrega", (h) => h === "forma de entrega"],
];

/**
 * Entrada: XLSX.utils.sheet_to_json(ws, { header: "A", defval: "" }).
 * Saída: letras das colunas (as MESMAS que a página já pede) lidas pelo cabeçalho.
 */
export function detectarColunasML(matriz: Array<Record<string, any>>): MapaColunasML | null {
  for (let i = 0; i < Math.min(matriz.length, 40); i++) {
    const row = matriz[i];
    if (!row) continue;
    const entradas = Object.entries(row);
    if (!entradas.some(([, v]) => { const h = normTexto(v); return h.startsWith("n.") && h.includes("de venda"); })) continue;

    const achados: Partial<Record<ChaveCol, string>> = {};
    for (const [letra, valor] of entradas) {
      const h = normTexto(valor);
      if (!h) continue;
      for (const [chave, teste] of CABECALHOS_ML) {
        if (achados[chave] === undefined && teste(h)) achados[chave] = letra;
      }
    }
    if (!achados.pedido || !achados.sku || !achados.status || !achados.pdv) return null;
    const temTroca = entradas.some(([, v]) => normTexto(v).startsWith("custo de envio por troca"));
    return {
      linhaInicial: i + 2,
      pedido: achados.pedido,
      status: achados.status,
      unidades: achados.unidades || "H",
      receita: achados.receita || "I",
      total: achados.total || "T",
      sku: achados.sku,
      mlb: achados.mlb || "Y",
      pdv: achados.pdv,
      formaEntrega: achados.formaEntrega || "AS",
      layout: temTroca ? "67 colunas" : "66 colunas",
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Fórmula de repasse dos canais fora do ML (igual à aba Regras)         */
/* ------------------------------------------------------------------ */

/** Ex.: "PDV - (PDV * 12%)". Variáveis: PDV e QTD (ou as letras das colunas). Retorna null se inválida. */
export function avaliarFormulaCanal(formula: string, pdv: number, qtd: number, colPdv?: string, colQtd?: string): number | null {
  if (!formula || !formula.trim()) return null;
  try {
    let exp = formula.trim();
    exp = exp.replace(/\bPDV\b/gi, String(pdv));
    exp = exp.replace(/\bQTD\b/gi, String(qtd));
    exp = exp.replace(/\bQUANTIDADE\b/gi, String(qtd));
    if (colPdv && colPdv.trim()) exp = exp.replace(new RegExp(`\\b${colPdv.trim()}\\b`, "gi"), String(pdv));
    if (colQtd && colQtd.trim()) exp = exp.replace(new RegExp(`\\b${colQtd.trim()}\\b`, "gi"), String(qtd));
    exp = exp.replace(/(\d+(\.\d+)?)%/g, "($1 / 100)");
    if (/^[0-9+\-*/().\s><=?:!&|]+$/.test(exp)) {
      const calc = Function(`"use strict"; return (${exp})`)();
      if (typeof calc === "number" && !isNaN(calc) && calc >= 0) return calc;
    }
  } catch {
    /* fórmula inválida */
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Armazenagem: aviso a partir de 90 dias, cobrança em 120               */
/* ------------------------------------------------------------------ */

export const DIAS_ALERTA_PADRAO = 90;
export const DIAS_COBRANCA_PADRAO = 120;

export type NivelArmazenagem = "OK" | "ALERTA" | "COBRANDO";

export interface AlertaArmazenagem {
  nivel: NivelArmazenagem;
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
  if (qtdRemanescente <= 0) return { nivel: "OK", dias, diasParaCobranca };
  if (dias >= diasCobranca) return { nivel: "COBRANDO", dias, diasParaCobranca };
  if (dias >= diasAlerta) return { nivel: "ALERTA", dias, diasParaCobranca };
  return { nivel: "OK", dias, diasParaCobranca };
}

/** Texto do aviso: "Começará cobrar estoque — faltam 12 dias para 120" */
export function textoAlertaArmazenagem(nivel: NivelArmazenagem, diasParaCobranca: number, diasCobranca = DIAS_COBRANCA_PADRAO): string {
  if (nivel === "COBRANDO") return "Armazenagem em cobrança";
  if (nivel === "ALERTA") {
    const n = Math.max(0, diasParaCobranca);
    return `Começará cobrar estoque — ${n === 1 ? "falta 1 dia" : `faltam ${n} dias`} para ${diasCobranca}`;
  }
  return "";
}

export interface Lote {
  id: number | string;
  sku: string;
  dataEntrada: string; // AAAA-MM-DD
  qtdEnviada: number;
  qtdRemanescente: number;
}

export interface ResumoArmazenagemSku {
  sku: string;
  saldoLotes: number;
  qtdEmAlerta: number;
  qtdCobrando: number;
  loteMaisAntigoDias: number;
  diasParaCobranca: number; // do lote mais crítico
  nivel: NivelArmazenagem;
}

/** Consolida por SKU os lotes que ainda têm saldo (o pior nível vence). */
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
      mapa.get(sku) || { sku, saldoLotes: 0, qtdEmAlerta: 0, qtdCobrando: 0, loteMaisAntigoDias: 0, diasParaCobranca: 9999, nivel: "OK" as NivelArmazenagem };
    atual.saldoLotes += l.qtdRemanescente;
    if (st.nivel === "ALERTA") atual.qtdEmAlerta += l.qtdRemanescente;
    if (st.nivel === "COBRANDO") atual.qtdCobrando += l.qtdRemanescente;
    atual.loteMaisAntigoDias = Math.max(atual.loteMaisAntigoDias, st.dias);
    atual.diasParaCobranca = Math.min(atual.diasParaCobranca, st.diasParaCobranca);
    if (peso[st.nivel] > peso[atual.nivel]) atual.nivel = st.nivel;
    mapa.set(sku, atual);
  }
  return mapa;
}

/* ------------------------------------------------------------------ */
/* FIFO por lote com vendas mensais (espelha fulfillment_recalcular_fifo) */
/* ------------------------------------------------------------------ */

export interface VendaMensal {
  sku: string;
  mes: string; // "MM/AAAA"
  qtd: number;
}

/**
 * As vendas de cada mês (já sem cancelados) abatem primeiro o lote mais antigo que
 * tinha entrado até o fim daquele mês. Venda sem lote elegível não gera saldo negativo.
 */
export function simularFIFOMensal(lotesEntrada: Lote[], vendas: VendaMensal[]): { lotes: Lote[]; semLote: Record<string, number> } {
  const lotes: Lote[] = lotesEntrada.map((l) => ({ ...l, sku: normalizarSkuFull(l.sku), qtdRemanescente: l.qtdEnviada }));
  const semLote: Record<string, number> = {};
  const fimDoMes = (mes: string) => {
    const [mm, aaaa] = mes.split("/").map(Number);
    return `${aaaa}-${String(mm).padStart(2, "0")}-${String(new Date(aaaa, mm, 0).getDate()).padStart(2, "0")}`;
  };
  const chaveMes = (mes: string) => { const [mm, aaaa] = mes.split("/"); return `${aaaa}-${mm.padStart(2, "0")}`; };

  const ordenadas = vendas
    .map((v) => ({ ...v, sku: normalizarSkuFull(v.sku) }))
    .sort((a, b) => (chaveMes(a.mes) < chaveMes(b.mes) ? -1 : chaveMes(a.mes) > chaveMes(b.mes) ? 1 : 0));

  for (const v of ordenadas) {
    let faltam = v.qtd;
    const limite = fimDoMes(v.mes);
    const candidatos = lotes
      .filter((l) => l.sku === v.sku && l.dataEntrada <= limite && l.qtdRemanescente > 0)
      .sort((a, b) => (a.dataEntrada < b.dataEntrada ? -1 : a.dataEntrada > b.dataEntrada ? 1 : String(a.id).localeCompare(String(b.id), undefined, { numeric: true })));
    for (const l of candidatos) {
      if (faltam <= 0) break;
      const abate = Math.min(faltam, l.qtdRemanescente);
      l.qtdRemanescente -= abate;
      faltam -= abate;
    }
    if (faltam > 0) semLote[v.sku] = (semLote[v.sku] || 0) + faltam;
  }
  return { lotes, semLote };
}
