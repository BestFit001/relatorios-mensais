// Apresentação Time: importação de arquivos.
//  - PDF  -> cada página vira uma imagem (fiel ao original)
//  - PPTX -> leitura "melhor esforço": textos e imagens de cada slide viram blocos editáveis
import type { Bloco, Slide } from "./apresentacao";
import { novoId } from "./apresentacao";

// ---------------------------------------------------------------- PDF
/** Renderiza cada página do PDF em JPEG (largura 1920) e entrega ao `salvar`, que devolve a URL pública. */
export async function pdfParaUrls(
  file: File,
  salvar: (blob: Blob, pagina: number) => Promise<string>,
  aoProgredir: (feitas: number, total: number) => void,
): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const urls: string[] = [];
  aoProgredir(0, pdf.numPages);
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const base = pagina.getViewport({ scale: 1 });
    const vp = pagina.getViewport({ scale: 1920 / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob: Blob = await new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Não consegui gerar a imagem da página " + i))), "image/jpeg", 0.88));
    canvas.width = 0; canvas.height = 0;
    urls.push(await salvar(blob, i));
    pagina.cleanup();
    aoProgredir(i, pdf.numPages);
  }
  await pdf.destroy();
  return urls;
}

export const slidesDeImagens = (urls: string[]): Slide[] => urls.map((u) => ({ id: novoId(), layout: "imagem", titulo: "", subtitulo: "", blocos: [], imagem: u }));

// ---------------------------------------------------------------- PPTX
export interface TextoPptx { texto: string; tamanhoPt: number; negrito: boolean; vermelho: boolean; centro: boolean; titulo: boolean }
export interface ImagemPptx { dados: Uint8Array; ext: string; x: number }
export interface SlideLido { textos: TextoPptx[]; imagens: ImagemPptx[]; naoConvertidos: number }

const EXT_OK = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp" };
export const mimeDaExtensao = (ext: string) => MIME[ext.toLowerCase()] || "application/octet-stream";

const resolverCaminho = (base: string, alvo: string): string => {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = base.split("/").slice(0, -1);
  for (const p of alvo.split("/")) { if (p === "..") partes.pop(); else if (p !== ".") partes.push(p); }
  return partes.join("/");
};

/** Lê o PPTX (ZIP de XMLs). Precisa de DOMParser (navegador). */
export async function lerPptx(file: File): Promise<SlideLido[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = async (caminho: string): Promise<Document | null> => {
    const f = zip.file(caminho);
    return f ? new DOMParser().parseFromString(await f.async("string"), "application/xml") : null;
  };
  const rels = async (caminho: string): Promise<Record<string, string>> => {
    const d = await xml(caminho.replace(/([^/]+)$/, "_rels/$1.rels"));
    const m: Record<string, string> = {};
    d?.querySelectorAll("Relationship").forEach((r) => { m[r.getAttribute("Id") || ""] = r.getAttribute("Target") || ""; });
    return m;
  };

  const pres = await xml("ppt/presentation.xml");
  if (!pres) throw new Error("Este arquivo não parece ser um PowerPoint (.pptx).");
  const relsPres = await rels("ppt/presentation.xml");
  const caminhos = Array.from(pres.getElementsByTagName("p:sldId")).map((s) => relsPres[s.getAttribute("r:id") || ""]).filter(Boolean).map((t) => resolverCaminho("ppt/presentation.xml", t));
  const tam = pres.getElementsByTagName("p:sldSz")[0];
  const larguraSlide = Number(tam?.getAttribute("cx")) || 12192000;
  const alturaSlide = Number(tam?.getAttribute("cy")) || 6858000;

  const lidos: SlideLido[] = [];
  for (const caminho of caminhos) {
    const doc = await xml(caminho);
    const relsSlide = await rels(caminho);
    const saida: SlideLido = { textos: [], imagens: [], naoConvertidos: 0 };
    if (!doc) { lidos.push(saida); continue; }

    const textoDe = (el: Element): TextoPptx[] => {
      const ph = el.getElementsByTagName("p:ph")[0];
      const tipoPh = ph?.getAttribute("type") || "";
      const ehTitulo = tipoPh === "title" || tipoPh === "ctrTitle";
      const paragrafos: { t: string; sz: number; b: boolean; verm: boolean; ctr: boolean }[] = [];
      for (const p of Array.from(el.getElementsByTagName("a:p"))) {
        let t = "", sz = 0, b = false, verm = false;
        for (const no of Array.from(p.childNodes) as Element[]) {
          if (no.nodeName === "a:br") t += "\n";
          if (no.nodeName === "a:r" || no.nodeName === "a:fld") {
            t += no.getElementsByTagName("a:t")[0]?.textContent || "";
            const rpr = no.getElementsByTagName("a:rPr")[0];
            if (rpr) {
              sz = Math.max(sz, Number(rpr.getAttribute("sz")) || 0);
              if (rpr.getAttribute("b") === "1") b = true;
              const cor = rpr.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val")?.toUpperCase();
              if (cor && /^(FF0000|E60000|C00000|FF1F1F)$/.test(cor)) verm = true;
            }
          }
        }
        paragrafos.push({ t, sz, b, verm, ctr: p.getElementsByTagName("a:pPr")[0]?.getAttribute("algn") === "ctr" });
      }
      const uteis = paragrafos.filter((p) => p.t.trim());
      if (uteis.length === 0) return [];
      // título/cabeçalhos: 1 texto por parágrafo quando o shape é título; senão o shape inteiro vira 1 texto
      if (ehTitulo) return [{ texto: uteis.map((p) => p.t).join(" "), tamanhoPt: (uteis[0].sz || 4000) / 100, negrito: true, vermelho: false, centro: uteis[0].ctr, titulo: true }];
      return [{
        texto: paragrafos.map((p) => p.t).join("\n").replace(/^\n+|\n+$/g, ""),
        tamanhoPt: Math.max(...uteis.map((p) => p.sz)) / 100 || 0,
        negrito: uteis.every((p) => p.b), vermelho: uteis.some((p) => p.verm), centro: uteis[0].ctr, titulo: false,
      }];
    };

    const visitar = async (no: Element) => {
      for (const filho of Array.from(no.children)) {
        const nome = filho.nodeName;
        if (nome === "p:sp") saida.textos.push(...textoDe(filho));
        else if (nome === "p:grpSp") await visitar(filho);
        else if (nome === "p:pic") {
          const rid = filho.getElementsByTagName("a:blip")[0]?.getAttribute("r:embed") || "";
          const alvo = relsSlide[rid];
          const off = filho.getElementsByTagName("a:off")[0];
          const x = Number(off?.getAttribute("x")) || 0, y = Number(off?.getAttribute("y")) || 0;
          const ext = (alvo?.split(".").pop() || "").toLowerCase();
          if (!alvo || !EXT_OK.includes(ext)) { saida.naoConvertidos++; continue; }
          if (y < alturaSlide * 0.1 && x > larguraSlide * 0.7) continue;   // logo repetido no canto do cabeçalho
          const arq = zip.file(resolverCaminho(caminho, alvo));
          if (arq) saida.imagens.push({ dados: await arq.async("uint8array"), ext, x });
        } else if (nome === "p:graphicFrame") {
          const linhas = Array.from(filho.getElementsByTagName("a:tr")).map((tr) => Array.from(tr.getElementsByTagName("a:tc")).map((tc) => Array.from(tc.getElementsByTagName("a:t")).map((t) => t.textContent || "").join("")).join("  |  ")).filter((l) => l.replace(/[\s|]/g, ""));
          if (linhas.length) saida.textos.push({ texto: linhas.join("\n"), tamanhoPt: 18, negrito: false, vermelho: false, centro: false, titulo: false });
          else saida.naoConvertidos++;   // gráfico etc.
        }
      }
    };
    const arvore = doc.getElementsByTagName("p:spTree")[0];
    if (arvore) await visitar(arvore);
    saida.imagens.sort((a, b) => a.x - b.x);
    lidos.push(saida);
  }
  return lidos;
};

/** Converte o que foi lido em slides do app. `urls[i]` = URLs (já enviadas) das imagens do slide i, na mesma ordem. */
export function montarSlidesDoPptx(lidos: SlideLido[], urls: string[][]): Slide[] {
  return lidos.map((s, i) => {
    const textos = s.textos.filter((t) => t.texto.trim());
    const imagens = urls[i] || [];
    const novo: Slide = { id: novoId(), layout: "conteudo", titulo: "", subtitulo: "", blocos: [] };

    if (i === 0 && textos.length > 0) {   // 1º slide = capa
      return { ...novo, layout: "capa", titulo: textos[0].texto.replace(/\n+/g, " "), subtitulo: (textos[1]?.texto || "").replace(/\n+/g, " ") };
    }
    let resto = textos.slice();
    const idxTitulo = resto.findIndex((t) => t.titulo);
    const idxCandidato = idxTitulo >= 0 ? idxTitulo : resto.findIndex((t, k) => k === 0 && (t.negrito || t.tamanhoPt >= 24) && !t.texto.includes("\n"));
    if (idxCandidato >= 0) { novo.titulo = resto[idxCandidato].texto.replace(/\n+/g, " "); resto.splice(idxCandidato, 1); }
    if (novo.titulo && resto[0] && !resto[0].texto.includes("\n") && resto[0].texto.length <= 45 && (resto[0].negrito || resto[0].tamanhoPt >= 14) && resto[0].tamanhoPt <= 24) {
      novo.subtitulo = resto[0].texto; resto = resto.slice(1);
    }
    if (novo.titulo && resto.length === 0 && imagens.length === 0) { novo.layout = "secao"; return novo; }
    for (const t of resto) {
      const b: Bloco = { id: novoId(), tipo: "texto", titulo: "", texto: t.texto, cor: t.vermelho ? "vermelho" : "normal", tamanho: t.tamanhoPt >= 26 ? "g" : t.tamanhoPt > 0 && t.tamanhoPt < 18 ? "p" : "m", centralizar: t.centro };
      novo.blocos.push(b);
    }
    if (imagens.length) novo.blocos.push({ id: novoId(), tipo: "imagens", urls: imagens });
    return novo;
  });
}
