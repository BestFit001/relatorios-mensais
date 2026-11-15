import type { Acao } from "../../lib/adsMl";
export const R$ = (v: number) => (v < 0 ? "-R$ " : "R$ ") + Math.abs(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const NUM = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const PCT = (v: number | null) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%");
export const ROAS = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "x";
export const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

export const ROTULO_ACAO: Record<Acao, { rotulo: string; cor: string; dica: string }> = {
  escalar: { rotulo: "Escalar", cor: "bg-emerald-900/40 text-emerald-300 border-emerald-700", dica: "ROI alto: aumente o investimento" },
  manter: { rotulo: "Manter", cor: "bg-sky-900/40 text-sky-300 border-sky-700", dica: "Liquidez positiva" },
  revisar: { rotulo: "Revisar", cor: "bg-amber-900/40 text-amber-300 border-amber-700", dica: "Quase empata: ajuste antes de decidir" },
  retirar: { rotulo: "Retirar do Ads", cor: "bg-rose-900/40 text-rose-300 border-rose-700", dica: "Perde dinheiro ou não vende" },
  reativar: { rotulo: "Reativar", cor: "bg-violet-900/40 text-violet-300 border-violet-700", dica: "Deu lucro mas está pausado/desativado" },
  aguardar: { rotulo: "Aguardar", cor: "bg-slate-800 text-slate-300 border-slate-600", dica: "Pouco investimento para julgar" },
};
export const ORDEM_ACOES: Acao[] = ["escalar", "manter", "reativar", "revisar", "retirar", "aguardar"];
