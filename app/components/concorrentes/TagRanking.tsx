import React from "react";
import { movimentoRanking } from "../../../lib/concorrentes/ranking";
import { dataBR, type Anuncio } from "./comum";

/** Tag "🏆 3º mais vendido" + o que mudou desde a leitura anterior (▲ subiu, ▼ caiu, novo, saiu do ranking). */
export default function TagRanking({ a }: { a: Pick<Anuncio, "ranking_posicao" | "ranking_anterior" | "ranking_data" | "ranking_data_anterior"> }) {
  const m = movimentoRanking(a);
  if (!m) return null;
  if (m.tipo === "saiu") {
    return <span data-ranking="saiu" title={`Estava em ${m.de}º na leitura anterior e não apareceu em ${dataBR(m.em)}`} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black bg-slate-700/70 text-slate-300">saiu do mais vendidos (era {m.de}º)</span>;
  }
  const mov =
    m.tipo === "subiu" ? { t: `▲ ${m.delta}`, c: "text-emerald-300", dica: `Subiu ${m.delta} posição(ões): era ${m.de}º${m.desde ? ` em ${dataBR(m.desde)}` : ""}` }
    : m.tipo === "caiu" ? { t: `▼ ${m.delta}`, c: "text-rose-300", dica: `Caiu ${m.delta} posição(ões): era ${m.de}º${m.desde ? ` em ${dataBR(m.desde)}` : ""}` }
    : m.tipo === "igual" ? { t: "=", c: "text-slate-200", dica: `Mesma posição da leitura anterior${m.desde ? ` (${dataBR(m.desde)})` : ""}` }
    : { t: "novo", c: "text-amber-100", dica: "Não estava no ranking na leitura anterior (ou é a primeira leitura)" };
  return (
    <span data-ranking={m.tipo} title={mov.dica} className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-black bg-orange-500 text-white">
      🏆 {a.ranking_posicao}º mais vendido <span className={`${mov.c} bg-black/25 rounded px-1`} data-movimento>{mov.t}</span>
    </span>
  );
}
