// Vendas de live: lê as linhas da planilha de vendas do canal (a mesma que alimenta o dashboard) e monta os registros da
// tabela vendas_lives_separadas. Usado pelo upload de vendas (Uploads) e pela aba Lives. Funções puras, sem React nem banco.
import { avaliarFormulaLive, letrasDaFormula } from "./formulaLive";

export const PADRAO_COL_MODAL = "BG";
export const PADRAO_COL_VENDEDOR = "BH";
export const PADRAO_TEXTO_LIVE = "live";

export function colunaParaIndice(letra: string): number {
  const l = String(letra || "").trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(l)) return -1;
  let num = 0;
  for (let i = 0; i < l.length; i++) num = num * 26 + (l.charCodeAt(i) - 64);
  return num - 1;
}

export function normalizarSkuLive(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "");
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  if (/e\+/i.test(s)) {
    try { s = BigInt(Math.trunc(Number(s))).toString(); } catch { /* mantém o texto */ }
  }
  return s.toLowerCase();
}

export function parseNumeroBruto(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/BRL/g, "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

export function formatarDataCurta(dataStr: any): string {
  if (!dataStr) return "";
  const s = String(dataStr).trim();
  if (s.includes("/")) return s.split(" ")[0];
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
  } catch { /* cai no texto */ }
  return s.split(" ")[0];
}

/** Texto de uma célula de data: aceita texto, data do Excel (número) e Date. */
export function textoDaData(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  const p = (n: number) => String(n).padStart(2, "0");
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }
  return String(v).trim();
}

const semAcento = (v: any) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export interface ConfigLives {
  canal: string;                       // canal das Regras usado nas lives (ex.: TikTok)
  colSku: string; colStatus: string; colValorPago: string; colPdv: string; colRebate: string; colData: string; colNomeProduto: string;
  colModal: string; colVendedor: string;
  textoLive: string;                   // o que identifica "live" na coluna do modal (vários termos separados por vírgula)
  imposto: number; comissao: number;   // %
  formula: string; letraPreco: string; // fórmula de taxas/tarifas da aba Regras e a letra que representa o preço nela
  mapaExtras: Record<string, string>;  // letra da fórmula -> coluna da planilha (vazio = a mesma letra)
}

/** Monta a configuração a partir de config_regras_tiny (campos live_*) e das regras de canais (config_regras_canais). */
export function montarConfigLives(
  linhasConfig: { campo: string; coluna: any }[] | null | undefined,
  regras: { canal: string; formula_excel?: string; col_pdv?: string }[] | null | undefined,
): ConfigLives {
  const c: Record<string, string> = {};
  const mapaExtras: Record<string, string> = {};
  for (const l of linhasConfig || []) {
    const campo = String(l.campo || "");
    const v = String(l.coluna ?? "").trim();
    if (campo.startsWith("live_map_")) { if (v) mapaExtras[campo.replace("live_map_", "").toUpperCase()] = v.toUpperCase(); }
    else c[campo] = v;
  }
  const canal = c.live_canal_regras || "TikTok";
  const regra = (regras || []).find((r) => semAcento(r.canal) === semAcento(canal));
  const formula = String(regra?.formula_excel || "").trim();
  const colPdvRegra = String(regra?.col_pdv || "").trim().toUpperCase();
  let letraPreco = "";
  if (/^[A-Z]{1,2}$/.test(colPdvRegra)) letraPreco = colPdvRegra;
  else { const m = formula.match(/\b([A-Za-z]{1,2})\d*\b/); letraPreco = m ? m[1].toUpperCase() : ""; }
  return {
    canal,
    colSku: (c.live_col_sku || "H").toUpperCase(),
    colStatus: (c.live_col_status || "C").toUpperCase(),
    colValorPago: (c.live_col_repasse || "X").toUpperCase(),
    colPdv: (c.live_col_pdv || "N").toUpperCase(),
    colRebate: (c.live_col_rebate || "").toUpperCase(),
    colData: (c.live_col_data || "AD").toUpperCase(),
    colNomeProduto: "I",
    colModal: (c.live_col_modal || PADRAO_COL_MODAL).toUpperCase(),
    colVendedor: (c.live_col_vendedor || PADRAO_COL_VENDEDOR).toUpperCase(),
    textoLive: c.live_texto_modal || PADRAO_TEXTO_LIVE,
    imposto: parseFloat(c.live_imposto || "9") || 0,
    comissao: parseFloat(c.live_comissao || "14") || 0,
    formula, letraPreco, mapaExtras,
  };
}

/** O canal da linha de venda é o canal das lives? */
export function ehCanalDasLives(cfg: ConfigLives, canal: string): boolean {
  return semAcento(canal) === semAcento(cfg.canal);
}

/** O texto do modal de venda indica live? (contém algum dos termos, sem diferenciar maiúsculas e acentos) */
export function ehModalLive(modal: any, textoLive: string): boolean {
  const m = semAcento(modal);
  if (!m) return false;
  const termos = String(textoLive || "").split(/[,;|]/).map(semAcento).filter(Boolean);
  return termos.length > 0 && termos.some((t) => m.includes(t));
}

export interface LinhaLive {
  sku: string; status: string; valorPago: number; variaveis: Record<string, number>; rebate: number; pdv: number;
  data: string; productName: string; modal: string; vendedor: string;
}

/** Lê uma linha da planilha de vendas com as colunas configuradas para as lives. */
export function lerLinhaLive(row: any[], cfg: ConfigLives): LinhaLive {
  const at = (letra: string) => { const i = colunaParaIndice(letra); return i >= 0 ? row[i] : undefined; };
  const variaveis: Record<string, number> = {};
  letrasDaFormula(cfg.formula).filter((l) => l !== cfg.letraPreco).forEach((l) => {
    variaveis[l] = parseNumeroBruto(at(cfg.mapaExtras[l] || l));   // letra da fórmula = coluna da própria planilha de vendas
  });
  return {
    sku: String(at(cfg.colSku) ?? "").trim(),
    status: String(at(cfg.colStatus) ?? "").trim(),
    valorPago: parseNumeroBruto(at(cfg.colValorPago)),
    variaveis,
    rebate: cfg.colRebate ? Math.max(0, parseNumeroBruto(at(cfg.colRebate))) : 0,
    pdv: parseNumeroBruto(at(cfg.colPdv)),
    data: textoDaData(at(cfg.colData)),
    productName: String(at(cfg.colNomeProduto) ?? "Produto Live").trim(),
    modal: String(at(cfg.colModal) ?? "").trim(),
    vendedor: String(at(cfg.colVendedor) ?? "").trim(),
  };
}

/** Repasse sem rebate: valor pago menos taxas e tarifas (fórmula da aba Regras). Sem fórmula = o próprio valor pago. */
export function repasseDaFormulaLive(cfg: ConfigLives, valorPago: number, variaveis: Record<string, number>): number {
  if (!cfg.formula) return valorPago;
  const r = avaliarFormulaLive(cfg.formula, (l) => (l === cfg.letraPreco ? valorPago : Number(variaveis[l]) || 0), valorPago, 1);
  return r === null ? valorPago : r;
}

/** Registro da tabela vendas_lives_separadas (os mesmos cálculos que a aba Lives fazia ao subir a planilha). */
export function montarRegistroLive(
  l: LinhaLive, cfg: ConfigLives, custo: { custo_unitario?: any; custo?: any; produto?: string; descricao?: string } | undefined,
) {
  const custoUnit = custo ? parseNumeroBruto(custo.custo_unitario ?? custo.custo ?? 0) : 0;
  const nomeProd = custo ? (custo.produto || custo.descricao || l.productName) : l.productName;
  const repasse = repasseDaFormulaLive(cfg, l.valorPago, l.variaveis) + (l.rebate || 0);
  const imposto = l.valorPago * (cfg.imposto / 100);
  const comissao = l.valorPago * (cfg.comissao / 100);
  const liquidez = repasse - custoUnit - imposto - comissao;
  const vPdv = l.pdv > 0 ? l.pdv : l.valorPago;
  return {
    sku: l.sku,
    nome_produto: nomeProd,
    repasse,
    valor_pago: l.valorPago,
    rebate: l.rebate || 0,
    variaveis: l.variaveis,
    pdv: vPdv,
    custo: custoUnit,
    imposto,
    comissao_vendedora: comissao,
    liquidez,
    percentual_lucro_pdv: vPdv > 0 ? (liquidez / vPdv) * 100 : 0,
    data_venda: formatarDataCurta(l.data),
    data_hora: l.data,
    status: l.status,
    modal_venda: l.modal,
    vendedor: l.vendedor,
  };
}

// ---------------------------------------------------------------- coluna de data e hora do pedido
const ehDataTexto = (t: string) => /^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}/.test(t) || /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(t);
const temHoraTexto = (t: string) => /\d{1,2}:\d{2}/.test(t);
const indiceParaLetra = (i: number) => { let s = ""; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/**
 * Acha a coluna com a data e a hora do pedido na planilha de vendas. Confia na letra configurada quando ela realmente traz datas;
 * se vier vazia ou com outra coisa, procura pelo título da coluna (pagamento, criação, data, hora...) e, por último, pelo conteúdo.
 */
export function detectarColunaDataLive(linhas: any[][], letraConfigurada: string): { letra: string; origem: "configurada" | "titulo" | "conteudo" | "nenhuma"; temHora: boolean } {
  const corpo = (linhas || []).slice(1, 401).filter((l) => Array.isArray(l) && l.some((c) => String(c ?? "").trim() !== ""));
  if (corpo.length === 0) return { letra: letraConfigurada, origem: "nenhuma", temHora: false };
  const largura = Math.max(...corpo.map((l) => l.length), (linhas[0] || []).length);
  const stats = Array.from({ length: largura }, (_, i) => {
    let datas = 0, horas = 0;
    for (const l of corpo) {
      const v = l[i];
      const ehSerial = typeof v === "number" && v > 30000 && v < 70000;
      const t = textoDaData(v);
      if (ehSerial || (typeof v !== "number" && ehDataTexto(t))) { datas++; if (temHoraTexto(t)) horas++; }
    }
    return { datas, horas, razao: datas / corpo.length };
  });
  const ok = (i: number) => i >= 0 && i < stats.length && stats[i].razao >= 0.5;
  const iCfg = colunaParaIndice(letraConfigurada);
  if (ok(iCfg)) return { letra: indiceParaLetra(iCfg), origem: "configurada", temHora: stats[iCfg].horas > 0 };

  const cab = (linhas[0] || []).map((c: any) => semAcento(c));
  const prioridades = [/pag|paid|payment/, /cria|creat|order time|hora do pedido|data do pedido|pedido/, /data|date|time|hora|hour/];
  for (const re of prioridades) {
    const achadas = cab.map((c, i) => (re.test(c) && ok(i) ? i : -1)).filter((i) => i >= 0);
    if (achadas.length) {
      const melhor = achadas.sort((a, b) => stats[b].horas - stats[a].horas)[0];
      return { letra: indiceParaLetra(melhor), origem: "titulo", temHora: stats[melhor].horas > 0 };
    }
  }
  let melhor = -1;
  stats.forEach((s, i) => { if (s.razao >= 0.8 && (melhor < 0 || s.horas > stats[melhor].horas)) melhor = i; });
  if (melhor >= 0) return { letra: indiceParaLetra(melhor), origem: "conteudo", temHora: stats[melhor].horas > 0 };
  return { letra: letraConfigurada, origem: "nenhuma", temHora: false };
}
