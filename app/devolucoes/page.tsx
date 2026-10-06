"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

// Componente do Gráfico de Pizza (Donut)
const GraficoPizza = ({ dados, titulo, tipoValor = "numero" }: { dados: any[], titulo: string, tipoValor?: "numero" | "moeda" }) => {
  const total = dados.reduce((acc, item) => acc + item.valor, 0);
  let offsetAcumulado = 0;
  const cores = ["#6366f1", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];

  return (
    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col items-center">
      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 text-center">{titulo}</h3>
      {total === 0 ? (
        <p className="text-xs text-slate-500 my-auto py-10">Sem dados</p>
      ) : (
        <div className="flex flex-col xl:flex-row items-center gap-6 w-full">
          <div className="relative w-32 h-32 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              {dados.map((item, index) => {
                const percentual = (item.valor / total) * 100;
                const circunferencia = 2 * Math.PI * 40;
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
                  <li key={index} className="flex items-center justify-between text-[10px] lg:text-[11px]">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cores[index % cores.length] }}></span>
                      <span className="text-slate-300 truncate max-w-[120px] lg:max-w-[150px]" title={item.nome}>{item.nome}</span>
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
  const [subAba, setSubAba] = useState<"controle" | "plano">("controle");

  // Estados de Período
  const [mesAtual, setMesAtual] = useState("09/2026");
  const [mesAnterior, setMesAnterior] = useState("08/2026");

  // Dicionários para preenchimento automático
  const [catalogoMap, setCatalogoMap] = useState<Map<string, { produto: string, marca: string }>>(new Map());
  const [canais, setCanais] = useState<string[]>([
    "Site", "Mercado Livre 1", "Mercado Livre 2", "Mercado Livre 3", 
    "Shopee", "Magazine Luiza", "Netshoes", "Centauro", "Amazon", "Shein", "Tiktok", "Outro"
  ]);

  // Motivos e Condições Fixas
  const motivosFixos = [
    "Arrependimento da compra.",
    "É o tamanho comprado, mas não serviu.",
    "Cor diferente da solicitada.",
    "Tamanho diferente do solicitado.",
    "Faltaram itens no pedido.",
    "Problema de fabricação do fornecedor."
  ];
  const opcoesCondicao = ["Sim", "Não", "Mediação"];

  // Estado do Formulário de Input
  const hoje = new Date().toISOString().split('T')[0];
  const [dataGlobalRetorno, setDataGlobalRetorno] = useState(hoje);
  const linhaVazia = { 
    pedido: "", canal: "", nota_fiscal: "", solicitacao: "", sku: "", produto: "", marca: "", pdv: "", frete: "", 
    motivo: "", observacoes: "", condicoes: "Sim", mediacao_protocolo: "", mediacao_resolvido: "", mediacao_reputacao: "", mediacao_estorno: "" 
  };
  const [linhas, setLinhas] = useState([linhaVazia]);

  // Estado da Tabela de Consulta e Planos de Ação
  const [devolucoes, setDevolucoes] = useState<any[]>([]);
  const [planosAcao, setPlanosAcao] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ atual: { unidades: 0, valor: 0, frete: 0 }, anterior: { unidades: 0, valor: 0, frete: 0 } });
  
  const [pesquisaPedido, setPesquisaPedido] = useState("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;

  // Estados de Edição do Plano de Ação
  const [editandoPlanoSku, setEditandoPlanoSku] = useState<string | null>(null);
  const [textoProposta, setTextoProposta] = useState("");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarAuxiliares();
  }, []);

  useEffect(() => {
    carregarDevolucoesEPlanos();
  }, [mesAtual, mesAnterior]);

  const normalizarSku = (valor: any) => {
    if (!valor) return "";
    let s = String(valor).trim();
    if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
    return s.toLowerCase();
  };

  const extrairMesAno = (dataString: string) => {
    if (!dataString) return "";
    const partes = dataString.split("-");
    if (partes.length >= 2) return `${partes[1]}/${partes[0]}`;
    return "";
  };

  const carregarAuxiliares = async () => {
    const { data: canaisData } = await supabase.from('config_regras_canais').select('canal').order('id');
    if (canaisData && canaisData.length > 0) {
      const canaisUnicos = Array.from(new Set([...canaisData.map(c => c.canal), ...canais]));
      setCanais(canaisUnicos);
    }

    let allCustos: any[] = [];
    let from = 0; let step = 1000; let keep = true;
    while (keep) {
      const { data } = await supabase.from('tabela_custos_skus').select('sku, produto, marca').range(from, from + step - 1);
      if (data && data.length > 0) {
        allCustos = [...allCustos, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    
    const mapa = new Map();
    allCustos.forEach((c: any) => {
      const skuNorm = normalizarSku(c.sku);
      if (skuNorm) mapa.set(skuNorm, { produto: c.produto || "", marca: c.marca || "Sem Marca" });
    });
    setCatalogoMap(mapa);
  };

  const carregarDevolucoesEPlanos = async () => {
    setLoading(true);
    
    // Busca Devoluções
    const { data: devData } = await supabase.from('devolucoes').select('*').order('data_retorno', { ascending: false });
    const listaDev = devData || [];
    setDevolucoes(listaDev);

    // Busca Planos de Ação do mês atual
    const { data: planoData } = await supabase.from('plano_acao_devolucoes').select('*').eq('mes_referencia', mesAtual);
    setPlanosAcao(planoData || []);

    const dadosAtual = listaDev.filter(d => d.mes_referencia === mesAtual);
    const dadosAnterior = listaDev.filter(d => d.mes_referencia === mesAnterior);

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

  const adicionarLinha = () => setLinhas([...linhas, { ...linhaVazia }]);
  const removerLinha = (index: number) => setLinhas(linhas.filter((_, i) => i !== index));

  const atualizarLinha = (index: number, campo: string, valor: string) => {
    const novasLinhas = [...linhas];
    novasLinhas[index] = { ...novasLinhas[index], [campo]: valor };

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
    if (!dataGlobalRetorno) return alert("Selecione a Data de Retorno no topo do formulário.");

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
        motivo: l.motivo,
        observacoes: l.observacoes.trim(),
        condicoes: l.condicoes,
        mediacao_protocolo: l.condicoes === "Mediação" ? l.mediacao_protocolo : "",
        mediacao_resolvido: l.condicoes === "Mediação" ? l.mediacao_resolvido : "",
        mediacao_reputacao: l.condicoes === "Mediação" ? l.mediacao_reputacao : "",
        mediacao_estorno: l.condicoes === "Mediação" ? Number(l.mediacao_estorno || 0) : 0,
      }));

    if (formatados.length === 0) {
      alert("Preencha pelo menos um Pedido e SKU válidos.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase.from('devolucoes').insert(formatados);
    if (error) alert("Erro ao gravar devoluções: " + error.message);
    else {
      alert("✅ Devoluções registadas com sucesso!");
      setLinhas([{ ...linhaVazia }]);
      carregarDevolucoesEPlanos();
    }
    setSalvando(false);
  };

  const salvarProposta = async (sku: string) => {
    const registroExistente = planosAcao.find(p => p.sku === sku);
    
    if (registroExistente) {
      await supabase.from('plano_acao_devolucoes').update({ proposta: textoProposta }).eq('id', registroExistente.id);
    } else {
      await supabase.from('plano_acao_devolucoes').insert([{ mes_referencia: mesAtual, sku: sku, proposta: textoProposta }]);
    }
    
    setEditandoPlanoSku(null);
    setTextoProposta("");
    carregarDevolucoesEPlanos();
  };

  // Processamento de Dados (Filtros e Gráficos)
  const dadosFiltrados = devolucoes.filter(d => 
    d.mes_referencia === mesAtual && (pesquisaPedido === "" || String(d.pedido).toLowerCase().includes(pesquisaPedido.toLowerCase()))
  );

  const totalPaginas = Math.ceil(dadosFiltrados.length / itensPorPagina) || 1;
  const itensTabelaAtual = dadosFiltrados.slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina);

  const agruparPor = (campo: string, tipoSoma: "quantidade" | "valor") => {
    const mapa = new Map<string, number>();
    dadosFiltrados.forEach(item => {
      const chave = item[campo] || "Não Identificado";
      const valorAdicionar = tipoSoma === "quantidade" ? 1 : Number(item.pdv || 0);
      mapa.set(chave, (mapa.get(chave) || 0) + valorAdicionar);
    });
    return Array.from(mapa.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  };

  const calcProgresso = (atual: number, anterior: number) => {
    if (anterior === 0) return atual > 0 ? "+100%" : "0%";
    const diff = ((atual - anterior) / anterior) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
  };

  // Geração de Dados para o Plano de Ação
  const gerarResumoPlanoAcao = () => {
    const mapaSkus = new Map<string, { produto: string, total: number, motivos: Record<string, number> }>();
    
    dadosFiltrados.forEach(d => {
      const sku = d.sku;
      if (!mapaSkus.has(sku)) {
        mapaSkus.set(sku, { produto: d.produto, total: 0, motivos: {} });
      }
      const info = mapaSkus.get(sku)!;
      info.total += 1;
      info.motivos[d.motivo] = (info.motivos[d.motivo] || 0) + 1;
    });

    return Array.from(mapaSkus.entries())
      .map(([sku, info]) => {
        const motivosFormatados = Object.entries(info.motivos)
          .sort((a, b) => b[1] - a[1])
          .map(([motivo, qtd]) => `${motivo} (${qtd})`)
          .join(" | ");
        
        const planoBanco = planosAcao.find(p => p.sku === sku);
        
        return { sku, produto: info.produto, total: info.total, principaisMotivos: motivosFormatados, proposta: planoBanco?.proposta || "" };
      })
      .sort((a, b) => b.total - a.total);
  };

  const listaPlanoAcao = gerarResumoPlanoAcao();

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Relatório de Devoluções</h1>
            <p className="text-sm font-medium text-slate-400">Logística Reversa, Auditoria e Planos de Ação</p>
          </div>
          <Navbar />
        </div>

        <div className="flex gap-3 mb-6">
          <button onClick={() => setSubAba("controle")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "controle" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            📦 Controle de Devoluções
          </button>
          <button onClick={() => setSubAba("plano")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "plano" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            🎯 Plano de Ação
          </button>
        </div>

        {/* TOP BAR / FILTROS GLOBAIS COMUNS ÀS DUAS ABAS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-6 flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Período de Análise:</label>
            <select value={mesAtual} onChange={(e) => setMesAtual(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer">
              <option value="10/2026">10/2026</option>
              <option value="09/2026">09/2026</option>
              <option value="08/2026">08/2026</option>
              <option value="07/2026">07/2026</option>
            </select>
          </div>
          {subAba === "controle" && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mês Comparativo:</label>
              <select value={mesAnterior} onChange={(e) => setMesAnterior(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer">
                <option value="09/2026">09/2026</option>
                <option value="08/2026">08/2026</option>
                <option value="07/2026">07/2026</option>
              </select>
            </div>
          )}
        </div>

        {subAba === "controle" && (
          <>
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

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">➕ Registar Devoluções</h2>
                  <p className="text-xs text-slate-400 mt-1">Insira o SKU para autopreencher Nome e Marca. Todos os itens salvos terão a mesma Data de Retorno.</p>
                </div>
                <div className="bg-slate-950 border border-indigo-900/50 p-3 rounded-xl">
                  <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Data Global de Retorno</label>
                  <input type="date" value={dataGlobalRetorno} onChange={(e) => setDataGlobalRetorno(e.target.value)} className="bg-transparent text-sm font-bold text-white outline-none cursor-pointer" />
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
                        <th className="p-2 w-32">Produto (Auto)</th>
                        <th className="p-2">Marca</th>
                        <th className="p-2 text-right">PDV (R$)</th>
                        <th className="p-2 text-right">Frete</th>
                        <th className="p-2 w-48">Motivo</th>
                        <th className="p-2">Observações</th>
                        <th className="p-2">Condições?</th>
                        <th className="p-2 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {linhas.map((l, idx) => (
                        <React.Fragment key={idx}>
                          <tr className="bg-slate-950/40">
                            <td className="p-1"><input type="text" value={l.pedido} onChange={(e) => atualizarLinha(idx, "pedido", e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none focus:border-indigo-500" required /></td>
                            <td className="p-1">
                              <select value={l.canal} onChange={(e) => atualizarLinha(idx, "canal", e.target.value)} className="w-24 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none cursor-pointer" required>
                                <option value="">Canal...</option>
                                {canais.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                            <td className="p-1"><input type="text" value={l.nota_fiscal} onChange={(e) => atualizarLinha(idx, "nota_fiscal", e.target.value)} className="w-14 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none focus:border-indigo-500" /></td>
                            <td className="p-1"><input type="text" value={l.solicitacao} onChange={(e) => atualizarLinha(idx, "solicitacao", e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none focus:border-indigo-500" /></td>
                            <td className="p-1"><input type="text" value={l.sku} onChange={(e) => atualizarLinha(idx, "sku", e.target.value)} placeholder="SKU" className="w-20 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] font-mono text-white outline-none focus:border-indigo-500" required /></td>
                            <td className="p-1"><input type="text" value={l.produto} readOnly className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-[10px] text-slate-400 outline-none truncate" placeholder="Auto" /></td>
                            <td className="p-1"><input type="text" value={l.marca} readOnly className="w-16 bg-slate-950 border border-slate-800 rounded p-1.5 text-[10px] text-slate-400 outline-none" placeholder="Auto" /></td>
                            <td className="p-1"><input type="number" step="0.01" value={l.pdv} onChange={(e) => atualizarLinha(idx, "pdv", e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-right font-mono text-white outline-none focus:border-indigo-500" required /></td>
                            <td className="p-1"><input type="number" step="0.01" value={l.frete} onChange={(e) => atualizarLinha(idx, "frete", e.target.value)} className="w-14 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-right font-mono text-white outline-none focus:border-indigo-500" /></td>
                            <td className="p-1">
                              <select value={l.motivo} onChange={(e) => atualizarLinha(idx, "motivo", e.target.value)} className="w-32 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none cursor-pointer truncate" required>
                                <option value="">Selecione...</option>
                                {motivosFixos.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </td>
                            <td className="p-1"><input type="text" value={l.observacoes} onChange={(e) => atualizarLinha(idx, "observacoes", e.target.value)} placeholder="Obs..." className="w-24 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none focus:border-indigo-500" /></td>
                            <td className="p-1">
                              <select value={l.condicoes} onChange={(e) => atualizarLinha(idx, "condicoes", e.target.value)} className="w-20 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none cursor-pointer">
                                {opcoesCondicao.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </td>
                            <td className="p-1 text-center">
                              {linhas.length > 1 && <button type="button" onClick={() => removerLinha(idx)} className="text-rose-400 hover:bg-rose-950 px-2 py-1 rounded cursor-pointer">✕</button>}
                            </td>
                          </tr>
                          
                          {/* Linha Oculta de Mediação */}
                          {l.condicoes === "Mediação" && (
                            <tr className="bg-amber-950/20 border-b border-amber-900/30">
                              <td colSpan={13} className="p-2 pl-8">
                                <div className="flex items-center gap-4 text-[10px]">
                                  <span className="font-bold text-amber-500 uppercase">↳ Dados da Mediação:</span>
                                  <div>
                                    <label className="text-slate-400 mr-2">ID Protocolo:</label>
                                    <input type="text" value={l.mediacao_protocolo} onChange={(e) => atualizarLinha(idx, "mediacao_protocolo", e.target.value)} className="w-24 bg-slate-900 border border-slate-700 rounded p-1 text-white outline-none" required/>
                                  </div>
                                  <div>
                                    <label className="text-slate-400 mr-2">Resolvido:</label>
                                    <select value={l.mediacao_resolvido} onChange={(e) => atualizarLinha(idx, "mediacao_resolvido", e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-white outline-none" required>
                                      <option value="">...</option><option value="Sim">Sim</option><option value="Não">Não</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-slate-400 mr-2">Afetou Reputação:</label>
                                    <select value={l.mediacao_reputacao} onChange={(e) => atualizarLinha(idx, "mediacao_reputacao", e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-white outline-none" required>
                                      <option value="">...</option><option value="Sim">Sim</option><option value="Não">Não</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-slate-400 mr-2">Valor Estorno:</label>
                                    <input type="number" step="0.01" value={l.mediacao_estorno} onChange={(e) => atualizarLinha(idx, "mediacao_estorno", e.target.value)} className="w-20 bg-slate-900 border border-slate-700 rounded p-1 text-right text-white outline-none" placeholder="0.00" required/>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between items-center pt-3">
                  <button type="button" onClick={adicionarLinha} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer">+ Adicionar Linha</button>
                  <button type="submit" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg">
                    {salvando ? "A salvar..." : "💾 Salvar Devoluções"}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden mb-8">
              <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-white">Histórico de Devoluções ({mesAtual})</h2>
                <input type="text" placeholder="🔍 Buscar ID Pedido..." value={pesquisaPedido} onChange={(e) => {setPesquisaPedido(e.target.value); setPaginaAtual(1);}} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none w-56"/>
              </div>

              {loading ? <p className="p-8 text-center text-slate-400">A carregar registos...</p> : dadosFiltrados.length === 0 ? <p className="p-8 text-center text-slate-500">Nenhuma devolução encontrada.</p> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                      <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="p-4">Data Retorno</th>
                          <th className="p-4">Pedido / Canal</th>
                          <th className="p-4">SKU / Produto</th>
                          <th className="p-4">Marca</th>
                          <th className="p-4">Motivo / Obs</th>
                          <th className="p-4 text-center">Condições</th>
                          <th className="p-4 text-right">PDV (R$)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                        {itensTabelaAtual.map((item, idx) => (
                          <tr key={item.id || idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-4 font-mono text-slate-300">{item.data_retorno ? item.data_retorno.split('-').reverse().join('/') : '-'}</td>
                            <td className="p-4"><div className="font-bold text-white">{item.pedido}</div><div className="text-[10px] text-slate-500">{item.canal}</div></td>
                            <td className="p-4"><div className="font-mono text-indigo-400">{item.sku}</div><div className="text-[10px] text-slate-400 max-w-[200px] truncate">{item.produto}</div></td>
                            <td className="p-4 font-bold text-slate-300">{item.marca}</td>
                            <td className="p-4"><div className="text-rose-400 truncate max-w-[200px]">{item.motivo}</div><div className="text-[10px] text-slate-500 truncate max-w-[200px]">{item.observacoes || "-"}</div></td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.condicoes === 'Sim' ? 'bg-emerald-900/50 text-emerald-400' : item.condicoes === 'Não' ? 'bg-rose-900/50 text-rose-400' : 'bg-amber-900/50 text-amber-400'}`}>
                                {item.condicoes}
                              </span>
                            </td>
                            <td className="p-4 text-right font-mono font-bold text-emerald-400">R$ {Number(item.pdv).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-5 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
                    <span>Página {paginaAtual} de {totalPaginas} ({dadosFiltrados.length} itens)</span>
                    <div className="flex gap-2">
                      <button onClick={() => setPaginaAtual(p => Math.max(p - 1, 1))} disabled={paginaAtual === 1} className="px-4 py-2 bg-slate-900 rounded-xl font-bold text-slate-300 disabled:opacity-40">Anterior</button>
                      <button onClick={() => setPaginaAtual(p => Math.min(p + 1, totalPaginas))} disabled={paginaAtual === totalPaginas} className="px-4 py-2 bg-slate-900 rounded-xl font-bold text-slate-300 disabled:opacity-40">Próxima</button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {!loading && dadosFiltrados.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-black text-white tracking-tight mb-4">Análise Percentual ({mesAtual})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <GraficoPizza dados={agruparPor("marca", "quantidade")} titulo="Marcas Mais Devolvidas (Qtd)" />
                  <GraficoPizza dados={agruparPor("marca", "valor")} titulo="Impacto Financeiro por Marca (PDV)" tipoValor="moeda" />
                  <GraficoPizza dados={agruparPor("motivo", "quantidade")} titulo="Motivos de Devolução" />
                  <GraficoPizza dados={agruparPor("produto", "quantidade").slice(0, 8)} titulo="Top Produtos Devolvidos (SKU)" />
                </div>
              </div>
            )}
          </>
        )}

        {/* SUBA ABA: PLANO DE AÇÃO */}
        {subAba === "plano" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden mb-8 p-6">
            <h2 className="text-lg font-bold text-white mb-2">🎯 Plano de Ação por SKU ({mesAtual})</h2>
            <p className="text-xs text-slate-400 mb-6">Produtos mais devolvidos neste mês com a listagem dos principais erros. Escreva a proposta de solução.</p>
            
            {listaPlanoAcao.length === 0 ? (
              <p className="text-center text-slate-500 py-10">Nenhum produto devolvido no período {mesAtual}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-4 w-24 text-center">Total Dev.</th>
                      <th className="p-4">SKU / Produto</th>
                      <th className="p-4 w-1/3">Principais Erros / Motivos</th>
                      <th className="p-4 w-1/3">PROPOSTA DE AÇÃO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {listaPlanoAcao.map((item, idx) => {
                      const isEditing = editandoPlanoSku === item.sku;
                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 text-center">
                            <span className="bg-rose-950/60 text-rose-400 border border-rose-900/50 px-3 py-1.5 rounded-lg font-black text-sm">{item.total}</span>
                          </td>
                          <td className="p-4">
                            <div className="font-mono font-bold text-indigo-400">{item.sku}</div>
                            <div className="text-slate-300 max-w-[250px] truncate" title={item.produto}>{item.produto}</div>
                          </td>
                          <td className="p-4 text-slate-400 italic text-[11px] leading-relaxed">
                            {item.principaisMotivos}
                          </td>
                          <td className="p-4">
                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <textarea 
                                  value={textoProposta} 
                                  onChange={(e) => setTextoProposta(e.target.value)}
                                  className="w-full bg-slate-950 border border-indigo-500/50 rounded-lg p-2 text-white outline-none min-h-[60px] text-xs resize-none"
                                  placeholder="Escreva a solução..."
                                  autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setEditandoPlanoSku(null)} className="text-[10px] font-bold text-slate-400 hover:text-slate-300">Cancelar</button>
                                  <button onClick={() => salvarProposta(item.sku)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-[10px] font-bold">Salvar Proposta</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-between items-start gap-3 group">
                                <span className={`flex-1 text-[11px] ${item.proposta ? 'text-emerald-300' : 'text-slate-500'}`}>
                                  {item.proposta || "Nenhuma proposta definida..."}
                                </span>
                                <button onClick={() => {setEditandoPlanoSku(item.sku); setTextoProposta(item.proposta);}} className="text-slate-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-slate-800 rounded">
                                  ✏️
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}