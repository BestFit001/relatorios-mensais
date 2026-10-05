"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function RegrasPage() {
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
  const [regrasTiny, setRegrasTiny] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarRegras();
  }, []);

  const carregarRegras = async () => {
    setLoading(true);
    const { data: canais } = await supabase.from('config_regras_canais').select('*').order('id');
    const { data: tiny } = await supabase.from('config_regras_tiny').select('*').order('id');

    if (canais) setRegrasCanais(canais);
    if (tiny) setRegrasTiny(tiny);
    setLoading(false);
  };

  const alterarCanalLocal = (id: number, novaLetra: string) => {
    setRegrasCanais(prev =>
      prev.map(r => r.id === id ? { ...r, coluna_sku: novaLetra.trim().toUpperCase() } : r)
    );
  };

  const alterarTinyLocal = (id: number, novaLetra: string) => {
    setRegrasTiny(prev =>
      prev.map(r => r.id === id ? { ...r, coluna: novaLetra.trim().toUpperCase() } : r)
    );
  };

  const salvarTodasRegras = async () => {
    setSalvando(true);
    
    for (const regra of regrasCanais) {
      await supabase.from('config_regras_canais').update({ coluna_sku: regra.coluna_sku }).eq('id', regra.id);
    }

    for (const regra of regrasTiny) {
      await supabase.from('config_regras_tiny').update({ coluna: regra.coluna }).eq('id', regra.id);
    }

    setSalvando(false);
    alert("✅ Todas as regras de colunas foram salvas com sucesso!");
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-5xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Regras de Mapeamento de Colunas</h1>
            <p className="text-sm font-medium text-slate-400">Defina as posições (letras das colunas ex: A, B, C) para o Tiny ERP, Status e Canais</p>
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

        {/* TINY E STATUS */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">📦 Configuração do Tiny ERP e Status</h2>
              <p className="text-xs text-slate-400 mt-1">Informe as colunas correspondentes para a base e para o status dos SKUs.</p>
            </div>
            <button onClick={salvarTodasRegras} disabled={salvando} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg text-xs uppercase tracking-wider cursor-pointer">
              {salvando ? "A salvar..." : "💾 Salvar Regras"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {regrasTiny.map((tiny) => (
              <div key={tiny.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-200 text-sm uppercase">
                    {tiny.campo === 'sku' && 'Coluna SKU (Tiny)'}
                    {tiny.campo === 'estoque' && 'Coluna Estoque (Tiny)'}
                    {tiny.campo === 'status_sku' && 'Coluna SKU (Status)'}
                    {tiny.campo === 'status_valor' && 'Coluna Status (Status)'}
                  </span>
                  <p className="text-[11px] text-slate-400">Letra da coluna correspondente</p>
                </div>
                <input
                  type="text"
                  maxLength={3}
                  value={tiny.coluna}
                  onChange={(e) => alterarTinyLocal(tiny.id, e.target.value)}
                  className="border border-slate-700 rounded-xl p-2.5 bg-slate-900 text-white text-xs w-24 text-center uppercase font-mono outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* CANAIS */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">🛒 Configuração dos 11 Canais de Venda</h2>
              <p className="text-xs text-slate-400 mt-1">Defina a letra da coluna de SKU para cada Marketplace.</p>
            </div>
            <button onClick={salvarTodasRegras} disabled={salvando} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg text-xs uppercase tracking-wider cursor-pointer">
              {salvando ? "A salvar..." : "💾 Salvar Regras"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-4">Canal de Venda</th>
                  <th className="p-4">Letra da Coluna de SKU (Ex: A, B, C)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {regrasCanais.map((regra) => (
                  <tr key={regra.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-bold text-slate-200 text-sm">{regra.canal}</td>
                    <td className="p-4">
                      <input
                        type="text"
                        maxLength={3}
                        value={regra.coluna_sku}
                        onChange={(e) => alterarCanalLocal(regra.id, e.target.value)}
                        className="border border-slate-700 rounded-xl p-2.5 bg-slate-950 text-white text-xs w-32 text-center uppercase font-mono outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}