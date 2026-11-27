// Tira o fundo liso de estúdio (cinza, bege, branco sujo…) de uma foto de produto, sem IA: o fundo é o que está ligado às bordas da foto e tem a
// cor dos cantos; o produto é o resto. Funciona sobre RGBA puro (testável sem navegador). Devolve a foto com o fundo transparente (e uma borda
// suavizada de 1 px, com a cor do fundo descontada para não ficar contorno cinza no branco).

import { corDeFundo } from "./guiaMedidas";

const TOL_GLOBAL = 42;   // diferença máxima (por canal) para o pixel ser "cor do fundo"
const TOL_LOCAL = 5;     // degradê do fundo (vinheta/sombra suave): vizinho quase igual ao pixel que já é fundo...
const TOL_TETO = 64;     // ...até esta distância da cor do fundo
const TOL_FURO = 10;     // áreas fechadas (vão da alça, por exemplo) só viram fundo se forem praticamente a cor do fundo
const FRACAO_MIN = 0.05, FRACAO_MAX = 0.97, BORDA_MIN = 0.55; // fora disso o fundo não é liso (cena) ou o produto some: não mexe na foto

export interface ResultadoRecorte { rgba: Uint8ClampedArray; removido: boolean; fracaoFundo: number }

/** Rotula componentes conexos (4 vizinhos) de `marca`; devolve o id de cada pixel (0 = fora) e o tamanho de cada id. */
function rotular(marca: Uint8Array, w: number, h: number): { ids: Int32Array; tamanhos: number[] } {
  const ids = new Int32Array(w * h); const tamanhos: number[] = [0]; const pilha = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!marca[s] || ids[s]) continue;
    const id = tamanhos.length; let topo = 0, tam = 0; pilha[topo++] = s; ids[s] = id;
    while (topo) {
      const i = pilha[--topo]; tam++; const x = i % w;
      if (x > 0 && marca[i - 1] && !ids[i - 1]) { ids[i - 1] = id; pilha[topo++] = i - 1; }
      if (x < w - 1 && marca[i + 1] && !ids[i + 1]) { ids[i + 1] = id; pilha[topo++] = i + 1; }
      if (i >= w && marca[i - w] && !ids[i - w]) { ids[i - w] = id; pilha[topo++] = i - w; }
      if (i < w * (h - 1) && marca[i + w] && !ids[i + w]) { ids[i + w] = id; pilha[topo++] = i + w; }
    }
    tamanhos.push(tam);
  }
  return { ids, tamanhos };
}

function distancias(rgba: ArrayLike<number>, n: number, fundo: [number, number, number]): Uint8Array {
  const d = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if ((rgba[i * 4 + 3] ?? 255) < 20) { d[i] = 0; continue; }
    d[i] = Math.min(255, Math.max(Math.abs(rgba[i * 4] - fundo[0]), Math.abs(rgba[i * 4 + 1] - fundo[1]), Math.abs(rgba[i * 4 + 2] - fundo[2])));
  }
  return d;
}

/** A foto tem fundo liso (estúdio) ou é uma cena? Liso = quase todo o anel de 2 px das bordas tem a cor dos cantos. */
export function classificarFundo(rgba: ArrayLike<number>, w: number, h: number): "liso" | "cena" {
  const d = distancias(rgba, w * h, corDeFundo(rgba, w, h)); let total = 0, fundo = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x > 1 && x < w - 2 && y > 1 && y < h - 2) { x = w - 2; continue; }
    total++; if (d[y * w + x] <= TOL_GLOBAL) fundo++;
  }
  return total > 0 && fundo / total >= 0.9 ? "liso" : "cena";
}

export function removerFundo(rgba: ArrayLike<number>, w: number, h: number): ResultadoRecorte {
  const n = w * h; const copia = new Uint8ClampedArray(n * 4); for (let i = 0; i < n * 4; i++) copia[i] = rgba[i];
  const fundo = corDeFundo(rgba, w, h); const d = distancias(rgba, n, fundo);
  const dif = (i: number, j: number) => Math.max(Math.abs(rgba[i * 4] - rgba[j * 4]), Math.abs(rgba[i * 4 + 1] - rgba[j * 4 + 1]), Math.abs(rgba[i * 4 + 2] - rgba[j * 4 + 2]));

  // 1) fundo = o que se liga às bordas e é da cor do fundo (aceita degradê suave)
  const noFundo = new Uint8Array(n); const pilha = new Int32Array(n); let topo = 0;
  const semear = (i: number) => { if (!noFundo[i] && d[i] <= TOL_GLOBAL) { noFundo[i] = 1; pilha[topo++] = i; } };
  for (let x = 0; x < w; x++) { semear(x); semear((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { semear(y * w); semear(y * w + w - 1); }
  const visitar = (i: number, j: number) => { if (!noFundo[j] && (d[j] <= TOL_GLOBAL || (d[j] <= TOL_TETO && dif(i, j) <= TOL_LOCAL))) { noFundo[j] = 1; pilha[topo++] = j; } };
  while (topo) {
    const i = pilha[--topo]; const x = i % w;
    if (x > 0) visitar(i, i - 1); if (x < w - 1) visitar(i, i + 1); if (i >= w) visitar(i, i - w); if (i < n - w) visitar(i, i + w);
  }

  // 2) vãos fechados (dentro da alça, entre a tira e o corpo) que são só fundo
  const cand = new Uint8Array(n); for (let i = 0; i < n; i++) if (!noFundo[i] && d[i] <= TOL_FURO) cand[i] = 1;
  const furos = rotular(cand, w, h); const minFuro = Math.max(250, Math.round(n * 0.0012));
  for (let i = 0; i < n; i++) if (furos.ids[i] && furos.tamanhos[furos.ids[i]] >= minFuro) noFundo[i] = 1;

  // 3) poeira: pedaços minúsculos soltos do produto viram fundo
  const prod = new Uint8Array(n); for (let i = 0; i < n; i++) prod[i] = noFundo[i] ? 0 : 1;
  const pedacos = rotular(prod, w, h); const maior = Math.max(0, ...pedacos.tamanhos);
  for (let i = 0; i < n; i++) if (pedacos.ids[i] && pedacos.tamanhos[pedacos.ids[i]] < Math.max(40, maior * 0.02)) noFundo[i] = 1;

  let qtdFundo = 0; for (let i = 0; i < n; i++) qtdFundo += noFundo[i];
  const fracaoFundo = qtdFundo / n;
  // fundo liso = a maior parte das bordas da foto é fundo (foto ampliada pode ter produto saindo pela borda, mas não a maioria dela)
  let borda = 0, bordaFundo = 0;
  for (let x = 0; x < w; x++) { borda += 2; bordaFundo += noFundo[x] + noFundo[(h - 1) * w + x]; }
  for (let y = 1; y < h - 1; y++) { borda += 2; bordaFundo += noFundo[y * w] + noFundo[y * w + w - 1]; }
  if (fracaoFundo < FRACAO_MIN || fracaoFundo > FRACAO_MAX || bordaFundo / borda < BORDA_MIN) return { rgba: copia, removido: false, fracaoFundo };

  // 4) transparência: 0 no fundo, 255 no produto, rampa suave na faixa de 1 px entre os dois (com a cor do fundo descontada)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; const eh = noFundo[i]; let borda = false;
    for (let dy = -1; dy <= 1 && !borda; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if ((dx || dy) && xx >= 0 && xx < w && yy >= 0 && yy < h && noFundo[yy * w + xx] !== eh) { borda = true; break; }
    }
    let a = eh ? 0 : 255;
    if (borda) a = Math.round(Math.min(1, Math.max(0, (d[i] - 8) / (TOL_GLOBAL + 2 - 8))) * 255);
    if ((rgba[i * 4 + 3] ?? 255) < 20) a = 0;
    if (a > 0 && a < 255) { const k = a / 255; for (let c = 0; c < 3; c++) copia[i * 4 + c] = Math.min(255, Math.max(0, Math.round((rgba[i * 4 + c] - (1 - k) * fundo[c]) / Math.max(k, 0.15)))); }
    copia[i * 4 + 3] = a;
  }
  return { rgba: copia, removido: true, fracaoFundo };
}
