// Preço praticado de um SKU dentro de um canal: descobre quais vendas seguem o padrão e quais são "carrinho"
// (valor muito acima ou abaixo do que o produto realmente vende naquele canal no período). Só cálculo, sem tela nem rede.
//
// Regra (por canal + SKU, no período):
//   1. Cada venda vira um preço unitário (valor ÷ quantidade), arredondado em centavos.
//   2. Preços com até 3% de diferença entre si contam como o mesmo preço (promoções de centavos).
//   3. "Preço praticado" = preço que se repete (2+ vendas). O que mais vendeu (em unidades) é a referência.
//   4. Fica no cálculo: venda em preço praticado (até 2,5x a referência), ou a até 15% de um preço praticado.
//      Sai: venda isolada fora disso (ex.: 1 pedido de R$ 350 num produto que vende 20x por R$ 50).
//   5. Poucos dados (menos de 3 vendas) = nada é descartado. Sem nenhum preço repetido = usa a mediana (±60%).
export interface LinhaPreco { preco: number; qtd: number }
export interface ResultadoPadrao {
  /** mesma ordem da entrada: true = entra no cálculo */
  manter: boolean[];
  descartadas: number;
  unidadesDescartadas: number;
  valorDescartado: number;
  /** preços praticados (centro do grupo), do que mais vendeu para o que menos vendeu */
  precosPraticados: { preco: number; vendas: number; unidades: number }[];
}

const TOL_AGRUPAR = 0.03;      // preços até 3% de distância = mesmo preço
const TOL_PROXIMO = 0.15;      // isolado até 15% de um preço praticado = mantém
const FATOR_MAXIMO = 2.5;      // preço repetido só vale se estiver entre ref/2,5 e ref*2,5
const FATOR_MEDIANA = 1.6;     // sem preço repetido: mantém entre mediana/1,6 e mediana*1,6
const MIN_VENDAS = 3;

export function padraoDePreco(linhas: LinhaPreco[]): ResultadoPadrao {
  const n = linhas.length;
  const vazio = (): ResultadoPadrao => ({ manter: new Array(n).fill(true), descartadas: 0, unidadesDescartadas: 0, valorDescartado: 0, precosPraticados: [] });
  if (n < MIN_VENDAS) return vazio();

  const un = linhas.map((l) => {
    const q = l.qtd > 0 ? l.qtd : 1;
    return Math.round((l.preco / q) * 100) / 100;
  });
  if (un.every((p) => !(p > 0))) return vazio();

  // grupos de preços parecidos (ordenados; encadeia enquanto o próximo está a ≤3% do anterior)
  const ordem = un.map((p, i) => i).filter((i) => un[i] > 0).sort((a, b) => un[a] - un[b]);
  const grupos: { idx: number[]; centro: number; unidades: number }[] = [];
  for (const i of ordem) {
    const g = grupos[grupos.length - 1];
    const ultimo = g ? un[g.idx[g.idx.length - 1]] : 0;
    if (g && un[i] <= ultimo * (1 + TOL_AGRUPAR)) g.idx.push(i);
    else grupos.push({ idx: [i], centro: 0, unidades: 0 });
  }
  for (const g of grupos) {
    const q = g.idx.reduce((a, i) => a + (linhas[i].qtd > 0 ? linhas[i].qtd : 1), 0);
    g.unidades = q;
    g.centro = g.idx.reduce((a, i) => a + un[i] * (linhas[i].qtd > 0 ? linhas[i].qtd : 1), 0) / q;
  }

  const manter = new Array<boolean>(n).fill(true);
  let praticados: { centro: number; idx: number[]; unidades: number }[];

  const dominante = grupos.reduce((m, g) => (g.unidades > m.unidades || (g.unidades === m.unidades && g.idx.length > m.idx.length) ? g : m), grupos[0]);
  if (dominante.idx.length >= 2) {
    const ref = dominante.centro;
    praticados = grupos.filter((g) => g.idx.length >= 2 && g.centro <= ref * FATOR_MAXIMO && g.centro >= ref / FATOR_MAXIMO);
    const dentro = new Set<number>();
    praticados.forEach((g) => g.idx.forEach((i) => dentro.add(i)));
    for (const i of ordem) {
      if (dentro.has(i)) continue;
      manter[i] = praticados.some((g) => Math.abs(un[i] - g.centro) <= g.centro * TOL_PROXIMO);
    }
  } else {
    // todos os preços são únicos: referência = mediana
    const ps = ordem.map((i) => un[i]);
    const med = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
    for (const i of ordem) manter[i] = un[i] <= med * FATOR_MEDIANA && un[i] >= med / FATOR_MEDIANA;
    praticados = [];
  }

  let descartadas = 0, unidadesDescartadas = 0, valorDescartado = 0;
  linhas.forEach((l, i) => { if (!manter[i]) { descartadas++; unidadesDescartadas += l.qtd > 0 ? l.qtd : 1; valorDescartado += l.preco; } });
  return {
    manter, descartadas, unidadesDescartadas, valorDescartado,
    precosPraticados: praticados.map((g) => ({ preco: g.centro, vendas: g.idx.length, unidades: g.unidades })).sort((a, b) => b.unidades - a.unidades),
  };
}
