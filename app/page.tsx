'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/app/components/Navbar';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState<any[]>([]);
  const [mesFiltro, setMesFiltro] = useState('outubro de 2026');
  const [canalFiltro, setCanalFiltro] = useState('TODOS');
  const [modalidadeFilter, setModalidadeFilter] = useState('TODAS');
  const [viewMode, setViewMode] = useState<'cards' | 'linhas'>('cards');

  const canaisLista = [
    'Mercado Livre 1', 'Mercado Livre 2', 'Shopee', 'Amazon', 
    'TikTok', 'Magalu', 'Shein', 'Netshoes', 'Site', 'Centauro', 
    'Clube Hebraica', 'Clube Paineiras'
  ];

  useEffect(() => {
    carregarDadosDashboard();
  }, [mesFiltro, canalFiltro, modalidadeFilter]);

  const carregarDadosDashboard = async () => {
    try {
      setLoading(true);
      
      let allRows: any[] = [];
      let from = 0;
      const step = 1000;
      let keepFetching = true;

      while (keepFetching) {
        let query = supabase
          .from('vendas_padrao_lancamentos')
          .select('*')
          .eq('mes_referencia', mesFiltro)
          .range(from, from + step - 1);

        if (canalFiltro !== 'TODOS') {
          query = query.eq('canal', canalFiltro);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allRows = [...allRows, ...data];
          from += step;
          if (data.length < step) keepFetching = false;
        } else {
          keepFetching = false;
        }
      }
      
      let filtradas = allRows;
      if (modalidadeFilter === 'FISICO') {
        filtradas = filtradas.filter((v: any) => {
          const c = String(v.canal || '').toLowerCase();
          return c.includes('clube') || c.includes('loja') || c.includes('paineiras') || c.includes('hebraica');
        });
      } else if (modalidadeFilter === 'DIGITAL') {
        filtradas = filtradas.filter((v: any) => {
          const c = String(v.canal || '').toLowerCase();
          return !(c.includes('clube') || c.includes('loja') || c.includes('paineiras') || c.includes('hebraica'));
        });
      }

      setVendas(filtradas);
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const totais = useMemo(() => {
    let bruto = 0;
    let repasse = 0;
    let quantidadeTotal = 0;

    vendas.forEach(v => {
      const qtd = Number(v.quantidade) || 1;
      const val = Number(v.valor) || 0;
      const rep = Number(v.repasse_liquido) || val;

      bruto += val * qtd;
      repasse += rep;
      quantidadeTotal += qtd;
    });

    return { bruto, repasse, quantidadeTotal, totalItens: vendas.length };
  }, [vendas]);

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
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Dashboard Omnichannel</h1>
            <p className="text-xs text-slate-400 mt-1">Visão consolidada da tabela oficial de vendas ({vendas.length} registos)</p>
          </div>
          <Navbar />
        </div>

        {/* FILTROS */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mês de Referência</label>
              <input 
                type="text" 
                value={mesFiltro} 
                onChange={(e) => setMesFiltro(e.target.value)} 
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modalidade</label>
              <select 
                value={modalidadeFilter} 
                onChange={(e) => setModalidadeFilter(e.target.value)} 
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none cursor-pointer"
              >
                <option value="TODAS">Todas</option>
                <option value="FISICO">Lojas Físicas</option>
                <option value="DIGITAL">E-commerce / Marketplaces</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal de Venda</label>
              <select 
                value={canalFiltro} 
                onChange={(e) => setCanalFiltro(e.target.value)} 
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none cursor-pointer"
              >
                <option value="TODOS">Todos os Canais</option>
                {canaisLista.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <button 
            onClick={carregarDadosDashboard}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg cursor-pointer"
          >
            🔄 Recarcular
          </button>
        </div>

        {/* MODO DE VISUALIZAÇÃO */}
        <div className="flex justify-between items-center bg-slate-900/90 px-5 py-3 rounded-2xl border border-slate-800 shadow-lg">
          <span className="text-xs text-slate-300 font-bold">Modo de Visualização:</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200 select-none">
              <input 
                type="radio" 
                name="viewMode" 
                checked={viewMode === 'cards'} 
                onChange={() => setViewMode('cards')} 
                className="cursor-pointer"
              /> Cards de Resumo
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200 select-none">
              <input 
                type="radio" 
                name="viewMode" 
                checked={viewMode === 'linhas'} 
                onChange={() => setViewMode('linhas')} 
                className="cursor-pointer"
              /> Tabela Detalhada (Todas as Linhas)
            </label>
          </div>
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Bruto</span>
            <h3 className="text-2xl font-black text-white mt-2">
              R$ {totais.bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] text-emerald-400 font-bold mt-1">{totais.totalItens} registos validados</p>
          </div>

          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Repasse Líquido Total</span>
            <h3 className="text-2xl font-black text-indigo-400 mt-2">
              R$ {totais.repasse.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">Líquido pós-regras</p>
          </div>

          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Unidades Vendidas</span>
            <h3 className="text-2xl font-black text-amber-400 mt-2">{totais.quantidadeTotal}</h3>
            <p className="text-[10px] text-slate-500 font-bold mt-1">Total de peças</p>
          </div>
        </div>

        {/* CONTEÚDO PRINCIPAL (CARDS OU TABELA) */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from(new Set(vendas.map(v => v.canal))).map(canal => {
              const vendasCanal = vendas.filter(v => v.canal === canal);
              const fatCanal = vendasCanal.reduce((acc, v) => acc + (Number(v.valor) * (Number(v.quantidade) || 1)), 0);
              const repCanal = vendasCanal.reduce((acc, v) => acc + (Number(v.repasse_liquido) || Number(v.valor)), 0);
              
              return (
                <div key={canal} className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
                  <h4 className="font-black text-white text-sm border-b border-slate-800 pb-2">{canal}</h4>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Itens:</span>
                    <span className="font-bold text-white">{vendasCanal.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Faturamento:</span>
                    <span className="font-bold text-white">R$ {fatCanal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Repasse Líquido:</span>
                    <span className="font-bold text-indigo-400">R$ {repCanal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">Vendas Detalhadas ({vendas.length} registos)</h3>
            
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] sticky top-0 z-10">
                  <tr>
                    <th className="p-3">ID Pedido</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3 text-center">Qtd</th>
                    <th className="p-3 text-right">Valor Venda</th>
                    <th className="p-3 text-right">Repasse Líquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {vendas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 font-bold">Nenhum registo encontrado para este filtro. Certifique-se de que subiu os faturados e cruzou as vendas no Admin.</td>
                    </tr>
                  ) : (
                    vendas.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-indigo-300 font-bold">{item.id_pedido}</td>
                        <td className="p-3">{item.canal}</td>
                        <td className="p-3 font-mono text-slate-300">{item.sku}</td>
                        <td className="p-3 text-center font-bold">{item.quantidade}</td>
                        <td className="p-3 text-right font-mono">R$ {Number(item.valor).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-emerald-400 font-bold">R$ {Number(item.repasse_liquido).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}