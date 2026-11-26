// Saída da planilha de produtos no MESMO formato em que ela foi enviada (xls volta xls, xlsx volta xlsx), com a mesma aba e as mesmas colunas
// do Tiny. Detalhe do .xls: sem `bookSST` o SheetJS corta cada texto em 255 caracteres (as descrições ficariam truncadas), por isso o .xls é
// sempre gravado com tabela de textos compartilhados.

import * as XLSX from "xlsx";

export type FormatoPlanilha = "xls" | "xlsx";

export interface OrigemPlanilha { formato: FormatoPlanilha; aba: string; base: string }

/** Descobre formato, nome da aba e nome-base do arquivo enviado. CSV (ou qualquer outro) volta como .xlsx. */
export function origemDoArquivo(nomeArquivo: string, nomeAba: string): OrigemPlanilha {
  const ext = (nomeArquivo.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  return { formato: ext === "xls" ? "xls" : "xlsx", aba: nomeAba || "Produtos", base: nomeArquivo.replace(/\.[a-z0-9]+$/i, "") };
}

/** Colunas que o Tiny exporta como número (e que precisam voltar como número, não como texto). */
export const COLUNAS_NUMERICAS = ["Peso líquido (Kg)", "Peso bruto (Kg)", "Largura embalagem", "Altura embalagem", "Comprimento embalagem"];

const vazio = (v: any) => v === null || v === undefined || v === "";

/** Linhas (objetos pelo cabeçalho) → matriz na ordem do cabeçalho; célula vazia vira null (não grava célula) e as colunas numéricas viram número. */
export function linhasParaMatriz(headers: string[], linhas: Record<string, any>[]): any[][] {
  const numericas = new Set(COLUNAS_NUMERICAS);
  const corpo = linhas.map((l) => headers.map((h) => {
    const v = l[h];
    if (vazio(v)) return null;
    if (numericas.has(h) && typeof v === "string") { const n = Number(v.trim().replace(",", ".")); return Number.isFinite(n) ? n : v; }
    return v;
  }));
  return [headers, ...corpo];
}

export function nomeDoArquivoCorrigido(origem: OrigemPlanilha): string {
  return `${origem.base}_corrigido.${origem.formato}`;
}

/** Grava a matriz no formato de origem e devolve os bytes. */
export function gerarArquivoPlanilha(matriz: any[][], origem: OrigemPlanilha): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(matriz);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, origem.aba.slice(0, 31));
  const saida = XLSX.write(wb, origem.formato === "xls" ? { bookType: "biff8", bookSST: true, type: "array" } : { bookType: "xlsx", type: "array" });
  return new Uint8Array(saida as ArrayBuffer);
}

/** Dispara o download no navegador. */
export function baixarBytes(bytes: Uint8Array, nome: string, formato: FormatoPlanilha) {
  const tipo = formato === "xls" ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const blob = new Blob([bytes as BlobPart], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
