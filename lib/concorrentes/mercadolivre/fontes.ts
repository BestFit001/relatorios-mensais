// Como buscar os dados: API oficial do Mercado Livre e páginas públicas (HTML), com proxy opcional.
// Variáveis de ambiente (todas opcionais):
//   ML_ACCESS_TOKEN | ML_CLIENT_ID + ML_CLIENT_SECRET   -> chamadas autenticadas na API
//   ML_API_BASE                                         -> padrão https://api.mercadolibre.com
//   ML_SCRAPER_URL_TEMPLATE                             -> serviço de raspagem/proxy, ex.: https://proxy.exemplo/?key=XXX&url={url}
import type { AnuncioRaspado } from "../tipos";
import { parsePreco } from "../calculos";
import { ErroBloqueio, pareceBloqueio } from "./parsers";
import { idDoAnuncio, imagemSegura, urlAnuncioSegura } from "./url";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TEMPO_LIMITE_MS = 15000;

/** A rodada acabou antes de esta página poder ser lida. */
export class ErroSemTempo extends Error { constructor() { super("sem tempo nesta rodada"); } }

/** Tempo máximo de UMA página: serviços de raspagem demoram (o ML é pesado), então via proxy o padrão é maior. Ajustável em ML_TIMEOUT_MS. */
export const limiteHtmlMs = () => Number(process.env.ML_TIMEOUT_MS) || (temProxy() ? 45000 : 15000);

export const apiBase = () => (process.env.ML_API_BASE || "https://api.mercadolibre.com").replace(/\/+$/, "");
export const temProxy = () => Boolean(process.env.ML_SCRAPER_URL_TEMPLATE);

async function pedir(url: string, init: RequestInit = {}, limiteMs: number = TEMPO_LIMITE_MS): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), limiteMs);
  try { return await fetch(url, { ...init, signal: ctl.signal, redirect: "follow", cache: "no-store" }); }
  catch (e: any) { throw new Error(e?.name === "AbortError" ? "tempo esgotado" : `falha de rede (${e?.cause?.code || e?.message || e})`); }
  finally { clearTimeout(t); }
}

// ---------- HTML ----------
/** `ate` (opcional) = instante limite da rodada: o tempo da página nunca passa dele. */
export async function baixarHtml(url: string, ate?: number): Promise<string> {
  let limite = limiteHtmlMs();
  if (ate) { limite = Math.min(limite, ate - Date.now()); if (limite < 3000) throw new ErroSemTempo(); }
  const modelo = process.env.ML_SCRAPER_URL_TEMPLATE;
  const alvo = modelo ? modelo.replace("{url}", encodeURIComponent(url)) : url;
  const r = await pedir(alvo, { headers: modelo ? {} : { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9", Accept: "text/html,application/xhtml+xml" } }, limite);
  const html = await r.text();
  if (pareceBloqueio(r.status, html)) throw new ErroBloqueio(`o Mercado Livre bloqueou a leitura da página (HTTP ${r.status})${modelo ? " mesmo via proxy" : " — o servidor da Vercel é barrado; configure ML_SCRAPER_URL_TEMPLATE"}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} ao abrir a página`);
  return html;
}

// ---------- API ----------
let tokenEmCache: { valor: string; expira: number } | null = null;

export async function obterToken(): Promise<string | null> {
  if (process.env.ML_ACCESS_TOKEN) return process.env.ML_ACCESS_TOKEN;
  const id = process.env.ML_CLIENT_ID, segredo = process.env.ML_CLIENT_SECRET;
  if (!id || !segredo) return null;
  if (tokenEmCache && tokenEmCache.expira > Date.now() + 60_000) return tokenEmCache.valor;
  const r = await pedir(`${apiBase()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: segredo }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`não consegui o token da API (HTTP ${r.status}${j?.message ? `: ${j.message}` : ""})`);
  tokenEmCache = { valor: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tokenEmCache.valor;
}

export async function apiGet(caminho: string): Promise<any> {
  const token = await obterToken();
  const r = await pedir(`${apiBase()}${caminho}`, { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const texto = await r.text();
  let j: any = null;
  try { j = JSON.parse(texto); } catch { /* resposta que não é JSON */ }
  if (!r.ok) throw new Error(`HTTP ${r.status}${j?.message ? `: ${j.message}` : ""}`);
  return j;
}

/** Item da API (busca ou /items) -> nosso formato. */
export function itemDaApi(it: any): AnuncioRaspado | null {
  const mlb_id = idDoAnuncio(String(it?.id || ""));
  const url = urlAnuncioSegura(it?.permalink);
  if (!mlb_id || !url || !it?.title) return null;
  const img = it.pictures?.[0]?.secure_url || it.thumbnail;
  return {
    mlb_id, titulo: String(it.title), url_anuncio: url,
    vendedor: it.seller?.nickname ? String(it.seller.nickname) : null,
    url_imagem: imagemSegura(img),
    preco: parsePreco(it.price),
    total_vendas: Number.isFinite(Number(it.sold_quantity)) && it.sold_quantity != null ? Number(it.sold_quantity) : null,
    vendas_aproximado: false,
  };
}

export async function apiBuscar(consulta: string, deslocamento: number, limite: number): Promise<AnuncioRaspado[]> {
  const j = await apiGet(`/sites/MLB/search?q=${encodeURIComponent(consulta)}&offset=${deslocamento}&limit=${limite}`);
  return (j?.results || []).map(itemDaApi).filter(Boolean) as AnuncioRaspado[];
}

/** Vários itens de uma vez (/items/bulk, máx. 20). Cada entrada vem como {status_code|code, body}; aceita também item "solto". */
export async function apiItens(ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    const j = await apiGet(`/items/bulk?ids=${lote.join(",")}`);
    for (const e of Array.isArray(j) ? j : []) {
      const codigo = Number(e?.status_code ?? e?.code ?? 200);
      const corpo = e?.body ?? e;
      if (codigo === 200 && corpo?.id) out.set(String(corpo.id), corpo);
    }
  }
  return out;
}

export async function apiNomeDoVendedor(sellerId: unknown): Promise<string | null> {
  if (!sellerId) return null;
  try { const u = await apiGet(`/users/${encodeURIComponent(String(sellerId))}`); return u?.nickname ? String(u.nickname) : null; } catch { return null; }
}
