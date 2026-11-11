// Links por canal: cada marketplace tem o seu jeito de identificar anúncio e lista. Sem rede nem banco (a tela também importa daqui).
import { ErroValidacao } from "./tipos";
import { normalizarUrlAnuncio as anuncioML, normalizarUrlCategoria as categoriaML, nomeDaCategoria as nomeML } from "./mercadolivre/url";
import { normalizarUrlAnuncioAmazon, normalizarUrlCategoriaAmazon, nomeDaCategoriaAmazon } from "./amazon/url";
import { normalizarUrlAnuncioShopee, normalizarUrlCategoriaShopee, nomeDaCategoriaShopee } from "./shopee/url";

export interface UrlsDoCanal {
  nome: string;
  validarUrlCategoria(url: string): string;
  validarUrlAnuncio(url: string): { url: string; mlb_id: string };
  nomeDaCategoria(url: string): string;
}

export const URLS: Record<string, UrlsDoCanal> = {
  mercadolivre: { nome: "Mercado Livre", validarUrlCategoria: categoriaML, validarUrlAnuncio: anuncioML, nomeDaCategoria: nomeML },
  shopee: { nome: "Shopee", validarUrlCategoria: normalizarUrlCategoriaShopee, validarUrlAnuncio: normalizarUrlAnuncioShopee, nomeDaCategoria: nomeDaCategoriaShopee },
  amazon: { nome: "Amazon", validarUrlCategoria: normalizarUrlCategoriaAmazon, validarUrlAnuncio: normalizarUrlAnuncioAmazon, nomeDaCategoria: nomeDaCategoriaAmazon },
};

export function urlsDoCanal(canal: string): UrlsDoCanal {
  const u = URLS[canal];
  if (!u) throw new ErroValidacao(`Canal desconhecido: ${canal}`);
  return u;
}

/** Link de anúncio de QUALQUER canal conhecido (usado no "meu anúncio" do comparativo). Devolve também o canal. */
export function anuncioDeQualquerCanal(bruta: string): { canal: string; url: string; mlb_id: string } {
  for (const canal of Object.keys(URLS)) {
    try { return { canal, ...URLS[canal].validarUrlAnuncio(bruta) }; } catch { /* tenta o próximo */ }
  }
  throw new ErroValidacao("Não reconheci esse link. Cole o endereço da página do anúncio no Mercado Livre, Shopee ou Amazon.");
}
