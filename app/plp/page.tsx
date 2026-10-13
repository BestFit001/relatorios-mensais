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

  // Lista de canais
  const [canais, setCanais] = useState<string[]>(canaisPadraoBase);
  const [taxasFlexCanal, setTaxasFlexCanal] = useState<Record<string, number>>({});
  const [modalTaxasAberto, setModalTaxasAberto] = useState(false);
  const [novoCanalNome, setNovoCanalNome] = useState("");

  // Modo de Entrada: Manual ou Planilha
  const [modoEntrada, setModoEntrada] = useState<"manual" | "planilha">("manual");

  // Dados comuns de entrada
  const [dataEnvio, setDataEnvio] = useState(new Date().toISOString().split("T")[0]);
  const [canalSelecionado, setCanalSelecionado] = useState(canaisPadraoBase[0]);
  const [modalidade, setModalidade] = useState<"FLEX" | "COLETA">("FLEX");

  // Entrada Manual
  const [pedidosTexto, setPedidosTexto] = useState("");

  // Entrada Planilha
  const [matrizPlanilha, setMatrizPlanilha] = useState<any[]>([]);
  const [colunaPedido, setColunaPedido] = useState("A");
  const [linhaInicial, setLinhaInicial] = useState("2");
  const [previewQtd, setPreviewQtd] = useState(0);

  // Filtros de Listagem
  const [filtroDataInicio, setFiltroDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [filtroDataFim, setFiltroDataFim] = useState(new Date().toISOString().split("T")[0]);
  const [filtroCanal, setFiltroCanal] = useState("TODOS");
  const [filtroModalidade, setFiltroModalidade] = useState("TODOS");
  const [pedidos, setPedidos] = useState<any[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
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
      .order("created_at", { ascending: false });

    if (filtroCanal !== "TODOS") query = query.eq("canal", filtroCanal);
    if (filtroModalidade !== "TODOS") query = query.eq("modalidade", filtroModalidade);

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

        // Pré-contagem rápida
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
      setPedidosTexto("");
      setMatrizPlanilha([]);
      setPreviewQtd(0);
      buscarPedidos();
    }
    setSalvando(false);
  };

  const handleExcluirPedido = async (id: number) => {
    if (!confirm("Remover este pedido?")) return;
    await supabase.from("plp_pedidos").delete().eq("id", id);
    buscarPedidos();
  };

  const handleLimparPeriodo = async () => {
    if (!confirm(`Remover TODOS os ${pedidos.length} pedidos filtrados?`)) return;
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
      "Valor Frete (R$)": item.modalidade === "FLEX" ? Number(item.valor_frete || 0) : 0, // COLUNA D
      Modalidade: item.modalidade,
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PLP Expedição");
    XLSX.writeFile(wb, `PLP_${filtroDataInicio}_ate_${filtroDataFim}.xlsx`);
  };

  const kpis = {
    total: pedidos.length,
    flex: pedidos.filter((p) => p.modalidade === "FLEX").length,
    coleta: pedidos.filter((p) => p.modalidade === "COLETA").length,
    custoTotalFlex: pedidos
      .filter((p) => p.modalidade === "FLEX")
      .reduce((acc, p) => acc + Number(p.valor_frete || 0), 0),
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        {/* Topo */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Expedição & PLPs</h1>
            <p className="text-sm font-medium text-slate-400">Controlo unificado de envios Flex e Coleta</p>
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

        {/* CARTÃO ÚNICO DE ENTRADA (COMPACTO) */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Origem:</span>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setModoEntrada("manual")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                    modoEntrada === "manual" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  ✍️ Digitar / Colar
                </button>
                <button
                  type="button"
                  onClick={() => setModoEntrada("planilha")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                    modoEntrada === "planilha" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  📑 Ficheiro Planilha
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Valor do frete a aplicar:{" "}
              <strong className={modalidade === "FLEX" ? "text-amber-400" : "text-slate-500"}>
                {modalidade === "FLEX" ? formatarMoeda(taxasFlexCanal[canalSelecionado] ?? 12.99) : "R$ 0,00"}
              </strong>
            </div>
          </div>

          {/* Dados Comuns */}
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
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal de Venda:</label>
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
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modalidade:</label>
              <select
                value={modalidade}
                onChange={(e) => setModalidade(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-amber-400 outline-none cursor-pointer"
              >
                <option value="FLEX">⚡ Mercado Envios Flex (Debita Frete)</option>
                <option value="COLETA">📦 Coleta / Correios (R$ 0,00)</option>
              </select>
            </div>
          </div>

          {/* Campo Específico do Modo Selecionado */}
          {modoEntrada === "manual" ? (
            <div>
              <textarea
                rows={3}
                value={pedidosTexto}
                onChange={(e) => setPedidosTexto(e.target.value)}
                placeholder="Cole os pedidos aqui (separados por linha ou vírgula)..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-white outline-none focus:border-purple-500 transition-all resize-y"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800 items-end">
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

          <div className="flex justify-end pt-1">
            <button
              onClick={handleSalvarPedidos}
              disabled={salvando}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-900/40 transition-all"
            >
              {salvando ? "A Gravar..." : modoEntrada === "manual" ? "Salvar Pedido(s)" : `Importar Planilha ${previewQtd > 0 ? `(${previewQtd})` : ""}`}
            </button>
          </div>
        </div>

        {/* LISTAGEM PRINCIPAL DE EXPEDIÇÃO */}
        <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">Listagem de Expedição</h2>
              <p className="text-xs text-slate-400">Consolidado pronto para impressão e conferência</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBaixarExcel}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-900/30 transition-all"
              >
                📥 Baixar Excel (Coluna D = Frete)
              </button>
              <button
                onClick={handleLimparPeriodo}
                disabled={pedidos.length === 0}
                className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
              >
                🗑️ Limpar Período
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Início:</label>
              <input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fim:</label>
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
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Modalidade:</label>
              <select
                value={filtroModalidade}
                onChange={(e) => setFiltroModalidade(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="TODOS">Todas</option>
                <option value="FLEX">Apenas Flex</option>
                <option value="COLETA">Apenas Coleta</option>
              </select>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
              <span className="block text-[10px] font-bold text-slate-400 uppercase">Total Pedidos</span>
              <span className="text-lg font-black text-white">{kpis.total}</span>
            </div>
            <div className="bg-slate-950 border border-amber-900/40 p-3 rounded-xl">
              <span className="block text-[10px] font-bold text-amber-400 uppercase">Flex</span>
              <span className="text-lg font-black text-amber-400">{kpis.flex}</span>
            </div>
            <div className="bg-slate-950 border border-indigo-900/40 p-3 rounded-xl">
              <span className="block text-[10px] font-bold text-indigo-400 uppercase">Coleta</span>
              <span className="text-lg font-black text-indigo-400">{kpis.coleta}</span>
            </div>
            <div className="bg-slate-950 border border-emerald-900/40 p-3 rounded-xl">
              <span className="block text-[10px] font-bold text-emerald-400 uppercase">Total Frete Flex</span>
              <span className="text-lg font-black text-emerald-400">{formatarMoeda(kpis.custoTotalFlex)}</span>
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto max-h-[500px] border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                <tr>
                  <th className="p-3 text-center">#</th>
                  <th className="p-3">Data</th>
                  <th className="p-3">N.º do Pedido</th>
                  <th className="p-3">Canal</th>
                  <th className="p-3 text-center">Modalidade</th>
                  <th className="p-3 text-right text-amber-300">Valor Frete (Coluna D)</th>
                  <th className="p-3 text-center">Remover</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                {pedidos.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="p-3 font-mono text-slate-300">{item.data_envio}</td>
                    <td className="p-3 font-mono font-bold text-white">{item.numero_pedido}</td>
                    <td className="p-3 text-slate-300 font-bold">{item.canal}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                          item.modalidade === "FLEX"
                            ? "bg-amber-900/30 text-amber-400 border-amber-800/50"
                            : "bg-indigo-900/30 text-indigo-400 border-indigo-800/50"
                        }`}
                      >
                        {item.modalidade}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                      {item.modalidade === "FLEX" ? formatarMoeda(item.valor_frete) : "R$ 0,00"}
                    </td>
                    <td className="p-3 text-center">
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
                {pedidos.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      Nenhum pedido encontrado para o período ou filtros.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      A carregar pedidos...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL CONFIGURAÇÃO TAXAS FLEX */}
        {modalTaxasAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6 md:p-8 shadow-2xl space-y-5">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                  <span>⚙️ Taxas de Frete Flex por Canal</span>
                </h3>
                <button
                  onClick={() => setModalTaxasAberto(false)}
                  className="text-slate-400 hover:text-white text-base cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Adicionar Canal */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Adicionar novo canal..."
                  value={novoCanalNome}
                  onChange={(e) => setNovoCanalNome(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none flex-1"
                />
                <button
                  type="button"
                  onClick={handleAdicionarCanal}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase cursor-pointer"
                >
                  + Adicionar
                </button>
              </div>

              {/* Lista dos Canais */}
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