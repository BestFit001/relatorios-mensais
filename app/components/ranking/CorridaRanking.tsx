"use client";
// Corrida do Ranking: cada analista é um corredor (com o avatar dele) numa pista de atletismo com obstáculos.
// Quem lidera na métrica escolhida cruza a chegada; os outros ficam atrás, na proporção do valor.
import React, { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../Avatar";
import { OBSTACULOS, alturaSalto, andamento, fasePulo, ombroDe, poseCorredor, posicoesFinais, pousarForaDosObstaculos, type Pose } from "../../../lib/corridaRanking";

export interface Corredor { id: string; nome: string; email: string; valor: number; cor: string; canais: number }

const DURACAO_MS = 8500;
const ALTURA_PULO = 40;            // px
const ESCALA = 1.2;                // tamanho do corredor na pista
const ALTURA_RAIA = 176;           // px
const INICIO = 5, ALCANCE = 88;    // % da pista onde fica a largada e quanto ela vai até o líder
const MEDALHAS = ["🥇", "🥈", "🥉"];
const px = (p: number) => `${INICIO + p * ALCANCE}%`;

/** Corpo do corredor (o avatar fica por cima, como cabeça). Origem do desenho: quadril em (40, 62). */
function Corpo({ pose, cor }: { pose: Pose; cor: string }) {
  const k = pose.alcance ?? 1;
  const L = { coxa: 17, canela: 17, braco: 12 * k, antebraco: 11 * k };
  const membro = (x: number, y: number, a1: number, c1: number, a2: number, c2: number) => {
    const r1 = (a1 * Math.PI) / 180, r2 = ((a1 + a2) * Math.PI) / 180;
    const x1 = x + Math.sin(r1) * c1, y1 = y + Math.cos(r1) * c1;
    return { x1, y1, x2: x1 + Math.sin(r2) * c2, y2: y1 + Math.cos(r2) * c2 };
  };
  const quadrilY = 50;
  const ombro = ombroDe(pose);
  const pF = membro(40, quadrilY, pose.coxaF, L.coxa, pose.canelaF, L.canela);
  const pT = membro(40, quadrilY, pose.coxaT, L.coxa, pose.canelaT, L.canela);
  const bF = membro(ombro.x, ombro.y, pose.bracoF, L.braco, pose.dobraBraco, L.antebraco);
  const bT = membro(ombro.x, ombro.y, pose.bracoT, L.braco, pose.dobraBracoT, L.antebraco);
  const traco = { stroke: cor, strokeWidth: 5.5, strokeLinecap: "round" as const, fill: "none" };
  const sombra = { stroke: "#0a0a0a", strokeWidth: 8, strokeLinecap: "round" as const, fill: "none", opacity: 0.35 };
  const perna = (m: typeof pF) => `M${(40).toFixed(1)} ${quadrilY} L${m.x1.toFixed(1)} ${m.y1.toFixed(1)} L${m.x2.toFixed(1)} ${m.y2.toFixed(1)}`;
  const braco = (m: typeof bF) => `M${ombro.x.toFixed(1)} ${ombro.y.toFixed(1)} L${m.x1.toFixed(1)} ${m.y1.toFixed(1)} L${m.x2.toFixed(1)} ${m.y2.toFixed(1)}`;
  return (
    <svg viewBox="0 0 80 84" width={80 * ESCALA} height={84 * ESCALA} aria-hidden="true" style={{ overflow: "visible" }}>
      <path d={braco(bT)} {...traco} opacity="0.55" />
      <path d={perna(pT)} {...traco} opacity="0.55" />
      <path d={`M40 ${quadrilY} L${ombro.x.toFixed(1)} ${ombro.y.toFixed(1)}`} {...sombra} />
      <path d={`M40 ${quadrilY} L${ombro.x.toFixed(1)} ${ombro.y.toFixed(1)}`} {...traco} strokeWidth={7} />
      <path d={perna(pF)} {...traco} />
      <path d={braco(bF)} {...traco} />
    </svg>
  );
}

function Obstaculo() {
  return (
    <svg viewBox="0 0 30 34" width="30" height="34" aria-hidden="true" style={{ overflow: "visible" }}>
      <rect x="2" y="6" width="3" height="28" fill="#e2e8f0" />
      <rect x="25" y="6" width="3" height="28" fill="#e2e8f0" />
      <rect x="0" y="6" width="30" height="7" rx="1.5" fill="#f8fafc" />
      <rect x="0" y="6" width="9" height="7" fill="#dc2626" /><rect x="18" y="6" width="9" height="7" fill="#dc2626" />
    </svg>
  );
}

export default function CorridaRanking({ corredores, rotuloMetrica, rotuloPeriodo, formatarValor, menorEMelhor, referencia, dica }: {
  corredores: Corredor[]; rotuloMetrica: string; rotuloPeriodo: string; formatarValor: (v: number) => string; menorEMelhor: boolean; referencia?: number; dica?: string;
}) {
  const ordem = useMemo(() => corredores.map((c) => c.id), [corredores]);
  const finais = useMemo(() => pousarForaDosObstaculos(
    posicoesFinais(corredores.map((c) => ({ id: c.id, valor: c.valor })), menorEMelhor, referencia), ordem), [corredores, menorEMelhor, referencia, ordem]);
  const semMovimento = useMemo(() => corredores.every((c) => (finais[c.id] || 0) === 0) && !menorEMelhor, [corredores, finais, menorEMelhor]);

  // t = 0..1 (tempo da prova). Reduzir movimento: já mostra o resultado final.
  const [t, setT] = useState(0);
  const [rodada, setRodada] = useState(0);
  const quadro = useRef(0);
  const chave = corredores.map((c) => `${c.id}:${c.valor}`).join("|") + `|${menorEMelhor}|${referencia ?? ""}|${rodada}`;
  useEffect(() => {
    const reduzido = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduzido) { setT(1); return; }
    setT(0);
    const inicio = performance.now();
    const passo = (agora: number) => {
      const v = Math.min(1, (agora - inicio) / DURACAO_MS);
      setT(v);
      if (v < 1) quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro.current);
  }, [chave]);   // eslint-disable-line react-hooks/exhaustive-deps

  const u = andamento(t);
  const terminou = t >= 1;
  const vencedor = corredores[0];

  return (
    <div className="space-y-4" data-corrida>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider">🏁 Corrida · {rotuloMetrica}</h2>
          <p className="text-[11px] text-slate-500">{rotuloPeriodo}. {dica ? `${dica}. ` : ""}Quem lidera cruza a chegada; os outros ficam atrás na proporção do resultado.</p>
        </div>
        <button type="button" data-correr-de-novo onClick={() => setRodada((r) => r + 1)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border bg-slate-950 border-slate-700 text-slate-200 hover:text-white hover:border-slate-500">▶ Correr de novo</button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3 sm:p-4" data-pista>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {corredores.map((c, idx) => {
              const final = finais[c.id] || 0;
              const x = final * u;
              const emSalto = terminou ? null : fasePulo(x);
              const correndo = !terminou && final > 0 && t > 0;
              const fase = x * 120;                                          // passada proporcional à distância percorrida
              const pose = poseCorredor(fase, correndo, correndo ? emSalto : null, terminou && idx === 0 && !semMovimento);
              const ombro = ombroDe(pose);
              const alto = terminou ? 0 : alturaSalto(x, ALTURA_PULO);
              const exibido = c.valor * (menorEMelhor ? 1 : u);
              const ganhou = terminou && idx === 0 && vencedor && !semMovimento;
              return (
                <div key={c.id} className="flex items-stretch" data-raia={c.email}>
                  <div className="w-28 sm:w-36 shrink-0 pr-3 flex flex-col justify-center border-r border-slate-800">
                    <span className="flex items-center gap-1.5 text-xs font-black text-white truncate"><span className="w-1.5 h-4 rounded shrink-0" style={{ background: c.cor }} /><span className="truncate">{c.nome}</span></span>
                    <span className="text-[10px] text-slate-500">{c.canais} canal(is)</span>
                    <span className="mt-1 text-sm sm:text-base font-black text-amber-300 tabular-nums" data-valor-corredor>{formatarValor(exibido)}</span>
                  </div>
                  <div className="relative flex-1 overflow-hidden" style={{ height: ALTURA_RAIA, background: "linear-gradient(180deg,#5b2a1f 0%,#7a3524 55%,#6b2e20 100%)", borderBottom: "2px solid #f8fafc55", borderTop: idx === 0 ? "2px solid #f8fafc55" : undefined }}>
                    {/* linha de largada e de chegada */}
                    <div className="absolute top-0 bottom-0" style={{ left: `${INICIO - 1.2}%`, width: 3, background: "#f8fafcaa" }} />
                    <div className="absolute top-0 bottom-0" data-chegada style={{ left: `${INICIO + ALCANCE - 0.6}%`, width: 14, backgroundImage: "repeating-conic-gradient(#f8fafc 0% 25%, #0a0a0a 0% 50%)", backgroundSize: "7px 7px", opacity: 0.9 }} />
                    {/* obstáculos */}
                    {OBSTACULOS.map((o) => <div key={o} className="absolute" data-obstaculo style={{ left: px(o), bottom: 28, transform: "translateX(-50%)" }}><Obstaculo /></div>)}
                    {/* corredor */}
                    <div className="absolute" data-corredor={c.email} data-x={x.toFixed(3)} style={{ left: px(x), bottom: 16 + alto, transform: "translateX(-50%)", width: 80 * ESCALA, height: 84 * ESCALA }}>
                      <Corpo pose={pose} cor={c.cor} />
                      <div className="absolute" style={{ left: ombro.x * ESCALA, top: ombro.y * ESCALA - 6, transform: `translate(-50%, -100%) rotate(${pose.tronco * 0.5}deg)` }}>
                        <span className="block rounded-full" style={{ boxShadow: ganhou ? "0 0 0 3px #fcd34d" : `0 0 0 2px ${c.cor}` }}><Avatar email={c.email} tamanho={46} /></span>
                      </div>
                      {ganhou && <span className="absolute text-xl" style={{ left: ombro.x * ESCALA, top: ombro.y * ESCALA - 80, transform: "translateX(-50%)" }}>👑</span>}
                    </div>
                    {/* sombra no chão */}
                    <div className="absolute rounded-full" style={{ left: px(x), bottom: 12, width: 40 - alto * 0.3, height: 6, background: "#000", opacity: 0.35 - alto * 0.004, transform: "translateX(-50%)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* resultado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" data-resultado-corrida style={{ opacity: terminou ? 1 : 0.35, transition: "opacity .5s" }}>
        {corredores.map((c, i) => (
          <div key={c.id} className={`rounded-xl border p-4 flex items-center gap-3 ${i === 0 && terminou ? "border-amber-500/50 bg-gradient-to-br from-amber-950/40 to-slate-900" : "border-slate-800 bg-slate-900/80"}`} data-lugar={i + 1}>
            <span className="text-3xl">{MEDALHAS[i] || `${i + 1}º`}</span>
            <Avatar email={c.email} tamanho={40} />
            <div className="min-w-0"><p className="text-sm font-black text-white truncate">{c.nome}</p><p className="text-[10px] uppercase font-bold text-slate-500">{rotuloMetrica}</p><p className="text-base font-black text-amber-300">{formatarValor(c.valor)}</p></div>
          </div>
        ))}
      </div>
      {semMovimento && <p className="text-xs text-slate-500 text-center" data-corrida-vazia>Ainda não há resultado neste período para largar. Troque o período ou a métrica.</p>}
    </div>
  );
}
