// Monta, para cada mês, os números que alimentam os KPIs. Usa o mesmo cálculo do Dashboard/Início (calcularResumoCanais),
// então faturamento, margem e devoluções são os do app, sempre atuais. Sem tabela nova: metas de receita vêm de tb_metas,
// Ads de ads_campanhas_lancamentos, e as regras do KPI ficam em config_regras_tiny (campos kpi_*).
import { calcularResumoCanais, isoDoMesRef, parseCurrency, type BancoDash } from "./resumoCanais";
import { chaveCanal } from "./ranking";
import { normalizarSkuVenda } from "./vendasCanaisLogica";
import { lerConfig, lerSkusExcluidos, skuExcluidoNoMes, type DadosCanalMes, type DadosMes, type KpiConfig, type SkuExcluido } from "./kpi";

export const CAMPO_CONFIG = "kpi_config";
export const CAMPO_SKUS = "kpi_skus_excluidos";
export const campoMargemDoMes = (mes: string) => `kpi_meta_margem_${mes}`;

/** Lê as configurações do KPI de dentro das linhas de config_regras_tiny. */
export function lerConfiguracoes(linhas: any[]): { config: KpiConfig; skus: SkuExcluido[]; margens: Record<string, number> } {
  const mapa = new Map<string, any>();
  (linhas || []).forEach((r) => mapa.set(String(r.campo || ""), r.coluna));
  const margens: Record<string, number> = {};
  mapa.forEach((v, k) => {
    if (k.startsWith("kpi_meta_margem_")) { const n = parseFloat(String(v).replace(",", ".")); if (isFinite(n)) margens[k.slice(16)] = n; }
  });
  return { config: lerConfig(mapa.get(CAMPO_CONFIG)), skus: lerSkusExcluidos(mapa.get(CAMPO_SKUS)), margens };
}

/** Meta de margem (%) do mês: a definida para ele ou, na falta, a do último mês anterior definido (senão, o padrão). */
export function margemDoMes(margens: Record<string, number>, mes: string, padrao: number): { valor: number; definida: boolean } {
  if (margens[mes] !== undefined) return { valor: margens[mes], definida: true };
  const antes = Object.keys(margens).filter((m) => m < mes).sort().pop();
  return { valor: antes ? margens[antes] : padrao, definida: false };
}

/** Meta de receita do canal no mês (só a daquele mês, sem cair para outro mês como o Dashboard faz). */
function metasDoMes(tbMetas: any[], mes: string): Map<string, number> {
  const out = new Map<string, number>();
  (tbMetas || []).forEach((g) => {
    if (isoDoMesRef(g.mes_referencia) !== mes) return;
    const k = chaveCanal(g.canal); if (!k) return;
    out.set(k, parseCurrency(g.meta_valor));   // o último lançamento do mês vale
  });
  return out;
}

const pedidosDistintos = (linhas: any[]) => {
  const s = new Set<string>();
  linhas.forEach((l) => { const p = String(l.id_pedido ?? "").trim().replace(/\.0$/, "").toLowerCase(); if (p) s.add(p); });
  return s.size;
};

export function dadosDoMes(db: BancoDash, mes: string, cfg: KpiConfig, skusLista: SkuExcluido[], margens: Record<string, number>, agora: Date = new Date()): DadosMes {
  const base = calcularResumoCanais(db, mes, agora);

  // Mesmo cálculo sem os SKUs fora do cálculo (obsoletos, desova): saem as vendas, devoluções e cancelamentos deles
  const fora = new Set(skusLista.filter((e) => skuExcluidoNoMes(e, mes)).map((e) => normalizarSkuVenda(e.sku)).filter(Boolean));
  const semFora = (tab: any[]) => (tab || []).filter((l) => !fora.has(normalizarSkuVenda(l.sku)));
  const ajustado = fora.size > 0
    ? calcularResumoCanais({ ...db, vendas_canais: semFora(db.vendas_canais), devolucoes: semFora(db.devolucoes), cancelados: semFora(db.cancelados) }, mes, agora)
    : base;
  const doAjustado = new Map(ajustado.map((r) => [chaveCanal(r.canal), r]));

  const metas = metasDoMes(db.tb_metas, mes);
  const margemMeta = margemDoMes(margens, mes, cfg.margemPadrao).valor;

  const vendasMes = (db.vendas_canais || []).filter((v) => isoDoMesRef(v.mes_referencia) === mes);
  const canceladosMes = (db.cancelados || []).filter((c) => isoDoMesRef(c.mes_referencia) === mes);
  const adsMes = (db.ads_campanhas_lancamentos || []).filter((a) => isoDoMesRef(a.mes_referencia) === mes);

  const canais: DadosCanalMes[] = base.map((r) => {
    const chave = chaveCanal(r.canal);
    const aj = doAjustado.get(chave) || r;
    const ads = adsMes.filter((a) => chaveCanal(a.canal) === chave);
    return {
      chave, canal: r.canal,
      metaReceita: metas.get(chave) ?? 0,
      faturado: cfg.contarReceitaSkusExcluidos ? r.faturadoComRedutor : aj.faturadoComRedutor,
      brutoMargem: aj.faturadoBruto, lucroMargem: aj.lucroLiquidoReal,
      brutoReal: r.faturadoBruto, lucroReal: r.lucroLiquidoReal,
      adsRetorno: ads.reduce((s, a) => s + parseCurrency(a.retorno_bruto), 0), adsInvest: ads.reduce((s, a) => s + parseCurrency(a.investimento), 0),
      pedidosTotais: pedidosDistintos(vendasMes.filter((v) => chaveCanal(v.canal) === chave)),
      pedidosCancelados: pedidosDistintos(canceladosMes.filter((c) => chaveCanal(c.canal) === chave)),
      margemMeta,
    };
  });

  // Meta da empresa = soma das metas de todos os canais do mês (inclusive os que não têm vendas ainda)
  const metaEmpresa = Array.from(metas.values()).reduce((s, v) => s + v, 0);
  const faturadoEmpresa = canais.reduce((s, c) => s + c.faturado, 0);
  return { mes, metaEmpresa, faturadoEmpresa, canais };
}
