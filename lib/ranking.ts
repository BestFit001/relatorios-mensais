// Ranking de analistas: junta os canais de cada analista (home_responsaveis_canais) e soma os números do mês.
// Os valores de cada canal vêm de calcularResumoCanais (mesmos números do Dashboard e do Início).
import type { ResumoCanal } from "./resumoCanais";

export const normTxt = (v: any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
/** Magalu e Magazine Luiza são o mesmo canal. */
export const chaveCanal = (v: any) => { const n = normTxt(v); return n.includes("magazine luiza") || n.includes("magalu") ? "magalu" : n; };

export interface Totais {
  /** faturamento já abatido de devoluções e cancelamentos (o que o Dashboard chama de "com redutor") */
  faturado: number; bruto: number; lucro: number; repasse: number; pedidos: number; unidades: number; ads: number; meta: number; devolucoes: number; cancelados: number;
  ticket: number; margemBruta: number; liquidez: number; progressoMeta: number; roas: number; cadastros: number;
}

export function totalizar(canais: ResumoCanal[], cadastros: (canal: string) => number = () => 0): Totais {
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
  };
}

export interface AnalistaRanking { email: string | null; nome: string; canais: ResumoCanal[]; total: Totais }

export const nomeDoEmail = (email: string) =>
  String(email || "").split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") || email;

/**
 * Agrupa os canais por analista. Canal com mais de um responsável aparece para cada um deles (cada analista vê o canal inteiro).
 * Canal sem responsável fica em "Sem analista" (email null), fora da classificação.
 * Só entram analistas que têm ao menos um canal.
 */
export function agruparPorAnalista(resumo: ResumoCanal[], mapeamentos: { email: string; canal: string }[], cadastros: (canal: string) => number = () => 0): AnalistaRanking[] {
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
    lista.push({ email, nome: nomeDoEmail(email), canais, total: totalizar(canais, cadastros) });
  });
  const orfaos = resumo.filter((r) => !comDono.has(chaveCanal(r.canal)) && (r.faturadoBruto > 0 || r.adsGasto > 0 || r.metaValor > 0));   // canal sem dono e sem movimento no mês não aparece
  if (orfaos.length) lista.push({ email: null, nome: "Sem analista", canais: orfaos, total: totalizar(orfaos, cadastros) });
  return lista;
}

export type MetricaId = "faturado" | "lucro" | "margemBruta" | "liquidez" | "ticket" | "pedidos" | "unidades" | "ads" | "roas" | "progressoMeta" | "cadastros";
export type Formato = "moeda" | "pct" | "num" | "x";
export const METRICAS: { id: MetricaId; rotulo: string; formato: Formato; dica: string }[] = [
  { id: "faturado", rotulo: "Faturamento", formato: "moeda", dica: "Vendas faturadas no mês, já abatidas devoluções e cancelamentos" },
  { id: "lucro", rotulo: "Lucro líquido", formato: "moeda", dica: "Repasse − custo dos produtos − imposto (regra atual do Dashboard; ads e frete aparecem à parte)" },
  { id: "margemBruta", rotulo: "Margem bruta", formato: "pct", dica: "Repasse líquido do canal ÷ faturamento bruto (antes de custo dos produtos e imposto)" },
  { id: "liquidez", rotulo: "Margem líquida", formato: "pct", dica: "Liquidez: lucro líquido ÷ faturamento bruto (o % líquido dos cartões do Início)" },
  { id: "ticket", rotulo: "Ticket médio", formato: "moeda", dica: "Faturamento bruto ÷ número de pedidos" },
  { id: "pedidos", rotulo: "Pedidos", formato: "num", dica: "Pedidos faturados no mês" },
  { id: "unidades", rotulo: "Unidades", formato: "num", dica: "Itens vendidos no mês" },
  { id: "ads", rotulo: "Investimento em Ads", formato: "moeda", dica: "Gasto lançado na aba Adsense para o mês" },
  { id: "roas", rotulo: "Retorno dos Ads", formato: "x", dica: "Faturamento ÷ investimento em Ads (quantos reais vendidos para cada R$ 1 investido)" },
  { id: "progressoMeta", rotulo: "% da meta", formato: "pct", dica: "Faturamento ÷ meta do mês" },
  { id: "cadastros", rotulo: "Cadastros", formato: "num", dica: "SKUs marcados como cadastrados nos canais do analista (posição de hoje; não varia por mês)" },
];
/** Métricas em que um valor menor é melhor (para pintar a variação). */
export const MENOR_E_MELHOR: MetricaId[] = ["ads"];

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
