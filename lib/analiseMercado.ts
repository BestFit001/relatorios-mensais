// Cálculos da aba "Análise de mercado" — mesma regra da /calculadora:
//   lucro = preço − custo − comissão − tarifa fixa − frete − imposto (9% do preço)
//   margem = lucro ÷ preço
import { calcularFreteML } from "./calculofrete";
import { obterRegraCanal, type RegraTarifacao } from "./tarifacao";

export const IMPOSTO_PCT = 0.09;

export const CANAIS_ANALISE = [
  "Mercado Livre 1 Clássico", "Mercado Livre 1 Premium", "Mercado Livre 2 Clássico", "Mercado Livre 2 Premium",
  "Amazon", "Shopee", "Magalu", "Netshoes", "Shein", "TikTok Shop", "Centauro", "Site",
];

export interface AnuncioML { comissao: number; peso_real: number; altura: number; largura: number; comprimento: number }
export interface OpcoesCalculo { regras: RegraTarifacao[]; anuncios?: AnuncioML[] }
export interface Taxas { comissaoPct: number; tarifaFixa: number; frete: number }

const ehML = (canal: string) => canal.toLowerCase().includes("mercado livre");

/** Comissão, tarifa fixa e frete que o canal cobra para UM item vendido por `preco`. */
export function taxasNoPreco(canal: string, preco: number, op: OpcoesCalculo): Taxas {
  const c = canal.toLowerCase();
  if (ehML(canal)) {
    const anuncios = op.anuncios || [];
    let comissaoPct = 14;
    let ref: AnuncioML | null = null;
    if (c.includes("premium")) {
      const m = anuncios.find((a) => a.comissao > 14);
      comissaoPct = m ? m.comissao : 19;
      ref = m || anuncios[0] || null;
    } else {
      const m = anuncios.find((a) => a.comissao > 0 && a.comissao <= 14);
      comissaoPct = m ? m.comissao : 14;
      ref = m || anuncios[0] || null;
    }
    const peso = ref && ref.peso_real > 0 ? ref.peso_real : 2;
    const alt = ref && ref.altura > 0 ? ref.altura : 10;
    const larg = ref && ref.largura > 0 ? ref.largura : 10;
    const comp = ref && ref.comprimento > 0 ? ref.comprimento : 10;
    return { comissaoPct, tarifaFixa: preco < 79 ? 6.5 : 0, frete: calcularFreteML(preco, peso, alt, larg, comp) };
  }
  const r = obterRegraCanal(op.regras || [], canal, preco);
  return { comissaoPct: Number(r.comissao || 14), tarifaFixa: Number(r.tarifa_fixa || 0), frete: Number(r.frete || 0) };
}

export interface AnalisePreco extends Taxas {
  preco: number;
  comissaoValor: number;
  /** o que o canal repassa: preço − comissão − tarifa fixa − frete */
  liquido: number;
  imposto: number;
  /** repasse depois do imposto (o que sobra para pagar o custo e dar lucro) */
  liquidoPosImposto: number;
}

export function analisarPreco(canal: string, preco: number, op: OpcoesCalculo): AnalisePreco {
  const t = taxasNoPreco(canal, preco, op);
  const comissaoValor = preco * (t.comissaoPct / 100);
  const liquido = preco - comissaoValor - t.tarifaFixa - t.frete;
  const imposto = preco * IMPOSTO_PCT;
  return { ...t, preco, comissaoValor, liquido, imposto, liquidoPosImposto: liquido - imposto };
}

/** Maior custo de compra que ainda deixa a margem desejada se vendermos pelo preço do concorrente. */
export function custoIdeal(canal: string, preco: number, margemPct: number, op: OpcoesCalculo): { custo: number; analise: AnalisePreco } {
  const analise = analisarPreco(canal, preco, op);
  const lucroAlvo = preco * (margemPct / 100);
  return { custo: analise.liquidoPosImposto - lucroAlvo, analise };
}

/** Margem real (%) vendendo a `preco` com custo `custo`. */
export function margemComCusto(canal: string, preco: number, custo: number, op: OpcoesCalculo): number {
  if (!(preco > 0)) return 0;
  const a = analisarPreco(canal, preco, op);
  return ((a.liquidoPosImposto - custo) / preco) * 100;
}

/** Preço de venda que entrega a margem desejada para um custo (mesma iteração da calculadora). */
export function precoIndicado(canal: string, custo: number, margemPct: number, op: OpcoesCalculo): { preco: number; inviavel: boolean; margemReal: number } {
  const m = margemPct / 100;
  let preco = Math.max(custo, 1) * 2;
  let inviavel = false;
  for (let i = 0; i < 40; i++) {
    const t = taxasNoPreco(canal, preco, op);
    const denom = 1 - (t.comissaoPct / 100 + IMPOSTO_PCT + m);
    inviavel = !(denom > 0);
    if (inviavel) return { preco: 0, inviavel: true, margemReal: 0 };
    const novo = (custo + t.tarifaFixa + t.frete) / denom;
    if (Math.abs(novo - preco) < 0.005) { preco = novo; break; }
    preco = novo;
  }
  return { preco, inviavel: false, margemReal: margemComCusto(canal, preco, custo, op) };
}
