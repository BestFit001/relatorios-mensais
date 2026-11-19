/**
 * Lógica de tarifação por canal (mesma regra da /calculadora).
 *
 * Usada na Logística Integrada para canais que NÃO são Mercado Livre
 * (Shopee, Amazon, TikTok, Magalu, Shein, Netshoes, Centauro, Site...).
 * A regra do ML (comissão por MLB + R$ 6,50 < R$ 79 + matriz de frete por cubagem)
 * NÃO se aplica a esses canais.
 *
 * Fonte das regras: tabela `config_regras_tarifacao`
 *   (canal, faixa_preco, comissao, tarifa_fixa, frete)
 */
import { escolherRegraPorPreco } from "./faixaTarifa";

export interface RegraTarifacao {
  canal: string;
  faixa_preco?: string | null;
  comissao?: number | string | null;
  tarifa_fixa?: number | string | null;
  frete?: number | string | null;
  [k: string]: any;
}

export function parseNumeroBR(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function ehMercadoLivre(canal: string): boolean {
  return String(canal || "").toLowerCase().includes("mercado livre");
}

/**
 * Resolve a regra de tarifação aplicável ao canal para um preço de venda (PDV).
 * Idêntica à `obterRegraCanalDaTabela` da calculadora:
 *  - casamento tolerante do nome do canal (Magalu/Magazine, TikTok/TikTok Shop...)
 *  - faixas "de X a Y", "X em diante", "99999" ou valor único: cada faixa vale do seu início até o início da próxima
 *  - sem regra cadastrada => comissão padrão (14%, ou 19% se "premium")
 */
export function obterRegraCanal(
  regras: RegraTarifacao[],
  canalNome: string,
  precoReferencia: number
): { comissao: number; tarifa_fixa: number; frete: number; origem: "tabela" | "padrao" } {
  const cLower = String(canalNome || "").toLowerCase();

  const regrasDoCanal = (regras || []).filter((r) => {
    const rCanal = String(r.canal || "").toLowerCase();
    if (!rCanal) return false;
    if (rCanal === cLower) return true;
    if ((cLower.includes("magalu") || cLower.includes("magazine")) && (rCanal.includes("magalu") || rCanal.includes("magazine"))) return true;
    if (cLower.includes("tiktok") && rCanal.includes("tiktok")) return true;
    return rCanal.includes(cLower) || cLower.includes(rCanal);
  });

  if (regrasDoCanal.length === 0) {
    return { comissao: cLower.includes("premium") ? 19 : 14, tarifa_fixa: 0, frete: 0, origem: "padrao" };
  }

  const fmt = (r: RegraTarifacao) => ({
    comissao: Number(r.comissao || 0),
    tarifa_fixa: Number(r.tarifa_fixa || 0),
    frete: Number(r.frete || 0),
    origem: "tabela" as const,
  });

  // vale a faixa que começa mais perto do preço sem passar dele (ver lib/faixaTarifa.ts: "20.000" não vira 20 e faixas que se tocam não confundem)
  return fmt(escolherRegraPorPreco(regrasDoCanal, precoReferencia) || regrasDoCanal[0]);
}

export interface ResultadoTarifacao {
  pdvUnit: number;
  receitaBruta: number;
  comissaoPct: number;
  comissaoValor: number;
  tarifaFixaTotal: number;
  freteTotal: number;
  rebateTotal: number;
  /** Líquido que o canal repassa (receita - comissão - tarifa fixa - frete + rebate) */
  liquido: number;
  origemRegra: "tabela" | "padrao";
}

/**
 * Líquido de uma linha de venda em canal não-ML, seguindo a calculadora:
 *   líquido = PDV*qtd - comissão% - tarifa_fixa*qtd - frete*qtd (+ rebate*qtd)
 * O imposto e o custo do SKU são abatidos depois, no consolidado do SKU
 * (lucro = líquido - custo - imposto%, exatamente como em /calculadora).
 */
export function calcularLiquidoTarifacao(
  regras: RegraTarifacao[],
  canalNome: string,
  pdvUnit: number,
  qtd: number,
  rebateUnit = 0
): ResultadoTarifacao {
  const regra = obterRegraCanal(regras, canalNome, pdvUnit);
  const receitaBruta = pdvUnit * qtd;
  const comissaoValor = receitaBruta * (regra.comissao / 100);
  const tarifaFixaTotal = regra.tarifa_fixa * qtd;
  const freteTotal = regra.frete * qtd;
  const rebateTotal = rebateUnit * qtd;
  return {
    pdvUnit,
    receitaBruta,
    comissaoPct: regra.comissao,
    comissaoValor,
    tarifaFixaTotal,
    freteTotal,
    rebateTotal,
    liquido: receitaBruta - comissaoValor - tarifaFixaTotal - freteTotal + rebateTotal,
    origemRegra: regra.origem,
  };
}
