"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { calcularFreteML } from "../../lib/calculoFrete";

export default function AdsPage() {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  const [canalSelecionado, setCanalSelecionado] = useState("Mercado Livre 1");
  const [mesSelecionado, setMesSelecionado] = useState("09/2026");

  const [canais, setCanais] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [regrasMlMap, setRegrasMlMap] = useState<Map<string, any>>(new Map());

  // Inserção com os 4 campos principais solicitados
  const [linhas, setLinhas] = useState([
    { mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "" }
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
    carregarDadosAuxiliares();
  }, []);

  useEffect(() => {
    if (canalSelecionado && mesSelecionado) {
      carregarLancamentos();
    }
  }, [canalSelecionado, mesSelecionado]);

  const carregarDadosAuxiliares = async () => {
    const { data: regrasCanaisData } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regrasCanaisData && regrasCanaisData.length > 0) {
      setCanais(regrasCanaisData);
      setCanalSelecionado(regrasCanaisData[0].canal);
    } else {
      const padrao = [
        { canal: "Mercado Livre 1" }, { canal: "Mercado Livre 2" },
        { canal: "Shopee" }, { canal: "Amazon" }, { canal: "TikTok" }, { canal: "Magalu" },
        { canal: "Shein" }, { canal: "Netshoes" }, { canal: "Site" }, { canal: "Centauro" }
      ];
      setCanais(padrao);
      setCanalSelecionado(padrao[0].canal);
    }

    // Carregar Custos
    const { data: custosData } = await supabase.from('tabela_custos_skus').select('*');
    if (custosData) {
      const mapaC = new Map();
      custosData.forEach((c: any) => mapaC.set(String(c.sku).trim(), c));
      setCustosMap(mapaC);
    }

    // Carregar Regras ML
    const { data: mlData } = await supabase.from('ml_anuncios_regras').select('*');
    if (mlData) {
      const mapaMl = new Map();
      mlData.forEach((m: any) => mapaMl.set(String(m.mlb).trim().toUpperCase(), m));
      setRegrasMlMap(mapaMl);
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
    setLinhas([...linhas, { mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "" }]);
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
      .filter(l => l.mlb.trim() !== "" && l.sku.trim() !== "")
      .map(l => {
        const skuLimpo = l.sku.trim();
        const mlbLimpo = l.mlb.trim().toUpperCase();
        const unidades = Number(l.unidades || 0);
        const receitaAds = Number(l.receitaAds || 0); // Retorno Bruto (ADS)
        const investimento = Number(l.investimento || 0);

        // Buscar dados auxiliares
        const custoRegra = custosMap.get(skuLimpo);
        const mlRegra = regrasMlMap.get(mlbLimpo);

        const produtoNome = custoRegra?.produto || "Produto sem nome";
        const custoUnitario = Number(custoRegra?.custo_unitario || 0);
        const custoProdutoTotal = custoUnitario * unidades;

        // Regras ML se for Mercado Livre
        let comissaoPct = mlRegra ? Number(mlRegra.comissao || 0) : 14;
        let pesoReal = mlRegra ? Number(mlRegra.peso_real || 0) : 0.5;
        let altura = mlRegra ? Number(mlRegra.altura || 0) : 10;
        let largura = mlRegra ? Number(mlRegra.largura || 0) : 10;
        let comprimento = mlRegra ? Number(mlRegra.comprimento || 0) : 10;

        // Estimativa de preço unitário baseada na receita ads / unidades ou valor padrão
        const precoUnitarioEstimado = unidades > 0 ? (receitaAds / unidades) : 100;
        const freteUnitario = calcularFreteML(precoUnitarioEstimado, pesoReal, altura, largura, comprimento);
        const freteTotal = freteUnitario * unidades;

        // Cálculos financeiros padrão
        const impostoTotal = receitaAds * 0.08; // 8% estimado de imposto
        const tarifaComissaoTotal = receitaAds * (comissaoPct / 100);
        const embalagemTotal = 0.70 * unidades;

        const faturamentoTotal = receitaAds; // Faturamento considerado para TACOS
        const margemLiquidaVal = faturamentoTotal - (investimento + custoProdutoTotal + impostoTotal + tarifaComissaoTotal + embalagemTotal + freteTotal);
        const margemLiquidaPct = faturamentoTotal > 0 ? (margemLiquidaVal / faturamentoTotal) : 0;

        return {
          canal: canalSelecionado,
          mes_referencia: mesSelecionado,
          identificador_anuncio: mlbLimpo,
          nome_anuncio: produtoNome,
          sku: skuLimpo,
          unidades_vendidas: unidades,
          investimento: investimento,
          retorno_bruto: receitaAds,
          faturamento_total: faturamentoTotal,
          custo_produto: custoProdutoTotal,
          imposto: impostoTotal,
          tarifa: tarifaComissaoTotal,
          embalagem: embalagemTotal,
          frete: freteTotal,
          margem_liquida_rs: margemLiquidaVal,
          margem_liquida_pct: margemLiquidaPct
        };
      });

    if (formatados.length === 0) {
      alert("Preencha pelo menos um MLB e SKU válidos.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase.from('ads_campanhas_lancamentos').insert(formatados);
    if (error) {
      alert("Erro ao gravar lançamentos: " + error.message);
    } else {
      alert("✅ Anúncios salvos e calculados com sucesso!");
      setLinhas([{ mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "" }]);
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
      <div className="max-w-[98%] mx-auto">
        
        {/* TOPO DE NAVEGAÇÃO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Unificado de Ads & Campanhas</h1>
            <p className="text-sm font-medium text-slate-400">Insira MLB, SKU, Unidades e Receita Ads para cálculo automático de margens e fretes</p>
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

        {/* SELETOR DE CANAIS EM BOTÕES */}
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
          <h2 className="text-lg font-bold text-white mb-2">➕ Lançamento de Anúncios</h2>
          <p className="text-xs text-slate-400 mb-6">Insira o MLB, SKU, Unidades e Receita Ads. O restante será calculado automaticamente com base nas regras e custos.</p>

          <form onSubmit={salvarLancamentos} className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">MLB / ID</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3 text-center">Unidades</th>
                    <th className="p-3 text-right">Receita Ads (R$)</th>
                    <th className="p-3 text-right">Investimento Ads (R$)</th>
                    <th className="p-3 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {linhas.map((l, index) => (
                    <tr key={index} className="bg-slate-950/40">
                      <td className="p-2">
                        <input 
                          type="text" 
                          value={l.mlb} 
                          onChange={(e) => atualizarLinhaForm(index, "mlb", e.target.value)}
                          placeholder="Ex: MLB4384359235" 
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none"
                          required 
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="text" 
                          value={l.sku} 
                          onChange={(e) => atualizarLinhaForm(index, "sku", e.target.value)}
                          placeholder="Ex: 22362042067" 
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none"
                          required 
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number" 
                          value={l.unidades} 
                          onChange={(e) => atualizarLinhaForm(index, "unidades", e.target.value)}
                          placeholder="0" 
                          className="w-24 mx-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center text-white outline-none" 
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={l.receitaAds} 
                          onChange={(e) => atualizarLinhaForm(index, "receitaAds", e.target.value)}
                          placeholder="0.00" 
                          className="w-32 ml-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-white outline-none" 
                          required
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
                {salvando ? "A calcular e gravar..." : "🚀 Gravar e Calcular Anúncios"}
              </button>
            </div>
          </form>
        </div>

        {/* TABELA DE REGISTOS GRAVADOS */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white">Relatório Consolidado ({canalSelecionado} - {mesSelecionado})</h2>
            <p className="text-xs text-slate-400 mt-1">Demonstrativo completo com custos, tarifas, impostos, fretes e margens calculadas.</p>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400 font-medium">A carregar registos...</p>
          ) : lancamentos.length === 0 ? (
            <p className="p-8 text-center text-slate-500 font-medium">Nenhum registo encontrado para este canal no período selecionado.</p>
          ) : (
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3">MLB</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3 text-center">Unid.</th>
                    <th className="p-3 text-right">Receita Ads</th>
                    <th className="p-3 text-right">Investimento</th>
                    <th className="p-3 text-right">Custo Produto</th>
                    <th className="p-3 text-right">Imposto</th>
                    <th className="p-3 text-right">Tarifa</th>
                    <th className="p-3 text-right">Embalagem</th>
                    <th className="p-3 text-right">Frete</th>
                    <th className="p-3 text-right">ROAS</th>
                    <th className="p-3 text-right">TACOS</th>
                    <th className="p-3 text-right">Margem R$</th>
                    <th className="p-3 text-right">Margem %</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {lancamentos.map((item) => {
                    const roas = item.investimento > 0 ? (item.retorno_bruto / item.investimento).toFixed(2) : "0.00";
                    const tacos = item.faturamento_total > 0 ? ((item.investimento / item.faturamento_total) * 100).toFixed(2) : "0.00";
                    const margemVal = Number(item.margem_liquida_rs || 0);
                    const margemPct = Number(item.margem_liquida_pct || 0) * 100;

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-200">{item.identificador_anuncio}</td>
                        <td className="p-3 font-mono text-slate-400">{item.sku}</td>
                        <td className="p-3 text-slate-300 max-w-[200px] truncate">{item.nome_anuncio}</td>
                        <td className="p-3 text-center font-bold text-white">{item.unidades_vendidas}</td>
                        <td className="p-3 text-right font-mono text-emerald-400 font-bold">R$ {Number(item.retorno_bruto).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-rose-400">R$ {Number(item.investimento).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.custo_produto || 0).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.imposto || 0).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.tarifa || 0).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.embalagem || 0).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.frete || 0).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-400">{roas}x</td>
                        <td className="p-3 text-right font-mono font-bold text-amber-400">{tacos}%</td>
                        <td className={`p-3 text-right font-mono font-bold ${margemVal >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          R$ {margemVal.toFixed(2)}
                        </td>
                        <td className={`p-3 text-right font-mono font-bold ${margemPct >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {margemPct.toFixed(1)}%
                        </td>
                        <td className="p-3 text-center">
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