import { supabase } from "./supabase";

const PASSO = 1000;

/**
 * Lê uma tabela inteira o mais rápido possível: pergunta o total e dispara todas as páginas EM PARALELO.
 * Se o total não vier, cai para a leitura sequencial.
 */
export async function buscarTudo(tabela: string, colunas: string, filtro?: (q: any) => any): Promise<any[]> {
  const aplicar = (q: any) => (filtro ? filtro(q) : q);

  const { count } = await aplicar(supabase.from(tabela).select("id", { count: "exact", head: true }));

  if (typeof count === "number") {
    if (count === 0) return [];
    const paginas = Math.ceil(count / PASSO);
    const respostas = await Promise.all(
      Array.from({ length: paginas }, (_, p) =>
        aplicar(supabase.from(tabela).select(colunas))
          .order("id", { ascending: true })
          .range(p * PASSO, p * PASSO + PASSO - 1)
      )
    );
    const linhas: any[] = [];
    for (const r of respostas) {
      if (r.error) throw new Error(`${tabela}: ${r.error.message}`);
      if (r.data) for (const row of r.data) linhas.push(row);
    }
    return linhas;
  }

  const linhas: any[] = [];
  for (let from = 0; ; from += PASSO) {
    const { data, error } = await aplicar(supabase.from(tabela).select(colunas))
      .order("id", { ascending: true })
      .range(from, from + PASSO - 1);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) linhas.push(row);
    if (data.length < PASSO) break;
  }
  return linhas;
}
