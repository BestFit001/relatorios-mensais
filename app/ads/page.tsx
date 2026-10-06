"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AdsPage() {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  // Filtros de Canal e Mês
  const [canalSelecionado, setCanalSelecionado] = useState("");
  const [mesSelecionado, setMesSelecionado] = useState("09/2026");

  const [canais, setCanais] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);

  // Linhas para inserção dinâmica (tabela editável)
  const [linhas, setLinhas] = useState([
    { identificador: "", anuncio: "", unidades: "", investimento: "", retorno: "", faturamento: "" }
  ]);

  const mesesCompetencia = [
    "01/2026", "02/2026", "03/2026", "04/2026", "05/2026", "06/2026", 
    "07/2026", "08/2026", "09/2026", "10/2026", "11/2026", "12/2026"
  ];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarCanais();
  }, []);

  useEffect(() => {
    if (canalSelecionado && mesSelecionado) {
      carregarLancamentos();
    }
  }, [canalSelecionado, mesSelecionado]);

  const carregarCanais = async () => {
    const { data } = await supabase.from('config_regras_canais').select('*').order('id');
    if (data && data.length > 0) {
      setCanais(data);
      setCanalSelecionado(data[0].canal);
    } else {
      const padrao = [
        { canal: "Mercado Livre 1" }, { canal: "Mercado Livre 2" },
        { canal: "Shopee" }, { canal: "Amazon" }, { canal: "TikTok" }, { canal: "Magalu" },
        { canal: "Shein" }, { canal: "Netshoes" }, { canal: "Site" }, { canal: "Centauro" }
      ];
      setCanais(padrao);
      setCanalSelecionado(padrao[0].canal);
    }
  };

  const carregarLancamentos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ads_campanhas_lancamentos')
      .select('*')
      .eq('canal', canalSelecionado)
      .eq('mes_referencia', mesSelecionado)
      .order('id');

    if (data) setLancamentos(data);
    setLoading(false);
  };

  const adicionarLinhaForm = () => {
    setLinhas([...linhas, { identificador: "", anuncio: "", unidades: "", investimento: "", retorno: "", faturamento: "" }]);
  };

  const atualizarLinhaForm = (index: number, campo: string, valor: string) => {
    const novasLinhas = [...linhas];
    novasLinhas[index] = { ...novasLinhas[index], [campo]: valor };
    setLinhas(novasLinhas);
  };

  const removerLinhaForm = (index: number) => {
    setLinhas(linhas.filter((_, i) => i !== index));
  };

  const salvarLancamentos = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const formatados = linhas
      .filter(l => l.identificador.trim() !== "")
      .map(l => ({
        canal: canalSelecionado,
        mes_referencia: mesSelecionado,
        identificador_anuncio: l.identificador.trim(),
        nome_anuncio: l.anuncio.trim() || "Anúncio sem nome",
        unidades_vendidas: Number(l.unidades || 0),
        investimento: Number(l.investimento || 0),
        retorno_bruto: Number(l.retorno || 0),
        faturamento_total: Number(l.faturamento || 0)
      }));

    if (formatados.length === 0) {
      alert("Preencha pelo menos um ID/Anúncio válido.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase.from('ads_campanhas_lancamentos').insert(formatados);
    if (error) {
      alert("Erro ao gravar lançamentos: " + error.message);
    } else {
      alert("✅ Lançamentos de Ads salvos com sucesso!");
      setLinhas([{ identificador: "", anuncio: "", unidades: "", investimento: "", retorno: "", faturamento: "" }]);
      carregarLancamentos();
    }
    setSalvando(false);
  };

  const excluirLancamento = async (id: number) => {
    if (!confirm("Tem certeza que deseja apagar este registo?")) return;
    const { error } = await supabase.from('ads_campanhas_lancamentos').delete().eq('id', id);
    if (error) alert("Erro ao excluir: " + error.message);
    else carregarLancamentos();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[96%] mx-auto">
        
        {/* TOPO DE NAVEGAÇÃO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Unificado de Ads & Campanhas</h1>
            <p className="text-sm font-medium text-slate-400">Insira e monitorize o desempenho de anúncios por canal e mês</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">Dashboard</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/upload">Upload & Canais</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/mapeamento">Mapeamento</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/ads">Painel Ads</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/regras">Regras</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">Admin</Link>
            </div>
          </div>
        </div>

        {/* SELETOR DE CANAIS EM FORMATO DE BOTÕES CLICÁVEIS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-6">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Selecione o Canal:</label>
          <div className="flex flex-wrap gap-2.5">
            {canais.map((c, i) => {
              const ativo = canalSelecionado === c.canal;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCanalSelecionado(c.canal)}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs tracking-wide cursor-pointer transition-all shadow-sm ${
                    ativo 
                      ? 'bg-purple-600 text-white shadow-purple-900/40 shadow-md scale-105' 
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {c.canal}
                </button>
              );
            })}
          </div>
        </div>

        {/* SELETOR DE MÊS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8 flex items-center gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Selecione o Mês / Período:</label>
            <select 
              value={mesSelecionado} 
              onChange={(e) => setMesSelecionado(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer min-w-[180px]"
            >
              {mesesCompetencia.map((m, i) => <option key={i} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* FORMULÁRIO DE INSERÇÃO EM LOTE */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold text-white mb-2">➕ Inserir Novos Anúncios / Campanhas</h2>
          <p className="text-xs text-slate-400 mb-6">Insira as informações de ID/MLB, unidades, investimento e retorno para o canal <strong>{canalSelecionado}</strong> ({mesSelecionado}).</p>

          <form onSubmit={salvarLancamentos} className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">ID / MLB / SKU</th>
                    <th className="p-3">Nome / Descrição Anúncio</th>
                    <th className="p-3 text-center">Unid. Vendidas</th>
                    <th className="p-3 text-right">Investimento (R$)</th>
                    <th className="p-3 text-right">Retorno Bruto (R$)</th>
                    <th className="p-3 text-right">Faturamento Total (R$)</th>
                    <th className="p-3 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {linhas.map((l, index) => (
                    <tr key={index} className="bg-slate-950/40">
                      <td className="p-2">
                        <input 
                          type="text" 
                          value={l.identificador} 
                          onChange={(e) => atualizarLinhaForm(index, "identificador", e.target.value)}
                          placeholder="Ex: MLB123456" 
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none"
                          required 
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="text" 
                          value={l.anuncio} 
                          onChange={(e) => atualizarLinhaForm(index, "anuncio", e.target.value)}
                          placeholder="Título do anúncio" 
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none" 
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number" 
                          value={l.unidades} 
                          onChange={(e) => atualizarLinhaForm(index, "unidades", e.target.value)}
                          placeholder="0" 
                          className="w-24 mx-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center text-white outline-none" 
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={l.investimento} 
                          onChange={(e) => atualizarLinhaForm(index, "investimento", e.target.value)}
                          placeholder="0.00" 
                          className="w-32 ml-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-white outline-none" 
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={l.retorno} 
                          onChange={(e) => atualizarLinhaForm(index, "retorno", e.target.value)}
                          placeholder="0.00" 
                          className="w-32 ml-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-white outline-none" 
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={l.faturamento} 
                          onChange={(e) => atualizarLinhaForm(index, "faturamento", e.target.value)}
                          placeholder="0.00" 
                          className="w-32 ml-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-white outline-none" 
                        />
                      </td>
                      <td className="p-2 text-center">
                        {linhas.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => removerLinhaForm(index)}
                            className="bg-rose-950/60 text-rose-400 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3">
              <button 
                type="button" 
                onClick={adicionarLinhaForm}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                + Adicionar Outra Linha
              </button>

              <button 
                type="submit" 
                disabled={salvando}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg"
              >
                {salvando ? "A gravar..." : "🚀 Gravar Lançamentos"}
              </button>
            </div>
          </form>
        </div>

        {/* TABELA DE REGISTOS GRAVADOS */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-white">Anúncios Registrados ({canalSelecionado} - {mesSelecionado})</h2>
              <p className="text-xs text-slate-400 mt-1">Histórico de campanhas armazenado para este período.</p>
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400 font-medium">A carregar registos...</p>
          ) : lancamentos.length === 0 ? (
            <p className="p-8 text-center text-slate-500 font-medium">Nenhum registo encontrado para este canal no período selecionado.</p>
          ) : (
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3.5">ID / MLB / SKU</th>
                    <th className="p-3.5">Nome / Anúncio</th>
                    <th className="p-3.5 text-center">Unidades</th>
                    <th className="p-3.5 text-right">Investimento</th>
                    <th className="p-3.5 text-right">Retorno Bruto</th>
                    <th className="p-3.5 text-right">ROAS</th>
                    <th className="p-3.5 text-right">TACOS</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {lancamentos.map((item) => {
                    const roas = item.investimento > 0 ? (item.retorno_bruto / item.investimento).toFixed(2) : "0.00";
                    const tacos = item.faturamento_total > 0 ? ((item.investimento / item.faturamento_total) * 100).toFixed(2) : "0.00";
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-slate-200">{item.identificador_anuncio}</td>
                        <td className="p-3.5 text-slate-300">{item.nome_anuncio}</td>
                        <td className="p-3.5 text-center font-bold text-white">{item.unidades_vendidas}</td>
                        <td className="p-3.5 text-right font-mono text-rose-400 font-bold">R$ {Number(item.investimento).toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-emerald-400 font-bold">R$ {Number(item.retorno_bruto).toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-indigo-400">{roas}x</td>
                        <td className="p-3.5 text-right font-mono font-bold text-amber-400">{tacos}%</td>
                        <td className="p-3.5 text-center">
                          <button 
                            onClick={() => excluirLancamento(item.id)}
                            className="bg-rose-950/60 text-rose-400 px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}