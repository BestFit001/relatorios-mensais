// Sugestões de Ads do Mercado Livre, feitas sozinhas: cruza as vendas do mês (as mesmas do dashboard, em vendas_canais), o custo do SKU,
// a aba de devoluções e o que já está no Ads, e indica quais produtos vale colocar no Adsense, segundo regras configuráveis.
export type CfgSugestoes = { vendasMin: number; margemMinPct: number; taxaDevMaxPct: number; devMaxQtd: number; impostoPct: number };
export const CFG_SUG_PADRAO: CfgSugestoes = { vendasMin: 5, margemMinPct: 15, taxaDevMaxPct: 5, devMaxQtd: 3, impostoPct: 9 };
export function mesclarCfgSug(j: any): CfgSugestoes {
  const n = (v: any, pad: number, min: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" && Number(v) >= min ? Number(v) : pad);
  return {
    vendasMin: n(j?.vendasMin, CFG_SUG_PADRAO.vendasMin, 1), margemMinPct: n(j?.margemMinPct, CFG_SUG_PADRAO.margemMinPct, 0),
    taxaDevMaxPct: n(j?.taxaDevMaxPct, CFG_SUG_PADRAO.taxaDevMaxPct, 0), devMaxQtd: n(j?.devMaxQtd, CFG_SUG_PADRAO.devMaxQtd, 0), impostoPct: n(j?.impostoPct, CFG_SUG_PADRAO.impostoPct, 0),
  };
}

export type VendaLinha = { id_pedido?: string; sku: string; quantidade: number; preco_venda: number; repasse_liquido: number };
export type CanceladoLinha = { id_pedido?: string; sku: string };
export type Devolucao = { sku: string; canal?: string; quantidade?: number; data_retorno?: string };

export const normSkuSug = (v: any): string => {
  let s = String(v ?? "").trim();
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return s.replace(/^["']|["']$/g, "").trim().toLowerCase();
};

/** A data (AAAA-MM-DD ou DD/MM/AAAA) cai no mês "MM/AAAA"? */
export function dataNoMes(d: any, mes: string): boolean {
  const [m, a] = mes.split("/"); const s = String(d ?? "").trim();
  let x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (x) return x[1] === a && x[2].padStart(2, "0") === m;
  x = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (x) return x[3] === a && x[2].padStart(2, "0") === m;
  return false;
}

export type SituacaoSug = "recomendar" | "no_ads" | "nao";
export type Sugestao = {
  sku: string; produto: string; mlbs: string[]; un: number; receita: number; repasse: number; custoUn: number; custoTotal: number; imposto: number;
  liquido: number; margemPct: number; liquidoUn: number; devQtd: number; taxaDev: number;
  adsStatus: "ativo" | "inativo" | "nenhum"; adsRoi: number | null; semCusto: boolean; situacao: SituacaoSug; motivos: string[];
};
export type AdsDoMlb = { status: string; roi: number | null };

export function calcularSugestoes(
  vendas: VendaLinha[], cancelados: CanceladoLinha[], devolucoes: Devolucao[], canal: string, mes: string,
  custos: Map<string, { custo: number; produto: string }>, mlbsPorSku: Map<string, string[]>, adsPorMlb: Map<string, AdsDoMlb>, cfg: CfgSugestoes,
): Sugestao[] {
  const canc = new Set(cancelados.map((c) => `${String(c.id_pedido ?? "")}|${normSkuSug(c.sku)}`));
  const grupos = new Map<string, { sku: string; un: number; receita: number; repasse: number }>();
  for (const v of vendas) {
    const k = normSkuSug(v.sku); if (!k) continue;
    if (canc.has(`${String(v.id_pedido ?? "")}|${k}`)) continue;
    const g = grupos.get(k) || { sku: String(v.sku).trim(), un: 0, receita: 0, repasse: 0 };
    g.un += Number(v.quantidade) || 0; g.receita += Number(v.preco_venda) || 0; g.repasse += Number(v.repasse_liquido) || 0;
    grupos.set(k, g);
  }
  const devPor = new Map<string, number>();
  const canalN = canal.trim().toLowerCase();
  for (const d of devolucoes) {
    if (String(d.canal ?? "").trim().toLowerCase() !== canalN || !dataNoMes(d.data_retorno, mes)) continue;
    const k = normSkuSug(d.sku); if (k) devPor.set(k, (devPor.get(k) || 0) + (Number(d.quantidade) > 0 ? Number(d.quantidade) : 1));
  }
  const R = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const lista: Sugestao[] = [];
  grupos.forEach((g, k) => {
    const c = custos.get(k);
    const custoUn = c?.custo || 0, semCusto = !(custoUn > 0);
    const custoTotal = custoUn * g.un, imposto = g.receita * (cfg.impostoPct / 100);
    const liquido = g.repasse - custoTotal - imposto;
    const margemPct = g.receita > 0 ? (liquido / g.receita) * 100 : 0;
    const devQtd = devPor.get(k) || 0, taxaDev = g.un > 0 ? (devQtd / g.un) * 100 : 0;
    const mlbs = mlbsPorSku.get(k) || [];
    const ads = mlbs.map((m) => adsPorMlb.get(m)).filter(Boolean) as AdsDoMlb[];
    const ativo = ads.find((a) => /^ativ/i.test(a.status));
    const adsStatus = ativo ? "ativo" : ads.length ? "inativo" : "nenhum";
    const adsRoi = (ativo || ads[0])?.roi ?? null;
    const motivos: string[] = [];
    if (g.un < cfg.vendasMin) motivos.push(`Poucas vendas (${R(g.un)} un. no mês; mínimo ${R(cfg.vendasMin)})`);
    if (semCusto) motivos.push("Sem custo cadastrado: não dá para calcular a margem");
    else if (margemPct < cfg.margemMinPct) motivos.push(`Margem líquida de ${R(margemPct)}% (mínimo ${R(cfg.margemMinPct)}%)`);
    if (taxaDev > cfg.taxaDevMaxPct) motivos.push(`Devoluções altas: ${R(taxaDev)}% das vendas (máximo ${R(cfg.taxaDevMaxPct)}%)`);
    if (devQtd > cfg.devMaxQtd) motivos.push(`${devQtd} devoluções no mês (máximo ${cfg.devMaxQtd})`);
    const situacao: SituacaoSug = adsStatus === "ativo" ? "no_ads" : motivos.length ? "nao" : "recomendar";
    lista.push({ sku: g.sku, produto: c?.produto || "Produto sem cadastro de custo", mlbs, un: g.un, receita: g.receita, repasse: g.repasse, custoUn, custoTotal, imposto, liquido, margemPct, liquidoUn: g.un > 0 ? liquido / g.un : 0, devQtd, taxaDev, adsStatus, adsRoi, semCusto, situacao, motivos });
  });
  return lista.sort((a, b) => b.liquido - a.liquido);
}
