// Repasse REAL por pedido (extrato do canal, hoje o do TikTok).
//  - lerRepassesPorPedido: lê a planilha do extrato (uma linha por item; carrinho = várias linhas com o mesmo ID) e soma o repasse de cada pedido;
//  - criarRepasseReal: usado pelo Dashboard, Executivo, Início e Relatórios para trocar o repasse estimado pela fórmula pelo valor real,
//    dividindo o repasse do pedido entre as linhas de venda dele na proporção do PDV.
// Só contas (sem rede nem banco), para poder testar.
import { interpretarTermo, statusContem, textoDoPedido } from "./checagemCanceladosLogica";
import { paraNumeroBR } from "./idPedidoFaturados";

/** Mesma normalização de pedido usada pelo dashboard (sem espaços, sem ".0" final, minúsculo). */
export const normalizarPedidoDash = (v: unknown): string => String(v ?? "").trim().replace(/\.0$/, "").replace(/\s+/g, "").toLowerCase();
const normalizarCanal = (v: unknown): string => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

export interface ConfigRepasse {
  linhaInicial: number; colPedido: number; colRepasse: number;
  /** Coluna do status (-1/omitida: não há) e o texto a ignorar (mesmas regras da Checagem de Cancelados; ";" separa termos). */
  colStatus?: number; ignorarStatus?: string;
}
export interface PedidoRepasse { id_pedido: string; repasse: number; linhas: number[] }
export interface LinhaIgnorada { linha: number; idPedido: string; status: string }
export interface LeituraRepasse {
  pedidos: PedidoRepasse[];
  ignoradasStatus: LinhaIgnorada[];
  ignoradas: number;                                  // em branco, cabeçalho e observações do relatório
  semRepasse: Array<{ linha: number; idPedido: string }>;   // parecem pedidos (ID só com dígitos) mas o repasse está vazio/ilegível
}

const dinheiro = (n: number) => Math.round(n * 100) / 100;

export function lerRepassesPorPedido(linhas: any[][], cfg: ConfigRepasse): LeituraRepasse {
  const termos = interpretarTermo(cfg.ignorarStatus ?? "");
  const usaStatus = (cfg.colStatus ?? -1) >= 0 && termos.length > 0;
  const porId = new Map<string, PedidoRepasse>();
  const ignoradasStatus: LinhaIgnorada[] = [];
  const semRepasse: Array<{ linha: number; idPedido: string }> = [];
  let ignoradas = 0;
  for (let i = Math.max(0, cfg.linhaInicial - 1); i < linhas.length; i++) {
    const l = linhas[i] || [];
    const idPedido = textoDoPedido(l[cfg.colPedido]);
    const id = normalizarPedidoDash(idPedido);
    if (!id) { ignoradas++; continue; }
    if (usaStatus && statusContem(l[cfg.colStatus as number], termos)) { ignoradasStatus.push({ linha: i + 1, idPedido, status: String(l[cfg.colStatus as number] ?? "").trim() }); continue; }
    const repasse = paraNumeroBR(l[cfg.colRepasse]);
    if (repasse == null) { if (/^\d{10,}$/.test(id)) semRepasse.push({ linha: i + 1, idPedido }); else ignoradas++; continue; }
    const p = porId.get(id);
    if (p) { p.repasse += repasse; p.linhas.push(i + 1); } else porId.set(id, { id_pedido: id, repasse, linhas: [i + 1] });
  }
  const pedidos = Array.from(porId.values()).map((p) => ({ ...p, repasse: dinheiro(p.repasse) }));
  return { pedidos, ignoradasStatus, ignoradas, semRepasse };
}

const num = (v: unknown): number => { const n = paraNumeroBR(v); return n == null ? 0 : n; };

/**
 * Devolve uma função que, dada uma linha de venda (vendas_canais), responde o repasse REAL dela ou null (sem repasse real: usa a fórmula).
 * `reais`: linhas de repasses_pedidos; `vendas`: TODAS as linhas de vendas (para dividir o repasse do pedido entre os itens).
 */
export function criarRepasseReal(reais: any[] | null | undefined, vendas: any[] | null | undefined): (venda: any) => number | null {
  if (!reais || reais.length === 0) return () => null;
  const chave = (canal: unknown, pedido: unknown) => `${normalizarCanal(canal)}|${normalizarPedidoDash(pedido)}`;
  const real = new Map<string, number>();
  for (const r of reais) { const k = chave(r.canal, r.id_pedido); const v = paraNumeroBR(r.repasse); if (v != null) real.set(k, v); }
  const grupos = new Map<string, { preco: number; n: number }>();
  for (const s of vendas || []) {
    const k = chave(s.canal, s.id_pedido);
    if (!real.has(k)) continue;
    const g = grupos.get(k) || { preco: 0, n: 0 };
    g.preco += Math.max(0, num(s.preco_venda || s.valor)); g.n += 1; grupos.set(k, g);
  }
  return (s: any) => {
    const k = chave(s.canal, s.id_pedido);
    const total = real.get(k);
    if (total === undefined) return null;
    const g = grupos.get(k);
    if (!g || g.n <= 1) return total;
    const preco = Math.max(0, num(s.preco_venda || s.valor));
    return g.preco > 0 ? total * (preco / g.preco) : total / g.n;
  };
}
