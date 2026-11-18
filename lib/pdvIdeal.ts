// Calculadora > "Achar PDV ideal": o MENOR preço de venda que entrega a margem alvo.
//
// Comissão, tarifa fixa e frete mudam por faixa de preço (ex.: Amazon sem frete até R$ 78,99 e R$ 21,95 de frete de R$ 79,00 em diante),
// então pode existir mais de um preço que fecha a margem. A conta antiga partia de um chute (2x o custo) e ficava na primeira faixa em que
// o preço se estabilizava: se isso caía numa faixa com frete, o preço saía mais alto do que o necessário, mesmo havendo um preço menor
// (numa faixa mais barata) que já bate a margem. Aqui cada faixa é resolvida e vale o menor preço que realmente cabe na sua faixa.

export interface ParametrosFaixa { comissaoPct: number; tarifaFixa: number; frete: number }

export interface EntradaPdvIdeal {
  /** início de cada faixa de preço (em ordem crescente; a 1ª é 0). A faixa vai do início até o início da próxima. */
  pontos: number[];
  /** comissão (fração, ex. 0.14), tarifa fixa e frete que valem para um preço */
  paramsEm: (preco: number) => ParametrosFaixa;
  custoProduto: number;
  rebate: number;
  /** margem alvo em % (ex.: 10) */
  margemPct: number;
  /** imposto sobre o preço (fração, ex. 0.09) */
  imposto: number;
}

export interface SaidaPdvIdeal { pdv: number; params: ParametrosFaixa; inviavel: boolean; faixaInicio: number | null; alternativas: number }

export function acharPdvIdeal(e: EntradaPdvIdeal): SaidaPdvIdeal {
  const pontos = Array.from(new Set([0, ...e.pontos.filter((p) => Number.isFinite(p) && p > 0)])).sort((a, b) => a - b);
  const custoEfetivo = Math.max(0, e.custoProduto - e.rebate);
  const margem = e.margemPct / 100;
  const candidatos: { pdv: number; inicio: number }[] = [];
  pontos.forEach((inicio, i) => {
    const fim = i + 1 < pontos.length ? pontos[i + 1] : Infinity;
    const par = e.paramsEm(inicio);
    const den = 1 - (par.comissaoPct + e.imposto + margem);
    if (!(den > 0)) return;                                   // nessa faixa a margem alvo não fecha de jeito nenhum
    const solucao = (custoEfetivo + par.tarifaFixa + par.frete) / den;
    const pdv = Math.max(solucao, inicio);                    // solução abaixo da faixa: no 1º preço da faixa a margem já é maior que a alvo
    if (pdv < fim) candidatos.push({ pdv, inicio });          // solução acima da faixa: não vale nessa faixa
  });
  if (candidatos.length === 0) {
    const pdv = e.custoProduto * 2;
    return { pdv, params: e.paramsEm(pdv), inviavel: true, faixaInicio: null, alternativas: 0 };
  }
  const melhor = candidatos.reduce((a, b) => (b.pdv < a.pdv ? b : a));
  return { pdv: melhor.pdv, params: e.paramsEm(melhor.pdv), inviavel: false, faixaInicio: melhor.inicio, alternativas: candidatos.length - 1 };
}
