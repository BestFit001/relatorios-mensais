// Resumo por canal para a tela inicial. ESPELHA o cálculo de app/dashboard/page.tsx (channelAnalytics, filtros "TODOS"),
// para que faturamento, meta e % líquido da tela inicial sejam os mesmos números do Dashboard.
// Se a regra do Dashboard mudar, ajuste aqui também.

export type BancoDash = Record<string, any[]>;

export interface ResumoCanal {
  canal: string;
  responsavel: string;
  metaValor: number;
  faturadoBruto: number;
  faturadoComRedutor: number;
  lucroLiquidoReal: number;
  progressoMetaPct: number;
  margemBrutaPct: number;
  margemLiquidaPct: number;
  projecaoFaturamento: number;
  repasseLiquidoTotal: number;
  isCurrentMonth: boolean;
  isFisico: boolean;
  logoUrl: string | null;
}

export const TABELAS_RESUMO = [
  "vendas_canais", "faturados", "tarifas_site", "tabela_custos_skus", "config_regras_canais",
  "config_regras_tiny", "tb_metas", "devolucoes", "ads_faturamento_canal", "plp_pedidos",
] as const;

const MESES_MAP: Record<string, string> = {
  "01": "janeiro", "02": "fevereiro", "03": "março", "04": "abril", "05": "maio", "06": "junho",
  "07": "julho", "08": "agosto", "09": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro",
};

const normalizarTexto = (v: any) =>
  String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

const canonizarCanal = (nomeCanal: any, oficiais: string[]) => {
  const limpo = String(nomeCanal || "").trim();
  const norm = normalizarTexto(limpo);
  if (norm.includes("magalu") || norm.includes("magazine luiza")) {
    const match = oficiais.find((c) => normalizarTexto(c).includes("magalu") || normalizarTexto(c).includes("magazine luiza"));
    if (match) return match;
  }
  const oficial = oficiais.find((c) => normalizarTexto(c) === norm);
  return oficial || limpo;
};

const normalizarSku = (v: any) => {
  if (v === null || v === undefined) return "";
  let s = String(v).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

const normalizarPedido = (v: any) => String(v ?? "").trim().replace(/\.0$/, "").replace(/\s+/g, "").toLowerCase();

const isChannelFisico = (canalName: string) => {
  const nome = normalizarTexto(canalName);
  return nome.includes("clube") || nome.includes("loja") || nome.includes("paineiras") || nome.includes("hebraica");
};

export const parseCurrency = (val: any): number => {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  let s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{2}\/\d{2}\/\d{4}/.test(s)) return 0;
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma && !hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasDot && !hasComma) {
    const parts = s.split(".");
    if (parts.length > 2) s = s.replace(/\./g, "");
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
};

const escapeRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const avaliarFormulaRepasse = (formula: string, pdv: number, qtd: number, colPdv?: string, colQtd?: string): number | null => {
  if (!formula || !formula.trim()) return null;
  try {
    let exp = formula.trim();
    exp = exp.replace(/\bPDV\b/gi, String(pdv));
    exp = exp.replace(/\bQTD\b/gi, String(qtd));
    exp = exp.replace(/\bQUANTIDADE\b/gi, String(qtd));
    if (colPdv && colPdv.trim()) exp = exp.replace(new RegExp(`\\b${escapeRegex(colPdv.trim())}\\b`, "gi"), String(pdv));
    if (colQtd && colQtd.trim()) exp = exp.replace(new RegExp(`\\b${escapeRegex(colQtd.trim())}\\b`, "gi"), String(qtd));
    exp = exp.replace(/(\d+(\.\d+)?)%/g, "($1 / 100)");
    if (/^[0-9+\-*/().\s><=?:!&|]+$/.test(exp)) {
      const calc = Function(`"use strict"; return (${exp})`)();
      if (typeof calc === "number" && !isNaN(calc) && calc >= 0) return calc;
    }
  } catch { /* fórmula inválida: cai no padrão */ }
  return null;
};

/** "2026-10" -> formatos usados pelas tabelas: 2026-10, 10/2026, "outubro de 2026" */
export function formatosDoMes(mesIso: string) {
  const [ano, mes] = mesIso.split("-");
  return { iso: mesIso, barra: `${mes}/${ano}`, extenso: `${MESES_MAP[mes] || "outubro"} de ${ano}` };
}

export function calcularResumoCanais(db: BancoDash, mesIso: string, agora: Date = new Date()): ResumoCanal[] {
  const mesRefFormatos = formatosDoMes(mesIso);

  // Canais oficiais (iguais ao Dashboard)
  const mapaOficiais = new Map<string, string>();
  const adicionar = (nome: any) => {
    let limpo = String(nome || "").trim();
    if (!limpo) return;
    if (normalizarTexto(limpo).includes("mercado livre 3")) return;
    if (normalizarTexto(limpo).includes("magazine luiza")) limpo = "Magalu";
    mapaOficiais.set(normalizarTexto(limpo), limpo);
  };
  (db.config_regras_canais || []).forEach((r: any) => adicionar(r.canal));
  ["Clube Hebraica", "Clube Paineiras"].forEach(adicionar);
  const canaisOficiais = Array.from(mapaOficiais.values());

  const channelRules = db.config_regras_canais || [];
  const sales = db.vendas_canais || [];
  const products = db.tabela_custos_skus || [];
  const goals = db.tb_metas || [];
  const cancelados = db.cancelados || [];

  const cfgImposto = (db.config_regras_tiny || []).find((c: any) => c.campo === "imposto_global");
  const aliquotaImpostoGlobal = cfgImposto && cfgImposto.coluna ? parseCurrency(cfgImposto.coluna) : 6.0;

  const tarifasSiteMap: Record<string, number> = {};
  (db.tarifas_site || []).forEach((t: any) => {
    const idPed = normalizarPedido(t.id_pedido);
    if (idPed) tarifasSiteMap[idPed] = parseCurrency(t.valor_tarifa);
  });

  const produtosCustoMap = new Map<string, { custo_unitario: number; custo_embalagem: number }>();
  products.forEach((p: any) => {
    const sNorm = normalizarSku(p.sku);
    if (sNorm) {
      produtosCustoMap.set(sNorm, {
        custo_unitario: parseCurrency(p.custo_unitario || p.preco_custo || p.custo),
        custo_embalagem: parseCurrency(p.custo_embalagem),
      });
    }
  });

  const faturadosMap = new Map<string, { data_faturamento: string; mes_referencia: string }>();
  (db.faturados || []).forEach((f: any) => {
    const idPed = normalizarPedido(f.id_pedido);
    if (idPed) {
      faturadosMap.set(idPed, {
        data_faturamento: f.data_faturamento ? String(f.data_faturamento).slice(0, 10) : "",
        mes_referencia: String(f.mes_referencia || "").trim().toLowerCase(),
      });
    }
  });

  const flexMap = new Map<string, number>();
  (db.plp_pedidos || []).forEach((p: any) => {
    const idPed = normalizarPedido(p.numero_pedido ?? p.id_pedido);
    const vFrete = parseCurrency(p.valor_frete);
    if (idPed && vFrete > 0) flexMap.set(idPed, vFrete);
  });

  const adsMap = new Map<string, number>();
  (db.ads_faturamento_canal || []).forEach((a: any) => {
    const mesRefDb = String(a.mes_referencia || "").trim().toLowerCase();
    if (mesRefDb === mesRefFormatos.iso || mesRefDb === mesRefFormatos.barra || mesRefDb === mesRefFormatos.extenso) {
      adsMap.set(normalizarTexto(canonizarCanal(a.canal, canaisOficiais)), parseCurrency(a.gasto_ads));
    }
  });

  const channelLogos: Record<string, string> = {};
  channelRules.forEach((r: any) => { if (r.canal && r.logo_url) channelLogos[canonizarCanal(r.canal, canaisOficiais)] = r.logo_url; });

  const mesRefCorresponde = (valor: any) => {
    const v = String(valor || "").trim().toLowerCase();
    if (!v) return false;
    return v === mesRefFormatos.iso || v === mesRefFormatos.barra || v === mesRefFormatos.extenso ||
      v.includes(mesRefFormatos.iso) || v.includes(mesRefFormatos.barra) || v.includes(mesRefFormatos.extenso);
  };

  const activeCancelados = cancelados.filter((c: any) => {
    const mRef = String(c.mes_referencia || "").trim().toLowerCase();
    if (!(mRef === mesRefFormatos.iso || mRef === mesRefFormatos.barra || mRef === mesRefFormatos.extenso)) return false;
    return canaisOficiais.includes(canonizarCanal(c.canal, canaisOficiais));
  });

  const activeDevolucoes = (db.devolucoes || []).filter((d: any) => {
    const dataDev = String(d.data_retorno || d.data || d.data_devolucao || "").trim();
    let mesDev = "";
    if (d.mes_referencia) mesDev = String(d.mes_referencia).trim().toLowerCase();
    else if (dataDev) {
      if (dataDev.includes("-")) mesDev = dataDev.slice(0, 7);
      else if (dataDev.includes("/")) {
        const parts = dataDev.split("/");
        if (parts.length === 3) mesDev = `${parts[2]}-${parts[1]}`;
      }
    }
    const matchMes = mesDev === mesRefFormatos.iso || mesDev === mesRefFormatos.barra ||
      mesDev.includes(mesRefFormatos.iso) || mesDev.includes(mesRefFormatos.extenso);
    if (!matchMes) return false;
    return canaisOficiais.includes(canonizarCanal(d.canal, canaisOficiais));
  });

  const enrichedSales = sales
    .map((s: any) => ({ ...s, canal: canonizarCanal(s.canal, canaisOficiais) }))
    .filter((s: any) => {
      if (!canaisOficiais.includes(s.canal)) return false;
      const fisico = isChannelFisico(s.canal);
      const ped = normalizarPedido(s.id_pedido);
      const fatInfo = faturadosMap.get(ped);
      if (!fisico) {
        if (!fatInfo) return false;
        const fatMesRef = fatInfo.mes_referencia.toLowerCase();
        const fatData = fatInfo.data_faturamento;
        const matchMes = fatMesRef.includes(mesRefFormatos.iso) || fatMesRef.includes(mesRefFormatos.barra) ||
          fatMesRef.includes(mesRefFormatos.extenso) || (fatData && fatData.startsWith(mesRefFormatos.iso));
        if (!matchMes) return false;
      } else if (!mesRefCorresponde(s.mes_referencia)) return false;
      return true;
    })
    .map((s: any) => {
      const qtd = parseCurrency(s.quantidade) || 1;
      const precoVenda = parseCurrency(s.preco_venda || s.valor);

      let custoCMV = 0;
      if (isChannelFisico(s.canal) && s.cmv_clube !== undefined && s.cmv_clube !== null) custoCMV = parseCurrency(s.cmv_clube);
      else {
        const custoProd = produtosCustoMap.get(normalizarSku(s.sku)) || { custo_unitario: 0, custo_embalagem: 0 };
        custoCMV = (custoProd.custo_unitario + custoProd.custo_embalagem) * qtd;
      }

      const ped = normalizarPedido(s.id_pedido);
      const custoFlex = flexMap.get(ped) || 0;
      const ruleObj = channelRules.find((r: any) => normalizarTexto(canonizarCanal(r.canal, canaisOficiais)) === normalizarTexto(s.canal)) || {};
      let repasseLiquido = parseCurrency(s.repasse_liquido);

      if (ruleObj.formula_excel && ruleObj.formula_excel.trim()) {
        const colPdv = ruleObj.col_pdv || ruleObj.col_preco_venda || "P";
        const colQtd = ruleObj.col_quantidade || "O";
        const calculado = avaliarFormulaRepasse(ruleObj.formula_excel, precoVenda, qtd, colPdv, colQtd);
        if (calculado !== null) repasseLiquido = calculado;
      }
      if (isNaN(repasseLiquido) || repasseLiquido <= 0 || (precoVenda > 0 && repasseLiquido > precoVenda * qtd * 1.5)) {
        repasseLiquido = Math.max(0, precoVenda * qtd - precoVenda * qtd * 0.16);
      }
      const nomeCanal = normalizarTexto(s.canal);
      if ((nomeCanal.includes("site") || nomeCanal.includes("loja virtual")) && tarifasSiteMap[ped]) {
        repasseLiquido = Math.max(0, repasseLiquido - parseCurrency(tarifasSiteMap[ped]));
      }
      return { ...s, preco_venda: precoVenda, custoCMV, custoFlex, repasse_liquido: repasseLiquido };
    });

  const [refAnoStr, refMesStr] = mesIso.split("-");
  const refAno = parseInt(refAnoStr, 10);
  const refMes = parseInt(refMesStr, 10) - 1;
  const isCurrentMonth = agora.getFullYear() === refAno && agora.getMonth() === refMes;
  const totalDiasMes = new Date(refAno, refMes + 1, 0).getDate();
  let diasPassados = 1;
  if (isCurrentMonth) diasPassados = Math.max(1, agora.getDate());
  else if (new Date(refAno, refMes, 1) < agora) diasPassados = totalDiasMes;

  const canais = canaisOficiais.slice().sort((a, b) => {
    const aF = isChannelFisico(a), bF = isChannelFisico(b);
    if (aF && !bF) return -1;
    if (!aF && bF) return 1;
    return a.localeCompare(b);
  });

  return canais.map((channelName) => {
    const chSales = enrichedSales.filter((s: any) => s.canal === channelName);
    const ruleObj = channelRules.find((r: any) => normalizarTexto(r.canal) === normalizarTexto(channelName)) || {};

    const goalObj = goals.find((g: any) => {
      const cNome = normalizarTexto(canonizarCanal(g.canal, canaisOficiais));
      const mMes = String(g.mes_referencia || "").trim().toLowerCase();
      return cNome === normalizarTexto(channelName) && (mMes === mesRefFormatos.iso || mMes === mesRefFormatos.barra || mMes === mesRefFormatos.extenso);
    }) || goals.find((g: any) => normalizarTexto(canonizarCanal(g.canal, canaisOficiais)) === normalizarTexto(channelName))
      || { meta_valor: 0, responsavel: ruleObj.responsavel || "Equipe Best Fit" };

    const cancelamentosMes = activeCancelados
      .filter((c: any) => canonizarCanal(c.canal, canaisOficiais) === channelName)
      .reduce((sum: number, c: any) => sum + parseCurrency(c.valor), 0);

    let estRepasseCanc = 0, estCmvCanc = 0, estFlexCanc = 0;
    const pedidosEstornados = new Set<string>();
    activeCancelados.forEach((c: any) => {
      if (canonizarCanal(c.canal, canaisOficiais) !== channelName) return;
      const ped = normalizarPedido(c.id_pedido);
      const vendasDoPedido = ped ? chSales.filter((s: any) => normalizarPedido(s.id_pedido) === ped) : [];
      if (vendasDoPedido.length > 0) {
        if (pedidosEstornados.has(ped)) return;
        pedidosEstornados.add(ped);
        vendasDoPedido.forEach((s: any) => { estRepasseCanc += s.repasse_liquido || 0; estCmvCanc += s.custoCMV || 0; estFlexCanc += s.custoFlex || 0; });
      } else if (c.sku) {
        const custoP = produtosCustoMap.get(normalizarSku(c.sku)) || { custo_unitario: 0, custo_embalagem: 0 };
        estCmvCanc += (custoP.custo_unitario + custoP.custo_embalagem) * (parseCurrency(c.quantidade) || 1);
      }
    });

    let devPdvBruto = 0, devFreteLiquido = 0, devRepasseLiquido = 0, devCmvTotal = 0;
    activeDevolucoes.forEach((d: any) => {
      if (canonizarCanal(d.canal, canaisOficiais) !== channelName) return;
      const pdvVal = parseCurrency(d.pdv || d.valor);
      const freteVal = parseCurrency(d.custo_frete || d.frete);
      const qtdDev = parseCurrency(d.quantidade) || 1;
      devPdvBruto += pdvVal;
      devFreteLiquido += freteVal;
      let repDev = parseCurrency(d.repasse_liquido || d.repasse);
      if (ruleObj.formula_excel && ruleObj.formula_excel.trim()) {
        const colPdv = ruleObj.col_pdv || ruleObj.col_preco_venda || "P";
        const colQtd = ruleObj.col_quantidade || "O";
        const calculadoDev = avaliarFormulaRepasse(ruleObj.formula_excel, pdvVal, qtdDev, colPdv, colQtd);
        if (calculadoDev !== null) repDev = calculadoDev;
      }
      if (isNaN(repDev) || repDev <= 0 || (pdvVal > 0 && repDev > pdvVal * 1.5)) repDev = Math.max(0, pdvVal - pdvVal * 0.16);
      devRepasseLiquido += repDev;
      const custoProd = produtosCustoMap.get(normalizarSku(d.sku)) || { custo_unitario: 0, custo_embalagem: 0 };
      devCmvTotal += (custoProd.custo_unitario + custoProd.custo_embalagem) * qtdDev;
    });

    const faturadoBrutoPuro = chSales.reduce((sum: number, s: any) => sum + s.preco_venda, 0);
    const faturadoComRedutor = Math.max(0, faturadoBrutoPuro - devPdvBruto - cancelamentosMes);
    const repasseVendasCanal = chSales.reduce((sum: number, s: any) => sum + s.repasse_liquido, 0) - estRepasseCanc;
    const repasseLiquidoTotal = Math.max(0, repasseVendasCanal - devRepasseLiquido);
    const canalAds = adsMap.get(normalizarTexto(channelName)) || 0;
    const cmvVendasCanal = chSales.reduce((sum: number, s: any) => sum + s.custoCMV, 0) - estCmvCanc;
    const cmvCanalTotal = Math.max(0, cmvVendasCanal - devCmvTotal);
    const flexCanal = Math.max(0, chSales.reduce((sum: number, s: any) => sum + s.custoFlex, 0) - estFlexCanc);
    const impostoCanal = (faturadoComRedutor * aliquotaImpostoGlobal) / 100;
    const lucroLiquidoFinal = repasseLiquidoTotal - cmvCanalTotal - impostoCanal - flexCanal - canalAds - devFreteLiquido;

    const metaBase = parseCurrency(goalObj.meta_valor);
    return {
      canal: channelName,
      responsavel: ruleObj.responsavel || goalObj.responsavel || "Equipe Best Fit",
      metaValor: metaBase,
      faturadoBruto: faturadoBrutoPuro,
      faturadoComRedutor,
      lucroLiquidoReal: lucroLiquidoFinal,
      progressoMetaPct: metaBase > 0 ? (faturadoComRedutor / metaBase) * 100 : 0,
      margemBrutaPct: faturadoBrutoPuro > 0 ? (repasseLiquidoTotal / faturadoBrutoPuro) * 100 : 0,
      margemLiquidaPct: faturadoBrutoPuro > 0 ? (lucroLiquidoFinal / faturadoBrutoPuro) * 100 : 0,
      projecaoFaturamento: isCurrentMonth ? (faturadoComRedutor / diasPassados) * totalDiasMes : faturadoComRedutor,
      repasseLiquidoTotal,
      isCurrentMonth,
      isFisico: isChannelFisico(channelName),
      logoUrl: channelLogos[channelName] || ruleObj.logo_url || null,
    };
  });
}
