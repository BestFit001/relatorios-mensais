// Totais do Relatório de Vendas via LIVES. A página "Relatório & Vendas" e a aba "Custo da colaboradora" usam esta mesma conta,
// para os números nunca divergirem.
export interface ItemResumoLive {
  valorPago: number; tarifas: number; rebate: number; repasse: number; custo: number;
  imposto: number; comissaoVendedora: number; liquidez: number; pdv: number;
}

export interface ResumoLives {
  totalVenda: number; totalTarifas: number; totalRebate: number; totalRepasse: number; totalCusto: number;
  totalImposto: number; totalComissaoVendedora: number;
  /** soma da liquidez das vendas, antes de descontar o custo das lives (Ads) */
  liquidezDasVendas: number;
  /** liquidez depois do custo das lives (é o card "Liquidez" do relatório) */
  totalLiquidez: number;
  totalPdv: number;
  /** liquidez ÷ PDV, em % (ponderado pelo valor) */
  mediaLucroPdvGeral: number;
}

export function resumirLives(itens: ItemResumoLive[], custoLives: number): ResumoLives {
  const soma = (k: keyof ItemResumoLive) => itens.reduce((acc, cur) => acc + cur[k], 0);
  const liquidezDasVendas = soma("liquidez");
  const totalLiquidez = liquidezDasVendas - custoLives;
  const totalPdv = soma("pdv");
  return {
    totalVenda: soma("valorPago"), totalTarifas: soma("tarifas"), totalRebate: soma("rebate"), totalRepasse: soma("repasse"), totalCusto: soma("custo"),
    totalImposto: soma("imposto"), totalComissaoVendedora: soma("comissaoVendedora"),
    liquidezDasVendas, totalLiquidez, totalPdv,
    mediaLucroPdvGeral: totalPdv > 0 ? (totalLiquidez / totalPdv) * 100 : 0,
  };
}
