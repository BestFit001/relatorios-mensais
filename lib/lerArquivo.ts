import * as XLSX from "xlsx";
import { ehPlanilhaBinaria, textoParaMatriz, decodificarTexto } from "./fulfillment";

/**
 * Escolhe a aba que tem os dados. As planilhas do Mercado Livre trazem uma aba oculta e vazia
 * ("dropdown_options_hidden") ANTES da aba "Anúncios": ler sempre a primeira aba devolvia uma planilha vazia.
 * Regra: ignora abas ocultas e vazias; entre as que sobram usa "Anúncios" se existir, senão a primeira.
 */
export function abaPrincipal(wb: XLSX.WorkBook): XLSX.WorkSheet {
  const nomes = wb.SheetNames;
  const ocultas = (wb.Workbook?.Sheets || []).map((s) => !!s?.Hidden);
  const temDados = (ws: XLSX.WorkSheet) => (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][]).some((l) => l.some((c) => String(c ?? "").trim() !== ""));
  const visiveis = nomes.filter((_, i) => !ocultas[i]);
  const candidatas = (visiveis.length ? visiveis : nomes).filter((n) => temDados(wb.Sheets[n]));
  const norm = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const escolhida = candidatas.find((n) => norm(n) === "anuncios") ?? candidatas[0] ?? nomes[0];
  return wb.Sheets[escolhida];
}

/**
 * Lê QUALQUER arquivo de planilha/texto (xlsx, xls, ods, csv, txt, tsv...) e devolve as linhas
 * no formato { A: .., B: .. } (letras das colunas, como no Excel), da primeira aba.
 */
export async function lerArquivoComoMatriz(file: File): Promise<any[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ehPlanilhaBinaria(bytes)) {
    const wb = XLSX.read(bytes, { type: "array" });
    return XLSX.utils.sheet_to_json(abaPrincipal(wb), { header: "A", defval: "" }) as any[];
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
    return XLSX.utils.sheet_to_json(abaPrincipal(wb), { header: 1, defval: "" }) as any[][];
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
