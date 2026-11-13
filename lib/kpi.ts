// KPIs e variável dos analistas (espelha a planilha "KPI E-C - Equipe Nova"), calculados a partir dos números do próprio app.
// Funções puras: a tela (app/kpi/page.tsx) busca os dados, lib/kpiCalculo.ts monta os números de cada mês e este arquivo aplica as regras de pontuação.
//
// Regras da planilha:
//  - cada KPI tem um peso; o valor pago do KPI = variável-base × peso × fator da faixa atingida;
//  - faixas: bateu a meta (fator 1), ou 95%/90% dela (margem: 98%/95%) paga o fator correspondente; abaixo da última faixa, zero;
//  - redutor: a taxa de cancelamento reduz o total (até 3,5% sem redutor; até 4,5% −20%; até 5,5% −50%; acima disso −100%).

export interface FaixaRedutor { ate: number | null; reducao: number }
export interface KpiConfig {
  /** meses (AAAA-MM) que o ciclo cobre */
  periodo: { inicio: string; fim: string };
  metaRoas: number;
  /** meta de margem líquida (%) usada quando o mês não tem uma definida */
  margemPadrao: number;
  /** pesos em % (somam 100) */
  pesos: { receitaTotal: number; roas: number; margem: number; faturadoCanais: number };
  /** fatores pagos por faixa, do maior para o menor (1 = bateu a meta) */
  faixas: { receita: number[]; roas: number[]; margem: number[]; faturado: number[] };
  redutor: FaixaRedutor[];
  /** canais que não entram na taxa de cancelamento (chave normalizada, ex.: "magalu") */
  canaisForaCancelamento: string[];
  /** true: a receita dos SKUs fora do cálculo continua contando na meta de faturamento (só a margem os ignora) */
  contarReceitaSkusExcluidos: boolean;
  analistas: Record<string, { variavelBase?: number; cargo?: string }>;
}

export const CONFIG_PADRAO: KpiConfig = {
  periodo: { inicio: "2026-09", fim: "2026-12" },
  metaRoas: 15,
  margemPadrao: 15,
  pesos: { receitaTotal: 10, roas: 20, margem: 35, faturadoCanais: 35 },
  faixas: { receita: [1, 0.95, 0.9], roas: [1, 0.95, 0.9], margem: [1, 0.98, 0.95], faturado: [1, 0.95, 0.9] },
  redutor: [{ ate: 3.5, reducao: 0 }, { ate: 4.5, reducao: 0.2 }, { ate: 5.5, reducao: 0.5 }, { ate: null, reducao: 1 }],
  canaisForaCancelamento: ["magalu"],
  contarReceitaSkusExcluidos: true,
  analistas: {},
};

/** Variável-base que a planilha usava para cada pessoa (sugestão enquanto o admin não definir). */
export function variavelBaseSugerida(nome: string): number {
  const n = String(nome || "").toLowerCase();
  if (n.includes("gabi")) return 1166.67;
  return 1000;
}

const num = (v: any, padrao: number) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : padrao; };
const faixasValidas = (v: any, padrao: number[]) => (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number" && x > 0 && x <= 1) ? [...v].sort((a, b) => b - a) : padrao);

/** Lê a configuração salva (JSON) completando o que faltar com o padrão. */
export function lerConfig(bruto: any): KpiConfig {
  let j: any = {};
  try { j = typeof bruto === "string" ? JSON.parse(bruto) : bruto || {}; } catch { j = {}; }
  const d = CONFIG_PADRAO;
  const mes = (v: any, p: string) => (/^\d{4}-\d{2}$/.test(String(v || "")) ? String(v) : p);
  const redutor: FaixaRedutor[] = Array.isArray(j.redutor) && j.redutor.length
    ? j.redutor.map((f: any) => ({ ate: f?.ate === null || f?.ate === undefined ? null : num(f.ate, 0), reducao: Math.min(1, Math.max(0, num(f?.reducao, 0))) }))
    : d.redutor;
  return {
    periodo: { inicio: mes(j.periodo?.inicio, d.periodo.inicio), fim: mes(j.periodo?.fim, d.periodo.fim) },
    metaRoas: num(j.metaRoas, d.metaRoas),
    margemPadrao: num(j.margemPadrao, d.margemPadrao),
    pesos: {
      receitaTotal: num(j.pesos?.receitaTotal, d.pesos.receitaTotal), roas: num(j.pesos?.roas, d.pesos.roas),
      margem: num(j.pesos?.margem, d.pesos.margem), faturadoCanais: num(j.pesos?.faturadoCanais, d.pesos.faturadoCanais),
    },
    faixas: {
      receita: faixasValidas(j.faixas?.receita, d.faixas.receita), roas: faixasValidas(j.faixas?.roas, d.faixas.roas),
      margem: faixasValidas(j.faixas?.margem, d.faixas.margem), faturado: faixasValidas(j.faixas?.faturado, d.faixas.faturado),
    },
    redutor,
    canaisForaCancelamento: Array.isArray(j.canaisForaCancelamento) ? j.canaisForaCancelamento.map(String) : d.canaisForaCancelamento,
    contarReceitaSkusExcluidos: j.contarReceitaSkusExcluidos === undefined ? d.contarReceitaSkusExcluidos : !!j.contarReceitaSkusExcluidos,
    analistas: j.analistas && typeof j.analistas === "object" ? j.analistas : {},
  };
}

// ---------------------------------------------------------------- meses
export function mesesDoCiclo(p: { inicio: string; fim: string }): string[] {
  const out: string[] = [];
  let [a, m] = p.inicio.split("-").map(Number);
  const [fa, fm] = p.fim.split("-").map(Number);
  while ((a < fa || (a === fa && m <= fm)) && out.length < 36) { out.push(`${a}-${String(m).padStart(2, "0")}`); if (++m > 12) { m = 1; a++; } }
  return out;
}

// ---------------------------------------------------------------- SKUs fora do cálculo
export interface SkuExcluido { sku: string; /** vale a partir deste mês (AAAA-MM) */ de: string; /** até este mês, inclusive (vazio = sem fim) */ ate?: string; motivo?: string }
export function lerSkusExcluidos(bruto: any): SkuExcluido[] {
  let j: any = [];
  try { j = typeof bruto === "string" ? JSON.parse(bruto) : bruto || []; } catch { j = []; }
  return Array.isArray(j) ? j.filter((x) => x && String(x.sku || "").trim() && /^\d{4}-\d{2}$/.test(String(x.de || ""))).map((x) => ({ sku: String(x.sku).trim(), de: String(x.de), ate: /^\d{4}-\d{2}$/.test(String(x.ate || "")) ? String(x.ate) : undefined, motivo: x.motivo ? String(x.motivo) : undefined })) : [];
}
export const skuExcluidoNoMes = (e: SkuExcluido, mes: string) => mes >= e.de && (!e.ate || mes <= e.ate);

/** Separa o que o admin colou (um SKU por linha, ou separados por vírgula, ponto e vírgula, tab ou espaço). */
export function separarSkus(texto: string): string[] {
  return Array.from(new Set(String(texto || "").split(/[\n\r,;\t ]+/).map((s) => s.trim()).filter(Boolean)));
}

// ---------------------------------------------------------------- dados de entrada
export interface DadosCanalMes {
  chave: string; canal: string;
  metaReceita: number;
  /** faturamento já abatido de devoluções e cancelamentos */
  faturado: number;
  /** base da margem (sem os SKUs fora do cálculo) */
  brutoMargem: number; lucroMargem: number;
  /** margem sem tirar os SKUs (só para mostrar o efeito do ajuste) */
  brutoReal: number; lucroReal: number;
  adsRetorno: number; adsInvest: number;
  pedidosTotais: number; pedidosCancelados: number;
  /** meta de margem (%) deste mês */
  margemMeta: number;
}
export interface DadosMes { mes: string; metaEmpresa: number; faturadoEmpresa: number; canais: DadosCanalMes[] }
export interface DadosPeriodo { meses: string[]; metaEmpresa: number; faturadoEmpresa: number; canais: DadosCanalMes[] }

/** Soma vários meses num só bloco. A meta de margem acumulada é a média das metas dos meses, ponderada pelas vendas de cada um. */
export function somarMeses(lista: DadosMes[]): DadosPeriodo {
  const mapa = new Map<string, DadosCanalMes & { _pm: number; _pmBase: number }>();
  lista.forEach((m) => m.canais.forEach((c) => {
    const e = mapa.get(c.chave) || { ...c, metaReceita: 0, faturado: 0, brutoMargem: 0, lucroMargem: 0, brutoReal: 0, lucroReal: 0, adsRetorno: 0, adsInvest: 0, pedidosTotais: 0, pedidosCancelados: 0, margemMeta: 0, _pm: 0, _pmBase: 0 };
    e.metaReceita += c.metaReceita; e.faturado += c.faturado; e.brutoMargem += c.brutoMargem; e.lucroMargem += c.lucroMargem;
    e.brutoReal += c.brutoReal; e.lucroReal += c.lucroReal; e.adsRetorno += c.adsRetorno; e.adsInvest += c.adsInvest;
    e.pedidosTotais += c.pedidosTotais; e.pedidosCancelados += c.pedidosCancelados;
    const peso = c.brutoMargem > 0 ? c.brutoMargem : 0;
    e._pm += c.margemMeta * peso; e._pmBase += peso;
    if (!e._pmBase) e.margemMeta = c.margemMeta;
    mapa.set(c.chave, e);
  }));
  const canais = Array.from(mapa.values()).map(({ _pm, _pmBase, ...c }) => ({ ...c, margemMeta: _pmBase > 0 ? _pm / _pmBase : c.margemMeta }));
  return { meses: lista.map((m) => m.mes), metaEmpresa: lista.reduce((s, m) => s + m.metaEmpresa, 0), faturadoEmpresa: lista.reduce((s, m) => s + m.faturadoEmpresa, 0), canais };
}

// ---------------------------------------------------------------- pontuação
/** Maior faixa alcançada: devolve o fator pago (0 se nem a última faixa foi atingida) e quanto da meta foi atingido (1 = 100%). */
export function escolherFaixa(atingido: number, meta: number, faixas: number[]): { fator: number; pct: number } {
  if (!(meta > 0)) return { fator: 0, pct: 0 };
  const pct = atingido / meta;
  for (const f of [...faixas].sort((a, b) => b - a)) if (pct + 1e-9 >= f) return { fator: f, pct };
  return { fator: 0, pct };
}

export type FormatoKpi = "moeda" | "pct" | "x";
export interface LinhaKpi {
  id: string; tipo: "receita" | "roas" | "margem" | "faturado"; rotulo: string; canal?: string;
  /** fração (0,1 = 10%) */
  peso: number; formato: FormatoKpi; meta: number; atingido: number;
  /** atingido ÷ meta (1 = 100%) */
  pct: number; fator: number;
  /** o que o KPI paga se a meta for batida (variável-base × peso) */
  maximo: number; aReceber: number;
  semMeta?: boolean; semDados?: boolean;
  /** margem: valor sem o ajuste dos SKUs fora do cálculo (só informativo) */
  atingidoSemAjuste?: number;
  detalhe?: string;
}
export interface ResultadoKpi {
  linhas: LinhaKpi[]; base: number;
  /** soma dos KPIs antes do redutor */
  subtotal: number; maximo: number;
  cancelamento: { taxa: number; cancelados: number; total: number; reducao: number; faixa: string };
  reducaoValor: number;
  /** variável a receber depois do redutor */
  total: number;
}

export function faixaDoRedutor(taxa: number, redutor: FaixaRedutor[]): FaixaRedutor {
  const ord = [...redutor].sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
  return ord.find((f) => f.ate === null || taxa <= f.ate + 1e-9) || ord[ord.length - 1] || { ate: null, reducao: 0 };
}

export function calcularKpiAnalista(p: DadosPeriodo, canaisDoAnalista: string[], base: number, cfg: KpiConfig): ResultadoKpi {
  const meus = p.canais.filter((c) => canaisDoAnalista.includes(c.chave));
  const pesos = { r: cfg.pesos.receitaTotal / 100, a: cfg.pesos.roas / 100, m: cfg.pesos.margem / 100, f: cfg.pesos.faturadoCanais / 100 };
  const linhas: LinhaKpi[] = [];
  const montar = (l: Omit<LinhaKpi, "pct" | "fator" | "maximo" | "aReceber">, faixas: number[]) => {
    const { fator, pct } = escolherFaixa(l.atingido, l.meta, faixas);
    const maximo = base * l.peso;
    linhas.push({ ...l, pct, fator, maximo, aReceber: maximo * fator, semMeta: !(l.meta > 0) });
  };

  montar({ id: "receita", tipo: "receita", rotulo: "Receita total da empresa (Dashboard)", peso: pesos.r, formato: "moeda", meta: p.metaEmpresa, atingido: p.faturadoEmpresa }, cfg.faixas.receita);

  const roasCanais = meus.filter((c) => c.adsInvest > 0).map((c) => c.adsRetorno / c.adsInvest);
  const roas = roasCanais.length ? roasCanais.reduce((s, v) => s + v, 0) / roasCanais.length : 0;
  montar({ id: "roas", tipo: "roas", rotulo: "Retorno de Ads (ROAS médio dos canais)", peso: pesos.a, formato: "x", meta: cfg.metaRoas, atingido: roas, semDados: roasCanais.length === 0,
    detalhe: roasCanais.length ? `${roasCanais.length} canal(is) com Ads lançado` : "nenhum canal com Ads lançado" }, cfg.faixas.roas);

  const n = Math.max(1, meus.length);
  meus.forEach((c) => {
    const atingido = c.brutoMargem > 0 ? (c.lucroMargem / c.brutoMargem) * 100 : 0;
    const semAjuste = c.brutoReal > 0 ? (c.lucroReal / c.brutoReal) * 100 : 0;
    montar({ id: "margem:" + c.chave, tipo: "margem", rotulo: `Margem líquida · ${c.canal}`, canal: c.canal, peso: pesos.m / n, formato: "pct", meta: c.margemMeta, atingido, semDados: c.brutoMargem <= 0, atingidoSemAjuste: semAjuste }, cfg.faixas.margem);
  });

  montar({ id: "faturado", tipo: "faturado", rotulo: "Faturamento dos seus canais", peso: pesos.f, formato: "moeda", meta: meus.reduce((s, c) => s + c.metaReceita, 0), atingido: meus.reduce((s, c) => s + c.faturado, 0) }, cfg.faixas.faturado);

  const subtotal = linhas.reduce((s, l) => s + l.aReceber, 0);
  const maximo = linhas.reduce((s, l) => s + l.maximo, 0);

  const contam = meus.filter((c) => !cfg.canaisForaCancelamento.includes(c.chave));
  const totalPed = contam.reduce((s, c) => s + c.pedidosTotais, 0), canc = contam.reduce((s, c) => s + c.pedidosCancelados, 0);
  const taxa = totalPed > 0 ? (canc / totalPed) * 100 : 0;
  const fr = faixaDoRedutor(taxa, cfg.redutor);
  const rotuloFaixa = fr.reducao <= 0 ? "Sem redutor" : `Redutor de ${Math.round(fr.reducao * 100)}% no total`;
  const reducaoValor = subtotal * fr.reducao;
  return { linhas, base, subtotal, maximo, cancelamento: { taxa, cancelados: canc, total: totalPed, reducao: fr.reducao, faixa: rotuloFaixa }, reducaoValor, total: subtotal - reducaoValor };
}
