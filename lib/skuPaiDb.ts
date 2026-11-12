// Leitura e gravação dos ajustes manuais do SKU pai (tabela sku_pai_manual). Ver lib/skuPai.ts.
import { supabase } from "./supabase";
import { montarMapaPai, normalizarSkuPai, paiPadrao } from "./skuPai";

/** Todos os ajustes manuais: sku normalizado -> pai normalizado. Sem a tabela (ou sem rede) devolve vazio. */
export async function carregarPaiManual(): Promise<Map<string, string>> {
  const linhas: { sku: string; pai: string }[] = [];
  try {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("sku_pai_manual").select("sku, pai").range(de, de + 999);
      if (error || !data || data.length === 0) break;
      linhas.push(...(data as any[]));
      if (data.length < 1000) break;
    }
  } catch { /* sem a tabela: vale a regra padrão */ }
  return montarMapaPai(linhas);
}

/**
 * Define o pai de uma lista de SKUs. Se o pai informado é o mesmo que a regra padrão (5 dígitos) devolveria, o ajuste é apagado
 * (o SKU volta ao automático). Devolve a mensagem de erro, ou null se deu certo.
 */
export async function salvarPaiManual(skus: string[], paiNovo: string): Promise<string | null> {
  const pai = normalizarSkuPai(paiNovo);
  if (!pai) return "Informe o SKU pai.";
  const unicos = Array.from(new Set(skus.map(normalizarSkuPai).filter(Boolean)));
  const gravar = unicos.filter((s) => paiPadrao(s) !== pai);
  const limpar = unicos.filter((s) => paiPadrao(s) === pai);
  const agora = new Date().toISOString();
  for (let i = 0; i < gravar.length; i += 500) {
    const { error } = await supabase.from("sku_pai_manual").upsert(gravar.slice(i, i + 500).map((sku) => ({ sku, pai, atualizado_em: agora })), { onConflict: "sku" });
    if (error) return "Não consegui gravar o pai: " + error.message;
  }
  for (let i = 0; i < limpar.length; i += 200) {
    const { error } = await supabase.from("sku_pai_manual").delete().in("sku", limpar.slice(i, i + 200));
    if (error) return "Não consegui gravar o pai: " + error.message;
  }
  return null;
}
