// Checagem de Cancelados > Conferência: lê a planilha de notas (NF-e de saída) de meses antigos e cruza com os cancelados guardados.
// Só lógica (sem rede nem tela). O número do pedido sai da coluna indicada do mesmo jeito que no upload de Faturados.
import { chaveDoPedido, textoDoPedido } from "./checagemCanceladosLogica";
import { extrairIdPedidoDaObservacao, paraNumeroBR } from "./idPedidoFaturados";

export interface NotaLida { chave: string; id_pedido: string; nf_e: string; comprador: string; valor_pedido: number | null }

/** Índices (base 0) das colunas; -1 = não puxar. */
export interface ColunasNota { colPedido: number; colNf: number; colComprador: number; colValor: number }

/** Linhas da planilha de notas -> uma nota por pedido (se o pedido repete, vale a primeira linha). */
export function lerNotas(linhas: any[][], p: ColunasNota & { linhaInicial: number }) {
  const notas = new Map<string, NotaLida>();
  let lidas = 0, semPedido = 0, repetidos = 0;
  for (let i = Math.max(0, p.linhaInicial - 1); i < linhas.length; i++) {
    const row = linhas[i];
    if (!row || row.every((c: any) => String(c ?? "").trim() === "")) continue;
    lidas++;
    const id = extrairIdPedidoDaObservacao(row[p.colPedido]);
    const chave = id ? chaveDoPedido(id) : "";
    if (!chave) { semPedido++; continue; }
    if (notas.has(chave)) { repetidos++; continue; }
    notas.set(chave, {
      chave, id_pedido: id!,
      nf_e: p.colNf >= 0 ? textoDoPedido(row[p.colNf]) : "",
      comprador: p.colComprador >= 0 ? String(row[p.colComprador] ?? "").trim() : "",
      valor_pedido: p.colValor >= 0 ? paraNumeroBR(row[p.colValor]) : null,
    });
  }
  return { notas, lidas, semPedido, repetidos };
}

export interface CanceladoGuardado { canal: string; id_pedido: string; chave: string }
export interface NotaGuardada { chave: string; nf_e: string | null; comprador: string | null; valor_pedido: number | string | null; periodo?: string | null; arquivo?: string | null }

/** Cancelados com a nota do mesmo pedido (ou null = ainda sem nota). */
export function cruzar<C extends CanceladoGuardado>(cancelados: C[], notas: Map<string, NotaGuardada>) {
  const linhas = cancelados.map((c) => ({ ...c, nota: notas.get(c.chave) ?? null }));
  const comNota = linhas.filter((l) => l.nota).length;
  const total = linhas.reduce((a, l) => a + (Number(l.nota?.valor_pedido) || 0), 0);
  return { linhas, comNota, semNota: linhas.length - comNota, total };
}
