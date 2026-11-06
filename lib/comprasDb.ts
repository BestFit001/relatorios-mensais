// Compras: gravação e leitura no Supabase.
// Regra de segurança: o envio novo é inserido primeiro (com um "lote" novo) e só depois o antigo é apagado;
// se algo falhar no meio, o lote novo é removido e o antigo continua valendo.
import { supabase } from "./supabase";
import { buscarTudo } from "./buscarTudo";
import type { LinhaEstoque, LinhaVenda, ProdutoCat } from "./comprasImport";

export type Progresso = (texto: string, feito: number, total: number) => void;

async function inserirEmLotes(
  tabela: string, linhas: any[], rotulo: string, onProg?: Progresso,
  opcoes: { upsert?: { onConflict: string; ignoreDuplicates?: boolean }; tam?: number; simultaneos?: number } = {},
): Promise<void> {
  const tam = opcoes.tam ?? 1000, simultaneos = opcoes.simultaneos ?? 4;
  const partes: any[][] = [];
  for (let i = 0; i < linhas.length; i += tam) partes.push(linhas.slice(i, i + tam));
  let proximo = 0, feitas = 0, erro: Error | null = null;
  const trabalhador = async () => {
    while (!erro) {
      const i = proximo++;
      if (i >= partes.length) return;
      const q = opcoes.upsert
        ? supabase.from(tabela).upsert(partes[i], { onConflict: opcoes.upsert.onConflict, ignoreDuplicates: !!opcoes.upsert.ignoreDuplicates })
        : supabase.from(tabela).insert(partes[i]);
      const { error } = await q;
      if (error) { erro = new Error(`${tabela}: ${error.message}`); return; }
      feitas++;
      onProg?.(rotulo, feitas, partes.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(simultaneos, Math.max(1, partes.length)) }, trabalhador));
  if (erro) throw erro;
}

/** Cadastro por grade. `completo` = vem do estoque Shop9 (sobrescreve); senão só cria o que ainda não existe. */
export async function gravarProdutos(produtos: ProdutoCat[], completo: boolean, onProg?: Progresso): Promise<void> {
  if (produtos.length === 0) return;
  const agora = new Date().toISOString();
  const linhas = produtos.map((p) => ({ ...p, atualizado_em: agora }));
  await inserirEmLotes("compras_produtos", linhas, "Cadastro de produtos", onProg, {
    upsert: { onConflict: "grade", ignoreDuplicates: !completo }, tam: 800,
  });
}

/** Troca o estoque do escopo (filiais físicas ou uma filial do e-commerce) pelo novo, sem histórico. */
export async function gravarEstoque(linhas: LinhaEstoque[], escopo: { tipo: "fisicas" } | { tipo: "filial"; filial: number }, onProg?: Progresso): Promise<number> {
  const lote = Date.now();
  const registros = linhas.map((l) => ({ grade: l.grade, filial: l.filial, estoque: l.estoque, reservado: l.reservado, lote }));
  try {
    await inserirEmLotes("compras_estoque", registros, "Estoque", onProg);
  } catch (e) {
    await supabase.from("compras_estoque").delete().eq("lote", lote);
    throw e;
  }
  let del = supabase.from("compras_estoque").delete().neq("lote", lote);
  del = escopo.tipo === "fisicas" ? del.not("filial", "in", "(8,10)") : del.eq("filial", escopo.filial);
  const { error } = await del;
  if (error) throw new Error("O estoque novo foi gravado, mas não consegui apagar o antigo: " + error.message);
  return lote;
}

/** Troca as vendas de UM mês de UMA fonte (shop9 ou tiny). */
export async function gravarVendas(linhas: LinhaVenda[], periodo: number, fonte: "shop9" | "tiny", onProg?: Progresso): Promise<number> {
  const lote = Date.now();
  const registros = linhas.map((l) => ({ grade: l.grade, filial: l.filial, periodo: l.periodo, fonte: l.fonte, canal: l.canal, qtd: l.qtd, valor: l.valor, lote }));
  try {
    await inserirEmLotes("compras_vendas", registros, "Vendas", onProg);
  } catch (e) {
    await supabase.from("compras_vendas").delete().eq("lote", lote);
    throw e;
  }
  const { error } = await supabase.from("compras_vendas").delete().eq("periodo", periodo).eq("fonte", fonte).neq("lote", lote);
  if (error) throw new Error("As vendas novas foram gravadas, mas não consegui apagar as antigas do mês: " + error.message);
  return lote;
}

export async function registrarUpload(r: { tipo: string; periodo?: number | null; arquivo: string; linhas: number; unidades: number; valor: number; lote: number | null }): Promise<void> {
  const { error } = await supabase.from("compras_uploads").insert({ ...r, periodo: r.periodo ?? null });
  if (error) throw new Error("Não consegui registrar o envio: " + error.message);
}

export interface UploadReg { id: number; tipo: string; periodo: number | null; arquivo: string; linhas: number; unidades: number; valor: number; created_at: string }
export async function carregarUploads(): Promise<UploadReg[]> {
  const { data, error } = await supabase.from("compras_uploads").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return (data || []) as UploadReg[];
}

export async function carregarNomesFiliais(): Promise<Record<string, string>> {
  const { data } = await supabase.from("compras_config").select("valor").eq("chave", "filiais").maybeSingle();
  return (data?.valor as Record<string, string>) || {};
}
export async function salvarNomesFiliais(nomes: Record<string, string>): Promise<void> {
  const limpos: Record<string, string> = {};
  for (const [k, v] of Object.entries(nomes)) if (v.trim()) limpos[k] = v.trim();
  const { error } = await supabase.from("compras_config").upsert({ chave: "filiais", valor: limpos, updated_at: new Date().toISOString() }, { onConflict: "chave" });
  if (error) throw new Error(error.message);
}

/** Último período (AAAAMM) com venda gravada, ou null. */
export async function ultimoPeriodoComVenda(): Promise<number | null> {
  const { data } = await supabase.from("compras_vendas").select("periodo").order("periodo", { ascending: false }).limit(1);
  return data && data.length ? Number(data[0].periodo) : null;
}

export async function carregarVendas(periodoInicial: number) {
  return buscarTudo("compras_vendas", "grade,filial,periodo,qtd,valor", (q) => q.gte("periodo", periodoInicial));
}
export const carregarEstoque = () => buscarTudo("compras_estoque", "grade,filial,estoque");
export const carregarProdutos = () => buscarTudo("compras_produtos", "grade,codigo,produto,cor,tamanho,genero,marca,classe,familia,fornecedor,custo,pdv_loja,pdv_ec");
