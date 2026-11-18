"use client";
// Bancada de Vendas: cada analista atende, no seu balcão, uma fila enorme de clientes. A cada cliente ele entrega uma caixinha e sobe
// um balão de "cliente feliz". Quem tem o melhor resultado na métrica escolhida atende mais clientes (a fila é ilustrativa).
import React, { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../Avatar";
import { andamento, baloes, balanco, ciclo, clientesAtendidos, filaVisivel } from "../../../lib/bancadaRanking";

export interface Atendente { id: string; nome: string; email: string; valor: number; cor: string; canais: number }

const DURACAO_MS = 14000;
const ALTURA = 190;                // px da cena
const CHAO = ALTURA - 22;          // linha do chão
const ALT_BALCAO = 54;
const MEDALHAS = ["🥇", "🥈", "🥉"];
const PELES = ["#f5d0b0", "#e0ac80", "#c68a5c", "#8d5a3a", "#f0c8a0"];
const CAMISAS = ["#38bdf8", "#f472b6", "#a3e635", "#fb923c", "#c084fc", "#facc15", "#2dd4bf", "#f87171"];
const CABELOS = ["#2b1b12", "#5a3a22", "#16120f", "#a16207", "#7c2d12", "#374151"];
const CARINHAS = ["😊", "😄", "🥰", "😃"];
const mistura = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (n: number) => { let x = Math.imul(n + 1, 2654435761) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; return (x ^ (x >>> 16)) >>> 0; };

function Caixinha({ x, y, lado = 18 }: { x: number; y: number; lado?: number }) {
  return (
    <g transform={`translate(${x - lado / 2} ${y - lado / 2})`} data-caixa>
      <rect width={lado} height={lado} rx="2" fill="#c8924f" stroke="#8a5a26" strokeWidth="1" />
      <rect x={lado / 2 - 2} width="4" height={lado} fill="#f5e3b3" opacity="0.9" />
      <rect y={lado * 0.18} width={lado} height="2" fill="#8a5a26" opacity="0.35" />
    </g>
  );
}

/** Cliente de pé na fila; `segurando` mostra a caixinha nas mãos. */
function Cliente({ x, y, j, segurando, balanco: bal = 0 }: { x: number; y: number; j: number; segurando: boolean; balanco?: number }) {
  const h = hash(j);
  const pele = PELES[h % PELES.length], camisa = CAMISAS[(h >>> 3) % CAMISAS.length], cabelo = CABELOS[(h >>> 6) % CABELOS.length];
  const calca = ["#334155", "#475569", "#1e3a5f", "#3f3f46"][(h >>> 9) % 4];
  const passo = bal * 3;
  return (
    <g transform={`translate(${x} ${y}) scale(1.15)`} data-cliente={j}>
      <ellipse cx="0" cy="0" rx="12" ry="3" fill="#000" opacity="0.28" />
      <path d={`M-4 -20 L${-4 - passo} -3 M4 -20 L${4 + passo} -3`} stroke={calca} strokeWidth="5" strokeLinecap="round" fill="none" />
      <rect x="-9" y="-40" width="18" height="22" rx="6" fill={camisa} />
      <path d={segurando ? "M-8 -36 L-12 -26 L-3 -24" : "M-8 -36 L-11 -22"} stroke={camisa} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={segurando ? "M8 -36 L12 -26 L3 -24" : "M8 -36 L11 -22"} stroke={camisa} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="0" cy="-49" r="9.5" fill={pele} />
      <path d="M-9.5 -50 A9.5 9.5 0 0 1 9.5 -50 Q4 -54 -9.5 -50 Z" fill={cabelo} />
      {segurando && <Caixinha x={0} y={-24} lado={14} />}
    </g>
  );
}

function Balaozinho({ x, y, texto, opacidade }: { x: number; y: number; texto: string; opacidade: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacidade} data-balao>
      <path d="M-16 -15 h32 a8 8 0 0 1 8 8 v12 a8 8 0 0 1 -8 8 h-18 l-6 8 l-1 -8 h-7 a8 8 0 0 1 -8 -8 v-12 a8 8 0 0 1 8 -8 z" transform="scale(0.95) translate(0 -8)" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
      <text x="0" y="4" textAnchor="middle" fontSize="17">{texto}</text>
    </g>
  );
}

function Cena({ largura, s, cor, nome, avatarEmail, vencedor }: { largura: number; s: number; cor: string; nome: string; avatarEmail: string; vencedor: boolean }) {
  const c = ciclo(s);
  const xAtendente = largura * 0.14, xBalcao0 = largura * 0.03, wBalcao = largura * 0.23;
  const xCliente0 = Math.max(largura * 0.36, xBalcao0 + wBalcao + 40);
  const espaco = Math.min(46, Math.max(30, largura * 0.062));
  const xLugar = (lugar: number) => xCliente0 + lugar * espaco;
  const topoBalcao = CHAO - ALT_BALCAO;
  const ombro = { x: xAtendente + 14, y: topoBalcao - 30 };
  const repouso = { x: xAtendente + 26, y: topoBalcao - 8 };
  const alcance = { x: xCliente0 - 20, y: topoBalcao - 14 };
  const mao = { x: mistura(repouso.x, alcance.x, c.alcance), y: mistura(repouso.y, alcance.y, c.alcance) };
  const caixaNaMao = c.f < 0.5 && s >= 0 && c.alcance >= 0;
  const fila = filaVisivel(s, Math.ceil((largura - xCliente0) / espaco) + 2);
  const bal = baloes(s);

  return (
    <svg width={largura} height={ALTURA} viewBox={`0 0 ${largura} ${ALTURA}`} role="img" aria-label={`Bancada de ${nome}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`parede-${avatarEmail}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1b2434" /><stop offset="1" stopColor="#222c3d" /></linearGradient>
      </defs>
      <rect width={largura} height={CHAO} fill={`url(#parede-${avatarEmail})`} />
      <rect y={CHAO} width={largura} height={ALTURA - CHAO} fill="#2e3646" />
      <rect y={CHAO} width={largura} height="2" fill="#475569" />
      {Array.from({ length: Math.ceil(largura / 64) }).map((_, i) => <rect key={i} x={i * 64 + 20} y={CHAO + 8} width="26" height="2" rx="1" fill="#3a4357" />)}

      {/* atendente atrás do balcão */}
      <rect x={xAtendente - 20} y={topoBalcao - 56} width="44" height="60" rx="14" fill={cor} />
      <rect x={xAtendente - 20} y={topoBalcao - 56} width="44" height="60" rx="14" fill="#000" opacity="0.18" />
      <path d={`M${xAtendente - 14} ${topoBalcao - 40} L${xAtendente - 24} ${topoBalcao - 12}`} stroke={cor} strokeWidth="8" strokeLinecap="round" />
      <path d={`M${ombro.x} ${ombro.y} L${mao.x} ${mao.y}`} stroke={cor} strokeWidth="8" strokeLinecap="round" />
      <circle cx={mao.x} cy={mao.y} r="5" fill="#f1c9a5" />
      {caixaNaMao && <Caixinha x={mistura(mao.x + 2, mao.x + 10, c.alcance)} y={mao.y - 8} />}

      {/* balcão */}
      <rect x={xBalcao0} y={topoBalcao} width={wBalcao} height={ALT_BALCAO} rx="4" fill={cor} />
      <rect x={xBalcao0} y={topoBalcao} width={wBalcao} height={ALT_BALCAO} rx="4" fill="#000" opacity="0.25" />
      <rect x={xBalcao0 - 4} y={topoBalcao - 5} width={wBalcao + 8} height="9" rx="3" fill={cor} />
      <rect x={xBalcao0 - 4} y={topoBalcao - 5} width={wBalcao + 8} height="3" rx="1.5" fill="#fff" opacity="0.35" />
      <text x={xBalcao0 + wBalcao / 2} y={topoBalcao + 31} textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" opacity="0.95">{nome.split(" ")[0]}</text>
      <Caixinha x={xBalcao0 + 18} y={topoBalcao - 14} />
      <Caixinha x={xBalcao0 + 38} y={topoBalcao - 14} />
      <Caixinha x={xBalcao0 + 28} y={topoBalcao - 32} />

      {/* fila de clientes: do mais distante para o mais próximo, para ninguém ficar atrás de quem está na frente */}
      {fila.slice().reverse().map((q) => {
        const x = xLugar(q.lugar);
        if (x > largura + 30) return null;
        const saindo = q.atendido;
        return (
          <g key={q.j} opacity={saindo ? 1 - q.saida : 1} transform={saindo ? `translate(0 ${q.saida * 34})` : undefined}>
            <Cliente x={x} y={CHAO + 10} j={q.j} segurando={saindo} balanco={saindo ? 0 : balanco(c.desloc)} />
          </g>
        );
      })}

      {/* balões de cliente feliz */}
      {bal.map((b) => <Balaozinho key={b.j} x={xCliente0 + 2} y={CHAO - 86 - b.sobe * 58} texto={CARINHAS[hash(b.j) % CARINHAS.length]} opacidade={b.opacidade} />)}

      {vencedor && <text x={xAtendente + 2} y={17} textAnchor="middle" fontSize="20">👑</text>}
    </svg>
  );
}

export default function BancadaRanking({ atendentes, rotuloMetrica, rotuloPeriodo, formatarValor, menorEMelhor, referencia, dica }: {
  atendentes: Atendente[]; rotuloMetrica: string; rotuloPeriodo: string; formatarValor: (v: number) => string; menorEMelhor: boolean; referencia?: number; dica?: string;
}) {
  const finais = useMemo(() => clientesAtendidos(atendentes.map((a) => ({ id: a.id, valor: a.valor })), menorEMelhor, referencia), [atendentes, menorEMelhor, referencia]);
  const semResultado = atendentes.every((a) => (finais[a.id] || 0) === 0);

  // t = 0..1 (tempo do dia de vendas). Com "reduzir movimento" a cena já aparece no resultado final.
  const [t, setT] = useState(0);
  const [rodada, setRodada] = useState(0);
  const quadro = useRef(0);
  const chave = atendentes.map((a) => `${a.id}:${a.valor}`).join("|") + `|${menorEMelhor}|${referencia ?? ""}|${rodada}`;
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

  // largura da cena (o desenho acompanha a tela)
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(720);
  useEffect(() => {
    const el = caixa.current; if (!el) return;
    const medir = () => setLargura(Math.max(560, Math.round(el.getBoundingClientRect().width)));
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el); window.addEventListener("resize", medir);
    return () => { ro?.disconnect(); window.removeEventListener("resize", medir); };
  }, []);

  const u = andamento(t);
  const terminou = t >= 1;

  return (
    <div className="space-y-4" data-bancada>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider">🛍️ Bancada de vendas · {rotuloMetrica}</h2>
          <p className="text-[11px] text-slate-500">{rotuloPeriodo}. {dica ? `${dica}. ` : ""}Quanto melhor o resultado, mais clientes a bancada atende (a fila é ilustrativa, não são clientes reais).</p>
        </div>
        <button type="button" data-atender-de-novo onClick={() => setRodada((r) => r + 1)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border bg-slate-950 border-slate-700 text-slate-200 hover:text-white hover:border-slate-500">▶ Atender de novo</button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3 sm:p-4" data-balcoes>
        <div className="overflow-x-auto">
          <div className="min-w-[640px] space-y-2">
            {atendentes.map((a, idx) => {
              const n = finais[a.id] || 0;
              const s = n * u;
              const exibido = a.valor * (menorEMelhor || n === 0 ? 1 : s / n);
              const vencedor = terminou && idx === 0 && !semResultado;
              return (
                <div key={a.id} className="flex items-stretch" data-raia={a.email}>
                  <div className="w-28 sm:w-36 shrink-0 pr-3 flex flex-col justify-center border-r border-slate-800">
                    <span className="flex items-center gap-1.5 text-xs font-black text-white"><span className="w-1.5 h-4 rounded shrink-0" style={{ background: a.cor }} /><span className="truncate">{a.nome}</span></span>
                    <span className="text-[10px] text-slate-500">{a.canais} canal(is)</span>
                    <span className="mt-1 text-sm sm:text-base font-black text-amber-300 tabular-nums" data-valor-atendente>{formatarValor(exibido)}</span>
                  </div>
                  <div className="relative flex-1 min-w-0 overflow-hidden rounded-lg" style={{ height: ALTURA }} ref={idx === 0 ? caixa : undefined} data-cena data-atendidos={Math.floor(s)} data-total={n} data-s={s.toFixed(3)}>
                    <Cena largura={largura} s={s} cor={a.cor} nome={a.nome} avatarEmail={a.email} vencedor={vencedor} />
                    <div className="absolute" style={{ left: largura * 0.14 - 22, top: ALTURA - ALT_BALCAO - 22 - 56 - 38 }}>
                      <span className="block rounded-full" style={{ boxShadow: vencedor ? "0 0 0 3px #fcd34d" : `0 0 0 2px ${a.cor}` }}><Avatar email={a.email} tamanho={44} /></span>
                    </div>
                    {n === 0 && <span className="absolute right-3 top-3 text-[11px] text-slate-400 bg-slate-950/70 rounded-full px-2 py-0.5">sem resultado no período</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* resultado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" data-resultado-bancada style={{ opacity: terminou ? 1 : 0.35, transition: "opacity .5s" }}>
        {atendentes.map((a, i) => (
          <div key={a.id} className={`rounded-xl border p-4 flex items-center gap-3 ${i === 0 && terminou ? "border-amber-500/50 bg-gradient-to-br from-amber-950/40 to-slate-900" : "border-slate-800 bg-slate-900/80"}`} data-lugar={i + 1}>
            <span className="text-3xl">{MEDALHAS[i] || `${i + 1}º`}</span>
            <Avatar email={a.email} tamanho={40} />
            <div className="min-w-0"><p className="text-sm font-black text-white truncate">{a.nome}</p><p className="text-[10px] uppercase font-bold text-slate-500">{rotuloMetrica}</p><p className="text-base font-black text-amber-300">{formatarValor(a.valor)}</p></div>
          </div>
        ))}
      </div>
      {semResultado && <p className="text-xs text-slate-500 text-center" data-bancada-vazia>Ainda não há resultado neste período para atender clientes. Troque o período ou a métrica.</p>}
    </div>
  );
}
