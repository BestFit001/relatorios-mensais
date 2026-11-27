// Gerador de imagens do anúncio: o padrão de até 5 imagens de cada marca fica na tabela `padroes_imagens`; aqui estão os tipos, o padrão
// inicial, a geometria (testável sem navegador) e a montagem no canvas do navegador com as fotos do produto.
// Posição do tipo "cena_ia" = imagem criada por IA; fica TRAVADA até existir um serviço de imagem configurado (lib/provedorImagemIA.ts).

import { caixaDoCorpo, caixaTotal, calcularLayoutGuia, corDeFundo, criarMascara, textoMedida, type CaixaFrac, type LayoutGuia, type Mascara } from "./guiaMedidas";
import { classificarFundo, removerFundo } from "./recorteFundo";
import { calcularLayoutBeneficios, colocarProduto, tipoIcone, type MedirTexto, type TipoIcone } from "./layoutBeneficios";
import type { DadosImagemModelo } from "./beneficiosModelo";
import { PROMPT_CENA_PESSOA, PROMPT_NEGATIVO_CENA } from "./promptCena";
export type { CaixaFrac } from "./guiaMedidas";

export type TipoImagem = "montagem" | "cena_ia";
export type LayoutImagem = "foto_unica" | "detalhe" | "colagem" | "medidas" | "beneficios";
/** liso = tira o fundo da foto e põe a cor de fundo da posição (branco, por padrão); ambientado = mantém o fundo da foto. */
export type FundoModo = "liso" | "ambientado";
export type LogoPosicao = "superior_esquerdo" | "superior_direito" | "inferior_esquerdo" | "inferior_direito" | "centro_inferior";

export interface PadraoImagem {
  id?: string;
  marca: string;
  posicao: number;           // 1..5
  nome: string;
  tipo: TipoImagem;
  layout: LayoutImagem;
  largura: number;
  altura: number;
  fundo: string;             // #RRGGBB: cor atrás do produto quando o fundo da foto é tirado (fundo_modo = liso)
  fundo_modo: FundoModo;
  margem_pct: number;        // % do menor lado
  formato: "jpg" | "png";
  fotos: number[];           // quais fotos enviadas (1..5) entram; vazio = automático
  logo_url: string | null;
  logo_posicao: LogoPosicao;
  logo_tamanho_pct: number;  // % da largura
  textos: string[];          // linhas de benefícios/selos
  cor_texto: string;
  cor_destaque: string;
  prompt_ia: string;
  prompt_negativo: string;   // Cena (IA): o que NÃO pode acontecer (uma regra por linha)
  ativo: boolean;
}

export interface MedidasProduto { altura?: number | null; largura?: number | null; comprimento?: number | null; peso?: number | null; /** texto livre, ex.: "8 Litros" */ capacidade?: string | null }

/** Fotos do produto que podem ser enviadas de uma vez e imagens (posições) que cada marca pode ter. O padrão inicial da marca tem 5. */
export const MAX_FOTOS = 10;
export const MAX_POSICOES = 12;

export const ROTULO_LAYOUT: Record<LayoutImagem, string> = {
  foto_unica: "Foto inteira (fundo liso)",
  detalhe: "Detalhe (foto ampliada, sem sobras)",
  colagem: "Colagem de fotos",
  medidas: "Foto com guia de medidas (setas)",
  beneficios: "Benefícios do modelo (título, ícones e produto em fundo branco)",
};

/** Padrão inicial de uma marca nova: 4 montagens e 1 cena de IA (travada). */
export function padraoInicial(marca: string): PadraoImagem[] {
  const base = { marca, tipo: "montagem" as TipoImagem, fundo_modo: "liso" as FundoModo, largura: 1200, altura: 1200, fundo: "#FFFFFF", margem_pct: 8, formato: "jpg" as const, fotos: [] as number[], logo_url: null, logo_posicao: "inferior_direito" as LogoPosicao, logo_tamanho_pct: 14, textos: [] as string[], cor_texto: "#111111", cor_destaque: "#6D28D9", prompt_ia: "", prompt_negativo: "", ativo: true };
  return [
    { ...base, posicao: 1, nome: "Principal", layout: "foto_unica", fotos: [1] },
    { ...base, posicao: 2, nome: "Detalhe", layout: "detalhe", margem_pct: 0, fotos: [2] },
    { ...base, posicao: 3, nome: "Colagem", layout: "colagem" },
    { ...base, posicao: 4, nome: "Medidas", layout: "medidas", fotos: [1] },
    { ...base, posicao: 5, nome: "Cena (IA)", tipo: "cena_ia", layout: "foto_unica", fotos: [1], prompt_ia: PROMPT_CENA_PESSOA, prompt_negativo: PROMPT_NEGATIVO_CENA },
  ];
}

/** Próxima imagem do padrão da marca: layout "foto inteira", fundo branco e o logo igual ao da primeira posição. */
export function novaPosicao(marca: string, atuais: PadraoImagem[]): PadraoImagem | null {
  if (atuais.length >= MAX_POSICOES) return null;
  const usadas = new Set(atuais.map((p) => p.posicao)); let posicao = 1; while (usadas.has(posicao)) posicao++;
  const base = padraoInicial(marca)[0]; const primeira = [...atuais].sort((a, b) => a.posicao - b.posicao)[0];
  return { ...base, posicao, nome: `Imagem ${posicao}`, layout: "foto_unica", fotos: [], logo_url: primeira?.logo_url ?? null, logo_posicao: primeira?.logo_posicao ?? base.logo_posicao, logo_tamanho_pct: primeira?.logo_tamanho_pct ?? base.logo_tamanho_pct, id: undefined };
}

/** Deixa as posições em ordem e numeradas 1..n (sem buracos), como os nomes dos arquivos esperam. */
export function renumerarPosicoes(lista: PadraoImagem[]): PadraoImagem[] {
  return [...lista].sort((a, b) => a.posicao - b.posicao).slice(0, MAX_POSICOES).map((p, i) => ({ ...p, posicao: i + 1 }));
}

/** Linha do banco -> padrão (garante tipos e valores válidos). */
export function normalizarPadrao(l: any): PadraoImagem {
  const num = (v: any, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const cor = (v: any, d: string) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? String(v) : d);
  const layouts: LayoutImagem[] = ["foto_unica", "detalhe", "colagem", "medidas", "beneficios"];
  const logos: LogoPosicao[] = ["superior_esquerdo", "superior_direito", "inferior_esquerdo", "inferior_direito", "centro_inferior"];
  return {
    id: l.id, marca: String(l.marca || ""), posicao: num(l.posicao, 1, 1, MAX_POSICOES), nome: String(l.nome || ""),
    tipo: l.tipo === "cena_ia" ? "cena_ia" : "montagem",
    layout: layouts.includes(l.layout) ? l.layout : "foto_unica",
    largura: Math.round(num(l.largura, 1200, 200, 4000)), altura: Math.round(num(l.altura, 1200, 200, 4000)),
    fundo: cor(l.fundo, "#FFFFFF"), fundo_modo: l.fundo_modo === "ambientado" ? "ambientado" : "liso", margem_pct: num(l.margem_pct, 8, 0, 40),
    formato: l.formato === "png" ? "png" : "jpg",
    fotos: (Array.isArray(l.fotos) ? l.fotos : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_FOTOS),
    logo_url: l.logo_url ? String(l.logo_url) : null,
    logo_posicao: logos.includes(l.logo_posicao) ? l.logo_posicao : "inferior_direito",
    logo_tamanho_pct: num(l.logo_tamanho_pct, 14, 3, 50),
    textos: (Array.isArray(l.textos) ? l.textos : []).map((t: any) => String(t).trim()).filter(Boolean),
    cor_texto: cor(l.cor_texto, "#111111"), cor_destaque: cor(l.cor_destaque, "#6D28D9"),
    prompt_ia: String(l.prompt_ia || ""), prompt_negativo: String(l.prompt_negativo || ""), ativo: l.ativo !== false,
  };
}

// ───────────── geometria (sem navegador) ─────────────

export interface Retangulo { x: number; y: number; w: number; h: number }
export interface Enquadre { origem: Retangulo; destino: Retangulo }

/** "conter" = a foto inteira dentro da caixa (sobra fundo); "cobrir" = preenche a caixa e corta o excesso (centralizado). */
export function enquadrar(fotoW: number, fotoH: number, caixa: Retangulo, modo: "conter" | "cobrir"): Enquadre {
  if (fotoW <= 0 || fotoH <= 0 || caixa.w <= 0 || caixa.h <= 0) return { origem: { x: 0, y: 0, w: Math.max(fotoW, 0), h: Math.max(fotoH, 0) }, destino: { ...caixa } };
  const k = modo === "conter" ? Math.min(caixa.w / fotoW, caixa.h / fotoH) : Math.max(caixa.w / fotoW, caixa.h / fotoH);
  if (modo === "conter") {
    const w = fotoW * k, h = fotoH * k;
    return { origem: { x: 0, y: 0, w: fotoW, h: fotoH }, destino: { x: caixa.x + (caixa.w - w) / 2, y: caixa.y + (caixa.h - h) / 2, w, h } };
  }
  const sw = caixa.w / k, sh = caixa.h / k;
  return { origem: { x: (fotoW - sw) / 2, y: (fotoH - sh) / 2, w: sw, h: sh }, destino: { ...caixa } };
}

/** Área útil da imagem depois da margem. */
export function areaUtil(largura: number, altura: number, margemPct: number): Retangulo {
  const m = Math.round((Math.min(largura, altura) * margemPct) / 100);
  return { x: m, y: m, w: Math.max(largura - 2 * m, 1), h: Math.max(altura - 2 * m, 1) };
}

/** Grade da colagem: 1 foto = tela cheia; 2 = lado a lado; 3 = 1 grande + 2; 4 ou 5 = grade 2x2 (a 5ª é ignorada). `gap` em px. */
export function gradeColagem(n: number, area: Retangulo, gap: number): Retangulo[] {
  const { x, y, w, h } = area;
  const metadeW = (w - gap) / 2, metadeH = (h - gap) / 2;
  if (n <= 1) return [{ ...area }];
  if (n === 2) return [{ x, y, w: metadeW, h }, { x: x + metadeW + gap, y, w: metadeW, h }];
  if (n === 3) return [{ x, y, w: metadeW, h }, { x: x + metadeW + gap, y, w: metadeW, h: metadeH }, { x: x + metadeW + gap, y: y + metadeH + gap, w: metadeW, h: metadeH }];
  return [
    { x, y, w: metadeW, h: metadeH }, { x: x + metadeW + gap, y, w: metadeW, h: metadeH },
    { x, y: y + metadeH + gap, w: metadeW, h: metadeH }, { x: x + metadeW + gap, y: y + metadeH + gap, w: metadeW, h: metadeH },
  ];
}

/** Posição do logo dentro da imagem (canto pedido, respeitando a margem). */
export function posicaoLogo(logoW: number, logoH: number, largura: number, altura: number, pos: LogoPosicao, margemPct: number): Retangulo {
  const folga = Math.max(Math.round((Math.min(largura, altura) * Math.max(margemPct, 2)) / 100 / 2), 12);
  const esq = pos.endsWith("esquerdo"), sup = pos.startsWith("superior");
  const x = pos === "centro_inferior" ? (largura - logoW) / 2 : esq ? folga : largura - logoW - folga;
  const y = sup ? folga : altura - logoH - folga;
  return { x, y, w: logoW, h: logoH };
}

/** Quais fotos (índices 0-based) entram numa posição: as escolhidas no padrão (que existam) ou, no automático, a foto de mesmo número (ou a 1ª). */
export function fotosDaPosicao(p: PadraoImagem, qtdFotos: number): number[] {
  if (qtdFotos <= 0) return [];
  const escolhidas = p.fotos.filter((n) => n >= 1 && n <= qtdFotos).map((n) => n - 1);
  if (escolhidas.length) return escolhidas;
  if (p.layout === "colagem") return Array.from({ length: Math.min(qtdFotos, 4) }, (_, i) => i);
  return [Math.min(p.posicao, qtdFotos) - 1];
}

export const nomeDoArquivoImagem = (sku: string, p: Pick<PadraoImagem, "posicao" | "formato">) =>
  `${(sku || "produto").trim().replace(/[^\w.-]+/g, "_")}_${p.posicao}.${p.formato}`;

export function linhasDeMedidas(m: MedidasProduto): { rotulo: string; valor: string }[] {
  const f = (v: any, un: string, casas = 0) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? `${n.toLocaleString("pt-BR", { maximumFractionDigits: casas })} ${un}` : ""; };
  return [
    { rotulo: "Altura", valor: f(m.altura, "cm", 1) },
    { rotulo: "Largura", valor: f(m.largura, "cm", 1) },
    { rotulo: "Comprimento", valor: f(m.comprimento, "cm", 1) },
    { rotulo: "Peso", valor: f(m.peso, "kg", 3) },
  ].filter((l) => l.valor);
}

// ───────────── montagem no canvas (só no navegador) ─────────────

/** `jaBranco`: a foto já tem fundo branco; no modo "fundo branco" ela entra como veio, sem recorte (o recorte poderia comer parte do produto). */
export type Foto = { img: HTMLImageElement | HTMLCanvasElement; largura: number; altura: number; jaBranco?: boolean };

export function carregarImagem(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error("não consegui abrir a imagem"));
    img.src = src;
  });
}

/** Palpite inicial: os 4 cantos da foto são (quase) brancos? */
export function temFundoBranco(img: HTMLImageElement): boolean {
  const k = Math.min(1, 64 / Math.max(img.naturalWidth, img.naturalHeight)); const w = Math.max(4, Math.round(img.naturalWidth * k)), h = Math.max(4, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true })!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
  const [r, g, b] = corDeFundo(x.getImageData(0, 0, w, h).data, w, h); return r >= 245 && g >= 245 && b >= 245;
}

export async function carregarFoto(arquivo: File): Promise<Foto & { url: string }> {
  const url = URL.createObjectURL(arquivo);
  const img = await carregarImagem(url);
  return { img, largura: img.naturalWidth, altura: img.naturalHeight, url, jaBranco: temFundoBranco(img) };
}

function desenhar(ctx: CanvasRenderingContext2D, foto: Foto, caixa: Retangulo, modo: "conter" | "cobrir") {
  const e = enquadrar(foto.largura, foto.altura, caixa, modo);
  ctx.drawImage(foto.img, e.origem.x, e.origem.y, e.origem.w, e.origem.h, e.destino.x, e.destino.y, e.destino.w, e.destino.h);
}

export interface ContextoMontagem {
  fotos: Foto[]; logo?: Foto | null; medidas?: MedidasProduto;
  /** corpo do produto ajustado à mão (frações da foto); vazio = detecção automática */
  caixaProduto?: CaixaFrac | null;
  /** preenchido por montarImagem na imagem de medidas */
  layoutGuia?: LayoutGuia;
  /** dados do modelo (Padronização IA) para a imagem de benefícios: título em 2 linhas e benefícios; `marca` vai na pílula do rodapé */
  modelo?: (Partial<DadosImagemModelo> & { marca?: string }) | null;
  /** preenchido por montarImagem: aviso quando o fundo de alguma foto não pôde ser tirado */
  avisoFundo?: string;
}

/** Máscara (onde há produto) e corpo detectado de uma foto; calculado uma vez por foto. */
const CACHE_ANALISE = new WeakMap<object, { mascara: Mascara; corpo: CaixaFrac; fundo: "liso" | "cena" }>();
export function analisarFoto(foto: Foto): { mascara: Mascara; corpo: CaixaFrac; fundo: "liso" | "cena" } {
  const guardado = CACHE_ANALISE.get(foto.img); if (guardado) return guardado;
  const k = Math.min(1, 320 / Math.max(foto.largura, foto.altura)); const w = Math.max(1, Math.round(foto.largura * k)), h = Math.max(1, Math.round(foto.altura * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(foto.img, 0, 0, w, h);
  const dados = x.getImageData(0, 0, w, h).data;
  const mascara = criarMascara(dados, w, h);
  const r = { mascara, corpo: caixaDoCorpo(mascara), fundo: classificarFundo(dados, w, h) }; CACHE_ANALISE.set(foto.img, r); return r;
}

/** Foto com o fundo tirado (transparente). Se o fundo não é liso, devolve a própria foto e `removido: false`. Calculado uma vez por foto. */
const CACHE_RECORTE = new WeakMap<object, { foto: Foto; removido: boolean }>();
export function recortarFundoDaFoto(foto: Foto): { foto: Foto; removido: boolean } {
  const guardado = CACHE_RECORTE.get(foto.img); if (guardado) return guardado;
  const k = Math.min(1, 1600 / Math.max(foto.largura, foto.altura)); const w = Math.max(1, Math.round(foto.largura * k)), h = Math.max(1, Math.round(foto.altura * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(foto.img, 0, 0, w, h);
  const r = removerFundo(x.getImageData(0, 0, w, h).data, w, h);
  let saida: { foto: Foto; removido: boolean } = { foto, removido: false };
  if (r.removido) {
    const img = x.createImageData(w, h); img.data.set(r.rgba); x.putImageData(img, 0, 0);
    // sem o fundo, corta a sobra em volta do produto (com 2% de folga) para ele ocupar a imagem
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (r.rgba[(y * w + xx) * 4 + 3] > 20) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const folga = Math.round(Math.max(w, h) * 0.02); const ax = Math.max(0, x0 - folga), ay = Math.max(0, y0 - folga), bx = Math.min(w, x1 + 1 + folga), by = Math.min(h, y1 + 1 + folga);
    if (x1 >= 0 && (bx - ax) >= w * 0.05 && (by - ay) >= h * 0.05) {
      const c2 = document.createElement("canvas"); c2.width = bx - ax; c2.height = by - ay; c2.getContext("2d")!.drawImage(c, ax, ay, c2.width, c2.height, 0, 0, c2.width, c2.height);
      saida = { foto: { img: c2, largura: c2.width, altura: c2.height }, removido: true };
    } else saida = { foto: { img: c, largura: w, altura: h }, removido: true };
  }
  CACHE_RECORTE.set(foto.img, saida); return saida;
}

/** Corta a sobra branca em volta do produto (sem mexer nos pixels; o fundo continua branco). Usado quando a foto já tem fundo branco mas o produto ocupa pouco dela. */
const CACHE_APARADA = new WeakMap<object, Foto>();
export function apararFoto(foto: Foto): Foto {
  const guardado = CACHE_APARADA.get(foto.img); if (guardado) return guardado;
  const caixa = caixaTotal(analisarFoto(foto).mascara); let saida = foto;
  if (caixa) {
    const folga = 0.02; const fx0 = Math.max(0, caixa.x0 - folga * (foto.altura / foto.largura)), fx1 = Math.min(1, caixa.x1 + folga * (foto.altura / foto.largura)), fy0 = Math.max(0, caixa.y0 - folga), fy1 = Math.min(1, caixa.y1 + folga);
    if ((fx1 - fx0) * (fy1 - fy0) < 0.85) {
      const sx = Math.round(fx0 * foto.largura), sy = Math.round(fy0 * foto.altura), sw = Math.max(1, Math.round((fx1 - fx0) * foto.largura)), sh = Math.max(1, Math.round((fy1 - fy0) * foto.altura));
      const k = Math.min(1, 1600 / Math.max(sw, sh)); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
      const x = c.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(foto.img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      saida = { img: c, largura: c.width, altura: c.height, jaBranco: true };
    }
  }
  CACHE_APARADA.set(foto.img, saida); return saida;
}

/** Fundo ambientado de foto de estúdio: repete as bordas da foto para fora até a borda da imagem (sem faixa branca em volta). */
export function estenderBordas(ctx: CanvasRenderingContext2D, foto: Foto, d: Retangulo, W: number, H: number) {
  const sw = foto.largura, sh = foto.altura, e = 2; const dr = d.x + d.w, db = d.y + d.h; const img = foto.img;
  if (d.y > 0) ctx.drawImage(img, 0, 0, sw, e, d.x, 0, d.w, d.y);
  if (db < H) ctx.drawImage(img, 0, sh - e, sw, e, d.x, db, d.w, H - db);
  if (d.x > 0) ctx.drawImage(img, 0, 0, e, sh, 0, d.y, d.x, d.h);
  if (dr < W) ctx.drawImage(img, sw - e, 0, e, sh, dr, d.y, W - dr, d.h);
  if (d.x > 0 && d.y > 0) ctx.drawImage(img, 0, 0, e, e, 0, 0, d.x, d.y);
  if (dr < W && d.y > 0) ctx.drawImage(img, sw - e, 0, e, e, dr, 0, W - dr, d.y);
  if (d.x > 0 && db < H) ctx.drawImage(img, 0, sh - e, e, e, 0, db, d.x, H - db);
  if (dr < W && db < H) ctx.drawImage(img, sw - e, sh - e, e, e, dr, db, W - dr, H - db);
}

const CONDENSADO = 0.84; // fonte do guia é condensada: texto normal comprimido na horizontal
const FONTE_GUIA = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
function medirCondensado(ctx: CanvasRenderingContext2D, t: string, px: number, peso = 400) { ctx.font = `${peso} ${px}px ${FONTE_GUIA}`; return ctx.measureText(t).width * CONDENSADO; }
function textoCond(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, px: number, cor: string, alinhar: "left" | "center" | "right" = "left", peso = 400) {
  ctx.save(); ctx.font = `${peso} ${px}px ${FONTE_GUIA}`; ctx.fillStyle = cor; ctx.textBaseline = "alphabetic";
  const w = ctx.measureText(t).width * CONDENSADO; const x0 = alinhar === "left" ? x : alinhar === "center" ? x - w / 2 : x - w;
  ctx.translate(x0, y); ctx.scale(CONDENSADO, 1); ctx.fillText(t, 0, 0); ctx.restore();
}
function seta(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, esc: number, cor: string) {
  ctx.save(); ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = Math.max(1.5, 1.8 * esc);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  const ang = Math.atan2(y1 - y0, x1 - x0), c = 17 * esc, l = 6.5 * esc;
  const ponta = (x: number, y: number, a: number) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - c * Math.cos(a) + l * Math.sin(a), y - c * Math.sin(a) - l * Math.cos(a)); ctx.lineTo(x - c * Math.cos(a) - l * Math.sin(a), y - c * Math.sin(a) + l * Math.cos(a)); ctx.closePath(); ctx.fill(); };
  ponta(x1, y1, ang); ponta(x0, y0, ang + Math.PI); ctx.restore();
}

/** Monta a imagem de medidas e devolve o layout usado (a tela usa para mostrar/ajustar a caixa do produto). */
export function desenharGuiaMedidas(ctx: CanvasRenderingContext2D, p: PadraoImagem, foto: Foto, m: MedidasProduto, caixaProduto?: CaixaFrac | null, estender = false): LayoutGuia {
  const W = p.largura, H = p.altura; const { mascara, corpo } = analisarFoto(foto);
  const textos = { altura: textoMedida(m.altura), largura: textoMedida(m.largura), comprimento: textoMedida(m.comprimento), capacidade: String(m.capacidade || "").trim() };
  const l = calcularLayoutGuia({ W, H, fotoW: foto.largura, fotoH: foto.altura, mascara, corpo: caixaProduto || corpo, textos, medir: (t, px) => medirCondensado(ctx, t, px) });
  const esc = l.escala, f = l.fonte, cinza = "#3a3a3a", cor = p.cor_texto;
  if (estender) estenderBordas(ctx, foto, l.foto, W, H);
  ctx.drawImage(foto.img, l.foto.x, l.foto.y, l.foto.w, l.foto.h);
  // caixa GUIA DE TAMANHO (sem preenchimento: só contorno e texto)
  const g = l.guia; const itens = [["Altura", textos.altura], ["Comprimento", textos.comprimento], ["Largura", textos.largura]].filter((i) => i[1]);
  if (itens.length) {
    ctx.save(); ctx.strokeStyle = "#e3e3e3"; ctx.lineWidth = Math.max(1.5, 2 * esc); ctx.strokeRect(g.x, g.y, g.w, g.h);
    const cab = g.h * 0.25; ctx.beginPath(); ctx.moveTo(g.x, g.y + cab); ctx.lineTo(g.x + g.w, g.y + cab); ctx.stroke(); ctx.restore();
    textoCond(ctx, "GUIA DE TAMANHO", g.x + g.w / 2, g.y + cab * 0.64, 34 * esc, cor, "center");
    const passo = (g.h - cab) / itens.length;
    itens.forEach(([nome, valor], i) => {
      const yb = g.y + cab + passo * i + passo * 0.64; const fs = 37 * esc;
      ctx.save(); ctx.fillStyle = "#111"; ctx.beginPath(); const tx = g.x + g.w * 0.07, ty = yb - fs * 0.32; ctx.moveTo(tx, ty - 9 * esc); ctx.lineTo(tx + 17 * esc, ty); ctx.lineTo(tx, ty + 9 * esc); ctx.closePath(); ctx.fill(); ctx.restore();
      const xl = g.x + g.w * 0.145; textoCond(ctx, nome, xl, yb, fs, cor);
      const wv = medirCondensado(ctx, valor, fs); const xv = g.x + g.w - g.w * 0.045; textoCond(ctx, valor, xv, yb, fs, cor, "right");
      const xi = xl + medirCondensado(ctx, nome, fs) + 10 * esc, xf = xv - wv - 10 * esc;
      if (xf > xi) { ctx.save(); ctx.strokeStyle = cinza; ctx.lineWidth = Math.max(1.5, 2 * esc); ctx.beginPath(); ctx.moveTo(xi, yb + 2 * esc); ctx.lineTo(xf, yb + 2 * esc); ctx.stroke(); ctx.restore(); }
    });
  }
  // capacidade com gota
  if (l.capacidade && textos.capacidade) {
    const c = l.capacidade; const dh = 46 * esc, dw = dh * 0.55, cx = c.x + dw / 2, topo = c.y + 2 * esc;
    ctx.save(); ctx.strokeStyle = cinza; ctx.lineWidth = Math.max(1.5, 2 * esc); ctx.beginPath(); ctx.moveTo(cx, topo);
    ctx.bezierCurveTo(cx + dw * 0.12, topo + dh * 0.30, cx + dw * 0.5, topo + dh * 0.55, cx + dw * 0.5, topo + dh * 0.72);
    ctx.arc(cx, topo + dh * 0.72, dw * 0.5, 0, Math.PI, false);
    ctx.bezierCurveTo(cx - dw * 0.5, topo + dh * 0.55, cx - dw * 0.12, topo + dh * 0.30, cx, topo); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, topo + dh * 0.74, dw * 0.28, Math.PI * 0.55, Math.PI * 0.95, false); ctx.stroke(); ctx.restore();
    textoCond(ctx, textos.capacidade, c.x + dw + 24 * esc, c.y + 40 * esc, 40 * esc, cor);
  }
  // setas e rótulos
  if (l.altura) { const a = l.altura; seta(ctx, a.seta.x, a.seta.y0, a.seta.x, a.seta.y1, esc, cinza);
    textoCond(ctx, "Altura", a.rotulo.x, a.rotulo.y + f * 0.95, f, cor); textoCond(ctx, textos.altura, a.rotulo.x, a.rotulo.y + f * 2.15, f, cor); }
  if (l.largura) { const a = l.largura; seta(ctx, a.seta.x0, a.seta.y, a.seta.x1, a.seta.y, esc, cinza);
    textoCond(ctx, "Largura " + textos.largura, a.rotulo.x, a.rotulo.y + f * 0.95, f, cor); }
  if (l.comprimento) { const a = l.comprimento; seta(ctx, a.seta.x0, a.seta.y0, a.seta.x1, a.seta.y1, esc, cinza);
    const dir = a.rotulo.x + a.rotulo.w; textoCond(ctx, "Comprimento", dir, a.rotulo.y + f * 0.95, f, cor, "right"); textoCond(ctx, textos.comprimento, dir, a.rotulo.y + f * 2.15, f, cor, "right"); }
  return l;
}


// ───────────── imagem de benefícios (igual ao modelo: título, benefícios com ícone, pílula da marca e produto grande) ─────────────

const FONTE_BEN = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function desenharIcone(ctx: CanvasRenderingContext2D, tipo: TipoIcone, cx: number, cy: number, r: number, cor: string) {
  const u = r * 0.44; ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = Math.max(2, r * 0.05); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const caminho = (pts: [number, number][], fechar = false) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * u, y * u) : ctx.moveTo(x * u, y * u))); if (fechar) ctx.closePath(); ctx.stroke(); };
  if (tipo === "escudo") {
    ctx.beginPath(); ctx.moveTo(0, -u); ctx.lineTo(0.85 * u, -0.55 * u); ctx.lineTo(0.85 * u, 0.1 * u); ctx.quadraticCurveTo(0.85 * u, 0.65 * u, 0, u); ctx.quadraticCurveTo(-0.85 * u, 0.65 * u, -0.85 * u, 0.1 * u); ctx.lineTo(-0.85 * u, -0.55 * u); ctx.closePath(); ctx.stroke();
    caminho([[-0.4, 0.05], [-0.08, 0.37], [0.45, -0.25]]);
  } else if (tipo === "setas") {
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      caminho([[sx * 0.2, sy * 0.2], [sx * 0.95, sy * 0.95]]); caminho([[sx * 0.95 - sx * 0.42, sy * 0.95], [sx * 0.95, sy * 0.95], [sx * 0.95, sy * 0.95 - sy * 0.42]]);
    }
  } else if (tipo === "ondas") {
    for (const i of [-1, 0, 1]) { ctx.beginPath(); for (let a = 0; a <= 40; a++) { const x = (-1 + a / 20) * u; const y = i * 0.55 * u + Math.sin((a / 40) * Math.PI * 2.4) * 0.2 * u; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  } else if (tipo === "cabeca") {
    ctx.beginPath(); ctx.arc(0, -0.3 * u, 0.55 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 1.0 * u, 0.9 * u, 0.62 * u, 0, Math.PI, Math.PI * 2); ctx.stroke();
  } else if (tipo === "termometro") {
    ctx.beginPath(); ctx.moveTo(-0.22 * u, 0.3 * u); ctx.lineTo(-0.22 * u, -0.7 * u); ctx.arc(0, -0.7 * u, 0.22 * u, Math.PI, 0); ctx.lineTo(0.22 * u, 0.3 * u); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.62 * u, 0.42 * u, -Math.PI * 0.72, Math.PI * 1.72, false); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0.55 * u); ctx.lineTo(0, -0.35 * u); ctx.stroke();
  } else if (tipo === "caixa") {
    caminho([[-0.85, -0.45], [0.85, -0.45], [0.85, 0.85], [-0.85, 0.85]], true); caminho([[-0.85, -0.05], [0.85, -0.05]]); caminho([[-0.3, -0.45], [-0.3, -0.85], [0.3, -0.85], [0.3, -0.45]]);
  } else {
    ctx.beginPath(); ctx.arc(0, 0, 0.85 * u, 0, Math.PI * 2); ctx.stroke(); caminho([[-0.38, 0.02], [-0.08, 0.32], [0.45, -0.3]]);
  }
  ctx.restore();
}

function retanguloArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

/** Benefícios e título: os do modelo escolhido; sem modelo, usa as linhas de texto da posição (só título, sem descrição). */
export function dadosDosBeneficios(p: PadraoImagem, c: ContextoMontagem) {
  const m = c.modelo; const doModelo = (m?.beneficios || []).filter((b) => b && b.titulo);
  const beneficios = doModelo.length ? doModelo : p.textos.filter(Boolean).map((t) => ({ titulo: t, descricao: "" }));
  return { linha1: m?.linha1 || "", linha2: m?.linha2 || "", beneficios, marca: m?.marca || "" };
}

export function desenharBeneficios(ctx: CanvasRenderingContext2D, p: PadraoImagem, foto: Foto, c: ContextoMontagem) {
  const W = p.largura, H = p.altura; const k = Math.min(W, H) / 1254;
  const medir: MedirTexto = (t, px, peso) => { ctx.font = `${peso} ${px}px ${FONTE_BEN}`; return ctx.measureText(t).width; };
  const d = dadosDosBeneficios(p, c);
  const l = calcularLayoutBeneficios({ W, H, linha1: d.linha1, linha2: d.linha2, beneficios: d.beneficios, medir });
  const cor = p.cor_texto, destaque = p.cor_destaque, f = l.fontes;
  const caixa = colocarProduto(l, W, H, foto.largura, foto.altura, analisarFoto(foto).mascara);
  ctx.drawImage(foto.img, caixa.x, caixa.y, caixa.w, caixa.h); // o produto é o maior possível sem encostar no título
  ctx.textBaseline = "alphabetic"; ctx.fillStyle = cor;
  if (d.linha1) { ctx.font = `300 ${f.linha1}px ${FONTE_BEN}`; ctx.fillText(d.linha1, l.linha1.x, l.linha1.y); }
  if (d.linha2) { ctx.font = `800 ${f.linha2}px ${FONTE_BEN}`; ctx.fillText(d.linha2, l.linha2.x, l.linha2.y); }
  if (d.linha1 || d.linha2) { ctx.fillStyle = destaque; ctx.fillRect(l.risco.x, l.risco.y, l.risco.w, l.risco.esp); }
  l.itens.forEach((it, i) => {
    const b = d.beneficios[i];
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.14)"; ctx.shadowBlur = 16 * k; ctx.shadowOffsetY = 4 * k; ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(it.circulo.cx, it.circulo.cy, it.circulo.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.strokeStyle = "#ececec"; ctx.lineWidth = Math.max(1, k); ctx.beginPath(); ctx.arc(it.circulo.cx, it.circulo.cy, it.circulo.r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    desenharIcone(ctx, tipoIcone(b.titulo + " " + b.descricao), it.circulo.cx, it.circulo.cy, it.circulo.r, "#1f1f1f");
    ctx.fillStyle = cor; ctx.font = `700 ${f.titulo}px ${FONTE_BEN}`; it.titulo.linhas.forEach((ln, j) => ctx.fillText(ln, it.xTexto, it.titulo.ys[j]));
    ctx.fillStyle = "#4a4a4a"; ctx.font = `400 ${f.descricao}px ${FONTE_BEN}`; it.descricao.linhas.forEach((ln, j) => ctx.fillText(ln, it.xTexto, it.descricao.ys[j]));
    if (it.separador !== null) { ctx.fillStyle = "#e6e6e6"; ctx.fillRect(l.pilula.x, it.separador, l.colunaX1 - l.pilula.x, Math.max(1, k)); }
  });
  // pílula do rodapé: logo (ou nome da marca) • Produto original
  const pl = l.pilula; const marca = d.marca.trim();
  if (marca || c.logo) {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.13)"; ctx.shadowBlur = 18 * k; ctx.shadowOffsetY = 4 * k; ctx.fillStyle = "#ffffff"; retanguloArredondado(ctx, pl.x, pl.y, pl.w, pl.h, pl.h / 2); ctx.fill(); ctx.restore();
    let x = pl.x + pl.h * 0.55; const yb = pl.y + pl.h / 2;
    if (c.logo) { const lh = pl.h * 0.58, lw = (c.logo.largura / c.logo.altura) * lh; ctx.drawImage(c.logo.img, x, yb - lh / 2, lw, lh); x += lw + pl.h * 0.3; }
    else { ctx.fillStyle = cor; ctx.font = `600 ${f.rodape}px ${FONTE_BEN}`; ctx.textBaseline = "middle"; ctx.fillText(marca, x, yb + 1); x += medir(marca, f.rodape, 600) + pl.h * 0.3; }
    ctx.fillStyle = destaque; ctx.beginPath(); ctx.arc(x, yb, Math.max(3, 4 * k), 0, Math.PI * 2); ctx.fill(); x += pl.h * 0.28;
    ctx.fillStyle = cor; ctx.font = `400 ${f.rodape * 0.92}px ${FONTE_BEN}`; ctx.textBaseline = "middle"; ctx.fillText("Produto original", x, yb + 1); ctx.textBaseline = "alphabetic";
  }
  return l;
}

/** Monta UMA imagem do padrão (tipo "montagem"). Devolve o canvas pronto. */
export function montarImagem(p: PadraoImagem, c: ContextoMontagem): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = p.largura; canvas.height = p.altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("o navegador não liberou o canvas");
  ctx.fillStyle = p.layout === "beneficios" ? "#FFFFFF" : p.fundo; ctx.fillRect(0, 0, p.largura, p.altura);
  ctx.imageSmoothingQuality = "high";
  const util = areaUtil(p.largura, p.altura, p.margem_pct);
  const idx = fotosDaPosicao(p, c.fotos.length);
  const originais = idx.map((i) => c.fotos[i]).filter(Boolean);
  const liso = p.fundo_modo === "liso" || p.layout === "beneficios"; // a imagem de benefícios é sempre em fundo branco
  c.avisoFundo = undefined;
  // fundo liso: tira o fundo da foto (a cor de fundo da posição aparece no lugar); ambientado: a foto fica como veio
  const fotos = originais.map((f) => { if (f.jaBranco) return p.layout === "beneficios" ? apararFoto(f) : f; if (!liso) return f; const r = recortarFundoDaFoto(f); if (!r.removido) c.avisoFundo = "Não consegui tirar o fundo de uma foto (o fundo dela não é liso): mantive como veio."; return r.foto; });
  const escala = Math.min(p.largura, p.altura) / 1200;
  const fonte = (px: number, peso = 600) => `${peso} ${Math.round(px * escala)}px "Helvetica Neue", Arial, sans-serif`;

  if (fotos.length) {
    if (p.layout === "foto_unica") {
      if (!liso && analisarFoto(fotos[0]).fundo === "cena") desenhar(ctx, fotos[0], { x: 0, y: 0, w: p.largura, h: p.altura }, "cobrir"); // foto de cenário: ocupa a imagem toda
      else { if (!liso) estenderBordas(ctx, fotos[0], enquadrar(fotos[0].largura, fotos[0].altura, util, "conter").destino, p.largura, p.altura); desenhar(ctx, fotos[0], util, "conter"); }
    } else if (p.layout === "detalhe") desenhar(ctx, fotos[0], util, "cobrir");
    else if (p.layout === "colagem") {
      const grade = gradeColagem(fotos.length, util, Math.round(16 * escala));
      grade.forEach((cx, i) => {
        ctx.save(); ctx.beginPath(); ctx.rect(cx.x, cx.y, cx.w, cx.h); ctx.clip(); desenhar(ctx, fotos[i], cx, "cobrir"); ctx.restore();
        if (liso) { ctx.save(); ctx.strokeStyle = "#e4e4e4"; ctx.lineWidth = Math.max(1.5, 2 * escala); ctx.strokeRect(cx.x, cx.y, cx.w, cx.h); ctx.restore(); } // fundo branco: o contorno separa as fotos
      });
    } else if (p.layout === "medidas") {
      c.layoutGuia = desenharGuiaMedidas(ctx, p, fotos[0], c.medidas || {}, c.caixaProduto, !liso);
    } else {
      desenharBeneficios(ctx, p, fotos[0], c);
    }
  }

  if (c.logo && p.layout !== "beneficios") { // na imagem de benefícios o logo fica na pílula do rodapé
    const lw = Math.round((p.largura * p.logo_tamanho_pct) / 100); const lh = Math.round((c.logo.altura / c.logo.largura) * lw);
    const r = posicaoLogo(lw, lh, p.largura, p.altura, p.logo_posicao, p.margem_pct);
    ctx.drawImage(c.logo.img, r.x, r.y, r.w, r.h);
  }
  return canvas;
}

export function canvasParaBlob(canvas: HTMLCanvasElement, formato: "jpg" | "png"): Promise<Blob> {
  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("não consegui gerar o arquivo da imagem"))), formato === "png" ? "image/png" : "image/jpeg", 0.92));
}
