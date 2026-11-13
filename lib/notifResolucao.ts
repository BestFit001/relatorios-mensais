// Notificações do Início (Full, devoluções, correções de vídeo): o responsável marca "Resolvido" ou "Sem ação efetiva".
// Sem tabela nova: cada marcação vira uma linha em config_regras_tiny (campo "notif_res_<id da notificação>"), e a marcação das linhas
// de correção de vídeo como "sem ação" vira "corr_sem_acao_<id da linha>". Só lógica (sem rede nem tela), para poder testar.

export type StatusResolucao = "resolvido" | "sem_acao";
export interface Resolucao { id: string; status: StatusResolucao; por: string; em: string; ref: string }

export const PREFIXO_RESOLUCAO = "notif_res_";
export const PREFIXO_SEM_ACAO = "corr_sem_acao_";
export const campoResolucao = (id: string) => PREFIXO_RESOLUCAO + id;
export const campoSemAcaoLinha = (linhaId: number | string) => PREFIXO_SEM_ACAO + linhaId;
export const rotuloStatus = (s: StatusResolucao) => (s === "resolvido" ? "Resolvido" : "Sem ação efetiva");

export function serializarResolucao(r: Resolucao): string { return JSON.stringify(r); }

/** Lê as marcações de dentro das linhas de config_regras_tiny. */
export function lerResolucoes(linhas: { campo?: any; coluna?: any }[] | null | undefined): Map<string, Resolucao> {
  const m = new Map<string, Resolucao>();
  for (const l of linhas || []) {
    const campo = String(l.campo || "");
    if (!campo.startsWith(PREFIXO_RESOLUCAO)) continue;
    try {
      const j = JSON.parse(String(l.coluna ?? ""));
      if (j && (j.status === "resolvido" || j.status === "sem_acao")) {
        const id = String(j.id || campo.slice(PREFIXO_RESOLUCAO.length));
        m.set(id, { id, status: j.status, por: String(j.por || ""), em: String(j.em || ""), ref: String(j.ref ?? "") });
      }
    } catch { /* linha inválida: ignora */ }
  }
  return m;
}

/** Linhas de correção de vídeo encerradas como "sem ação efetiva" (id de video_correcoes_canais). */
export function lerSemAcaoLinhas(linhas: { campo?: any }[] | null | undefined): Set<number> {
  const s = new Set<number>();
  for (const l of linhas || []) {
    const campo = String(l.campo || "");
    if (campo.startsWith(PREFIXO_SEM_ACAO)) { const n = Number(campo.slice(PREFIXO_SEM_ACAO.length)); if (isFinite(n)) s.add(n); }
  }
  return s;
}

/**
 * A marcação vale enquanto a situação que ela encerrou continua a mesma. Se a "referência" mudou (ex.: chegaram mais devoluções que
 * afetam a reputação, ou o Full passou de alerta para cobrança), a notificação volta a aparecer.
 */
export function resolucaoVale(r: Resolucao | undefined, ref: string): boolean {
  return !!r && r.ref === ref;
}
