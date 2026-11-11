// Links da Amazon Brasil. Só aceitamos https em amazon.com.br (nada de localhost/IP interno).
import { ErroValidacao } from "../tipos";

function analisar(bruta: string): URL {
  let u: URL;
  try { u = new URL(bruta.trim()); } catch { throw new ErroValidacao("Link inválido. Cole o endereço completo, começando com https://"); }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") throw new ErroValidacao("Use um link https:// da Amazon.");
  if (u.username || u.password || u.port) throw new ErroValidacao("Link inválido.");
  const h = u.hostname.toLowerCase();
  if (h !== "amazon.com.br" && !h.endsWith(".amazon.com.br")) throw new ErroValidacao("O link precisa ser da Amazon Brasil (amazon.com.br).");
  return u;
}

/** ASIN (10 letras/números) do anúncio: /dp/B0XXXXXXXX, /gp/product/B0XXXXXXXX... */
export function idAmazon(url: string): string | null {
  const m = /\/(?:dp|gp\/product|gp\/aw\/d|product|d)\/([A-Z0-9]{10})(?:[/?#]|$)/i.exec(url);
  return m ? m[1].toUpperCase() : null;
}

export function normalizarUrlAnuncioAmazon(bruta: string): { url: string; mlb_id: string } {
  const u = analisar(bruta);
  const id = idAmazon(u.pathname + u.search);
  if (!id) throw new ErroValidacao("Não achei o código do produto (ASIN) nesse link. Cole o endereço da página do produto da Amazon.");
  return { url: `https://www.amazon.com.br/dp/${id}`, mlb_id: id };
}

const CAMINHO_LISTA = /^\/(?:s|b|gp\/bestsellers|bestsellers|mais-vendidos|zgbs|[^/]+\/zgbs|gp\/movers-and-shakers|gp\/new-releases)(?:\/|$)/i;
const PARAMS_QUE_FICAM = ["bbn", "field-keywords", "i", "k", "node", "rh", "s"];

/** Busca (/s?k=…), categoria (/b?node=…) ou ranking (/gp/bestsellers/…): sem página, rastreio nem "ref=". */
export function normalizarUrlCategoriaAmazon(bruta: string): string {
  const u = analisar(bruta);
  if (idAmazon(u.pathname)) throw new ErroValidacao("Esse link é de um produto. Para cadastrar uma lista, cole o link de uma busca, categoria ou da página Mais vendidos da Amazon.");
  if (!CAMINHO_LISTA.test(u.pathname)) throw new ErroValidacao("Cole o link de uma busca (amazon.com.br/s?k=…), de uma categoria ou da página Mais vendidos da Amazon.");
  const path = decodeURI(u.pathname).replace(/\/ref=[^/]*$/i, "").replace(/\/+$/, "") || "/";
  const q = new URLSearchParams();
  for (const k of PARAMS_QUE_FICAM) { const v = u.searchParams.get(k); if (v) q.set(k, v); }
  const qs = q.toString();
  return `https://www.amazon.com.br${encodeURI(path)}${qs ? `?${qs}` : ""}`;
}

export function nomeDaCategoriaAmazon(url: string): string {
  try {
    const u = new URL(url);
    const k = u.searchParams.get("k");
    if (k) return k.charAt(0).toUpperCase() + k.slice(1);
    const partes = decodeURIComponent(u.pathname).split("/").filter(Boolean).filter((p) => !/^(gp|zgbs|bestsellers|s|b|ref=.*|\d+)$/i.test(p));
    const ultimo = partes[partes.length - 1];
    if (ultimo) { const t = ultimo.replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); }
  } catch { /* cai no padrão */ }
  return "Categoria";
}
