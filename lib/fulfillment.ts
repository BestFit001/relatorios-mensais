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

/**
 * Sufixo de Full/FBA no SKU: "-F", "-FBA" (maiúsculo ou minúsculo, ex.: 18181042001-fba).
 * Quando existe, remove o "-" e TUDO o que estiver à direita. "-FULL"/"-FINO" (palavras) não são sufixo e ficam.
 */
export function removerSufixoFba(sku: string): string {
  const bruto = String(sku ?? "").trim();
  const limpo = bruto.replace(/\s*-f(?:ba)?(?![a-z]).*$/i, "").trim();
  return limpo || bruto;
}

export function normalizarSkuFull(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  return removerSufixoFba(s.toLowerCase());
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
  data: string;
  layout: string;
}

type ChaveCol = "pedido" | "status" | "unidades" | "receita" | "total" | "sku" | "mlb" | "pdv" | "formaEntrega" | "data";

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
  ["data", (h) => h === "data de venda" || h === "data da venda"],
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
      data: achados.data || "B",
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

/* ------------------------------------------------------------------ */
/* Ritmo de vendas: "N vendas em D dias = status" (configurável por canal) */
/* ------------------------------------------------------------------ */

export interface RegraRitmo {
  id: string;
  vendas: number; // quantidade de vendas
  dias: number;   // intervalo (dias corridos) em que elas ocorrem
  status: string; // ex.: "Ótimo", "Bom"
}

export const REGRAS_RITMO_PADRAO: RegraRitmo[] = [
  { id: "r1", vendas: 10, dias: 5, status: "Ótimo" },
  { id: "r2", vendas: 5, dias: 15, status: "Bom" },
];

const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** Número do dia (dias desde 1970) a partir da data da venda. Aceita:
 *  "3 de novembro de 2026 12:30 hs." (ML), "03/11/2026", "2026-11-03", serial do Excel e Date. null se não reconhecer. */
export function parseDiaVenda(valor: any): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const dia = (a: number, m: number, d: number) => {
    if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return Math.floor(Date.UTC(a, m - 1, d) / 86400000);
  };
  if (valor instanceof Date && !isNaN(valor.getTime())) return dia(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
  if (typeof valor === "number") {
    if (valor > 30000 && valor < 80000) return Math.floor(valor) - 25569; // serial do Excel
    return null;
  }
  const t = normTexto(valor);
  let m = t.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (m && MESES_PT[m[2]]) return dia(+m[3], MESES_PT[m[2]], +m[1]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return dia(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return dia(+m[1], +m[2], +m[3]);
  return null;
}

/** Maior número de vendas em qualquer janela de `dias` dias corridos seguidos. */
export function maxVendasEmJanela(vendasPorDia: Map<number, number>, dias: number): number {
  const d = Math.max(1, Math.floor(dias));
  const lista = Array.from(vendasPorDia.entries()).sort((a, b) => a[0] - b[0]);
  let melhor = 0, soma = 0, ini = 0;
  for (let fim = 0; fim < lista.length; fim++) {
    soma += lista[fim][1];
    while (lista[fim][0] - lista[ini][0] >= d) { soma -= lista[ini][1]; ini++; }
    if (soma > melhor) melhor = soma;
  }
  return melhor;
}

export interface ResultadoRitmo {
  status: string;
  /** índice da regra atingida (0 = a primeira da lista); -1 = nenhuma; -2 = sem vendas */
  nivel: number;
  /** true quando usou as datas das vendas; false quando comparou proporcionalmente ao mês */
  porData: boolean;
  /** maior nº de vendas na janela da regra atingida (ou projeção proporcional) */
  vendasNaJanela: number;
}

/**
 * Classifica o SKU pela PRIMEIRA regra da lista que ele atingir (a ordem é a prioridade).
 * Com datas: precisa ter ocorrido `vendas` em algum intervalo de `dias` dias.
 * Sem datas: compara o ritmo médio do mês (vendas do mês ÷ dias do mês) com o da regra.
 */
export function classificarRitmo(
  regras: RegraRitmo[],
  qtdTotal: number,
  vendasPorDia: Map<number, number> | null,
  diasDoMes: number,
  rotuloAbaixo = "Abaixo da meta",
  rotuloSemVendas = "Sem vendas"
): ResultadoRitmo {
  const porData = !!vendasPorDia && vendasPorDia.size > 0;
  if (qtdTotal <= 0) return { status: rotuloSemVendas, nivel: -2, porData, vendasNaJanela: 0 };
  const validas = regras.filter((r) => r.vendas > 0 && r.dias > 0 && String(r.status || "").trim() !== "");
  for (let i = 0; i < validas.length; i++) {
    const r = validas[i];
    const naJanela = porData ? maxVendasEmJanela(vendasPorDia as Map<number, number>, r.dias) : (qtdTotal / Math.max(1, diasDoMes)) * r.dias;
    if (naJanela >= r.vendas) return { status: r.status.trim(), nivel: i, porData, vendasNaJanela: Math.round(naJanela * 10) / 10 };
  }
  return { status: rotuloAbaixo, nivel: -1, porData, vendasNaJanela: 0 };
}

export function diasDoMesRef(mesRef: string): number {
  const [mm, aaaa] = mesRef.split("/").map(Number);
  if (!mm || !aaaa) return 30;
  return new Date(aaaa, mm, 0).getDate();
}


// ---------------------------------------------------------------------------------------------
// Identificação opcional do Full dentro da planilha de vendas
// ---------------------------------------------------------------------------------------------

/**
 * Planilhas de vendas podem misturar Full e envio normal. Se o canal definiu uma coluna e um texto
 * (ex.: coluna AS contém "fulfillment"), só essas linhas são Full.
 *  - modo "incluir" (aba Full): mantém apenas as linhas que contêm o texto;
 *  - modo "excluir" (aba Logística Própria): descarta as linhas que contêm o texto.
 * Sem coluna ou sem texto => nada é filtrado (tudo vale). Pacotes do ML ("Pacote de N produtos")
 * são decididos pela linha-mãe e levam os N itens junto. Linhas descartadas viram objeto vazio (posições preservadas).
 */
export function aplicarFiltroFull(
  matriz: any[], linhaInicial: number, colStatus: string, colId: string, texto: string, modo: "incluir" | "excluir"
): { matriz: any[]; ignoradas: number; mantidas: number } {
  const col = String(colId || "").trim().toUpperCase();
  const alvo = normTexto(texto);
  if (!col || !alvo) return { matriz, ignoradas: 0, mantidas: 0 };

  const cs = String(colStatus || "").trim().toUpperCase();
  const casa = (row: any) => normTexto(row?.[col]).includes(alvo);
  const manter = (row: any) => (modo === "incluir" ? casa(row) : !casa(row));
  const saida = matriz.slice();
  let ignoradas = 0, mantidas = 0;

  let r = Math.max(0, linhaInicial);
  while (r < saida.length) {
    const row = saida[r];
    if (!row) { r++; continue; }
    const pacote = cs ? String(row[cs] || "").trim().match(/^pacote\s*(?:de)?\s*(\d+)/i) : null;
    if (pacote) {
      const n = parseInt(pacote[1], 10);
      const ok = manter(row);
      for (let k = 0; k <= n && r + k < saida.length; k++) {
        if (!ok) { saida[r + k] = {}; ignoradas += k > 0 ? 1 : 0; } else if (k > 0) mantidas++;
      }
      r += n + 1;
      continue;
    }
    if (manter(row)) mantidas++; else { saida[r] = {}; ignoradas++; }
    r++;
  }
  return { matriz: saida, ignoradas, mantidas };
}

// ---------------------------------------------------------------------------------------------
// Leitura de arquivos em qualquer formato (xlsx, xls, ods, csv, txt, tsv...)
// ---------------------------------------------------------------------------------------------

export function indiceParaLetras(i: number): string {
  let n = i + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Texto delimitado (csv/txt/tsv, vírgula, ponto e vírgula, tab ou barra |) para linhas no formato { A: .., B: .. }. */
export function textoParaMatriz(texto: string): any[] {
  const limpo = texto.replace(/^﻿/, "");
  const amostra = limpo.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 12);
  const candidatos = ["\t", ";", "|", ","];
  let delim = ",", melhor = 0;
  for (const d of candidatos) {
    const media = amostra.length ? amostra.reduce((a, l) => a + (l.split(d).length - 1), 0) / amostra.length : 0;
    if (media > melhor) { melhor = media; delim = d; }
  }

  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i];
    if (aspas) {
      if (ch === '"') { if (limpo[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === delim) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      linhas.push(linha); linha = [];
    } else campo += ch;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }

  return linhas.map((cols) => {
    const o: any = {};
    cols.forEach((v, i) => { o[indiceParaLetras(i)] = v.trim(); });
    return o;
  });
}

/** Decide se o conteúdo é uma planilha binária (xlsx/zip, xls antigo) ou texto delimitado. */
export function ehPlanilhaBinaria(bytes: Uint8Array): boolean {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return true;                                   // PK (xlsx, xlsm, ods)
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return true; // xls (OLE)
  return false;
}

export function decodificarTexto(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}
