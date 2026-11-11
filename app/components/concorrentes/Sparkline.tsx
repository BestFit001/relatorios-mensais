import React from "react";
import type { Ponto } from "../../../lib/concorrentes/historico";

/** Linha pequena com a evolução do preço (um ponto por captura). */
export default function Sparkline({ pontos, largura = 96, altura = 28 }: { pontos: Ponto[]; largura?: number; altura?: number }) {
  const v = [...pontos].filter((p) => p.preco != null).sort((a, b) => a.data.localeCompare(b.data)).map((p) => p.preco as number);
  if (v.length < 2) return <span className="text-[10px] text-slate-600">sem histórico</span>;
  const min = Math.min(...v), max = Math.max(...v), faixa = max - min || 1, pad = 3;
  const x = (i: number) => pad + (i * (largura - 2 * pad)) / (v.length - 1);
  const y = (n: number) => altura - pad - ((n - min) / faixa) * (altura - 2 * pad);
  const cor = v[v.length - 1] < v[0] ? "#34d399" : v[v.length - 1] > v[0] ? "#fb7185" : "#94a3b8"; // preço caiu = verde (bom para quem compete), subiu = rosa
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={`Preço: de ${v[0]} para ${v[v.length - 1]}`}>
      <polyline fill="none" stroke={cor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" points={v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(" ")} />
      <circle cx={x(v.length - 1)} cy={y(v[v.length - 1])} r="2.2" fill={cor} />
    </svg>
  );
}
