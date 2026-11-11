// Links da Shopee Brasil. Só aceitamos https em shopee.com.br (nada de localhost/IP interno).
import { ErroValidacao } from "../tipos";

function analisar(bruta: string): URL {
  let u: URL;
  try { u = new URL(bruta.trim()); } catch { throw new ErroValidacao("Link inválido. Cole o endereço completo, começando com https://"); }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") throw new ErroValidacao("Use um link https:// da Shopee.");
  if (u.username || u.password || u.port) throw new ErroValidacao("Link inválido.");
  const h = u.hostname.toLowerCase();
  if (h !== "shopee.com.br" && !h.endsWith(".shopee.com.br")) throw new ErroValidacao("O link precisa ser da Shopee Brasil (shopee.com.br).");
  return u;
}

/** Id do produto na Shopee: "<loja>.<item>", vindo de "...-i.123.456" ou "/product/123/456". */
export function idShopee(path: string): string | null {
  const a = /-i\.(\d+)\.(\d+)(?:[/?#]|$)/.exec(path);
  if (a) return `${a[1]}.${a[2]}`;
  const b = /\/product\/(\d+)\/(\d+)(?:[/?#]|$)/.exec(path);
  return b ? `${b[1]}.${b[2]}` : null;
}

export function normalizarUrlAnuncioShopee(bruta: string): { url: string; mlb_id: string } {
  const u = analisar(bruta);
  const id = idShopee(u.pathname);
  if (!id) throw new ErroValidacao("Não achei o código do produto nesse link. Cole o endereço da página do produto da Shopee (termina com -i.números.números).");
  const [loja, item] = id.split(".");
  return { url: `https://shopee.com.br/product/${loja}/${item}`, mlb_id: id };
}

const PARAMS_QUE_FICAM = ["facet", "keyword", "order", "sortBy"];

/** Busca (/search?keyword=…), categoria (…-cat.123) ou loja (/shop/123): sem página nem rastreio. */
export function normalizarUrlCategoriaShopee(bruta: string): string {
  const u = analisar(bruta);
  if (idShopee(u.pathname)) throw new ErroValidacao("Esse link é de um produto. Para cadastrar uma lista, cole o link de uma busca, categoria ou loja da Shopee.");
  const p = decodeURI(u.pathname).replace(/\/+$/, "");
  const ehBusca = /^\/search$/i.test(p) && !!u.searchParams.get("keyword");
  const ehCategoria = /-(?:cat|col)\.[\d.]+$/i.test(p);
  const ehLoja = /^\/shop\/\d+$/i.test(p);
  if (!ehBusca && !ehCategoria && !ehLoja) throw new ErroValidacao("Cole o link de uma busca (shopee.com.br/search?keyword=…), de uma categoria ou de uma loja da Shopee.");
  const q = new URLSearchParams();
  for (const k of PARAMS_QUE_FICAM) { const v = u.searchParams.get(k); if (v) q.set(k, v); }
  const qs = q.toString();
  return `https://shopee.com.br${encodeURI(p)}${qs ? `?${qs}` : ""}`;
}

export function nomeDaCategoriaShopee(url: string): string {
  try {
    const u = new URL(url);
    const k = u.searchParams.get("keyword");
    if (k) return k.charAt(0).toUpperCase() + k.slice(1);
    const slug = decodeURIComponent(u.pathname).split("/").filter(Boolean).pop() || "";
    const t = slug.replace(/-(?:cat|col)\.[\d.]+$/i, "").replace(/-/g, " ").trim();
    if (t && !/^\d+$/.test(t) && t.toLowerCase() !== "shop") return t.charAt(0).toUpperCase() + t.slice(1);
  } catch { /* cai no padrão */ }
  return "Categoria";
}
