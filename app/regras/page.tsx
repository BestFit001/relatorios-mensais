"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function RegrasPage() {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  // Configurações de colunas da Base Tiny e Status
  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });

  // Configurações das colunas de SKU por Canal
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);

  // Regras de Tarifação Condicional
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [novoCanal, setNovoCanal] = useState("Amazon");
  const [novaFaixa, setNovaFaixa] = useState("R$ 0.00 até R$ 78.99");
  const [novaComissao, setNovaComissao] = useState("14.00");
  const [novaTarifaFixa, setNovaTarifaFixa] = useState("4.00");
  const [novoFrete, setNovoFrete] = useState("0.00");
  const [salvandoTarifa, setSalvandoTarifa] = useState(false);

  const canaisDisponiveis = [
    "Amazon", "Centauro", "Magalu", "Mercado Livre Clássico", 
    "Mercado Livre Premium", "Netshoes", "Shein", "Shopee", "Site", "TikTok Shop"
  ];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    
    // Carregar configuração de colunas do Tiny
    const { data: tinyConfig } = await supabase.from('config_regras_tiny').select('*');
    if (tinyConfig && tinyConfig.length > 0) {
      const cfgSku = tinyConfig.find(t => t.campo === 'sku')?.coluna || 'C';
      const cfgEstoque = tinyConfig.find(t => t.campo === 'estoque')?.coluna || 'F';
      const cfgStatusSku = tinyConfig.find(t => t.campo === 'status_sku')?.coluna || 'A';
      const cfgStatusValor = tinyConfig.find(t => t.campo === 'status_valor')?.coluna || 'B';
      setRegrasTiny({ sku: cfgSku, estoque: cfgEstoque, status_sku: cfgStatusSku, status_valor: cfgStatusValor });
    }

    // Carregar configuração de colunas dos canais
    const { data: canaisConfig } = await supabase.from('config_regras_canais').select('*').order('id');
    if (canaisConfig) setRegrasCanais(canaisConfig);

    // Carregar regras de tarifação
    const { data: tarifacaoData } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (tarifacaoData) setRegrasTarifacao(tarifacaoData);

    setLoading(false);
  };

  const salvarRegrasTiny = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const configs = [
      { campo: 'sku', coluna: regrasTiny.sku.toUpperCase() },
      { campo: 'estoque', coluna: regrasTiny.estoque.toUpperCase() },
      { campo: 'status_sku', coluna: regrasTiny.status_sku.toUpperCase() },
      { campo: 'status_valor', coluna: regrasTiny.status_valor.toUpperCase() }
    ];

    for (const cfg of configs) {
      await supabase.from('config_regras_tiny').upsert(cfg, { onConflict: 'campo' });
    }

    alert("✅ Configurações de colunas da Base Tiny salvas com sucesso!");
    setSalvando(false);
  };

  const atualizarColunaCanal = async (id: number, novaColuna: string) => {
    const colunaLimpa = novaColuna.toUpperCase().trim();
    setRegrasCanais(prev => prev.map(r => r.id === id ? { ...r, coluna_sku: colunaLimpa } : r));
    await supabase.from('config_regras_canais').update({ coluna_sku: colunaLimpa }).eq('id', id);
  };

  const adicionarRegraTarifacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoTarifa(true);

    const { error } = await supabase.from('config_regras_tarifacao').insert([{
      canal: novoCanal,
      faixa_preco: novaFaixa,
      comissao: Number(novaComissao),
      tarifa_fixa: Number(novaTarifaFixa),
      frete: Number(novoFrete)
    }]);

    if (error) {
      alert("Erro ao adicionar regra: " + error.message);
    } else {
      carregarDados();
      alert("✅ Regra de tarifação adicionada com sucesso!");
    }
    setSalvandoTarifa(false);
  };

  const removerRegraTarifacao = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover esta regra?")) return;
    const { error } = await supabase.from('config_regras_tarifacao').delete().eq('id', id);
    if (error) {
      alert("Erro ao remover: " + error.message);
    } else {
      carregarDados();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Regras</h1>
            <p className="text-sm font-medium text-slate-400">Configure as colunas de leitura de planilhas e as regras de tarifação por canal</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">Dashboard</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/upload">Upload & Canais</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/mapeamento">Mapeamento</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/regras">Regras</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">Admin</Link>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-center text-slate-400 font-medium">A carregar regras...</p>
        ) : (
          <div className="space-y-8">

            {/* 1. CONFIGURAÇÃO DE COLUNAS BASE TINY */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-1 text-white">Configuração de Colunas (Base Tiny & Status)</h2>
              <p className="text-xs text-slate-400 mb-6">Indique as letras das colunas nas planilhas onde o sistema deve procurar os dados.</p>
              
              <form onSubmit={salvarRegrasTiny} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950 p-6 rounded-xl border border-slate-800/80">
                  <div>
                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Base Central (Tiny ERP)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Coluna SKU</label>
                        <input type="text" maxLength={2} value={regrasTiny.sku} onChange={(e) => setRegrasTiny({ ...regrasTiny, sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase text-center outline-none" required />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Coluna Estoque</label>
                        <input type="text" maxLength={2} value={regrasTiny.estoque} onChange={(e) => setRegrasTiny({ ...regrasTiny, estoque: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase text-center outline-none" required />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">Status (Normal / Obsoleto)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Coluna SKU</label>
                        <input type="text" maxLength={2} value={regrasTiny.status_sku} onChange={(e) => setRegrasTiny({ ...regrasTiny, status_sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase text-center outline-none" required />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Coluna Status</label>
                        <input type="text" maxLength={2} value={regrasTiny.status_valor} onChange={(e) => setRegrasTiny({ ...regrasTiny, status_valor: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase text-center outline-none" required />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button type="submit" disabled={salvando} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg transition-all">
                    {salvando ? "A salvar..." : "Salvar Configurações Tiny"}
                  </button>
                </div>
              </form>
            </div>

            {/* 2. CONFIGURAÇÃO DE COLUNAS DOS CANAIS */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-1 text-white">Mapeamento de Colunas por Canal</h2>
              <p className="text-xs text-slate-400 mb-6">Defina qual letra de coluna contém o SKU em cada marketplace.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {regrasCanais.map((r) => (
                  <div key={r.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                    <span className="font-bold text-white text-xs">{r.canal}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Col:</span>
                      <input 
                        type="text" 
                        maxLength={2} 
                        value={r.coluna_sku} 
                        onChange={(e) => atualizarColunaCanal(r.id, e.target.value)} 
                        className="w-12 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white font-mono uppercase text-center outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. REGRAS DE TARIFAÇÃO CONDICIONAL */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-1 text-white">Regras de Tarifação Condicional por Canal</h2>
              <p className="text-xs text-slate-400 mb-6">Configure comissões, tarifas fixas e custos de frete por faixa de preço e canal.</p>

              <form onSubmit={adicionarRegraTarifacao} className="bg-slate-950 p-6 rounded-xl border border-slate-800 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Canal</label>
                  <select value={novoCanal} onChange={(e) => setNovoCanal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
                    {canaisDisponiveis.map((c, i) => <option key={i} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Faixa de Preço</label>
                  <input type="text" value={novaFaixa} onChange={(e) => setNovaFaixa(e.target.value)} placeholder="Ex: R$ 0.00 até R$ 78.99" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" required />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Comissão (%)</label>
                  <input type="text" value={novaComissao} onChange={(e) => setNovaComissao(e.target.value)} placeholder="14.00" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" required />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tarifa Fixa (R$)</label>
                  <input type="text" value={novaTarifaFixa} onChange={(e) => setNovaTarifaFixa(e.target.value)} placeholder="4.00" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" required />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Frete (R$)</label>
                  <input type="text" value={novoFrete} onChange={(e) => setNovoFrete(e.target.value)} placeholder="0.00" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" required />
                </div>

                <button type="submit" disabled={salvandoTarifa} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg transition-all">
                  {salvandoTarifa ? "A salvar..." : "Adicionar Regra"}
                </button>
              </form>

              {regrasTarifacao.length === 0 ? (
                <p className="p-6 text-center text-slate-500 font-medium text-xs">Nenhuma regra de tarifação cadastrada ainda.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-4">Canal</th>
                        <th className="p-4">Faixa de Preço</th>
                        <th className="p-4 text-center">Comissão (%)</th>
                        <th className="p-4 text-center">Tarifa Fixa (R$)</th>
                        <th className="p-4 text-center">Frete (R$)</th>
                        <th className="p-4 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {regrasTarifacao.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 font-bold text-white text-sm">{r.canal}</td>
                          <td className="p-4 font-semibold text-slate-300">{r.faixa_preco}</td>
                          <td className="p-4 text-center font-bold text-rose-400">{Number(r.comissao).toFixed(2)}%</td>
                          <td className="p-4 text-center font-mono text-slate-200">R$ {Number(r.tarifa_fixa).toFixed(2)}</td>
                          <td className="p-4 text-center font-mono text-slate-200">R$ {Number(r.frete).toFixed(2)}</td>
                          <td className="p-4 text-center">
                            <button 
                              onClick={() => removerRegraTarifacao(r.id)} 
                              className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all shadow-sm"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}