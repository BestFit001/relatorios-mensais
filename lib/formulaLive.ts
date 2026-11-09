// Fórmula de taxas e tarifas do canal (aba Regras), usada nas Lives.
// Ex. TikTok: "R2 - (R2 <= 50 ? (R2 * 10% + 4) : (R2 * 6% + 6)) - U2"
// As letras da fórmula são colunas da planilha de pedidos do canal; aqui cada letra vira um número informado por quem chama.

const RESERVADAS = /^(PDV|QTD|QUANTIDADE|TRUE|FALSE|NULL|UNDEFINED)$/i;

/** Letras de coluna usadas na fórmula (sem PDV/QTD), em maiúsculas e sem repetir. */
export function letrasDaFormula(formula: string): string[] {
  const achadas = new Set<string>();
  const sem = String(formula || "");
  const re = /\b([A-Za-z]{1,2})\d*\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sem))) {
    const token = m[0].replace(/\d+$/, "");
    if (RESERVADAS.test(token) || RESERVADAS.test(m[0])) continue;
    achadas.add(m[1].toUpperCase());
  }
  return Array.from(achadas);
}

/**
 * Avalia a fórmula. `valor(letra)` devolve o número da coluna; PDV e QTD usam `pdv` e `qtd`.
 * Devolve null se a fórmula não puder ser calculada. Resultado nunca é negativo.
 */
export function avaliarFormulaLive(
  formula: string,
  valor: (letra: string) => number,
  pdv: number,
  qtd = 1,
): number | null {
  const s = String(formula || "").trim();
  if (!s) return null;
  try {
    let exp = s.replace(/\bPDV\b/gi, String(pdv)).replace(/\b(QTD|QUANTIDADE)\b/gi, String(qtd));
    exp = exp.replace(/\b([A-Za-z]{1,2})\d*\b/g, (match, letra: string) => {
      if (RESERVADAS.test(match)) return match;
      const v = Number(valor(letra.toUpperCase()));
      return String(Number.isFinite(v) ? v : 0);
    });
    exp = exp.replace(/(\d+(\.\d+)?)%/g, "($1 / 100)");
    if (!/^[0-9+\-*/().\s><=?:!&|]+$/.test(exp)) return null;
    const r = Function(`"use strict"; return (${exp})`)();
    return typeof r === "number" && !isNaN(r) ? Math.max(0, r) : null;
  } catch {
    return null;
  }
}
