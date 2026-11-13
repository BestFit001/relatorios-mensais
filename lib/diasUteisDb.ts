// Leitura e gravação da lista de feriados extras (Carnaval, Corpus Christi, feriados municipais...) em config_regras_tiny.
import { definirFeriadosExtras } from "./diasUteis";

export const CAMPO_FERIADOS_EXTRAS = "tarefas_feriados_extras";

/** Lê os feriados extras, aplica no cálculo de dias úteis e devolve o texto salvo. Sem a tabela (ou sem rede) vale só o calendário nacional. */
export async function carregarFeriadosExtras(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase.from("config_regras_tiny").select("coluna").eq("campo", CAMPO_FERIADOS_EXTRAS).maybeSingle();
    if (error) return "";
    const texto = String(data?.coluna || "");
    definirFeriadosExtras(texto);
    return texto;
  } catch { return ""; }
}

/** Grava o texto (datas AAAA-MM-DD ou DD/MM/AAAA, separadas por espaço, vírgula ou linha) e aplica na hora. Devolve o erro, ou null. */
export async function salvarFeriadosExtras(supabase: any, texto: string): Promise<string | null> {
  const { error } = await supabase.from("config_regras_tiny").upsert({ campo: CAMPO_FERIADOS_EXTRAS, coluna: texto.trim() }, { onConflict: "campo" });
  if (error) return "Não consegui salvar os feriados: " + error.message;
  definirFeriadosExtras(texto);
  return null;
}
