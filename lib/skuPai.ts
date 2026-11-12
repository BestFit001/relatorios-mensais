// SKU pai: agrupa os SKUs filhos (variações) de um mesmo produto. Informação central do app, usada no Mapa de Cadastros e na Calculadora.
// Regra padrão: o pai são os 5 primeiros dígitos do SKU. Há pais com 4 dígitos (SKUs de 10 dígitos): nesses casos o ajuste é manual
// e fica gravado na tabela sku_pai_manual (sku -> pai), valendo para todas as telas.

export const TAMANHO_PAI_PADRAO = 5;
export type RegraCustoPai = "maior" | "media" | "menor";

/** Mesmo padrão das demais telas: sem aspas/".0", só letras e números, minúsculo. */
export function normalizarSkuPai(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Pai pela regra padrão (5 primeiros dígitos). */
export function paiPadrao(sku: any): string {
  return normalizarSkuPai(sku).slice(0, TAMANHO_PAI_PADRAO);
}

/** Pai do SKU: o ajuste manual manda; sem ajuste, a regra padrão. `manual` = sku normalizado -> pai normalizado. */
export function paiDoSku(sku: any, manual?: Map<string, string> | null): string {
  const k = normalizarSkuPai(sku);
  return manual?.get(k) || k.slice(0, TAMANHO_PAI_PADRAO);
}

/** SKU de 10 dígitos sem ajuste: o pai provavelmente tem 4 dígitos (a regra dos 5 pega um dígito do filho). */
export function paiProvavelDe4(sku: any, manual?: Map<string, string> | null): string | null {
  const k = normalizarSkuPai(sku);
  if (manual?.has(k)) return null;
  return k.length === 10 ? k.slice(0, 4) : null;
}

export function montarMapaPai(linhas: { sku: any; pai: any }[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of linhas || []) { const k = normalizarSkuPai(l.sku); const p = normalizarSkuPai(l.pai); if (k && p) m.set(k, p); }
  return m;
}

/** Pais válidos para digitar: letras e números, de 1 a 12 caracteres. Devolve o pai normalizado ou null. */
export function validarPai(texto: string): string | null {
  const p = normalizarSkuPai(texto);
  return p.length >= 1 && p.length <= 12 ? p : null;
}

/** Agrupa por pai (ordem do pai, depois do SKU). */
export function agruparPorPai<T>(itens: T[], getSku: (t: T) => string, manual?: Map<string, string> | null): { pai: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const it of itens) {
    const p = paiDoSku(getSku(it), manual);
    const arr = grupos.get(p); if (arr) arr.push(it); else grupos.set(p, [it]);
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return Array.from(grupos.entries())
    .sort((a, b) => cmp(a[0], b[0]))
    .map(([pai, lista]) => ({ pai, itens: lista.sort((x, y) => cmp(normalizarSkuPai(getSku(x)), normalizarSkuPai(getSku(y)))) }));
}

/** Custo do pai a partir do custo dos filhos (só os que têm custo > 0). */
export function custoDoPai(custos: number[], regra: RegraCustoPai): number {
  const v = custos.filter((c) => Number(c) > 0);
  if (v.length === 0) return 0;
  if (regra === "menor") return Math.min(...v);
  if (regra === "media") return v.reduce((t, c) => t + c, 0) / v.length;
  return Math.max(...v);
}
