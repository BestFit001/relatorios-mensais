// Produtos do Gerador de imagens: lista própria (tabela produtos_imagens), alimentada por planilha do Tiny/Olist — a mesma planilha da
// Padronização IA, mas salva à parte. É esta lista que o gerador consulta ao escolher o modelo.
import { modelosDaPlanilha, norm, type ModeloPadrao } from "./padroesAnuncios";
import { limparDescricao } from "./textoDescricao";

export { modelosDaPlanilha };
export type { ModeloPadrao };

export const MARCA_PADRAO = "BEST FIT";

/** Identifica o produto na reimportação (título + marca, sem acento nem caixa): o mesmo produto é atualizado, não duplicado. */
export const chaveProduto = (titulo: any, marca: any): string => `${norm(titulo)}|${norm(marca || MARCA_PADRAO)}`;

export interface LinhaProduto {
  chave: string; titulo: string; marca: string; sku: string | null; categoria: string;
  altura: number | null; largura: number | null; comprimento: number | null; peso: number | null;
  descricao_seo: string; descricao_complementar: string; updated_at: string;
}

/**
 * Linha do banco para um modelo lido da planilha. NÃO leva linha1, linha2, capacidade nem beneficios: assim, ao reimportar, o upsert só atualiza
 * os dados da planilha e preserva os benefícios que a pessoa já escreveu ou aprovou. Também não leva `id` (o banco gera).
 */
export function linhaDoProduto(m: ModeloPadrao, agora = new Date()): LinhaProduto {
  const marca = (m.marca || "").trim() || MARCA_PADRAO;
  return {
    chave: chaveProduto(m.titulo, marca), titulo: m.titulo.trim(), marca, sku: m.sku?.trim() || null, categoria: m.categoria || "",
    altura: m.altura, largura: m.largura, comprimento: m.comprimento, peso: m.peso,
    descricao_seo: m.descricao_seo || "", descricao_complementar: limparDescricao(m.descricao_complementar), updated_at: agora.toISOString(),
  };
}

/** Uma só linha por produto: se a planilha repetir título+marca, vale a última. */
export function linhasUnicas(modelos: ModeloPadrao[], agora = new Date()): LinhaProduto[] {
  const mapa = new Map<string, LinhaProduto>();
  for (const m of modelos) { if (m.titulo && m.titulo.trim()) { const l = linhaDoProduto(m, agora); mapa.set(l.chave, l); } }
  return [...mapa.values()];
}

export const emLotes = <T,>(lista: T[], n: number): T[][] => { const r: T[][] = []; for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n)); return r; };
