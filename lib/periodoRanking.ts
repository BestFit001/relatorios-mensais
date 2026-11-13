// Períodos do Ranking: mês fechado, últimos 7/15/30 dias e período personalizado (e o "período anterior equivalente" para comparar).
// Tudo trabalha com datas "AAAA-MM-DD" no fuso de São Paulo, sem hora, para não errar o dia.
import { mesesTerminandoEm, rotuloMes, rotuloMesCurto } from "./ranking";

export type TipoPeriodo = "mes" | "7d" | "15d" | "30d" | "custom" | "anterior";
export interface PeriodoSel { tipo: TipoPeriodo; mes: string; inicio: string; fim: string }

export interface PeriodoResolvido {
  tipo: Exclude<TipoPeriodo, "anterior">;
  /** identifica o período (serve de chave nos gráficos) */
  chave: string;
  rotulo: string;
  /** rótulo curto para o eixo dos gráficos */
  curto: string;
  /** mês usado nas regras que dependem de mês (o mês escolhido, ou o mês do último dia do período) */
  mesIso: string;
  /** só nos períodos que não são mês fechado: datas para calcularResumoCanais */
  datas?: { inicio: string; fim: string };
  inicio: string;
  fim: string;
  dias: number;
}

export const OPCOES_PERIODO: { tipo: Exclude<TipoPeriodo, "anterior">; rotulo: string }[] = [
  { tipo: "mes", rotulo: "Mês fechado" },
  { tipo: "7d", rotulo: "Últimos 7 dias" },
  { tipo: "15d", rotulo: "Últimos 15 dias" },
  { tipo: "30d", rotulo: "Últimos 30 dias" },
  { tipo: "custom", rotulo: "Período personalizado" },
];
const DIAS_FIXOS: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30 };
const MAX_DIAS = 366;

export const hojeSP = (agora: Date = new Date()) => agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const emUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const dataValida = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(emUTC(iso)) && new Date(emUTC(iso)).toISOString().slice(0, 10) === iso;
export const somarDias = (iso: string, n: number) => new Date(emUTC(iso) + n * 86400000).toISOString().slice(0, 10);
export const diasEntre = (inicio: string, fim: string) => Math.round((emUTC(fim) - emUTC(inicio)) / 86400000) + 1;
const ultimoDia = (mesIso: string) => { const [a, m] = mesIso.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
export const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function daJanela(tipo: PeriodoResolvido["tipo"], inicio: string, fim: string): PeriodoResolvido {
  const dias = diasEntre(inicio, fim);
  return {
    tipo, chave: `${inicio}_${fim}`, inicio, fim, dias, datas: { inicio, fim }, mesIso: fim.slice(0, 7),
    rotulo: `${dataBR(inicio)} a ${dataBR(fim)}`,
    curto: dias === 1 ? dataCurta(fim) : `${dataCurta(inicio)}–${dataCurta(fim)}`,
  };
}

function doMes(mes: string): PeriodoResolvido {
  const fim = `${mes}-${String(ultimoDia(mes)).padStart(2, "0")}`;
  return { tipo: "mes", chave: mes, inicio: `${mes}-01`, fim, dias: ultimoDia(mes), mesIso: mes, rotulo: rotuloMes(mes), curto: rotuloMesCurto(mes) };
}

/** Transforma a escolha da pessoa em um período com datas. `anterior` só faz sentido na comparação (veja `resolverComparacao`). */
export function resolverPeriodo(sel: PeriodoSel, hoje: string = hojeSP()): PeriodoResolvido {
  if (sel.tipo === "mes" || sel.tipo === "anterior") return doMes(/^\d{4}-\d{2}$/.test(sel.mes) ? sel.mes : hoje.slice(0, 7));
  if (sel.tipo === "7d" || sel.tipo === "15d" || sel.tipo === "30d") return daJanela(sel.tipo, somarDias(hoje, 1 - DIAS_FIXOS[sel.tipo]), hoje);
  // personalizado: aceita datas trocadas de lugar; vazio/inválido cai nos últimos 30 dias
  let { inicio, fim } = sel;
  if (!dataValida(inicio) || !dataValida(fim)) { fim = hoje; inicio = somarDias(hoje, -29); }
  if (inicio > fim) [inicio, fim] = [fim, inicio];
  if (diasEntre(inicio, fim) > MAX_DIAS) inicio = somarDias(fim, 1 - MAX_DIAS);
  return daJanela("custom", inicio, fim);
}

/** Período imediatamente anterior, do mesmo tamanho (mês fechado → mês anterior; 7 dias → os 7 dias antes). */
export function periodoAnterior(p: PeriodoResolvido): PeriodoResolvido {
  if (p.tipo === "mes") return doMes(mesesTerminandoEm(p.mesIso, 2)[0]);
  const fim = somarDias(p.inicio, -1);
  return daJanela(p.tipo, somarDias(fim, 1 - p.dias), fim);
}

/** Período de comparação: o "anterior equivalente" do período A, ou o que a pessoa escolheu. */
export function resolverComparacao(selB: PeriodoSel, a: PeriodoResolvido, hoje: string = hojeSP()): PeriodoResolvido {
  return selB.tipo === "anterior" ? periodoAnterior(a) : resolverPeriodo(selB, hoje);
}

/** `n` períodos consecutivos terminando em `p` (do mais antigo para o mais novo; o último é o próprio `p`), para os gráficos de evolução. */
export function janelasDeEvolucao(p: PeriodoResolvido, n = 6): PeriodoResolvido[] {
  if (p.tipo === "mes") return mesesTerminandoEm(p.mesIso, n).map(doMes);
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    return k === 0 ? p : daJanela(p.tipo, somarDias(p.inicio, -k * p.dias), somarDias(p.fim, -k * p.dias));
  });
}

/** Texto curto para o título: "novembro/2026" ou "07/11/2026 a 13/11/2026 (7 dias)". */
export const descreverPeriodo = (p: PeriodoResolvido) => (p.tipo === "mes" ? p.rotulo : `${p.rotulo} (${p.dias} ${p.dias === 1 ? "dia" : "dias"})`);

/** Cada janela de evolução é "o mesmo tamanho de A"; a unidade do gráfico muda conforme o tipo. */
export const unidadeEvolucao = (p: PeriodoResolvido, n = 6) => (p.tipo === "mes" ? `${n} meses` : `${n} períodos de ${p.dias} ${p.dias === 1 ? "dia" : "dias"}`);
