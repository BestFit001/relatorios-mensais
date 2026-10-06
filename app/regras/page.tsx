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
  const [regrasCustos, setRegrasCustos] = useState({ sku: 'A', produto: 'B', custo: 'C' });
  const [regrasMlCols, setRegrasMlCols] = useState({ mlb: 'A', sku: 'B', comissao: 'C', peso: '', altura: 'E', largura: 'F', comprimento: 'G' });
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);

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
    
    const { data: configs } = await supabase.from('config_regras_tiny').select('*');
    if (configs) {
      const getCol = (campo: string, def: string) => configs.find((t: any) => t.campo === campo)?.coluna || def;
      setRegrasTiny({ sku: getCol('sku', 'C'), estoque: getCol('estoque', 'F'), status_sku: getCol('status_sku', 'A'), status_valor: getCol('status_valor', 'B') });
      setRegrasCustos({ sku: getCol('custo_sku', 'A'), produto: getCol('custo_produto', 'B'), custo: getCol('custo_valor', 'C') });
      setRegrasMlCols({ 
        mlb: getCol('ml_mlb', 'A'), sku: getCol('ml_sku', 'B'), comissao: getCol('ml_comissao', 'C'), 
        peso: getCol('ml_peso', ''), altura: getCol('ml_altura', 'E'), largura: getCol('ml_largura', 'F'), comprimento: getCol('ml_comprimento', 'G') 
      });
    }

    const { data: canaisConfig } = await supabase.from('config_regras_canais').select('*').order('id');
    if (canaisConfig) setRegrasCanais(canaisConfig);

    setLoading(false);
  };

  const salvarTodasRegras = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const configs = [
      { campo: 'sku', coluna: regrasTiny.sku.toUpperCase() },
      { campo: 'estoque', coluna: regrasTiny.estoque.toUpperCase() },
      { campo: 'status_sku', coluna: regrasTiny.status_sku.toUpperCase() },
      { campo: 'status_valor', coluna: regrasTiny.status_valor.toUpperCase() },
      { campo: 'custo_sku', coluna: regrasCustos.sku.toUpperCase() },
      { campo: 'custo_produto', coluna: regrasCustos.produto.toUpperCase() },
      { campo: 'custo_valor', coluna: regrasCustos.custo.toUpperCase() },
      { campo: 'ml_mlb', coluna: regrasMlCols.mlb.toUpperCase() },
      { campo: 'ml_sku', coluna: regrasMlCols.sku.toUpperCase() },
      { campo: 'ml_comissao', coluna: regrasMlCols.comissao.toUpperCase() },
      { campo: 'ml_peso', coluna: regrasMlCols.peso.toUpperCase() },
      { campo: 'ml_altura', coluna: regrasMlCols.altura.toUpperCase() },
      { campo: 'ml_largura', coluna: regrasMlCols.largura.toUpperCase() },
      { campo: 'ml_comprimento', coluna: regrasMlCols.comprimento.toUpperCase() },
    ];

    for (const cfg of configs) {
      await supabase.from('config_regras_tiny').upsert(cfg, { onConflict: 'campo' });
    }

    alert("✅ Configurações de colunas salvas com sucesso!");
    setSalvando(false);
  };

  const alternarAtivoAds = async (id: number, ativoAtual: boolean) => {
    const novoStatus = !ativoAtual;
    setRegrasCanais(prev => prev.map(r => r.id === id ? { ...r, ativo_ads: novoStatus } : r));
    await supabase.from('config_regras_canais').update({ ativo_ads: novoStatus }).eq('id', id);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Regras</h1>
            <p className="text-sm font-medium text-slate-400">Configure as colunas das planilhas brutas e visibilidade no Ads</p>
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
          <form onSubmit={salvarTodasRegras} className="space-y-8">

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-1 text-white">Visibilidade de Canais no Painel Ads</h2>
              <p className="text-xs text-slate-400 mb-6">Marque quais canais aparecem no Painel Ads.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {regrasCanais.map((r) => (
                  <div key={r.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                    <span className="font-bold text-white text-xs">{r.canal}</span>
                    <button 
                      type="button"
                      onClick={() => alternarAtivoAds(r.id, r.ativo_ads ?? true)}
                      className={`px-3 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                        (r.ativo_ads ?? true) ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {(r.ativo_ads ?? true) ? '✓ Visível' : '✕ Oculto'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              <h2 className="text-lg font-bold mb-1 text-white">Mapeamento de Colunas (Planilhas Brutas)</h2>
              <p className="text-xs text-slate-400 mb-4">Informe as letras das colunas correspondentes. Deixe em branco caso a planilha não possua coluna de peso real (o sistema assumirá 2kg automaticamente).</p>

              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">Planilha de Custos Unitários</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna SKU</label>
                    <input type="text" maxLength={2} value={regrasCustos.sku} onChange={(e) => setRegrasCustos({ ...regrasCustos, sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Nome Produto</label>
                    <input type="text" maxLength={2} value={regrasCustos.produto} onChange={(e) => setRegrasCustos({ ...regrasCustos, produto: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Custo Unitário</label>
                    <input type="text" maxLength={2} value={regrasCustos.custo} onChange={(e) => setRegrasCustos({ ...regrasCustos, custo: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">Planilha de Regras & Medidas ML</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna MLB</label>
                    <input type="text" maxLength={2} value={regrasMlCols.mlb} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, mlb: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna SKU</label>
                    <input type="text" maxLength={2} value={regrasMlCols.sku} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Comissão (%)</label>
                    <input type="text" maxLength={2} value={regrasMlCols.comissao} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, comissao: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Peso Real (Opcional)</label>
                    <input type="text" maxLength={2} value={regrasMlCols.peso} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, peso: e.target.value })} placeholder="Ex: D (ou vazio)" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Altura</label>
                    <input type="text" maxLength={2} value={regrasMlCols.altura} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, altura: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Largura</label>
                    <input type="text" maxLength={2} value={regrasMlCols.largura} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, largura: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Comprimento</label>
                    <input type="text" maxLength={2} value={regrasMlCols.comprimento} onChange={(e) => setRegrasMlCols({ ...regrasMlCols, comprimento: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono uppercase text-center outline-none" required />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" disabled={salvando} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                  {salvando ? "A salvar..." : "Salvar Todas as Configurações"}
                </button>
              </div>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}