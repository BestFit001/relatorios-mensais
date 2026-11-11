// Buscar fotos SEM API: o favorito lê o Bing Imagens no navegador da pessoa e traz os endereços das fotos em tamanho original.
// Aqui validamos o texto, medimos cada foto e ordenamos pela resolução (mesmo caminho da busca por foto).
import { ErroValidacao } from "../concorrentes/tipos";
import { medirTodas, type BuscaResposta } from "./busca";
import { urlPermitida } from "./seguranca";
import type { Candidato } from "./vision";

export const MAX_FOTOS_IMPORTADAS = 150;

const limpoTexto = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
};
const httpOpcional = (v: unknown): string | undefined => {
  if (typeof v !== "string" || v.length > 2000) return undefined;
  try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined; } catch { return undefined; }
};

/** Valida o texto do favorito. Só entram endereços https públicos (os outros são descartados, nunca abertos). */
export function sanitizarFotos(bruto: unknown): { candidatos: Candidato[]; termo: string; descartados: number } {
  const p = bruto as any;
  if (p && typeof p === "object" && (p.tipo === "anuncio" || p.tipo === "categoria" || p.tipo === "ranking" || p.tipo === "pesquisa")) {
    throw new ErroValidacao("Esse texto não é do Bing Imagens: ele foi lido em outro site/aba. Aqui cole o texto do favorito lido em bing.com/images.");
  }
  if (!p || typeof p !== "object" || p.v !== 1 || p.canal !== "bing" || p.tipo !== "fotos" || !Array.isArray(p.fotos)) {
    throw new ErroValidacao("Texto inválido. No Bing Imagens, clique no favorito e cole exatamente o que ele copiou.");
  }
  if (p.fotos.length === 0) throw new ErroValidacao("O texto não tem nenhuma foto.");
  const vistos = new Set<string>(); const candidatos: Candidato[] = []; let descartados = 0;
  for (const f of p.fotos.slice(0, 600)) {
    const u = urlPermitida(f?.url);
    if (!u || vistos.has(u.toString())) { descartados++; continue; }
    vistos.add(u.toString());
    if (candidatos.length >= MAX_FOTOS_IMPORTADAS) { descartados++; continue; }
    candidatos.push({ url: u.toString(), origem: "busca", pagina: httpOpcional(f?.pagina), titulo: limpoTexto(f?.titulo, 160) });
  }
  if (!candidatos.length) throw new ErroValidacao("Nenhum endereço de foto aceitável no texto (só valem fotos em https).");
  return { candidatos, termo: limpoTexto(p.termo, 160) || "", descartados };
}

export async function importarFotos(texto: unknown): Promise<BuscaResposta> {
  if (typeof texto !== "string" || !texto.trim()) throw new ErroValidacao("Cole o texto que o favorito copiou no Bing Imagens.");
  if (texto.length > 2_000_000) throw new ErroValidacao("Texto grande demais.");
  let payload: unknown; try { payload = JSON.parse(texto); } catch { throw new ErroValidacao("O texto colado não está completo. Use o botão Copiar do favorito e cole tudo."); }
  const { candidatos, termo } = sanitizarFotos(payload);
  const fotos = await medirTodas(candidatos, undefined, { paralelo: 10, prazoMs: 45_000 });
  return { fotos, palpite: termo, entidades: [], candidatos: candidatos.length, usados: 0, limite: 0, gratuito: true };
}
