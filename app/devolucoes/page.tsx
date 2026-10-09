"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

const MOTIVOS_OFICIAIS = [
  "Arrependimento da compra.",
  "O produto chegou com defeito.",
  "O pedido chegou incompleto.",
  "A cor recebida é diferente.",
  "O tamanho recebido é diferente.",
  "Defeito de fabricação."
];

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

type SubItemCarrinho = {
  sku: string;
  quantidade: string | number;
  produto: string;
  marca: string;
  pdv: string;
  custo_unitario: number;
  motivo: string;
  observacoes: string;
  condicoes: "Sim" | "Não";
};

type LinhaDevolucao = {
  carrinho: boolean;
  pedido: string;
  canal: string;
  nf: string;
  solicitacao: "Devolução" | "Troca";
  custo_frete: string;
  mediacao: "Nenhuma" | "Em Disputa" | "Ganha" | "Perdida";
  protocolo_mediacao: string;
  // Campos para quando carrinho for falso:
  sku: string;
  quantidade: string | number;
  produto: string;
  marca: string;
  pdv: string;
  custo_unitario: number;
  motivo: string;
  observacoes: string;
  condicoes: "Sim" | "Não";
  // Sub-itens quando carrinho for verdadeiro:
  itensCarrinho: SubItemCarrinho[];
};

export default function DevolucoesPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"registros" | "plano_acao">("registros");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const hojeIso = new Date().toISOString().split("T")[0];
  const [dataGlobalRetorno, setDataGlobalRetorno] = useState(hojeIso);

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

  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [devolucoes, setDevolucoes] = useState<any[]>([]);

  // Filtros
  const [filtroCanal, setFiltroCanal] = useState("TODOS");
  const [filtroMarca, setFiltroMarca] = useState("TODAS");
  const [filtroSolicitacao, setFiltroSolicitacao] = useState("TODOS");
  const [filtroMediacao, setFiltroMediacao] = useState("TODOS");
  const [buscaTexto, setBuscaTexto] = useState("");

  // Edição Inline
  const [idEditando, setIdEditando] = useState<number | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<any>({});

  const criarLinhaVazia = (): LinhaDevolucao => ({
    carrinho: false,
    pedido: "",
    canal: canais[0] || "Mercado Livre 1",
    nf: "",
    solicitacao: "Devolução",
    custo_frete: "0",
    mediacao: "Nenhuma",
    protocolo_mediacao: "",
    sku: "",
    quantidade: "1",
    produto: "",
    marca: "Auto",
    pdv: "",
    custo_unitario: 0,
    motivo: MOTIVOS_OFICIAIS[0],
    observacoes: "",
    condicoes: "Não",
    itensCarrinho: [
      {
        sku: "",
        quantidade: "1",
        produto: "",
        marca: "Auto",
        pdv: "",
        custo_unitario: 0,
        motivo: MOTIVOS_OFICIAIS[0],
        observacoes: "",
        condicoes: "Não"
      }
    ]
  });

  const [linhas, setLinhas] = useState<LinhaDevolucao[]>([criarLinhaVazia()]);

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
    const { data: canaisData } = await supabase.from("config_regras_canais").select("canal").order("id");
    if (canaisData && canaisData.length > 0) {
      setCanais(canaisData.map((c: any) => c.canal));
    }

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
    setLinhas([...linhas, criarLinhaVazia()]);
  };

  const removerLinha = (index: number) => {
    if (linhas.length <= 1) return;
    setLinhas(linhas.filter((_, i) => i !== index));
  };

  const atualizarLinha = (index: number, campo: keyof LinhaDevolucao, valor: any) => {
    const novas = [...linhas];
    novas[index] = { ...novas[index], [campo]: valor };

    if (campo === "carrinho" && valor === true && novas[index].itensCarrinho.length === 0) {
      novas[index].itensCarrinho = [
        {
          sku: novas[index].sku || "",
          quantidade: novas[index].quantidade || "1",
          produto: novas[index].produto || "",
          marca: novas[index].marca || "Auto",
          pdv: novas[index].pdv || "",
          custo_unitario: novas[index].custo_unitario || 0,
          motivo: novas[index].motivo || MOTIVOS_OFICIAIS[0],
          observacoes: novas[index].observacoes || "",
          condicoes: novas[index].condicoes || "Não"
        }
      ];
    }

    if (campo === "sku") {
      const skuKey = normalizarSku(valor);
      const match = custosMap.get(skuKey);
      if (match) {
        novas[index].produto = match.produto || "";
        novas[index].marca = match.marca || "BEST FIT";
        novas[index].custo_unitario = Number(match.custo_unitario || 0);
      }
    }

    setLinhas(novas);
  };

  const adicionarItemCarrinho = (indexLinha: number) => {
    const novas = [...linhas];
    novas[indexLinha].itensCarrinho.push({
      sku: "",
      quantidade: "1",
      produto: "",
      marca: "Auto",
      pdv: "",
      custo_unitario: 0,
      motivo: MOTIVOS_OFICIAIS[0],
      observacoes: "",
      condicoes: "Não"
    });
    setLinhas(novas);
  };

  const removerItemCarrinho = (indexLinha: number, indexSub: number) => {
    const novas = [...linhas];
    novas[indexLinha].itensCarrinho.splice(indexSub, 1);
    setLinhas(novas);
  };

  const atualizarItemCarrinho = (indexLinha: number, indexSub: number, campo: keyof SubItemCarrinho, valor: any) => {
    const novas = [...linhas];
    novas[indexLinha].itensCarrinho[indexSub] = {
      ...novas[indexLinha].itensCarrinho[indexSub],
      [campo]: valor
    };

    if (campo === "sku") {
      const skuKey = normalizarSku(valor);
      const match = custosMap.get(skuKey);
      if (match) {
        novas[indexLinha].itensCarrinho[indexSub].produto = match.produto || "";
        novas[indexLinha].itensCarrinho[indexSub].marca = match.marca || "BEST FIT";
        novas[indexLinha].itensCarrinho[indexSub].custo_unitario = Number(match.custo_unitario || 0);
      }
    }

    setLinhas(novas);
  };

  const salvarDevolucoes = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const registrosFormatados: any[] = [];

    for (const l of linhas) {
      if (!l.pedido.trim()) continue;

      if (l.carrinho) {
        const totalSubItens = l.itensCarrinho.length || 1;
        const freteRateado = Number((parseNumero(l.custo_frete) / totalSubItens).toFixed(2));

        for (const sub of l.itensCarrinho) {
          if (!sub.sku.trim()) continue;
          const skuKey = normalizarSku(sub.sku);
          const custoCalculado = sub.custo_unitario || Number(custosMap.get(skuKey)?.custo_unitario || 0);

          registrosFormatados.push({
            data_retorno: dataGlobalRetorno,
            pedido: l.pedido.trim(),
            canal: l.canal,
            nf: l.nf.trim(),
            solicitacao: l.solicitacao,
            sku: sub.sku.trim(),
            quantidade: Math.max(1, parseInt(String(sub.quantidade), 10) || 1),
            produto: sub.produto.trim() || "Produto sem cadastro",
            marca: sub.marca.trim() || "Auto",
            pdv: Number(parseNumero(sub.pdv)),
            custo_frete: freteRateado,
            custo_unitario: custoCalculado,
            motivo: sub.motivo,
            observacoes: (sub.observacoes.trim() + (l.protocolo_mediacao ? ` [Protocolo: ${l.protocolo_mediacao}]` : "")).trim(),
            condicoes: sub.condicoes,
            mediacao: l.mediacao,
            plano_acao: ""
          });
        }
      } else {
        if (!l.sku.trim()) continue;
        const skuKey = normalizarSku(l.sku);
        const custoCalculado = l.custo_unitario || Number(custosMap.get(skuKey)?.custo_unitario || 0);

        registrosFormatados.push({
          data_retorno: dataGlobalRetorno,
          pedido: l.pedido.trim(),
          canal: l.canal,
          nf: l.nf.trim(),
          solicitacao: l.solicitacao,
          sku: l.sku.trim(),
          quantidade: Math.max(1, parseInt(String(l.quantidade), 10) || 1),
          produto: l.produto.trim() || "Produto sem cadastro",
          marca: l.marca.trim() || "Auto",
          pdv: Number(parseNumero(l.pdv)),
          custo_frete: Number(parseNumero(l.custo_frete)),
          custo_unitario: custoCalculado,
          motivo: l.motivo,
          observacoes: (l.observacoes.trim() + (l.protocolo_mediacao ? ` [Protocolo: ${l.protocolo_mediacao}]` : "")).trim(),
          condicoes: l.condicoes,
          mediacao: l.mediacao,
          plano_acao: ""
        });
      }
    }

    if (registrosFormatados.length === 0) {
      alert("Preencha ao menos um item válido com Pedido e SKU.");
      setSalvando(false);
      return;
    }

    let res = await supabase.from("devolucoes").insert(registrosFormatados);

    if (res.error) {
      let fallback = registrosFormatados.map((item) => {
        const copy = { ...item };
        if (res.error?.message.includes("custo_frete")) {
          copy.frete = copy.custo_frete;
          delete copy.custo_frete;
        }
        if (res.error?.message.includes("quantidade")) delete copy.quantidade;
        if (res.error?.message.includes("custo_unitario")) delete copy.custo_unitario;
        if (res.error?.message.includes("plano_acao")) delete copy.plano_acao;
        if (res.error?.message.includes("mediacao")) delete copy.mediacao;
        return copy;
      });
      res = await supabase.from("devolucoes").insert(fallback);
    }

    if (res.error) {
      alert("Erro ao gravar: " + res.error.message);
    } else {
      alert("✅ Devoluções gravadas com sucesso!");
      setLinhas([criarLinhaVazia()]);
      carregarDevolucoes();
    }
    setSalvando(false);
  };

  const excluirDevolucao = async (id: number) => {
    if (!confirm("Tem certeza que deseja apagar este registo?")) return;
    const { error } = await supabase.from("devolucoes").delete().eq("id", id);
    if (error) alert("Erro ao excluir: " + error.message);
    else carregarDevolucoes();
  };

  const salvarEdicaoInline = async (id: number) => {
    const skuKey = normalizarSku(dadosEdicao.sku);
    const custoCalc = Number(dadosEdicao.custo_unitario || custosMap.get(skuKey)?.custo_unitario || 0);

    const payload: any = {
      pedido: dadosEdicao.pedido,
      canal: dadosEdicao.canal,
      nf: dadosEdicao.nf,
      solicitacao: dadosEdicao.solicitacao,
      sku: dadosEdicao.sku,
      quantidade: Math.max(1, parseInt(String(dadosEdicao.quantidade), 10) || 1),
      produto: dadosEdicao.produto,
      marca: dadosEdicao.marca,
      pdv: Number(parseNumero(dadosEdicao.pdv)),
      custo_frete: Number(parseNumero(dadosEdicao.custo_frete ?? dadosEdicao.frete)),
      custo_unitario: custoCalc,
      motivo: dadosEdicao.motivo,
      observacoes: dadosEdicao.observacoes,
      condicoes: dadosEdicao.condicoes,
      mediacao: dadosEdicao.mediacao
    };

    let { error } = await supabase.from("devolucoes").update(payload).eq("id", id);
    if (error && error.message.includes("custo_frete")) {
      payload.frete = payload.custo_frete;
      delete payload.custo_frete;
      delete payload.quantidade;
      delete payload.custo_unitario;
      const res = await supabase.from("devolucoes").update(payload).eq("id", id);
      error = res.error;
    }

    if (error) alert("Erro ao atualizar: " + error.message);
    else {
      setIdEditando(null);
      carregarDevolucoes();
    }
  };

  const marcasDisponiveis = Array.from(
    new Set(devolucoes.map((d) => d.marca).filter(Boolean))
  );

  const devolucoesFiltradas = devolucoes.filter((item) => {
    const matchCanal = filtroCanal === "TODOS" || item.canal === filtroCanal;
    const matchMarca = filtroMarca === "TODAS" || item.marca === filtroMarca;
    const matchSol = filtroSolicitacao === "TODOS" || item.solicitacao === filtroSolicitacao;
    const matchMed =
      filtroMediacao === "TODOS" ||
      (filtroMediacao === "Ganha" && (item.mediacao === "Ganha" || item.mediacao === "Convertida / Ganha")) ||
      item.mediacao === filtroMediacao;
    const matchBusca =
      !buscaTexto ||
      String(item.pedido || "").toLowerCase().includes(buscaTexto.toLowerCase()) ||
      String(item.nf || "").toLowerCase().includes(buscaTexto.toLowerCase()) ||
      String(item.sku || "").toLowerCase().includes(buscaTexto.toLowerCase()) ||
      String(item.produto || "").toLowerCase().includes(buscaTexto.toLowerCase()) ||
      String(item.marca || "").toLowerCase().includes(buscaTexto.toLowerCase());

    return matchCanal && matchMarca && matchSol && matchMed && matchBusca;
  });

  // Métricas do Topo
  const totalItens = devolucoesFiltradas.reduce((acc, cur) => acc + Number(cur.quantidade || 1), 0);
  const totalPdv = devolucoesFiltradas.reduce((acc, cur) => acc + Number(cur.pdv || 0), 0);
  const totalFreteReverso = devolucoesFiltradas.reduce(
    (acc, cur) => acc + Number(cur.custo_frete ?? cur.frete ?? 0),
    0
  );

  const valorMediacoesGanhas = devolucoesFiltradas
    .filter((cur) => cur.mediacao === "Ganha" || cur.mediacao === "Convertida / Ganha")
    .reduce((acc, cur) => acc + Number(cur.pdv || 0), 0);

  // CÁLCULO EXATO: QUANTIDADE x CUSTO DO SKU (CMV PERDIDO)
  const valorMediacoesPerdidas = devolucoesFiltradas
    .filter((cur) => cur.mediacao === "Perdida")
    .reduce((acc, cur) => {
      const qtd = Math.max(1, Number(cur.quantidade || 1));
      const skuKey = normalizarSku(cur.sku);
      const custo = Number(cur.custo_unitario || custosMap.get(skuKey)?.custo_unitario || 0);
      return acc + (qtd * custo);
    }, 0);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel de Devoluções & Mediações</h1>
            <p className="text-sm font-medium text-slate-400">Controlo de Logística Reversa, Disputas e Planos de Ação</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Total de Itens</span>
            <span className="text-2xl font-black text-white">{totalItens} un.</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Total em PDV</span>
            <span className="text-2xl font-black text-slate-200">{formatarMoeda(totalPdv)}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Custo Frete Reverso</span>
            <span className="text-2xl font-black text-rose-400">{formatarMoeda(totalFreteReverso)}</span>
          </div>

          <div className="bg-slate-900/90 border border-emerald-900/40 p-5 rounded-2xl shadow-xl bg-gradient-to-b from-emerald-950/20 to-slate-900">
            <span className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Mediações Ganhas (Recuperado)</span>
            <span className="block text-[9px] text-slate-500 mb-2">Valor Total PDV Restituído</span>
            <span className="text-2xl font-black text-emerald-400">{formatarMoeda(valorMediacoesGanhas)}</span>
          </div>

          <div className="bg-slate-900/90 border border-rose-900/40 p-5 rounded-2xl shadow-xl bg-gradient-to-b from-rose-950/20 to-slate-900">
            <span className="block text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-1">Mediações Perdidas (Prejuízo)</span>
            <span className="block text-[9px] text-slate-500 mb-2">Quantidade × Custo SKU (CMV)</span>
            <span className="text-2xl font-black text-rose-400">{formatarMoeda(valorMediacoesPerdidas)}</span>
          </div>
        </div>

        {/* ABA 1: REGISTOS E DEVOLUÇÕES */}
        {subAba === "registros" && (
          <div className="space-y-8">
            <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>➕ Registar Devoluções & Mediações</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Marque <strong>🛒</strong> para abrir a caixinha de múltiplos SKUs no mesmo pedido. Ao selecionar Mediação, registre a contestação.
                  </p>
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
                        <th className="p-2 text-center w-8" title="Múltiplos SKUs / Carrinho">🛒</th>
                        <th className="p-2 w-28">Pedido</th>
                        <th className="p-2 w-36">Canal</th>
                        <th className="p-2 w-24">NF</th>
                        <th className="p-2 w-28">Solicitação</th>
                        <th className="p-2 w-32">SKU</th>
                        <th className="p-2 text-center w-16">Qtd</th>
                        <th className="p-2 min-w-[180px]">Produto</th>
                        <th className="p-2 w-24">Marca</th>
                        <th className="p-2 w-24 text-right">PDV (R$)</th>
                        <th className="p-2 w-20 text-right">Frete</th>
                        <th className="p-2 w-48">Motivo</th>
                        <th className="p-2 min-w-[140px]">Observações</th>
                        <th className="p-2 w-20 text-center">Condições?</th>
                        <th className="p-2 w-36">Mediação / Status</th>
                        <th className="p-2 text-center w-12">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {linhas.map((l, index) => {
                        const totalPdvCarrinho = l.carrinho
                          ? l.itensCarrinho.reduce((acc, sub) => acc + Number(parseNumero(sub.pdv)), 0)
                          : 0;

                        return (
                          <React.Fragment key={index}>
                            <tr className={`hover:bg-slate-800/20 ${l.carrinho ? "bg-purple-950/20" : ""}`}>
                              {/* CARRINHO CHECKBOX */}
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={l.carrinho}
                                  onChange={(e) => atualizarLinha(index, "carrinho", e.target.checked)}
                                  className="accent-purple-600 rounded cursor-pointer w-4 h-4"
                                  title="Marque para abrir a caixinha de múltiplos SKUs"
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

                              {/* Solicitação */}
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
                                  value={l.carrinho ? "Múltiplos (Caixinha)" : l.sku}
                                  onChange={(e) => atualizarLinha(index, "sku", e.target.value)}
                                  placeholder="SKU..."
                                  disabled={l.carrinho}
                                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono outline-none ${
                                    l.carrinho ? "text-purple-400 opacity-70 cursor-not-allowed italic" : "text-white focus:border-purple-500"
                                  }`}
                                  required={!l.carrinho}
                                />
                              </td>

                              {/* QUANTIDADE */}
                              <td className="p-2 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={l.carrinho ? l.itensCarrinho.reduce((acc, sub) => acc + (parseInt(String(sub.quantidade), 10) || 1), 0) : l.quantidade}
                                  onChange={(e) => atualizarLinha(index, "quantidade", e.target.value)}
                                  disabled={l.carrinho}
                                  className={`w-14 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center outline-none ${
                                    l.carrinho ? "text-purple-400 opacity-70 cursor-not-allowed font-bold" : "text-indigo-400 font-bold focus:border-purple-500"
                                  }`}
                                />
                              </td>

                              {/* Produto */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={l.carrinho ? `${l.itensCarrinho.length} item(ns) no carrinho` : l.produto}
                                  onChange={(e) => atualizarLinha(index, "produto", e.target.value)}
                                  placeholder="Auto-preenchido"
                                  disabled={l.carrinho}
                                  className={`w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs outline-none truncate ${
                                    l.carrinho ? "text-slate-500 cursor-not-allowed italic" : "text-slate-300"
                                  }`}
                                />
                              </td>

                              {/* Marca */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={l.carrinho ? "-" : l.marca}
                                  onChange={(e) => atualizarLinha(index, "marca", e.target.value)}
                                  placeholder="Marca"
                                  disabled={l.carrinho}
                                  className={`w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs outline-none text-center ${
                                    l.carrinho ? "text-slate-500 cursor-not-allowed" : "text-slate-300"
                                  }`}
                                />
                              </td>

                              {/* PDV (R$) */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={l.carrinho ? formatarMoeda(totalPdvCarrinho) : l.pdv}
                                  onChange={(e) => atualizarLinha(index, "pdv", e.target.value)}
                                  placeholder="0.00"
                                  disabled={l.carrinho}
                                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-right outline-none ${
                                    l.carrinho ? "text-emerald-400 font-bold bg-slate-950/80 cursor-not-allowed" : "text-emerald-400 focus:border-purple-500"
                                  }`}
                                />
                              </td>

                              {/* Frete */}
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
                                  disabled={l.carrinho}
                                  onChange={(e) => atualizarLinha(index, "motivo", e.target.value)}
                                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs outline-none cursor-pointer truncate ${
                                    l.carrinho ? "text-slate-500 cursor-not-allowed opacity-60" : "text-white"
                                  }`}
                                >
                                  {MOTIVOS_OFICIAIS.map((m, i) => (
                                    <option key={i} value={m}>{m}</option>
                                  ))}
                                </select>
                              </td>

                              {/* Observações */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={l.observacoes}
                                  disabled={l.carrinho}
                                  onChange={(e) => atualizarLinha(index, "observacoes", e.target.value)}
                                  placeholder={l.carrinho ? "Preencha na caixinha abaixo" : "Detalhes..."}
                                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs outline-none ${
                                    l.carrinho ? "text-slate-500 cursor-not-allowed opacity-60" : "text-slate-300"
                                  }`}
                                />
                              </td>

                              {/* Condições */}
                              <td className="p-2 text-center">
                                <select
                                  value={l.condicoes}
                                  disabled={l.carrinho}
                                  onChange={(e) => atualizarLinha(index, "condicoes", e.target.value as any)}
                                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs outline-none cursor-pointer text-center ${
                                    l.carrinho ? "text-slate-500 cursor-not-allowed opacity-60" : "text-white"
                                  }`}
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
                                  className={`w-full bg-slate-900 border rounded-lg p-2 text-xs font-black outline-none cursor-pointer ${
                                    l.mediacao === "Ganha"
                                      ? "border-emerald-500 text-emerald-400 bg-emerald-950/20"
                                      : l.mediacao === "Perdida"
                                      ? "border-rose-500 text-rose-400 bg-rose-950/20"
                                      : l.mediacao === "Em Disputa"
                                      ? "border-amber-500 text-amber-400 bg-amber-950/20"
                                      : "border-slate-700 text-slate-400"
                                  }`}
                                >
                                  <option value="Nenhuma">Nenhuma</option>
                                  <option value="Em Disputa">Em Disputa</option>
                                  <option value="Ganha">Ganha</option>
                                  <option value="Perdida">Perdida</option>
                                </select>
                              </td>

                              {/* Remover Linha Principal */}
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

                            {/* CAIXINHA EXPANSÍVEL: MÚLTIPLOS PRODUTOS DO CARRINHO */}
                            {l.carrinho && (
                              <tr className="bg-purple-950/15 border-b border-purple-900/40">
                                <td colSpan={16} className="p-4 pl-6 md:pl-10">
                                  <div className="bg-slate-950/80 p-5 rounded-2xl border border-purple-800/40 shadow-2xl">
                                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-800">
                                      <h4 className="text-xs font-black text-purple-400 uppercase tracking-wider flex items-center gap-2">
                                        <span>🛒 Caixinha do Carrinho · Pedido #{l.pedido || "---"} ({l.canal})</span>
                                      </h4>
                                      <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900 px-3 py-1 rounded-lg">
                                        Total PDV: {formatarMoeda(totalPdvCarrinho)} | Frete p/ item: {formatarMoeda(Number((parseNumero(l.custo_frete) / (l.itensCarrinho.length || 1)).toFixed(2)))}
                                      </span>
                                    </div>

                                    <div className="space-y-3">
                                      {l.itensCarrinho.map((sub, subIdx) => (
                                        <div key={subIdx} className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-slate-900/90 p-3 rounded-xl border border-slate-800 items-center">
                                          <div className="md:col-span-2">
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">SKU</label>
                                            <input
                                              type="text"
                                              placeholder="SKU"
                                              value={sub.sku}
                                              onChange={(e) => atualizarItemCarrinho(index, subIdx, "sku", e.target.value)}
                                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs font-mono text-white outline-none focus:border-purple-500"
                                              required
                                            />
                                          </div>

                                          <div className="md:col-span-1">
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Qtd</label>
                                            <input
                                              type="number"
                                              min="1"
                                              value={sub.quantidade}
                                              onChange={(e) => atualizarItemCarrinho(index, subIdx, "quantidade", e.target.value)}
                                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs font-mono text-indigo-400 font-bold outline-none text-center"
                                              required
                                            />
                                          </div>

                                          <div className="md:col-span-3">
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Produto</label>
                                            <input
                                              type="text"
                                              placeholder="Nome do Produto"
                                              value={sub.produto}
                                              onChange={(e) => atualizarItemCarrinho(index, subIdx, "produto", e.target.value)}
                                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-300 outline-none truncate"
                                            />
                                          </div>

                                          <div className="md:col-span-1">
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Marca</label>
                                            <input
                                              type="text"
                                              placeholder="Marca"
                                              value={sub.marca}
                                              onChange={(e) => atualizarItemCarrinho(index, subIdx, "marca", e.target.value)}
                                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-400 outline-none text-center"
                                            />
                                          </div>

                                          <div className="md:col-span-1">
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">PDV (R$)</label>
                                            <input
                                              type="number"
                                              step="0.01"
                                              placeholder="0.00"
                                              value={sub.pdv}
                                              onChange={(e) => atualizarItemCarrinho(index, subIdx, "pdv", e.target.value)}
                                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs font-mono text-emerald-400 outline-none text-right"
                                            />
                                          </div>

                                          <div className="md:col-span-2">
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Motivo</label>
                                            <select
                                              value={sub.motivo}
                                              onChange={(e) => atualizarItemCarrinho(index, subIdx, "motivo", e.target.value)}
                                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white outline-none cursor-pointer truncate"
                                            >
                                              {MOTIVOS_OFICIAIS.map((m, i) => (
                                                <option key={i} value={m}>{m}</option>
                                              ))}
                                            </select>
                                          </div>

                                          <div className="md:col-span-1">
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Obs</label>
                                            <input
                                              type="text"
                                              placeholder="Obs"
                                              value={sub.observacoes}
                                              onChange={(e) => atualizarItemCarrinho(index, subIdx, "observacoes", e.target.value)}
                                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-300 outline-none"
                                            />
                                          </div>

                                          <div className="md:col-span-1 flex items-center justify-end gap-1 pt-3">
                                            {l.itensCarrinho.length > 1 && (
                                              <button
                                                type="button"
                                                onClick={() => removerItemCarrinho(index, subIdx)}
                                                className="text-rose-400 hover:text-rose-300 font-bold px-2 py-1 text-xs bg-rose-950/60 rounded"
                                                title="Remover este item do carrinho"
                                              >
                                                ✕
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}

                                      <button
                                        type="button"
                                        onClick={() => adicionarItemCarrinho(index)}
                                        className="mt-3 text-[10px] font-bold uppercase text-purple-400 hover:text-purple-300 flex items-center gap-1.5 cursor-pointer bg-purple-950/30 px-3 py-1.5 rounded-lg border border-purple-800/40"
                                      >
                                        <span>+ Adicionar Outro Produto a Este Pedido (Carrinho)</span>
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {/* CAIXINHA EXPANSÍVEL: DETALHES DE MEDIAÇÃO */}
                            {l.mediacao !== "Nenhuma" && (
                              <tr className="bg-amber-950/10 border-b border-amber-900/30">
                                <td colSpan={16} className="p-3 pl-6 md:pl-10">
                                  <div className="bg-slate-950/90 p-3 rounded-xl border border-amber-800/40 flex flex-wrap items-center gap-4">
                                    <span className="text-[11px] font-black uppercase text-amber-400">
                                      ⚖️ Detalhes da Mediação ({l.mediacao}):
                                    </span>
                                    <div className="flex-1 min-w-[200px]">
                                      <input
                                        type="text"
                                        value={l.protocolo_mediacao}
                                        onChange={(e) => atualizarLinha(index, "protocolo_mediacao", e.target.value)}
                                        placeholder="Protocolo da Disputa / Chamado / Motivo do Ganho ou Perda..."
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white outline-none focus:border-amber-500"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center pt-3">
                  <button
                    type="button"
                    onClick={adicionarLinha}
                    className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                  >
                    + Adicionar Outro Pedido
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

            {/* TABELA DE DEVOLUÇÕES REGISTADAS */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Devoluções Registadas</h2>
                  <p className="text-xs text-slate-400 mt-1">Histórico completo com marcas, custos de logística reversa e desfecho das mediações.</p>
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Buscar Pedido, NF, SKU..."
                    value={buscaTexto}
                    onChange={(e) => setBuscaTexto(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-44"
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
                    value={filtroMarca}
                    onChange={(e) => setFiltroMarca(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="TODAS">Todas as Marcas</option>
                    {marcasDisponiveis.map((m, i) => (
                      <option key={i} value={m}>{m}</option>
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
                    <option value="Ganha">Ganha</option>
                    <option value="Perdida">Perdida</option>
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
                        <th className="p-3 text-center">Qtd</th>
                        <th className="p-3 min-w-[200px]">Produto</th>
                        <th className="p-3 text-center">Marca</th>
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
                        const skuKey = normalizarSku(item.sku);
                        const custoUnit = Number(item.custo_unitario || custosMap.get(skuKey)?.custo_unitario || 0);
                        const qtdItem = Math.max(1, Number(item.quantidade || 1));
                        const perdaTotalItem = qtdItem * custoUnit;

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

                            {/* Tipo */}
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

                            {/* QTD */}
                            <td className="p-3 text-center font-bold text-indigo-300">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="1"
                                  value={dadosEdicao.quantidade}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, quantidade: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 w-12 text-center text-white"
                                />
                              ) : (
                                `${qtdItem} un.`
                              )}
                            </td>

                            {/* Produto */}
                            <td className="p-3 text-slate-300 max-w-[200px] truncate" title={item.produto}>
                              {item.produto}
                            </td>

                            {/* MARCA */}
                            <td className="p-3 text-center">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={dadosEdicao.marca}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, marca: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 w-20 text-center text-white"
                                />
                              ) : (
                                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                                  {item.marca || "-"}
                                </span>
                              )}
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

                            {/* Motivo */}
                            <td className="p-3">
                              {isEditing ? (
                                <select
                                  value={dadosEdicao.motivo}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, motivo: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white max-w-[200px]"
                                >
                                  {MOTIVOS_OFICIAIS.map((m, i) => (
                                    <option key={i} value={m}>{m}</option>
                                  ))}
                                </select>
                              ) : (
                                <>
                                  <span className="font-bold text-slate-200">{item.motivo}</span>
                                  {item.observacoes && (
                                    <span className="block text-[11px] text-slate-400 max-w-[200px] truncate" title={item.observacoes}>
                                      {item.observacoes}
                                    </span>
                                  )}
                                </>
                              )}
                            </td>

                            {/* Condições */}
                            <td className="p-3 text-center">
                              {isEditing ? (
                                <select
                                  value={dadosEdicao.condicoes}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, condicoes: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white"
                                >
                                  <option value="Não">Não</option>
                                  <option value="Sim">Sim</option>
                                </select>
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    item.condicoes === "Sim"
                                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-900/40"
                                      : "bg-rose-950/60 text-rose-400 border border-rose-900/40"
                                  }`}
                                >
                                  {item.condicoes || "Não"}
                                </span>
                              )}
                            </td>

                            {/* Mediação */}
                            <td className="p-3 text-center">
                              {isEditing ? (
                                <select
                                  value={dadosEdicao.mediacao || "Nenhuma"}
                                  onChange={(e) => setDadosEdicao({ ...dadosEdicao, mediacao: e.target.value })}
                                  className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white font-bold"
                                >
                                  <option value="Nenhuma">Nenhuma</option>
                                  <option value="Em Disputa">Em Disputa</option>
                                  <option value="Ganha">Ganha</option>
                                  <option value="Perdida">Perdida</option>
                                </select>
                              ) : (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                                      item.mediacao === "Ganha" || item.mediacao === "Convertida / Ganha"
                                        ? "bg-emerald-950/80 text-emerald-300 border-emerald-700"
                                        : item.mediacao === "Perdida"
                                        ? "bg-rose-950/80 text-rose-300 border-rose-700"
                                        : item.mediacao === "Em Disputa"
                                        ? "bg-amber-950/80 text-amber-300 border-amber-700"
                                        : "bg-slate-900 text-slate-500 border-slate-800"
                                    }`}
                                  >
                                    {item.mediacao || "Nenhuma"}
                                  </span>
                                  {item.mediacao === "Perdida" && (
                                    <span className="text-[9px] font-mono font-bold text-rose-400" title={`Prejuízo = ${qtdItem} un x ${formatarMoeda(custoUnit)}`}>
                                      Prejuízo: {formatarMoeda(perdaTotalItem)}
                                    </span>
                                  )}
                                </div>
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
                                        quantidade: item.quantidade || 1,
                                        custo_unitario: custoUnit,
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
                Aponte medidas corretivas para os principais motivos de devolução e reduza o índice nos canais.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Pedido / NF</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3 text-center">Qtd</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3 text-center">Marca</th>
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
                      <td className="p-3 text-center font-bold text-slate-300">{item.quantidade || 1} un.</td>
                      <td className="p-3 text-slate-300 max-w-[200px] truncate">{item.produto}</td>
                      <td className="p-3 text-center font-mono text-slate-400">{item.marca || "-"}</td>
                      <td className="p-3 text-rose-400 font-bold">{item.motivo}</td>
                      <td className="p-3">
                        <input
                          type="text"
                          defaultValue={item.plano_acao || ""}
                          placeholder="Ex: Ajustar tabela de medidas no canal, reforçar embalagem..."
                          onBlur={async (e) => {
                            const val = e.target.value.trim();
                            await supabase.from("devolucoes").update({ plano_acao: val }).eq("id", item.id);
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500"
                        />
                      </td>
                      <td className="p-3 text-center text-slate-500 text-[10px]">
                        Auto-salvo ao sair
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