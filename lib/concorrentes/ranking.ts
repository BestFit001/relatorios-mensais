// Ranking "Mais vendidos" (tag "3º MAIS VENDIDO"): posição atual, posição da leitura anterior e o que mudou.

export interface CamposRanking {
  ranking_posicao: number | null;
  ranking_anterior: number | null;
  ranking_data: string | null;
  ranking_data_anterior: string | null;
}

export type MovimentoRanking =
  | { tipo: "subiu" | "caiu"; delta: number; de: number; desde: string | null }
  | { tipo: "igual"; desde: string | null }
  | { tipo: "novo" }
  | { tipo: "saiu"; de: number; em: string | null };

/** O que o anúncio fez no ranking entre a leitura anterior e a última. `null` = nunca esteve no ranking. */
export function movimentoRanking(a: CamposRanking): MovimentoRanking | null {
  const atual = a.ranking_posicao, antes = a.ranking_anterior;
  if (atual != null) {
    if (antes == null) return { tipo: "novo" };
    if (atual === antes) return { tipo: "igual", desde: a.ranking_data_anterior };
    return atual < antes ? { tipo: "subiu", delta: antes - atual, de: antes, desde: a.ranking_data_anterior } : { tipo: "caiu", delta: atual - antes, de: antes, desde: a.ranking_data_anterior };
  }
  if (antes != null) return { tipo: "saiu", de: antes, em: a.ranking_data };
  return null;
}

/** Campos a gravar quando uma leitura nova traz a posição `nova` (null = não apareceu no ranking dessa vez). */
export function atualizarRanking(atual: Pick<CamposRanking, "ranking_posicao" | "ranking_data">, nova: number | null, hoje: string): Partial<CamposRanking> {
  // 2ª leitura no mesmo dia: só corrige a posição de hoje, a "anterior" continua sendo a de um dia anterior
  if (atual.ranking_data === hoje) return { ranking_posicao: nova };
  return { ranking_anterior: atual.ranking_posicao ?? null, ranking_data_anterior: atual.ranking_data ?? null, ranking_posicao: nova, ranking_data: hoje };
}

/** Número da tag "3º MAIS VENDIDO" / "3° mais vendido" / "3o MAIS VENDIDO" dentro de um texto. */
export function posicaoDaTag(texto: string | null | undefined): number | null {
  const m = /(\d{1,3})\s*[ºo°]\s*mais\s+vendido/i.exec(texto || "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}
