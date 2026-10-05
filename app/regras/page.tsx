"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function RegrasPage() {
  const [regras, setRegras] = useState<any[]>([]);
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
    const { data, error } = await supabase
      .from('config_regras_canais')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error("Erro ao carregar regras:", error.message);
    } else if (data) {
      setRegras(data);
    }
    setLoading(false);
  };

  const alterarValorLocal = (id: number, novaLetra: string) => {
    setRegras(prev =>
      prev.map(r => r.id === id ? { ...r, coluna_sku: novaLetra.trim().toUpperCase() } : r)
    );
  };

  const salvarTodasRegras = async () => {
    setSalvando(true);
    
    // Atualiza cada regra no Supabase
    for (const regra of regras) {
      const { error } = await supabase
        .from('config_regras_canais')
        .update({ coluna_sku: regra.coluna_sku })
        .eq('id', regra.id);

      if (error) {
        alert(`Erro ao salvar o canal ${regra.canal}: ${error.message}`);
        setSalvando(false);
        return;
      }
    }

    setSalvando(false);
    alert("✅ Todas as regras de colunas foram salvas com sucesso! Elas serão lembradas permanentemente nos próximos uploads.");
  };

  const handleLogout = () => {
    localStorage.removeItem("usuario_logado");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-5xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Regras de Mapeamento por Canal</h1>
            <p className="text-sm font-medium text-slate-400">Defina a letra da coluna (ex: A, B, C) onde fica o SKU em cada canal</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">
                Dashboard
              </Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/upload">
                Upload & Canais
              </Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/regras">
                Regras
              </Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">
                Admin
              </Link>
            </div>
            <button
              onClick={handleLogout}
              className="bg-slate-900 hover:bg-rose-950/60 text-rose-400 border border-slate-800 hover:border-rose-900/50 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">Configuração da Posição da Coluna</h2>
              <p className="text-xs text-slate-400 mt-1">
                Insira a letra correspondente à coluna (Ex: <strong>A</strong> para a 1ª coluna, <strong>B</strong> para a 2ª, etc.) e clique em salvar.
              </p>
            </div>
            <button
              onClick={salvarTodasRegras}
              disabled={salvando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg text-xs uppercase tracking-wider cursor-pointer transition-all"
            >
              {salvando ? "A salvar..." : "💾 Salvar Regras"}
            </button>
          </div>

          {loading ? (
            <p className="p-6 text-center text-slate-400 font-medium">A carregar regras...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-4">Canal de Venda</th>
                    <th className="p-4">Letra da Coluna de SKU (Ex: A, B, C)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {regras.map((regra) => (
                    <tr key={regra.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 font-bold text-slate-200 text-sm">{regra.canal}</td>
                      <td className="p-4">
                        <input
                          type="text"
                          maxLength={3}
                          value={regra.coluna_sku}
                          onChange={(e) => alterarValorLocal(regra.id, e.target.value)}
                          className="border border-slate-700 rounded-xl p-2.5 bg-slate-950 text-white text-xs w-32 text-center uppercase font-mono outline-none focus:border-indigo-500 shadow-inner"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-800 flex justify-end">
            <button
              onClick={salvarTodasRegras}
              disabled={salvando}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg text-xs uppercase tracking-wider cursor-pointer transition-all"
            >
              {salvando ? "A salvar alterações..." : "💾 Salvar Regras Definitivamente"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}