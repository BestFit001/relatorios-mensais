// Ranking de analistas: junta os canais de cada analista (home_responsaveis_canais) e soma os números do mês.
// Os valores de cada canal vêm de calcularResumoCanais (mesmos números do Dashboard e do Início).
import type { ResumoCanal } from "./resumoCanais";
import { nomeDeExibicao } from "./nomesBase";
import { normalizarNomeCanal, canalTemCadastro } from "./vendasCanaisLogica";
import { normalizarSkuPai } from "./skuPai";

export const normTxt = (v: any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
/** Magalu e Magazine Luiza são o mesmo canal. */
export const chaveCanal = (v: any) => { const n = normTxt(v); return n.includes("magazine luiza") || n.includes("magalu") ? "magalu" : n; };

export interface Totais {
  /** faturamento já abatido de devoluções e cancelamentos (o que o Dashboard chama de "com redutor") */
  faturado: number; bruto: number; lucro: number; repasse: number; pedidos: number; unidades: number; ads: number; meta: number; devolucoes: number; cancelados: number;
  ticket: number; margemBruta: number; liquidez: number; progressoMeta: number; roas: number; cadastros: number;
  /** SKUs com estoque que ainda não estão cadastrados nos canais (posição de hoje) */
  cadFaltam: number;
  /** cadastros marcados como feitos no período (Mapa de Cadastros ou Novos produtos) */
  cadFeitos: number;
  /** exclusões de SKU marcadas por canal no período (Mapa de Cadastros > Exclusão) */
  cadExcluidos: number;
  /** crescimento do faturamento em % (média por dia) sobre o período de comparação; preenchido pela tela (veja lib/rankingFiltros) */
  crescimento: number;
}

/** Números de cadastro de um canal, vindos das tabelas do Mapa (ver calcularFaltamPorCanal e contarEventosPorCanal). */
export type ExtraCadastro = (canal: string) => { faltam: number; feitos: number; excluidos: number };

export function totalizar(canais: ResumoCanal[], cadastros: (canal: string) => number = () => 0, extra?: ExtraCadastro): Totais {
  const soma = (f: (c: ResumoCanal) => number) => canais.reduce((a, c) => a + (f(c) || 0), 0);
  const faturado = soma((c) => c.faturadoComRedutor), bruto = soma((c) => c.faturadoBruto), lucro = soma((c) => c.lucroLiquidoReal), repasse = soma((c) => c.repasseLiquidoTotal);
  const pedidos = soma((c) => c.pedidos), ads = soma((c) => c.adsGasto), meta = soma((c) => c.metaValor);
  return {
    faturado, bruto, lucro, repasse, pedidos, ads, meta, unidades: soma((c) => c.unidades), devolucoes: soma((c) => c.devolucoesValor), cancelados: soma((c) => c.canceladosValor),
    ticket: pedidos > 0 ? bruto / pedidos : 0,
    margemBruta: bruto > 0 ? (repasse / bruto) * 100 : 0,
    liquidez: bruto > 0 ? (lucro / bruto) * 100 : 0,
    progressoMeta: meta > 0 ? (faturado / meta) * 100 : 0,
    roas: ads > 0 ? faturado / ads : 0,
    cadastros: canais.reduce((a, c) => a + cadastros(c.canal), 0),
    cadFaltam: extra ? canais.reduce((a, c) => a + extra(c.canal).faltam, 0) : 0,
    cadFeitos: extra ? canais.reduce((a, c) => a + extra(c.canal).feitos, 0) : 0,
    cadExcluidos: extra ? canais.reduce((a, c) => a + extra(c.canal).excluidos, 0) : 0,
    crescimento: 0,
  };
}

export interface AnalistaRanking { email: string | null; nome: string; canais: ResumoCanal[]; total: Totais }

export const nomeDoEmail = (email: string) => nomeDeExibicao(email);

/**
 * Agrupa os canais por analista. Canal com mais de um responsável aparece para cada um deles (cada analista vê o canal inteiro).
 * Canal sem responsável fica em "Sem analista" (email null), fora da classificação.
 * Só entram analistas que têm ao menos um canal.
 */
export function agruparPorAnalista(resumo: ResumoCanal[], mapeamentos: { email: string; canal: string }[], cadastros: (canal: string) => number = () => 0, extra?: ExtraCadastro): AnalistaRanking[] {
  const porEmail = new Map<string, Set<string>>();
  mapeamentos.forEach((m) => {
    const e = String(m.email || "").trim().toLowerCase(); if (!e) return;
    (porEmail.get(e) || porEmail.set(e, new Set()).get(e)!).add(chaveCanal(m.canal));
  });
  const comDono = new Set<string>();
  const lista: AnalistaRanking[] = [];
  porEmail.forEach((chaves, email) => {
    const canais = resumo.filter((r) => chaves.has(chaveCanal(r.canal)));
    if (!canais.length) return;
    canais.forEach((c) => comDono.add(chaveCanal(c.canal)));
    lista.push({ email, nome: nomeDoEmail(email), canais, total: totalizar(canais, cadastros, extra) });
  });
  const orfaos = resumo.filter((r) => !comDono.has(chaveCanal(r.canal)) && (r.faturadoBruto > 0 || r.adsGasto > 0 || r.metaValor > 0));   // canal sem dono e sem movimento no mês não aparece
  if (orfaos.length) lista.push({ email: null, nome: "Sem analista", canais: orfaos, total: totalizar(orfaos, cadastros, extra) });
  return lista;
}

export type MetricaId = "faturado" | "lucro" | "margemBruta" | "liquidez" | "ticket" | "pedidos" | "unidades" | "ads" | "roas" | "progressoMeta" | "cadastros" | "cadFaltam" | "cadFeitos" | "cadExcluidos" | "crescimento";
export type Formato = "moeda" | "pct" | "num" | "x";
export const METRICAS: { id: MetricaId; rotulo: string; formato: Formato; dica: string }[] = [
  { id: "faturado", rotulo: "Faturamento", formato: "moeda", dica: "Vendas faturadas no período, já abatidas devoluções e cancelamentos" },
  { id: "crescimento", rotulo: "Crescimento", formato: "pct", dica: "Quanto o faturamento por dia cresceu (ou caiu) em % sobre o período de comparação; sem faturamento nele, 0%" },
  { id: "lucro", rotulo: "Lucro líquido", formato: "moeda", dica: "Repasse − custo dos produtos − imposto (regra atual do Dashboard; ads e frete aparecem à parte)" },
  { id: "margemBruta", rotulo: "Margem bruta", formato: "pct", dica: "Repasse líquido do canal ÷ faturamento bruto (antes de custo dos produtos e imposto)" },
  { id: "liquidez", rotulo: "Margem líquida", formato: "pct", dica: "Liquidez: lucro líquido ÷ faturamento bruto (o % líquido dos cartões do Início)" },
  { id: "ticket", rotulo: "Ticket médio", formato: "moeda", dica: "Faturamento bruto ÷ número de pedidos" },
  { id: "pedidos", rotulo: "Pedidos", formato: "num", dica: "Pedidos faturados no período" },
  { id: "unidades", rotulo: "Unidades", formato: "num", dica: "Itens vendidos no período" },
  { id: "ads", rotulo: "Investimento em Ads", formato: "moeda", dica: "Gasto lançado na aba Adsense (em períodos fora do mês fechado, proporcional aos dias)" },
  { id: "roas", rotulo: "Retorno dos Ads", formato: "x", dica: "Faturamento ÷ investimento em Ads (quantos reais vendidos para cada R$ 1 investido)" },
  { id: "progressoMeta", rotulo: "% da meta", formato: "pct", dica: "Faturamento ÷ meta (em períodos fora do mês fechado, a meta é proporcional aos dias)" },
  { id: "cadastros", rotulo: "Cadastros", formato: "num", dica: "SKUs marcados como cadastrados nos canais do analista (posição de hoje; não varia por período)" },
  { id: "cadFaltam", rotulo: "Faltam cadastrar", formato: "num", dica: "SKUs com estoque (não obsoletos e fora da lista de exclusão) que ainda não estão cadastrados nos canais do analista. Posição de hoje; não varia por período" },
  { id: "cadFeitos", rotulo: "Cadastros feitos", formato: "num", dica: "Cadastros marcados como feitos no período, no Mapa de Cadastros ou em Novos produtos > Canais, nos canais do analista (registro a partir de 16/11/2026)" },
  { id: "cadExcluidos", rotulo: "SKUs excluídos", formato: "num", dica: "Exclusões marcadas por canal no período, na aba Exclusão do Mapa de Cadastros, nos canais do analista" },
];
/** Métricas que só existem "hoje" (sem histórico): não têm variação nem gráfico de evolução. */
export const SEM_HISTORICO: MetricaId[] = ["cadastros", "cadFaltam"];
/** Métricas de cadastro que vêm das tabelas do Mapa (carregadas depois da tela principal). */
export const METRICAS_CADASTRO: MetricaId[] = ["cadFaltam", "cadFeitos", "cadExcluidos"];
/** Métricas em que um valor menor é melhor (para pintar a variação). */
export const MENOR_E_MELHOR: MetricaId[] = ["ads", "cadFaltam"];

export const valorDa = (t: Totais, m: MetricaId): number => t[m];

export function formatar(v: number, f: Formato): string {
  if (!isFinite(v)) return "—";
  if (f === "moeda") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
  if (f === "pct") return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  if (f === "x") return v > 0 ? v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "x" : "—";
  return Math.round(v).toLocaleString("pt-BR");
}

/** Classificação (só analistas de verdade, sem o grupo "Sem analista"), do melhor para o pior. */
export function classificar(lista: AnalistaRanking[], metrica: MetricaId): AnalistaRanking[] {
  const menor = MENOR_E_MELHOR.includes(metrica);
  return lista.filter((a) => a.email).sort((a, b) => (menor ? valorDa(a.total, metrica) - valorDa(b.total, metrica) : valorDa(b.total, metrica) - valorDa(a.total, metrica)) || a.nome.localeCompare(b.nome));
}

export interface Variacao { delta: number; pct: number | null; subiu: boolean | null }
/** Diferença entre o mês escolhido e o de comparação. Para % (liquidez, meta) o "delta" são pontos percentuais. */
export function variacao(atual: number, anterior: number | null | undefined, formato: Formato): Variacao | null {
  if (anterior === null || anterior === undefined || !isFinite(anterior)) return null;
  const delta = atual - anterior;
  return { delta, pct: formato !== "pct" && anterior !== 0 ? (delta / Math.abs(anterior)) * 100 : null, subiu: Math.abs(delta) < 1e-9 ? null : delta > 0 };
}

/** Últimos `n` meses terminando em `mesIso` (do mais antigo para o mais novo): ["2026-06", ..., "2026-11"]. */
export function mesesTerminandoEm(mesIso: string, n: number): string[] {
  const [a, m] = mesIso.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(a, m - 1 - (n - 1 - i), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
}
const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const rotuloMes = (mesIso: string) => { const [a, m] = mesIso.split("-"); return `${NOMES[Number(m) - 1] || m}/${a}`; };
export const rotuloMesCurto = (mesIso: string) => { const [a, m] = mesIso.split("-"); return `${(NOMES[Number(m) - 1] || m).slice(0, 3)}/${a.slice(2)}`; };

/** Novos produtos cadastrados por mês (produtos_novos_cadastrados.data_cadastro). */
export function novosCadastrosPorMes(linhas: { data_cadastro?: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  linhas.forEach((l) => {
    const d = l.data_cadastro ? new Date(l.data_cadastro) : null;
    const k = d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7) : ""; if (/^\d{4}-\d{2}$/.test(k)) m.set(k, (m.get(k) || 0) + 1); });
  return m;
}

/** Datas (AAAA-MM-DD, fuso de São Paulo) dos novos cadastros, para contar em qualquer período. */
export function datasDeCadastro(linhas: { data_cadastro?: string | null }[]): string[] {
  const out: string[] = [];
  linhas.forEach((l) => {
    const d = l.data_cadastro ? new Date(l.data_cadastro) : null;
    if (d && !isNaN(d.getTime())) out.push(d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  });
  return out;
}
export const contarNoPeriodo = (datas: string[], inicio: string, fim: string) => datas.reduce((n, d) => (d >= inicio && d <= fim ? n + 1 : n), 0);


// ---------------------------------------------------------------------------------------------
// Cadastros por canal: o que falta, o que foi feito e o que foi excluído (Mapa de Cadastros)
// ---------------------------------------------------------------------------------------------
/** Mesmo padrão do Mapa de Cadastros: só letras e números, minúsculo, sem aspas nem ".0". */
export const normalizarSkuMapa = (valor: any) => {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

export interface DadosFaltam {
  base: { sku: any; estoque: any }[];
  status: { sku: any; status: any }[];
  presentes: { canal: any; sku: any }[];
  /** SKUs da lista "Para exclusão" (como gravados: normalizarSkuPai) */
  paraExclusao: Set<string>;
  /** nomes normalizados (normalizarNomeCanal) dos canais ocultos no Mapa */
  ocultos: Set<string>;
}

/**
 * SKUs que faltam cadastrar em cada canal (chave = chaveCanal): têm estoque > 0, não são obsoletos, não estão na lista
 * "Para exclusão" e não estão marcados como presentes no canal. Canais sem catálogo (clubes) e ocultos no Mapa ficam de fora (0).
 */
export function calcularFaltamPorCanal(canais: string[], d: DadosFaltam): Map<string, number> {
  const candidatos = new Set<string>();
  const statusPor = new Map<string, string>();
  d.status.forEach((s) => statusPor.set(normalizarSkuMapa(s.sku), String(s.status || "")));
  d.base.forEach((b) => {
    const k = normalizarSkuMapa(b.sku); if (!k) return;
    if (!(Number(b.estoque || 0) > 0)) return;
    if ((statusPor.get(k) || "Normal") === "Obsoleto") return;
    if (d.paraExclusao.has(normalizarSkuPai(b.sku))) return;
    candidatos.add(k);
  });
  const presencaPorCanal = new Map<string, Set<string>>();
  d.presentes.forEach((m) => {
    const c = normalizarNomeCanal(m.canal);
    (presencaPorCanal.get(c) || presencaPorCanal.set(c, new Set()).get(c)!).add(normalizarSkuMapa(m.sku));
  });
  const out = new Map<string, number>();
  canais.forEach((canal) => {
    const chave = chaveCanal(canal), nome = normalizarNomeCanal(canal);
    if (!canalTemCadastro(canal) || d.ocultos.has(nome)) { out.set(chave, out.get(chave) || 0); return; }
    const pres = presencaPorCanal.get(nome);
    let falta = 0; candidatos.forEach((k) => { if (!pres || !pres.has(k)) falta++; });
    out.set(chave, (out.get(chave) || 0) + falta);
  });
  return out;
}

/** Evento datado de cadastro/exclusão: canal (chaveCanal) e dia (AAAA-MM-DD, fuso de São Paulo). */
export interface EventoCadastro { canal: string; dia: string }
export const diaSP = (iso: any): string => { const d = iso ? new Date(iso) : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : ""; };
export function eventosDeCadastro(linhas: { canal?: any; feito_em?: any; excluido_em?: any }[], campo: "feito_em" | "excluido_em"): EventoCadastro[] {
  const out: EventoCadastro[] = [];
  linhas.forEach((l) => { const dia = diaSP((l as any)[campo]); if (dia) out.push({ canal: chaveCanal(l.canal), dia }); });
  return out;
}
/** Quantos eventos cada canal (chaveCanal) teve entre `inicio` e `fim` (AAAA-MM-DD, inclusive). */
export function contarEventosPorCanal(eventos: EventoCadastro[], inicio: string, fim: string): Map<string, number> {
  const m = new Map<string, number>();
  eventos.forEach((e) => { if (e.dia >= inicio && e.dia <= fim) m.set(e.canal, (m.get(e.canal) || 0) + 1); });
  return m;
}

// ---------------------------------------------------------------------------------------------
// Comparativo de Adsense entre analistas (e canais)
// ---------------------------------------------------------------------------------------------
export interface MetricasAds {
  ads: number; participacao: number; faturado: number; roas: number; tacos: number; lucro: number; lucroAposAds: number; roi: number; pedidos: number; adsPorPedido: number;
}
/** Números de Ads derivados dos totais. Razões sem investimento (ou sem faturamento) ficam NaN e aparecem como "—". */
export function metricasAds(t: Totais, adsDaEmpresa: number): MetricasAds {
  const razao = (a: number, b: number) => (b > 0 ? a / b : NaN);
  return {
    ads: t.ads, participacao: adsDaEmpresa > 0 ? (t.ads / adsDaEmpresa) * 100 : NaN, faturado: t.faturado,
    roas: razao(t.faturado, t.ads), tacos: t.faturado > 0 && t.ads > 0 ? (t.ads / t.faturado) * 100 : NaN,
    lucro: t.lucro, lucroAposAds: t.lucro - t.ads, roi: t.ads > 0 ? ((t.lucro - t.ads) / t.ads) * 100 : NaN,
    pedidos: t.pedidos, adsPorPedido: razao(t.ads, t.pedidos),
  };
}
export const LINHAS_ADS: { id: keyof MetricasAds; rotulo: string; formato: Formato; dica: string; melhor: "max" | "min" | null }[] = [
  { id: "ads", rotulo: "Investimento em Ads", formato: "moeda", dica: "Gasto lançado na aba Adsense nos canais do analista", melhor: null },
  { id: "participacao", rotulo: "% do investimento total", formato: "pct", dica: "Parte do investimento em Ads de toda a empresa", melhor: null },
  { id: "faturado", rotulo: "Faturamento", formato: "moeda", dica: "Faturamento já abatido de devoluções e cancelamentos", melhor: "max" },
  { id: "roas", rotulo: "ROAS", formato: "x", dica: "Faturamento ÷ investimento: quantos reais vendidos para cada R$ 1 em Ads", melhor: "max" },
  { id: "tacos", rotulo: "Ads ÷ faturamento", formato: "pct", dica: "Quanto do faturamento foi gasto em Ads (quanto menor, melhor)", melhor: "min" },
  { id: "lucro", rotulo: "Lucro líquido", formato: "moeda", dica: "Lucro antes de descontar o investimento em Ads", melhor: "max" },
  { id: "lucroAposAds", rotulo: "Lucro após Ads", formato: "moeda", dica: "Lucro líquido − investimento em Ads", melhor: "max" },
  { id: "roi", rotulo: "ROI dos Ads", formato: "pct", dica: "(Lucro líquido − Ads) ÷ Ads: quanto sobra de lucro para cada R$ 1 investido", melhor: "max" },
  { id: "pedidos", rotulo: "Pedidos", formato: "num", dica: "Pedidos faturados no período", melhor: null },
  { id: "adsPorPedido", rotulo: "Ads por pedido", formato: "moeda", dica: "Investimento ÷ pedidos (quanto menor, melhor)", melhor: "min" },
];
