// Imagem de medidas do gerador: foto grande do produto + caixa "GUIA DE TAMANHO" no canto, capacidade (gota) e setas de altura, largura e
// comprimento desenhadas AO REDOR do corpo do produto. Regra de ouro: texto e caixas só ficam sobre o fundo; nada é desenhado sobre pixels do produto
// (por isso o produto é encolhido/deslocado até as caixas e os rótulos caberem em áreas vazias da foto) e nunca há retângulo branco por cima da foto.

import type { Retangulo } from "./imagensAnuncio";

/** Caixa do corpo do produto, em frações (0..1) da foto. */
export interface CaixaFrac { x0: number; y0: number; x1: number; y1: number }
/** dados[y*w+x] = 1 onde há produto, 0 onde é fundo. */
export interface Mascara { w: number; h: number; dados: Uint8Array }

/** Cor do fundo da foto: mediana dos blocos 3x3 dos 4 cantos. */
export function corDeFundo(rgba: ArrayLike<number>, w: number, h: number): [number, number, number] {
  const r: number[] = [], g: number[] = [], b: number[] = [];
  const blocos: [number, number][] = [[0, 0], [w - 3, 0], [0, h - 3], [w - 3, h - 3]];
  for (const [bx, by] of blocos) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const x = Math.max(0, Math.min(w - 1, bx + dx)), y = Math.max(0, Math.min(h - 1, by + dy)); const i = (y * w + x) * 4;
    if ((rgba[i + 3] ?? 255) < 20) { r.push(255); g.push(255); b.push(255); } else { r.push(rgba[i]); g.push(rgba[i + 1]); b.push(rgba[i + 2]); }
  }
  const med = (v: number[]) => v.sort((p, q) => p - q)[Math.floor(v.length / 2)];
  return [med(r), med(g), med(b)];
}

/** Pixel é produto quando difere do fundo em mais de `tol` em algum canal (transparente = fundo). */
export function criarMascara(rgba: ArrayLike<number>, w: number, h: number, tol = 36): Mascara {
  const fundo = corDeFundo(rgba, w, h); const dados = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if ((rgba[i * 4 + 3] ?? 255) < 20) continue;
    if (Math.abs(rgba[i * 4] - fundo[0]) > tol || Math.abs(rgba[i * 4 + 1] - fundo[1]) > tol || Math.abs(rgba[i * 4 + 2] - fundo[2]) > tol) dados[i] = 1;
  }
  return { w, h, dados };
}

/** Caixa do produto inteiro (tudo que não é fundo). */
export function caixaTotal(m: Mascara): CaixaFrac | null {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.dados[y * m.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0: x0 / m.w, y0: y0 / m.h, x1: (x1 + 1) / m.w, y1: (y1 + 1) / m.h };
}

/**
 * Corpo do produto: as linhas largas (alças e tiras finas ficam de fora, pois ocupam pouca largura). Pega o maior bloco contínuo de linhas com
 * pelo menos 55% da largura da linha mais larga. Se não achar nada confiável, cai na caixa do produto inteiro.
 */
export function caixaDoCorpo(m: Mascara): CaixaFrac {
  const total = caixaTotal(m) || { x0: 0, y0: 0, x1: 1, y1: 1 };
  const cont = new Array<number>(m.h).fill(0);
  for (let y = 0; y < m.h; y++) { let c = 0; for (let x = 0; x < m.w; x++) c += m.dados[y * m.w + x]; cont[y] = c; }
  const max = Math.max(...cont); if (max <= 0) return total;
  const linhas = cont.map((c) => c >= max * 0.55);
  let melhor: [number, number] | null = null, ini = -1;
  for (let y = 0; y <= m.h; y++) {
    if (y < m.h && linhas[y]) { if (ini < 0) ini = y; }
    else if (ini >= 0) { if (!melhor || y - ini > melhor[1] - melhor[0]) melhor = [ini, y]; ini = -1; }
  }
  if (!melhor || melhor[1] - melhor[0] < m.h * 0.08) return total;
  const [ya, yb] = melhor; const altura = yb - ya;
  let xa = m.w, xb = -1;
  for (let x = 0; x < m.w; x++) { let c = 0; for (let y = ya; y < yb; y++) c += m.dados[y * m.w + x]; if (c >= altura * 0.12) { if (x < xa) xa = x; if (x > xb) xb = x; } }
  if (xb < 0) return total;
  return { x0: xa / m.w, y0: ya / m.h, x1: (xb + 1) / m.w, y1: yb / m.h };
}

/** Há produto dentro do retângulo (em px do canvas) quando a foto está posicionada em `foto`? `folga` em px do canvas. */
export function colide(m: Mascara, foto: Retangulo, r: Retangulo, folga: number): boolean {
  const x0 = Math.max(r.x - folga, foto.x), y0 = Math.max(r.y - folga, foto.y), x1 = Math.min(r.x + r.w + folga, foto.x + foto.w), y1 = Math.min(r.y + r.h + folga, foto.y + foto.h);
  if (x1 <= x0 || y1 <= y0) return false;
  const a = Math.floor(((x0 - foto.x) / foto.w) * m.w), b = Math.ceil(((x1 - foto.x) / foto.w) * m.w);
  const c = Math.floor(((y0 - foto.y) / foto.h) * m.h), d = Math.ceil(((y1 - foto.y) / foto.h) * m.h);
  for (let y = Math.max(c, 0); y < Math.min(d, m.h); y++) for (let x = Math.max(a, 0); x < Math.min(b, m.w); x++) if (m.dados[y * m.w + x]) return true;
  return false;
}

export interface TextosGuia { altura?: string; largura?: string; comprimento?: string; capacidade?: string }
export interface EntradaGuia {
  W: number; H: number; fotoW: number; fotoH: number; mascara: Mascara; corpo: CaixaFrac;
  textos: TextosGuia;
  /** largura do texto em px na fonte condensada do rótulo (no canvas = measureText; nos testes, uma estimativa) */
  medir: (texto: string, px: number) => number;
}
export interface SetaV { x: number; y0: number; y1: number }
export interface SetaH { y: number; x0: number; x1: number }
export interface SetaD { x0: number; y0: number; x1: number; y1: number }
export interface LayoutGuia {
  foto: Retangulo; corpo: Retangulo; fator: number; limpo: boolean; escala: number; fonte: number;
  guia: Retangulo; capacidade: Retangulo | null;
  altura: { seta: SetaV; rotulo: Retangulo } | null;
  largura: { seta: SetaH; rotulo: Retangulo } | null;
  comprimento: { seta: SetaD; rotulo: Retangulo } | null;
}

const FATORES = Array.from({ length: 20 }, (_, i) => Math.round((1 - i * 0.03) * 100) / 100);

function montar(e: EntradaGuia, fator: number): { l: LayoutGuia; cabe: boolean } {
  const { W, H } = e; const esc = Math.min(W, H) / 1200; const f = 44 * esc; const M = 0.04 * Math.min(W, H);
  const k = Math.min((W - 2 * M) / e.fotoW, (H - 2 * M) / e.fotoH) * fator; const w = e.fotoW * k, h = e.fotoH * k;
  let x = W - M - w, y = H - M - h;
  const corpoEm = (xx: number, yy: number): Retangulo => ({ x: xx + e.corpo.x0 * w, y: yy + e.corpo.y0 * h, w: (e.corpo.x1 - e.corpo.x0) * w, h: (e.corpo.y1 - e.corpo.y0) * h });
  const rotulos = (B: Retangulo) => {
    const t = e.textos; const alt = f * 1.2;
    const altura = t.altura ? (() => { const lw = Math.max(e.medir("Altura", f), e.medir(t.altura!, f)); const ax = B.x + B.w + 0.033 * W;
      return { seta: { x: ax, y0: B.y, y1: B.y + B.h }, rotulo: { x: ax + 28 * esc, y: B.y + B.h / 2 - alt, w: lw, h: 2 * alt } }; })() : null;
    const largura = t.largura ? (() => { const txt = "Largura " + t.largura; const lw = e.medir(txt, f); const ay = B.y + B.h + 0.03 * H;
      return { seta: { y: ay, x0: B.x, x1: B.x + B.w }, rotulo: { x: B.x + B.w / 2 - lw / 2, y: ay + 14 * esc, w: lw, h: alt } }; })() : null;
    const comprimento = t.comprimento ? (() => { const lw = Math.max(e.medir("Comprimento", f), e.medir(t.comprimento!, f));
      const seta = { x0: B.x - 0.32 * B.w, y0: B.y + B.h - 0.36 * B.h, x1: B.x - 0.01 * B.w, y1: B.y + B.h + 0.11 * B.h };
      return { seta, rotulo: { x: seta.x1 - 0.24 * B.w - lw, y: seta.y1 - 0.12 * B.h - alt, w: lw, h: 2 * alt } }; })() : null;
    return { altura, largura, comprimento };
  };
  let B = corpoEm(x, y); let r = rotulos(B);
  // cabe na tela? desloca a foto para dar espaço aos rótulos; se não der, este fator não serve
  const dir = r.altura ? r.altura.rotulo.x + r.altura.rotulo.w - (W - M) : -1; if (dir > 0) x -= dir;
  B = corpoEm(x, y); r = rotulos(B);
  const esq = r.comprimento ? M - r.comprimento.rotulo.x : -1; if (esq > 0) x += esq;
  B = corpoEm(x, y); r = rotulos(B);
  const baixo = r.largura ? r.largura.rotulo.y + r.largura.rotulo.h - (H - M) : -1; if (baixo > 0) y -= baixo;
  B = corpoEm(x, y); r = rotulos(B);
  const dentro = (q: Retangulo | undefined) => !q || (q.x >= M * 0.5 && q.y >= M * 0.5 && q.x + q.w <= W - M * 0.5 && q.y + q.h <= H - M * 0.5);
  const cabe = x >= 0 && y >= 0 && x + w <= W && y + h <= H && dentro(r.altura?.rotulo) && dentro(r.largura?.rotulo) && dentro(r.comprimento?.rotulo);
  const guia: Retangulo = { x: 0.048 * W, y: 0.037 * H, w: 0.406 * W, h: 0.304 * H };
  let capacidade: Retangulo | null = null;
  if (e.textos.capacidade) { const cw = 46 * esc * 0.55 + 24 * esc + e.medir(e.textos.capacidade, 40 * esc); capacidade = { x: 0.857 * W - cw, y: 0.075 * H, w: cw, h: 52 * esc }; }
  return { l: { foto: { x, y, w, h }, corpo: B, fator, limpo: false, escala: esc, fonte: f, guia, capacidade, ...r }, cabe };
}

/** Procura o maior tamanho de produto em que tudo cabe sem encostar em pixel do produto. */
export function calcularLayoutGuia(e: EntradaGuia): LayoutGuia {
  const folga = 6 * (Math.min(e.W, e.H) / 1200);
  let reserva: LayoutGuia | null = null, menos = Infinity;
  for (const fator of FATORES) {
    const { l, cabe } = montar(e, fator); if (!cabe) continue;
    const alvos = [l.guia, l.capacidade, l.altura?.rotulo, l.largura?.rotulo, l.comprimento?.rotulo].filter(Boolean) as Retangulo[];
    const batidas = alvos.filter((r) => colide(e.mascara, l.foto, r, folga)).length;
    if (batidas === 0) return { ...l, limpo: true };
    if (batidas < menos) { menos = batidas; reserva = l; }
  }
  if (reserva) return { ...reserva, limpo: false };
  return { ...montar(e, FATORES[FATORES.length - 1]).l, limpo: false };
}

/** "13,5 cm" / "20 cm"; vazio se não houver valor. */
export function textoMedida(v: any): string {
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm` : "";
}
