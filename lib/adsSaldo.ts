// Saldo de Adsense de cada canal e projeção mensal.
// O saldo NÃO é um número que alguém precise lembrar de baixar: guarda-se o saldo informado e o total já gasto naquele momento (gastoRef);
// o saldo atual é sempre  saldo informado + recargas - (gasto total de hoje - gastoRef).
// Assim, cada planilha nova (ou lançamento) que aumenta o gasto do canal desconta do saldo sozinha, e a recarga soma.
import { gravarChave, lerChave, mesIso, paraJson, slugCanal } from "./adsImportDb";

export type EventoSaldo = { tipo: "saldo" | "recarga"; valor: number; em: string };
// gastoRefLives: só no saldo do TikTok. As Lives gastam do MESMO saldo do TikTok Shop; esta é a referência do custo das Lives no momento em que o saldo foi informado.
export type SaldoAds = { saldoBase: number; gastoRef: number; gastoRefLives?: number; recargas: number; atualizadoEm: string; historico: EventoSaldo[] };

const chave = (canal: string) => `ads_saldo_${slugCanal(canal)}`;
const r2 = (n: number) => Number((n || 0).toFixed(2));

export async function carregarSaldoAds(supabase: any, canal: string): Promise<SaldoAds | null> {
  const j = paraJson(await lerChave(supabase, chave(canal)));
  if (!j || typeof j !== "object" || !Number.isFinite(Number(j.saldoBase))) return null;
  return {
    saldoBase: Number(j.saldoBase), gastoRef: Number(j.gastoRef) || 0, ...(Number.isFinite(Number(j.gastoRefLives)) && j.gastoRefLives !== null && j.gastoRefLives !== undefined ? { gastoRefLives: Number(j.gastoRefLives) } : {}), recargas: Number(j.recargas) || 0, atualizadoEm: String(j.atualizadoEm || ""),
    historico: Array.isArray(j.historico) ? j.historico.filter((e: any) => e && Number.isFinite(Number(e.valor))).map((e: any): EventoSaldo => ({ tipo: e.tipo === "recarga" ? "recarga" : "saldo", valor: Number(e.valor), em: String(e.em || "") })) : [],
  };
}
const gravar = (supabase: any, canal: string, s: SaldoAds) => gravarChave(supabase, chave(canal), JSON.stringify(s));

/** Define o saldo atual (primeira vez ou acerto): o gasto de hoje vira a referência. */
export async function definirSaldoAds(supabase: any, canal: string, valor: number, gastoTotal: number, antigo: SaldoAds | null, gastoLives?: number): Promise<{ saldo: SaldoAds; erro: string | null }> {
  const agora = new Date().toISOString();
  const saldo: SaldoAds = { saldoBase: r2(valor), gastoRef: r2(gastoTotal), ...(gastoLives !== undefined ? { gastoRefLives: r2(gastoLives) } : {}), recargas: 0, atualizadoEm: agora, historico: [{ tipo: "saldo" as const, valor: r2(valor), em: agora }, ...(antigo?.historico || [])].slice(0, 30) };
  return { saldo, erro: await gravar(supabase, canal, saldo) };
}
/** Recarga: soma ao saldo atual. Sem saldo informado ainda, começa de zero (o gasto de hoje vira a referência). */
export async function registrarRecargaAds(supabase: any, canal: string, valor: number, gastoTotal: number, antigo: SaldoAds | null, gastoLives?: number): Promise<{ saldo: SaldoAds; erro: string | null }> {
  const agora = new Date().toISOString();
  const base: SaldoAds = antigo || { saldoBase: 0, gastoRef: r2(gastoTotal), ...(gastoLives !== undefined ? { gastoRefLives: r2(gastoLives) } : {}), recargas: 0, atualizadoEm: agora, historico: [] };
  const saldo: SaldoAds = { ...base, recargas: r2(base.recargas + valor), atualizadoEm: agora, historico: [{ tipo: "recarga" as const, valor: r2(valor), em: agora }, ...base.historico].slice(0, 30) };
  return { saldo, erro: await gravar(supabase, canal, saldo) };
}
/** Saldo atual = saldo informado + recargas − o que as planilhas gastaram depois dele (Ads do canal e, no TikTok, também as Lives, que gastam do mesmo saldo). */
export const saldoAtualAds = (s: SaldoAds | null, gastoTotal: number, gastoLives = 0): number | null =>
  s ? r2(s.saldoBase + s.recargas - (gastoTotal - s.gastoRef) - Math.max(0, gastoLives - (s.gastoRefLives ?? gastoLives))) : null;

/** Saldo antigo (de antes das Lives entrarem): fixa a referência das Lives no custo de hoje, para só descontar o que vier depois. */
export async function fixarReferenciaLives(supabase: any, canal: string, s: SaldoAds, gastoLives: number): Promise<SaldoAds> {
  const novo = { ...s, gastoRefLives: r2(gastoLives) };
  await gravar(supabase, canal, novo);
  return novo;
}

// ---- Canais sem recarga (Mercado Livre): o limite é o budget do mês informado à mão ----
export type BudgetCanal = { valor: number; atualizadoEm: string };
const chaveBudget = (canal: string, mes: string) => `ads_budget_${slugCanal(canal)}_${mesIso(mes)}`;
export async function carregarBudgetCanal(supabase: any, canal: string, mes: string): Promise<BudgetCanal | null> {
  const j = paraJson(await lerChave(supabase, chaveBudget(canal, mes)));
  return j && Number.isFinite(Number(j.valor)) ? { valor: Number(j.valor), atualizadoEm: String(j.atualizadoEm || "") } : null;
}
export async function salvarBudgetCanal(supabase: any, canal: string, mes: string, valor: number): Promise<string | null> {
  return gravarChave(supabase, chaveBudget(canal, mes), JSON.stringify({ valor: r2(valor), atualizadoEm: new Date().toISOString() }));
}

export type SituacaoBudget = {
  restante: number;                 // budget − gasto (negativo = ultrapassou)
  ultrapassou: number;              // quanto já passou do budget (0 se ainda cabe)
  usadoPct: number | null;
  previstoUltrapassa: number;       // quanto o gasto projetado do mês passa do budget
  cabePorDia: number | null;        // quanto dá para gastar por dia nos dias que faltam sem passar do budget
  estouraEm: number | null;         // dias (a partir de hoje) até o budget acabar no ritmo atual
};
export function situacaoBudget(p: { budget: number; gasto: number; proj: Projecao }): SituacaoBudget {
  const restante = r2(p.budget - p.gasto);
  return {
    restante, ultrapassou: Math.max(0, -restante), usadoPct: p.budget > 0 ? (p.gasto / p.budget) * 100 : null,
    previstoUltrapassa: Math.max(0, r2(p.proj.adsProjetadoMes - p.budget)),
    cabePorDia: p.proj.diasRestantes > 0 ? Math.max(0, restante) / p.proj.diasRestantes : null,
    estouraEm: p.proj.ritmoDia > 0 && restante > 0 ? restante / p.proj.ritmoDia : null,
  };
}

/** Saldo único para vários gastos (TikTok Shop + Lives): recarga = o que ainda falta gastar nos dois − o saldo; dura quanto o saldo aguenta o ritmo somado. */
export function projetarCompartilhado(partes: Projecao[], saldo: number | null): { falta: number; ritmoDia: number; recargaSugerida: number | null; saldoSuficienteAte: number | null } {
  const falta = partes.reduce((t, x) => t + x.faltaGastar, 0), ritmoDia = partes.reduce((t, x) => t + x.ritmoDia, 0);
  return { falta, ritmoDia, recargaSugerida: saldo === null ? null : Math.max(0, falta - saldo), saldoSuficienteAte: saldo !== null && ritmoDia > 0 ? Math.max(0, saldo) / ritmoDia : null };
}

/** Soma o investimento de todos os meses de cada canal (nome em minúsculas). */
export async function gastoTotalPorCanal(supabase: any): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("ads_campanhas_lancamentos").select("id, canal, investimento").order("id").range(de, de + 999);
    if (error || !data || data.length === 0) break;
    for (const l of data) { const k = String(l.canal || "").toLowerCase().trim(); out[k] = (out[k] || 0) + (Number(l.investimento) || 0); }
    if (data.length < 1000) break;
  }
  return out;
}

export type Projecao = {
  diasMes: number; diasDecorridos: number; diasRestantes: number; encerrado: boolean;
  ritmoDia: number; adsProjetadoMes: number; faltaGastar: number; fatProjetadoMes: number; tacos: number | null;
  saldoSuficienteAte: number | null;       // quantos dias o saldo aguenta no ritmo atual (null sem saldo ou sem gasto)
  recargaSugerida: number | null;          // null sem saldo informado
};
/** Mantém o ritmo: o que foi gasto/faturado por dia até agora segue até o fim do mês. */
export function projetarMes(p: { gasto: number; faturamento: number; mes: string; hoje: Date; diasOverride?: number | null; saldo: number | null }): Projecao {
  const [m, a] = p.mes.split("/").map(Number);
  const diasMes = new Date(a, m, 0).getDate();
  const ehMesAtual = p.hoje.getMonth() + 1 === m && p.hoje.getFullYear() === a;
  const passado = a < p.hoje.getFullYear() || (a === p.hoje.getFullYear() && m < p.hoje.getMonth() + 1);
  const base = p.diasOverride && p.diasOverride > 0 ? p.diasOverride : ehMesAtual ? p.hoje.getDate() : diasMes;
  const diasDecorridos = Math.min(Math.max(1, Math.round(base)), diasMes);
  const encerrado = passado || diasDecorridos >= diasMes;
  const ritmoDia = p.gasto / diasDecorridos;
  const adsProjetadoMes = encerrado ? p.gasto : ritmoDia * diasMes;
  const faltaGastar = Math.max(0, adsProjetadoMes - p.gasto);
  return {
    diasMes, diasDecorridos, diasRestantes: diasMes - diasDecorridos, encerrado, ritmoDia, adsProjetadoMes, faltaGastar,
    fatProjetadoMes: encerrado ? p.faturamento : (p.faturamento / diasDecorridos) * diasMes,
    tacos: p.faturamento > 0 ? (p.gasto / p.faturamento) * 100 : null,
    saldoSuficienteAte: p.saldo !== null && ritmoDia > 0 ? Math.max(0, p.saldo) / ritmoDia : null,
    recargaSugerida: p.saldo === null ? null : Math.max(0, faltaGastar - p.saldo),
  };
}
