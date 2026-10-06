"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

export default function MapeamentoPage() {
  const [loading, setLoading] = useState(false);
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
  const [dadosCompletos, setDadosCompletos] = useState<any[]>([]);
  
  const [filtroStatus, setFiltroStatus] = useState("TODOS"); 
  const [filtroEstoque, setFiltroEstoque] = useState("ComEstoque"); 
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

  const normalizarSku = (valor: any) => {
    if (valor === null || valor === undefined) return "";
    let s = String(valor).trim();
    if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
    return s;
  };

  const carregarDadosAnalise = async () => {
    setLoading(true);

    const { data: regras } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regras) setRegrasCanais(regras);

    let allTiny: any[] = [];
    let from = 0;
    let batchSize = 1000;
    let fetching = true;
    while (fetching) {
      const { data, error } = await supabase
        .from('cadastros_base_tiny')
        .select('sku, estoque')
        .range(from, from + batchSize - 1);
      
      if (error || !data || data.length === 0) {
        fetching = false;
      } else {
        allTiny = [...allTiny, ...data];
        if (data.length < batchSize) {
          fetching = false;
        } else {
          from += batchSize;
        }
      }
    }

    const { data: statusData } = await supabase.from('status_skus_catalogo').select('*');
    const mapaStatus = new Map(statusData?.map(s => [normalizarSku(s.sku), s.status]) || []);

    let allMapas: any[] = [];
    from = 0;
    fetching = true;
    while (fetching) {
      const { data, error } = await supabase
        .from('mapeamento_canais_skus')
        .select('*')
        .range(from, from + batchSize - 1);

      if (error || !data || data.length === 0) {
        fetching = false;
      } else {
        allMapas = [...allMapas, ...data];
        if (data.length < batchSize) {
          fetching = false;
        } else {
          from += batchSize;
        }
      }
    }

    const presencaSet = new Set(
      allMapas.filter(m => m.presente).map(m => `${m.canal}___${normalizarSku(m.sku)}`)
    );

    const resultado = allTiny.map(item => {
      const skuNorm = normalizarSku(item.sku);
      const estoque = Number(item.estoque || 0);
      const status = mapaStatus.get(skuNorm) || 'Normal';

      const canaisPresente: { [key: string]: boolean } = {};
      regras?.forEach(r => {
        canaisPresente[r.canal] = presencaSet.has(`${r.canal}___${skuNorm}`);
      });

      return {
        sku: item.sku,
        skuNorm,
        estoque,
        status,
        comEstoque: estoque > 0,
        canais: canaisPresente
      };
    });

    setDadosCompletos(resultado);
    setLoading(false);
  };

  const dadosBaseFiltrados = dadosCompletos.filter(item => {
    const matchStatus = filtroStatus === "TODOS" || item.status === filtroStatus;
    
    let matchEstoque = true;
    if (filtroEstoque === "ComEstoque") matchEstoque = item.comEstoque;
    if (filtroEstoque === "SemEstoque") matchEstoque = !item.comEstoque;

    return matchStatus && matchEstoque;
  });

  const totalBaseFiltrados = dadosBaseFiltrados.length;
  const progressoCanaisFiltrados = regrasCanais.map(r => {
    let countPresentes = 0;
    dadosBaseFiltrados.forEach(item => {
      if (item.canais[r.canal]) countPresentes++;
    });
    const percentual = totalBaseFiltrados > 0 ? (countPresentes / totalBaseFiltrados) * 100 : 0;
    return {
      canal: r.canal,
      cadastrados: countPresentes,
      total: totalBaseFiltrados,
      percentual: percentual.toFixed(1)
    };
  });

  const termoPesquisaLimpo = pesquisaSku.trim();
  const skusPesquisadosArray = termoPesquisaLimpo !== "" 
    ? termoPesquisaLimpo.split(',').map(s => normalizarSku(s).toLowerCase()).filter(Boolean)
    : [];

  const dadosTabelaFinal = dadosBaseFiltrados.filter(item => {
    if (skusPesquisadosArray.length === 0) return false;
    const skuItemLower = item.skuNorm.toLowerCase();
    return skusPesquisadosArray.some(s => skuItemLower.includes(s));
  });

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[96%] mx-auto">
        
        {/* CABEÇALHO UNIFICADO COM O NAVBAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Análise e Progresso de Cadastros</h1>
            <p className="text-sm font-medium text-slate-400">Monitorize a presença do catálogo por canal com filtros avançados</p>
          </div>

          <Navbar />
        </div>

        {/* FILTROS E PESQUISA */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 flex-1">
            <div className="flex-1 min-w-[280px]">
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Pesquisar SKU(s) para auditoria:</label>
              <input 
                type="text" 
                value={pesquisaSku} 
                onChange={(e) => setPesquisaSku(e.target.value)} 
                placeholder="Ex: SKU001, SKU002..."
                className="border border-slate-700 rounded-xl p-2.5 w-full text-xs font-semibold bg-slate-950 text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Filtro de Estoque:</label>
              <select 
                value={filtroEstoque} 
                onChange={(e) => setFiltroEstoque(e.target.value)}
                className="border border-slate-700 rounded-xl p-2.5 text-xs font-semibold bg-slate-950 text-white outline-none cursor-pointer"
              >
                <option value="ComEstoque">Com estoque no Tiny (&gt; 0)</option>
                <option value="SemEstoque">Sem estoque no Tiny (≤ 0)</option>
                <option value="TODOS">Todos os produtos</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Status:</label>
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
          </div>

          <div className="text-xs font-bold text-slate-400">
            Universo filtrado: <strong className="text-white">{totalBaseFiltrados}</strong> SKUs
          </div>
        </div>

        {/* GRÁFICOS DE PROGRESSO */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold mb-2 text-white">Progresso de Cadastros por Canal</h2>
          <p className="text-xs text-slate-400 mb-6">Cobertura dos canais considerando o universo filtrado.</p>

          {loading ? (
            <p className="p-6 text-center text-slate-400 font-medium">A carregar dados completos...</p>
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
            <p className="text-xs text-slate-400 mt-1">Utilize o campo de pesquisa para auditar itens específicos dentro do filtro selecionado.</p>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400 font-medium">A carregar auditoria...</p>
          ) : skusPesquisadosArray.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-medium">
              <p className="text-sm mb-1">🔍 Digite um ou mais SKUs na barra de pesquisa acima para visualizar os dados na tabela.</p>
            </div>
          ) : dadosTabelaFinal.length === 0 ? (
            <p className="p-8 text-center text-slate-400 font-medium">Nenhum SKU encontrado com os termos pesquisados.</p>
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
                  {dadosTabelaFinal.map((item, index) => (
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