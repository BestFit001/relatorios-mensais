// Regras das tarefas da tela inicial: prazo (data e hora) ou cíclica (diária / semanal), status por responsável e alertas.
// Tudo em horário de Brasília (America/Sao_Paulo, UTC-3, sem horário de verão desde 2019).

export const FUSO = "America/Sao_Paulo";
/** "Ciclo" usado pelas tarefas de prazo (que não renovam): uma única conclusão vale para sempre. */
export const CICLO_FIXO = "2000-01-01";
export const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export interface TarefaBase {
  id: number | string;
  tipo?: string | null;               // 'prazo' | 'ciclica'
  ciclo?: string | null;              // 'diaria' | 'semanal'
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

export const ehCiclica = (t: TarefaBase) => t.tipo === "ciclica" && (t.ciclo === "diaria" || t.ciclo === "semanal");

/** Início do ciclo vigente: hoje (diária) ou o último dia de renovação (semanal). Tarefa de prazo usa o ciclo fixo. */
export function inicioCiclo(t: TarefaBase, hoje: string): string {
  if (!ehCiclica(t)) return CICLO_FIXO;
  if (t.ciclo === "diaria") return hoje;
  const alvo = Number.isInteger(t.ciclo_dia_semana) ? Number(t.ciclo_dia_semana) : 1;
  const atras = (diaDaSemana(hoje) - alvo + 7) % 7;
  return addDias(hoje, -atras);
}

export const hhmm = (h?: string | null) => (h ? String(h).slice(0, 5) : "");

/**
 * Vencimento da ocorrência vigente.
 * - prazo: data_entrega (+ hora, se houver)
 * - diária: hoje (+ hora)
 * - semanal: último dia do ciclo (renovação + 6 dias) (+ hora)
 */
export function vencimento(t: TarefaBase, hoje: string): { data: string | null; hora: string | null; ms: number | null } {
  let data: string | null = null;
  if (ehCiclica(t)) {
    data = t.ciclo === "diaria" ? hoje : addDias(inicioCiclo(t, hoje), 6);
  } else if (t.data_entrega) {
    data = String(t.data_entrega).slice(0, 10);
  }
  const hora = hhmm(t.hora_entrega) || null;
  const ms = data && hora ? new Date(`${data}T${hora}:00-03:00`).getTime() : null;
  return { data, hora, ms };
}

/** Texto curto da regra de repetição, ex.: "Diária" ou "Semanal (renova toda segunda-feira)". */
export function textoCiclo(t: TarefaBase): string {
  if (!ehCiclica(t)) return "";
  if (t.ciclo === "diaria") return "Diária (renova todo dia)";
  const d = Number.isInteger(t.ciclo_dia_semana) ? Number(t.ciclo_dia_semana) : 1;
  return `Semanal (renova toda ${DIAS_SEMANA[d]})`;
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
export function deveAlertar(t: TarefaBase, jaConcluiu: boolean, agora: Date = new Date()): ResultadoAlerta | null {
  if (jaConcluiu) return null;
  if (t.aviso_minutos === null || t.aviso_minutos === undefined) return null;
  const { data: hoje } = agoraSP(agora);
  const v = vencimento(t, hoje);
  if (v.ms === null) return null;
  const restanteMs = v.ms - agora.getTime();
  if (restanteMs > Number(t.aviso_minutos) * 60000) return null;   // ainda cedo
  return { quando: restanteMs >= 0 ? "antes" : "vencida", minutosRestantes: Math.ceil(restanteMs / 60000) };
}

/** Chave que identifica "este alerta desta ocorrência para este usuário" (para não repetir). */
export const chaveAlerta = (t: TarefaBase, email: string, hoje: string) => `alerta_tarefa_${t.id}_${inicioCiclo(t, hoje)}_${email.trim().toLowerCase()}`;

export function textoAntecedencia(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} dia(s)`;
  if (min % 60 === 0) return `${min / 60} h`;
  return `${min} min`;
}
