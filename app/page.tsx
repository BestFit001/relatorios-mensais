'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/app/components/Navbar';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [canais, setCanais] = useState<string[]>(['Mercado Livre', 'Shopee', 'Amazon', 'TikTok Shop', 'Magalu', 'Clube Hebraica', 'Clube Paineiras']);
  const [dadosCurvaAbc, setDadosCurvaAbc] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [channelRules, setChannelRules] = useState<any[]>([]);
  
  const [selectedChannelFilter, setSelectedChannelFilter] = useState('TODOS');
  const [appliedChannelFilter, setAppliedChannelFilter] = useState('TODOS');
  
  const [modalidadeFilter, setModalidadeFilter] = useState('SELECIONE');
  const [appliedModalidadeFilter, setAppliedModalidadeFilter] = useState('SELECIONE');

  const [viewMode, setViewMode] = useState<'cards' | 'linhas'>('cards');

  const [dbCustosMap, setDbCustosMap] = useState<Map<string, number>>(new Map());
  const [dbDevolucoes, setDbDevolucoes] = useState<any[]>([]);
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
    async function fetchAllDataFromOtherTabs() {
      try {
        setLoading(true);

        // 1. Puxa os Custos Unitários da aba de Custos por SKU
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

        // 2. Puxa os dados da Curva ABC gerada na aba de Relatórios (Upload)
        try {
          const { data: abcData } = await supabase.from('curva_abc').select('*');
          if (abcData) setDadosCurvaAbc(abcData);
        } catch (e) {}

        // 3. Puxa Devoluções/Cancelados
        try {
          const { data: devData } = await supabase.from('devolucoes').select('*');
          if (devData) setDbDevolucoes(devData);
        } catch (e) {}

        // 4. Puxa Metas da aba Regras
        try {
          const { data: metasDb } = await supabase.from('tb_metas').select('*');
          if (metasDb) setGoals(metasDb);
        } catch (e) {}

        // 5. Puxa Tarifas configuradas na aba Regras
        try {
          const { data: tarifacaoDb } = await supabase.from('config_regras_tarifacao').select('*');
          if (tarifacaoDb) setConfigTarifas(tarifacaoDb);
        } catch (e) {}

        // 6. Puxa Canais cadastrados na aba Regras
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
        console.error("Erro ao carregar dados das outras abas:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAllDataFromOtherTabs();
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

  // Consolidado real puxado estritamente das planilhas upadas (Curva ABC + Custos)
  const consolidatedMetrics = useMemo(() => {
    const safeAbc = Array.isArray(dadosCurvaAbc) ? dadosCurvaAbc : [];
    
    // Filtra pela competência selecionada se aplicável
    const filteredAbc = safeAbc.filter((item: any) => {
      if (!item.mes_referencia) return true;
      const [mesRef, anoRef] = item.mes_referencia.split('/');
      const compStr = `${anoRef}-${mesRef}`;
      if (appliedDateFilter === 'MES_ATUAL' && compStr !== currentMonthDefault) return false;
      if (appliedDateFilter === 'MES_ANTERIOR' && compStr !== previousMonthDefault) return false;
      return true;
    });

    let faturamentoBrutoVendas = 0;
    let faturamentoLiquidoRepasse = 0;
    let custoTotalCMV = 0;
    let totalItens = 0;

    filteredAbc.forEach((item: any) => {
      const qtd = Number(item.quantidade) || 0;
      const valTotal = Number(item.valor) || 0;
      const skuNorm = String(item.codigo || '').trim().toLowerCase();
      
      const custoUni = dbCustosMap.get(skuNorm) || 0;
      const cmvItem = custoUni * qtd;

      faturamentoBrutoVendas += valTotal;
      custoTotalCMV += cmvItem;
      totalItens += qtd;

      const regraFaixa = configTarifas.find((t: any) => t.canal === appliedChannelFilter || t.canal === 'Geral');
      let repasseItem = valTotal;
      if (regraFaixa) {
        const comissaoPct = Number(regraFaixa.comissao) || 0;
        const tarifaFixa = Number(regraFaixa.tarifa_fixa) || 0;
        const freteRegra = Number(regraFaixa.frete) || 0;
        repasseItem = Math.max(0, valTotal - (valTotal * (comissaoPct / 100)) - tarifaFixa - freteRegra);
      }
      faturamentoLiquidoRepasse += repasseItem;
    });

    const lucroLiquidoReal = faturamentoLiquidoRepasse - custoTotalCMV;

    return {
      faturamentoBrutoVendas,
      faturamentoLiquidoRepasse,
      custoTotalCMV,
      lucroLiquidoReal,
      totalItens
    };
  }, [dadosCurvaAbc, dbCustosMap, configTarifas, appliedChannelFilter, appliedDateFilter, currentMonthDefault, previousMonthDefault]);

  const kpis = useMemo(() => {
    const safeCanais = Array.isArray(canais) ? canais : [];
    const activeChannels = Array.from(new Set([...safeCanais, 'Clube Hebraica', 'Clube Paineiras']));
    
    let metaDigitalTotal = 0;
    const lojasFisicasDetalhes: any[] = [];
    const safeGoals = Array.isArray(goals) ? goals : [];

    activeChannels.forEach(channelName => {
      const fisico = isChannelFisico(channelName);
      const goalObj = safeGoals.find((g: any) => g && g.canal === channelName && g.mes_referencia === currentRefMonth) 
                   || safeGoals.find((g: any) => g && g.canal === channelName) 
                   || { meta_valor: 0 };
      const metaCanal = parseCurrency(goalObj?.meta_valor);

      let nomeLimpo = String(channelName || '').replace(/clube|loja/gi, '').trim();
      if (!nomeLimpo) nomeLimpo = channelName;

      if (fisico) {
        lojasFisicasDetalhes.push({
          nome: nomeLimpo,
          faturado: 0,
          progresso: 0,
          diff: 100,
          abaixo: true
        });
      } else {
        metaDigitalTotal += metaCanal;
      }
    });

    const fatBrutoDigital = consolidatedMetrics.faturamentoBrutoVendas;
    const progressoDigitalPct = metaDigitalTotal > 0 ? (fatBrutoDigital / metaDigitalTotal) * 100 : 0;
    const diffDigital = Math.abs(progressoDigitalPct - 100);

    return { 
      faturamentoBrutoVendas: consolidatedMetrics.faturamentoBrutoVendas, 
      fatBrutoFisico: 0,
      fatBrutoDigital,
      faturamentoLiquidoRepasse: consolidatedMetrics.faturamentoLiquidoRepasse, 
      repasseFisico: 0,
      repasseDigital: consolidatedMetrics.faturamentoLiquidoRepasse,
      custoTotalCMV: consolidatedMetrics.custoTotalCMV, 
      cmvFisico: 0,
      cmvDigital: consolidatedMetrics.custoTotalCMV,
      lucroLiquidoReal: consolidatedMetrics.lucroLiquidoReal, 
      lucroFisico: 0,
      lucroDigital: consolidatedMetrics.lucroLiquidoReal,
      totalPedidos: consolidatedMetrics.totalItens,
      lojasFisicasDetalhes,
      progressoDigitalPct,
      diffDigital,
      totalDevolucoesValor: 0
    };
  }, [consolidatedMetrics, goals, canais, currentRefMonth]);

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

    const safeGoals = Array.isArray(goals) ? goals : [];
    const safeRules = Array.isArray(channelRules) ? channelRules : [];

    return channelsToAnalyze.map(channelName => {
      const ruleObj = safeRules.find((r: any) => r && r.canal === channelName) || {};
      const goalObj = safeGoals.find((g: any) => g && g.canal === channelName && g.mes_referencia === currentRefMonth) 
                   || safeGoals.find((g: any) => g && g.canal === channelName) 
                   || { meta_valor: 0, responsavel: ruleObj.responsavel || 'Equipe Best Fit' };

      const metaBase = parseCurrency(goalObj?.meta_valor);
      const fatBruto = (appliedChannelFilter === 'TODOS' || appliedChannelFilter === channelName) ? consolidatedMetrics.faturamentoBrutoVendas : 0;
      const repasseTot = (appliedChannelFilter === 'TODOS' || appliedChannelFilter === channelName) ? consolidatedMetrics.faturamentoLiquidoRepasse : 0;
      const lucroFinal = (appliedChannelFilter === 'TODOS' || appliedChannelFilter === channelName) ? consolidatedMetrics.lucroLiquidoReal : 0;

      const progressoMetaPct = metaBase > 0 ? (fatBruto / metaBase) * 100 : 0;
      const margemBrutaPct = fatBruto > 0 ? (repasseTot / fatBruto) * 100 : 0;
      const margemLiquidaPct = fatBruto > 0 ? (lucroFinal / fatBruto) * 100 : 0;

      return { 
        canal: channelName, 
        responsavel: ruleObj.responsavel || goalObj?.responsavel || 'Equipe Best Fit', 
        metaValor: metaBase,
        vendasDoDia: 0,
        faturadoBruto: fatBruto,
        faturadoComRedutor: fatBruto, 
        lucroLiquidoFinal: lucroFinal, 
        progressoMetaPct, 
        margemBrutaPct, 
        margemLiquidaPct, 
        projecaoFaturamento: fatBruto,
        valorFaltante: Math.max(0, metaBase - fatBruto),
        mediaDiariaNecessaria: 0,
        cancelamentosMes: 0,
        isCurrentMonth: true,
        logoUrl: ruleObj.logo_url || null,
        isFisico: isChannelFisico(channelName)
      };
    });
  }, [consolidatedMetrics, goals, channelRules, appliedChannelFilter, appliedModalidadeFilter, currentRefMonth, canais]);

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

    let corpoTexto = `Olá, tudo bem? Segue resumo das vendas das lojas fisica e onlines do dia ${dataHoje}.\n\n`;
    corpoTexto += `Faturamento Bruto Consolidado: R$ ${kpis.faturamentoBrutoVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
    corpoTexto += `Acesse o dashboard completo em: https://dashboard-e-commerce-nine.vercel.app/\n`;

    const corpoEncoded = encodeURIComponent(corpoTexto);
    window.location.href = `mailto:${emailsCadastrados}?subject=${assunto}&body=${corpoEncoded}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090e] p-8 text-slate-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold text-slate-400">A carregar dados das outras abas...</p>
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
            <p className="text-sm font-medium text-slate-400">Visão consolidada alimentada pelas abas de Relatórios, Custos e Regras</p>
          </div>
          <Navbar />
        </div>

        {/* BARRA DE FILTROS SUPERIOR */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-xl gap-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Dashboard Best Fit</h2>
            <p className="text-xs text-slate-400 mt-0.5">Cálculo de Margem Real = Repasse Líq - CMV</p>
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
              <p className="text-[10px] text-slate-500 mt-1">{kpis.totalPedidos} itens validados nas abas</p>
            </div>
            
            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
              <div>
                <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-2">Lojas Físicas</span>
                <div className="grid grid-cols-2 gap-2">
                  {kpis.lojasFisicasDetalhes.map((loja: any) => (
                    <div key={loja.nome} className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                      <span className="font-bold text-slate-200 text-xs block">{loja.nome}</span>
                      <span className="text-xs font-black text-white block mt-0.5">R$ {loja.faturado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-[9px] font-black block mt-0.5 text-rose-400">▼ 100.0% abaixo</span>
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

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between text-center shadow-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Repasse Total das Plataformas</span>
              <h3 className="text-2xl font-black text-purple-400 mt-1">R$ {kpis.faturamentoLiquidoRepasse.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
              <div>
                <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-1">Lojas Físicas</span>
                <span className="text-xs font-bold text-slate-200 block">R$ 0,00</span>
              </div>
              <div className="pt-2 border-t border-slate-800/50">
                <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
                <span className="text-xs font-bold text-slate-200 block">R$ {kpis.repasseDigital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between text-center shadow-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">CMV Total (Custos por SKU)</span>
              <h3 className="text-2xl font-black text-amber-400 mt-1">R$ {kpis.custoTotalCMV.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
              <div>
                <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-1">Lojas Físicas</span>
                <span className="text-xs font-bold text-slate-200 block">R$ 0,00</span>
              </div>
              <div className="pt-2 border-t border-slate-800/50">
                <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
                <span className="text-xs font-bold text-slate-200 block">R$ {kpis.cmvDigital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/30 flex flex-col justify-between text-center shadow-xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">Lucro Líquido Real</span>
              <h3 className="text-2xl font-black text-emerald-400 mt-1">R$ {kpis.lucroLiquidoReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
              <div>
                <span className="block text-[9px] text-emerald-400 font-bold uppercase mb-1">Lojas Físicas</span>
                <span className="text-xs font-bold text-slate-200 block">R$ 0,00</span>
              </div>
              <div className="pt-2 border-t border-slate-800/50">
                <span className="block text-[9px] text-blue-400 font-bold uppercase mb-0.5">E-commerce</span>
                <span className="text-xs font-bold text-slate-200 block">R$ {kpis.lucroDigital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
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

                   <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-xs">
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] text-slate-400 font-bold uppercase">Faturamento Final:</span>
                       <strong className="text-xs font-black text-indigo-300">R$ {item.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold mb-0.5">Margem Bruta</span>
                        <strong className="text-sm font-black text-blue-400">{item.margemBrutaPct.toFixed(1)}%</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold mb-0.5">Margem Líquida</span>
                        <strong className="text-sm font-black text-emerald-400">{item.margemLiquidaPct.toFixed(1)}%</strong>
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
                    <th className="py-4 px-4 text-right">Projeção do Mês</th>
                    <th className="py-4 px-4 text-center">Meta Atingida</th>
                    <th className="py-4 px-6 text-right text-emerald-400">Margem Líq.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {channelAnalytics.map((item: any) => {
                    const metaBatida = item.progressoMetaPct >= 100;
                    return (
                      <tr key={item.canal} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-6 font-bold text-white">{item.canal}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-white">R$ {item.faturadoComRedutor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-400">R$ {item.metaValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-indigo-300">R$ {item.projecaoFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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