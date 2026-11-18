// Filtros do Ranking: canais que ficam fora da comparação, TikTok com/sem lives e crescimento em %. Funções puras, sem React nem banco.
import { montarConfigLives } from "./livesVendas";
import { chaveCanal } from "./ranking";
import type { BancoDash } from "./resumoCanais";

const txt = (v: any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const pedidoNorm = (v: any) => String(v ?? "").trim().replace(/\.0$/, "").replace(/\s+/g, "").toLowerCase();

/** Canal onde acontecem as lives (configurado em Lives > Configurações; padrão TikTok). */
export function canalDasLivesDoBanco(db: BancoDash): string {
  return montarConfigLives((db.config_regras_tiny || []) as any, (db.config_regras_canais || []) as any).canal;
}

/** Números de pedido das vendas de live (tabela vendas_lives_separadas) do canal das lives. Linhas antigas, sem pedido, não entram. */
export function pedidosDeLive(linhas: any[] | null | undefined, canalLive: string): Set<string> {
  const out = new Set<string>();
  const alvo = chaveCanal(canalLive);
  (linhas || []).forEach((l) => {
    const ped = pedidoNorm(l.id_pedido);
    if (ped && chaveCanal(l.canal) === alvo) out.add(ped);
  });
  return out;
}

/**
 * Cópia do banco sem as vendas de live: tira de vendas_canais (e dos cancelamentos, devoluções e fretes Flex ligados aos mesmos pedidos)
 * os pedidos do canal das lives que aparecem em vendas_lives_separadas.
 */
export function removerVendasDeLive(db: BancoDash, pedidos: Set<string>, canalLive: string): BancoDash {
  if (pedidos.size === 0) return db;
  const alvo = chaveCanal(canalLive);
  const ehLive = (canal: any, ped: any) => chaveCanal(canal) === alvo && pedidos.has(pedidoNorm(ped));
  return {
    ...db,
    vendas_canais: (db.vendas_canais || []).filter((s: any) => !ehLive(s.canal, s.id_pedido)),
    cancelados: (db.cancelados || []).filter((c: any) => !ehLive(c.canal, c.id_pedido)),
    devolucoes: (db.devolucoes || []).filter((d: any) => !ehLive(d.canal, d.id_pedido ?? d.pedido ?? d.numero_pedido)),
    plp_pedidos: (db.plp_pedidos || []).filter((p: any) => !ehLive(p.canal, p.numero_pedido ?? p.id_pedido)),
  };
}

const emUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Dias do período que já aconteceram (um mês em andamento conta só até hoje), no mínimo 1. */
export function diasDecorridos(p: { inicio: string; fim: string }, hoje: string): number {
  const fim = p.fim < hoje ? p.fim : hoje;
  return Math.max(1, Math.round((emUTC(fim) - emUTC(p.inicio)) / 86400000) + 1);
}

/**
 * Crescimento do faturamento em %, pela média por dia: assim um mês em andamento (ou períodos de tamanhos diferentes) é comparado
 * de forma justa. Sem faturamento no período de comparação não há base e o crescimento fica em 0.
 */
export function crescimentoPct(atual: number, diasAtual: number, anterior: number, diasAnterior: number): number {
  const mediaB = diasAnterior > 0 ? anterior / diasAnterior : 0;
  if (!(mediaB > 0) || !(diasAtual > 0)) return 0;
  return ((atual / diasAtual) / mediaB - 1) * 100;
}

/** O período de comparação tem faturamento (base) para calcular o crescimento? */
export const temBaseDeCrescimento = (anterior: number | null | undefined) => (anterior ?? 0) > 0;
