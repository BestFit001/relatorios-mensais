'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/app/components/Navbar';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [canais, setCanais] = useState<string[]>(['Mercado Livre 1', 'Mercado Livre 2', 'Shopee', 'Amazon', 'TikTok', 'Magalu', 'Shein', 'Netshoes', 'Site', 'Centauro', 'Clube Hebraica', 'Clube Paineiras']);
  const [adminSales, setAdminSales] = useState<any[]>([]);
  const [faturadosIds, setFaturadosIds] = useState<Set<string>>(new Set());
  const [goals, setGoals] = useState<any[]>([]);
  const [channelRules, setChannelRules] = useState<any[]>([]);
  
  const [selectedChannelFilter, setSelectedChannelFilter] = useState('TODOS');
  const [appliedChannelFilter, setAppliedChannelFilter] = useState('TODOS');
  
  const [modalidadeFilter, setModalidadeFilter] = useState('SELECIONE');
  const [appliedModalidadeFilter, setAppliedModalidadeFilter] = useState('SELECIONE');

  const [viewMode, setViewMode] = useState<'cards' | 'linhas'>('cards');

  const [dbCustosMap, setDbCustosMap] = useState<Map<string, number>>(new Map());
  const [dbDevolucoes, setDbDevolucoes] = useState<any[]>([]);
  const [dbAds, setDbAds] = useState<any[]>([]);
  const [dbPlp, setDbPlp] = useState<any[]>([]);
  const [configTarifas, setConfigTarifas] = useState<any[]>([]);

  const currentMonthDefault = "10/2026";
  const previousMonthDefault = "09/2026";

  const [dateFilter, setDateFilter] = useState('MES_ATUAL');
  const [customStartDate, setCustomStartDate] = useState('2026-10-01');
  const [customEndDate, setCustomEndDate] = useState('2026-10-31');
  
  const [appliedDateFilter, setAppliedDateFilter] = useState('MES_ATUAL');
  const [appliedStartDate, setAppliedStartDate] = useState('2026-10-01');
  const [appliedEndDate, setAppliedEndDate] = useState('2026-10-31');
  
  const [isRecalculating, setIsRecalculating] = useState(false);

  useEffect(() => {
    async function fetchAdminData() {
      try {
        setLoading(true);

        // 1. Custos de SKUs
        let allCustos: any[] = [];
        let from = 0;
        const step = 1000;
        let keep = true;
        while (keep) {
          const { data } = await supabase.from('tabela_custos_skus').select('*').range(from, from + step - 1);
          if (data && data.length > 0) {
            allCustos = [...allCustos, ...data];
            from += step;
            if (data.length < step) keep = false;
          } else keep = false;
        }

        const cMap = new Map();
        allCustos.forEach((c: any) => {
          const skuNorm = String(c.sku || '').trim().toLowerCase();
          const custoUni = Number(c.custo_unitario ?? c.custo ?? 0) || 0;
          if (skuNorm) cMap.set(skuNorm, custoUni);
        });
        setDbCustosMap(cMap);

        // 2. IDs de faturados
        try {
          const { data: fatData } = await supabase.from('faturados').select('id_pedido');
          if (fatData) {
            setFaturadosIds(new Set(fatData.map((f: any) => String(f.id_pedido).trim())));
          }
        } catch (e) {}

        // 3. Vendas da tabela oficial vendas_padrao_lancamentos
        try {
          const { data: vendasAdmin } = await supabase.from('vendas_padrao_lancamentos').select('*');
          if (vendasAdmin) setAdminSales(vendasAdmin);
        } catch (e) {}

        // 4. Devoluções
        try {
          const { data: devData } = await supabase.from('devolucoes').select('*');
          if (devData) setDbDevolucoes(devData);
        } catch (e) {}

        // 5. Ads
        try {
          const { data: adsDataDb } = await supabase.from('ads_faturamento').select('*');
          if (adsDataDb) setDbAds(adsDataDb);
        } catch (e) {}

        // 6. PLPs
        try {
          const { data: plpData } = await supabase.from('plp_pedidos').select('*');
          if (plpData) setDbPlp(plpData);
        } catch (e) {}

        // 7. Metas
        try {
          const { data: metasDb } = await supabase.from('tb_metas').select('*');
          if (metasDb) setGoals(metasDb);
        } catch (e) {}

        // 8. Tarifas
        try {
          const { data: tarifacaoDb } = await supabase.from('config_regras_tarifacao').select('*');
          if (tarifacaoDb) setConfigTarifas(tarifacaoDb);
        } catch (e) {}

        // 9. Canais
        try {
          const { data: regrasDb } = await supabase.from('config_regras_tiny').select('*');
          if (regrasDb && regrasDb.length > 0) {
            setChannelRules(regrasDb);
            const canalCfg = regrasDb.find((r: any) => r.campo === 'canais_dashboard');
            if (canalCfg && canalCfg.coluna) {
              try {
                const parsedCanais = JSON.parse(canalCfg.coluna);
                if (Array.isArray(parsedCanais) && parsedCanais.length > 0) {
                  const baseObrigatoria = ['Clube Hebraica', 'Clube Paineiras'];
                  setCanais(Array.from(new Set([...parsedCanais, ...baseObrigatoria])));
                }
              } catch (err) {}
            }
          }
        } catch (e) {}

      } catch (err) {
        console.error("Erro ao carregar dados do Supabase:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAdminData();
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

  const isChannelFisico = (canalName: string) => {
    const nome = String(canalName || '').toLowerCase();
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

  const currentRefMonth = useMemo(() => {
    return currentMonthDefault;
  }, [currentMonthDefault]);

  // Cruzamento das vendas da tabela vendas_padrao_lancamentos
  const enrichedSales = useMemo(() => {
    const safeSales = Array.isArray(adminSales) ? adminSales : [];

    return safeSales.filter((s: any) => {
        if (!s) return false;

        if (appliedChannelFilter !== 'TODOS' && s.canal !== appliedChannelFilter) return false;

        const fisico = isChannelFisico(s.canal);
        if (appliedModalidadeFilter === 'FISICO' && !fisico) return false;
        if (appliedModalidadeFilter === 'DIGITAL' && fisico) return false;

        return true;
      })
      .map((s: any) => {
        const skuNorm = String(s.sku || '').trim().toLowerCase();
        const qtd = parseCurrency(s.quantidade) || 1;
        const custoUnitarioPadrao = dbCustosMap.get(skuNorm) || parseCurrency(s.custo) || 0;
        const custoCMV = custoUnitarioPadrao * qtd;

        const safePlp = Array.isArray(dbPlp) ? dbPlp : [];
        const plpOrder = safePlp.find((f: any) => f && String(f.id_pedido || f.pedido_id) === String(s.id_pedido));
        const custoPlp = plpOrder ? parseCurrency(plpOrder.valor_frete ?? plpOrder.frete ?? plpOrder.valor) : 0;
        
        const precoVenda = parseCurrency(s.valor || s.preco_venda || s.pdv);
        let repasseLiquido = parseCurrency(s.repasse_liquido || s.repasse);

        if (repasseLiquido <= 0) {
          repasseLiquido = precoVenda;
        }

        const ganhoBruto = repasseLiquido - custoCMV; 
        const ganhoLiquido = ganhoBruto - custoPlp;
        
        return { 
          ...s, 
          preco_venda: precoVenda,
          custoCMV, 
          custoPlp, 
          ganhoLiquido, 
          repasse_liquido: repasseLiquido 
        };
      });
  }, [adminSales, appliedChannelFilter, appliedModalidadeFilter, dbCustosMap, dbPlp, configTarifas]);

  const kpis = useMemo(() => {
    const safeCanais = Array.isArray(canais) ? canais : [];
    const activeChannels = Array.from(new Set([...safeCanais, 'Clube Hebraica', 'Clube Paineiras']));
    
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

    const safeDevs = Array.isArray(dbDevolucoes) ? dbDevolucoes : [];
    const totalDevolucoesValor = safeDevs.reduce((sum: number, c: any) => sum + parseCurrency(c?.valor ?? c?.valor_devolucao ?? c?.preco_venda), 0);
    const lojasFisicasDetalhes: any[] = [];
    const lojasFisicasRepasse: any[] = [];
    const safeGoals = Array.isArray(goals) ? goals : [];

    activeChannels.forEach(channelName => {
      const fisico = isChannelFisico(channelName);
      const goalObj = safeGoals.find((g: any) => g && g.canal === channelName && g.mes_referencia === currentRefMonth) 
                   || safeGoals.find((g: any) => g && g.canal === channelName) 
                   || { meta_valor: 0 };
      const metaCanal = parseCurrency(goalObj?.meta_valor);

      const chSales = enrichedSales.filter((s: any) => s && s.canal === channelName);
      
      const devCanal = safeDevs
        .filter((c: any) => c && String(c.canal || c.marketplace).toLowerCase() === String(channelName).toLowerCase())
        .reduce((sum: number, c: any) => sum + parseCurrency(c?.valor ?? c?.valor_devolucao), 0);

      const faturadoPuroCanal = chSales.reduce((sum: number, s: any) => sum + (s?.preco_venda || 0), 0);
      const faturadoEfetivoCanal = Math.max(0, faturadoPuroCanal - devCanal);
      const repasseCanal = chSales.reduce((sum: number, s: any) => sum + (s?.repasse_liquido || 0), 0);

      let nomeLimpo = String(channelName || '').replace(/clube|loja/gi, '').trim();
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
      if (!s) return;
      const fisico = isChannelFisico(s.canal);
      const valBruto = s.preco_venda || 0;
      const valRepasse = s.repasse_liquido || 0;
      const valCmv = s.custoCMV || 0;

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

    faturamentoBrutoVendas = Math.max(0, faturamentoBrutoVendas - totalDevolucoesValor);

    const devDigitais = safeDevs
        .filter((c: any) => c && !isChannelFisico(c.canal || c.marketplace))
        .reduce((sum: number, c: any) => sum + parseCurrency(c?.valor ?? c?.valor_devolucao), 0);
    
    fatBrutoDigital = Math.max(0, fatBrutoDigital - devDigitais);

    const progressoDigitalPct = metaDigitalTotal > 0 ? (fatBrutoDigital / metaDigitalTotal) * 100 : 0;
    const diffDigital = Math.abs(progressoDigitalPct - 100);

    const totalPlpCost = enrichedSales.reduce((sum: number, s: any) => sum + (s?.custoPlp || 0), 0);
    
    const safeAds = Array.isArray(dbAds) ? dbAds : [];
    const filteredAds = safeAds.filter((a: any) => 
      a && (a.mes_referencia === currentRefMonth || !a.mes_referencia) && 
      (appliedChannelFilter === 'TODOS' || a.canal === appliedChannelFilter)
    );
    const totalAdsCost = filteredAds.reduce((sum: number, a: any) => sum + parseCurrency(a?.custo_ads ?? a?.valor ?? a?.ads), 0);
    
    const lucroLiquidoReal = faturamentoLiquidoRepasse - custoTotalCMV - totalPlpCost - totalAdsCost;
    const lucroFisico = repasseFisico - cmvFisico;
    const lucroDigital = repasseDigital - cmvDigital - totalPlpCost - totalAdsCost;

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
      totalDevolucoesValor
    };
  }, [enrichedSales, dbAds, dbDevolucoes, appliedChannelFilter, canais, channelRules, goals, currentRefMonth]);

  const { targetDateStr, labelVendasDia } = useMemo(() => {
    return {
      targetDateStr: '2026-10-26',
      labelVendasDia: 'Vendas do Dia'
    };
  }, []);

  const channelAnalytics = useMemo(() => {
    const safeCanais = Array.isArray(canais) ? canais : [];
    const activeChannels = Array.from(new Set([...safeCanais, 'Clube Hebraica', 'Clube Paineiras']));
    
    let channelsToAnalyze = appliedChannelFilter === 'TODOS' ? activeChannels : activeChannels.filter(c => c === appliedChannelFilter);

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

    const safeDevs = Array.isArray(dbDevolucoes) ? dbDevolucoes : [];
    const safeAds = Array.isArray(dbAds) ? dbAds : [];
    const safeGoals = Array.isArray(goals) ? goals : [];
    const safeRules = Array.isArray(channelRules) ? channelRules : [];

    return channelsToAnalyze.map(channelName => {
      const chSales = enrichedSales.filter((s: any) => s && s.canal === channelName);
      
      const vendasDoDia = chSales
        .reduce((sum: number, s: any) => sum + (s?.preco_venda || 0), 0);

      const ruleObj = safeRules.find((r: any) => r && r.canal === channelName) || {};
      const goalObj = safeGoals.find((g: any) => g && g.canal === channelName) || { meta_valor: 0, responsavel: 'Equipe Best Fit' };

      const devolucoesMes = safeDevs
        .filter((c: any) => c && String(c.canal || c.marketplace || '').toLowerCase() === String(channelName).toLowerCase())
        .reduce((sum: number, c: any) => sum + parseCurrency(c?.valor ?? c?.valor_devolucao), 0);

      const faturadoBrutoPuro = chSales.reduce((sum: number, s: any) => sum + (s?.preco_venda || 0), 0);
      const faturadoComRedutor = Math.max(0, faturadoBrutoPuro - devolucoesMes);
      const repasseTotal = chSales.reduce((sum: number, s: any) => sum + (s?.repasse_liquido || 0), 0);
      
      const canalAds = safeAds
        .filter((a: any) => a && (a.canal === channelName))
        .reduce((sum: number, a: any) => sum + parseCurrency(a?.custo_ads ?? a?.valor ?? a?.ads), 0);

      const cmvCanal = chSales.reduce((sum: number, s: any) => sum + (s?.custoCMV || 0), 0);
      const plpCanal = chSales.reduce((sum: number, s: any) => sum + (s?.custoPlp || 0), 0);

      const lucroLiquidoFinal = repasseTotal - cmvCanal - plpCanal - canalAds;
      
      const metaBase = parseCurrency(goalObj?.meta_valor);
      const progressoMetaPct = metaBase > 0 ? (faturadoComRedutor / metaBase) * 100 : 0;
      
      const margemBrutaPct = faturadoBrutoPuro > 0 ? (repasseTotal / faturadoBrutoPuro) * 100 : 0;
      const margemLiquidaPct = faturadoBrutoPuro > 0 ? (lucroLiquidoFinal / faturadoBrutoPuro) * 100 : 0;

      const projecaoFaturamento = faturadoComRedutor;
      const valorFaltante = Math.max(0, metaBase - faturadoComRedutor);
      const mediaDiariaNecessaria = 0;

      const logoUrl = ruleObj.logo_url || null;

      return { 
        canal: channelName, 
        responsavel: ruleObj.responsavel || goalObj?.responsavel || 'Equipe Best Fit', 
        metaValor: metaBase,
        vendasDoDia,
        faturadoBruto: faturadoBrutoPuro,
        faturadoComRedutor, 
        lucroLiquidoFinal, 
        progressoMetaPct, 
        margemBrutaPct, 
        margemLiquidaPct, 
        projecaoFaturamento,
        valorFaltante,
        mediaDiariaNecessaria,
        cancelamentosMes: devolucoesMes,
        isCurrentMonth: true,
        logoUrl,
        isFisico: isChannelFisico(channelName)
      };
    });
  }, [enrichedSales, goals, dbAds, dbDevolucoes, appliedChannelFilter, appliedModalidadeFilter, channelRules, canais]);

  const ecommerceChannels = channelAnalytics.filter(c => !c.isFisico);
  const physicalChannels = channelAnalytics.filter(c => c.isFisico);

  const totalEcommerce = useMemo(() => {
    return ecommerceChannels.reduce((acc, curr) => ({
      vendasDoDia: acc.vendasDoDia + curr.vendasDoDia,
      faturadoComRedutor: acc.faturadoComRedutor + curr.faturadoComRedutor,
      metaValor: acc.metaValor + curr.metaValor,
      projecaoFaturamento: acc.projecaoFaturamento + curr.projecaoFaturamento,
      lucroLiquidoFinal: acc.lucroLiquidoFinal + curr.lucroLiquidoFinal
    }), { vendasDoDia: 0, faturadoComRedutor: 0, metaValor: 0, projecaoFaturamento: 0, lucroLiquidoFinal: 0 });
  }, [ecommerceChannels]);

  const totalPhysical = useMemo(() => {
    return physicalChannels.reduce((acc, curr) => ({
      vendasDoDia: acc.vendasDoDia + curr.vendasDoDia,
      faturadoComRedutor: acc.faturadoComRedutor + curr.faturadoComRedutor,
      metaValor: acc.metaValor + curr.metaValor,
      projecaoFaturamento: acc.projecaoFaturamento + curr.projecaoFaturamento,
      lucroLiquidoFinal: acc.lucroLiquidoFinal + curr.lucroLiquidoFinal
    }), { vendasDoDia: 0, faturadoComRedutor: 0, metaValor: 0, projecaoFaturamento: 0, lucroLiquidoFinal: 0 });
  }, [physicalChannels]);

  const totalGeral = useMemo(() => {
    return {
      vendasDoDia: totalEcommerce.vendasDoDia + totalPhysical.vendasDoDia,
      faturadoComRedutor: totalEcommerce.faturadoComRedutor + totalPhysical.faturadoComRedutor,
      metaValor: totalEcommerce.metaValor + totalPhysical.metaValor,
      projecaoFaturamento: totalEcommerce.projecaoFaturamento + totalPhysical.projecaoFaturamento,
      lucroLiquidoFinal: totalEcommerce.lucroLiquidoFinal + totalPhysical.lucroLiquidoFinal
    };
  }, [totalEcommerce, totalPhysical]);

  const handleEnviarEmailAlerta = () => {
    const emailsCadastrados = "gisele@usebestfit.com.br";
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const assunto = encodeURIComponent(`📊 Resumo de Vendas - Lojas Físicas e Online (${dataHoje})`);
    window.location.href = `mailto:${emailsCadastrados}?subject=${assunto}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] p-8 text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-slate-400">A carregar dados do Supabase...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090e] p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Dashboard Omnichannel</h1>
            <p className="text-sm font-medium text-slate-400">Visão consolidada consultando Supabase (vendas_padrao_lancamentos)</p>
          </div>
          <Navbar />
        </div>

        {/* BARRA DE FILTROS SUPERIOR */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-xl gap-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Dashboard Best Fit</h2>
            <p className="text-xs text-slate-400 mt-0.5">Cálculo de Margem Real = Repasse Líq - CMV - PLP - Adsense</p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
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
              </select>
            </div>

            <div className="flex gap-2 items-center bg-slate-950 p-1.5 rounded-xl border border-slate-700">
              <i className="fa-solid fa-layer-group text-emerald-400 pl-2 text-xs"></i>
              <select value={modalidadeFilter} onChange={(e) => setModalidadeFilter(e.target.value)} className="bg-transparent text-emerald-300 font-bold text-xs focus:outline-none pr-1 cursor-pointer">
                <option value="SELECIONE" className="bg-slate-900 text-slate-500">Selecione...</option>
                <option value="TODOS" className="bg-slate-900 text-white">Todas as Modalidades</option>
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

        {/* MODO DE VISUALIZAÇÃO */}
        <div className="flex justify-between items-center bg-slate-900/90 px-5 py-3 rounded-2xl border border-slate-800/80 shadow-lg">
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

        {/* 4 CARDS PRINCIPAIS */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between text-center shadow-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Bruto</span>
              <h3 className="text-2xl font-black text-white mt-1">R$ {kpis.faturamentoBrutoVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
              <p className="text-[10px] text-slate-500 mt-1">{kpis.totalPedidos} itens validados</p>
            </div>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between text-center shadow-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Repasse Total das Plataformas</span>
              <h3 className="text-2xl font-black text-purple-400 mt-1">R$ {kpis.faturamentoLiquidoRepasse.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
          </div>
          
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between text-center shadow-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">CMV Total (Padrão Atual)</span>
              <h3 className="text-2xl font-black text-amber-400 mt-1">R$ {kpis.custoTotalCMV.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/30 flex flex-col justify-between text-center shadow-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Lucro Líquido Real</span>
              <h3 className="text-2xl font-black text-emerald-400 mt-1">R$ {kpis.lucroLiquidoReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
          </div>

        </div>

        {/* LISTAGEM DE CANAIS / LOJAS */}
        {appliedModalidadeFilter === 'SELECIONE' ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 bg-slate-900/60 rounded-2xl border border-slate-800 border-dashed shadow-xl">
            <i className="fa-solid fa-layer-group text-4xl text-slate-700 mb-4"></i>
            <p className="text-slate-400 text-sm font-bold text-center leading-relaxed">
              Selecione uma modalidade (Todas, Lojas Físicas ou E-commerce)<br/> 
              no filtro acima e clique em "Recalcular" para ver o detalhamento por canal.
            </p>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channelAnalytics.map((item: any) => {
              const metaBatida = item.progressoMetaPct >= 100;
              return (
                <div key={item.canal} className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 space-y-4 flex flex-col justify-between shadow-xl">
                   <div className="flex justify-between items-start border-b border-slate-800 pb-3 gap-3">
                     <div className="flex items-center gap-3">
                       <div>
                         <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">{item.responsavel}</span>
                         <h4 className="font-black text-white text-sm tracking-tight">{item.canal}</h4>
                       </div>
                     </div>
                     
                     <div className="flex flex-col items-end gap-1">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border inline-flex items-center gap-1 whitespace-nowrap ${metaBatida ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
                          {metaBatida ? <i className="fa-solid fa-arrow-trend-up"></i> : <i className="fa-solid fa-arrow-trend-down"></i>}
                          {item.progressoMetaPct.toFixed(1)}% da meta
                        </span>
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                     <div>
                       <span className="text-[9px] text-slate-400 block font-bold tracking-wider mb-0.5">FAT. BRUTO</span>
                       <strong className="text-xs font-black text-white">R$ {item.faturadoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                     </div>
                     <div>
                       <span className="text-[9px] text-sky-300 block font-bold tracking-wider mb-0.5">C/ REDUTOR</span>
                       <strong className="text-xs font-black text-sky-400">R$ {item.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                     </div>
                     <div>
                       <span className="text-[9px] text-purple-300 block font-bold tracking-wider mb-0.5">MARGEM LÍQ.</span>
                       <strong className="text-xs font-black text-purple-400">{item.margemLiquidaPct.toFixed(1)}%</strong>
                     </div>
                   </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 tracking-wider">
                  <tr>
                    <th className="py-4 px-6">Canal / Responsável</th>
                    <th className="py-4 px-4 text-right">Total Vendas do Mês</th>
                    <th className="py-4 px-4 text-right">Meta do Mês</th>
                    <th className="py-4 px-4 text-center">Meta Atingida</th>
                    <th className="py-4 px-6 text-right text-emerald-400">Margem Líq.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {channelAnalytics.map((item: any) => {
                    const metaBatida = item.progressoMetaPct >= 100;
                    return (
                      <tr key={item.canal} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-6">
                          <span className="font-bold text-white text-xs block">{item.canal}</span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-white">R$ {item.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-400">R$ {item.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${metaBatida ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
                            {item.progressoMetaPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right font-black text-emerald-400">{item.margemLiquidaPct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}