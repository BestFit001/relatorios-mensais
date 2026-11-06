"use client";
// Desenha um slide da Apresentação Time no estilo do modelo da Best Fit (fundo branco, logo no canto, título em caixa alta).
// O slide é desenhado num "palco" fixo de 1920x1080 e escalado para caber no espaço disponível.
// Dois modos de posição: automático (títulos e blocos empilhados) e livre (cada elemento tem x/y/largura; no editor dá para arrastar).
import React, { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { congelarSlide, type Bloco, type Caixa, type Medidas, type Pos, type Slide } from "../../lib/apresentacao";

export const LARGURA = 1920;
export const ALTURA = 1080;
const FONTE = "Poppins, 'Segoe UI', Roboto, Arial, sans-serif";
const TAM_TEXTO = { p: 28, m: 34, g: 44 } as const;
const COR_TEXTO = { normal: "#222222", vermelho: "#e60000", cinza: "#666666" } as const;

/** Ligação com o editor: elemento selecionado e como avisar de seleção/mudança. */
export interface EdicaoSlide { selecionado: string | null; onSelecionar: (id: string | null) => void; onMudar: (s: Slide) => void }

function BlocoView({ b }: { b: Bloco }) {
  if (b.tipo === "metricas") {
    const colunas = Math.min(Math.max(b.itens.length, 1), 4);
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`, columnGap: 48, rowGap: 28 }}>
        {b.itens.map((it, i) => (
          <div key={i} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 300, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>{it.rotulo}</div>
            <div style={{ fontSize: 58, fontWeight: 700, color: "#111", marginTop: 6, lineHeight: 1.15, overflowWrap: "anywhere" }}>{it.valor}</div>
          </div>
        ))}
      </div>
    );
  }
  if (b.tipo === "texto") {
    const alinhar = b.centralizar ? "center" : "left";
    return (
      <div style={{ textAlign: alinhar, maxWidth: b.centralizar ? 1500 : undefined, margin: b.centralizar ? "0 auto" : undefined }}>
        {b.titulo && <div style={{ fontSize: 40, fontWeight: 700, color: "#222", marginBottom: 14 }}>{b.titulo}</div>}
        {b.texto && <div style={{ fontSize: TAM_TEXTO[b.tamanho], fontWeight: b.cor === "vermelho" ? 700 : 400, color: COR_TEXTO[b.cor], whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{b.texto}</div>}
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 24, alignItems: "stretch", width: "100%", height: "100%" }}>
      {b.urls.map((u, i) => (
        <div key={i} data-img-i={i} style={{ flex: "1 1 0", minWidth: 0, minHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
        </div>
      ))}
      {b.urls.length === 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb", fontSize: 30, border: "3px dashed #ddd", borderRadius: 16 }}>imagens aparecem aqui</div>}
    </div>
  );
}

function Cabecalho() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bestfit-logo.png" alt="bestfit" draggable={false} style={{ position: "absolute", top: 26, right: 128, height: 56 }} />
      <div style={{ position: "absolute", top: 110, left: 0, right: 0, height: 2, background: "#9a9a9a" }} />
    </>
  );
}

/** O slide em tamanho "real" (1920x1080). Com `ed`, os elementos ficam selecionáveis (contorno + alça de tamanho). */
export function SlideCanvas({ slide, ed }: { slide: Slide; ed?: EdicaoSlide }) {
  const base: CSSProperties = { position: "relative", width: LARGURA, height: ALTURA, background: "#fff", color: "#222", fontFamily: FONTE, overflow: "hidden" };
  const pos = slide.posicoes || {};
  const estiloEdicao = ed ? <style>{".sl-ed [data-el]{cursor:move}.sl-ed [data-el]:hover{outline:3px dashed rgba(99,102,241,.6);outline-offset:2px}"}</style> : null;

  /** Elemento arrastável: com posição própria vai para o palco (absoluto); senão fica no fluxo do layout automático. */
  const el = (id: string, node: ReactNode, estiloAuto: CSSProperties = {}): { id: string; livre: boolean; node: ReactNode } => {
    const p: Pos | undefined = pos[id];
    const selecionado = !!ed && ed.selecionado === id;
    const estilo: CSSProperties = p ? { position: "absolute", left: p.x, top: p.y, width: p.w, height: p.h } : { position: "relative", ...estiloAuto };
    return {
      id, livre: !!p,
      node: (
        <div key={id} data-el={id} style={{ ...estilo, boxSizing: "border-box", outline: selecionado ? "5px solid #6366f1" : undefined, outlineOffset: 2 }}>
          {node}
          {selecionado && <div data-handle style={{ position: "absolute", right: -18, bottom: -18, width: 34, height: 34, background: "#6366f1", border: "5px solid #fff", borderRadius: 10, cursor: "nwse-resize", zIndex: 5, boxShadow: "0 2px 6px rgba(0,0,0,.4)" }} />}
        </div>
      ),
    };
  };

  if (slide.layout === "imagem") {
    return (
      <div style={base}>
        {slide.imagem && /* eslint-disable-next-line @next/next/no-img-element */
          <img src={slide.imagem} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />}
      </div>
    );
  }

  if (slide.layout === "capa") {
    const t = el("titulo", <div style={{ textAlign: "center", fontSize: 44, fontWeight: 700, color: "#000" }}>{slide.titulo}</div>, { position: "absolute", top: 770, left: 100, right: 100 });
    const s = el("subtitulo", <div style={{ textAlign: "center", fontSize: 44, fontWeight: 300, letterSpacing: "0.22em", color: "#000" }}>{slide.subtitulo}</div>, { position: "absolute", top: 860, left: 100, right: 100 });
    return (
      <div style={base} className={ed ? "sl-ed" : undefined}>
        {estiloEdicao}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bestfit-logo.png" alt="bestfit" draggable={false} style={{ position: "absolute", top: 300, left: "50%", transform: "translateX(-50%)", width: 600 }} />
        {t.node}{s.node}
      </div>
    );
  }

  if (slide.layout === "secao") {
    const t = el("titulo", <div style={{ textAlign: "center", fontSize: 64, fontWeight: 700, color: "#222", lineHeight: 1.15 }}>{slide.titulo}</div>, { position: "absolute", left: 118, right: 118, top: 600, transform: "translateY(-50%)" });
    return (
      <div style={base} className={ed ? "sl-ed" : undefined}>
        {estiloEdicao}
        <Cabecalho />
        {t.node}
      </div>
    );
  }

  // conteúdo
  const tituloGrande = slide.titulo.length <= 38;
  const t = el("titulo", <div style={{ fontSize: tituloGrande ? 58 : 44, fontWeight: 700, color: "#222", lineHeight: 1.1 }}>{slide.titulo}</div>);
  const s = slide.subtitulo ? el("subtitulo", <div style={{ fontSize: 34, fontWeight: 700, color: "#000" }}>{slide.subtitulo}</div>, { marginTop: 12 }) : null;
  const blocos = slide.blocos.map((b) => el(b.id, <BlocoView b={b} />, b.tipo === "imagens" ? { flex: 1, minHeight: 0, display: "flex" } : {}));
  const todos = [...blocos, t, ...(s ? [s] : [])];   // na posição livre, título e subtítulo ficam por cima dos blocos
  const cabecalhoFluxo = [t, s].filter((x): x is NonNullable<typeof x> => !!x && !x.livre);
  const blocosFluxo = blocos.filter((x) => !x.livre);
  return (
    <div style={base} className={ed ? "sl-ed" : undefined}>
      {estiloEdicao}
      <Cabecalho />
      {cabecalhoFluxo.length > 0 && <div style={{ position: "absolute", top: 136, left: 118, right: 118 }}>{cabecalhoFluxo.map((x) => x.node)}</div>}
      {blocosFluxo.length > 0 && (
        <div style={{ position: "absolute", top: slide.subtitulo ? 300 : 250, bottom: 60, left: 118, right: 118, display: "flex", flexDirection: "column", gap: 44, overflow: ed ? "visible" : "hidden" }}>
          {blocosFluxo.map((x) => x.node)}
        </div>
      )}
      {todos.filter((x) => x.livre).map((x) => x.node)}
    </div>
  );
}

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

interface Arrasto { modo: "mover" | "redim"; id: string; imgI: number; x0: number; y0: number; base: Slide | null; orig: Pos | null }

/** Slide escalado para caber no espaço: `preencher` usa o contêiner inteiro (tela cheia); senão ocupa a largura em 16:9. Com `edicao`, dá para arrastar/redimensionar. */
function SlideFitBase({ slide, preencher = false, className = "", fundo = "#fff", edicao }: { slide: Slide; preencher?: boolean; className?: string; fundo?: string; edicao?: EdicaoSlide }) {
  const ref = useRef<HTMLDivElement>(null);
  const palcoRef = useRef<HTMLDivElement>(null);
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });
  const arrasto = useRef<Arrasto | null>(null);

  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    const medirContainer = () => setCaixa({ w: e.clientWidth, h: e.clientHeight });
    medirContainer();
    const ro = new ResizeObserver(medirContainer);
    ro.observe(e);
    return () => ro.disconnect();
  }, []);

  const escala = preencher ? Math.min(caixa.w / LARGURA, caixa.h / ALTURA) : caixa.w / LARGURA;
  const esquerda = (caixa.w - LARGURA * escala) / 2;
  const topo = preencher ? (caixa.h - ALTURA * escala) / 2 : 0;
  const estado = useRef({ escala, slide, edicao });
  estado.current = { escala, slide, edicao };

  /** Mede (em coordenadas do palco 1920x1080) onde cada elemento está agora. */
  const medir = (): Medidas => {
    const palco = palcoRef.current!;
    const r0 = palco.getBoundingClientRect();
    const k = estado.current.escala || 1;
    const para = (e: Element): Caixa => { const r = e.getBoundingClientRect(); return { x: (r.left - r0.left) / k, y: (r.top - r0.top) / k, w: r.width / k, h: r.height / k }; };
    const m: Medidas = { el: {}, img: {} };
    palco.querySelectorAll("[data-el]").forEach((e) => {
      const id = (e as HTMLElement).dataset.el!;
      m.el[id] = para(e);
      const imgs = Array.from(e.querySelectorAll("[data-img-i]"));
      if (imgs.length > 1) m.img[id] = imgs.map(para);
    });
    return m;
  };

  const aoPressionar = (e: React.PointerEvent<HTMLDivElement>) => {
    const { edicao: ed } = estado.current;
    if (!ed || e.button !== 0) return;
    const alvo = e.target as HTMLElement;
    const elemento = alvo.closest("[data-el]") as HTMLElement | null;
    if (!elemento) { ed.onSelecionar(null); return; }
    const imagem = alvo.closest("[data-img-i]") as HTMLElement | null;
    const id = elemento.dataset.el!;
    ed.onSelecionar(id);
    arrasto.current = { modo: alvo.closest("[data-handle]") ? "redim" : "mover", id, imgI: imagem ? Number(imagem.dataset.imgI) : 0, x0: e.clientX, y0: e.clientY, base: null, orig: null };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const aoMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrasto.current;
    const { edicao: ed, escala: k, slide: atual } = estado.current;
    if (!a || !ed || !k) return;
    if (!a.base) {   // só "congela" o layout quando de fato começa a arrastar (um clique simples só seleciona)
      if (Math.abs(e.clientX - a.x0) + Math.abs(e.clientY - a.y0) < 4) return;
      let base = atual;
      if (!base.posicoes) {
        const r = congelarSlide(base, medir());
        base = r.slide;
        a.id = r.ids[a.id]?.[a.imgI] ?? a.id;
        ed.onSelecionar(a.id);
      }
      a.base = base; a.orig = base.posicoes?.[a.id] ?? null;
      if (!a.orig) { arrasto.current = null; return; }
    }
    const dx = (e.clientX - a.x0) / k, dy = (e.clientY - a.y0) / k;
    const o = a.orig!;
    const nova: Pos = a.modo === "mover"
      ? { ...o, x: Math.round(limitar(o.x + dx, -200, LARGURA - 60)), y: Math.round(limitar(o.y + dy, -100, ALTURA - 40)) }
      : { ...o, w: Math.round(Math.max(80, o.w + dx)), ...(o.h !== undefined ? { h: Math.round(Math.max(60, o.h + dy)) } : {}) };
    ed.onMudar({ ...a.base, posicoes: { ...a.base.posicoes, [a.id]: nova } });
  };

  const aoSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    arrasto.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const editavel = !!edicao;
  return (
    <div ref={ref} className={className}
      onPointerDown={editavel ? aoPressionar : undefined} onPointerMove={editavel ? aoMover : undefined} onPointerUp={editavel ? aoSoltar : undefined} onPointerCancel={editavel ? aoSoltar : undefined}
      style={{ ...(preencher ? { width: "100%", height: "100%" } : { width: "100%", aspectRatio: "16 / 9" }), position: "relative", background: fundo, overflow: "hidden", ...(editavel ? { touchAction: "none", userSelect: "none" } : {}) }}>
      {escala > 0 && (
        <div ref={palcoRef} data-palco-slide style={{ position: "absolute", left: esquerda, top: topo, width: LARGURA, height: ALTURA, transform: `scale(${escala})`, transformOrigin: "top left" }}>
          <SlideCanvas slide={slide} ed={edicao} />
        </div>
      )}
    </div>
  );
}

export const SlideFit = memo(SlideFitBase);
