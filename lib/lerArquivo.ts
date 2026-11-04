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
