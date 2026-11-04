// Fórmula de repasse dos canais (aba Regras) avaliada POR UNIDADE.
//
// Regra: faixas de preço, tarifa fixa e frete valem para o preço de UMA unidade.
// Ex. Amazon "Q - (Q * 14%) - 4 - (Q >= 79 ? 21.95 : 0)":
//   - 1 item de R$ 100  -> frete de 21,95 (unidade acima de R$ 79)
//   - 10 itens de R$ 20 (linha de R$ 200) -> sem frete, só a tarifa fixa de R$ 4 por item
// Por isso a fórmula é calculada com o preço unitário (linha ÷ quantidade) e multiplicada pela quantidade.
// Se a fórmula usa a quantidade explicitamente (QTD ou a coluna de quantidade), ela já devolve o total da linha
// e é avaliada como está.

const escapeRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function formulaUsaQuantidade(formula: string, colQtd?: string): boolean {
  if (/\b(QTD|QUANTIDADE)\b/i.test(formula)) return true;
  const c = (colQtd || "").trim();
  return !!c && new RegExp(`\\b${escapeRegex(c)}\\b`, "i").test(formula);
}

export function avaliarFormulaBase(formula: string, pdv: number, qtd: number, colPdv?: string, colQtd?: string): number | null {
  if (!formula || !formula.trim()) return null;
  try {
    let exp = formula.trim();
    exp = exp.replace(/\bPDV\b/gi, String(pdv));
    exp = exp.replace(/\bQTD\b/gi, String(qtd));
    exp = exp.replace(/\bQUANTIDADE\b/gi, String(qtd));
    if (colPdv && colPdv.trim()) exp = exp.replace(new RegExp(`\\b${escapeRegex(colPdv.trim())}\\b`, "gi"), String(pdv));
    if (colQtd && colQtd.trim()) exp = exp.replace(new RegExp(`\\b${escapeRegex(colQtd.trim())}\\b`, "gi"), String(qtd));
    exp = exp.replace(/(\d+(\.\d+)?)%/g, "($1 / 100)");
    if (/^[0-9+\-*/().\s><=?:!&|]+$/.test(exp)) {
      const calc = Function(`"use strict"; return (${exp})`)();
      if (typeof calc === "number" && !isNaN(calc) && calc >= 0) return calc;
    }
  } catch { /* fórmula inválida */ }
  return null;
}

/** pdvLinha = valor da linha (preço × quantidade). Devolve o líquido da linha inteira, ou null se a fórmula não é avaliável. */
export function avaliarFormulaPorUnidade(formula: string, pdvLinha: number, qtd: number, colPdv?: string, colQtd?: string): number | null {
  const q = qtd > 0 ? qtd : 1;
  if (q === 1 || formulaUsaQuantidade(formula, colQtd)) return avaliarFormulaBase(formula, pdvLinha, q, colPdv, colQtd);
  const porUnidade = avaliarFormulaBase(formula, pdvLinha / q, 1, colPdv, colQtd);
  return porUnidade === null ? null : porUnidade * q;
}
