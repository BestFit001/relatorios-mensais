import { supabase } from "./supabase";

/** Mesmo padrão usado nos uploads: sem aspas/".0", só letras e números, minúsculo. */
export function normalizarSkuCadastro(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Lê todos os SKUs já cadastrados (só a coluna sku, paginado e ordenado para não pular linhas). */
async function lerSkusCadastrados(): Promise<Set<string>> {
  const set = new Set<string>();
  const passo = 1000;
  for (let from = 0; ; from += passo) {
    const { data, error } = await supabase
      .from("cadastros_base_tiny")
      .select("sku")
      .order("id", { ascending: true })
      .range(from, from + passo - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    data.forEach((r: any) => set.add(normalizarSkuCadastro(r.sku)));
    if (data.length < passo) break;
  }
  return set;
}

export interface ResultadoRegistroSkus {
  /** SKUs válidos encontrados na planilha */
  encontrados: number;
  /** SKUs que não estavam em cadastros_base_tiny e foram inseridos (estoque 0) */
  inseridos: number;
  /** exemplos dos inseridos, para mostrar no aviso */
  exemplos: string[];
  erro?: string;
}

/**
 * Garante que todo SKU encontrado numa planilha (vendas / Regras & Medidas) exista em `cadastros_base_tiny`.
 * - Só INSERE o que falta, com estoque 0. SKU que já existe nunca é alterado (o estoque do Tiny não é sobrescrito).
 * - Nunca derruba o upload principal: qualquer falha volta em `erro`.
 */
export async function registrarSkusNaBaseCadastrada(skus: Iterable<any>): Promise<ResultadoRegistroSkus> {
  const validos = new Set<string>();
  for (const bruto of skus) {
    const s = normalizarSkuCadastro(bruto);
    // descarta vazio, marcador de "sem sku" e textos que claramente não são código de produto
    if (!s || s === "semsku" || s.length > 40) continue;
    validos.add(s);
  }
  const resultado: ResultadoRegistroSkus = { encontrados: validos.size, inseridos: 0, exemplos: [] };
  if (validos.size === 0) return resultado;

  try {
    const existentes = await lerSkusCadastrados();
    const faltantes = Array.from(validos).filter((s) => !existentes.has(s));
    for (let i = 0; i < faltantes.length; i += 500) {
      const lote = faltantes.slice(i, i + 500).map((sku) => ({ sku, estoque: 0 }));
      const { error } = await supabase
        .from("cadastros_base_tiny")
        .upsert(lote, { onConflict: "sku", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      resultado.inseridos += lote.length;
    }
    resultado.exemplos = faltantes.slice(0, 5);
  } catch (err: any) {
    resultado.erro = err?.message || String(err);
  }
  return resultado;
}

/** Linha de aviso para os alertas de upload. */
export function linhaAvisoCadastro(r: ResultadoRegistroSkus): string {
  if (r.erro) return `⚠️ Não consegui atualizar a base de cadastrados: ${r.erro}`;
  if (r.inseridos === 0) return `• Cadastros: todos os ${r.encontrados} SKUs da planilha já estavam na base`;
  return `• Cadastros: ${r.inseridos} SKU(s) novo(s) inserido(s) na base de cadastrados com estoque 0${r.exemplos.length ? ` (ex.: ${r.exemplos.join(", ")})` : ""}`;
}
