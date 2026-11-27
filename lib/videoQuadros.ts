// Tira quadros de um vídeo do produto, no navegador, para usar como fotos de referência extras na Cena (IA)
// (alça, zíper, etiqueta e estampa vistos de perto). Nada do vídeo é enviado: só os quadros escolhidos, reduzidos.

export interface Quadro { url: string; base64: string; mime: string; tempo: number }
export const MAX_VIDEO_MB = 300;

/** Instantes (em segundos) espalhados pelo vídeo, sem o começo e o fim, que costumam ser fade ou tela preta. */
export function instantesDosQuadros(duracao: number, qtd: number): number[] {
  if (!(duracao > 0) || !Number.isFinite(duracao) || qtd < 1) return [];
  if (qtd === 1) return [duracao / 2];
  return Array.from({ length: qtd }, (_, i) => Math.round((duracao * (0.04 + (0.92 * i) / (qtd - 1))) * 100) / 100);
}

/** Quais quadros já vêm marcados: espalhados (ex.: 4 entre 12), evitando as pontas. */
export function quadrosIniciais(total: number, marcar: number): number[] {
  if (total <= 0) return [];
  if (total <= marcar) return Array.from({ length: total }, (_, i) => i);
  return Array.from({ length: marcar }, (_, i) => Math.min(total - 1, Math.round(((i + 0.5) * total) / marcar - 0.5)));
}

const esperar = (el: HTMLVideoElement, evento: string, ms: number) =>
  new Promise<void>((ok, no) => {
    const t = setTimeout(() => { limpar(); no(new Error("o vídeo demorou para carregar")); }, ms);
    const bom = () => { limpar(); ok(); };
    const ruim = () => { limpar(); no(new Error("não consegui ler este vídeo (tente MP4 ou WebM)")); };
    const limpar = () => { clearTimeout(t); el.removeEventListener(evento, bom); el.removeEventListener("error", ruim); };
    el.addEventListener(evento, bom, { once: true }); el.addEventListener("error", ruim, { once: true });
  });

export async function extrairQuadros(arquivo: File, qtd = 12, maxLado = 1024): Promise<Quadro[]> {
  if (arquivo.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`o vídeo passa de ${MAX_VIDEO_MB} MB`);
  const url = URL.createObjectURL(arquivo);
  try {
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.playsInline = true; v.src = url;
    await esperar(v, "loadeddata", 20000);
    const tempos = instantesDosQuadros(v.duration, qtd);
    if (!tempos.length) throw new Error("não consegui saber a duração do vídeo");
    const k = Math.min(1, maxLado / Math.max(v.videoWidth, v.videoHeight, 1));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k));
    const ctx = c.getContext("2d")!; const saida: Quadro[] = [];
    for (const t of tempos) {
      const pronto = esperar(v, "seeked", 10000); v.currentTime = t; await pronto;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.85);
      saida.push({ url: data, base64: data.split(",")[1], mime: "image/jpeg", tempo: t });
    }
    return saida;
  } finally { URL.revokeObjectURL(url); }
}
