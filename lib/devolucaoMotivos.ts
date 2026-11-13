// Devoluções por motivo, para o Início: "Arrependimento da compra" não afeta a reputação do vendedor; qualquer outro motivo afeta.
// Só lógica (sem rede nem tela), para poder testar.
import { isoDoMesRef } from "./resumoCanais";

const semAcento = (v: any) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const MOTIVO_SEM_INFORMACAO = "Sem motivo informado";

/** Arrependimento da compra = não afetou a reputação. Todo o resto (inclusive motivo em branco) = afetou. */
export function afetaReputacao(motivo: any): boolean {
  return !semAcento(motivo).includes("arrependimento");
}

/** Mês (AAAA-MM) de uma devolução: mes_referencia quando existe; senão a data do retorno (AAAA-MM-DD ou DD/MM/AAAA). */
export function mesDaDevolucao(d: any): string {
  if (d?.mes_referencia) { const iso = isoDoMesRef(d.mes_referencia); if (iso) return iso; }
  const data = String(d?.data_retorno || d?.data || d?.data_devolucao || "").trim();
  if (/^\d{4}-\d{2}/.test(data)) return data.slice(0, 7);
  const p = data.split("/");
  if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1].padStart(2, "0")}`;
  return "";
}

export interface MotivoQtd { motivo: string; qtd: number; afeta: boolean }
export interface ResumoCanalDev { canal: string; afetou: number; naoAfetou: number; total: number; motivos: MotivoQtd[] }

/** Devoluções do mês por canal e motivo (quantidade = unidades devolvidas). `canalVisivel` filtra os canais que a pessoa enxerga. */
export function resumirDevolucoesPorCanal(devolucoes: any[], mesIso: string, canalVisivel: (canal: string) => boolean, chave: (canal: string) => string): ResumoCanalDev[] {
  const por = new Map<string, { canal: string; motivos: Map<string, MotivoQtd> }>();
  for (const d of devolucoes || []) {
    if (mesDaDevolucao(d) !== mesIso) continue;
    const canal = String(d.canal || "").trim();
    if (!canal || !canalVisivel(canal)) continue;
    const k = chave(canal);
    let reg = por.get(k); if (!reg) { reg = { canal, motivos: new Map() }; por.set(k, reg); }
    const motivo = String(d.motivo || "").trim().replace(/\.$/, "") || MOTIVO_SEM_INFORMACAO;
    const qtd = Math.max(1, Math.round(Number(d.quantidade)) || 1);
    const m = reg.motivos.get(motivo); if (m) m.qtd += qtd; else reg.motivos.set(motivo, { motivo, qtd, afeta: afetaReputacao(motivo) });
  }
  return Array.from(por.values()).map((r) => {
    const motivos = Array.from(r.motivos.values()).sort((a, b) => b.qtd - a.qtd);
    const afetou = motivos.filter((m) => m.afeta).reduce((s, m) => s + m.qtd, 0);
    const naoAfetou = motivos.filter((m) => !m.afeta).reduce((s, m) => s + m.qtd, 0);
    return { canal: r.canal, afetou, naoAfetou, total: afetou + naoAfetou, motivos };
  }).sort((a, b) => b.afetou - a.afetou || b.total - a.total);
}
