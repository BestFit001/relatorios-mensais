'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/app/components/Navbar';

const TABELAS_SUPABASE = [
  'vendas_canais',
  'faturados',
  'tarifas_site',
  'tabela_custos_skus',
  'config_regras_canais',
  'tb_metas',
  'devolucoes',
  'ads_faturamento_canal',
  'plp_pedidos',
] as const;

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [database, setDatabase] = useState<Record<string, any[]>>({});

  const [selectedChannelFilter, setSelectedChannelFilter] = useState('TODOS');
  const [appliedChannelFilter, setAppliedChannelFilter] = useState('TODOS');
  
  const [modalidadeFilter, setModalidadeFilter] = useState('TODAS');
  const [appliedModalidadeFilter, setAppliedModalidadeFilter] = useState('TODAS');

  const [viewMode, setViewMode] = useState<'cards' | 'linhas'>('cards');

  const currentMonthDefault = new Date().toISOString().slice(0, 7);
  const previousMonthDefault = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, []);

  const [dateFilter, setDateFilter] = useState('MES_ATUAL');
  const [customStartDate, setCustomStartDate] = useState(currentMonthDefault + '-01');
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().slice(0, 10));
  
  const [appliedDateFilter, setAppliedDateFilter] = useState('MES_ATUAL');
  const [appliedStartDate, setAppliedStartDate] = useState(currentMonthDefault + '-01');
  const [appliedEndDate, setAppliedEndDate] = useState(new Date().toISOString().slice(0, 10));
  
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [tarifasSiteMap, setTarifasSiteMap] = useState<Record<string, number>>({});

  useEffect(() => {
    async function carregarDados() {
      setLoading(true);
      const resultado: Record<string, any[]> = {};
      await Promise.all(
        TABELAS_SUPABASE.map(async (tabela) => {
          let allRows: any[] = [];
          let from = 0;
          const step = 1000;
          let keep = true;
          while (keep) {
            const { data, error } = await supabase.from(tabela).select('*').range(from, from + step - 1);
            if (error || !data) break;
            allRows = [...allRows, ...data];
            from += step;
            if (data.length < step) keep = false;
          }
          resultado[tabela] = allRows;
        })
      );
      setDatabase(resultado);
      setLoading(false);
    }
    carregarDados();

    async function fetchTarifas() {
      try {
        const { data } = await supabase.from('tb_estado_global').select('dados').eq('chave', 'tarifas_site').single();
        if (data && data.dados) setTarifasSiteMap(data.dados);
      } catch (err) {}
    }
    fetchTarifas();
  }, []);

  const handleRecalculate = () => {
    setIsRecalculating(true);
    setTimeout(() => {
      setAppliedChannelFilter(selectedChannelFilter);
      setAppliedModalidadeFilter(modalidadeFilter);
      setAppliedDateFilter(dateFilter);
      setAppliedStartDate(customStartDate);
      setAppliedEndDate(customEndDate);
      setIsRecalculating(false);
    }, 300);
  };

  const normalizarTexto = (v: any) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const normalizarSku = (v: any) => {
    if (v === null || v === undefined) return "";
    let s = String(v).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
    if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
    return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  };
  const normalizarPedido = (v: any) => String(v ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, '').toLowerCase();

  const isChannelFisico = (canalName: string) => {
    const nome = normalizarTexto(canalName);
    return nome.includes('clube') || nome.includes('loja') || nome.includes('paineiras') || nome.includes('hebraica');
  };

  const parseCurrency = (val: any) => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    let s = String(val).trim().replace('R$', '').replace('R', '').trim();
    if (s.includes('.') && s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const num = Number(s);
    return isNaN(num) ? 0 : num;
  };

  const canais = useMemo(() => {
    const mapa = new Map<string, string>();
    const adicionar = (nome: any) => {
      const limpo = String(nome || '').trim();
      if (limpo) mapa.set(normalizarTexto(limpo), limpo);
    };
    (database.config_regras_canais || []).forEach((r: any) => adicionar(r.canal));
    ['Clube Hebraica', 'Clube Paineiras'].forEach(adicionar);
    return Array.from(mapa.values());
  }, [database.config_regras_canais]);

  const channelRules = database.config_regras_canais || [];
  const sales = database.vendas_canais || [];
  const products = database.tabela_custos_skus || [];
  const goals = database.tb_metas || [];
  const cancelados = database.cancelados || [];
  const users = database.usuarios_permissoes || [];

  const produtosCustoMap = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p: any) => {
      const sNorm = normalizarSku(p.sku);
      if (sNorm) {
        map.set(sNorm, {
          custo_unitario: parseCurrency(p.custo_unitario || p.preco_custo || p.custo),
          custo_embalagem: parseCurrency(p.custo_embalagem)
        });
      }
    });
    return map;
  }, [products]);

  const faturadosMap = useMemo(() => {
    const map = new Map();
    (database.faturados || []).forEach((f: any) => {
      const idPed = normalizarPedido(f.id_pedido);
      if (idPed) {
        map.set(idPed, {
          data_faturamento: f.data_faturamento ? f.data_faturamento.slice(0, 10) : '',
          mes_referencia: String(f.mes_referencia || '').trim().toLowerCase()
        });
      }
    });
    return map;
  }, [database.faturados]);

  const flexMap = useMemo(() => {
    const map = new Map();
    (database.plp_pedidos || []).forEach((p: any) => {
      const idPed = normalizarPedido(p.numero_pedido ?? p.id_pedido);
      const vFrete = parseCurrency(p.valor_frete);
      if (idPed && vFrete > 0) {
        map.set(idPed, vFrete);
      }
    });
    return map;
  }, [database.plp_pedidos]);

  const currentRefMonth = useMemo(() => {
    if (appliedDateFilter === 'PERSONALIZADO' && appliedStartDate) return appliedStartDate.slice(0, 7);
    if (appliedDateFilter === 'MES_ANTERIOR') return previousMonthDefault;
    return currentMonthDefault;
  }, [appliedDateFilter, appliedStartDate, currentMonthDefault, previousMonthDefault]);

  const adsMap = useMemo(() => {
    const map = new Map();
    let formatoMMYYYY = currentRefMonth;
    if (currentRefMonth.includes('-')) {
      const [ano, mes] = currentRefMonth.split('-');
      formatoMMYYYY = `${mes}/${ano}`;
    }

    (database.ads_faturamento_canal || []).forEach((a: any) => {
      const mesRefDb = String(a.mes_referencia || '').trim();
      if (mesRefDb === currentRefMonth || mesRefDb === formatoMMYYYY) {
        const k = normalizarTexto(a.canal);
        map.set(k, parseCurrency(a.gasto_ads));
      }
    });
    return map;
  }, [database.ads_faturamento_canal, currentRefMonth]);

  const devolucoesList = database.devolucoes || [];

  const channelLogos = useMemo(() => {
    const map: Record<string, string> = {};
    channelRules.forEach((r: any) => {
      if (r.canal && r.logo_url) map[r.canal] = r.logo_url;
    });
    return map;
  }, [channelRules]);

  const activeCancelados = useMemo(() => {
    if (!cancelados) return [];
    return cancelados.filter((c: any) => {
      if (c.mes_referencia !== currentRefMonth) return false;
      if (appliedChannelFilter !== 'TODOS' && c.canal !== appliedChannelFilter) return false;
      return true;
    });
  }, [cancelados, currentRefMonth, appliedChannelFilter]);

  // MOTOR DO DASHBOARD: VALIDAÇÃO POR FATURADOS, CMV = (Custo + Emb) * Qtd, E REPASSE EXATO DA COLUNA T
  const enrichedSales = useMemo(() => {
    return (sales || []).filter((s: any) => {
        if (appliedChannelFilter !== 'TODOS' && s.canal !== appliedChannelFilter) return false;

        const fisico = isChannelFisico(s.canal);
        if (appliedModalidadeFilter === 'FISICO' && !fisico) return false;
        if (appliedModalidadeFilter === 'DIGITAL' && fisico) return false;

        const ped = normalizarPedido(s.id_pedido);
        const fatInfo = faturadosMap.get(ped);

        if (!fisico) {
          if (!fatInfo) return false;
          const mesRefAlvo = currentRefMonth.toLowerCase();
          const fatMesRef = fatInfo.mes_referencia.toLowerCase();
          const fatData = fatInfo.data_faturamento;

          const matchMes = fatMesRef.includes(mesRefAlvo) || (fatData && fatData.startsWith(mesRefAlvo));
          if (!matchMes) return false;
        }

        return true;
      })
      .map((s: any) => {
        const qtd = parseCurrency(s.quantidade) || 1;
        const precoVenda = parseCurrency(s.preco_venda || s.valor);

        // CMV Preciso: (Custo Unitário + Embalagem) * Quantidade
        let custoCMV = 0;
        if (isChannelFisico(s.canal) && s.cmv_clube !== undefined && s.cmv_clube !== null) {
          custoCMV = parseCurrency(s.cmv_clube);
        } else {
          const skuVendaNorm = normalizarSku(s.sku);
          const custoProd = produtosCustoMap.get(skuVendaNorm) || { custo_unitario: 0, custo_embalagem: 0 };
          custoCMV = (custoProd.custo_unitario + custoProd.custo_embalagem) * qtd;
        }

        const ped = normalizarPedido(s.id_pedido);
        const custoFlex = flexMap.get(ped) || 0;
        
        // Repasse Líquido: Usa exatamente o repasse gravado (Coluna T)
        let repasseLiquido = parseCurrency(s.repasse_liquido);
        if (isNaN(repasseLiquido) || repasseLiquido <= 0) {
          repasseLiquido = Math.max(0, precoVenda - (precoVenda * 0.09));
        }
        
        const nomeCanal = normalizarTexto(s.canal);
        if ((nomeCanal.includes('site') || nomeCanal.includes('loja virtual')) && tarifasSiteMap[ped]) {
           const taxaVindi = parseCurrency(tarifasSiteMap[ped]);
           repasseLiquido = Math.max(0, repasseLiquido - taxaVindi);
        }
        
        const fatInfo = faturadosMap.get(ped);

        return { 
          ...s, 
          preco_venda: precoVenda,
          custoCMV, 
          custoFlex, 
          repasse_liquido: repasseLiquido,
          data_faturamento: fatInfo ? fatInfo.data_faturamento : (s.data_faturamento || '')
        };
      });
  }, [sales, appliedChannelFilter, appliedModalidadeFilter, appliedDateFilter, currentRefMonth, produtosCustoMap, flexMap, tarifasSiteMap, faturadosMap]);

  const kpis = useMemo(() => {
    const activeChannels = Array.from(new Set([...canais, ...channelRules.map((r: any) => r.canal)]));
    
    let faturamentoBrutoVendas = 0;
    let faturamentoLiquidoRepasse = 0;
    let metaDigitalTotal = 0;
    let fatBrutoFisico = 0;
    let fatBrutoDigital = 0;
    let repasseFisico = 0;
    let repasseDigital = 0;
    let custoTotalCMV = 0;
    let cmvFisico = 0;
    let cmvDigital = 0;

    const totalCancelamentosValor = activeCancelados.reduce((sum: number, c: any) => sum + parseCurrency(c.valor), 0);

    const lojasFisicasDetalhes: any[] = [];
    const lojasFisicasRepasse: any[] = [];

    activeChannels.forEach(channelName => {
      const fisico = isChannelFisico(channelName);
      const goalObj = goals.find((g: any) => g.canal === channelName && g.mes_referencia === currentRefMonth) 
                   || goals.find((g: any) => g.canal === channelName) 
                   || { meta_valor: 0 };
      const metaCanal = parseCurrency(goalObj.meta_valor);

      const chSales = enrichedSales.filter((s: any) => s.canal === channelName);
      
      const cancelamentosCanal = activeCancelados
        .filter((c: any) => normalizarTexto(c.canal) === normalizarTexto(channelName))
        .reduce((sum: number, c: any) => sum + parseCurrency(c.valor), 0);

      const faturadoPuroCanal = chSales.reduce((sum: number, s: any) => sum + s.preco_venda, 0);
      
      const faturadoEfetivoCanal = Math.max(0, faturadoPuroCanal - cancelamentosCanal);
      const repasseCanal = chSales.reduce((sum: number, s: any) => sum + s.repasse_liquido, 0);

      let nomeLimpo = channelName.replace(/clube|loja/gi, '').trim();
      if (!nomeLimpo) nomeLimpo = channelName;

      if (fisico) {
        const progresso = metaCanal > 0 ? (faturadoEfetivoCanal / metaCanal) * 100 : 0;
        const diff = Math.abs(progresso - 100);

        lojasFisicasDetalhes.push({
          nome: nomeLimpo,
          faturado: faturadoEfetivoCanal,
          progresso,
          diff,
          abaixo: progresso < 100
        });

        lojasFisicasRepasse.push({
          nome: nomeLimpo,
          repasse: repasseCanal
        });
      } else {
        metaDigitalTotal += metaCanal;
      }
    });

    enrichedSales.forEach((s: any) => {
      const fisico = isChannelFisico(s.canal);
      const valBruto = s.preco_venda;
      const valRepasse = s.repasse_liquido;
      const valCmv = s.custoCMV;

      faturamentoBrutoVendas += valBruto;
      faturamentoLiquidoRepasse += valRepasse;
      custoTotalCMV += valCmv;

      if (fisico) {
        fatBrutoFisico += valBruto;
        repasseFisico += valRepasse;
        cmvFisico += valCmv;
      } else {
        fatBrutoDigital += valBruto;
        repasseDigital += valRepasse;
        cmvDigital += valCmv;
      }
    });

    faturamentoBrutoVendas = Math.max(0, faturamentoBrutoVendas - totalCancelamentosValor);

    const canceladosDigitais = activeCancelados
        .filter((c: any) => !isChannelFisico(c.canal))
        .reduce((sum: number, c: any) => sum + parseCurrency(c.valor), 0);
    
    fatBrutoDigital = Math.max(0, fatBrutoDigital - canceladosDigitais);

    const progressoDigitalPct = metaDigitalTotal > 0 ? (fatBrutoDigital / metaDigitalTotal) * 100 : 0;
    const diffDigital = Math.abs(progressoDigitalPct - 100);

    const totalFlexCost = enrichedSales.reduce((sum: number, s: any) => sum + s.custoFlex, 0);
    
    const totalAdsCost = Array.from(adsMap.entries())
      .filter(([canal]) => appliedChannelFilter === 'TODOS' || normalizarTexto(canal) === normalizarTexto(appliedChannelFilter))
      .reduce((sum, [, val]) => sum + parseCurrency(val), 0);
    
    const lucroLiquidoReal = faturamentoLiquidoRepasse - custoTotalCMV - totalFlexCost - totalAdsCost;
    const lucroFisico = repasseFisico - cmvFisico;
    const lucroDigital = repasseDigital - cmvDigital - totalFlexCost - totalAdsCost;

    return { 
      faturamentoBrutoVendas, 
      fatBrutoFisico,
      fatBrutoDigital,
      faturamentoLiquidoRepasse, 
      repasseFisico,
      repasseDigital,
      custoTotalCMV, 
      cmvFisico,
      cmvDigital,
      lucroLiquidoReal, 
      lucroFisico,
      lucroDigital,
      totalPedidos: enrichedSales.length,
      lojasFisicasDetalhes,
      lojasFisicasRepasse,
      progressoDigitalPct,
      diffDigital,
      totalCancelamentosValor
    };
  }, [enrichedSales, adsMap, appliedChannelFilter, canais, channelRules, goals, currentRefMonth, activeCancelados]);

  const { targetDateStr, labelVendasDia } = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return {
      targetDateStr: `${yyyy}-${mm}-${dd}`,
      labelVendasDia: `Vendas do Dia ${dd}`
    };
  }, []);

  const channelAnalytics = useMemo(() => {
    const activeChannels = Array.from(new Set([...canais, ...channelRules.map((r: any) => r.canal)]));
    let channelsToAnalyze = appliedChannelFilter === 'TODOS' ? activeChannels : activeChannels.filter(c => normalizarTexto(c) === normalizarTexto(appliedChannelFilter));

    if (appliedModalidadeFilter === 'FISICO') {
      channelsToAnalyze = channelsToAnalyze.filter(c => isChannelFisico(c));
    } else if (appliedModalidadeFilter === 'DIGITAL') {
      channelsToAnalyze = channelsToAnalyze.filter(c => !isChannelFisico(c));
    }

    channelsToAnalyze.sort((a, b) => {
      const aFisico = isChannelFisico(a);
      const bFisico = isChannelFisico(b);
      if (aFisico && !bFisico) return -1;
      if (!aFisico && bFisico) return 1;
      return a.localeCompare(b);
    });

    const [refAnoStr, refMesStr] = currentRefMonth.split('-');
    const refAno = parseInt(refAnoStr, 10);
    const refMes = parseInt(refMesStr, 10) - 1;

    const now = new Date();
    const isCurrentMonth = (now.getFullYear() === refAno && now.getMonth() === refMes);
    const totalDiasMes = new Date(refAno, refMes + 1, 0).getDate();
    
    let diasPassados = 1;
    let diasFaltantes = 1;

    if (isCurrentMonth) {
      diasPassados = Math.max(1, now.getDate());
      diasFaltantes = Math.max(1, totalDiasMes - now.getDate());
    } else if (new Date(refAno, refMes, 1) < now) {
      diasPassados = totalDiasMes;
      diasFaltantes = 0;
    } else {
      diasPassados = 1;
      diasFaltantes = totalDiasMes;
    }

    return channelsToAnalyze.map(channelName => {
      const kCanal = normalizarTexto(channelName);
      const chSales = enrichedSales.filter((s: any) => normalizarTexto(s.canal) === kCanal);
      
      const vendasDoDia = chSales
        .filter((s: any) => s.data_faturamento === targetDateStr)
        .reduce((sum: number, s: any) => sum + s.preco_venda, 0);

      const ruleObj = channelRules.find((r: any) => normalizarTexto(r.canal) === kCanal) || {};
      const goalObj = goals.find((g: any) => normalizarTexto(g.canal) === kCanal && g.mes_referencia === currentRefMonth) 
                   || goals.find((g: any) => normalizarTexto(g.canal) === kCanal) 
                   || { meta_valor: 0, responsavel: ruleObj.responsavel || 'Equipe Best Fit' };

      const cancelamentosMes = activeCancelados
        .filter((c: any) => normalizarTexto(c.canal) === kCanal)
        .reduce((sum: number, c: any) => sum + parseCurrency(c.valor), 0);

      let devPdvBruto = 0;
      let devFreteLiquido = 0;
      let devRepasseLiquido = 0;
      let devCmvTotal = 0;

      devolucoesList.forEach((d: any) => {
        if (normalizarTexto(d.canal) === kCanal) {
          const pdvVal = parseCurrency(d.pdv || d.valor);
          const freteVal = parseCurrency(d.custo_frete || d.frete);
          devPdvBruto += pdvVal;
          devFreteLiquido += freteVal;
          
          let repDev = parseCurrency(d.repasse_liquido || d.repasse);
          if (isNaN(repDev) || repDev <= 0) repDev = pdvVal - (pdvVal * 0.09);
          devRepasseLiquido += repDev;

          const skuDev = normalizarSku(d.sku);
          const qtdDev = parseCurrency(d.quantidade) || 1;
          const custoProd = produtosCustoMap.get(skuDev) || { custo_unitario: 0, custo_embalagem: 0 };
          devCmvTotal += (custoProd.custo_unitario + custoProd.custo_embalagem) * qtdDev;
        }
      });

      const faturadoBrutoPuro = chSales.reduce((sum: number, s: any) => sum + s.preco_venda, 0) - devPdvBruto;
      const faturadoComRedutor = Math.max(0, faturadoBrutoPuro - cancelamentosMes);
      
      const repasseVendasCanal = chSales.reduce((sum: number, s: any) => sum + s.repasse_liquido, 0);
      const repasseLiquidoTotal = repasseVendasCanal - devRepasseLiquido;

      const canalAds = adsMap.get(kCanal) || 0;
      const cmvVendasCanal = chSales.reduce((sum: number, s: any) => sum + s.custoCMV, 0);
      const cmvCanalTotal = cmvVendasCanal + devCmvTotal;
      const flexCanal = chSales.reduce((sum: number, s: any) => sum + s.custoFlex, 0);

      const lucroLiquidoFinal = repasseLiquidoTotal - cmvCanalTotal - flexCanal - canalAds - devFreteLiquido;
      
      const metaBase = parseCurrency(goalObj.meta_valor);
      const progressoMetaPct = metaBase > 0 ? (faturadoComRedutor / metaBase) * 100 : 0;
      
      const margemBrutaPct = faturadoBrutoPuro > 0 ? (repasseLiquidoTotal / faturadoBrutoPuro) * 100 : 0;
      const margemLiquidaPct = faturadoBrutoPuro > 0 ? (lucroLiquidoFinal / faturadoBrutoPuro) * 100 : 0;

      const projecaoFaturamento = isCurrentMonth 
        ? (faturadoComRedutor / diasPassados) * totalDiasMes
        : faturadoComRedutor;
        
      const valorFaltante = Math.max(0, metaBase - faturadoComRedutor);
      const mediaDiariaNecessaria = (isCurrentMonth && valorFaltante > 0) ? valorFaltante / diasFaltantes : 0;

      const logoUrl = channelLogos[channelName] || ruleObj.logo_url || null;

      return { 
        canal: channelName, 
        responsavel: ruleObj.responsavel || goalObj.responsavel || 'Equipe Best Fit', 
        metaValor: metaBase,
        vendasDoDia,
        faturadoBruto: faturadoBrutoPuro,
        faturadoComRedutor, 
        lucroLiquidoReal: lucroLiquidoFinal, 
        progressoMetaPct, 
        margemBrutaPct, 
        margemLiquidaPct, 
        projecaoFaturamento,
        valorFaltante,
        mediaDiariaNecessaria,
        cancelamentosMes,
        devolucoesPdv: devPdvBruto,
        devolucoesFrete: devFreteLiquido,
        adsCanal: canalAds,
        flexCanal,
        cmvCanal: cmvCanalTotal,
        repasseLiquidoTotal,
        isCurrentMonth,
        logoUrl,
        isFisico: isChannelFisico(channelName)
      };
    });
  }, [enrichedSales, goals, adsMap, appliedChannelFilter, appliedModalidadeFilter, channelRules, channelLogos, currentRefMonth, canais, activeCancelados, targetDateStr, devolucoesList, produtosCustoMap]);

  const ecommerceChannels = channelAnalytics.filter(c => !c.isFisico);
  const physicalChannels = channelAnalytics.filter(c => c.isFisico);

  const totalEcommerce = useMemo(() => {
    return ecommerceChannels.reduce((acc, curr) => ({
      vendasDoDia: acc.vendasDoDia + curr.vendasDoDia,
      faturadoComRedutor: acc.faturadoComRedutor + curr.faturadoComRedutor,
      metaValor: acc.metaValor + curr.metaValor,
      projecaoFaturamento: acc.projecaoFaturamento + curr.projecaoFaturamento,
      lucroLiquidoReal: acc.lucroLiquidoReal + curr.lucroLiquidoReal
    }), { vendasDoDia: 0, faturadoComRedutor: 0, metaValor: 0, projecaoFaturamento: 0, lucroLiquidoReal: 0 });
  }, [ecommerceChannels]);

  const totalPhysical = useMemo(() => {
    return physicalChannels.reduce((acc, curr) => ({
      vendasDoDia: acc.vendasDoDia + curr.vendasDoDia,
      faturadoComRedutor: acc.faturadoComRedutor + curr.faturadoComRedutor,
      metaValor: acc.metaValor + curr.metaValor,
      projecaoFaturamento: acc.projecaoFaturamento + curr.projecaoFaturamento,
      lucroLiquidoReal: acc.lucroLiquidoReal + curr.lucroLiquidoReal
    }), { vendasDoDia: 0, faturadoComRedutor: 0, metaValor: 0, projecaoFaturamento: 0, lucroLiquidoReal: 0 });
  }, [physicalChannels]);

  const totalGeral = useMemo(() => {
    return {
      vendasDoDia: totalEcommerce.vendasDoDia + totalPhysical.vendasDoDia,
      faturadoComRedutor: totalEcommerce.faturadoComRedutor + totalPhysical.faturadoComRedutor,
      metaValor: totalEcommerce.metaValor + totalPhysical.metaValor,
      projecaoFaturamento: totalEcommerce.projecaoFaturamento + totalPhysical.projecaoFaturamento,
      lucroLiquidoReal: totalEcommerce.lucroLiquidoReal + totalPhysical.lucroLiquidoReal
    };
  }, [totalEcommerce, totalPhysical]);

  const handleEnviarEmailAlerta = () => {
    const emailsCadastrados = users && users.length > 0 
      ? users.map((u: any) => u.username).filter(Boolean).join(';') 
      : "gisele@usebestfit.com.br";
    
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const assunto = encodeURIComponent(`📊 Resumo de Vendas - Lojas Físicas e Online (${dataHoje})`);

    const hebraicaObj = channelAnalytics.find(c => c.canal.toLowerCase().includes('hebraica')) || { faturadoBruto: 0, progressoMetaPct: 0 };
    const paineirasObj = channelAnalytics.find(c => c.canal.toLowerCase().includes('paineiras')) || { faturadoBruto: 0, progressoMetaPct: 0 };
    
    const fatDigitalTotal = channelAnalytics
      .filter(c => !isChannelFisico(c.canal))
      .reduce((acc, c) => acc + c.faturadoBruto, 0);
    
    const metaDigitalTotal = channelAnalytics
      .filter(c => !isChannelFisico(c.canal))
      .reduce((acc, c) => acc + c.metaValor, 0);
    
    const progressoDigitalPct = metaDigitalTotal > 0 ? (fatDigitalTotal / metaDigitalTotal) * 100 : 0;

    let corpoTexto = `Olá, tudo bem? Segue resumo das vendas das lojas fisica e onlines do dia ${dataHoje}.\n\n`;
    corpoTexto += `Hebraica: R$ ${hebraicaObj.faturadoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${hebraicaObj.progressoMetaPct.toFixed(1)}% da meta)\n`;
    corpoTexto += `Paineiras: R$ ${paineirasObj.faturadoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${paineirasObj.progressoMetaPct.toFixed(1)}% da meta)\n`;
    corpoTexto += `E-commerce: R$ ${fatDigitalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${progressoDigitalPct.toFixed(1)}% da meta)\n\n`;
    corpoTexto += `Caso queiram visualiza-lo, acessem o link a seguir: https://dashboard-e-commerce-nine.vercel.app/\n`;

    const corpoEncoded = encodeURIComponent(corpoTexto);
    window.location.href = `mailto:${emailsCadastrados}?subject=${assunto}&body=${corpoEncoded}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center text-slate-100">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-slate-400">Carregando Dashboard Omnichannel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090e] p-6 text-slate-100 font-sans space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900 p-5 rounded-2xl border border-slate-800 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Dashboard Best Fit</h2>
          <p className="text-xs text-slate-400 mt-1">Cálculo de Margem Real = Repasse Líq - CMV - Fretes Flex (PLPs) - Devoluções - ADS</p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
          <Navbar />
          <button 
            onClick={handleEnviarEmailAlerta} 
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 transition text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer"
          >
            <i className="fa-solid fa-envelope"></i> Enviar Relatório por E-mail
          </button>

          <div className="flex gap-2 items-center bg-slate-950 p-1.5 rounded-xl border border-slate-700">
            <i className="fa-regular fa-calendar text-indigo-400 pl-2 text-xs"></i>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="bg-transparent text-indigo-300 font-bold text-xs focus:outline-none pr-1 cursor-pointer">
              <option value="MES_ATUAL" className="bg-slate-900 text-white">Mês Atual (Padrão Metas)</option>
              <option value="MES_ANTERIOR" className="bg-slate-900 text-white">Mês Anterior</option>
              <option value="HOJE" className="bg-slate-900 text-white">Hoje</option>
              <option value="SEMANA" className="bg-slate-900 text-white">Últimos 7 dias</option>
              <option value="QUINZENA" className="bg-slate-900 text-white">Últimos 15 dias</option>
              <option value="PERSONALIZADO" className="bg-slate-900 text-white">Personalizado</option>
            </select>
          </div>
          {dateFilter === 'PERSONALIZADO' && (
            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-700">
              <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="bg-transparent text-slate-300 font-bold text-xs focus:outline-none" />
              <span className="text-slate-500 text-xs font-bold">até</span>
              <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="bg-transparent text-slate-300 font-bold text-xs focus:outline-none" />
            </div>
          )}

          <div className="flex gap-2 items-center bg-slate-950 p-1.5 rounded-xl border border-slate-700">
            <i className="fa-solid fa-layer-group text-emerald-400 pl-2 text-xs"></i>
            <select value={modalidadeFilter} onChange={(e) => setModalidadeFilter(e.target.value)} className="bg-transparent text-emerald-300 font-bold text-xs focus:outline-none pr-1 cursor-pointer">
              <option value="TODAS" className="bg-slate-900 text-white">Todas as Modalidades</option>
              <option value="FISICO" className="bg-slate-900 text-white">Lojas Físicas</option>
              <option value="DIGITAL" className="bg-slate-900 text-white">E-commerce / Marketplaces</option>
            </select>
          </div>

          <div className="flex gap-2 items-center bg-slate-950 p-1.5 rounded-xl border border-slate-700">
            <i className="fa-solid fa-store text-purple-400 pl-2 text-xs"></i>
            <select value={selectedChannelFilter} onChange={(e) => setSelectedChannelFilter(e.target.value)} className="bg-transparent text-purple-300 font-bold text-xs focus:outline-none pr-1 cursor-pointer">
              <option value="TODOS" className="bg-slate-900 text-white">Todos os Canais</option>
              {canais.map((ch: string) => <option key={ch} value={ch} className="bg-slate-900 text-white">{ch}</option>)}
            </select>
          </div>

          <button onClick={handleRecalculate} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 transition text-white font-extrabold text-xs rounded-xl shadow-lg cursor-pointer">
            {isRecalculating ? 'A calcular...' : 'Recalcular'}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center bg-slate-900/60 px-5 py-3 rounded-xl border border-slate-800">
        <span className="text-xs text-slate-300 font-bold">Modo de Visualização dos Canais:</span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200 select-none">
            <input 
              type="checkbox" 
              checked={viewMode === 'cards'} 
              onChange={() => setViewMode('cards')} 
              className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
            <i className="fa-solid fa-grip text-purple-400"></i> Visualização em Cards
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200 select-none">
            <input 
              type="checkbox" 
              checked={viewMode === 'linhas'} 
              onChange={() => setViewMode('linhas')} 
              className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
            <i className="fa-solid fa-table-list text-emerald-400"></i> Visualização em Linhas (Tabela Executiva)
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between text-center">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Bruto</span>
            <h3 className="text-2xl font-black text-white mt-1">R$ {kpis.faturamentoBrutoVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <p className="text-[10px] text-slate-500 mt-1">
              {kpis.totalPedidos} itens validados
              {kpis.totalCancelamentosValor > 0 && <span className="text-rose-400 block mt-0.5">Redutor Consolidado: - R$ {kpis.totalCancelamentosValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
            </p>
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
            <div>
              <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-2">Lojas Físicas</span>
              <div className="grid grid-cols-2 gap-2">
                {kpis.lojasFisicasDetalhes.map((loja: any) => (
                  <div key={loja.nome} className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/50">
                    <span className="font-bold text-slate-200 text-xs block">{loja.nome}</span>
                    <span className="text-xs font-black text-white block mt-0.5">R$ {loja.faturado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className={`text-[9px] font-black block mt-0.5 ${loja.abaixo ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {loja.abaixo ? `▼ ${loja.diff.toFixed(1)}% abaixo` : `▲ ${loja.diff.toFixed(1)}% acima`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/50">
              <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
              <span className="text-xs font-bold text-slate-200 block">R$ {kpis.fatBrutoDigital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`text-[10px] font-black block mt-0.5 ${kpis.progressoDigitalPct >= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {kpis.progressoDigitalPct >= 100 ? `▲ ${kpis.diffDigital.toFixed(1)}% acima` : `▼ ${kpis.diffDigital.toFixed(1)}% abaixo`}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between text-center">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Repasse Total das Plataformas</span>
            <h3 className="text-2xl font-black text-purple-400 mt-1">R$ {kpis.faturamentoLiquidoRepasse.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
            <div>
              <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-1">Lojas Físicas</span>
              <span className="text-xs font-bold text-slate-200 block">R$ {kpis.repasseFisico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="pt-2 border-t border-slate-800/50">
              <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
              <span className="text-xs font-bold text-slate-200 block">R$ {kpis.repasseDigital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between text-center">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">CMV Total (Custos de SKU x Qtd)</span>
            <h3 className="text-2xl font-black text-amber-400 mt-1">R$ {kpis.custoTotalCMV.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
            <div>
              <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-1">Lojas Físicas</span>
              <span className="text-xs font-bold text-slate-200 block">R$ {kpis.cmvFisico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="pt-2 border-t border-slate-800/50">
              <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
              <span className="text-xs font-bold text-slate-200 block">R$ {kpis.cmvDigital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl border border-emerald-500/20 flex flex-col justify-between text-center">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Lucro Líquido Real</span>
            <h3 className="text-2xl font-black text-emerald-400 mt-1">R$ {kpis.lucroLiquidoReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
            <div>
              <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-1">Lojas Físicas</span>
              <span className="text-xs font-bold text-slate-200 block">R$ {kpis.lucroFisico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="pt-2 border-t border-slate-800/50">
              <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
              <span className="text-xs font-bold text-slate-200 block">R$ {kpis.lucroDigital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

      </div>

      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channelAnalytics.map((item: any) => {
            const metaBatida = item.progressoMetaPct >= 100;
            return (
              <div key={item.canal} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between hover:border-slate-700 transition duration-300 shadow-sm">
                 <div className="flex justify-between items-start border-b border-slate-800 pb-3 gap-3">
                   <div className="flex items-center gap-3">
                     {item.logoUrl ? <img src={item.logoUrl} alt={item.canal} className="w-11 h-11 rounded-xl bg-white object-contain p-1 border border-slate-700 shadow" /> : <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 text-[10px] font-bold">Logo</div>}
                     <div>
                       <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">{item.responsavel || 'Equipe'}</span>
                       <h4 className="font-black text-white text-sm tracking-tight">{item.canal}</h4>
                     </div>
                   </div>
                   
                   <div className="flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border inline-flex items-center gap-1 whitespace-nowrap ${metaBatida ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
                        {metaBatida ? <i className="fa-solid fa-arrow-trend-up"></i> : <i className="fa-solid fa-arrow-trend-down"></i>}
                        {item.progressoMetaPct.toFixed(1)}% da meta atingida
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 tracking-tight">
                        Meta: R$ {item.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-3 gap-2 bg-slate-800/30 p-3.5 rounded-xl border border-slate-700/50">
                   <div>
                     <span className="text-[9px] text-slate-300 block font-bold tracking-wider mb-0.5">FAT. BRUTO</span>
                     <strong className="text-xs font-black text-white">R$ {item.faturadoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                   </div>
                   <div>
                     <span className="text-[9px] text-sky-200 block font-bold tracking-wider mb-0.5">C/ REDUTOR</span>
                     <strong className="text-xs font-black text-sky-400">R$ {item.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                   </div>
                   <div>
                     <span className="text-[9px] text-purple-200 block font-bold tracking-wider mb-0.5">REPASSE LÍQ.</span>
                     <strong className="text-xs font-black text-purple-400">R$ {item.repasseLiquidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                   </div>
                 </div>

                 <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-xs text-slate-300">
                   <div className="flex justify-between items-center text-[10px]">
                     <span className="text-slate-400 font-bold uppercase">CMV (Custo Produtos):</span>
                     <span className="text-amber-400 font-bold">- R$ {item.cmvCanal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                   </div>
                   <div className="flex justify-between items-center text-[10px]">
                     <span className="text-slate-400 font-bold uppercase">Abatimento Devoluções (PDV):</span>
                     <span className="text-rose-400 font-bold">- R$ {item.devolucoesPdv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                   </div>
                   <div className="flex justify-between items-center text-[10px]">
                     <span className="text-slate-400 font-bold uppercase">Frete Reverso Devoluções:</span>
                     <span className="text-rose-400 font-bold">- R$ {item.devolucoesFrete.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                   </div>
                   <div className="flex justify-between items-center text-[10px]">
                     <span className="text-slate-400 font-bold uppercase">Adsense (Ads):</span>
                     <span className="text-rose-400 font-bold">- R$ {item.adsCanal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                   </div>
                   <div className="flex justify-between items-center text-[10px]">
                     <span className="text-slate-400 font-bold uppercase">Frete Flex (PLP):</span>
                     <span className="text-rose-400 font-bold">- R$ {item.flexCanal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                   </div>
                   
                   <div className="flex justify-between items-center pt-2 border-t border-slate-900 font-bold text-white">
                     <span>Lucro Líquido Real:</span>
                     <span className={item.lucroLiquidoReal >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                       R$ {item.lucroLiquidoReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </span>
                   </div>
                 </div>

                 <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] text-slate-400 font-bold uppercase">
                        {item.isCurrentMonth ? 'Projeção Fechamento:' : 'Faturamento Final:'}
                     </span>
                     <strong className="text-xs font-black text-indigo-300">R$ {item.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                   </div>

                   <div className="flex justify-between items-center pt-1 border-t border-slate-900">
                     {item.valorFaltante === 0 ? (
                       <span className="w-full text-center text-xs font-black text-emerald-400 py-0.5">🎉 Parabéns, meta batida!</span>
                     ) : (
                       <>
                         <span className="text-[10px] text-slate-400 font-bold uppercase">
                            {item.isCurrentMonth ? 'Meta Diária Restante:' : 'Faltou para a Meta:'}
                         </span>
                         <strong className="text-xs font-black text-amber-400">
                            R$ {item.isCurrentMonth 
                                ? item.mediaDiariaNecessaria.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' / dia' 
                                : item.valorFaltante.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </strong>
                       </>
                     )}
                   </div>
                   
                   {item.cancelamentosMes > 0 && (
                     <div className="flex justify-between items-center pt-1 border-t border-slate-900">
                       <span className="text-[10px] text-slate-400 font-bold uppercase">Cancelamentos do Mês:</span>
                       <strong className="text-xs font-black text-rose-400">- R$ {item.cancelamentosMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                     </div>
                   )}
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/50">
                    <div>
                      <span className="text-[10px] text-slate-300 block font-bold mb-0.5">Margem Bruta</span>
                      <strong className="text-sm font-black text-blue-400">{item.margemBrutaPct.toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-300 block font-bold mb-0.5">Margem Líquida</span>
                      <strong className="text-sm font-black text-emerald-400">{item.margemLiquidaPct.toFixed(1)}%</strong>
                    </div>
                 </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 tracking-wider">
                <tr>
                  <th className="py-4 px-6">Canal / Responsável</th>
                  <th className="py-4 px-4 text-right">{labelVendasDia}</th>
                  <th className="py-4 px-4 text-right">Total Vendas do Mês</th>
                  <th className="py-4 px-4 text-right">Meta do Mês</th>
                  <th className="py-4 px-4 text-right">Projeção do Mês</th>
                  <th className="py-4 px-4 text-center">Meta Atingida</th>
                  <th className="py-4 px-6 text-right text-emerald-400">Margem Líq.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                
                {ecommerceChannels.length > 0 && (
                  <>
                    <tr className="bg-slate-950/80 font-black text-white text-xs border-y border-slate-800">
                      <td colSpan={7} className="py-3 px-6 text-indigo-400 flex items-center gap-2">
                        <i className="fa-solid fa-globe"></i> E-COMMERCE
                      </td>
                    </tr>
                    {ecommerceChannels.map((item: any) => {
                      const metaBatida = item.progressoMetaPct >= 100;
                      return (
                        <tr key={item.canal} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-3">
                              {item.logoUrl ? <img src={item.logoUrl} alt={item.canal} className="w-8 h-8 rounded-lg bg-white object-contain p-0.5 border border-slate-700" /> : <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 text-[9px] font-bold">Logo</div>}
                              <div>
                                <span className="font-bold text-white text-xs block">{item.canal}</span>
                                <span className="text-[9px] uppercase font-bold text-slate-400">{item.responsavel}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-300">R$ {item.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-white">R$ {item.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-400">R$ {item.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-indigo-300">R$ {item.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border inline-flex items-center gap-1 ${metaBatida ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
                              {metaBatida ? <i className="fa-solid fa-arrow-trend-up"></i> : <i className="fa-solid fa-arrow-trend-down"></i>}
                              {item.progressoMetaPct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3.5 px-6 text-right font-black text-emerald-400">{item.margemLiquidaPct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-950/40 font-bold text-xs text-white border-t border-slate-800">
                      <td className="py-3 px-6 text-indigo-300">Total E-Commerce</td>
                      <td className="py-3 px-4 text-right font-mono text-indigo-300">R$ {totalEcommerce.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right text-indigo-300">R$ {totalEcommerce.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">R$ {totalEcommerce.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right text-indigo-300">R$ {totalEcommerce.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-center text-indigo-300">
                        {totalEcommerce.metaValor > 0 ? ((totalEcommerce.faturadoComRedutor / totalEcommerce.metaValor) * 100).toFixed(1) : '0.0'}%
                      </td>
                      <td className="py-3 px-6 text-right text-emerald-400">-</td>
                    </tr>
                  </>
                )}

                {physicalChannels.length > 0 && (
                  <>
                    <tr className="bg-slate-950/80 font-black text-white text-xs border-y border-slate-800">
                      <td colSpan={7} className="py-3 px-6 text-emerald-400 flex items-center gap-2">
                        <i className="fa-solid fa-store"></i> LOJAS FÍSICAS
                      </td>
                    </tr>
                    {physicalChannels.map((item: any) => {
                      const metaBatida = item.progressoMetaPct >= 100;
                      return (
                        <tr key={item.canal} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-3">
                              {item.logoUrl ? <img src={item.logoUrl} alt={item.canal} className="w-8 h-8 rounded-lg bg-white object-contain p-0.5 border border-slate-700" /> : <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 text-[9px] font-bold">Logo</div>}
                              <div>
                                <span className="font-bold text-white text-xs block">{item.canal}</span>
                                <span className="text-[9px] uppercase font-bold text-slate-400">{item.responsavel}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-300">R$ {item.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-white">R$ {item.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-400">R$ {item.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-emerald-300">R$ {item.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border inline-flex items-center gap-1 ${metaBatida ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
                              {metaBatida ? <i className="fa-solid fa-arrow-trend-up"></i> : <i className="fa-solid fa-arrow-trend-down"></i>}
                              {item.progressoMetaPct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3.5 px-6 text-right font-black text-emerald-400">{item.margemLiquidaPct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-950/40 font-bold text-xs text-white border-t border-slate-800">
                      <td className="py-3 px-6 text-emerald-300">Total Lojas Físicas</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-300">R$ {totalPhysical.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right text-emerald-300">R$ {totalPhysical.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">R$ {totalPhysical.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right text-emerald-300">R$ {totalPhysical.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-center text-emerald-300">
                        {totalPhysical.metaValor > 0 ? ((totalPhysical.faturadoComRedutor / totalPhysical.metaValor) * 100).toFixed(1) : '0.0'}%
                      </td>
                      <td className="py-3 px-6 text-right text-emerald-400">-</td>
                    </tr>
                  </>
                )}

              </tbody>

              <tfoot className="bg-slate-950 text-white font-black text-xs border-t-2 border-slate-700">
                <tr>
                  <td className="py-4 px-6">TOTAL GERAL</td>
                  <td className="py-4 px-4 text-right font-mono text-emerald-400">R$ {totalGeral.vendasDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-4 px-4 text-right text-white">R$ {totalGeral.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-4 px-4 text-right font-mono text-slate-300">R$ {totalGeral.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-4 px-4 text-right text-emerald-400">R$ {totalGeral.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-4 px-4 text-center text-purple-400">
                    {totalGeral.metaValor > 0 ? ((totalGeral.faturadoComRedutor / totalGeral.metaValor) * 100).toFixed(1) : '0.0'}%
                  </td>
                  <td className="py-4 px-6 text-right text-emerald-400">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}