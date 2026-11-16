// Links do Acompanhamento de estoque: validação (só https no domínio do canal, por causa do servidor que abre o link) e leitura de várias linhas coladas.
import { ErroValidacao } from "../concorrentes/tipos";
import { normalizarUrlAnuncio } from "../concorrentes/mercadolivre/url";

export const CANAIS_ESTOQUE = [
  { id: "mercadolivre", nome: "Mercado Livre", disponivel: true },
  { id: "shopee", nome: "Shopee", disponivel: false },
  { id: "amazon", nome: "Amazon", disponivel: false },
] as const;
export const CANAL_PADRAO_ESTOQUE = "mercadolivre";

/**
 * Link de anúncio do Mercado Livre -> { item_id, url } para guardar.
 * Páginas de catálogo "up" (…/up/MLBU123?pdp_filters=item_id:MLB456) só mostram a oferta certa com o `pdp_filters`, então ele é mantido;
 * o resto do rastreio (#…, tracking_id, position…) é descartado. O id do anúncio é o MLB do `item_id`/`wid` (ou do endereço).
 */
export function normalizarLinkEstoqueML(bruta: string): { item_id: string; url: string } {
  const base = normalizarUrlAnuncio(bruta);   // valida domínio/https e resolve link de rastreio (click1…)
  const u = new URL(String(bruta).trim());
  const pdp = u.searchParams.get("pdp_filters");
  if (/^click\d*\./i.test(u.hostname) || !pdp) return { item_id: base.mlb_id, url: base.url };
  const id = /item_id:(MLB-?\d{6,})/i.exec(pdp);
  const item_id = id ? "MLB" + /\d{6,}/.exec(id[1])![0] : base.mlb_id;
  return { item_id, url: `https://${u.hostname}${u.pathname}?pdp_filters=item_id:${item_id}` };
}

export interface LinhaLida { item_id: string; url: string }
export interface ResultadoLinks { validos: LinhaLida[]; repetidos: number; invalidos: { texto: string; motivo: string }[] }

/** Texto colado (um link por linha, ou separados por espaço) -> links válidos, sem repetir o mesmo anúncio. */
export function lerLinksColados(texto: string, canal: string = CANAL_PADRAO_ESTOQUE): ResultadoLinks {
  const partes = String(texto || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const validos: LinhaLida[] = [], invalidos: { texto: string; motivo: string }[] = [];
  const vistos = new Set<string>();
  let repetidos = 0;
  for (const p of partes) {
    try {
      if (canal !== "mercadolivre") throw new ErroValidacao("Este canal ainda não está disponível no acompanhamento de estoque.");
      const l = normalizarLinkEstoqueML(p);
      if (vistos.has(l.item_id)) { repetidos++; continue; }
      vistos.add(l.item_id); validos.push(l);
    } catch (e: any) { invalidos.push({ texto: p.length > 60 ? p.slice(0, 57) + "…" : p, motivo: e?.message || "link inválido" }); }
  }
  return { validos, repetidos, invalidos };
}
