"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function MapeamentoPage() {
  const [loading, setLoading] = useState(false);
  const [estatisticasCanais, setEstatisticasCanais] = useState<any[]>([]);
  const [pesquisaSku, setPesquisaSku] = useState("");
  const [filtroEstoque, setFiltroEstoque] = useState("com-estoque");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [dadosAuditoria, setDadosAuditoria] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosMapeamento();
  }, []);

  const carregarDadosMapeamento = async () => {
    setLoading(true);

    // Carregar canais configurados
    const { data: regrasCanais } = await supabase.from('config_regras_canais').select('*').order('id');
    
    // Carregar base tiny (SKUs e estoque)
    let allTiny: any[] = [];
    let from = 0;
    let step = 1000;
    let keep = true;
    while (keep) {
      const { data } = await supabase.from('cadastros_base_tiny').select('sku, estoque').range(from, from + step - 1);
      if (data && data.length > 0) {
        allTiny = [...allTiny, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else {
        keep = false;
      }
    }

    // Carregar status dos SKUs
    const { data: statusData } = await supabase.from('status_skus_catalogo').select('sku, status');
    const mapaStatus = new Map(statusData?.map(s => [String(s.sku).trim(), s.status]) || []);

    // Carregar mapeamento por canal
    const { data: mapeamentoData } = await supabase.from('mapeamento_canais_skus').select('*');
    const mapaPresenca = new Map<string, Set<string>>();
    
    if (regrasCanais) {
      regrasCanais.forEach(r => mapaPresenca.set(r.canal, new Set()));
    }

    if (mapeamentoData) {
      mapeamentoData.forEach(m => {
        if (m.presente) {
          if (!mapaPresenca.has(m.canal)) mapaPresenca.set(m.canal, new Set());
          mapaPresenca.get(m.canal)?.add(String(m.sku).trim());
        }
      });
    }

    // Filtrar universo conforme critérios
    const skusFiltrados = allTiny.filter(item => {
      const skuStr = String(item.sku).trim();
      const estoqueVal = Number(item.estoque || 0);
      const statusVal = mapaStatus.get(skuStr) || 'Normal';

      const matchEstoque = filtroEstoque === "todos" || (filtroEstoque === "com-estoque" ? estoqueVal > 0 : estoqueVal === 0);
      const matchStatus = filtroStatus === "TODOS" || statusVal === filtroStatus;
      const matchPesquisa = pesquisaSku === "" || skuStr.toLowerCase().includes(pesquisaSku.toLowerCase().trim());

      return matchEstoque && matchStatus && matchPesquisa;
    });

    const totalUniverso = skusFiltrados.length;

    // Calcular progresso por canal
    const stats = regrasCanais?.map(r => {
      const setCanal = mapaPresenca.get(r.canal) || new Set();
      const presentes = skusFiltrados.filter(item => setCanal.has(String(item.sku).trim())).length;
      const percentual = totalUniverso > 0 ? (presentes / totalUniverso) * 100 : 0;

      return {
        canal: r.canal,
        presentes,
        total: totalUniverso,
        percentual: percentual.toFixed(1)
      };
    }) || [];

    setEstatisticasCanais(stats);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[96%] mx-auto">
        
        {/* CABEÇALHO COM A BARRA DE NAVEGAÇÃO COMPLETA INCLUINDO PAINEL ADS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Análise e Progresso de Cadastros</h1>
            <p className="text-sm font-medium text-slate-400">Monitorize a presença do catálogo por canal</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800 flex-wrap gap-1">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">Dashboard</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/upload">Upload & Canais</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/mapeamento">Mapeamento</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/ads">Painel Ads</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/regras">Regras</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">Admin</Link>
            </div>
          </div>
        </div>

        {/* FILTROS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8 flex flex-wrap items-center gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Filtro de Estoque:</label>
            <select 
              value={filtroEstoque} 
              onChange={(e) => { setFiltroEstoque(e.target.value); carregarDadosMapeamento(); }}
              className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer"
            >
              <option value="com-estoque">Com estoque no Tiny (&gt; 0)</option>
              <option value="todos">Todos os SKUs</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Status:</label>
            <select 
              value={filtroStatus} 
              onChange={(e) => { setFiltroStatus(e.target.value); carregarDadosMapeamento(); }}
              className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer"
            >
              <option value="TODOS">Todos os Status</option>
              <option value="Normal">Normal</option>
              <option value="Obsoleto">Obsoleto</option>
            </select>
          </div>
        </div>

        {/* PROGRESSO POR CANAL */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-2">Progresso de Cadastros por Canal</h2>
          <p className="text-xs text-slate-400 mb-6">Cobertura dos canais considerando o universo filtrado.</p>

          {loading ? (
            <p className="p-8 text-center text-slate-400">A calcular progresso...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {estatisticasCanais.map((stat, idx) => (
                <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-bold text-white text-sm">{stat.canal}</span>
                    <span className="font-black text-indigo-400 text-sm">{stat.percentual}%</span>
                  </div>

                  <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden mb-3">
                    <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${stat.percentual}%` }}></div>
                  </div>

                  <span className="text-[11px] text-slate-400">{stat.presentes} de {stat.total} SKUs presentes</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}