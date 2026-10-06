"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function RegrasPage() {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
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
    
    const { data: tinyConfig } = await supabase.from('config_regras_tiny').select('*');
    if (tinyConfig && tinyConfig.length > 0) {
      const cfgSku = tinyConfig.find(t => t.campo === 'sku')?.coluna || 'C';
      const cfgEstoque = tinyConfig.find(t => t.campo === 'estoque')?.coluna || 'F';
      const cfgStatusSku = tinyConfig.find(t => t.campo === 'status_sku')?.coluna || 'A';
      const cfgStatusValor = tinyConfig.find(t => t.campo === 'status_valor')?.coluna || 'B';
      setRegrasTiny({ sku: cfgSku, estoque: cfgEstoque, status_sku: cfgStatusSku, status_valor: cfgStatusValor });
    }

    const { data: canaisConfig } = await supabase.from('config_regras_canais').select('*').order('id');
    if (canaisConfig) setRegrasCanais(canaisConfig);

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

    alert("✅ Configurações salvas com sucesso!");
    setSalvando(false);
  };

  const atualizarColunaCanal = async (id: number, novaColuna: string) => {
    const colunaLimpa = novaColuna.toUpperCase().trim();
    setRegrasCanais(prev => prev.map(r => r.id === id ? { ...r, coluna_sku: colunaLimpa } : r));
    await supabase.from('config_regras_canais').update({ coluna_sku: colunaLimpa }).eq('id', id);
  };

  const alternarAtivoAds = async (id: number, ativoAtual: boolean) => {
    const novoStatus = !ativoAtual;
    setRegrasCanais(prev => prev.map(r => r.id === id ? { ...r, ativo_ads: novoStatus } : r));
    await supabase.from('config_regras_canais').update({ ativo_ads: novoStatus }).eq('id', id);
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
      alert("✅ Regra adicionada com sucesso!");
    }
    setSalvandoTarifa(false);
  };

  const removerRegraTarifacao = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover esta regra?")) return;
    const { error } = await supabase.from('config_regras_tarifacao').delete().eq('id', id);
    if (error) alert("Erro: " + error.message);
    else carregarDados();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Regras</h1>
            <p className="text-sm font-medium text-slate-400">Configure colunas, visibilidade de canais no Ads e tarifação</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">Dashboard</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/upload">Upload & Canais</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/mapeamento">Mapeamento</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/ads">Painel Ads</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/regras">Regras</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">Admin</Link>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-center text-slate-400">A carregar...</p>
        ) : (
          <div className="space-y-8">

            {/* MAPEAMENTO DE COLUNAS E VISIBILIDADE NO ADS */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-1 text-white">Mapeamento de Colunas & Visibilidade no Painel Ads</h2>
              <p className="text-xs text-slate-400 mb-6">Defina a coluna do SKU e marque quais canais aparecem no Painel Ads (ex: Site desativado).</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {regrasCanais.map((r) => (
                  <div key={r.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-white text-xs block mb-1">{r.canal}</span>
                      <button 
                        type="button"
                        onClick={() => alternarAtivoAds(r.id, r.ativo_ads ?? true)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                          (r.ativo_ads ?? true) ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {(r.ativo_ads ?? true) ? '✓ Visível no Ads' : '✕ Oculto no Ads'}
                      </button>
                    </div>

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

            {/* RESTANTE DA PÁGINA (TINY E TARIFAÇÃO) */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-1 text-white">Configuração de Colunas (Base Tiny & Status)</h2>
              <form onSubmit={salvarRegrasTiny} className="space-y-6 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950 p-6 rounded-xl border border-slate-800">
                  <div>
                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Base Central (Tiny)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Coluna SKU</label>
                        <input type="text" maxLength={2} value={regrasTiny.sku} onChange={(e) => setRegrasTiny({ ...regrasTiny, sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase text-center outline-none" required />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Coluna Estoque</label>
                        <input type="text" maxLength={2} value={regrasTiny.estoque} onChange={(e) => setRegrasTiny({ ...regrasTiny, estoque: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase text-center outline-none" required />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">Status</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Coluna SKU</label>
                        <input type="text" maxLength={2} value={regrasTiny.status_sku} onChange={(e) => setRegrasTiny({ ...regrasTiny, status_sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase text-center outline-none" required />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Coluna Status</label>
                        <input type="text" maxLength={2} value={regrasTiny.status_valor} onChange={(e) => setRegrasTiny({ ...regrasTiny, status_valor: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono uppercase text-center outline-none" required />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={salvando} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                    {salvando ? "A salvar..." : "Salvar Configurações Tiny"}
                  </button>
                </div>
              </form>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}