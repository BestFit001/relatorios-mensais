// Validação de links do Mercado Livre. Só aceitamos https em *.mercadolivre.com.br:
// o servidor busca esses links, então nada de localhost/IP interno (SSRF).
import { ErroValidacao } from "../tipos";

export const PAGINA_LISTAGEM = 48; // anúncios por página na listagem pública

function analisar(bruta: string): URL {
  let u: URL;
  try { u = new URL(bruta.trim()); } catch { throw new ErroValidacao("Link inválido. Cole o endereço completo, começando com https://"); }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") throw new ErroValidacao("Use um link https:// do Mercado Livre.");
  if (u.username || u.password || u.port) throw new ErroValidacao("Link inválido.");
  const h = u.hostname.toLowerCase();
  if (h !== "mercadolivre.com.br" && !h.endsWith(".mercadolivre.com.br")) {
    throw new ErroValidacao("O link precisa ser do Mercado Livre Brasil (mercadolivre.com.br).");
  }
  return u;
}

/** Id do anúncio (MLB123456789) dentro de um link; `wid=` (anúncio escolhido no catálogo) tem prioridade. */
export function idDoAnuncio(url: string): string | null {
  const wid = /[?&#]wid=(MLB-?\d{6,})/i.exec(url);
  const m = wid || /MLB-?(\d{6,})/i.exec(url);
  if (!m) return null;
  const digitos = /\d{6,}/.exec(m[0])![0];
  return `MLB${digitos}`;
}

/** Link de categoria/lista: `https://lista.mercadolivre.com.br/<slug>` sem paginação nem query. */
export function normalizarUrlCategoria(bruta: string): string {
  const u = analisar(bruta);
  if (u.hostname.toLowerCase() !== "lista.mercadolivre.com.br") {
    throw new ErroValidacao("Cole um link de listagem do Mercado Livre (começa com https://lista.mercadolivre.com.br/…). Abra a categoria ou a busca no site e copie o endereço.");
  }
  // a barra final importa: categorias usam "/pochetes/_Desde_49", buscas usam "/slug_Desde_49"
  const barraFinal = /\/$/.test(u.pathname.replace(/_Desde_\d+.*$/i, ""));
  const path = decodeURI(u.pathname).replace(/_Desde_\d+/gi, "").replace(/_NoIndex_True/gi, "").replace(/\/+$/, "");
  if (!path || path === "/") throw new ErroValidacao("Esse link não aponta para uma categoria ou busca específica.");
  return `https://lista.mercadolivre.com.br${encodeURI(path)}${barraFinal ? "/" : ""}`;
}

/** URL da página N (1 = a própria listagem; 2 = `_Desde_49`...). */
export function urlDaPagina(urlCategoria: string, pagina: number): string {
  if (pagina <= 1) return urlCategoria;
  return `${urlCategoria}_Desde_${(pagina - 1) * PAGINA_LISTAGEM + 1}`;
}

/** Texto da busca a partir do último trecho do endereço ("organizador-de-gaveta_Frete_Full" -> "organizador de gaveta"). */
export function consultaDaCategoria(urlCategoria: string): string {
  const partes = decodeURIComponent(new URL(urlCategoria).pathname).split("/").filter(Boolean);
  const slug = partes[partes.length - 1] || "";
  return slug.split("_")[0].replace(/-/g, " ").trim();
}

/** Nome legível a partir do link (usado quando a página não informa). */
export function nomeDaCategoria(urlCategoria: string): string {
  const q = consultaDaCategoria(urlCategoria);
  return q ? q.charAt(0).toUpperCase() + q.slice(1) : "Categoria";
}

/** Link de anúncio: precisa ser do ML e ter id MLB. Devolve link limpo (sem rastreio) e o id. */
export function normalizarUrlAnuncio(bruta: string): { url: string; mlb_id: string } {
  const u = analisar(bruta);
  const mlb_id = idDoAnuncio(u.toString());
  if (!mlb_id) throw new ErroValidacao("Não achei o código do anúncio (MLB…) nesse link. Cole o endereço da página do anúncio.");
  const wid = /[?&]wid=(MLB-?\d+)/i.exec(u.search);
  const limpa = `${u.protocol}//${u.hostname}${u.pathname}${wid ? `?wid=${wid[1]}` : ""}`;
  return { url: limpa, mlb_id };
}

/** Aceita a imagem só se for https (a tela usa direto no <img>). */
export function imagemSegura(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const t = url.trim().replace(/^http:\/\//i, "https://").replace(/^\/\//, "https://");
  return /^https:\/\/[^\s"'<>]+$/i.test(t) ? t : null;
}

/** Aceita o link do anúncio vindo da página só se for do ML. */
export function urlAnuncioSegura(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try { return normalizarUrlAnuncio(url).url; } catch { return null; }
}
