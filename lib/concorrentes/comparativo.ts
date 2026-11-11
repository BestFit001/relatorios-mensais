// Comparativo "igual ao meu": mesmo cálculo da Análise de mercado (comissão + tarifa fixa + frete + imposto), aplicado
// ao preço do concorrente e ao meu preço, sempre com o MEU custo. As tarifas são estimativas.
import { CANAIS_ANALISE, analisarPreco, type AnalisePreco, type AnuncioML, type OpcoesCalculo } from "../analiseMercado";

export const CANAIS_COMPARATIVO = ["Mercado Livre 1 Clássico", "Mercado Livre 1 Premium", "Mercado Livre 2 Clássico", "Mercado Livre 2 Premium"] as const;
export type CanalComparativo = (typeof CANAIS_COMPARATIVO)[number];

/** Qualquer canal da Análise de mercado (Mercado Livre, Amazon, Shopee, Magalu…): as taxas vêm de lá. */
export const canalValido = (v: unknown): v is string => typeof v === "string" && CANAIS_ANALISE.includes(v);

/** Canal (conta 1/2 + Clássico/Premium) deduzido do cadastro do meu anúncio em `ml_anuncios_regras`. */
export function canalDoCadastro(r: { canal?: string | null; comissao?: number | string | null }): CanalComparativo {
  const conta = String(r.canal || "").includes("2") ? "2" : "1";
  const premium = Number(r.comissao) > 14;
  return `Mercado Livre ${conta} ${premium ? "Premium" : "Clássico"}` as CanalComparativo;
}

/** Troca só a modalidade (Clássico/Premium), mantendo a conta. */
export function comModalidade(canal: string, modalidade: "Clássico" | "Premium"): CanalComparativo {
  return canal.replace(/(Clássico|Premium)$/, modalidade) as CanalComparativo;
}

export interface LadoComparativo {
  preco: number | null;
  canal: string;
  analise: AnalisePreco | null;
  custo: number | null;
  /** o que sobra depois de tarifas, frete, imposto e custo */
  lucro: number | null;
  margemPct: number | null;
}

export function calcularLado(preco: number | null, canal: string, custo: number | null, op: OpcoesCalculo): LadoComparativo {
  if (preco == null || !(preco > 0)) return { preco, canal, analise: null, custo, lucro: null, margemPct: null };
  const analise = analisarPreco(canal, preco, op);
  if (custo == null) return { preco, canal, analise, custo, lucro: null, margemPct: null };
  const lucro = analise.liquidoPosImposto - custo;
  return { preco, canal, analise, custo, lucro, margemPct: (lucro / preco) * 100 };
}

export interface ResultadoComparativo {
  concorrente: LadoComparativo;
  meu: LadoComparativo;
  /** meu preço − preço do concorrente (positivo = estou mais caro) */
  difPreco: number | null;
  difPrecoPct: number | null;
  /** meu lucro − lucro que eu teria vendendo ao preço dele */
  difLucro: number | null;
}

/**
 * O produto é o mesmo nos dois lados, então o frete usa peso e medidas do meu cadastro. A comissão do meu lado vem do cadastro
 * do meu anúncio (`anunciosMeu`); a do concorrente vem de um anúncio meu na mesma modalidade, se existir, ou da comissão padrão.
 */
export function compararAnuncios(e: {
  precoConcorrente: number | null; precoMeu: number | null;
  canalConcorrente: string; canalMeu: string;
  custo: number | null; regras: OpcoesCalculo["regras"];
  anunciosMeu?: AnuncioML[]; anunciosConcorrente?: AnuncioML[];
}): ResultadoComparativo {
  const concorrente = calcularLado(e.precoConcorrente, e.canalConcorrente, e.custo, { regras: e.regras, anuncios: e.anunciosConcorrente });
  const meu = calcularLado(e.precoMeu, e.canalMeu, e.custo, { regras: e.regras, anuncios: e.anunciosMeu });
  const dif = e.precoMeu != null && e.precoConcorrente != null ? e.precoMeu - e.precoConcorrente : null;
  return {
    concorrente, meu,
    difPreco: dif,
    difPrecoPct: dif != null && (e.precoConcorrente as number) > 0 ? (dif / (e.precoConcorrente as number)) * 100 : null,
    difLucro: meu.lucro != null && concorrente.lucro != null ? meu.lucro - concorrente.lucro : null,
  };
}
