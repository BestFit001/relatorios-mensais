'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/app/components/Navbar';

/* =====================================================================
   DASHBOARD OMNICHANNEL — app/page.tsx (Página Principal)
   ===================================================================== */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TABELAS_SUPABASE = [
  'vendas_padrao_lancamentos',
  'faturados',
  'tabela_custos_skus',
  'config_regras_canais',
  'config_regras_tiny',
  'tb_metas',
  'devolucoes',
  'ads_faturamento_canal',
  'ads_campanhas_lancamentos',
  'plp_pedidos',
] as const;

const normalizarTexto = (v: any) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const normalizarPedido = (v: any) => String(v ?? '').trim().replace(/\.0$/, '').replace(/\s+/g, '').toLowerCase();
const formatarNumero = (n: number) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatarMoeda = (v: number) => `R$ ${formatarNumero(v)}`;

const converterNumero = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let s = String(val).trim().replace('R$', '').trim();
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};

const isCanalFisico = (canal: string) => {
  const n = normalizarTexto(canal);
  return n.includes('clube') || n.includes('loja') || n.includes('paineiras') || n.includes('hebraica');
};

function compilarFormulaExcel(src: any) {
  const texto = String(src || '').trim().replace(/^=/, '');
  if (!texto) return null;
  const tokens = texto.match(/\d+(?:[.,]\d+)?|\$?[A-Za-z]{1,3}\$?\d*|[-+*/^()%]/g);
  if (!tokens || tokens.join('') !== texto.replace(/\s+/g, '')) return null;

  let i = 0;
  const refs: string[] = [];
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  const expr = (): any => {
    let l = term();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = term();
      const a = l;
      l = op === '+' ? (c: any) => a(c) + r(c) : (c: any) => a(c) - r(c);
    }
    return l;
  };
  const term = (): any => {
    let l = power();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const r = power();
      const a = l;
      l = op === '*' ? (c: any) => a(c) * r(c) : (c: any) => a(c) / r(c);
    }
    return l;
  };
  const power = (): any => {
    const base = unary();
    if (peek() === '^') {
      next();
      const e = power();
      return (c: any) => Math.pow(base(c), e(c));
    }
    return base;
  };
  const unary = (): any => {
    if (peek() === '-') { next(); const x = unary(); return (c: any) => -x(c); }
    if (peek() === '+') { next(); return unary(); }
    return postfix();
  };
  const postfix = (): any => {
    let n = primary();
    while (peek() === '%') { next(); const a = n; n = (c: any) => a(c) / 100; }
    return n;
  };
  const primary = (): any => {
    const t = next();
    if (t === undefined) throw new Error('Fim inesperado');
    if (t === '(') {
      const e = expr();
      if (next() !== ')') throw new Error('Parêntese');
      return e;
    }
    if (/^\d/.test(t)) { const v = Number(t.replace(',', '.')); return () => v; }
    if (/^\$?[A-Za-z]/.test(t)) {
      const col = t.replace(/[^A-Za-z]/g, '').toUpperCase();
      refs.push(col);
      return (c: any) => c[col];
    }
    throw new Error('Token inválido');
  };

  try {
    const fn = expr();
    if (i !== tokens.length) return null;
    return { fn, refs };
  } catch {
    return null;
  }
}

export default function DashboardOmnichannel() {
  const [loading, setLoading] = useState(true);
  const [database, setDatabase] = useState<Record<string, any[]>>({});
  
  const [filtroModalidade, setFiltroModalidade] = useState<'TODAS' | 'FISICO' | 'DIGITAL'>('TODAS');
  const [filtroCanal, setFiltroCanal] = useState<string>('TODOS');
  const [tipoVisualizacao, setTipoVisualizacao] = useState<'cards' | 'linhas'>('cards');
  const [periodoSelecionado, setPeriodoSelecionado] = useState<'MES_ATUAL' | 'MES_ANTERIOR' | 'HOJE'>('MES_ATUAL');

  useEffect(() => {
    carregarTodasTabelas();
  }, []);

  async function carregarTodasTabelas() {
    setLoading(true);
    const resultado: Record<string, any[]> = {};
    
    await Promise.all(
      TABELAS_SUPABASE.map(async (tabela) => {
        const { data } = await supabase.from(tabela).select('*');
        resultado[tabela] = data || [];
      })
    );

    setDatabase(resultado);
    setLoading(false);
  }

  const datasCalculo = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    let ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    let fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    if (periodoSelecionado === 'MES_ANTERIOR') {
      ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    } else if (periodoSelecionado === 'HOJE') {
      ini = hoje;
      fim = hoje;
    }

    return {
      inicioIso: iso(ini),
      fimIso: iso(fim),
      diasPassados: Math.max(1, hoje.getDate()),
      totalDiasMes: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
    };
  }, [periodoSelecionado]);

  const canaisDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    const adicionar = (nome: any) => {
      const limpo = String(nome || '').trim();
      if (limpo) mapa.set(normalizarTexto(limpo), limpo);
    };

    (database.config_regras_canais || []).forEach(r => adicionar(r.canal));
    (database.vendas_padrao_lancamentos || []).forEach(v => adicionar(v.canal));
    (database.devolucoes || []).forEach(d => adicionar(d.canal));
    (database.ads_faturamento_canal || []).forEach(a => adicionar(a.canal));
    (database.plp_pedidos || []).forEach(p => adicionar(p.canal));
    ['Clube Hebraica', 'Clube Paineiras'].forEach(adicionar);

    return Array.from(mapa.values());
  }, [database]);

  const regrasMap = useMemo(() => {
    const map = new Map();
    (database.config_regras_canais || []).forEach(r => {
      const colPdv = String(r.col_pdv || 'D').toUpperCase();
      const colQtd = String(r.col_quantidade || 'G').toUpperCase();
      const formulaObj = compilarFormulaExcel(r.formula_excel);
      map.set(normalizarTexto(r.canal), {
        formula: formulaObj,
        colPdv,
        colQtd,
        responsavel: r.responsavel || 'Equipe Best Fit',
        logoUrl: r.logo_url || null
      });
    });
    return map;
  }, [database.config_regras_canais]);

  const custosMap = useMemo(() => {
    const map = new Map();
    (database.tabela_custos_skus || []).forEach(c => {
      const k = normalizarTexto(c.sku);
      if (k) map.set(k, converterNumero(c.custo_unitario ?? c.custo));
    });
    return map;
  }, [database.tabela_custos_skus]);

  const faturadosMap = useMemo(() => {
    const map = new Map();
    (database.faturados || []).forEach(f => {
      const idPed = normalizarPedido(f.id_pedido);
      if (idPed && f.data_faturamento) map.set(idPed, f.data_faturamento.slice(0, 10));
    });
    return map;
  }, [database.faturados]);

  const flexMap = useMemo(() => {
    const map = new Map();
    (database.plp_pedidos || []).forEach(p => {
      if (normalizarTexto(p.modalidade) === 'flex') {
        const idPed = normalizarPedido(p.numero_pedido ?? p.id_pedido);
        if (idPed) map.set(idPed, converterNumero(p.valor_frete));
      }
    });
    return map;
  }, [database.plp_pedidos]);

  const adsMap = useMemo(() => {
    const map = new Map();
    (database.ads_faturamento_canal || []).forEach(a => {
      const k = normalizarTexto(a.canal);
      map.set(k, (map.get(k) || 0) + converterNumero(a.gasto_ads));
    });
    (database.ads_campanhas_lancamentos || []).forEach(a => {
      const k = normalizarTexto(a.canal);
      map.set(k, (map.get(k) || 0) + converterNumero(a.investimento));
    });
    return map;
  }, [database.ads_faturamento_canal, database.ads_campanhas_lancamentos]);

  const metricasCanais = useMemo(() => {
    const vendasValid = (database.vendas_padrao_lancamentos || []).filter(v => {
      if (filtroCanal !== 'TODOS' && normalizarTexto(v.canal) !== normalizarTexto(filtroCanal)) return false;
      const fisico = isCanalFisico(v.canal);
      if (filtroModalidade === 'FISICO' && !fisico) return false;
      if (filtroModalidade === 'DIGITAL' && fisico) return false;
      return true;
    });

    const porCanal = new Map<string, any[]>();
    vendasValid.forEach(v => {
      const k = normalizarTexto(v.canal);
      const lista = porCanal.get(k) || [];
      lista.push(v);
      porCanal.set(k, lista);
    });

    const metas = database.tb_metas || [];

    return canaisDisponiveis
      .filter(canal => {
        if (filtroCanal !== 'TODOS' && normalizarTexto(canal) !== normalizarTexto(filtroCanal)) return false;
        const fisico = isCanalFisico(canal);
        if (filtroModalidade === 'FISICO' && !fisico) return false;
        if (filtroModalidade === 'DIGITAL' && fisico) return false;
        return true;
      })
      .map(canal => {
        const kCanal = normalizarTexto(canal);
        const itensVenda = porCanal.get(kCanal) || [];
        const regra = regrasMap.get(kCanal);

        let brutoCanal = 0;
        let liqCanal = 0;
        let cmvCanal = 0;
        const pedidosFlexCanal = new Set<string>();
        let flexCanalValor = 0;

        itensVenda.forEach(v => {
          const ped = normalizarPedido(v.id_pedido);
          const dataFat = faturadosMap.get(ped);
          
          if (dataFat && (dataFat < datasCalculo.inicioIso || dataFat > datasCalculo.fimIso)) return;

          const qtd = converterNumero(v.quantidade) || 1;
          const valorPdv = converterNumero(v.valor ?? v.preco_venda);
          const repasseDb = converterNumero(v.repasse_liquido ?? v.repasse);

          let brutoLinha = valorPdv;
          let liqLinha = repasseDb > 0 ? repasseDb : valorPdv;

          if (regra?.formula) {
            try {
              liqLinha = regra.formula.fn({ [regra.colPdv]: valorPdv, [regra.colQtd]: qtd });
            } catch {}
          }

          brutoCanal += brutoLinha;
          liqCanal += liqLinha;

          const skuNorm = normalizarTexto(v.sku);
          const custoUni = custosMap.get(skuNorm) || 0;
          cmvCanal += custoUni * qtd;

          if (ped && flexMap.has(ped) && !pedidosFlexCanal.has(ped)) {
            pedidosFlexCanal.add(ped);
            flexCanalValor += flexMap.get(ped);
          }
        });

        let devBruto = 0;
        let devLiq = 0;
        let freteDevolucao = 0;

        (database.devolucoes || []).forEach(d => {
          if (normalizarTexto(d.canal) !== kCanal) return;
          if (normalizarTexto(d.solicitacao).includes('troca')) return;
          const dataRet = d.data_retorno ? d.data_retorno.slice(0, 10) : '';
          if (dataRet && (dataRet < datasCalculo.inicioIso || dataRet > datasCalculo.fimIso)) return;

          const qtd = Math.max(1, converterNumero(d.quantidade) || 1);
          const pdvDev = converterNumero(d.pdv);
          let liqDev = pdvDev;
          if (regra?.formula) {
            try { liqDev = regra.formula.fn({ [regra.colPdv]: pdvDev, [regra.colQtd]: qtd }); } catch {}
          }

          devBruto += pdvDev;
          devLiq += liqDev;
          freteDevolucao += converterNumero(d.custo_frete ?? d.frete);
        });

        const fatBruto = brutoCanal - devBruto;
        const adsCanal = adsMap.get(kCanal) || 0;
        const fatLiquido = liqCanal - devLiq - freteDevolucao - adsCanal - flexCanalValor;
        const lucroLiquido = fatLiquido - cmvCanal;

        const metaObj = metas.find(m => normalizarTexto(m.canal) === kCanal) || { meta_valor: 0 };
        const metaValor = converterNumero(metaObj.meta_valor);
        const progressoMeta = metaValor > 0 ? (fatBruto / metaValor) * 100 : 0;

        return {
          canal,
          responsavel: regra?.responsavel || 'Equipe Best Fit',
          metaValor,
          fatBruto,
          fatLiquido,
          cmv: cmvCanal,
          ads: adsCanal,
          flex: flexCanalValor,
          devBruto,
          lucro: lucroLiquido,
          margemPct: fatBruto > 0 ? (lucroLiquido / fatBruto) * 100 : 0,
          progressoMetaPct: progressoMeta,
          itensValidados: itensVenda.length
        };
      });
  }, [database, canaisDisponiveis, regrasMap, custosMap, faturadosMap, flexMap, adsMap, datasCalculo, filtroCanal, filtroModalidade]);

  const totaisGerais = useMemo(() => {
    return metricasCanais.reduce((acc, curr) => ({
      fatBruto: acc.fatBruto + curr.fatBruto,
      fatLiquido: acc.fatLiquido + curr.fatLiquido,
      cmv: acc.cmv + curr.cmv,
      ads: acc.ads + curr.ads,
      flex: acc.flex + curr.flex,
      lucro: acc.lucro + curr.lucro,
      metaValor: acc.metaValor + curr.metaValor,
      devBruto: acc.devBruto + curr.devBruto
    }), { fatBruto: 0, fatLiquido: 0, cmv: 0, ads: 0, flex: 0, lucro: 0, metaValor: 0, devBruto: 0 });
  }, [metricasCanais]);

  const handleEnviarEmailAlerta = () => {
    const email = 'gisele@usebestfit.com.br';
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const assunto = encodeURIComponent(`📊 Resumo de Vendas - Lojas Físicas e Online (${dataHoje})`);
    let corpo = `Olá, tudo bem? Segue resumo executivo de vendas.\n\n`;
    corpo += `Caso queiram visualiza-lo, acessem o link a seguir: https://dashboard-e-commerce-nine.vercel.app/\n`;
    window.location.href = `mailto:${email}?subject=${assunto}&body=${encodeURIComponent(corpo)}`;
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
    <div className="min-h-screen bg-[#07090e] p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Dashboard Omnichannel</h1>
            <p className="text-sm font-medium text-slate-400">Visão consolidada com canais dinâmicos da aba Regras</p>
          </div>
          <Navbar />
        </div>

        {/* BARRA DE FILTROS */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handleEnviarEmailAlerta} 
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 transition text-white font-extrabold text-xs rounded-xl shadow-lg cursor-pointer"
            >
              Enviar Relatório por E-mail
            </button>

            <select 
              value={periodoSelecionado} 
              onChange={(e) => setPeriodoSelecionado(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-indigo-300 outline-none cursor-pointer"
            >
              <option value="MES_ATUAL">Mês Atual</option>
              <option value="MES_ANTERIOR">Mês Anterior</option>
              <option value="HOJE">Hoje</option>
            </select>

            <select 
              value={filtroModalidade} 
              onChange={(e) => setFiltroModalidade(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-emerald-300 outline-none cursor-pointer"
            >
              <option value="TODAS">Todas as Modalidades</option>
              <option value="FISICO">Lojas Físicas</option>
              <option value="DIGITAL">E-commerce / Marketplaces</option>
            </select>

            <select 
              value={filtroCanal} 
              onChange={(e) => setFiltroCanal(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-purple-300 outline-none cursor-pointer"
            >
              <option value="TODOS">Todos os Canais (Aba Regras)</option>
              {canaisDisponiveis.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setTipoVisualizacao(tipoVisualizacao === 'cards' ? 'linhas' : 'cards')}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
            >
              Modo: {tipoVisualizacao === 'cards' ? 'Cards Executivos' : 'Tabela Executiva'}
            </button>
          </div>
        </div>

        {/* 4 CARDS RESUMO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl text-center space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Bruto</span>
            <h3 className="text-2xl font-black text-white">{formatarMoeda(totaisGerais.fatBruto)}</h3>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl text-center space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Líquido (Repasse)</span>
            <h3 className="text-2xl font-black text-purple-400">{formatarMoeda(totaisGerais.fatLiquido)}</h3>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl text-center space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">CMV Total</span>
            <h3 className="text-2xl font-black text-amber-400">{formatarMoeda(totaisGerais.cmv)}</h3>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/30 shadow-xl text-center space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Lucro Líquido Real</span>
            <h3 className={`text-2xl font-black ${totaisGerais.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatarMoeda(totaisGerais.lucro)}
            </h3>
          </div>
        </div>

        {/* LISTAGEM DE CANAIS */}
        {tipoVisualizacao === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metricasCanais.map(item => (
              <div key={item.canal} className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between">
                <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{item.responsavel}</span>
                    <h4 className="font-black text-white text-sm">{item.canal}</h4>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${item.progressoMetaPct >= 100 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border-rose-500/40'}`}>
                    {item.progressoMetaPct.toFixed(1)}% da meta
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                  <div>
                    <span className="text-[9px] text-slate-400 block font-bold">FAT. BRUTO</span>
                    <strong className="text-xs font-black text-white">{formatarMoeda(item.fatBruto)}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-purple-300 block font-bold">FAT. LÍQ</span>
                    <strong className="text-xs font-black text-purple-400">{formatarMoeda(item.fatLiquido)}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-emerald-300 block font-bold">MARGEM</span>
                    <strong className="text-xs font-black text-emerald-400">{item.margemPct.toFixed(1)}%</strong>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between"><span>CMV:</span><span className="text-amber-400">- {formatarMoeda(item.cmv)}</span></div>
                  <div className="flex justify-between"><span>Adsense:</span><span className="text-rose-400">- {formatarMoeda(item.ads)}</span></div>
                  <div className="flex justify-between"><span>Frete Flex:</span><span className="text-rose-400">- {formatarMoeda(item.flex)}</span></div>
                  <div className="flex justify-between pt-2 border-t border-slate-900 font-bold text-white">
                    <span>Lucro Líquido:</span>
                    <span className={item.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatarMoeda(item.lucro)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                <tr>
                  <th className="py-4 px-6">Canal / Responsável</th>
                  <th className="py-4 px-4 text-right">Fat. Bruto</th>
                  <th className="py-4 px-4 text-right">Fat. Líquido</th>
                  <th className="py-4 px-4 text-right">CMV</th>
                  <th className="py-4 px-4 text-right">Adsense</th>
                  <th className="py-4 px-4 text-right">Frete Flex</th>
                  <th className="py-4 px-4 text-right">Lucro Líq.</th>
                  <th className="py-4 px-6 text-right text-emerald-400">Margem Líq.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {metricasCanais.map(item => (
                  <tr key={item.canal} className="hover:bg-slate-800/40">
                    <td className="py-3 px-6 font-bold text-white">{item.canal}<span className="block text-[10px] text-slate-400">{item.responsavel}</span></td>
                    <td className="py-3 px-4 text-right font-mono">{formatarMoeda(item.fatBruto)}</td>
                    <td className="py-3 px-4 text-right font-mono text-purple-300 font-bold">{formatarMoeda(item.fatLiquido)}</td>
                    <td className="py-3 px-4 text-right font-mono text-amber-400">{formatarMoeda(item.cmv)}</td>
                    <td className="py-3 px-4 text-right font-mono text-rose-300">{formatarMoeda(item.ads)}</td>
                    <td className="py-3 px-4 text-right font-mono text-rose-300">{formatarMoeda(item.flex)}</td>
                    <td className={`py-3 px-4 text-right font-mono font-black ${item.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatarMoeda(item.lucro)}</td>
                    <td className="py-3 px-6 text-right font-black text-emerald-400">{item.margemPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}