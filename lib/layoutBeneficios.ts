// Geometria da imagem de benefícios (sem navegador, testável): coluna da esquerda com título em 2 linhas, risco de destaque, benefícios com
// ícone redondo + título + descrição, pílula da marca no rodapé; produto grande à direita. Os tamanhos seguem o modelo de referência
// (imagem 1254x1254) e encolhem juntos quando há muitos benefícios ou textos longos, para nada passar do espaço.

import type { Retangulo } from "./imagensAnuncio";
import type { BeneficioModelo } from "./beneficiosModelo";
import { colide, type Mascara } from "./guiaMedidas";

export type MedirTexto = (texto: string, px: number, peso: number) => number;

export interface ItemBeneficio {
  circulo: { cx: number; cy: number; r: number };
  xTexto: number;
  titulo: { linhas: string[]; ys: number[] };
  descricao: { linhas: string[]; ys: number[] };
  /** y da linha fina entre este item e o próximo (null no último) */
  separador: number | null;
}
export interface LayoutBeneficios {
  esc: number;
  fontes: { linha1: number; linha2: number; titulo: number; descricao: number; rodape: number };
  linha1: { x: number; y: number }; linha2: { x: number; y: number };
  risco: { x: number; y: number; w: number; esp: number };
  itens: ItemBeneficio[];
  colunaX1: number;
  pilula: Retangulo;
  produto: Retangulo;
  /** título (linhas e risco): o produto pode subir por trás deles, mas sem encostar */
  obstaculos: Retangulo[];
  /** true quando coube sem passar do espaço (com a menor escala testada, ainda cabendo ou não) */
  coube: boolean;
}
export interface EntradaBeneficios {
  W: number; H: number;
  linha1: string; linha2: string;
  beneficios: BeneficioModelo[];
  medir: MedirTexto;
}

/** Quebra o texto em linhas de no máximo `larguraMax` px (palavras inteiras; uma palavra maior que a linha fica sozinha). */
export function quebrarLinhas(texto: string, larguraMax: number, px: number, peso: number, medir: MedirTexto, maxLinhas = 99): string[] {
  const palavras = String(texto || "").split(/\s+/).filter(Boolean); const linhas: string[] = []; let atual = "";
  for (const p of palavras) {
    const teste = atual ? atual + " " + p : p;
    if (!atual || medir(teste, px, peso) <= larguraMax) atual = teste; else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > maxLinhas) { const resto = linhas.slice(maxLinhas - 1).join(" "); return [...linhas.slice(0, maxLinhas - 1), resto]; }
  return linhas;
}

export function calcularLayoutBeneficios(e: EntradaBeneficios): LayoutBeneficios {
  const { W, H } = e; const k = Math.min(W, H) / 1254;
  const margem = Math.round(52 * k); const colunaX1 = Math.round(W * 0.405);
  const larguraCol = colunaX1 - margem;
  const rodapeH = Math.round(64 * k), rodapeY = H - margem - rodapeH;
  const pilula: Retangulo = { x: margem, y: rodapeY, w: Math.round(larguraCol * 0.98), h: rodapeH };
  const produto: Retangulo = { x: Math.round(W * 0.42), y: Math.round(H * 0.07), w: Math.round(W * 0.56), h: Math.round(H * 0.86) };
  const itensTexto = e.beneficios.filter((b) => b.titulo);
  const temTitulo = !!(e.linha1 || e.linha2);

  // o título pode passar um pouco da coluna (como no modelo), mas não de 58% da largura; passando da coluna, o produto desce para ficar abaixo dele
  const w1 = e.linha1 ? e.medir(e.linha1, 94 * k, 300) : 0, w2 = e.linha2 ? e.medir(e.linha2, 94 * k, 800) : 0;
  const ajusteTitulo = Math.min(1, (W * 0.58 - margem) / Math.max(w1, w2, 1));
  let esc = 1, melhor: LayoutBeneficios | null = null;
  for (let tentativa = 0; tentativa < 24; tentativa++, esc = Math.max(0.5, esc - 0.03)) {
    const f = { linha1: 94 * k * esc * ajusteTitulo, linha2: 94 * k * esc * ajusteTitulo, titulo: 30 * k * esc, descricao: 21 * k * esc, rodape: 26 * k * esc };
    // cabeçalho
    const y1 = margem + f.linha1 * 0.98 + 28 * k, y2 = y1 + f.linha2 * 1.18;
    const riscoY = y2 + 40 * k * esc; const topoItens = temTitulo ? riscoY + 50 * k * esc : margem + 20 * k;
    const fimItens = rodapeY - 34 * k;
    // itens
    const circR = 58 * k * esc; const xTexto = margem + circR * 2 + 28 * k * esc; const larguraTexto = colunaX1 - xTexto;
    const medidos = itensTexto.map((b) => ({
      t: quebrarLinhas(b.titulo, larguraTexto, f.titulo, 700, e.medir, 2),
      d: quebrarLinhas(b.descricao, larguraTexto, f.descricao, 400, e.medir, 3),
    }));
    const altura = (m: { t: string[]; d: string[] }) => m.t.length * f.titulo * 1.2 + (m.d.length ? 8 * k * esc + m.d.length * f.descricao * 1.22 : 0);
    const alturaMax = Math.max(circR * 2, ...medidos.map(altura), 1);
    const espaco = Math.max(fimItens - topoItens, 1); const n = Math.max(medidos.length, 1);
    const passo = Math.min(espaco / n, alturaMax + 40 * k * esc, 190 * k);
    const cabe = medidos.length === 0 || (passo >= alturaMax + 12 * k * esc && linhasCabem(larguraTexto, medidos, e.medir, f));
    const itens: ItemBeneficio[] = medidos.map((m, i) => {
      const cy = topoItens + passo * i + passo / 2; const h = altura(m); const topo = cy - h / 2;
      const ysT = m.t.map((_, j) => topo + f.titulo * (1.0 + 1.2 * j));
      const base = topo + m.t.length * f.titulo * 1.2 + 8 * k * esc;
      const ysD = m.d.map((_, j) => base + f.descricao * (0.95 + 1.22 * j));
      return { circulo: { cx: margem + circR, cy, r: circR }, xTexto, titulo: { linhas: m.t, ys: ysT }, descricao: { linhas: m.d, ys: ysD }, separador: i < medidos.length - 1 ? topoItens + passo * (i + 1) : null };
    });
    const larguraTitulo = Math.max(w1, w2) * ajusteTitulo * esc;
    const prodY = temTitulo && larguraTitulo > larguraCol ? Math.round(y2 + 36 * k * esc) : produto.y;
    const obstaculos: Retangulo[] = [];
    if (e.linha1) obstaculos.push({ x: margem, y: y1 - f.linha1 * 0.85, w: w1 * ajusteTitulo * esc, h: f.linha1 * 1.1 });
    if (e.linha2) obstaculos.push({ x: margem, y: y2 - f.linha2 * 0.85, w: w2 * ajusteTitulo * esc, h: f.linha2 * 1.1 });
    if (temTitulo) obstaculos.push({ x: margem, y: riscoY, w: 107 * k * esc, h: Math.max(3, 3.4 * k) });
    const l: LayoutBeneficios = { esc, fontes: f, linha1: { x: margem, y: y1 }, linha2: { x: margem, y: y2 }, risco: { x: margem, y: riscoY, w: 107 * k * esc, esp: Math.max(3, 3.4 * k) }, itens, colunaX1, pilula, produto: { ...produto, y: prodY, h: Math.max(H - margem - prodY, 1) }, obstaculos, coube: cabe };
    melhor = l; if (cabe) return l;
  }
  return melhor!;
}

function linhasCabem(larguraTexto: number, medidos: { t: string[]; d: string[] }[], medir: MedirTexto, f: { titulo: number; descricao: number }): boolean {
  return medidos.every((m) => m.t.every((l) => medir(l, f.titulo, 700) <= larguraTexto + 0.5) && m.d.every((l) => medir(l, f.descricao, 400) <= larguraTexto + 0.5));
}

export type TipoIcone = "escudo" | "setas" | "ondas" | "cabeca" | "termometro" | "caixa" | "check";

/** Ícone do benefício pelo assunto do texto (sem IA); sem palavra-chave conhecida, usa o check. */
export function tipoIcone(texto: string): TipoIcone {
  const t = String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/termic|gelad|geladeira|frio|isolamento|conserva|fresc/.test(t)) return "termometro";
  if (/elastic|flexi|ajustavel|adapta|esticavel/.test(t)) return "setas";
  if (/liso|arrasto|agua|hidro|impermeav|respingo|lavavel|secagem/.test(t)) return "ondas";
  if (/anatom|ergonom|conforto|encaixe|ajuste perfeito|alca acolchoada|ombro/.test(t)) return "cabeca";
  if (/capacidade|espaco|litros|compartiment|bolso|organiz|cabe /.test(t)) return "caixa";
  if (/silicone|material|premium|resisten|qualidade|original|garantia|durabil|reforcad/.test(t)) return "escudo";
  return "check";
}

/**
 * Onde desenhar o produto: o maior possível na área da direita (quase a imagem inteira, de cima a baixo), sem encostar no título nem nas
 * colunas de benefícios. Usa a máscara do produto: a alça/tira fina pode subir ao lado do título; tenta centralizado e, se bater, encolhe
 * ou encosta embaixo/à direita. Sem máscara útil, usa a caixa `l.produto`.
 */
export function colocarProduto(l: LayoutBeneficios, W: number, H: number, fotoW: number, fotoH: number, mascara: Mascara | null): Retangulo {
  const k = Math.min(W, H) / 1254; const folga = 14 * k;
  const x0 = l.colunaX1 + W * 0.012, y0 = H * 0.035, area: Retangulo = { x: x0, y: y0, w: W - x0 - W * 0.02, h: H * 0.93 };
  if (!mascara || fotoW <= 0 || fotoH <= 0) return l.produto;
  const fitMax = Math.min(area.w / fotoW, area.h / fotoH);
  const ancoras: [number, number][] = [[0.5, 0.5], [0.5, 1], [1, 0.5], [1, 1], [0, 1], [0.5, 0]]; // horizontal, vertical (0 = esquerda/topo, 1 = direita/baixo)
  for (let s = 1; s >= 0.5; s -= 0.02) {
    const w = fotoW * fitMax * s, h = fotoH * fitMax * s;
    for (const [ax, ay] of ancoras) {
      const r: Retangulo = { x: area.x + (area.w - w) * ax, y: area.y + (area.h - h) * ay, w, h };
      if (!l.obstaculos.some((o) => colide(mascara, r, o, folga))) return r;
    }
  }
  return l.produto;
}
