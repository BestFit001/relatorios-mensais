// Abrir páginas de outros canais (não Mercado Livre) pelo servidor, e descobrir o endereço de verdade de links curtos/de compartilhamento.
// O servidor da Vercel costuma ser barrado por esses sites; com um serviço de raspagem/proxy em ESTOQUE_SCRAPER_URL_TEMPLATE
// (ex.: https://proxy.exemplo/?key=XXX&url={url}; se faltar, usa o ML_SCRAPER_URL_TEMPLATE) a leitura pelo servidor pode funcionar.
// Sem isso, o favorito "Ler estoque" (navegador do usuário) faz a leitura.
import { ErroBloqueio, pareceBloqueio } from "../concorrentes/mercadolivre/parsers";
import { ErroSemTempo } from "../concorrentes/mercadolivre/fontes";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const modelo = () => process.env.ESTOQUE_SCRAPER_URL_TEMPLATE || process.env.ML_SCRAPER_URL_TEMPLATE || "";
const limiteMs = () => Number(process.env.ML_TIMEOUT_MS) || (modelo() ? 45000 : 15000);

async function pedir(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal, redirect: "follow", cache: "no-store" }); }
  catch (e: any) { throw new Error(e?.name === "AbortError" ? "tempo esgotado" : `falha de rede (${e?.cause?.code || e?.message || e})`); }
  finally { clearTimeout(t); }
}

export async function baixarPagina(url: string, ate?: number): Promise<string> {
  let ms = limiteMs();
  if (ate) { ms = Math.min(ms, ate - Date.now()); if (ms < 3000) throw new ErroSemTempo(); }
  const m = modelo();
  const r = await pedir(m ? m.replace("{url}", encodeURIComponent(url)) : url, { headers: m ? {} : { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9", Accept: "text/html,application/xhtml+xml" } }, ms);
  const html = await r.text();
  if (pareceBloqueio(r.status, html)) throw new ErroBloqueio(`o site bloqueou a leitura pelo servidor (HTTP ${r.status})${m ? " mesmo via proxy" : ": use o favorito “Ler estoque” no navegador ou configure ESTOQUE_SCRAPER_URL_TEMPLATE"}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} ao abrir a página`);
  return html;
}

/** Abre um link curto e devolve o endereço final (sem baixar a página inteira). Lança erro se não conseguir. */
export async function resolverLinkCurto(url: string): Promise<string> {
  const r = await pedir(url, { method: "GET", headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9", Accept: "text/html" } }, 10_000);
  try { await r.body?.cancel(); } catch { /* já fechado */ }
  if (!r.url || r.url === url) throw new Error("o link curto não levou a nenhuma página");
  return r.url;
}
