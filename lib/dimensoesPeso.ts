// Aba "Dimensões e Peso": medidas e peso REAIS por SKU pai. Na exportação para o Tiny elas têm prioridade
// sobre as medidas do cadastro, do modelo da Padronização e sobre as genéricas.

export interface DimensoesPeso {
  sku_pai: string;
  produto?: string | null;
  largura: number;
  altura: number;
  comprimento: number;
  peso: number; // kg
}

/** "12,5" / "12.5" / " 12 " -> 12.5 ; vazio ou inválido -> null */
export function numeroBR(v: any): number | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim().replace(/\s+/g, "");
  if (!t) return null;
  // "1.234,5" (milhar com ponto) -> 1234.5 ; "0,350" -> 0.35
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

/** Peso digitado na unidade escolhida -> kg (o Tiny usa kg). */
export const pesoParaKg = (valor: number, unidade: "kg" | "g") => (unidade === "g" ? valor / 1000 : valor);

/** Mesmo critério da exportação: produto pai = SKU pai, ou os 5 primeiros dígitos do SKU. */
export const chavePaiDe = (p: { sku?: any; sku_pai?: any }) =>
  String(p.sku_pai || (String(p.sku ?? "").length > 5 ? String(p.sku).substring(0, 5) : p.sku ?? "")).trim();

/** Nome do produto pai a partir do nome de uma variação ("Lancheira Farm - Rosa - M" -> "Lancheira Farm"). */
export function nomeDoPaiDe(produto: any): string {
  return String(produto ?? "")
    .split("-")[0]
    .replace(/\\vert(\{[^}]*\})?|ert\{[^}]*\}|_x000[bB]_|[\r\n\t\v]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave de busca do SKU pai (sem espaços, em minúsculas). */
export const normSkuPai = (v: any) => String(v ?? "").trim().toLowerCase();
