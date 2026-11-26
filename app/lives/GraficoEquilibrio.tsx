"use client";
// Gráfico do ponto de equilíbrio: colunas = resultado de cada dia (azul lucro, vermelho prejuízo), linha = acumulado do mês.
// Um só eixo (R$). As cores seguem o par divergente azul/vermelho validado e trocam no tema claro.
import React, { useState } from "react";
import type { DiaSerie } from "@/lib/equilibrioLives";

const moeda = (v: number) => (v < 0 ? "-" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compacto = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1000) return `${s}${(a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: a >= 10000 ? 0 : 1 })} mil`;
  return `${s}${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

/** Marcas "redondas" (1, 2, 5 × 10^n) cobrindo [min, max], sempre incluindo o zero. */
function marcas(min: number, max: number, alvo = 5): number[] {
  const lo = Math.min(0, min), hi = Math.max(0, max);
  const amplitude = hi - lo || 1;
  const bruto = amplitude / alvo, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= bruto) || pot * 10;
  const out: number[] = [];
  for (let v = Math.floor(lo / passo) * passo; v <= Math.ceil(hi / passo) * passo + 1e-9; v += passo) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Coluna com a ponta de dados arredondada (4px) e a base reta, partindo da linha do zero. */
function colunaPath(x: number, w: number, yZero: number, yTopo: number, r = 4): string {
  const sobe = yTopo < yZero, h = Math.abs(yZero - yTopo);
  if (h < 0.5) return "";
  const rr = Math.min(r, h, w / 2);
  if (sobe) return `M${x},${yZero} V${yTopo + rr} Q${x},${yTopo} ${x + rr},${yTopo} H${x + w - rr} Q${x + w},${yTopo} ${x + w},${yTopo + rr} V${yZero} Z`;
  return `M${x},${yZero} V${yTopo - rr} Q${x},${yTopo} ${x + rr},${yTopo} H${x + w - rr} Q${x + w},${yTopo} ${x + w},${yTopo - rr} V${yZero} Z`;
}

export default function GraficoEquilibrio({ dias, diasMes, equilibrio, inicioVinculo, ocultar = false }: {
  dias: DiaSerie[]; diasMes: number; equilibrio: { dia: number } | null; inicioVinculo: number | null; ocultar?: boolean;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const W = 960, H = 300, L = 58, R = 18, T = 26, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const valores = dias.flatMap((d) => [d.resultado, d.acumulado, 0]);
  const ticks = marcas(Math.min(...valores, 0), Math.max(...valores, 0));
  const vmin = ticks[0], vmax = ticks[ticks.length - 1];
  const y = (v: number) => T + ((vmax - v) / (vmax - vmin || 1)) * ph;
  const banda = pw / Math.max(diasMes, 1);
  const largura = Math.min(24, banda * 0.62);
  const xDia = (d: number) => L + (d - 1) * banda + banda / 2;
  const yZero = y(0);
  const linha = dias.map((d) => `${xDia(d.dia).toFixed(1)},${y(d.acumulado).toFixed(1)}`).join(" ");
  const fim = dias[dias.length - 1];
  const sel = foco !== null ? dias[foco] : null;
  const valorTxt = (v: number) => (ocultar ? "R$ ••••" : moeda(v));
  const eixoTxt = (v: number) => (ocultar ? "" : compacto(v));
  const xTicks = Array.from(new Set([1, 5, 10, 15, 20, 25, diasMes].filter((d) => d <= diasMes)));

  return (
    <div className="colab-graf relative" data-grafico-equilibrio>
      <style>{`
        .colab-graf { --pos:#338ced; --neg:#eb6263; --ink:#9c9c9c; --ink-forte:#efefef; --grade:#303030; --base:#474747; --surf:#131313; }
        html.light .colab-graf { --pos:#257de0; --neg:#ec4647; --ink:#666666; --ink-forte:#191919; --grade:#e7e7e7; --base:#c2c2c2; --surf:#ffffff; }
        .colab-graf text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      `}</style>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-2 text-[11px]" style={{ color: "var(--ink)" }}>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "var(--pos)" }} />Dia com lucro</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "var(--neg)" }} />Dia com prejuízo</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5" style={{ background: "var(--ink-forte)" }} />Acumulado do mês</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Resultado de cada dia e acumulado do mês, com o dia do ponto de equilíbrio">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--base)" : "var(--grade)"} strokeWidth={1} />
            <text x={L - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink)">{eixoTxt(t)}</text>
          </g>
        ))}
        {xTicks.map((d) => <text key={d} x={xDia(d)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--ink)">{d}</text>)}

        {inicioVinculo !== null && inicioVinculo > 1 && inicioVinculo <= diasMes && (
          <g>
            <line x1={xDia(inicioVinculo) - banda / 2} x2={xDia(inicioVinculo) - banda / 2} y1={T} y2={T + ph} stroke="var(--base)" strokeWidth={1} />
            <text x={xDia(inicioVinculo) - banda / 2 + 4} y={T + 10} fontSize={10} fill="var(--ink)">registro</text>
          </g>
        )}

        {dias.map((d, i) => {
          const x = xDia(d.dia) - largura / 2;
          const cor = d.resultado >= 0 ? "var(--pos)" : "var(--neg)";
          return <path key={d.data} d={colunaPath(x, largura, yZero, y(d.resultado))} fill={cor} opacity={foco === null || foco === i ? 1 : 0.55} />;
        })}

        {dias.length > 1 && <polyline points={linha} fill="none" stroke="var(--ink-forte)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {fim && <circle cx={xDia(fim.dia)} cy={y(fim.acumulado)} r={4} fill="var(--ink-forte)" stroke="var(--surf)" strokeWidth={2} />}
        {fim && !ocultar && (xDia(fim.dia) + 92 <= W - R
          // há espaço à direita do ponto final: o valor vai ao lado, longe da linha
          ? <text x={xDia(fim.dia) + 9} y={y(fim.acumulado) + 4} textAnchor="start" fontSize={11} fontWeight={600} fill="var(--ink-forte)">{moeda(fim.acumulado)}</text>
          : <text x={xDia(fim.dia) + 4} y={y(fim.acumulado) + (fim.acumulado >= 0 ? -12 : 20)} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--ink-forte)">{moeda(fim.acumulado)}</text>)}

        {equilibrio && (
          <g data-marca-equilibrio>
            <line x1={xDia(equilibrio.dia)} x2={xDia(equilibrio.dia)} y1={T} y2={T + ph} stroke="var(--ink-forte)" strokeWidth={1} />
            <text x={xDia(equilibrio.dia) + 5} y={T + 10} fontSize={11} fontWeight={600} fill="var(--ink-forte)">equilíbrio: dia {equilibrio.dia}</text>
          </g>
        )}

        {sel && <line x1={xDia(sel.dia)} x2={xDia(sel.dia)} y1={T} y2={T + ph} stroke="var(--ink)" strokeWidth={1} />}

        {/* alvos de passagem do mouse/teclado: a faixa inteira do dia */}
        {dias.map((d, i) => (
          <rect key={d.data} x={xDia(d.dia) - banda / 2} y={T} width={banda} height={ph} fill="transparent" tabIndex={0} role="img"
            aria-label={`Dia ${d.dia}: resultado ${valorTxt(d.resultado)}, acumulado ${valorTxt(d.acumulado)}`}
            onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} />
        ))}
      </svg>

      {sel && (
        <div className="absolute z-10 pointer-events-none rounded-lg border px-3 py-2 text-[11px] shadow-xl bg-slate-950/95 border-slate-700 text-slate-300"
          style={{ top: 28, left: `${Math.min(80, Math.max(2, ((xDia(sel.dia) / W) * 100) + 1))}%` }} data-tooltip-equilibrio>
          <div className="font-bold text-white">Dia {sel.dia} ({sel.diaSemana}) · {sel.pedidos} venda(s)</div>
          <div className="mt-1 space-y-0.5">
            <div className="flex justify-between gap-6"><span>Liquidez das vendas</span><span className="font-mono text-white">{valorTxt(sel.liquidez)}</span></div>
            <div className="flex justify-between gap-6"><span>Custo da colaboradora</span><span className="font-mono text-white">{valorTxt(-sel.custoColab)}</span></div>
            {sel.custoAds > 0 && <div className="flex justify-between gap-6"><span>Custo de lives</span><span className="font-mono text-white">{valorTxt(-sel.custoAds)}</span></div>}
            <div className="flex justify-between gap-6 border-t border-slate-700 pt-0.5"><span>Resultado do dia</span><span className="font-mono font-bold text-white">{valorTxt(sel.resultado)}</span></div>
            <div className="flex justify-between gap-6"><span>Acumulado do mês</span><span className="font-mono font-bold text-white">{valorTxt(sel.acumulado)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
