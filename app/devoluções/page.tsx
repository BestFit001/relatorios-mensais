"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

// Componente auxiliar para desenhar o Gráfico de Pizza (Donut) sem dependências externas
const GraficoPizza = ({ dados, titulo, tipoValor = "numero" }: { dados: any[], titulo: string, tipoValor?: "numero" | "moeda" }) => {
  const total = dados.reduce((acc, item) => acc + item.valor, 0);
  let offsetAcumulado = 0;
  const cores = ["#6366f1", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];

  return (
    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col items-center">
      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">{titulo}</h3>
      {total === 0 ? (
        <p className="text-xs text-slate-500 my-auto py-10">Sem dados</p>
      ) : (
        <div className="flex flex-col md:flex-row items-center gap-6 w-full">
          <div className="relative w-32 h-32 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              {dados.map((item, index) => {
                const percentual = (item.valor / total) * 100;
                const circunferencia = 2 * Math.PI * 40; // Raio 40
                const strokeDasharray = `${(percentual * circunferencia) / 100} ${circunferencia}`;
                const strokeDashoffset = -offsetAcumulado;
                offsetAcumulado += (percentual * circunferencia) / 100;

                return (
                  <circle
                    key={index}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={cores[index % cores.length]}
                    strokeWidth="16"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500 ease-in-out"
                  />
                );
              })}
            </svg>
          </div>
          <div className="flex-1 w-full max-h-40 overflow-y-auto pr-2">
            <ul className="space-y-2">
              {dados.map((item, index) => {
                const percentual = ((item.valor / total) * 100).toFixed(1);
                const valorExibicao = tipoValor === "moeda" ? `R$ ${item.valor.toFixed(2)}` : item.valor;
                return (
                  <li key={index} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cores[index % cores.length] }}></span>
                      <span className="text-slate-300 truncate max-w-[120px]" title={item.nome}>{item.nome}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="font-bold text-white">{valorExibicao}</span>
                      <span className="text-slate-500 ml-1">({percentual}%)</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default function DevolucoesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Estados de Período
  const [mesAtual, setMesAtual] = useState("09/2026");
  const [mesAnterior, setMesAnterior] = useState("08/2026");

  // Dicionários para preenchimento automático
  const [catalogoMap, setCatalogoMap] = useState<Map<string, { produto: string, marca: string }>>(new Map());

  // Estado do Formulário de Input
  const hoje = new Date().toISOString().split('T')[0];
  const [dataGlobalRetorno, setDataGlobalRetorno] = useState(hoje);
  const [linhas, setLinhas] = useState([
    { pedido: "", canal: "", nota_fiscal: "", solicitacao: "", sku: "", produto: "", marca: "", pdv: "", frete: "", motivo: "" }
  ]);

  // Estado da Tabela de Consulta
  const [devolucoes, setDevolucoes] = useState<any[]>([]);
  const [kpis, setKpis] = useState({
    atual: { unidades: 0, valor: 0, frete: 0 },
    anterior: { unidades: 0, valor: 0, frete: 0 }
  });
  const [pesquisaPedido, setPesquisaPedido] = useState("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;

  // Opções Comuns
  const canais = ["Mercado Livre", "Amazon", "Shopee", "Site", "Netshoes", "Centauro", "TikTok", "Outro"];
  const motivos = ["Arrependimento / Desistência", "Tamanho Incorreto", "Defeito de Fabrico", "Produto Errado", "Avaria no Transporte", "Atraso na Entrega", "Outro"];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarAuxiliares();
  }, []);

  useEffect(() => {
    carregarDevolucoes();
  }, [mesAtual, mesAnterior]);

  const normalizarSku = (valor: any) => {
    if (!valor) return "";
    let s = String(valor).trim();
    if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
    return s.toLowerCase();
  };

  const extrairMesAno = (dataString: string) => {
    if (!dataString) return "";
    const partes = dataString.split("-"); // YYYY-MM-DD
    if (partes.length >= 2) return `${partes[1]}/${partes[0]}`;
    return "";
  };

  const carregarAuxiliares = async () => {
    // Carrega a tabela de custos para usar como base de SKU -> Produto e Marca
    let allCustos: any[] = [];
    let from = 0;
    let step = 1000;
    let keep = true;
    while (keep) {
      const { data } = await supabase.from('tabela_custos_skus').select('sku, produto, marca').range(from, from + step - 1);
      if (data && data.length > 0) {
        allCustos = [...allCustos, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else {
        keep = false;
      }
    }
    
    const mapa = new Map();
    allCustos.forEach((c: any) => {
      const skuNorm = normalizarSku(c.sku);
      if (skuNorm) mapa.set(skuNorm, { produto: c.produto || "", marca: c.marca || "Sem Marca" });
    });
    setCatalogoMap(mapa);
  };

  const carregarDevolucoes = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('devolucoes').select('*').order('data_retorno', { ascending: false });
    
    if (error) {
      console.error("Erro ao buscar devoluções:", error);
      setLoading(false);
      return;
    }

    const lista = data || [];
    setDevolucoes(lista);

    // Calcular KPIs
    const dadosAtual = lista.filter(d => d.mes_referencia === mesAtual);
    const dadosAnterior = lista.filter(d => d.mes_referencia === mesAnterior);

    setKpis({
      atual: {
        unidades: dadosAtual.length,
        valor: dadosAtual.reduce((acc, curr) => acc + Number(curr.pdv || 0), 0),
        frete: dadosAtual.reduce((acc, curr) => acc + Number(curr.frete || 0), 0)
      },
      anterior: {
        unidades: dadosAnterior.length,
        valor: dadosAnterior.reduce((acc, curr) => acc + Number(curr.pdv || 0), 0),
        frete: dadosAnterior.reduce((acc, curr) => acc + Number(curr.frete || 0), 0)
      }
    });

    setPaginaAtual(1);
    setLoading(false);
  };

  const adicionarLinha = () => {
    setLinhas([...linhas, { pedido: "", canal: "", nota_fiscal: "", solicitacao: "", sku: "", produto: "", marca: "", pdv: "", frete: "", motivo: "" }]);
  };

  const removerLinha = (index: number) => {
    setLinhas(linhas.filter((_, i) => i !== index));
  };

  const atualizarLinha = (index: number, campo: string, valor: string) => {
    const novasLinhas = [...linhas];
    novasLinhas[index] = { ...novasLinhas[index], [campo]: valor };

    // Autopreenchimento se o campo for SKU
    if (campo === "sku") {
      const skuNorm = normalizarSku(valor);
      const infoCatalogo = catalogoMap.get(skuNorm);
      if (infoCatalogo) {
        novasLinhas[index].produto = infoCatalogo.produto;
        novasLinhas[index].marca = infoCatalogo.marca;
      } else {
        novasLinhas[index].produto = "";
        novasLinhas[index].marca = "";
      }
    }

    setLinhas(novasLinhas);
  };

  const salvarDevolucoes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataGlobalRetorno) {
      alert("Selecione a Data de Retorno no topo do formulário.");
      return;
    }

    setSalvando(true);
    const mesRef = extrairMesAno(dataGlobalRetorno);

    const formatados = linhas
      .filter(l => l.pedido.trim() !== "" && l.sku.trim() !== "")
      .map(l => ({
        data_retorno: dataGlobalRetorno,
        mes_referencia: mesRef,
        pedido: l.pedido.trim(),
        canal: l.canal,
        nota_fiscal: l.nota_fiscal.trim(),
        solicitacao: l.solicitacao.trim(),
        sku: l.sku.trim(),
        produto: l.produto.trim() || "Não identificado",
        marca: l.marca.trim() || "Sem Marca",
        pdv: Number(l.pdv || 0),
        frete: Number(l.frete || 0),
        motivo: l.motivo
      }));

    if (formatados.length === 0) {
      alert("Preencha pelo menos um Pedido e SKU válidos.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase.from('devolucoes').insert(formatados);
    
    if (error) {
      alert("Erro ao gravar devoluções: " + error.message);
    } else {
      alert("✅ Devoluções registadas com sucesso!");
      setLinhas([{ pedido: "", canal: "", nota_fiscal: "", solicitacao: "", sku: "", produto: "", marca: "", pdv: "", frete: "", motivo: "" }]);
      carregarDevolucoes();
    }
    setSalvando(false);
  };

  // Funções de Tabela e Gráficos
  const dadosFiltrados = devolucoes.filter(d => 
    d.mes_referencia === mesAtual && 
    (pesquisaPedido === "" || String(d.pedido).toLowerCase().includes(pesquisaPedido.toLowerCase()))
  );

  const totalPaginas = Math.ceil(dadosFiltrados.length / itensPorPagina) || 1;
  const indiceUltimo = paginaAtual * itensPorPagina;
  const indicePrimeiro = indiceUltimo - itensPorPagina;
  const itensTabelaAtual = dadosFiltrados.slice(indicePrimeiro, indiceUltimo);

  // Agrupadores para Gráficos
  const agruparPor = (campo: string, tipoSoma: "quantidade" | "valor") => {
    const mapa = new Map<string, number>();
    dadosFiltrados.forEach(item => {
      const chave = item[campo] || "Não Identificado";
      const valorAdicionar = tipoSoma === "quantidade" ? 1 : Number(item.pdv || 0);
      mapa.set(chave, (mapa.get(chave) || 0) + valorAdicionar);
    });
    return Array.from(mapa.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  };

  const dadosGraficoMarcas = agruparPor("marca", "quantidade");
  const dadosGraficoProdutos = agruparPor("produto", "quantidade").slice(0, 8); // Top 8 produtos
  const dadosGraficoMotivos = agruparPor("motivo", "quantidade");
  const dadosGraficoValorMarca = agruparPor("marca", "valor");

  const calcProgresso = (atual: number, anterior: number) => {
    if (anterior === 0) return atual > 0 ? "+100%" : "0%";
    const diff = ((atual - anterior) / anterior) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Relatório de Devoluções</h1>
            <p className="text-sm font-medium text-slate-400">Logística Reversa, Auditoria e Análise de Motivos</p>
          </div>
          <Navbar />
        </div>

        {/* TOP BAR / FILTROS GLOBAIS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Período de Análise:</label>
              <select value={mesAtual} onChange={(e) => setMesAtual(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none">
                <option value="09/2026">09/2026</option>
                <option value="08/2026">08/2026</option>
                <option value="07/2026">07/2026</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mês Comparativo:</label>
              <select value={mesAnterior} onChange={(e) => setMesAnterior(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none">
                <option value="09/2026">09/2026</option>
                <option value="08/2026">08/2026</option>
                <option value="07/2026">07/2026</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Unidades Devolvidas</span>
              <div className="flex items-end gap-3 mt-2">
                <p className="text-3xl font-black text-white">{kpis.atual.unidades}</p>
                <span className={`text-xs font-bold mb-1 ${kpis.atual.unidades > kpis.anterior.unidades ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {calcProgresso(kpis.atual.unidades, kpis.anterior.unidades)}
                </span>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Valor em Produtos (PDV)</span>
              <div className="flex items-end gap-3 mt-2">
                <p className="text-3xl font-black text-white">R$ {kpis.atual.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <span className={`text-xs font-bold mb-1 ${kpis.atual.valor > kpis.anterior.valor ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {calcProgresso(kpis.atual.valor, kpis.anterior.valor)}
                </span>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Custo C/ Frete Reverso</span>
              <div className="flex items-end gap-3 mt-2">
                <p className="text-3xl font-black text-white">R$ {kpis.atual.frete.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <span className={`text-xs font-bold mb-1 ${kpis.atual.frete > kpis.anterior.frete ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {calcProgresso(kpis.atual.frete, kpis.anterior.frete)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* INPUT DE DEVOLUÇÕES */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">➕ Registar Devoluções</h2>
              <p className="text-xs text-slate-400 mt-1">Insira o SKU para autopreencher Nome e Marca. Todos os itens salvos terão a mesma Data de Retorno.</p>
            </div>
            <div className="bg-slate-950 border border-indigo-900/50 p-3 rounded-xl">
              <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Data Global de Retorno</label>
              <input 
                type="date" 
                value={dataGlobalRetorno} 
                onChange={(e) => setDataGlobalRetorno(e.target.value)} 
                className="bg-transparent text-sm font-bold text-white outline-none cursor-pointer"
              />
            </div>
          </div>

          <form onSubmit={salvarDevolucoes} className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-2">Pedido</th>
                    <th className="p-2">Canal</th>
                    <th className="p-2">NF</th>
                    <th className="p-2">Solicitação</th>
                    <th className="p-2">SKU</th>
                    <th className="p-2 w-48">Produto (Auto)</th>
                    <th className="p-2">Marca (Auto)</th>
                    <th className="p-2 text-right">PDV (R$)</th>
                    <th className="p-2 text-right">Frete (R$)</th>
                    <th className="p-2">Motivo</th>
                    <th className="p-2 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {linhas.map((l, idx) => (
                    <tr key={idx} className="bg-slate-950/40">
                      <td className="p-1"><input type="text" value={l.pedido} onChange={(e) => atualizarLinha(idx, "pedido", e.target.value)} className="w-20 bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-white outline-none focus:border-indigo-500" required /></td>
                      <td className="p-1">
                        <select value={l.canal} onChange={(e) => atualizarLinha(idx, "canal", e.target.value)} className="w-24 bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-white outline-none cursor-pointer" required>
                          <option value="">Canal...</option>
                          {canais.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-1"><input type="text" value={l.nota_fiscal} onChange={(e) => atualizarLinha(idx, "nota_fiscal", e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-white outline-none focus:border-indigo-500" /></td>
                      <td className="p-1"><input type="text" value={l.solicitacao} onChange={(e) => atualizarLinha(idx, "solicitacao", e.target.value)} className="w-20 bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-white outline-none focus:border-indigo-500" /></td>
                      <td className="p-1"><input type="text" value={l.sku} onChange={(e) => atualizarLinha(idx, "sku", e.target.value)} placeholder="SKU" className="w-24 bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] font-mono text-white outline-none focus:border-indigo-500" required /></td>
                      <td className="p-1"><input type="text" value={l.produto} readOnly className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-[10px] text-slate-400 outline-none truncate" placeholder="Preenchimento Auto" /></td>
                      <td className="p-1"><input type="text" value={l.marca} readOnly className="w-20 bg-slate-950 border border-slate-800 rounded p-1.5 text-[10px] text-slate-400 outline-none" placeholder="Auto" /></td>
                      <td className="p-1"><input type="number" step="0.01" value={l.pdv} onChange={(e) => atualizarLinha(idx, "pdv", e.target.value)} className="w-20 bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-right font-mono text-white outline-none focus:border-indigo-500" required /></td>
                      <td className="p-1"><input type="number" step="0.01" value={l.frete} onChange={(e) => atualizarLinha(idx, "frete", e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-right font-mono text-white outline-none focus:border-indigo-500" /></td>
                      <td className="p-1">
                        <select value={l.motivo} onChange={(e) => atualizarLinha(idx, "motivo", e.target.value)} className="w-36 bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] text-white outline-none cursor-pointer" required>
                          <option value="">Selecione...</option>
                          {motivos.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="p-1 text-center">
                        {linhas.length > 1 && (
                          <button type="button" onClick={() => removerLinha(idx)} className="text-rose-400 hover:bg-rose-950 px-2 py-1 rounded cursor-pointer">✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center pt-3">
              <button type="button" onClick={adicionarLinha} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                + Adicionar Outra Linha
              </button>
              <button type="submit" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg">
                {salvando ? "A salvar..." : "💾 Salvar Devoluções"}
              </button>
            </div>
          </form>
        </div>

        {/* LISTAGEM DE DEVOLUÇÕES (Quebra de Página 10) */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Histórico de Devoluções ({mesAtual})</h2>
            </div>
            <div>
              <input 
                type="text" 
                placeholder="🔍 Buscar ID Pedido..." 
                value={pesquisaPedido}
                onChange={(e) => {setPesquisaPedido(e.target.value); setPaginaAtual(1);}}
                className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none w-56"
              />
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400">A carregar registos...</p>
          ) : dadosFiltrados.length === 0 ? (
            <p className="p-8 text-center text-slate-500">Nenhuma devolução encontrada para os filtros aplicados.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-4">Data Retorno</th>
                      <th className="p-4">Pedido / Canal</th>
                      <th className="p-4">SKU / Produto</th>
                      <th className="p-4">Marca</th>
                      <th className="p-4">Motivo</th>
                      <th className="p-4 text-right">PDV (R$)</th>
                      <th className="p-4 text-right">Frete (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {itensTabelaAtual.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-mono text-slate-300">{item.data_retorno ? item.data_retorno.split('-').reverse().join('/') : '-'}</td>
                        <td className="p-4">
                          <div className="font-bold text-white">{item.pedido}</div>
                          <div className="text-[10px] text-slate-500">{item.canal}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-mono text-indigo-400">{item.sku}</div>
                          <div className="text-[10px] text-slate-400 max-w-[200px] truncate">{item.produto}</div>
                        </td>
                        <td className="p-4 font-bold text-slate-300">{item.marca}</td>
                        <td className="p-4 text-rose-400">{item.motivo}</td>
                        <td className="p-4 text-right font-mono font-bold text-emerald-400">R$ {Number(item.pdv).toFixed(2)}</td>
                        <td className="p-4 text-right font-mono text-slate-400">R$ {Number(item.frete).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-5 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
                <span>Página {paginaAtual} de {totalPaginas} ({dadosFiltrados.length} itens)</span>
                <div className="flex gap-2">
                  <button onClick={() => setPaginaAtual(p => Math.max(p - 1, 1))} disabled={paginaAtual === 1} className="px-4 py-2 bg-slate-900 rounded-xl font-bold text-slate-300 disabled:opacity-40 cursor-pointer">Anterior</button>
                  <button onClick={() => setPaginaAtual(p => Math.min(p + 1, totalPaginas))} disabled={paginaAtual === totalPaginas} className="px-4 py-2 bg-slate-900 rounded-xl font-bold text-slate-300 disabled:opacity-40 cursor-pointer">Próxima</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* GRÁFICOS ANALÍTICOS */}
        {!loading && dadosFiltrados.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-black text-white tracking-tight mb-4">Análise Percentual ({mesAtual})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <GraficoPizza dados={dadosGraficoMarcas} titulo="Marcas Mais Devolvidas (Qtd)" />
              <GraficoPizza dados={dadosGraficoValorMarca} titulo="Impacto Financeiro por Marca (PDV)" tipoValor="moeda" />
              <GraficoPizza dados={dadosGraficoMotivos} titulo="Motivos de Devolução" />
              <GraficoPizza dados={dadosGraficoProdutos} titulo="Top Produtos Devolvidos (SKU)" />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}