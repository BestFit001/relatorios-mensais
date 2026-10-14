"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

const canaisPadraoBase = [
  "Mercado Livre 1",
  "Mercado Livre 2",
  "Mercado Livre 3",
  "Shopee",
  "Amazon",
  "Magalu",
  "Netshoes",
  "Centauro",
  "Shein",
  "TikTok",
  "Site"
];

const formatarMoeda = (valor: number) =>
  "R$ " + (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PlpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // 2 Abas: Entrada | Manifesto
  const [abaAtiva, setAbaAtiva] = useState<"entrada" | "manifesto">("manifesto");

  // Analista responsável
  const [nomeAnalista, setNomeAnalista] = useState("");

  // Canais e Taxas
  const [canais, setCanais] = useState<string[]>(canaisPadraoBase);
  const [taxasFlexCanal, setTaxasFlexCanal] = useState<Record<string, number>>({});
  const [modalTaxasAberto, setModalTaxasAberto] = useState(false);
  const [novoCanalNome, setNovoCanalNome] = useState("");

  // ==========================================
  // ABA 1: ENTRADA (MANUAL & PLANILHA)
  // ==========================================
  const [modoEntrada, setModoEntrada] = useState<"manual" | "planilha">("manual");
  const [dataEnvio, setDataEnvio] = useState(new Date().toISOString().split("T")[0]);
  const [canalSelecionado, setCanalSelecionado] = useState(canaisPadraoBase[0]);
  const [modalidade, setModalidade] = useState<"FLEX" | "AGENCIA" | "CORREIOS">("FLEX");

  const [pedidosTexto, setPedidosTexto] = useState("");
  const [matrizPlanilha, setMatrizPlanilha] = useState<any[]>([]);
  const [colunaPedido, setColunaPedido] = useState("A");
  const [linhaInicial, setLinhaInicial] = useState("2");
  const [previewQtd, setPreviewQtd] = useState(0);

  // ==========================================
  // ABA 2: MANIFESTO & IMPRESSÃO
  // ==========================================
  const [filtroDataInicio, setFiltroDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [filtroDataFim, setFiltroDataFim] = useState(new Date().toISOString().split("T")[0]);
  const [filtroCanal, setFiltroCanal] = useState("TODOS");
  const [filtroModalidade, setFiltroModalidade] = useState("FLEX_CORREIOS");
  const [pedidos, setPedidos] = useState<any[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    try {
      const u = JSON.parse(usuarioLogado);
      setNomeAnalista(u.nome || u.email || "Expedição");
    } catch {
      setNomeAnalista("Expedição");
    }

    carregarCanaisETaxas();
    buscarPedidos();
  }, []);

  useEffect(() => {
    buscarPedidos();
  }, [filtroDataInicio, filtroDataFim, filtroCanal, filtroModalidade]);

  const carregarCanaisETaxas = async () => {
    const mapaUnico = new Map<string, string>();
    canaisPadraoBase.forEach((c) => mapaUnico.set(c.trim().toLowerCase(), c.trim()));

    const { data: canaisData } = await supabase.from("config_regras_canais").select("canal");
    if (canaisData) {
      canaisData.forEach((c: any) => {
        if (c.canal?.trim()) mapaUnico.set(c.canal.trim().toLowerCase(), c.canal.trim());
      });
    }

    const lista = Array.from(mapaUnico.values()).sort((a, b) => a.localeCompare(b));
    setCanais(lista);

    const salvo = localStorage.getItem("plp_taxas_flex_por_canal");
    const taxas: Record<string, number> = salvo ? JSON.parse(salvo) : {};
    lista.forEach((c) => {
      if (taxas[c] === undefined) taxas[c] = 12.99;
    });

    setTaxasFlexCanal(taxas);
    localStorage.setItem("plp_taxas_flex_por_canal", JSON.stringify(taxas));
  };

  const atualizarTaxaFlex = (c: string, v: number) => {
    const novo = { ...taxasFlexCanal, [c]: v };
    setTaxasFlexCanal(novo);
    localStorage.setItem("plp_taxas_flex_por_canal", JSON.stringify(novo));
  };

  const handleAdicionarCanal = () => {
    const n = novoCanalNome.trim();
    if (!n) return;
    if (!canais.some((c) => c.toLowerCase() === n.toLowerCase())) {
      const novaLista = [...canais, n].sort((a, b) => a.localeCompare(b));
      setCanais(novaLista);
      atualizarTaxaFlex(n, 12.99);
      setNovoCanalNome("");
    }
  };

  const buscarPedidos = async () => {
    setLoading(true);
    let query = supabase
      .from("plp_pedidos")
      .select("*")
      .gte("data_envio", filtroDataInicio)
      .lte("data_envio", filtroDataFim)
      .order("canal", { ascending: true })
      .order("created_at", { ascending: true });

    if (filtroCanal !== "TODOS") {
      query = query.eq("canal", filtroCanal);
    }

    if (filtroModalidade === "FLEX_CORREIOS") {
      query = query.in("modalidade", ["FLEX", "CORREIOS"]);
    } else if (filtroModalidade !== "TODOS") {
      query = query.eq("modalidade", filtroModalidade);
    }

    const { data } = await query;
    setPedidos(data || []);
    setLoading(false);
  };

  const handleUploadPlanilha = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" });
        setMatrizPlanilha(matrix);

        const col = colunaPedido.trim().toUpperCase();
        const start = Math.max(0, parseInt(linhaInicial, 10) - 1 || 0);
        const count = matrix.slice(start).filter((r: any) => String(r[col] || "").trim()).length;
        setPreviewQtd(count);
      } catch (err: any) {
        alert("Erro ao ler ficheiro: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSalvarPedidos = async () => {
    let listaPedidos: string[] = [];

    if (modoEntrada === "manual") {
      listaPedidos = pedidosTexto
        .split(/[\n,;]+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (listaPedidos.length === 0) return alert("Digite ou cole ao menos um número de pedido.");
    } else {
      if (matrizPlanilha.length === 0) return alert("Selecione um ficheiro Excel/CSV.");
      const col = colunaPedido.trim().toUpperCase();
      const start = Math.max(0, parseInt(linhaInicial, 10) - 1 || 0);

      for (let r = start; r < matrizPlanilha.length; r++) {
        const v = String(matrizPlanilha[r]?.[col] || "").trim();
        if (v && v.toLowerCase() !== "pedido" && v.toLowerCase() !== "n.º de venda") {
          listaPedidos.push(v);
        }
      }
      if (listaPedidos.length === 0) return alert(`Nenhum pedido encontrado na coluna ${col}.`);
    }

    setSalvando(true);
    const valorFreteUnit = modalidade === "FLEX" ? Number(taxasFlexCanal[canalSelecionado] ?? 12.99) : 0;

    const payload = listaPedidos.map((ped) => ({
      data_envio: dataEnvio,
      numero_pedido: ped,
      modalidade: modalidade,
      canal: canalSelecionado,
      valor_frete: valorFreteUnit,
    }));

    const { error } = await supabase.from("plp_pedidos").insert(payload);
    if (error) {
      alert("Erro ao gravar pedidos: " + error.message);
    } else {
      alert(`✅ ${payload.length} pedido(s) gravado(s) com sucesso!`);
      setPedidosTexto("");
      setMatrizPlanilha([]);
      setPreviewQtd(0);
      buscarPedidos();
      setAbaAtiva("manifesto");
    }
    setSalvando(false);
  };

  const handleExcluirPedido = async (id: number) => {
    if (!confirm("Remover este pedido?")) return;
    await supabase.from("plp_pedidos").delete().eq("id", id);
    buscarPedidos();
  };

  const handleLimparPeriodo = async () => {
    if (!confirm(`Remover TODOS os ${pedidos.length} pedidos deste filtro?`)) return;
    const ids = pedidos.map((p) => p.id);
    if (ids.length === 0) return;
    setLoading(true);
    await supabase.from("plp_pedidos").delete().in("id", ids);
    buscarPedidos();
  };

  const handleBaixarExcel = () => {
    if (pedidos.length === 0) return alert("Nenhum pedido no período filtrado.");

    const dados = pedidos.map((item) => ({
      "Data de Envio": item.data_envio,
      "Número do Pedido": item.numero_pedido,
      Canal: item.canal,
      "Valor Frete (R$)": item.modalidade === "FLEX" ? Number(item.valor_frete || 0) : 0,
      Modalidade: item.modalidade,
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PLP Expedição");
    XLSX.writeFile(wb, `PLP_${filtroDataInicio}_ate_${filtroDataFim}.xlsx`);
  };

  const handleImprimir = () => {
    if (pedidos.length === 0) return alert("Nenhum pedido para imprimir.");
    window.print();
  };

  // Divide a lista em 4 colunas verticais densas (cabe até 120 pedidos por folha A4 paisagem)
  const agruparPedidosEmColunas = (lista: any[], colunasTotais = 4) => {
    const totalItens = lista.length;
    if (totalItens === 0) return [];
    const linhasPorColuna = Math.max(26, Math.ceil(totalItens / colunasTotais));
    const grade: any[][] = [];

    for (let r = 0; r < linhasPorColuna; r++) {
      const linha: any[] = [];
      for (let c = 0; c < colunasTotais; c++) {
        const itemIdx = c * linhasPorColuna + r;
        linha.push(itemIdx < totalItens ? { ...lista[itemIdx], numGlobal: itemIdx + 1 } : null);
      }
      grade.push(linha);
    }
    return grade;
  };

  const gradeColunas = agruparPedidosEmColunas(pedidos, 4);

  const kpis = {
    total: pedidos.length,
    flex: pedidos.filter((p) => p.modalidade === "FLEX").length,
    agencia: pedidos.filter((p) => p.modalidade === "AGENCIA").length,
    correios: pedidos.filter((p) => p.modalidade === "CORREIOS").length,
    custoTotalFlex: pedidos
      .filter((p) => p.modalidade === "FLEX")
      .reduce((acc, p) => acc + Number(p.valor_frete || 0), 0),
  };

  const formatarMetodoEnvioTexto = () => {
    if (filtroModalidade === "FLEX_CORREIOS") return "Flex + Correios";
    if (filtroModalidade === "FLEX") return "Mercado Envios Flex";
    if (filtroModalidade === "AGENCIA") return "Agência";
    if (filtroModalidade === "CORREIOS") return "Correios";
    return "Todas as Modalidades";
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans print:p-0 print:bg-white print:text-black">
      
      {/* CSS DE IMPRESSÃO MINIMALISTA (ESTILO DANFE - ZERO GASTO DE TINTA) */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          }
          nav, header, button, .print-hide {
            display: none !important;
          }
          .folha-print-manifesto {
            width: 100% !important;
            border: 2px solid #000000 !important;
            background: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .print-header-title {
            background-color: #000000 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-header-sub {
            background-color: #e5e7eb !important;
            color: #000000 !important;
            border-bottom: 1px solid #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-th {
            background-color: #f3f4f6 !important;
            color: #000000 !important;
            border-bottom: 1px solid #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          td, th {
            border: 1px solid #d1d5db !important;
            padding: 2px 4px !important;
            font-size: 10px !important;
            line-height: 1.15 !important;
          }
          .print-row-alt {
            background-color: #f9fafb !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="max-w-[98%] mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Expedição & PLPs</h1>
            <p className="text-sm font-medium text-slate-400">
              Controle de envios e geração de manifestos de conferência
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setModalTaxasAberto(true)}
              className="bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
            >
              ⚙️ Taxas Flex por Canal
            </button>
            <Navbar />
          </div>
        </div>

        {/* 2 ABAS */}
        <div className="flex gap-3 print:hidden">
          <button
            onClick={() => setAbaAtiva("entrada")}
            className={`px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "entrada"
                ? "bg-purple-600 text-white shadow-purple-900/40"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
            }`}
          >
            📥 1. Entrada de Pedidos
          </button>
          <button
            onClick={() => setAbaAtiva("manifesto")}
            className={`px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "manifesto"
                ? "bg-indigo-600 text-white shadow-indigo-900/40"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
            }`}
          >
            🖨️ 2. Manifesto de Expedição & Impressão
          </button>
        </div>

        {/* ABA 1: ENTRADA DE PEDIDOS (MANUAL OU PLANILHA) */}
        {abaAtiva === "entrada" && (
          <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5 animate-in fade-in duration-300 print:hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📥 Lançamento de Pedidos</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Selecione canal, modalidade e a forma de carregar os dados</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase">Origem:</span>
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModoEntrada("manual")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                      modoEntrada === "manual" ? "bg-purple-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ✍️ Digitar / Colar
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoEntrada("planilha")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                      modoEntrada === "planilha" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    📑 Planilha
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data de Envio:</label>
                <input
                  type="date"
                  value={dataEnvio}
                  onChange={(e) => setDataEnvio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Canal de Venda:
                </label>
                <select
                  value={canalSelecionado}
                  onChange={(e) => setCanalSelecionado(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer"
                >
                  {canais.map((c, i) => (
                    <option key={i} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Modalidade de Envio:
                </label>
                <select
                  value={modalidade}
                  onChange={(e) => setModalidade(e.target.value as any)}
                  className={`w-full bg-slate-950 border rounded-xl p-2.5 text-xs font-black outline-none cursor-pointer ${
                    modalidade === "FLEX" ? "border-amber-500/80 text-amber-400" : "border-slate-700 text-white"
                  }`}
                >
                  <option value="FLEX">⚡ FLEX (Com Frete)</option>
                  <option value="AGENCIA">🏢 AGÊNCIA (R$ 0,00)</option>
                  <option value="CORREIOS">📮 CORREIOS (R$ 0,00)</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Valor atribuído na <strong className="text-white">Coluna D</strong> do Excel:
              </span>
              <strong className={modalidade === "FLEX" ? "text-amber-400 text-sm font-mono" : "text-slate-500"}>
                {modalidade === "FLEX" ? formatarMoeda(taxasFlexCanal[canalSelecionado] ?? 12.99) : "R$ 0,00"}
              </strong>
            </div>

            {modoEntrada === "manual" ? (
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">
                  Cole os números de pedido (um por linha ou separados por vírgula):
                </label>
                <textarea
                  rows={4}
                  value={pedidosTexto}
                  onChange={(e) => setPedidosTexto(e.target.value)}
                  placeholder="2000018949435054&#10;2000018941773046&#10;2000018941467386"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-white outline-none focus:border-purple-500 transition-all resize-y"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800 items-end">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ficheiro (Excel/CSV):</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleUploadPlanilha}
                    className="w-full bg-slate-900 border border-slate-700 file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-bold file:py-1.5 file:px-3 file:rounded-lg file:mr-3 file:cursor-pointer rounded-xl p-1 text-xs text-slate-300 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Coluna do Pedido:</label>
                  <input
                    type="text"
                    value={colunaPedido}
                    onChange={(e) => setColunaPedido(e.target.value.toUpperCase())}
                    placeholder="A"
                    className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha Inicial:</label>
                  <input
                    type="number"
                    value={linhaInicial}
                    onChange={(e) => setLinhaInicial(e.target.value)}
                    placeholder="2"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSalvarPedidos}
                disabled={salvando}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-900/40 transition-all"
              >
                {salvando ? "A Gravar..." : modoEntrada === "manual" ? "Salvar Pedido(s)" : `Importar Planilha ${previewQtd > 0 ? `(${previewQtd} encontrados)` : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* ABA 2: MANIFESTO DE EXPEDIÇÃO & IMPRESSÃO A4 */}
        {abaAtiva === "manifesto" && (
          <div className="space-y-6">
            
            {/* PAINEL DE CONTROLE EM TELA (Print Hidden) */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4 print:hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white">Manifesto de Expedição</h2>
                  <p className="text-xs text-slate-400">Layout compacto para caber até 120 volumes em 1 folha A4 deitada</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleImprimir}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-indigo-900/40 transition-all flex items-center gap-2"
                  >
                    <span>🖨️ Imprimir Lista (A4)</span>
                  </button>
                  <button
                    onClick={handleBaixarExcel}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2"
                  >
                    <span>📥 Baixar Excel</span>
                  </button>
                  <button
                    onClick={handleLimparPeriodo}
                    disabled={pedidos.length === 0}
                    className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
                  >
                    🗑️ Limpar Filtro
                  </button>
                </div>
              </div>

              {/* Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">De:</label>
                  <input
                    type="date"
                    value={filtroDataInicio}
                    onChange={(e) => setFiltroDataInicio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Até:</label>
                  <input
                    type="date"
                    value={filtroDataFim}
                    onChange={(e) => setFiltroDataFim(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal:</label>
                  <select
                    value={filtroCanal}
                    onChange={(e) => setFiltroCanal(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todos os Canais</option>
                    {canais.map((c, i) => (
                      <option key={i} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Modalidade:</label>
                  <select
                    value={filtroModalidade}
                    onChange={(e) => setFiltroModalidade(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2 text-xs font-bold text-amber-300 outline-none cursor-pointer"
                  >
                    <option value="FLEX_CORREIOS">⚡ FLEX + Correios (Unificados)</option>
                    <option value="TODOS">Todas as Modalidades</option>
                    <option value="FLEX">Apenas Flex</option>
                    <option value="AGENCIA">Apenas Agência</option>
                    <option value="CORREIOS">Apenas Correios</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Analista no Documento:</label>
                  <input
                    type="text"
                    value={nomeAnalista}
                    onChange={(e) => setNomeAnalista(e.target.value)}
                    placeholder="Nome do analista..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white outline-none"
                  />
                </div>
              </div>

              {/* KPIs de Tela */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-1">
                <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Total Volumes</span>
                  <span className="text-base font-black text-white">{kpis.total}</span>
                </div>
                <div className="bg-slate-950 border border-amber-900/40 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-amber-400 uppercase">Flex</span>
                  <span className="text-base font-black text-amber-400">{kpis.flex}</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Agência</span>
                  <span className="text-base font-black text-white">{kpis.agencia}</span>
                </div>
                <div className="bg-slate-950 border border-indigo-900/40 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-indigo-400 uppercase">Correios</span>
                  <span className="text-base font-black text-indigo-400">{kpis.correios}</span>
                </div>
                <div className="bg-slate-950 border border-emerald-900/40 p-2.5 rounded-xl">
                  <span className="block text-[9px] font-bold text-emerald-400 uppercase">Frete Flex Total</span>
                  <span className="text-base font-black text-emerald-400">{formatarMoeda(kpis.custoTotalFlex)}</span>
                </div>
              </div>
            </div>

            {/* DOCUMENTO DE IMPRESSÃO (LIMPO, ECONÔMICO, ESTILO DANFE) */}
            <div className="folha-print-manifesto bg-white text-black p-4 rounded-xl border border-slate-300 shadow-xl">
              
              {/* CABEÇALHO FORMAL */}
              <div className="border-b-2 border-black pb-2 mb-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h1 className="text-base font-black uppercase tracking-wide">PLP DE ENVIOS — BEST FIT</h1>
                    <p className="text-[10px] text-gray-700">Controle de Expedição e Autorização de Envio</p>
                  </div>
                  <div className="text-right text-[11px] leading-tight">
                    <p>Data: <strong>{filtroDataInicio === filtroDataFim ? filtroDataInicio : `${filtroDataInicio} a ${filtroDataFim}`}</strong></p>
                    <p>Método: <strong>{formatarMetodoEnvioTexto()}</strong></p>
                    <p>Analista: <strong>{nomeAnalista || "Expedição"}</strong></p>
                  </div>
                </div>
              </div>

              {/* GRADE DE PEDIDOS LADO A LADO (4 COLUNAS DE ALTA DENSIDADE) */}
              <div className="overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="print-th bg-gray-100 font-bold text-[9px] uppercase border-b border-black">
                      <th className="p-1 text-center w-7 border-r border-gray-300">#</th>
                      <th className="p-1 border-r border-gray-300">Número do Pedido</th>
                      <th className="p-1 text-center border-r-2 border-black w-14">Canal</th>

                      <th className="p-1 text-center w-7 border-r border-gray-300">#</th>
                      <th className="p-1 border-r border-gray-300">Número do Pedido</th>
                      <th className="p-1 text-center border-r-2 border-black w-14">Canal</th>

                      <th className="p-1 text-center w-7 border-r border-gray-300">#</th>
                      <th className="p-1 border-r border-gray-300">Número do Pedido</th>
                      <th className="p-1 text-center border-r-2 border-black w-14">Canal</th>

                      <th className="p-1 text-center w-7 border-r border-gray-300">#</th>
                      <th className="p-1 border-r border-gray-300">Número do Pedido</th>
                      <th className="p-1 text-center w-14">Canal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeColunas.map((linha, rIdx) => {
                      const isAlt = rIdx % 2 === 1;
                      return (
                        <tr
                          key={rIdx}
                          className={`h-5 border-b border-gray-200 ${
                            isAlt ? "print-row-alt bg-gray-50" : "bg-white"
                          }`}
                        >
                          {linha.map((celula, cIdx) => {
                            const isLastCol = cIdx === 3;
                            if (!celula) {
                              return (
                                <React.Fragment key={cIdx}>
                                  <td className="p-0.5 text-center text-gray-300 border-r border-gray-200">-</td>
                                  <td className="p-0.5 border-r border-gray-200"></td>
                                  <td className={`p-0.5 ${!isLastCol ? "border-r-2 border-black" : ""}`}></td>
                                </React.Fragment>
                              );
                            }

                            return (
                              <React.Fragment key={cIdx}>
                                <td className="p-0.5 text-center font-mono text-[9px] text-gray-500 border-r border-gray-200">
                                  {celula.numGlobal}
                                </td>
                                <td className="p-0.5 font-mono font-bold text-[10px] text-black border-r border-gray-200 truncate max-w-[130px]">
                                  {celula.numero_pedido}
                                </td>
                                <td className={`p-0.5 text-center text-[8px] font-semibold text-gray-700 truncate ${!isLastCol ? "border-r-2 border-black" : ""}`}>
                                  {celula.canal.replace("Mercado Livre", "ML")}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {pedidos.length === 0 && (
                      <tr>
                        <td colSpan={12} className="p-6 text-center text-gray-500 italic text-xs">
                          Nenhum pedido registrado no filtro selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* TOTALIZADOR */}
              <div className="flex justify-between items-center border-t-2 border-black p-2 mt-2 bg-gray-100 text-xs font-bold">
                <span>TOTAL DE VOLUMES CONFERIDOS:</span>
                <span className="font-mono text-sm">{kpis.total} pacotes</span>
              </div>

              {/* RODAPÉ DE ASSINATURA EM 3 COLUNAS */}
              <div className="grid grid-cols-3 gap-6 pt-6 mt-4 border-t border-gray-300 text-[10px]">
                <div className="border-t border-black pt-1">
                  <p className="font-bold">Analista ({nomeAnalista || "Expedição"}):</p>
                  <p className="text-gray-500">Assinatura: ___________________________</p>
                </div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold">Responsável pelo Estoque:</p>
                  <p className="text-gray-500">Assinatura: ___________________________</p>
                </div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold">Motorista / Transportador:</p>
                  <p className="text-gray-500">Assinatura: ___________________________</p>
                </div>
              </div>

              <div className="text-[9px] text-gray-400 text-center pt-2">
                Documento para controle interno — PLP de Envios Best Fit
              </div>
            </div>

            {/* TABELA DE AUDITORIA INDIVIDUAL (Print Hidden) */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 print:hidden">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Auditoria e Exclusão Individual ({pedidos.length})
              </h3>
              <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2 text-center">#</th>
                      <th className="p-2">Data</th>
                      <th className="p-2">N.º do Pedido</th>
                      <th className="p-2">Canal</th>
                      <th className="p-2 text-center">Modalidade</th>
                      <th className="p-2 text-right text-amber-300">Frete (Coluna D)</th>
                      <th className="p-2 text-center">Excluir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {pedidos.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-2 font-mono text-slate-300">{item.data_envio}</td>
                        <td className="p-2 font-mono font-bold text-white">{item.numero_pedido}</td>
                        <td className="p-2 text-slate-300 font-semibold">{item.canal}</td>
                        <td className="p-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                              item.modalidade === "FLEX"
                                ? "bg-amber-900/30 text-amber-400 border-amber-800/50"
                                : item.modalidade === "AGENCIA"
                                ? "bg-slate-800 text-slate-300 border-slate-700"
                                : "bg-indigo-900/30 text-indigo-400 border-indigo-800/50"
                            }`}
                          >
                            {item.modalidade}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-400">
                          {item.modalidade === "FLEX" ? formatarMoeda(item.valor_frete) : "R$ 0,00"}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => handleExcluirPedido(item.id)}
                            className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer font-bold"
                            title="Remover pedido"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* MODAL CONFIGURAÇÃO TAXAS FLEX */}
        {modalTaxasAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 print:hidden">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 md:p-8 shadow-2xl space-y-5">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                  <span>⚙️ Configurar Valor de Frete Flex por Canal</span>
                </h3>
                <button
                  onClick={() => setModalTaxasAberto(false)}
                  className="text-slate-400 hover:text-white text-base cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Novo canal..."
                  value={novoCanalNome}
                  onChange={(e) => setNovoCanalNome(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none flex-1"
                />
                <button
                  type="button"
                  onClick={handleAdicionarCanal}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase cursor-pointer"
                >
                  + Adicionar Canal
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {canais.map((c, i) => (
                  <div key={i} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{c}</span>
                    <div className="flex items-center gap-1.5 w-28">
                      <span className="text-[10px] text-slate-500">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={taxasFlexCanal[c] ?? 12.99}
                        onChange={(e) => atualizarTaxaFlex(c, parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-1.5 text-xs font-mono text-center text-amber-300 font-bold outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800">
                <button
                  onClick={() => setModalTaxasAberto(false)}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}