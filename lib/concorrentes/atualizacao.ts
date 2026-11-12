// "Atualizar pelo navegador": o painel monta a lista dos anúncios a reler e o favorito "Atualizar preços" lê cada página no navegador.
// Só contas e textos (sem rede nem banco), para poder testar.
import { urlCanonicaDoAnuncio } from "./mercadolivre/url";

export interface ItemParaAtualizar { mlb_id: string; url: string }
export const ENDERECOS_ML = ["www.mercadolivre.com.br", "produto.mercadolivre.com.br"];

/**
 * Endereço que o navegador deve abrir para ler o anúncio. Link de rastreio (click1…) ou fora do Mercado Livre vira o link canônico do id;
 * página de catálogo (/p/…) sem a oferta escolhida ganha `?wid=<id do anúncio>` (senão a página mostra a oferta em destaque, não a deste anúncio).
 */
export function urlParaLeitura(mlb_id: string, urlGuardada: string | null | undefined): string {
  let u: URL | null = null;
  try { u = new URL(String(urlGuardada || "")); } catch { u = null; }
  const h = u?.hostname.toLowerCase() ?? "";
  if (!u || u.protocol !== "https:" || !(h === "www.mercadolivre.com.br" || h === "produto.mercadolivre.com.br")) return urlCanonicaDoAnuncio(mlb_id);
  if (h === "www.mercadolivre.com.br" && !/[?&]wid=/i.test(u.search) && !new RegExp(mlb_id.replace(/^MLB/, "MLB-?"), "i").test(u.pathname)) {
    return `${u.origin}${u.pathname}?wid=${mlb_id}`;
  }
  return `${u.origin}${u.pathname}${u.search}`;
}

export interface ListaParaAtualizar { v: 1; tipo: "lista"; canal: string; gerado_em: string; itens: ItemParaAtualizar[] }

export function montarLista(canal: string, anuncios: { mlb_id: string; url_anuncio: string }[], agora: Date = new Date()): ListaParaAtualizar {
  const vistos = new Set<string>();
  const itens: ItemParaAtualizar[] = [];
  for (const a of anuncios) {
    if (vistos.has(a.mlb_id)) continue;
    vistos.add(a.mlb_id);
    itens.push({ mlb_id: a.mlb_id, url: urlParaLeitura(a.mlb_id, a.url_anuncio) });
  }
  return { v: 1, tipo: "lista", canal, gerado_em: agora.toISOString(), itens };
}

/** Quantos anúncios há em cada endereço do site: o favorito só consegue ler os do endereço em que está aberto. */
export function contarPorEndereco(itens: ItemParaAtualizar[]): { endereco: string; quantos: number }[] {
  const m = new Map<string, number>();
  for (const i of itens) { let h = "?"; try { h = new URL(i.url).hostname; } catch { /* mantém ? */ } m.set(h, (m.get(h) || 0) + 1); }
  return Array.from(m, ([endereco, quantos]) => ({ endereco, quantos })).sort((a, b) => b.quantos - a.quantos);
}
