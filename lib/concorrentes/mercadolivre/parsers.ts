// Leitura do HTML público do Mercado Livre. O site muda de layout de tempos em tempos:
// cada campo tenta mais de um seletor e o que não for achado fica null (nunca inventamos valor).
import * as cheerio from "cheerio";
import type { AnuncioRaspado } from "../tipos";
import { parsePreco, parseVendidos } from "../calculos";
import { idDoAnuncio, imagemSegura, urlAnuncioSegura } from "./url";

export class ErroBloqueio extends Error {}

/** A resposta é uma página de bloqueio/captcha em vez do conteúdo? */
export function pareceBloqueio(status: number, html: string): boolean {
  if (status === 403 || status === 429) return true;
  const t = html.slice(0, 6000).toLowerCase();
  return t.includes("account-verification") || t.includes("captcha") || t.includes("are you a robot");
}

const limpar = (s: string | undefined | null) => (s || "").replace(/\s+/g, " ").trim();

function precoDe($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): number | null {
  // preço atual (o riscado "de R$ X" fica em .andes-money-amount--previous)
  const atual = el.find(".poly-price__current .andes-money-amount, .ui-search-price__second-line .andes-money-amount").first();
  const bloco = atual.length ? atual : el.find(".andes-money-amount").not(".andes-money-amount--previous").first();
  if (!bloco.length) return null;
  const inteiro = limpar(bloco.find(".andes-money-amount__fraction").first().text()).replace(/\./g, "");
  const cents = limpar(bloco.find(".andes-money-amount__cents").first().text());
  if (!inteiro) return null;
  return parsePreco(`${inteiro}${cents ? "," + cents : ""}`);
}

function imagemDe(el: cheerio.Cheerio<any>): string | null {
  const img = el.find("img").first();
  if (!img.length) return null;
  for (const attr of ["data-src", "src", "data-lazy"]) {
    const v = img.attr(attr);
    if (v && !v.startsWith("data:")) { const s = imagemSegura(v); if (s) return s; }
  }
  const srcset = img.attr("srcset") || img.attr("data-srcset");
  if (srcset) { const s = imagemSegura(srcset.split(",")[0].trim().split(/\s+/)[0]); if (s) return s; }
  return null;
}

function vendedorDe(el: cheerio.Cheerio<any>): string | null {
  const t = limpar(el.find(".poly-component__seller, .ui-search-official-store-label, .ui-search-item__group__element--seller").first().text());
  const v = t.replace(/^(vendido\s+)?por\s+/i, "").replace(/^loja oficial\s*/i, "").trim();
  return v || null;
}

/** Cards da página de listagem. */
export function parseListagem(html: string): { nome: string | null; anuncios: AnuncioRaspado[] } {
  const $ = cheerio.load(html);
  const nome = limpar($("h1").first().text()) || null;
  const porId = new Map<string, AnuncioRaspado>();

  const cards = $("li.ui-search-layout__item, div.poly-card, div.ui-search-result__wrapper");
  cards.each((_, node) => {
    const el = $(node);
    const link = el.find("a.poly-component__title, a.ui-search-link, a.ui-search-item__group__element, h2 a, h3 a").first();
    const href = link.attr("href") || el.find("a[href]").first().attr("href") || "";
    const url = urlAnuncioSegura(href);
    const mlb_id = idDoAnuncio(href);
    if (!url || !mlb_id) return;
    const titulo = limpar(link.text()) || limpar(el.find("h2, h3").first().text()) || limpar(link.attr("title"));
    if (!titulo) return;
    const vendas = parseVendidos(el.text());
    const novo: AnuncioRaspado = {
      mlb_id, titulo, url_anuncio: url,
      vendedor: vendedorDe(el),
      url_imagem: imagemDe(el),
      preco: precoDe($, el),
      total_vendas: vendas?.total ?? null,
      vendas_aproximado: vendas?.aproximado ?? false,
    };
    const antigo = porId.get(mlb_id);
    // o mesmo anúncio pode aparecer em dois elementos aninhados: junta o que faltou
    porId.set(mlb_id, antigo ? {
      ...antigo,
      titulo: antigo.titulo || novo.titulo,
      vendedor: antigo.vendedor ?? novo.vendedor,
      url_imagem: antigo.url_imagem ?? novo.url_imagem,
      preco: antigo.preco ?? novo.preco,
      total_vendas: antigo.total_vendas ?? novo.total_vendas,
      vendas_aproximado: antigo.total_vendas != null ? antigo.vendas_aproximado : novo.vendas_aproximado,
    } : novo);
  });

  // plano B: layout desconhecido -> pega os links de anúncio da página
  if (porId.size === 0) {
    $("a[href]").each((_, a) => {
      const href = $(a).attr("href") || "";
      const url = urlAnuncioSegura(href), mlb_id = idDoAnuncio(href);
      const titulo = limpar($(a).attr("title")) || limpar($(a).text());
      if (!url || !mlb_id || titulo.length < 12 || porId.has(mlb_id)) return;
      porId.set(mlb_id, { mlb_id, titulo, url_anuncio: url, vendedor: null, url_imagem: imagemDe($(a)), preco: null, total_vendas: null, vendas_aproximado: false });
    });
  }
  return { nome, anuncios: Array.from(porId.values()) };
}

function achar(obj: any, tipo: string): any | null {
  if (!obj) return null;
  if (Array.isArray(obj)) { for (const o of obj) { const r = achar(o, tipo); if (r) return r; } return null; }
  if (typeof obj !== "object") return null;
  const t = obj["@type"];
  if (t === tipo || (Array.isArray(t) && t.includes(tipo))) return obj;
  return achar(obj["@graph"], tipo);
}

/** Página do anúncio: título, preço, vendedor, imagem e "N vendidos". */
export function parseAnuncio(html: string, urlPagina: string): AnuncioRaspado | null {
  const $ = cheerio.load(html);
  let produto: any = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    if (produto) return;
    try { produto = achar(JSON.parse($(s).contents().text()), "Product"); } catch { /* ld+json quebrado: segue */ }
  });

  const oferta = Array.isArray(produto?.offers) ? produto.offers[0] : produto?.offers;
  const titulo = limpar(produto?.name) || limpar($("h1.ui-pdp-title").first().text()) || limpar($('meta[property="og:title"]').attr("content"));
  if (!titulo) return null;

  const preco = parsePreco(oferta?.price ?? $('meta[itemprop="price"]').attr("content"))
    ?? precoDe($, $(".ui-pdp-price__second-line").first());

  const vendedor = limpar(typeof oferta?.seller === "object" ? oferta.seller?.name : "")
    || limpar($(".ui-pdp-seller__header__title, .ui-pdp-seller__link-trigger-button, a[href*='/perfil/']").first().text())
    || null;

  const imgLd = Array.isArray(produto?.image) ? produto.image[0] : produto?.image;
  const imagem = imagemSegura(imgLd) || imagemSegura($('meta[property="og:image"]').attr("content"));

  // "Novo | +500 vendidos" fica no subtítulo; se o layout mudou, procura no cabeçalho e por fim no texto todo
  const vendas = parseVendidos($(".ui-pdp-subtitle").first().text())
    || parseVendidos($(".ui-pdp-header").first().text())
    || parseVendidos($("main").first().text().slice(0, 4000));

  const mlb_id = idDoAnuncio(urlPagina) || idDoAnuncio(String(produto?.url || produto?.sku || "")) || "";
  if (!mlb_id) return null;
  return {
    mlb_id, titulo,
    vendedor: vendedor ? vendedor.replace(/^(vendido\s+)?por\s+/i, "").trim() || null : null,
    url_anuncio: urlAnuncioSegura(urlPagina) || urlPagina,
    url_imagem: imagem, preco,
    total_vendas: vendas?.total ?? null,
    vendas_aproximado: vendas?.aproximado ?? false,
  };
}
