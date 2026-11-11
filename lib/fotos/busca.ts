// Mede cada foto (lendo só o começo do arquivo) e ordena pela resolução.
import { dimensoes, type TipoImagem } from "./imagem";
import { fetchSeguro, urlPermitida, type RespostaSegura } from "./seguranca";
import { chaveFamilia } from "./paginas";
import type { Candidato, OrigemFoto } from "./tipos";

export interface FotoAchada {
  url: string; largura: number; altura: number; pixels: number; tipo: TipoImagem; bytes: number | null;
  origem: OrigemFoto; pagina: string | null; titulo: string | null; dominio: string;
}
export interface BuscaResposta {
  fotos: FotoAchada[]; termo: string; candidatos: number; paginasLidas: number; paginasTotal: number; semLink: number;
}

type Baixar = (url: string) => Promise<RespostaSegura>;
const baixarCabecalho: Baixar = (url) => fetchSeguro(url, { maxBytes: 131_072, timeoutMs: 6000, headers: { range: "bytes=0-131071" } });

/** Mede uma imagem. Devolve null se não for imagem, estiver quebrada ou for pequena demais (ícone). */
export async function medirImagem(c: Candidato, baixar: Baixar = baixarCabecalho): Promise<FotoAchada | null> {
  const u = urlPermitida(c.url); if (!u) return null;
  try {
    const r = await baixar(c.url);
    if (r.status < 200 || r.status >= 300) return null;
    const d = dimensoes(r.corpo); if (!d) return null;
    if (Math.max(d.largura, d.altura) < 100) return null;
    const cr = String(r.headers["content-range"] || "").match(/\/(\d+)$/);
    const cl = Number(r.headers["content-length"]);
    const bytes = cr ? Number(cr[1]) : r.status === 200 && Number.isFinite(cl) && cl > 0 ? cl : null;
    return { url: c.url, largura: d.largura, altura: d.altura, pixels: d.largura * d.altura, tipo: d.tipo, bytes, origem: c.origem, pagina: c.pagina || null, titulo: c.titulo || null, dominio: u.hostname.replace(/^www\./, "") };
  } catch { return null; }
}

/** Mede em paralelo (com prazo total), tira repetidas pelo tamanho idêntico na mesma página e ordena: maior resolução primeiro. */
export async function medirTodas(cands: Candidato[], baixar: Baixar = baixarCabecalho, opc = { paralelo: 10, prazoMs: 25_000 }): Promise<FotoAchada[]> {
  const fim = Date.now() + opc.prazoMs; const saida: FotoAchada[] = []; let i = 0;
  const trabalhador = async () => { while (i < cands.length && Date.now() < fim) { const c = cands[i++]; const f = await medirImagem(c, baixar); if (f) saida.push(f); } };
  await Promise.all(Array.from({ length: Math.min(opc.paralelo, cands.length) }, trabalhador));
  // a mesma foto costuma aparecer em lojas diferentes: mesma resolução e mesmo tamanho em bytes = repetida
  const unicas = new Map<string, FotoAchada>();
  for (const f of saida) { const k = f.bytes ? `${f.largura}x${f.altura}:${f.bytes}` : `url:${f.url}`; if (!unicas.has(k)) unicas.set(k, f); }
  // a mesma foto em vários tamanhos (…-640-0 e …-480-0): fica só a maior
  const familias = new Map<string, FotoAchada>();
  for (const f of unicas.values()) { const k = chaveFamilia(f.url); const atual = familias.get(k); if (!atual || f.pixels > atual.pixels) familias.set(k, f); }
  return Array.from(familias.values()).sort((a, b) => b.pixels - a.pixels);
}
