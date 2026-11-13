// Prévia de links para o chat: transforma uma URL (ex.: anúncio do Mercado Livre) num cartão com foto, título e preço.
// Roda só no servidor. Só aceita http/https, bloqueia endereços internos (SSRF), limita tempo e tamanho da resposta.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type CartaoLink = { tipo: "link"; url: string; site: string; titulo: string; imagem: string | null; preco: number | null; moeda: string | null; descricao: string | null };

export const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const PONTUACAO_FINAL = /[.,;:!?)\]}»”’]+$/;

/** URLs encontradas no texto (sem a pontuação colada no fim). */
export function extrairUrls(texto: string): string[] {
  return (String(texto || "").match(URL_RE) || []).map((u) => u.replace(PONTUACAO_FINAL, "")).filter(Boolean);
}

const hostDe = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; } };
const ehML = (host: string) => /(^|\.)mercadoli(vre|bre)\.com(\.[a-z]{2})?$/i.test(host);

/** Nome amigável do site para o cartão. */
export function nomeDoSite(url: string): string {
  const h = hostDe(url);
  const mapa: [RegExp, string][] = [[/mercadoli/, "Mercado Livre"], [/shopee/, "Shopee"], [/amazon/, "Amazon"], [/magazineluiza|magalu/, "Magalu"], [/shein/, "Shein"], [/netshoes/, "Netshoes"], [/centauro/, "Centauro"], [/tiktok/, "TikTok Shop"], [/americanas/, "Americanas"], [/aliexpress/, "AliExpress"], [/kabum/, "KaBuM!"]];
  return mapa.find(([re]) => re.test(h))?.[1] || h || "Link";
}

/** Tira rastreadores do link (no Mercado Livre, tudo depois do "?", pois o endereço já identifica o anúncio). */
export function limparUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    if (ehML(u.hostname)) { u.search = ""; return u.toString(); }
    for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|gclid|gbraid|wbraid|fbclid|gad_|matt_|cq_|msclkid|igshid|mc_)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch { return url; }
}

/** Código do anúncio (MLB123…) quando o link traz um. Catálogo "MLBU…" não é anúncio e fica de fora. */
export function idItemML(url: string): string | null {
  let dec = url;
  try { dec = decodeURIComponent(url); } catch { /* usa como veio */ }
  const m = dec.match(/item_id[:=]\s*(ML[A-Z])-?(\d{6,})/i) || dec.match(/[?&]wid=(ML[A-Z])-?(\d{6,})/i) || dec.match(/\/(ML[A-Z])-?(\d{6,})(?:[-_/?#]|$)/i);
  return m ? (m[1] + m[2]).toUpperCase() : null;
}

function tituloDoEndereco(url: string): string {
  try {
    const partes = new URL(url).pathname.split("/").filter(Boolean);
    const slug = partes.find((p) => /[a-z]{3,}-[a-z]{2,}/i.test(p) && !/^ML[A-Z]-?\d/i.test(p)) || "";
    const t = decodeURIComponent(slug).replace(/[-_]+/g, " ").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  } catch { return ""; }
}

const ENTIDADES: Record<string, string> = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô", atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ", agrave: "à", Agrave: "À", ccedil: "ç", Ccedil: "Ç", ordm: "º", ordf: "ª", deg: "°", times: "×", ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®", trade: "™" };
const decodificar = (s: string) => s
  .replace(/&([a-z]+);/gi, (t, n) => ENTIDADES[n] ?? t)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
  .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ""; } })
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const cortar = (s: any, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const limparTitulo = (t: string) => cortar(decodificar(t), 200).replace(/\s*[|–—-]\s*(Mercado\s?Livre|MercadoLibre|Shopee( Brasil)?|Amazon(\.com\.br)?)\s*$/i, "").trim();

function metas(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const chave = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const valor = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (chave && valor !== undefined && !(chave.toLowerCase() in out)) out[chave.toLowerCase()] = decodificar(valor);
  }
  return out;
}

function jsonLd(html: string): any[] {
  const lista: any[] = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const empilha = (x: any) => { if (Array.isArray(x)) x.forEach(empilha); else if (x && typeof x === "object") { lista.push(x); if (x["@graph"]) empilha(x["@graph"]); } };
      empilha(j);
    } catch { /* bloco inválido: ignora */ }
  }
  return lista;
}

const numero = (v: any): number | null => {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function urlSegura(v: any, base: string): string | null {
  try {
    const u = new URL(String(v || "").trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 600) : null;
  } catch { return null; }
}

/** Lê título, foto e preço do HTML (Open Graph, Twitter Card e JSON-LD de produto). */
export function lerHtml(html: string, urlBase: string): Partial<CartaoLink> {
  const m = metas(html.slice(0, 600_000));
  const prod = jsonLd(html).find((x) => /product/i.test(String(x["@type"] || "")));
  const oferta = prod ? (Array.isArray(prod.offers) ? prod.offers[0] : prod.offers) : null;
  const img = Array.isArray(prod?.image) ? prod.image[0] : prod?.image;
  const titulo = m["og:title"] || m["twitter:title"] || prod?.name || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const imagem = urlSegura(m["og:image:secure_url"] || m["og:image"] || m["twitter:image"] || (typeof img === "string" ? img : img?.url), urlBase);
  const preco = numero(m["product:price:amount"] ?? m["og:price:amount"] ?? oferta?.price ?? oferta?.lowPrice ?? oferta?.priceSpecification?.price);
  const moeda = cortar(m["product:price:currency"] || m["og:price:currency"] || oferta?.priceCurrency || "", 5) || null;
  const descricao = cortar(decodificar(m["og:description"] || m["description"] || prod?.description || ""), 220) || null;
  return { titulo: limparTitulo(titulo), imagem, preco, moeda, descricao };
}

/** Anúncio vindo da API pública do Mercado Livre. */
export function cartaoDeItemML(j: any, urlOriginal: string): Partial<CartaoLink> | null {
  if (!j || typeof j !== "object" || !j.title) return null;
  const foto = j.pictures?.[0]?.secure_url || j.pictures?.[0]?.url || j.secure_thumbnail || j.thumbnail;
  const link = typeof j.permalink === "string" && ehML(hostDe(j.permalink)) ? limparUrl(j.permalink) : null;
  return { titulo: limparTitulo(String(j.title)), imagem: urlSegura(foto, urlOriginal), preco: numero(j.price), moeda: cortar(j.currency_id, 5) || null, url: link || undefined };
}

// ---------------------------------------------------------------- rede
const privado = (ip: string): boolean => {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
};
const permiteLocal = () => process.env.NODE_ENV !== "production" && process.env.LINK_PREVIEW_PERMITE_LOCAL === "1";

async function enderecoPermitido(url: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  if (permiteLocal()) return true;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  try {
    const ips = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    return ips.length > 0 && ips.every((i) => !privado(i.address));
  } catch { return false; }
}

async function buscar(url: string, aceita: string, limiteBytes: number, sinal: AbortSignal): Promise<{ texto: string; urlFinal: string } | null> {
  let atual = url;
  for (let salto = 0; salto < 5; salto++) {
    if (!(await enderecoPermitido(atual))) return null;
    const r = await fetch(atual, {
      redirect: "manual", signal: sinal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)", Accept: aceita, "Accept-Language": "pt-BR,pt;q=0.9" },
    });
    if (r.status >= 300 && r.status < 400) {
      const prox = r.headers.get("location");
      if (!prox) return null;
      atual = new URL(prox, atual).toString();
      continue;
    }
    if (!r.ok || !r.body) return null;
    const leitor = r.body.getReader();
    const partes: Uint8Array[] = []; let total = 0;
    while (total < limiteBytes) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value); total += value.length;
    }
    try { await leitor.cancel(); } catch { /* já terminou */ }
    return { texto: Buffer.concat(partes).toString("utf8"), urlFinal: atual };
  }
  return null;
}

/** Monta o cartão do link. Nunca falha: se a página não puder ser lida, volta um cartão só com o site e o nome tirado do endereço. */
export async function montarCartaoLink(urlOriginal: string): Promise<CartaoLink | null> {
  const url0 = urlOriginal.slice(0, 2000);
  try { const u = new URL(url0); if (u.protocol !== "http:" && u.protocol !== "https:") return null; } catch { return null; }
  let dados: Partial<CartaoLink> = {};
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const id = ehML(hostDe(url0)) ? idItemML(url0) : null;
    if (id) {
      try { const r = await buscar(`https://api.mercadolibre.com/items/${id}`, "application/json", 200_000, ctl.signal); if (r) dados = cartaoDeItemML(JSON.parse(r.texto), url0) || {}; } catch { /* tenta a página */ }
    }
    if (!dados.titulo || !dados.imagem) {
      try {
        const r = await buscar(url0, "text/html,application/xhtml+xml", 600_000, ctl.signal);
        if (r) { const h = lerHtml(r.texto, r.urlFinal); dados = { ...h, ...Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== null && v !== undefined && v !== "")) }; }
      } catch { /* sem a página: segue com o que tem */ }
    }
  } finally { clearTimeout(timer); }
  const url = dados.url || limparUrl(url0);
  return {
    tipo: "link", url: url.slice(0, 1000), site: nomeDoSite(url0),
    titulo: dados.titulo || tituloDoEndereco(url0) || nomeDoSite(url0),
    imagem: dados.imagem || null, preco: dados.preco ?? null, moeda: dados.moeda || (dados.preco != null ? "BRL" : null), descricao: dados.descricao || null,
  };
}
