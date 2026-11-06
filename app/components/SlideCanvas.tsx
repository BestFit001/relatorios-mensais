"use client";
// Desenha um slide da Apresentação Time no estilo do modelo da Best Fit (fundo branco, logo no canto, título em caixa alta).
// O slide é desenhado num "palco" fixo de 1920x1080 e escalado para caber no espaço disponível.
import React, { useEffect, useRef, useState } from "react";
import type { Bloco, Slide } from "../../lib/apresentacao";

export const LARGURA = 1920;
export const ALTURA = 1080;
const FONTE = "Poppins, 'Segoe UI', Roboto, Arial, sans-serif";
const TAM_TEXTO = { p: 28, m: 34, g: 44 } as const;
const COR_TEXTO = { normal: "#222222", vermelho: "#e60000", cinza: "#666666" } as const;

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
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 24, alignItems: "center" }}>
      {b.urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={u} alt="" draggable={false} style={{ flex: "1 1 0", minWidth: 0, maxHeight: "100%", height: "100%", objectFit: "contain" }} />
      ))}
      {b.urls.length === 0 && <div style={{ color: "#bbb", fontSize: 30, border: "3px dashed #ddd", borderRadius: 16, padding: "60px 80px" }}>imagens aparecem aqui</div>}
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

/** O slide em tamanho "real" (1920x1080). */
export function SlideCanvas({ slide }: { slide: Slide }) {
  const base: React.CSSProperties = { position: "relative", width: LARGURA, height: ALTURA, background: "#fff", color: "#222", fontFamily: FONTE, overflow: "hidden" };

  if (slide.layout === "imagem") {
    return (
      <div style={base}>
        {slide.imagem && /* eslint-disable-next-line @next/next/no-img-element */
          <img src={slide.imagem} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />}
      </div>
    );
  }
  if (slide.layout === "capa") {
    return (
      <div style={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bestfit-logo.png" alt="bestfit" draggable={false} style={{ position: "absolute", top: 300, left: "50%", transform: "translateX(-50%)", width: 600 }} />
        <div style={{ position: "absolute", top: 770, left: 100, right: 100, textAlign: "center", fontSize: 44, fontWeight: 700, color: "#000" }}>{slide.titulo}</div>
        <div style={{ position: "absolute", top: 860, left: 100, right: 100, textAlign: "center", fontSize: 44, fontWeight: 300, letterSpacing: "0.22em", color: "#000" }}>{slide.subtitulo}</div>
      </div>
    );
  }
  if (slide.layout === "secao") {
    return (
      <div style={base}>
        <Cabecalho />
        <div style={{ position: "absolute", top: 120, bottom: 0, left: 118, right: 118, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 64, fontWeight: 700, color: "#222", lineHeight: 1.15 }}>{slide.titulo}</div>
      </div>
    );
  }
  const tituloGrande = slide.titulo.length <= 38;
  return (
    <div style={base}>
      <Cabecalho />
      <div style={{ position: "absolute", top: 136, left: 118, right: 118 }}>
        <div style={{ fontSize: tituloGrande ? 58 : 44, fontWeight: 700, color: "#222", lineHeight: 1.1 }}>{slide.titulo}</div>
        {slide.subtitulo && <div style={{ fontSize: 34, fontWeight: 700, color: "#000", marginTop: 12 }}>{slide.subtitulo}</div>}
      </div>
      <div style={{ position: "absolute", top: slide.subtitulo ? 300 : 250, bottom: 60, left: 118, right: 118, display: "flex", flexDirection: "column", gap: 44, overflow: "hidden" }}>
        {slide.blocos.map((b) => <BlocoView key={b.id} b={b} />)}
      </div>
    </div>
  );
}

/** Slide escalado para caber no espaço: `preencher` usa o contêiner inteiro (tela cheia); senão ocupa a largura em 16:9. */
export function SlideFit({ slide, preencher = false, className = "", fundo = "#fff" }: { slide: Slide; preencher?: boolean; className?: string; fundo?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setCaixa({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const escala = preencher ? Math.min(caixa.w / LARGURA, caixa.h / ALTURA) : caixa.w / LARGURA;
  const esquerda = (caixa.w - LARGURA * escala) / 2;
  const topo = preencher ? (caixa.h - ALTURA * escala) / 2 : 0;
  return (
    <div ref={ref} className={className} style={preencher ? { width: "100%", height: "100%", position: "relative", background: fundo, overflow: "hidden" } : { width: "100%", aspectRatio: "16 / 9", position: "relative", background: fundo, overflow: "hidden" }}>
      {escala > 0 && (
        <div style={{ position: "absolute", left: esquerda, top: topo, width: LARGURA, height: ALTURA, transform: `scale(${escala})`, transformOrigin: "top left" }}>
          <SlideCanvas slide={slide} />
        </div>
      )}
    </div>
  );
}
