"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function RegrasPage() {
  const [regras, setRegras] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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

  const atualizarColunaSku = async (id: number, canal: string, novaColuna: string) => {
    const { error } = await supabase
      .from('config_regras_canais')
      .update({ coluna_sku: novaColuna })
      .eq('id', id);

    if (error) {
      alert("Erro ao atualizar regra: " + error.message);
      return;
    }

    setRegras(prev =>
      prev.map(r => r.id === id ? { ...r, coluna_sku: novaColuna } : r)
    );
  };

  const handleLogout = () => {
    localStorage.removeItem("usuario_logado");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Regras de Mapeamento por Canal</h1>
            <p className="text-sm font-medium text-slate-400">Defina qual o nome exato da coluna de SKU em cada planilha de canal</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">
                Dashboard
              </Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/upload">
                Upload
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

        {/* TABELA DE REGRAS */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <h2 className="text-lg font-bold mb-2 text-white">Configuração dos Canais</h2>
          <p className="text-xs text-slate-400 mb-6">
            O sistema vai ler automaticamente a coluna especificada abaixo ao importar as planilhas de cada canal, cruzando estritamente com a base de SKUs do Tiny ERP e ignorando o resto.
          </p>

          {loading ? (
            <p className="p-6 text-center text-slate-400 font-medium">A carregar regras...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-4">Canal de Venda</th>
                    <th className="p-4">Nome da Coluna de SKU na Planilha</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {regras.map((regra) => (
                    <tr key={regra.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 font-bold text-slate-200 text-sm">{regra.canal}</td>
                      <td className="p-4">
                        <input
                          type="text"
                          defaultValue={regra.coluna_sku}
                          onBlur={(e) => atualizarColunaSku(regra.id, regra.canal, e.target.value)}
                          className="border border-slate-700 rounded-xl p-2.5 bg-slate-950 text-white text-xs w-64 outline-none focus:border-indigo-500 font-mono shadow-inner"
                        />
                      </td>
                      <td className="p-4 text-right text-slate-400">
                        <span className="text-[11px] bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
                          Guardado automaticamente ao sair do campo
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}