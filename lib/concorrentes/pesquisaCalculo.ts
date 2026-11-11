// Contas da aba "Pesquisa de preços" (sem rede nem banco, para poder testar): o preço do item em cada canal MEU,
// a diferença para o meu PDV e o lucro líquido que eu teria vendendo a esse preço naquele canal, com o meu custo.
import type { AnuncioML } from "../analiseMercado";
import type { RegraTarifacao } from "../tarifacao";
import { calcularLado, type LadoComparativo } from "./comparativo";

export interface Oferta {
  id: number | string; titulo: string; loja: string | null; host: string | null; canal: string | null;
  preco: number; url: string | null; url_imagem: string | null; capturado_em: string;
}

export interface OfertaCalculada {
  oferta: Oferta;
  /** meu canal compatível (null = loja fora dos meus canais) */
  canal: string | null;
  /** preço da oferta − meu PDV (negativo = ela está mais barata que eu) */
  difPreco: number | null;
  difPct: number | null;
  /** taxas, frete, imposto e lucro se EU vendesse a esse preço nesse canal */
  lado: LadoComparativo | null;
}

export interface CanalMenorPreco { canal: string; preco: number; loja: string | null; url: string | null; ofertas: number }

const conta = (canal: string) => (canal.includes("2") ? "2" : "1");

/** Ofertas ordenadas do menor para o maior preço, com a diferença para o meu PDV e, nas lojas dos meus canais, o lucro líquido. */
export function calcularOfertas(ofertas: Oferta[], e: {
  meuPdv: number | null; custo: number | null; regras: RegraTarifacao[]; anunciosMl: (AnuncioML & { canal?: string })[];
}): OfertaCalculada[] {
  return [...ofertas].sort((a, b) => a.preco - b.preco || String(a.loja).localeCompare(String(b.loja))).map((oferta) => {
    const dif = e.meuPdv != null && e.meuPdv > 0 ? oferta.preco - e.meuPdv : null;
    const lado = oferta.canal
      ? calcularLado(oferta.preco, oferta.canal, e.custo, {
        regras: e.regras,
        // no Mercado Livre a comissão e as medidas vêm dos meus anúncios do SKU (da mesma conta 1/2)
        anuncios: oferta.canal.toLowerCase().includes("mercado livre") ? e.anunciosMl.filter((a) => !a.canal || conta(a.canal) === conta(oferta.canal as string)) : undefined,
      })
      : null;
    return { oferta, canal: oferta.canal, difPreco: dif, difPct: dif != null && e.meuPdv ? (dif / e.meuPdv) * 100 : null, lado };
  });
}

/** O menor preço encontrado em cada um dos meus canais. */
export function menorPrecoPorCanal(ofertas: Oferta[]): CanalMenorPreco[] {
  const mapa = new Map<string, CanalMenorPreco>();
  for (const o of ofertas) {
    if (!o.canal) continue;
    const atual = mapa.get(o.canal);
    if (!atual) mapa.set(o.canal, { canal: o.canal, preco: o.preco, loja: o.loja, url: o.url, ofertas: 1 });
    else { atual.ofertas++; if (o.preco < atual.preco) { atual.preco = o.preco; atual.loja = o.loja; atual.url = o.url; } }
  }
  return Array.from(mapa.values()).sort((a, b) => a.preco - b.preco);
}

export interface ResumoOfertas {
  total: number; nosMeusCanais: number; menor: number | null; mediana: number | null;
  /** quantas ofertas estão abaixo do meu PDV */
  maisBaratas: number | null;
  /** minha posição se eu entrasse na lista com o meu PDV (1 = o mais barato) */
  posicao: number | null;
}

export function resumirOfertas(ofertas: Oferta[], meuPdv: number | null): ResumoOfertas {
  const precos = ofertas.map((o) => o.preco).sort((a, b) => a - b);
  const mediana = precos.length ? (precos.length % 2 ? precos[(precos.length - 1) / 2] : (precos[precos.length / 2 - 1] + precos[precos.length / 2]) / 2) : null;
  const pdv = meuPdv != null && meuPdv > 0 ? meuPdv : null;
  const abaixo = pdv != null ? precos.filter((p) => p < pdv).length : null;
  return { total: ofertas.length, nosMeusCanais: ofertas.filter((o) => o.canal).length, menor: precos[0] ?? null, mediana, maisBaratas: abaixo, posicao: abaixo != null ? abaixo + 1 : null };
}

/** Oferta de loja digitada à mão, no mesmo formato do texto do favorito (assim passa pela mesma validação do servidor). */
export function ofertaManualComoTexto(e: { titulo: string; loja: string; preco: string; url?: string }): string {
  return JSON.stringify({ v: 1, canal: "google", tipo: "pesquisa", resultados: [{ titulo: e.titulo, loja: e.loja, preco: e.preco, url: e.url || null }] });
}

/** Endereço do Google Shopping para a pesquisa (pelo texto). */
export const googleShoppingUrl = (termo: string) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(termo.trim())}`;
