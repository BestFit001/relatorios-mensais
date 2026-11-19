// PDV das marcas com compliance de preço: a marca informa, por SKU, o PDV permitido e quantos % o preço pode ficar abaixo dele.
// Preço mínimo permitido = PDV x (1 - % abaixo / 100). A calculadora avisa (tela e Excel) quando um preço fica abaixo disso.
// Só lógica (sem React nem banco), para poder testar.
import { textoDoPedido } from "./checagemCanceladosLogica";
import { paraNumeroBR } from "./idPedidoFaturados";

/** Chave de comparação do SKU (minúsculo, sem ".0", sem notação científica, sem aspas). */
export function normalizarSku(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  if (/e\+/i.test(s)) {
    try { s = BigInt(Math.trunc(Number(s))).toString(); } catch { /* deixa como está */ }
  }
  return s.toLowerCase();
}

export interface RegraPdv { sku: string; pdv: number; tolerancia: number; marca?: string | null }

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Menor preço permitido, em reais e centavos. */
export const pisoDoPdv = (pdv: number, toleranciaPct: number) => centavos(pdv * (1 - Math.max(0, toleranciaPct) / 100));

export interface AvisoPdv { pdvTabela: number; tolerancia: number; minimo: number; abaixo: boolean; /** quanto falta para chegar ao mínimo (R$), 0 se está ok */ falta: number; /** % do preço em relação ao PDV de tabela (ex.: 92 = 8% abaixo) */ pctDoPdv: number }

/** Compara um preço com a regra de PDV. Sem regra (ou sem preço): null. O preço é comparado em centavos. */
export function avaliarPdv(preco: number | null | undefined, regra: RegraPdv | null | undefined): AvisoPdv | null {
  if (!regra || !(regra.pdv > 0) || preco === null || preco === undefined || !Number.isFinite(preco) || !(preco > 0)) return null;
  const minimo = pisoDoPdv(regra.pdv, regra.tolerancia);
  const p = centavos(preco);
  const abaixo = p < minimo;
  return { pdvTabela: regra.pdv, tolerancia: regra.tolerancia, minimo, abaixo, falta: abaixo ? centavos(minimo - p) : 0, pctDoPdv: (p / regra.pdv) * 100 };
}

/** Texto curto para tela/Excel. */
export const textoDoAviso = (a: AvisoPdv | null) =>
  !a ? "" : a.abaixo ? `ABAIXO do PDV mínimo (faltam R$ ${a.falta.toFixed(2).replace(".", ",")})` : "OK";

/** Regra que vale para um conjunto de SKUs (ex.: os filhos de um SKU pai): a mais rígida, isto é, a de maior preço mínimo. */
export function regraMaisRigida(regras: (RegraPdv | undefined | null)[]): RegraPdv | null {
  let melhor: RegraPdv | null = null;
  for (const r of regras) {
    if (!r || !(r.pdv > 0)) continue;
    if (!melhor || pisoDoPdv(r.pdv, r.tolerancia) > pisoDoPdv(melhor.pdv, melhor.tolerancia)) melhor = r;
  }
  return melhor;
}

/**
 * "% que pode ficar abaixo": 5, "5", "5%", "5,5" -> 5, 5, 5, 5,5. Célula numérica entre 0 e 1 vem de coluna formatada como % no Excel
 * (0,05 = 5%), então vira 5. Vazio = 0 (não pode ficar abaixo). Inválido (negativo, 100 ou mais, texto) = null.
 */
export function lerTolerancia(valor: unknown): number | null {
  if (valor === null || valor === undefined || String(valor).trim() === "") return 0;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 0 || valor >= 100) return null;
    return valor > 0 && valor < 1 ? valor * 100 : valor;
  }
  const s = String(valor).replace(/%/g, "").replace(/\s/g, "");
  const n = paraNumeroBR(s);
  return n === null || n < 0 || n >= 100 ? null : n;
}

export interface ColunasPdv { colSku: number; colPdv: number; colTol: number }
export interface PdvLido extends RegraPdv { skuOriginal: string }

/** Linhas da planilha -> uma regra por SKU (se o SKU repete, vale a última linha). */
export function lerTabelaPdv(linhas: any[][], p: ColunasPdv & { linhaInicial: number }) {
  const regras = new Map<string, PdvLido>();
  let lidas = 0, semSku = 0, pdvInvalido = 0, repetidos = 0, tolInvalida = 0;
  let menorTol = Infinity, maiorTol = -Infinity;
  for (let i = Math.max(0, p.linhaInicial - 1); i < linhas.length; i++) {
    const row = linhas[i];
    if (!row || row.every((c: any) => String(c ?? "").trim() === "")) continue;
    lidas++;
    const skuOriginal = textoDoPedido(row[p.colSku]).replace(/\.0$/, "").trim();
    const sku = normalizarSku(skuOriginal);
    if (!sku) { semSku++; continue; }
    const pdv = paraNumeroBR(row[p.colPdv]);
    if (pdv === null || !(pdv > 0)) { pdvInvalido++; continue; }
    let tol = p.colTol >= 0 ? lerTolerancia(row[p.colTol]) : 0;
    if (tol === null) { tolInvalida++; tol = 0; }            // valor ilegível: vale o mais rígido (não pode ficar abaixo)
    else { menorTol = Math.min(menorTol, tol); maiorTol = Math.max(maiorTol, tol); }
    if (regras.has(sku)) repetidos++;
    regras.set(sku, { sku, skuOriginal, pdv, tolerancia: tol });
  }
  return {
    regras: Array.from(regras.values()), lidas, semSku, pdvInvalido, repetidos, tolInvalida,
    menorTol: Number.isFinite(menorTol) ? menorTol : null, maiorTol: Number.isFinite(maiorTol) ? maiorTol : null,
  };
}
