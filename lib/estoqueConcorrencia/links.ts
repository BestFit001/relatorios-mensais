// Canais e links do Acompanhamento de estoque: validação (só https no site do canal, por causa do servidor que abre o link),
// o código do anúncio de cada canal e a leitura de várias linhas coladas.
import { ErroValidacao } from "../concorrentes/tipos";
import { normalizarUrlAnuncio } from "../concorrentes/mercadolivre/url";

export interface CanalEstoque {
  id: string; nome: string;
  /** sites do canal (domínio do link e das páginas que o favorito abre) */
  hosts: RegExp;
  /** "especifica" = leitor feito para o site; "generica" = lê dados embutidos/JSON-LD/texto e mostra o que achou (ainda não conferido) */
  leitura: "especifica" | "generica";
  /** como pedir o link, quando o site tem links curtos/de compartilhamento */
  dica?: string;
}
export const CANAIS_ESTOQUE: CanalEstoque[] = [
  { id: "mercadolivre", nome: "Mercado Livre", hosts: /(^|\.)mercadolivre\.com(\.br)?$/i, leitura: "especifica" },
  { id: "tiktok", nome: "TikTok Shop", hosts: /(^|\.)tiktok\.com$/i, leitura: "generica", dica: "Pode colar o link de compartilhamento (vt.tiktok.com/…) ou o endereço completo do produto." },
  { id: "shopee", nome: "Shopee", hosts: /(^|\.)shopee\.com\.br$/i, leitura: "generica" },
  { id: "amazon", nome: "Amazon", hosts: /(^|\.)(amazon\.com\.br|amzn\.to|a\.co)$/i, leitura: "generica" },
  { id: "magalu", nome: "Magalu", hosts: /(^|\.)(magazineluiza\.com\.br|magalu\.com)$/i, leitura: "generica" },
  { id: "shein", nome: "Shein", hosts: /(^|\.)shein\.com(\.br)?$/i, leitura: "generica" },
  { id: "netshoes", nome: "Netshoes", hosts: /(^|\.)netshoes\.com\.br$/i, leitura: "generica" },
  { id: "centauro", nome: "Centauro", hosts: /(^|\.)centauro\.com\.br$/i, leitura: "generica" },
];
export const CANAL_PADRAO_ESTOQUE = "mercadolivre";
export const canalEstoque = (id: string) => CANAIS_ESTOQUE.find((c) => c.id === id);
export const canalEstoqueValido = (id: unknown): id is string => typeof id === "string" && !!canalEstoque(id);

export interface LinhaLida { item_id: string; url: string }
/** Link curto/de compartilhamento: o servidor precisa abrir para descobrir o endereço de verdade. */
export interface LinkCurto { texto: string; url: string }
export interface ResultadoLinks { validos: LinhaLida[]; curtos: LinkCurto[]; repetidos: number; invalidos: { texto: string; motivo: string }[] }
const CURTO = Symbol("curto");
type Normalizado = LinhaLida | { [CURTO]: true; url: string };

/** Mercado Livre: link de anúncio -> { item_id, url }. Páginas de catálogo "up" mantêm ?pdp_filters=item_id:MLB… (só com ele a página mostra a oferta certa). */
export function normalizarLinkEstoqueML(bruta: string): { item_id: string; url: string } {
  const base = normalizarUrlAnuncio(bruta);   // valida domínio/https e resolve link de rastreio (click1…)
  const u = new URL(String(bruta).trim());
  const pdp = u.searchParams.get("pdp_filters");
  if (/^click\d*\./i.test(u.hostname) || !pdp) return { item_id: base.mlb_id, url: base.url };
  const id = /item_id:(MLB-?\d{6,})/i.exec(pdp);
  const item_id = id ? "MLB" + /\d{6,}/.exec(id[1])![0] : base.mlb_id;
  return { item_id, url: `https://${u.hostname}${u.pathname}?pdp_filters=item_id:${item_id}` };
}

/** Rastreio e compartilhamento que não mudam a página (e deixariam o mesmo produto com links diferentes). */
const RASTREIO = /^(utm_|share_|ug_|social_|sec_|_t$|_r$|_d$|u_code|checksum|timestamp|tt_from|enter_|refer|link_reflow|fbclid|gclid|ref$|ref_|tag$|th$|psc$|pf_rd|pd_rd|qid$|sr$|keywords$|crid$|sprefix$|content-id$|cv_|source$|campaign|medium$)/i;
function limparUrl(u: URL, manterQuery: boolean): string {
  const q = new URLSearchParams();
  if (manterQuery) u.searchParams.forEach((v, k) => { if (!RASTREIO.test(k) && v.length < 120) q.append(k, v); });
  const s = q.toString();
  return `https://${u.hostname}${u.pathname.replace(/\/+$/, "") || "/"}${s ? "?" + s : ""}`;
}
/** Código estável (não criptográfico) para canais sem código no endereço. */
function codigoDoEndereco(u: URL): string {
  const t = u.hostname + u.pathname.replace(/\/+$/, "");
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return "url-" + h.toString(36);
}

function normalizarOutro(canal: string, bruta: string): Normalizado {
  const c = canalEstoque(canal)!;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(bruta) ? bruta : "https://" + bruta); } catch { throw new ErroValidacao("Isso não parece um link."); }
  if (!/^https?:$/.test(u.protocol)) throw new ErroValidacao("Use um link http(s).");
  u.protocol = "https:";
  if (!c.hosts.test(u.hostname)) throw new ErroValidacao(`Este link não é do ${c.nome}.`);
  const p = u.pathname, h = u.hostname.toLowerCase();
  if (canal === "tiktok") {
    const curto = /^(vt|vm)\./i.test(h) || /^\/t\/[A-Za-z0-9]+\/?$/.test(p);   // vt.tiktok.com/…, vm.tiktok.com/… e tiktok.com/t/…
    const id = /\/(?:view\/product|product|pdp(?:\/[^/]+)?)\/(\d{8,})/i.exec(p)?.[1] || u.searchParams.get("product_id") || u.searchParams.get("item_id");
    if (curto && !id) return { [CURTO]: true, url: u.toString() };
    if (!id || !/^\d{8,}$/.test(id)) throw new ErroValidacao("Não achei o código do produto do TikTok Shop nesse link (precisa ser link de produto).");
    return { item_id: id, url: limparUrl(u, true) };
  }
  if (canal === "amazon") {
    if (/(^|\.)(amzn\.to|a\.co)$/i.test(h)) return { [CURTO]: true, url: u.toString() };
    const asin = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i.exec(p)?.[1];
    if (!asin) throw new ErroValidacao("Não achei o código (ASIN) do produto nesse link da Amazon.");
    return { item_id: asin.toUpperCase(), url: `https://www.amazon.com.br/dp/${asin.toUpperCase()}` };
  }
  if (canal === "shopee") {
    const m = /-i\.(\d+)\.(\d+)/.exec(p) || /\/product\/(\d+)\/(\d+)/.exec(p);
    if (!m) throw new ErroValidacao("Não achei o código do produto nesse link da Shopee (termina em …-i.123.456).");
    return { item_id: `${m[1]}.${m[2]}`, url: limparUrl(u, false) };
  }
  if (canal === "shein") {
    const m = /-p-(\d+)/.exec(p);
    return { item_id: m ? m[1] : codigoDoEndereco(u), url: limparUrl(u, false) };
  }
  if (canal === "magalu") {
    const m = /\/p\/([a-z0-9]+)\/?/i.exec(p);
    return { item_id: m ? m[1].toLowerCase() : codigoDoEndereco(u), url: limparUrl(u, false) };
  }
  return { item_id: codigoDoEndereco(u), url: limparUrl(u, false) };   // netshoes, centauro: o endereço da página é o código
}

/** Um link de um canal -> { item_id, url } (ou pedido para abrir o link curto). */
export function normalizarLinkEstoque(canal: string, bruta: string): Normalizado {
  if (!canalEstoqueValido(canal)) throw new ErroValidacao("Canal desconhecido.");
  const t = String(bruta || "").trim();
  if (canal === "mercadolivre") return normalizarLinkEstoqueML(t);
  return normalizarOutro(canal, t);
}
export const ehLinkCurto = (x: Normalizado): x is { [CURTO]: true; url: string } => (x as any)[CURTO] === true;

/** Texto colado (um link por linha, ou separados por espaço) -> links válidos, sem repetir o mesmo anúncio. */
export function lerLinksColados(texto: string, canal: string = CANAL_PADRAO_ESTOQUE): ResultadoLinks {
  const partes = String(texto || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const validos: LinhaLida[] = [], curtos: LinkCurto[] = [], invalidos: { texto: string; motivo: string }[] = [];
  const vistos = new Set<string>();
  let repetidos = 0;
  for (const p of partes) {
    try {
      const l = normalizarLinkEstoque(canal, p);
      if (ehLinkCurto(l)) { if (!curtos.some((c) => c.url === l.url)) curtos.push({ texto: p, url: l.url }); continue; }
      if (vistos.has(l.item_id)) { repetidos++; continue; }
      vistos.add(l.item_id); validos.push(l);
    } catch (e: any) { invalidos.push({ texto: p.length > 60 ? p.slice(0, 57) + "…" : p, motivo: e?.message || "link inválido" }); }
  }
  return { validos, curtos, repetidos, invalidos };
}
