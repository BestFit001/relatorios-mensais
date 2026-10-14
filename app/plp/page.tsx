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

  // Navegação entre as 2 Abas principais
  const [abaAtiva, setAbaAtiva] = useState<"entrada" | "manifesto">("manifesto");

  // Usuário / Analista Logado
  const [nomeAnalista, setNomeAnalista] = useState("Gabrielle");

  // Canais e Taxas
  const [canais, setCanais] = useState<string[]>(canaisPadraoBase);
  const [taxasFlexCanal, setTaxasFlexCanal] = useState<Record<string, number>>({});
  const [modalTaxasAberto, setModalTaxasAberto] = useState(false);
  const [novoCanalNome, setNovoCanalNome] = useState("");

  // ==========================================
  // ABA 1: ENTRADA (MANUAL & PLANILHA UNIFICADAS)
  // ==========================================
  const [modoEntrada, setModoEntrada] = useState<"manual" | "planilha">("manual");
  const [dataEnvio, setDataEnvio] = useState(new Date().toISOString().split("T")[0]);
  const [canalSelecionado, setCanalSelecionado] = useState(canaisPadraoBase[0]);
  const [modalidade, setModalidade] = useState<"FLEX" | "AGENCIA" | "CORREIOS">("FLEX");

  // Entrada Manual
  const [pedidosTexto, setPedidosTexto] = useState("");

  // Entrada Planilha
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
  const [filtroModalidade, setFiltroModalidade] = useState("FLEX_CORREIOS"); // Padrão: FLEX + Correios unidos
  const [pedidos, setPedidos] = useState<any[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    try {
      const u = JSON.parse(usuarioLogado);
      if (u.nome) setNomeAnalista(u.nome);
    } catch {}

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
      alert(`✅ ${payload.length} pedido(s) de [${modalidade}] registrado(s) para ${canalSelecionado}!`);
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
      "Valor Frete (R$)": item.modalidade === "FLEX" ? Number(item.valor_frete || 0) : 0, // COLUNA D ESTRITA
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

  // Divide a lista de pedidos em colunas paralelas para caber em 1 página landscape
  const agruparPedidosEmColunas = (lista: any[], colunasTotais = 4) => {
    const totalItens = lista.length;
    if (totalItens === 0) return [];
    const linhasPorColuna = Math.max(25, Math.ceil(totalItens / colunasTotais));
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
      
      {/* ESTILOS DE IMPRESSÃO EM PAISAGEM (A4 LANDSCAPE) IDÊNTICO AO EXCEL */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 6mm 8mm;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            font-family: Calibri, 'Segoe UI', Arial, sans-serif !important;
          }
          nav, header, button, .print-hide {
            display: none !important;
          }
          .folha-plp-excel {
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          .excel-barra-1 {
            background-color: #1F3864 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .excel-barra-2 {
            background-color: #2E5FA3 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .excel-meta-label {
            background-color: #D6E4F7 !important;
            color: #1F3864 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .excel-th {
            background-color: #1F3864 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .excel-row-zebra {
            background-color: #F2F6FC !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .excel-border {
            border: 1px solid #B0C4DE !important;
          }
          .excel-rodape-bloco {
            background-color: #2E5FA3 !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .excel-assinatura-campo {
            background-color: #F0F4FA !important;
            color: #1F3864 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="max-w-[98%] mx-auto space-y-6">
        
        {/* CABEÇALHO DO SISTEMA (Oculto na impressão) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Expedição & PLPs</h1>
            <p className="text-sm font-medium text-slate-400">
              Conferência rápida, rateio de fretes e impressão de alta densidade
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

        {/* NAVEGAÇÃO ENTRE AS 2 ABAS (Oculto na impressão) */}
        <div className="flex gap-3 print:hidden">
          <button
            onClick={() => setAbaAtiva("entrada")}
            className={`px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "entrada"
                ? "bg-purple-600 text-white shadow-purple-900/40"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
            }`}
          >
            📥 1. Entrada de Pedidos (Manual e Planilha)
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

        {/* ======================================================== */}
        {/* ABA 1: ENTRADA DE PEDIDOS (MANUAL E PLANILHA UNIFICADAS) */}
        {/* ======================================================== */}
        {abaAtiva === "entrada" && (
          <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5 animate-in fade-in duration-300 print:hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📥 Lançamento de Pedidos</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Selecione canal, modalidade e a forma de carregar os dados</p>
              </div>

              {/* Seletor Rápido: Digitar ou Subir Planilha */}
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

            {/* Campos Comuns de Destino */}
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
                  Canal de Venda ({canais.length}):
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

            {/* Aviso sobre Frete atribuído */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Valor atribuído na <strong className="text-white">Coluna D</strong> do Excel:
              </span>
              <strong className={modalidade === "FLEX" ? "text-amber-400 text-sm font-mono" : "text-slate-500"}>
                {modalidade === "FLEX" ? formatarMoeda(taxasFlexCanal[canalSelecionado] ?? 12.99) : "R$ 0,00"}
              </strong>
            </div>

            {/* Modo 1: Digitar/Colar */}
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
              /* Modo 2: Upload Planilha */
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

        {/* ======================================================== */}
        {/* ABA 2: MANIFESTO DE EXPEDIÇÃO & IMPRESSÃO EM PAISAGEM    */}
        {/* ======================================================== */}
        {abaAtiva === "manifesto" && (
          <div className="space-y-6">
            
            {/* PAINEL DE FILTROS E AÇÕES (Oculto na impressão) */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4 print:hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white">Manifesto de Expedição</h2>
                  <p className="text-xs text-slate-400">Layout compacto otimizado para caber em 1 folha A4</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleImprimir}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-indigo-900/40 transition-all flex items-center gap-2"
                  >
                    <span>🖨️ Imprimir Lista (A4)</span>
                  </button>
                  <button
                    onClick={handleBaixarExcel}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2"
                  >
                    <span>📥 Baixar Excel (Coluna D)</span>
                  </button>
                  <button
                    onClick={handleLimparPeriodo}
                    disabled={pedidos.length === 0}
                    className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
                  >
                    🗑️ Limpar Filtro
                  </button>
                </div>
              </div>

              {/* Filtros em Linha */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Agrupamento Modalidade:</label>
                  <select
                    value={filtroModalidade}
                    onChange={(e) => setFiltroModalidade(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2 text-xs font-bold text-amber-300 outline-none cursor-pointer"
                  >
                    <option value="FLEX_CORREIOS">⚡ FLEX + Correios (Mesma Lista)</option>
                    <option value="TODOS">Todas as Modalidades</option>
                    <option value="FLEX">Apenas Flex</option>
                    <option value="AGENCIA">Apenas Agência</option>
                    <option value="CORREIOS">Apenas Correios</option>
                  </select>
                </div>
              </div>

              {/* KPIs Compactos */}
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

            {/* ======================================================== */}
            {/* FOLHA DE IMPRESSÃO EM PAISAGEM (LAYOUT IDÊNTICO AO EXCEL) */}
            {/* ======================================================== */}
            <div className="folha-plp-excel bg-white text-slate-900 p-6 rounded-2xl shadow-2xl border border-slate-300 print:shadow-none print:border-none print:p-0">
              
              {/* FAÍXA 1: TÍTULO SUPERIOR */}
              <div className="excel-barra-1 bg-[#1F3864] text-white text-center font-bold text-sm tracking-wider py-1.5 uppercase rounded-t-lg print:rounded-none">
                PLP DE ENVIOS
              </div>

              {/* FAÍXA 2: SUBTÍTULO */}
              <div className="excel-barra-2 bg-[#2E5FA3] text-white text-center font-semibold text-xs py-1">
                Controle de Expedição — Autorização de Envio
              </div>

              {/* LINHA DE METADADOS: DATA, ANALISTA E MÉTODO */}
              <div className="grid grid-cols-6 text-[11px] border-b border-x border-[#B0C4DE] leading-tight">
                <div className="excel-meta-label bg-[#D6E4F7] text-[#1F3864] font-bold p-1.5 border-r border-[#B0C4DE] col-span-1">
                  Data de Envio:
                </div>
                <div className="p-1.5 border-r border-[#B0C4DE] font-mono font-bold col-span-2 text-slate-800">
                  {filtroDataInicio === filtroDataFim ? filtroDataInicio : `${filtroDataInicio} até ${filtroDataFim}`}
                </div>
                <div className="excel-meta-label bg-[#D6E4F7] text-[#1F3864] font-bold p-1.5 border-r border-[#B0C4DE] col-span-1">
                  Analista:
                </div>
                <div className="p-1.5 col-span-2 font-bold text-slate-800">
                  {nomeAnalista}
                </div>

                <div className="excel-meta-label bg-[#D6E4F7] text-[#1F3864] font-bold p-1.5 border-r border-[#B0C4DE] border-t col-span-1">
                  Método de Envio:
                </div>
                <div className="p-1.5 border-r border-[#B0C4DE] border-t font-bold col-span-2 text-[#1F3864]">
                  {formatarMetodoEnvioTexto()}
                </div>
                <div className="excel-meta-label bg-[#D6E4F7] text-[#1F3864] font-bold p-1.5 border-r border-[#B0C4DE] border-t col-span-1">
                  Canal Filtrado:
                </div>
                <div className="p-1.5 border-t col-span-2 font-bold text-slate-800">
                  {filtroCanal}
                </div>
              </div>

              {/* TABELA DE PEDIDOS DISTRIBUÍDA EM 4 COLUNAS PARALELAS LADO A LADO */}
              <div className="border-x border-b border-[#B0C4DE] overflow-hidden">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="excel-th bg-[#1F3864] text-white font-bold text-[10px] uppercase">
                      {/* Coluna 1 */}
                      <th className="p-1 text-center w-8 border-r border-slate-400">N#</th>
                      <th className="p-1 border-r border-slate-400">Número do Pedido</th>
                      <th className="p-1 text-center border-r-2 border-slate-700 w-20">Canal / Mod.</th>

                      {/* Coluna 2 */}
                      <th className="p-1 text-center w-8 border-r border-slate-400">N#</th>
                      <th className="p-1 border-r border-slate-400">Número do Pedido</th>
                      <th className="p-1 text-center border-r-2 border-slate-700 w-20">Canal / Mod.</th>

                      {/* Coluna 3 */}
                      <th className="p-1 text-center w-8 border-r border-slate-400">N#</th>
                      <th className="p-1 border-r border-slate-400">Número do Pedido</th>
                      <th className="p-1 text-center border-r-2 border-slate-700 w-20">Canal / Mod.</th>

                      {/* Coluna 4 */}
                      <th className="p-1 text-center w-8 border-r border-slate-400">N#</th>
                      <th className="p-1 border-r border-slate-400">Número do Pedido</th>
                      <th className="p-1 text-center w-20">Canal / Mod.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeColunas.map((linha, rIdx) => {
                      const isZebra = rIdx % 2 === 1;
                      return (
                        <tr
                          key={rIdx}
                          className={`h-6 border-b border-[#D0DDF0] ${
                            isZebra ? "excel-row-zebra bg-[#F5F8FC]" : "bg-white"
                          }`}
                        >
                          {linha.map((celula, cIdx) => {
                            const isLastCol = cIdx === 3;
                            if (!celula) {
                              return (
                                <React.Fragment key={cIdx}>
                                  <td className="p-0.5 text-center text-slate-300 border-r border-[#D0DDF0]">-</td>
                                  <td className="p-0.5 border-r border-[#D0DDF0]"></td>
                                  <td className={`p-0.5 ${!isLastCol ? "border-r-2 border-slate-400" : ""}`}></td>
                                </React.Fragment>
                              );
                            }

                            return (
                              <React.Fragment key={cIdx}>
                                <td className="p-0.5 text-center font-mono font-bold text-slate-500 border-r border-[#D0DDF0]">
                                  {celula.numGlobal}
                                </td>
                                <td className="p-0.5 font-mono font-bold text-slate-900 border-r border-[#D0DDF0] truncate max-w-[140px]" title={celula.numero_pedido}>
                                  {celula.numero_pedido}
                                </td>
                                <td className={`p-0.5 text-center text-[9px] ${!isLastCol ? "border-r-2 border-slate-400" : ""}`}>
                                  <span className="font-semibold text-slate-700 truncate block">
                                    {celula.canal.replace("Mercado Livre", "ML")}
                                  </span>
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {pedidos.length === 0 && (
                      <tr>
                        <td colSpan={12} className="p-6 text-center text-slate-500 italic">
                          Nenhum pedido registrado no filtro selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* TOTAL DE PEDIDOS */}
              <div className="grid grid-cols-6 border-x border-b border-[#B0C4DE] text-[11px] font-bold">
                <div className="excel-meta-label bg-[#D6E4F7] text-[#1F3864] p-1.5 col-span-3 text-right pr-4 uppercase">
                  Total de Pedidos:
                </div>
                <div className="excel-meta-label bg-[#D6E4F7] text-[#1F3864] p-1.5 col-span-3 font-mono text-base font-black pl-4">
                  {kpis.total} volumes
                </div>
              </div>

              {/* BLOCO DE ASSINATURAS IDÊNTICO AO EXCEL (EM 3 COLUNAS) */}
              <div className="grid grid-cols-3 border-x border-b border-[#B0C4DE] text-[11px] mt-2">
                <div className="excel-rodape-bloco bg-[#2E5FA3] text-white text-center font-bold py-1 border-r border-[#B0C4DE]">
                  Analista
                </div>
                <div className="excel-rodape-bloco bg-[#2E5FA3] text-white text-center font-bold py-1 border-r border-[#B0C4DE]">
                  Responsável pelo Estoque
                </div>
                <div className="excel-rodape-bloco bg-[#2E5FA3] text-white text-center font-bold py-1">
                  Responsável pelo Envio
                </div>

                <div className="excel-assinatura-campo bg-[#F0F4FA] p-2 border-r border-[#B0C4DE] space-y-3">
                  <div>Nome: <strong className="text-black font-semibold">{nomeAnalista}</strong></div>
                  <div>Assinatura: _________________________</div>
                </div>
                <div className="excel-assinatura-campo bg-[#F0F4FA] p-2 border-r border-[#B0C4DE] space-y-3">
                  <div>Nome: ___________________________</div>
                  <div>Assinatura: _________________________</div>
                </div>
                <div className="excel-assinatura-campo bg-[#F0F4FA] p-2 space-y-3">
                  <div>Nome: ___________________________</div>
                  <div>Assinatura: _________________________</div>
                </div>
              </div>

              {/* NOTA DE CONTROLE INTERNO */}
              <div className="text-[10px] text-slate-400 text-center pt-2">
                Documento para controle interno — PLP de Envios
              </div>
            </div>

            {/* TABELA DETALHADA COM AÇÕES (APENAS EM TELA) */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 print:hidden">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Auditoria Individual de Pedidos ({pedidos.length})
              </h3>
              <div className="overflow-x-auto max-h-[350px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5 text-center">#</th>
                      <th className="p-2.5">Data</th>
                      <th className="p-2.5">N.º do Pedido</th>
                      <th className="p-2.5">Canal</th>
                      <th className="p-2.5 text-center">Modalidade</th>
                      <th className="p-2.5 text-right text-amber-300">Frete (Coluna D)</th>
                      <th className="p-2.5 text-center">Excluir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {pedidos.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-2.5 font-mono text-slate-300">{item.data_envio}</td>
                        <td className="p-2.5 font-mono font-bold text-white">{item.numero_pedido}</td>
                        <td className="p-2.5 text-slate-300 font-semibold">{item.canal}</td>
                        <td className="p-2.5 text-center">
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
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-400">
                          {item.modalidade === "FLEX" ? formatarMoeda(item.valor_frete) : "R$ 0,00"}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => handleExcluirPedido(item.id)}
                            className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer font-bold"
                            title="Remover"
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

        {/* ======================================================== */}
        {/* MODAL CONFIGURAÇÃO TAXAS FLEX (APENAS QUANDO ABERTO)    */}
        {/* ======================================================== */}
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