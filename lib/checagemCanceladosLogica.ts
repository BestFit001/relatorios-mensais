// Ferramentas > Checagem de Cancelados: decide se o status de um pedido contém o que o usuário procura.
// Só lógica (sem rede nem tela).
//
// Regras do texto procurado:
//  - ignora maiúsculas, acentos e espaços sobrando;
//  - "cancelado"          acha "Pedido cancelado em 15/09", "CANCELADO", "Cancelado pelo comprador"...
//  - "pedido cancelado"   exige as DUAS palavras no status, em qualquer ordem ("Cancelado - pedido 123" também vale);
//  - ";" separa alternativas: "cancelado; devolvido" acha qualquer um dos dois.

const limpar = (s: any): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Alternativas (separadas por ";"), cada uma com suas palavras. Vazio = nada a procurar. */
export function interpretarTermo(termo: string): string[][] {
  return String(termo ?? "")
    .split(";")
    .map((alt) => limpar(alt).split(" ").filter(Boolean))
    .filter((palavras) => palavras.length > 0);
}

export function statusContem(status: any, termo: string | string[][]): boolean {
  const alternativas = typeof termo === "string" ? interpretarTermo(termo) : termo;
  if (alternativas.length === 0) return false;
  const texto = limpar(status);
  if (!texto) return false;
  return alternativas.some((palavras) => palavras.every((p) => texto.includes(p)));
}

/** ID de pedido como texto (planilhas costumam trazer o número grande como numérico: nada de notação científica). */
export function textoDoPedido(valor: any): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return Number.isFinite(valor) ? valor.toLocaleString("fullwide", { useGrouping: false, maximumFractionDigits: 0 }) : "";
  return String(valor).trim().replace(/^'/, "");
}

export interface PedidoAchado { idPedido: string; status: string }

/**
 * Percorre as linhas (a partir de `linhaInicial`, 1 = primeira linha da planilha) e devolve os pedidos cujo status bate com o termo.
 * O mesmo pedido repetido na planilha é registrado uma vez.
 */
export function achar(linhas: any[][], p: { linhaInicial: number; colPedido: number; colStatus: number; termo: string }) {
  const alternativas = interpretarTermo(p.termo);
  const vistos = new Set<string>();
  const achados: PedidoAchado[] = [];
  let lidas = 0, semPedido = 0;
  for (let i = Math.max(0, p.linhaInicial - 1); i < linhas.length; i++) {
    const linha = linhas[i] || [];
    const id = textoDoPedido(linha[p.colPedido]);
    const status = String(linha[p.colStatus] ?? "").trim();
    if (!id && !status) continue;          // linha em branco
    lidas++;
    if (!statusContem(status, alternativas)) continue;
    if (!id) { semPedido++; continue; }
    if (vistos.has(id)) continue;
    vistos.add(id);
    achados.push({ idPedido: id, status });
  }
  return { achados, lidas, semPedido };
}
