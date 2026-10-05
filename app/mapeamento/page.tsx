"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function MapeamentoPage() {
  const [loading, setLoading] = useState(false);
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
  const [dadosCompletos, setDadosCompletos] = useState<any[]>([]);
  
  const [filtroStatus, setFiltroStatus] = useState("TODOS"); 
  const [filtroEstoque, setFiltroEstoque] = useState("TODOS"); 
  const [pesquisaSku, setPesquisaSku] = useState("");

  const router = useRouter();

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosAnalise();
  }, []);

  const carregarDadosAnalise = async () => {
    setLoading(true);

    const { data: regras } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regras) setRegrasCanais(regras);

    let allTiny: any[] = [];
    let rangeStep = 1000;
    let from = 0;
    let keepFetching = true;
    while (keepFetching) {
      const { data } = await supabase.from('cadastros_base_tiny').select('sku, estoque').range(from, from + rangeStep - 1);
      if (data && data.length > 0) {
        allTiny = [...allTiny, ...data];
        from += rangeStep;
        if (data.length < rangeStep) keepFetching = false;
      } else {
        keepFetching = false;
      }
    }

    const { data: statusData } = await supabase.from('status_skus_catalogo').select('*');
    const mapaStatus = new Map(statusData?.map(s => [s.sku, s.status]) || []);

    const { data: mapaCanais } = await supabase.from('mapeamento_canais_skus').select('*');
    const presencaSet = new Set(
      mapaCanais?.filter(m => m.presente).map(m => `${m.canal}___${m.sku}`) || []
    );

    const resultado = allTiny.map(item => {
      const sku = item.sku;
      const estoque = Number(item.estoque || 0);
      const status = mapaStatus.get(sku) || 'Normal';

      const canaisPresente: { [key: string]: boolean } = {};
      regras?.forEach(r => {
        canaisPresente[r.canal] = presencaSet.has(`${r.canal}___${sku}`);
      });

      return {
        sku,
        estoque,
        status,
        comEstoque: estoque > 0,
        canais: canaisPresente
      };
    });

    setDadosCompletos(resultado);
    setLoading(false);
  };

  const dadosFiltrados = dadosCompletos.filter(item => {
    const matchSku = item.sku.toLowerCase().includes(pesquisaSku.toLowerCase().trim());
    const matchStatus = filtroStatus === "TODOS" || item.status === filtroStatus;
    
    let matchEstoque = true;
    if (filtroEstoque === "ComEstoque") matchEstoque = item.comEstoque;
    if (filtroEstoque === "SemEstoque") matchEstoque = !item.comEstoque;

    return matchSku && matchStatus && matchEstoque;
  });

  const totalFiltrados = dadosFiltrados.length;
  const progressoCanaisFiltrados = regrasCanais.map(r => {
    let countPresentes = 0;
    dadosFiltrados.forEach(item => {
      if (item.canais[r.canal]) countPresentes++;
    });
    const percentual = totalFiltrados > 0 ? (countPresentes / totalFiltrados) * 100 : 0;
    return {
      canal: r.canal,
      cadastrados: countPresentes,
      total: totalFiltrados,
      percentual: percentual.toFixed(1)
    };
  });

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[96%] mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Análise e Progresso de Cadastros</h1>
            <p className="text-sm font-medium text-slate-400">Monitorize a presença do catálogo por canal com filtros avançados</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">Dashboard</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/upload">Upload & Canais</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/mapeamento">Mapeamento</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/regras">Regras</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">Admin</Link>
            </div>
          </div>
        </div>

        {/* FILTROS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Pesquisar SKU:</label>
              <input 
                type="text" 
                value={pesquisaSku} 
                onChange={(e) => setPesquisaSku(e.target.value)} 
                placeholder="Digite o SKU exato..."
                className="border border-slate-700 rounded-xl p-2.5 w-48 text-xs font-semibold bg-slate-950 text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Status do SKU:</label>
              <select 
                value={filtroStatus} 
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="border border-slate-700 rounded-xl p-2.5 text-xs font-semibold bg-slate-950 text-white outline-none cursor-pointer"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="Normal">Normais</option>
                <option value="Obsoleto">Obsoletos</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Estoque:</label>
              <select 
                value={filtroEstoque} 
                onChange={(e) => setFiltroEstoque(e.target.value)}
                className="border border-slate-700 rounded-xl p-2.5 text-xs font-semibold bg-slate-950 text-white outline-none cursor-pointer"
              >
                <option value="TODOS">Todo o Estoque</option>
                <option value="ComEstoque">Com Estoque (&gt; 0)</option>
                <option value="SemEstoque">Sem Estoque (≤ 0)</option>
              </select>
            </div>
          </div>

          <div className="text-xs font-bold text-slate-400">
            A exibir <strong className="text-white">{totalFiltrados}</strong> SKUs filtrados
          </div>
        </div>

        {/* GRÁFICOS DE PROGRESSO */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold mb-2 text-white">Progresso de Cadastros por Canal</h2>
          <p className="text-xs text-slate-400 mb-6">Acompanhe a cobertura do catálogo nos marketplaces com base nos filtros aplicados.</p>

          {loading ? (
            <p className="p-6 text-center text-slate-400 font-medium">A calcular rácios...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {progressoCanaisFiltrados.map((p, idx) => (
                <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white text-sm">{p.canal}</span>
                    <span className="text-xs font-mono font-bold text-indigo-400">{p.percentual}%</span>
                  </div>
                  
                  <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${Math.min(Number(p.percentual), 100)}%` }}></div>
                  </div>

                  <p className="text-[11px] text-slate-400"><strong>{p.cadastrados}</strong> de <strong>{p.total}</strong> SKUs presentes</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TABELA DE AUDITORIA */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white">Auditoria Detalhada de SKUs por Canal</h2>
            <p className="text-xs text-slate-400 mt-1">Verifique onde cada item está cadastrado (✅) ou ausente (❌).</p>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400 font-medium">A carregar auditoria...</p>
          ) : dadosFiltrados.length === 0 ? (
            <p className="p-8 text-center text-slate-400 font-medium">Nenhum SKU encontrado com os filtros selecionados.</p>
          ) : (
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Estoque</th>
                    {regrasCanais.map((r, i) => (
                      <th key={i} className="p-3.5 text-center">{r.canal}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {dadosFiltrados.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-slate-200">{item.sku}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'Obsoleto' ? 'bg-rose-950/60 text-rose-400 border border-rose-900/50' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className={`p-3.5 text-right font-bold ${item.estoque > 0 ? 'text-indigo-400' : 'text-slate-500'}`}>
                        {item.estoque}
                      </td>
                      {regrasCanais.map((r, i) => {
                        const presente = item.canais[r.canal];
                        return (
                          <td key={i} className="p-3.5 text-center text-sm">
                            {presente ? <span className="text-emerald-400 font-bold">✅</span> : <span className="text-rose-500/60">❌</span>}
                          </td>
                        );
                      })}
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