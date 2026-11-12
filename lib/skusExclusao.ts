// SKUs marcados "Para exclusão" (tabela skus_para_exclusao): quem não será reposto e pode sair do catálogo.
import { supabase } from "./supabase";
import { normalizarSkuPai } from "./skuPai";

/** Todos os SKUs marcados (normalizados). Sem a tabela (ou sem rede) devolve vazio. */
export async function carregarParaExclusao(): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("skus_para_exclusao").select("sku").range(de, de + 999);
      if (error || !data || data.length === 0) break;
      for (const r of data as any[]) out.add(String(r.sku));
      if (data.length < 1000) break;
    }
  } catch { /* sem a tabela: ninguém marcado */ }
  return out;
}

/** Marca os SKUs; com `substituir` a lista anterior é apagada depois de gravar a nova. Devolve a mensagem de erro, ou null. */
export async function gravarParaExclusao(skus: string[], substituir: boolean): Promise<string | null> {
  const unicos = Array.from(new Set(skus.map(normalizarSkuPai).filter(Boolean)));
  const agora = new Date().toISOString();
  for (let i = 0; i < unicos.length; i += 500) {
    const { error } = await supabase.from("skus_para_exclusao").upsert(unicos.slice(i, i + 500).map((sku) => ({ sku, atualizado_em: agora })), { onConflict: "sku" });
    if (error) return "Não consegui gravar a lista: " + error.message;
  }
  if (substituir) {
    const { error } = await supabase.from("skus_para_exclusao").delete().lt("atualizado_em", agora);
    if (error) return "Lista nova gravada, mas não consegui remover a anterior: " + error.message;
  }
  return null;
}

export async function limparParaExclusao(): Promise<string | null> {
  const { error } = await supabase.from("skus_para_exclusao").delete().neq("sku", "");
  return error ? "Não consegui limpar a lista: " + error.message : null;
}
