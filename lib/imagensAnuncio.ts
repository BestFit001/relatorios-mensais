// Gerador de imagens do anúncio: o padrão de até 5 imagens de cada marca fica na tabela `padroes_imagens`; aqui estão os tipos, o padrão
// inicial, a geometria (testável sem navegador) e a montagem no canvas do navegador com as fotos do produto.
// Posição do tipo "cena_ia" = imagem criada por IA; fica TRAVADA até existir um serviço de imagem configurado (lib/provedorImagemIA.ts).

export type TipoImagem = "montagem" | "cena_ia";
export type LayoutImagem = "foto_unica" | "detalhe" | "colagem" | "medidas" | "beneficios";
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
  fundo: string;             // #RRGGBB
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
  ativo: boolean;
}

export interface MedidasProduto { altura?: number | null; largura?: number | null; comprimento?: number | null; peso?: number | null }

export const MAX_FOTOS = 5;
export const MAX_POSICOES = 5;

export const ROTULO_LAYOUT: Record<LayoutImagem, string> = {
  foto_unica: "Foto inteira (fundo liso)",
  detalhe: "Detalhe (foto ampliada, sem sobras)",
  colagem: "Colagem de fotos",
  medidas: "Foto + medidas e peso",
  beneficios: "Foto + textos de benefícios",
};

/** Padrão inicial de uma marca nova: 4 montagens e 1 cena de IA (travada). */
export function padraoInicial(marca: string): PadraoImagem[] {
  const base = { marca, tipo: "montagem" as TipoImagem, largura: 1200, altura: 1200, fundo: "#FFFFFF", margem_pct: 8, formato: "jpg" as const, fotos: [] as number[], logo_url: null, logo_posicao: "inferior_direito" as LogoPosicao, logo_tamanho_pct: 14, textos: [] as string[], cor_texto: "#111111", cor_destaque: "#6D28D9", prompt_ia: "", ativo: true };
  return [
    { ...base, posicao: 1, nome: "Principal", layout: "foto_unica", fotos: [1] },
    { ...base, posicao: 2, nome: "Detalhe", layout: "detalhe", margem_pct: 0, fotos: [2] },
    { ...base, posicao: 3, nome: "Colagem", layout: "colagem" },
    { ...base, posicao: 4, nome: "Medidas e peso", layout: "medidas", fotos: [1] },
    { ...base, posicao: 5, nome: "Cena (IA)", tipo: "cena_ia", layout: "foto_unica", fotos: [1], prompt_ia: "Foto de catálogo do produto em um ambiente real, iluminação natural, o produto idêntico à foto enviada (mesma estampa e cores)." },
  ];
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
    fundo: cor(l.fundo, "#FFFFFF"), margem_pct: num(l.margem_pct, 8, 0, 40),
    formato: l.formato === "png" ? "png" : "jpg",
    fotos: (Array.isArray(l.fotos) ? l.fotos : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_FOTOS),
    logo_url: l.logo_url ? String(l.logo_url) : null,
    logo_posicao: logos.includes(l.logo_posicao) ? l.logo_posicao : "inferior_direito",
    logo_tamanho_pct: num(l.logo_tamanho_pct, 14, 3, 50),
    textos: (Array.isArray(l.textos) ? l.textos : []).map((t: any) => String(t).trim()).filter(Boolean),
    cor_texto: cor(l.cor_texto, "#111111"), cor_destaque: cor(l.cor_destaque, "#6D28D9"),
    prompt_ia: String(l.prompt_ia || ""), ativo: l.ativo !== false,
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

export type Foto = { img: HTMLImageElement; largura: number; altura: number };

export function carregarImagem(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error("não consegui abrir a imagem"));
    img.src = src;
  });
}

export async function carregarFoto(arquivo: File): Promise<Foto & { url: string }> {
  const url = URL.createObjectURL(arquivo);
  const img = await carregarImagem(url);
  return { img, largura: img.naturalWidth, altura: img.naturalHeight, url };
}

function desenhar(ctx: CanvasRenderingContext2D, foto: Foto, caixa: Retangulo, modo: "conter" | "cobrir") {
  const e = enquadrar(foto.largura, foto.altura, caixa, modo);
  ctx.drawImage(foto.img, e.origem.x, e.origem.y, e.origem.w, e.origem.h, e.destino.x, e.destino.y, e.destino.w, e.destino.h);
}

function quebrarTexto(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean); const linhas: string[] = []; let atual = "";
  for (const p of palavras) {
    const teste = atual ? atual + " " + p : p;
    if (ctx.measureText(teste).width <= larguraMax || !atual) atual = teste; else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export interface ContextoMontagem { fotos: Foto[]; logo?: Foto | null; medidas?: MedidasProduto }

/** Monta UMA imagem do padrão (tipo "montagem"). Devolve o canvas pronto. */
export function montarImagem(p: PadraoImagem, c: ContextoMontagem): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = p.largura; canvas.height = p.altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("o navegador não liberou o canvas");
  ctx.fillStyle = p.fundo; ctx.fillRect(0, 0, p.largura, p.altura);
  ctx.imageSmoothingQuality = "high";
  const util = areaUtil(p.largura, p.altura, p.margem_pct);
  const idx = fotosDaPosicao(p, c.fotos.length);
  const fotos = idx.map((i) => c.fotos[i]).filter(Boolean);
  const escala = Math.min(p.largura, p.altura) / 1200;
  const fonte = (px: number, peso = 600) => `${peso} ${Math.round(px * escala)}px "Helvetica Neue", Arial, sans-serif`;

  if (fotos.length) {
    if (p.layout === "foto_unica") desenhar(ctx, fotos[0], util, "conter");
    else if (p.layout === "detalhe") desenhar(ctx, fotos[0], util, "cobrir");
    else if (p.layout === "colagem") {
      const grade = gradeColagem(fotos.length, util, Math.round(16 * escala));
      grade.forEach((cx, i) => { ctx.save(); ctx.beginPath(); ctx.rect(cx.x, cx.y, cx.w, cx.h); ctx.clip(); desenhar(ctx, fotos[i], cx, "cobrir"); ctx.restore(); });
    } else {
      // medidas / benefícios: foto à esquerda (58%) e painel de texto à direita
      const gap = Math.round(24 * escala);
      const larguraFoto = Math.round(util.w * 0.58);
      desenhar(ctx, fotos[0], { x: util.x, y: util.y, w: larguraFoto, h: util.h }, "conter");
      const painel: Retangulo = { x: util.x + larguraFoto + gap, y: util.y, w: util.w - larguraFoto - gap, h: util.h };
      ctx.textBaseline = "top";
      const itens = p.layout === "medidas"
        ? linhasDeMedidas(c.medidas || {}).map((l) => ({ titulo: l.rotulo, texto: l.valor }))
        : p.textos.map((t) => ({ titulo: "", texto: t }));
      if (itens.length) {
        const alturaItem = Math.min(painel.h / itens.length, 190 * escala);
        const topo = painel.y + (painel.h - alturaItem * itens.length) / 2;
        itens.forEach((it, i) => {
          const y = topo + i * alturaItem;
          ctx.fillStyle = p.cor_destaque; ctx.fillRect(painel.x, y + 8 * escala, 8 * escala, alturaItem - 28 * escala);
          const x = painel.x + 28 * escala; const larg = painel.w - 28 * escala;
          let cy = y + 8 * escala;
          if (it.titulo) { ctx.font = fonte(30, 500); ctx.fillStyle = p.cor_destaque; ctx.fillText(it.titulo, x, cy); cy += 42 * escala; }
          ctx.font = fonte(it.titulo ? 54 : 40, 700); ctx.fillStyle = p.cor_texto;
          quebrarTexto(ctx, it.texto, larg).slice(0, 3).forEach((ln, k) => ctx.fillText(ln, x, cy + k * (it.titulo ? 62 : 48) * escala));
        });
      }
    }
  }

  if (c.logo) {
    const lw = Math.round((p.largura * p.logo_tamanho_pct) / 100); const lh = Math.round((c.logo.altura / c.logo.largura) * lw);
    const r = posicaoLogo(lw, lh, p.largura, p.altura, p.logo_posicao, p.margem_pct);
    ctx.drawImage(c.logo.img, r.x, r.y, r.w, r.h);
  }
  return canvas;
}

export function canvasParaBlob(canvas: HTMLCanvasElement, formato: "jpg" | "png"): Promise<Blob> {
  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("não consegui gerar o arquivo da imagem"))), formato === "png" ? "image/png" : "image/jpeg", 0.92));
}
