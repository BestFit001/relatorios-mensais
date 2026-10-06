"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function RegrasPage() {
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  const [novoCanal, setNovoCanal] = useState("Amazon");
  const [novaFaixa, setNovaFaixa] = useState("R$ 0.00 até R$ 78.99");
  const [novaComissao, setNovaComissao] = useState("14.00");
  const [novaTarifaFixa, setNovaTarifaFixa] = useState("4.00");
  const [novoFrete, setNovoFrete] = useState("0.00");

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
    carregarRegras();
  }, []);

  const carregarRegras = async () => {
    setLoading(true);
    const { data } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (data) setRegrasTarifacao(data);
    setLoading(false);
  };

  const adicionarRegra = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

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
      carregarRegras();
      alert("✅ Regra adicionada com sucesso!");
    }
    setSalvando(false);
  };

  const removerRegra = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover esta regra?")) return;
    const { error } = await supabase.from('config_regras_tarifacao').delete().eq('id', id);
    if (error) {
      alert("Erro ao remover: " + error.message);
    } else {
      carregarRegras();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Regras de Tarifação Condicional por Canal</h1>
            <p className="text-sm font-medium text-slate-400">Configure comissões, tarifas fixas e custos de frete por faixa de preço</p>
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

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">➕ Adicionar Nova Regra Condicional</h2>
          <form onSubmit={adicionarRegra} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Canal</label>
              <select value={novoCanal} onChange={(e) => setNovoCanal(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none">
                {canaisDisponiveis.map((c, i) => <option key={i} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Faixa de Preço</label>
              <input type="text" value={novaFaixa} onChange={(e) => setNovaFaixa(e.target.value)} placeholder="Ex: R$ 0.00 até R$ 78.99" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" required />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Comissão (%)</label>
              <input type="text" value={novaComissao} onChange={(e) => setNovaComissao(e.target.value)} placeholder="14.00" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" required />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tarifa Fixa (R$)</label>
              <input type="text" value={novaTarifaFixa} onChange={(e) => setNovaTarifaFixa(e.target.value)} placeholder="4.00" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" required />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Frete (R$)</label>
              <input type="text" value={novoFrete} onChange={(e) => setNovoFrete(e.target.value)} placeholder="0.00" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none" required />
            </div>

            <button type="submit" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg transition-all">
              {salvando ? "A salvar..." : "Salvar Regra"}
            </button>
          </form>
        </div>

        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white">Regras Ativas</h2>
            <p className="text-xs text-slate-400 mt-1">Lista completa de comissões, tarifas fixas e fretes configurados por canal e faixa de preço.</p>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400 font-medium">A carregar regras...</p>
          ) : regrasTarifacao.length === 0 ? (
            <p className="p-8 text-center text-slate-400 font-medium">Nenhuma regra de tarifação cadastrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
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
                <tbody className="divide-y divide-slate-800/60">
                  {regrasTarifacao.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 font-bold text-white text-sm">{r.canal}</td>
                      <td className="p-4 font-semibold text-slate-300">{r.faixa_preco}</td>
                      <td className="p-4 text-center font-bold text-rose-400">{Number(r.comissao).toFixed(2)}%</td>
                      <td className="p-4 text-center font-mono text-slate-200">R$ {Number(r.tarifa_fixa).toFixed(2)}</td>
                      <td className="p-4 text-center font-mono text-slate-200">R$ {Number(r.frete).toFixed(2)}</td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => removerRegra(r.id)} 
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
    </div>
  );
}