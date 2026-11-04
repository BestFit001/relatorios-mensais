import * as XLSX from "xlsx";
import { ehPlanilhaBinaria, textoParaMatriz, decodificarTexto } from "./fulfillment";

/**
 * Lê QUALQUER arquivo de planilha/texto (xlsx, xls, ods, csv, txt, tsv...) e devolve as linhas
 * no formato { A: .., B: .. } (letras das colunas, como no Excel), da primeira aba.
 */
export async function lerArquivoComoMatriz(file: File): Promise<any[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ehPlanilhaBinaria(bytes)) {
    const wb = XLSX.read(bytes, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" }) as any[];
  }
  const matriz = textoParaMatriz(decodificarTexto(bytes));
  if (matriz.length === 0) throw new Error("o arquivo está vazio ou não é uma planilha/tabela de texto.");
  return matriz;
}

function letrasParaIndice(letras: string): number {
  let n = 0;
  for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
  return n - 1;
}

/**
 * Igual a lerArquivoComoMatriz, mas devolve cada linha como lista (posição 0 = coluna A, 1 = B...).
 * Textos (csv/txt) chegam como texto puro, sem o Excel "adivinhar" datas e números.
 */
export async function lerArquivoComoLinhas(file: File): Promise<any[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ehPlanilhaBinaria(bytes)) {
    const wb = XLSX.read(bytes, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as any[][];
  }
  const matriz = textoParaMatriz(decodificarTexto(bytes));
  if (matriz.length === 0) throw new Error("o arquivo está vazio ou não é uma planilha/tabela de texto.");
  return matriz.map((obj) => {
    const linha: any[] = [];
    Object.keys(obj).forEach((letras) => { linha[letrasParaIndice(letras)] = obj[letras]; });
    for (let i = 0; i < linha.length; i++) if (linha[i] === undefined) linha[i] = "";
    return linha;
  });
}
