// Regras das tarefas da tela inicial: prazo (data e hora) ou cíclica (diária / semanal / mensal), status por responsável e alertas.
// As cíclicas só valem em DIAS ÚTEIS (segunda a sexta, sem feriados): a diária não aparece em fim de semana nem feriado, a semanal
// renova no dia escolhido (ou no próximo dia útil) e vence no último dia útil do ciclo, e a mensal renova e vence no 1º dia útil do mês.
// Tudo em horário de Brasília (America/Sao_Paulo, UTC-3, sem horário de verão desde 2019).
import { ehDiaUtil, diaUtilAPartirDe, diaUtilAnteriorA, primeiroDiaUtilDoMes, mesAnterior } from "./diasUteis";

export const FUSO = "America/Sao_Paulo";
/** "Ciclo" usado pelas tarefas de prazo (que não renovam): uma única conclusão vale para sempre. */
export const CICLO_FIXO = "2000-01-01";
export const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export interface TarefaBase {
  id: number | string;
  tipo?: string | null;               // 'prazo' | 'ciclica'
  ciclo?: string | null;              // 'diaria' | 'semanal' | 'mensal'
  ciclo_dia_semana?: number | null;   // 0 = domingo ... 6 = sábado
  data_entrega?: string | null;       // YYYY-MM-DD
  hora_entrega?: string | null;       // HH:MM[:SS]
  aviso_minutos?: number | null;
  responsaveis?: string[] | null;
}
export interface Conclusao { tarefa_id: number | string; email: string; ciclo: string; concluida_em?: string | null }

/** Data (YYYY-MM-DD) e hora (HH:MM) de agora em Brasília. */
export function agoraSP(now: Date = new Date()): { data: string; hora: string; ms: number } {
  const s = now.toLocaleString("sv-SE", { timeZone: FUSO }); // "2026-11-04 15:02:11"
  return { data: s.slice(0, 10), hora: s.slice(11, 16), ms: now.getTime() };
}

const utcDia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function addDias(iso: string, n: number): string {
  return new Date(utcDia(iso) + n * 86400000).toISOString().slice(0, 10);
}
export function diferencaDias(deIso: string, ateIso: string): number {
  return Math.round((utcDia(ateIso) - utcDia(deIso)) / 86400000);
}
export function diaDaSemana(iso: string): number {
  return new Date(utcDia(iso)).getUTCDay();
}

export const ehCiclica = (t: TarefaBase) => t.tipo === "ciclica" && (t.ciclo === "diaria" || t.ciclo === "semanal" || t.ciclo === "mensal");

const diaAlvoSemanal = (t: TarefaBase) => (Number.isInteger(t.ciclo_dia_semana) ? Number(t.ciclo_dia_semana) : 1);

/** Ciclo semanal que contém `hoje`: renovação (dia escolhido, ou o próximo dia útil se ele for fim de semana/feriado) e vencimento (último dia útil antes da próxima renovação). */
function cicloSemanal(alvo: number, hoje: string): { inicio: string; vence: string } {
  const atras = (diaDaSemana(hoje) - alvo + 7) % 7;
  let nominal = addDias(hoje, -atras);
  if (diaUtilAPartirDe(nominal) > hoje) nominal = addDias(nominal, -7);   // a renovação deste ciclo ainda não chegou (ex.: segunda feriado)
  const inicio = diaUtilAPartirDe(nominal);
  const proximo = diaUtilAPartirDe(addDias(nominal, 7));
  const vence = diaUtilAnteriorA(proximo);
  return { inicio, vence: vence < inicio ? inicio : vence };
}

/** Mensal: o ciclo começa (e vence) no 1º dia útil do mês. */
function inicioMensal(hoje: string): string {
  const doMes = primeiroDiaUtilDoMes(hoje.slice(0, 7));
  return doMes <= hoje ? doMes : primeiroDiaUtilDoMes(mesAnterior(hoje.slice(0, 7)));
}

/** A tarefa diária não vale em fim de semana nem feriado: nesses dias ela fica de folga (sem pendência, atraso ou alerta). */
export const emFolga = (t: TarefaBase, dia: string) => ehCiclica(t) && t.ciclo === "diaria" && !ehDiaUtil(dia);

/** Início do ciclo vigente: hoje (diária), a última renovação (semanal) ou o 1º dia útil do mês (mensal). Tarefa de prazo usa o ciclo fixo. */
export function inicioCiclo(t: TarefaBase, hoje: string): string {
  if (!ehCiclica(t)) return CICLO_FIXO;
  if (t.ciclo === "diaria") return hoje;
  if (t.ciclo === "mensal") return inicioMensal(hoje);
  return cicloSemanal(diaAlvoSemanal(t), hoje).inicio;
}

export const hhmm = (h?: string | null) => (h ? String(h).slice(0, 5) : "");

/**
 * Vencimento da ocorrência vigente.
 * - prazo: data_entrega (+ hora, se houver)
 * - diária: hoje, só em dia útil (+ hora); em fim de semana/feriado não há vencimento
 * - semanal: último dia útil do ciclo (+ hora)
 * - mensal: o 1º dia útil do mês (+ hora)
 */
export function vencimento(t: TarefaBase, hoje: string): { data: string | null; hora: string | null; ms: number | null } {
  let data: string | null = null;
  if (ehCiclica(t)) {
    if (t.ciclo === "diaria") data = ehDiaUtil(hoje) ? hoje : null;
    else if (t.ciclo === "mensal") data = inicioMensal(hoje);
    else data = cicloSemanal(diaAlvoSemanal(t), hoje).vence;
  } else if (t.data_entrega) {
    data = String(t.data_entrega).slice(0, 10);
  }
  const hora = hhmm(t.hora_entrega) || null;
  const ms = data && hora ? new Date(`${data}T${hora}:00-03:00`).getTime() : null;
  return { data, hora, ms };
}

/** Texto curto da regra de repetição, ex.: "Diária (dias úteis)" ou "Semanal (renova toda segunda-feira)". */
export function textoCiclo(t: TarefaBase): string {
  if (!ehCiclica(t)) return "";
  if (t.ciclo === "diaria") return "Diária (dias úteis)";
  if (t.ciclo === "mensal") return "Mensal (1º dia útil do mês)";
  return `Semanal (renova toda ${DIAS_SEMANA[diaAlvoSemanal(t)]}, dia útil)`;
}

export function concluiu(t: TarefaBase, email: string, conclusoes: Conclusao[], hoje: string): boolean {
  const ciclo = inicioCiclo(t, hoje);
  const e = email.trim().toLowerCase();
  return conclusoes.some((c) => String(c.tarefa_id) === String(t.id) && c.email.trim().toLowerCase() === e && String(c.ciclo).slice(0, 10) === ciclo);
}

export function statusPorResponsavel(t: TarefaBase, conclusoes: Conclusao[], hoje: string): { email: string; concluida: boolean }[] {
  return (t.responsaveis || []).map((email) => ({ email, concluida: concluiu(t, email, conclusoes, hoje) }));
}

/** Atrasada: passou da data (ou da hora, quando a data é hoje) e o responsável ainda não concluiu. */
export function estaAtrasada(t: TarefaBase, hoje: string, horaAgora: string): boolean {
  const v = vencimento(t, hoje);
  if (!v.data) return false;
  if (v.data < hoje) return true;
  return v.data === hoje && !!v.hora && v.hora < horaAgora;
}

export type ResultadoAlerta = { quando: "antes" | "vencida"; minutosRestantes: number };

/**
 * Esta tarefa já deve disparar o alerta? Só dispara se houver hora e aviso configurados e o
 * responsável ainda não tiver concluído a ocorrência vigente.
 */
export const JANELA_VENCIDA_MIN = 180;   // depois de 3 h do horário limite não adianta mais avisar

export function deveAlertar(t: TarefaBase, jaConcluiu: boolean, agora: Date = new Date()): ResultadoAlerta | null {
  if (jaConcluiu) return null;
  if (t.aviso_minutos === null || t.aviso_minutos === undefined) return null;
  const { data: hoje } = agoraSP(agora);
  const v = vencimento(t, hoje);
  if (v.ms === null) return null;
  const restanteMs = v.ms - agora.getTime();
  if (restanteMs > Number(t.aviso_minutos) * 60000) return null;   // ainda cedo
  if (restanteMs < -JANELA_VENCIDA_MIN * 60000) return null;       // venceu há muito tempo
  return { quando: restanteMs >= 0 ? "antes" : "vencida", minutosRestantes: Math.ceil(restanteMs / 60000) };
}

/** Referência da ocorrência alertada: muda se a tarefa passar para outro ciclo, outro horário ou outro aviso (assim editar a tarefa libera um novo alerta). */
export const refAlerta = (t: TarefaBase, hoje: string) => `${inicioCiclo(t, hoje)}|${hhmm(t.hora_entrega)}|${t.aviso_minutos ?? ""}|${vencimento(t, hoje).data ?? ""}`;

/** Chave local (navegador) de "este alerta desta ocorrência para este usuário" (para não repetir). */
export const chaveAlerta = (t: TarefaBase, email: string, hoje: string) => `alerta_tarefa_${t.id}_${refAlerta(t, hoje)}_${email.trim().toLowerCase()}`;

/** A tarefa ocorre neste dia do calendário? (prazo: no dia da entrega; diária: dias úteis; semanal: na renovação e no vencimento; mensal: no 1º dia útil do mês) */
export function ocorreNoDia(t: TarefaBase & { created_at?: string | null }, dia: string): { ocorre: boolean; papel: "entrega" | "diaria" | "renova" | "vence" | "mensal" | null } {
  if (!ehCiclica(t)) {
    const d = t.data_entrega ? String(t.data_entrega).slice(0, 10) : null;
    return d === dia ? { ocorre: true, papel: "entrega" } : { ocorre: false, papel: null };
  }
  const criada = t.created_at ? String(t.created_at).slice(0, 10) : null;
  if (criada && dia < criada) return { ocorre: false, papel: null };
  if (t.ciclo === "diaria") return ehDiaUtil(dia) ? { ocorre: true, papel: "diaria" } : { ocorre: false, papel: null };
  if (t.ciclo === "mensal") return inicioMensal(dia) === dia ? { ocorre: true, papel: "mensal" } : { ocorre: false, papel: null };
  const ini = inicioCiclo(t, dia);
  if (ini === dia) return { ocorre: true, papel: "renova" };
  if (vencimento(t, dia).data === dia) return { ocorre: true, papel: "vence" };
  return { ocorre: false, papel: null };
}

export function textoAntecedencia(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} dia(s)`;
  if (min % 60 === 0) return `${min / 60} h`;
  return `${min} min`;
}
