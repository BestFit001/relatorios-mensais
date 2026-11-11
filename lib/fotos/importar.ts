// Buscar fotos SEM API: o favorito lê a página de resultados do Google (Shopping) no navegador; aqui abrimos a página de cada loja
// encontrada, tiramos de lá as fotos do produto (a maior possível), medimos e ordenamos pela resolução.
import { sanitizarPesquisa } from "../concorrentes/pesquisa";
import { ErroValidacao } from "../concorrentes/tipos";
import { medirTodas, type BuscaResposta } from "./busca";
import { extrairImagensDaPagina, variantesMaiores } from "./paginas";
import { fetchSeguro, urlPermitida } from "./seguranca";
import type { Candidato } from "./tipos";

export const MAX_PAGINAS = 30;
export const MAX_FOTOS_MEDIDAS = 150;

type LerPagina = (url: string) => Promise<{ html: string; urlFinal: string } | null>;
const lerPaginaPadrao: LerPagina = async (url) => {
  try {
    const r = await fetchSeguro(url, { maxBytes: 1_500_000, timeoutMs: 8000, headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-encoding": "identity", "accept-language": "pt-BR,pt;q=0.9" } });
    if (r.status < 200 || r.status >= 300) return null;
    return { html: r.corpo.toString("utf8"), urlFinal: r.urlFinal };
  } catch { return null; }
};

/** Páginas de loja a abrir: uma vez cada, só https público, sem as páginas do próprio Google. */
export function paginasDeLoja(resultados: { url: string | null; host: string | null; titulo: string }[]): { url: string; titulo: string }[] {
  const vistos = new Set<string>(); const saida: { url: string; titulo: string }[] = [];
  for (const r of resultados) {
    if (!r.url || !r.host || vistos.has(r.url) || !urlPermitida(r.url)) continue;
    vistos.add(r.url); saida.push({ url: r.url, titulo: r.titulo });
    if (saida.length >= MAX_PAGINAS) break;
  }
  return saida;
}

export async function importarFotos(texto: unknown, lerPagina: LerPagina = lerPaginaPadrao, medir = medirTodas): Promise<BuscaResposta> {
  if (typeof texto !== "string" || !texto.trim()) throw new ErroValidacao("Cole o texto que o favorito copiou no Google.");
  if (texto.length > 2_000_000) throw new ErroValidacao("Texto grande demais.");
  let payload: unknown; try { payload = JSON.parse(texto); } catch { throw new ErroValidacao("O texto colado não está completo. Use o botão Copiar do favorito e cole tudo."); }
  if ((payload as any)?.tipo !== "pesquisa") throw new ErroValidacao("Esse texto não é de uma pesquisa do Google. Abra o Google (aba Shopping/Produtos, com preços), clique no favorito e cole o texto dele.");
  const pesquisa = sanitizarPesquisa(payload);
  const paginas = paginasDeLoja(pesquisa.resultados);
  if (!paginas.length) throw new ErroValidacao("Nenhum resultado tem link de loja (só páginas do próprio Google). Abra a aba Shopping/Produtos do Google e leia de novo.");

  // abre as páginas das lojas (poucas por vez, com prazo)
  const prazo = Date.now() + 22_000; let proxima = 0; let lidas = 0;
  const porPagina: { pagina: string; titulo: string; imagens: string[] }[] = [];
  const trabalhador = async () => {
    while (proxima < paginas.length && Date.now() < prazo) {
      const p = paginas[proxima++]; const r = await lerPagina(p.url); if (!r) continue;
      lidas++; porPagina.push({ pagina: p.url, titulo: p.titulo, imagens: extrairImagensDaPagina(r.html, r.urlFinal) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, paginas.length) }, trabalhador));

  const vistos = new Set<string>(); const candidatos: Candidato[] = [];
  const nova = (url: string, pagina: string, titulo: string) => {
    if (vistos.has(url) || candidatos.length >= MAX_FOTOS_MEDIDAS || !urlPermitida(url)) return;
    vistos.add(url); candidatos.push({ url, origem: "busca", pagina, titulo });
  };
  for (const p of porPagina) for (const img of p.imagens) { for (const v of variantesMaiores(img)) nova(v, p.pagina, p.titulo); nova(img, p.pagina, p.titulo); }

  const fotos = candidatos.length ? await medir(candidatos) : [];
  return { fotos, termo: pesquisa.termo || "", candidatos: candidatos.length, paginasLidas: lidas, paginasTotal: paginas.length };
}
