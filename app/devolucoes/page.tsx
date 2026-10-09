"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

function normalizarSku(valor: any) {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  return s.toLowerCase();
}

function parseNumero(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

const formatarMoeda = (valor: number) => {
  return "R$ " + (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type LinhaDevolucao = {
  carrinho: boolean;
  pedido: string;
  canal: string;
  nf: string;
  solicitacao: "Devolução" | "Troca";
  sku: string;
  produto: string;
  marca: string;
  pdv: string;
  custo_frete: string;
  motivo: string;
  observacoes: string;
  condicoes: "Sim" | "Não";
  mediacao: "Nenhuma" | "Em Disputa" | "Convertida / Ganha";
  plano_acao: string;
};

export default function DevolucoesPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"registros" | "plano_acao">("registros");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Data global do formulário
  const hojeIso = new Date().toISOString().split("T")[0];
  const [dataGlobalRetorno, setDataGlobalRetorno] = useState(hojeIso);

  // Canais ativos
  const [canais, setCanais] = useState<string[]>([
    "Mercado Livre 1",
    "Mercado Livre 2.0",
    "Shopee",
    "Amazon",
    "Amazon_FBA",
    "Centauro",
    "Netshoes",
    "Magalu",
    "TikTok",
    "Site"
  ]);

  // Mapa de SKUs para auto-preenchimento
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());

  // Lista de devoluções carregadas do Supabase
  const [devolucoes, setDevolucoes] = useState<any[]>([]);

  // Filtros de listagem
  const [filtroCanal, setFiltroCanal] = useState("TODOS");
  const [filtroSolicitacao, setFiltroSolicitacao] = useState("TODOS");
  const [filtroMediacao, setFiltroMediacao] = useState("TODOS");
  const [buscaTexto, setBuscaTexto] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroFim] = useState("");

  // Edição inline
  const [idEditando, setIdEditando] = useState<number | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<any>({});

  // Linhas do formulário
  const linhaVaziaPadrao: LinhaDevolucao = {
    carrinho: false,
    pedido: "",
    canal: "Mercado Livre 1",
    nf: "",
    solicitacao: "Devolução",
    sku: "",
    produto: "",
    marca: "Auto",
    pdv: "",
    custo_frete: "0",
    motivo: "Defeito",
    observacoes: "",
    condicoes: "Não",
    mediacao: "Nenhuma",
    plano_acao: ""
  };

  const [linhas, setLinhas] = useState<LinhaDevolucao[]>([{ ...linhaVaziaPadrao }]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarAuxiliares();
    carregarDevolucoes();
  }, []);

  const carregarAuxiliares = async () => {
    // 1. Canais
    const { data: canaisData } = await supabase.from("config_regras_canais").select("canal").order("id");
    if (canaisData && canaisData.length > 0) {
      setCanais(canaisData.map((c: any) => c.canal));
    }

    // 2. SKUs para Autopreenchimento
    let allCustos: any[] = [];
    let from = 0;
    const step = 1000;
    let keep = true;
    while (keep) {
      const { data } = await supabase.from("tabela_custos_skus").select("*").range(from, from + step - 1);
      if (data && data.length > 0) {
        allCustos = [...allCustos, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }

    const mapa = new Map();
    allCustos.forEach((c: any) => {
      const k = normalizarSku(c.sku);
      if (k) mapa.set(k, c);
    });
    setCustosMap(mapa);
  };

  const carregarDevolucoes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("devolucoes")
      .select("*")
      .order("id", { ascending: false });

    if (!error && data) {
      setDevolucoes(data);
    }
    setLoading(false);
  };

  const adicionarLinha = () => {
    const ultimaLinha = linhas[linhas.length - 1];
    // Se a última linha tiver 'carrinho' marcado, replica os dados comuns do pedido
    if (ultimaLinha && ultimaLinha.carrinho) {
      setLinhas([
        ...linhas,
        {
          ...linhaVaziaPadrao,
          carrinho: true,
          pedido: ultimaLinha.pedido,
          canal: ultimaLinha.canal,
          nf: ultimaLinha.nf,
          solicitacao: ultimaLinha.solicitacao,
          mediacao: ultimaLinha.mediacao
        }
      ]);
    } else {
      setLinhas([...linhas, { ...linhaVaziaPadrao, canal: canais[0] || "Mercado Livre 1" }]);
    }
  };

  const removerLinha = (index: number) => {
    if (linhas.length <= 1) return;
    setLinhas(linhas.filter((_, i) => i !== index));
  };

  const atualizarLinha = (index: number, campo: keyof LinhaDevolucao, valor: any) => {
    const novas = [...linhas];
    novas[index] = { ...novas[index], [campo]: valor };

    // Auto-preenchimento por SKU
    if (campo === "sku") {
      const skuKey = normalizarSku(valor);
      const match = custosMap.get(skuKey);
      if (match) {
        novas[index].produto = match.produto || "";
        novas[index].marca = match.marca || "BEST FIT";
      }
    }

    setLinhas(novas);
  };

  // Gravação resiliente para evitar erro de schema cache
  const salvarDevolucoes = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const registrosFormatados: any[] = [];

    for (const l of linhas) {
      if (!l.pedido.trim() || !l.sku.trim()) continue;

      registrosFormatados.push({
        data_retorno: dataGlobalRetorno,
        pedido: l.pedido.trim(),
        canal: l.canal,
        nf: l.nf.trim(),
        solicitacao: l.solicitacao,
        sku: l.sku.trim(),
        produto: l.produto.trim() || "Produto não identificado",
        marca: l.marca.trim() || "Auto",
        pdv: Number(parseNumero(l.pdv)),
        custo_frete: Number(parseNumero(l.custo_frete)),
        motivo: l.motivo,
        observacoes: l.observacoes.trim(),
        condicoes: l.condicoes,
        mediacao: l.mediacao,
        plano_acao: l.plano_acao.trim()
      });
    }

    if (registrosFormatados.length === 0) {
      alert("Preencha ao menos uma linha com Pedido e SKU válidos.");
      setSalvando(false);
      return;
    }

    // Tentativa 1: Inserção completa padrão
    let res = await supabase.from("devolucoes").insert(registrosFormatados);

    // Fallback inteligente caso colunas opcionais ainda não estejam criadas
    if (res.error) {
      console.warn("Tentativa padrão falhou:", res.error.message);

      // Se o erro for na coluna 'custo_frete', faz o mapa para 'frete'
      let fallbackPayload = registrosFormatados.map((item) => {
        const copy = { ...item };
        if (res.error?.message.includes("custo_frete")) {
          copy.frete = copy.custo_frete;
          delete copy.custo_frete;
        }
        if (res.error?.message.includes("plano_acao")) {
          delete copy.plano_acao;
        }
        if (res.error?.message.includes("mediacao")) {
          delete copy.mediacao;
        }
        return copy;
      });

      res = await supabase.from("devolucoes").insert(fallbackPayload);
    }

    if (res.error) {
      alert("Erro ao salvar devoluções: " + res.error.message);
    } else {
      alert("✅ Devoluções salvas com sucesso!");
      setLinhas([{ ...linhaVaziaPadrao, canal: canais[0] || "Mercado Livre 1" }]);
      carregarDevolucoes();
    }
    setSalvando(false);
  };

  const excluirDevolucao = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este registo?")) return;
    const { error } = await supabase.from("devolucoes").delete().eq("id", id);
    if (error) alert("Erro ao excluir: " + error.message);
    else carregarDevolucoes();
  };

  const salvarEdicaoInline = async (id: number) => {
    const payload: any = {
      pedido: dadosEdicao.pedido,
      canal: dadosEdicao.canal,
      nf: dadosEdicao.nf,
      solicitacao: dadosEdicao.solicitacao,
      sku: dadosEdicao.sku,
      produto: dadosEdicao.produto,
      marca: dadosEdicao.marca,
      pdv: Number(parseNumero(dadosEdicao.pdv)),
      custo_frete: Number(parseNumero(dadosEdicao.custo_frete ?? dadosEdicao.frete)),
      motivo: dadosEdicao.motivo,
      observacoes: dadosEdicao.observacoes,
      condicoes: dadosEdicao.condicoes,
      mediacao: dadosEdicao.mediacao,
      plano_acao: dadosEdicao.plano_acao
    };

    let { error } = await supabase.from("devolucoes").update(payload).eq("id", id);
    if (error && error.message.includes("custo_frete")) {
      payload.frete = payload.custo_frete;
      delete payload.custo_frete;
      const res = await supabase.from("devolucoes").update(payload).eq("id", id);
      error = res.error;
    }

    if (error) alert("Erro ao atualizar: " + error.message);
    else {
      setIdEditando(null);
      carregarDevolucoes();
    }
  };

  // Filtragem dos registos
  const devolucoesFiltradas = devolucoes.filter((item) => {
    const matchCanal = filtroCanal === "TODOS" || item.canal === filtroCanal;
    const matchSol = filtroSolicitacao === "TODOS" || item.solicitacao === filtroSolicitacao;
    const matchMed = filtroMediacao === "TODOS" || item.mediacao === filtroMediacao;
    const matchBusca =
      !buscaTexto ||
      String(item.pedido || "").toLowerCase().includes(buscaTexto.toLowerCase()) ||
      String(item.nf || "").toLowerCase().includes(buscaTexto.toLowerCase()) ||
      String(item.sku || "").toLowerCase().includes(buscaTexto.toLowerCase()) ||
      String(item.produto || "").toLowerCase().includes(buscaTexto.toLowerCase());

    let matchData = true;
    if (filtroDataInicio && item.data_retorno) matchData = matchData && item.data_retorno >= filtroDataInicio;
    if (filtroDataFim && item.data_retorno) matchData = matchData && item.data_retorno <= filtroDataFim;

    return matchCanal && matchSol && matchMed && matchBusca && matchData;
  });

  // Métricas dos Cards do Topo
  const totalItens = devolucoesFiltradas.length;
  const totalPdv = devolucoesFiltradas.reduce((acc, cur) => acc + Number(cur.pdv || 0), 0);
  const totalFreteReverso = devolucoesFiltradas.reduce(
    (acc, cur) => acc + Number(cur.custo_frete ?? cur.frete ?? 0),
    0
  );
  const valorConvertidoMediacoes = devolucoesFiltradas
    .filter((cur) => cur.mediacao === "Convertida / Ganha")
    .reduce((acc, cur) => acc + Number(cur.pdv || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel de Devoluções & Mediações</h1>
            <p className="text-sm font-medium text-slate-400">Controlo de Logística Reversa, Reembolsos e Planos de Ação</p>
          </div>
          <Navbar />
        </div>

        {/* NAVEGAÇÃO ENTRE ABAS */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => setSubAba("registros")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              subAba === "registros" ? "bg-purple-600 text-white shadow-purple-900/30" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            📦 Registos & Devoluções
          </button>
          <button
            onClick={() => setSubAba("plano_acao")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              subAba === "plano_acao" ? "bg-purple-600 text-white shadow-purple-900/30" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            🎯 Plano de Ação
          </button>
        </div>

        {/* CARDS DE RESUMO (KPIs) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Total de Itens</span>
            <span className="text-2xl font-black text-white">{totalItens} un.</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Total em PDV</span>
            <span className="text-2xl font-black text-emerald-400">{formatarMoeda(totalPdv)}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Custo Frete Reverso (Prejuízo)</span>
            <span className="text-2xl font-black text-rose-400">{formatarMoeda(totalFreteReverso)}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Valor Convertido (Mediações)</span>
            <span className="text-2xl font-black text-purple-400">{formatarMoeda(valorConvertidoMediacoes)}</span>
          </div>
        </div>

        {/* ABA 1: REGISTOS E DEVOLUÇÕES */}
        {subAba === "registros" && (
          <div className="space-y-8">
            {/* FORMULÁRIO DE LANÇAMENTO */}
            <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>➕ Registar Devoluções</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Marque a caixa de carrinho (🛒) para pedidos com múltiplos SKUs.</p>
                </div>

                <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Data Global de Retorno:</label>
                  <input
                    type="date"
                    value={dataGlobalRetorno}
                    onChange={(e) => setDataGlobalRetorno(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white rounded-lg p-1.5 text-xs font-mono outline-none focus:border-purple-500 cursor-pointer"
                  />
                </div>
              </div>

              <form onSubmit={salvarDevolucoes} className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="p-2 text-center w-8">🛒</th>
                        <th className="p-2 w-28">Pedido</th>
                        <th className="p-2 w-36">Canal</th>
                        <th className="p-2 w-24">NF</th>
                        <th className="p-2 w-28">Solicitação</th>
                        <th className="p-2 w-32">SKU</th>
                        <th className="p-2 min-w-[180px]">Produto (Auto)</th>
                        <th className="p-2 w-24">Marca</th>
                        <th className="p-2 w-24 text-right">PDV (R$)</th>
                        <th className="p-2 w-20 text-right">Frete</th>
                        <th className="p-2 w-36">Motivo</th>
                        <th className="p-2 min-w-[150px]">Observações</th>
                        <th className="p-2 w-20 text-center">Condições?</th>
                        <th className="p-2 w-36">Mediação / Status</th>
                        <th className="p-2 text-center w-12">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {linhas.map((l, index) => (
                        <tr key={index} className="hover:bg-slate-800/20">
                          {/* Carrinho Multi-SKU */}
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={l.carrinho}
                              onChange={(e) => atualizarLinha(index, "carrinho", e.target.checked)}
                              className="accent-purple-600 rounded cursor-pointer"
                              title="Marque para replicar dados ao adicionar linha"
                            />
                          </td>

                          {/* Pedido */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.pedido}
                              onChange={(e) => atualizarLinha(index, "pedido", e.target.value)}
                              placeholder="123456789"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-purple-500"
                              required
                            />
                          </td>

                          {/* Canal */}
                          <td className="p-2">
                            <select
                              value={l.canal}
                              onChange={(e) => atualizarLinha(index, "canal", e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 cursor-pointer"
                            >
                              {canais.map((c, i) => (
                                <option key={i} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>

                          {/* NF */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.nf}
                              onChange={(e) => atualizarLinha(index, "nf", e.target.value)}
                              placeholder="12345"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-purple-500"
                            />
                          </td>

                          {/* SOLICITAÇÃO (LISTA SELETORA) */}
                          <td className="p-2">
                            <select
                              value={l.solicitacao}
                              onChange={(e) => atualizarLinha(index, "solicitacao", e.target.value as any)}
                              className={`w-full bg-slate-900 border rounded-lg p-2 text-xs font-bold outline-none cursor-pointer ${
                                l.solicitacao === "Troca" ? "text-amber-400 border-amber-600/50" : "text-purple-400 border-purple-600/50"
                              }`}
                            >
                              <option value="Devolução">Devolução</option>
                              <option value="Troca">Troca</option>
                            </select>
                          </td>

                          {/* SKU */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.sku}
                              onChange={(e) => atualizarLinha(index, "sku", e.target.value)}
                              placeholder="SKU..."
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-purple-500"
                              required
                            />
                          </td>

                          {/* Produto Auto */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.produto}
                              onChange={(e) => atualizarLinha(index, "produto", e.target.value)}
                              placeholder="Auto-preenchido"
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 outline-none truncate"
                            />
                          </td>

                          {/* Marca */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.marca}
                              onChange={(e) => atualizarLinha(index, "marca", e.target.value)}
                              placeholder="Auto"
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-400 outline-none text-center"
                            />
                          </td>

                          {/* PDV (R$) */}
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              value={l.pdv}
                              onChange={(e) => atualizarLinha(index, "pdv", e.target.value)}
                              placeholder="0.00"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-emerald-400 text-right outline-none focus:border-purple-500"
                            />
                          </td>

                          {/* CUSTO FRETE */}
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              value={l.custo_frete}
                              onChange={(e) => atualizarLinha(index, "custo_frete", e.target.value)}
                              placeholder="0"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-rose-400 text-right outline-none focus:border-purple-500"
                            />
                          </td>

                          {/* Motivo */}
                          <td className="p-2">
                            <select
                              value={l.motivo}
                              onChange={(e) => atualizarLinha(index, "motivo", e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer"
                            >
                              <option value="Defeito">Defeito</option>
                              <option value="Arrependimento">Arrependimento</option>
                              <option value="Produto Incorreto">Produto Incorreto</option>
                              <option value="Atributo de Produto">Atributo de Produto (Tamanho)</option>
                              <option value="Não Entregue">Não Entregue</option>
                              <option value="Atraso na Entrega">Atraso na Entrega</option>
                              <option value="Sem estoque">Sem estoque</option>
                              <option value="Outros">Outros</option>
                            </select>
                          </td>

                          {/* Observações */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.observacoes}
                              onChange={(e) => atualizarLinha(index, "observacoes", e.target.value)}
                              placeholder="Detalhes..."
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 outline-none"
                            />
                          </td>

                          {/* CONDIÇÕES? */}
                          <td className="p-2 text-center">
                            <select
                              value={l.condicoes}
                              onChange={(e) => atualizarLinha(index, "condicoes", e.target.value as any)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer text-center"
                            >
                              <option value="Não">Não</option>
                              <option value="Sim">Sim</option>
                            </select>
                          </td>

                          {/* MEDIAÇÃO / STATUS */}
                          <td className="p-2">
                            <select
                              value={l.mediacao}
                              onChange={(e) => atualizarLinha(index, "mediacao", e.target.value as any)}
                              className={`w-full bg-slate-900 border rounded-lg p-2 text-xs font-bold outline-none cursor-pointer ${
                                l.mediacao === "Convertida / Ganha"
                                  ? "border-emerald-500 text-emerald-400"
                                  : l.mediacao === "Em Disputa"
                                  ? "border-amber-500 text-amber-400"
                                  : "border-slate-700 text-slate-400"
                              }`}
                            >
                              <option value="Nenhuma">Nenhuma</option>
                              <option value="Em Disputa">Em Disputa</option>
                              <option value="Convertida / Ganha">Convertida / Ganha</option>
                            </select>
                          </td>

                          {/* Botão Remover Linha */}
                          <td className="p-2 text-center">
                            {linhas.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removerLinha(index)}
                                className="bg-rose-950/60 hover:bg-rose-900 text-rose-400 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer"
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
                    onClick={adicionarLinha}
                    className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                  >
                    + Adicionar Outra Linha
                  </button>

                  <button
                    type="submit"
                    disabled={salvando}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg"
                  >
                    {salvando ? "A Salvar..." : "💾 Salvar Devoluções"}
                  </button>
                </div>
              </form>
            </div>

            {/* TABELA DE DEVOLUÇÕES REGISTADAS COM FILTROS */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Devoluções Registadas</h2>
                  <p className="text-xs text-slate-400 mt-1">Histórico completo de pedidos devolvidos e status de mediação.</p>
                </div>

                {/* Filtros Superiores */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Buscar Pedido, NF, SKU..."
                    value={buscaTexto}
                    onChange={(e) => setBuscaTexto(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-48"
                  />

                  <select
                    value={filtroCanal}
                    onChange={(e) => setFiltroCanal(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todos os Canais</option>
                    {canais.map((c, i) => (
                      <option key={i} value={c}>{c}</option>
                    ))}
                  </select>

                  <select
                    value={filtroSolicitacao}
                    onChange={(e) => setFiltroSolicitacao(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todas Solicitações</option>
                    <option value="Devolução">Devolução</option>
                    <option value="Troca">Troca</option>
                  </select>

                  <select
                    value={filtroMediacao}
                    onChange={(e) => setFiltroMediacao(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todas Mediações</option>
                    <option value="Nenhuma">Nenhuma</option>
                    <option value="Em Disputa">Em Disputa</option>
                    <option value="Convertida / Ganha">Convertida / Ganha</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <p className="p-8 text-center text-slate-400 font-medium">A carregar devoluções...</p>
              ) : devolucoesFiltradas.length === 0 ? (
                <p className="p-8 text-center text-slate-500 font-medium">Nenhuma devolução encontrada para os filtros selecionados.</p>
              ) : (
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-3">Data</th>
                        <th className="p-3">Pedido / NF</th>
                        <th className="p-3">Canal</th>
                        <th className="p-3 text-center">Tipo</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 min-w-[200px]">Produto</th>
                        <th className="p-3 text-right">PDV</th>
                        <th className="p-3 text-right">Frete Reverso</th>
                        <th className="p-3">Motivo / Obs</th>
                        <th className="p-3 text-center">Boas Condições?</th>
                        <th className="p-3 text-center">Mediação</th>
                        <th className="p-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {devolucoesFiltradas.map((item) => {
                        const isEditing = idEditando === item.id;
                        const custoFreteItem = Number(item.custo_frete ?? item.frete ?? 0);

                        return (
                          <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                            {/* Data */}
                            <td className="p-3 font-mono text-slate-400">
                              {item.data_retorno ? item.data_retorno.split("-").reverse().join("/") : "-"}
                            </td>

                            {/* Pedido / NF */}
                            <td className="p-3 font-mono font-bold text-slate-200">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={dadosEdicao.pedido}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, pedido: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-white"
                                />
                              ) : (
                                <div>
                                  <span>{item.pedido}</span>
                                  {item.nf && <span className="block text-[10px] text-slate-500">NF: {item.nf}</span>}
                                </div>
                              )}
                            </td>

                            {/* Canal */}
                            <td className="p-3 font-bold text-white">{item.canal}</td>

                            {/* Solicitação */}
                            <td className="p-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  item.solicitacao === "Troca"
                                    ? "bg-amber-950/60 text-amber-400 border border-amber-900/50"
                                    : "bg-purple-950/60 text-purple-400 border border-purple-900/50"
                                }`}
                              >
                                {item.solicitacao || "Devolução"}
                              </span>
                            </td>

                            {/* SKU */}
                            <td className="p-3 font-mono text-indigo-400 font-bold">{item.sku}</td>

                            {/* Produto */}
                            <td className="p-3 text-slate-300 max-w-[220px] truncate" title={item.produto}>
                              {item.produto}
                            </td>

                            {/* PDV */}
                            <td className="p-3 text-right font-mono text-emerald-400 font-bold">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={dadosEdicao.pdv}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, pdv: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 w-20 text-right text-white"
                                />
                              ) : (
                                formatarMoeda(item.pdv)
                              )}
                            </td>

                            {/* Frete Reverso */}
                            <td className="p-3 text-right font-mono text-rose-400">
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={dadosEdicao.custo_frete}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, custo_frete: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 w-16 text-right text-white"
                                />
                              ) : (
                                formatarMoeda(custoFreteItem)
                              )}
                            </td>

                            {/* Motivo / Obs */}
                            <td className="p-3">
                              <span className="font-bold text-slate-200">{item.motivo}</span>
                              {item.observacoes && (
                                <span className="block text-[11px] text-slate-400 max-w-[200px] truncate" title={item.observacoes}>
                                  {item.observacoes}
                                </span>
                              )}
                            </td>

                            {/* Condições */}
                            <td className="p-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.condicoes === "Sim"
                                    ? "bg-emerald-950/60 text-emerald-400 border border-emerald-900/40"
                                    : "bg-rose-950/60 text-rose-400 border border-rose-900/40"
                                }`}
                              >
                                {item.condicoes || "Não"}
                              </span>
                            </td>

                            {/* Mediação */}
                            <td className="p-3 text-center">
                              {isEditing ? (
                                <select
                                  value={dadosEdicao.mediacao || "Nenhuma"}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, mediacao: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white"
                                >
                                  <option value="Nenhuma">Nenhuma</option>
                                  <option value="Em Disputa">Em Disputa</option>
                                  <option value="Convertida / Ganha">Convertida / Ganha</option>
                                </select>
                              ) : (
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                                    item.mediacao === "Convertida / Ganha"
                                      ? "bg-emerald-950/80 text-emerald-300 border-emerald-700"
                                      : item.mediacao === "Em Disputa"
                                      ? "bg-amber-950/80 text-amber-300 border-amber-700"
                                      : "bg-slate-900 text-slate-500 border-slate-800"
                                  }`}
                                >
                                  {item.mediacao || "Nenhuma"}
                                </span>
                              )}
                            </td>

                            {/* Ações */}
                            <td className="p-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => salvarEdicaoInline(item.id)}
                                    className="bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold cursor-pointer"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    onClick={() => setIdEditando(null)}
                                    className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[10px] font-bold cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => {
                                      setIdEditando(item.id);
                                      setDadosEdicao({
                                        ...item,
                                        custo_frete: custoFreteItem
                                      });
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => excluirDevolucao(item.id)}
                                    className="bg-rose-950/60 hover:bg-rose-900 text-rose-400 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer"
                                  >
                                    Remover
                                  </button>
                                </div>
                              )}
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
        )}

        {/* ABA 2: PLANO DE AÇÃO */}
        {subAba === "plano_acao" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🎯 Gestão de Planos de Ação Operacionais</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Aponte medidas corretivas para os principais motivos de devolução (erros operacionais, defeitos de lote e problemas de atributos).
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Pedido / NF</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Motivo Reclamado</th>
                    <th className="p-3 min-w-[300px]">Plano de Ação Corretivo</th>
                    <th className="p-3 text-center">Salvar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {devolucoes.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono font-bold text-white">{item.pedido}</td>
                      <td className="p-3 text-slate-300">{item.canal}</td>
                      <td className="p-3 font-mono text-indigo-400">{item.sku}</td>
                      <td className="p-3 text-slate-300 max-w-[200px] truncate">{item.produto}</td>
                      <td className="p-3 text-rose-400 font-bold">{item.motivo}</td>
                      <td className="p-3">
                        <input
                          type="text"
                          defaultValue={item.plano_acao || ""}
                          placeholder="Ex: Ajustar tabela de medidas no canal, notificar fornecedor..."
                          onBlur={async (e) => {
                            const val = e.target.value.trim();
                            await supabase.from("devolucoes").update({ plano_acao: val }).eq("id", item.id);
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500"
                        />
                      </td>
                      <td className="p-3 text-center text-slate-500 text-[10px]">
                        Auto-salvo ao sair do campo
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}