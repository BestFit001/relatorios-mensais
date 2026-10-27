'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/app/components/Navbar';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [canais, setCanais] = useState<string[]>(['Mercado Livre', 'Shopee', 'Amazon', 'TikTok Shop', 'Magalu', 'Clube Hebraica', 'Clube Paineiras']);
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

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);

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

        try {
          const { data: devData } = await supabase.from('devolucoes').select('*');
          if (devData) setDbDevolucoes(devData);
        } catch (e) {}

        try {
          const { data: adsDataDb } = await supabase.from('ads_faturamento').select('*');
          if (adsDataDb) setDbAds(adsDataDb);
        } catch (e) {}

        try {
          const { data: plpData } = await supabase.from('plp_pedidos').select('*');
          if (plpData) setDbPlp(plpData);
        } catch (e) {}

        try {
          const { data: metasDb } = await supabase.from('tb_metas').select('*');
          if (metasDb) setGoals(metasDb);
        } catch (e) {}

        try {
          const { data: tarifacaoDb } = await supabase.from('config_regras_tarifacao').select('*');
          if (tarifacaoDb) setConfigTarifas(tarifacaoDb);
        } catch (e) {}

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
        console.error("Erro ao carregar dados:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
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
    if (appliedDateFilter === 'PERSONALIZADO' && appliedStartDate) return appliedStartDate.slice(0, 7);
    if (appliedDateFilter === 'MES_ANTERIOR') return previousMonthDefault;
    return currentMonthDefault;
  }, [appliedDateFilter, appliedStartDate, currentMonthDefault, previousMonthDefault]);

  const enrichedSales = useMemo(() => {
    return [];
  }, [appliedChannelFilter, appliedModalidadeFilter, appliedDateFilter, appliedStartDate, appliedEndDate, dbCustosMap, dbPlp, configTarifas, currentMonthDefault, previousMonthDefault]);

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

    const progressoDigitalPct = 0;
    const diffDigital = 100;

    const safeAds = Array.isArray(dbAds) ? dbAds : [];
    const filteredAds = safeAds.filter((a: any) => 
      a && (a.mes_referencia === currentRefMonth || !a.mes_referencia) && 
      (appliedChannelFilter === 'TODOS' || a.canal === appliedChannelFilter)
    );
    const totalAdsCost = filteredAds.reduce((sum: number, a: any) => sum + parseCurrency(a?.custo_ads ?? a?.valor ?? a?.ads), 0);
    
    const lucroLiquidoReal = faturamentoLiquidoRepasse - custoTotalCMV - 0 - totalAdsCost;
    const lucroFisico = repasseFisico - cmvFisico;
    const lucroDigital = repasseDigital - cmvDigital - 0 - totalAdsCost;

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

    const [refAnoStr, refMesStr] = currentRefMonth.split('-');
    const refAno = parseInt(refAnoStr, 10);
    const refMes = parseInt(refMesStr, 10) - 1;

    const now = new Date();
    const isCurrentMonth = (now.getFullYear() === refAno && now.getMonth() === refMes);
    const totalDiasMes = new Date(refAno, refMes + 1, 0).getDate();
    
    const safeDevs = Array.isArray(dbDevolucoes) ? dbDevolucoes : [];
    const safeAds = Array.isArray(dbAds) ? dbAds : [];
    const safeGoals = Array.isArray(goals) ? goals : [];
    const safeRules = Array.isArray(channelRules) ? channelRules : [];

    return channelsToAnalyze.map(channelName => {
      const ruleObj = safeRules.find((r: any) => r && r.canal === channelName) || {};
      const goalObj = safeGoals.find((g: any) => g && g.canal === channelName && g.mes_referencia === currentRefMonth) 
                   || safeGoals.find((g: any) => g && g.canal === channelName) 
                   || { meta_valor: 0, responsavel: ruleObj.responsavel || 'Equipe Best Fit' };

      const devolucoesMes = safeDevs
        .filter((c: any) => c && String(c.canal || c.marketplace || '').toLowerCase() === String(channelName).toLowerCase())
        .reduce((sum: number, c: any) => sum + parseCurrency(c?.valor ?? c?.valor_devolucao), 0);

      const faturadoBrutoPuro = 0;
      const faturadoComRedutor = 0;
      const metaBase = parseCurrency(goalObj?.meta_valor);
      const logoUrl = ruleObj.logo_url || null;

      return { 
        canal: channelName, 
        responsavel: ruleObj.responsavel || goalObj?.responsavel || 'Equipe Best Fit', 
        metaValor: metaBase,
        vendasDoDia: 0,
        faturadoBruto: faturadoBrutoPuro,
        faturadoComRedutor, 
        lucroLiquidoFinal: 0, 
        progressoMetaPct: 0, 
        margemBrutaPct: 0, 
        margemLiquidaPct: 0, 
        projecaoFaturamento: 0,
        valorFaltante: metaBase,
        mediaDiariaNecessaria: 0,
        cancelamentosMes: devolucoesMes,
        isCurrentMonth,
        logoUrl,
        isFisico: isChannelFisico(channelName)
      };
    });
  }, [enrichedSales, goals, dbAds, dbDevolucoes, appliedChannelFilter, appliedModalidadeFilter, channelRules, currentRefMonth, canais]);

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
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Dashboard Omnichannel</h1>
            <p className="text-sm font-medium text-slate-400">Visão consolidada (Vendas Lives Isoladas e Ignoradas)</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-xl gap-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Dashboard Best Fit</h2>
            <p className="text-xs text-slate-400 mt-0.5">Cálculo de Margem Real = Repasse Líq - CMV - PLP - Adsense</p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
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
                <option value="SELECIONE" className="bg-slate-900 text-slate-500">Selecione...</option>
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

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between text-center shadow-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Bruto</span>
              <h3 className="text-2xl font-black text-white mt-1">R$ {kpis.faturamentoBrutoVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
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

      </div>
    </div>
  );
}