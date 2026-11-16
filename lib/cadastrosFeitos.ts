// Registro dos cadastros marcados como feitos (tabela cadastros_feitos): alimenta o "Cadastros feitos no período" do Ranking.
import { supabase } from "./supabase";
import { normalizarSkuPai } from "./skuPai";

function emailLogado(): string | null {
  try {
    const bruto = localStorage.getItem("usuario_logado");
    if (!bruto) return null;
    try { const j = JSON.parse(bruto); return typeof j?.email === "string" ? j.email.trim().toLowerCase() : null; } catch { return String(bruto).trim().toLowerCase() || null; }
  } catch { return null; }
}

/** Anota que os SKUs foram cadastrados no canal agora. Não atrapalha a marcação se falhar (devolve a mensagem de erro, ou null). */
export async function registrarCadastrosFeitos(skus: string[], canal: string, origem: "mapa" | "novos"): Promise<string | null> {
  const unicos = Array.from(new Set(skus.map(normalizarSkuPai).filter(Boolean)));
  if (!unicos.length) return null;
  const agora = new Date().toISOString(), por = emailLogado();
  try {
    for (let i = 0; i < unicos.length; i += 500) {
      const { error } = await supabase.from("cadastros_feitos").upsert(unicos.slice(i, i + 500).map((sku) => ({ sku, canal, feito_em: agora, origem, por })), { onConflict: "sku,canal" });
      if (error) return error.message;
    }
  } catch (e: any) { return String(e?.message || e); }
  return null;
}

/** Desmarcou em Novos produtos: tira o registro (senão marcar e desmarcar contaria como cadastro feito). */
export async function removerCadastrosFeitos(skus: string[], canal: string): Promise<void> {
  const unicos = Array.from(new Set(skus.map(normalizarSkuPai).filter(Boolean)));
  try {
    for (let i = 0; i < unicos.length; i += 200) await supabase.from("cadastros_feitos").delete().eq("canal", canal).in("sku", unicos.slice(i, i + 200));
  } catch { /* só um registro auxiliar */ }
}
