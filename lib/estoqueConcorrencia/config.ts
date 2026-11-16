// Configuração do Acompanhamento de estoque: quais canais aparecem na tela (config_regras_tiny, campo estoque_conc_canais; ids separados por vírgula).
import { CANAIS_ESTOQUE } from "./links";

export const CAMPO_CANAIS_ESTOQUE = "estoque_conc_canais";

/** Canais visíveis. Sem configuração salva, todos aparecem. */
export function canaisVisiveis(coluna: string | null | undefined): string[] {
  const disponiveis = CANAIS_ESTOQUE.map((c) => c.id);
  if (coluna === null || coluna === undefined) return disponiveis;
  const ids = String(coluna).split(",").map((x) => x.trim()).filter(Boolean);
  return disponiveis.filter((id) => ids.includes(id));
}
