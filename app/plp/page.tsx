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

  // Lista unificada com TODOS os canais
  const [canais, setCanais] = useState<string[]>(canaisPadraoBase);
  const [novoCanalNome, setNovoCanalNome] = useState("");

  // Sub-aba ativa
  const [abaAtiva, setAbaAtiva] = useState<"manual" | "planilha" | "config">("manual");

  // Configuração de Frete Flex por Canal (Salvo no LocalStorage)
  const [taxasFlexCanal, setTaxasFlexCanal] = useState<Record<string, number>>({});

  // Formulário 1: Inserção Manual
  const [manualDataEnvio, setManualDataEnvio] = useState(new Date().toISOString().split("T")[0]);
  const [manualCanal, setManualCanal] = useState(canaisPadraoBase[0]);
  const [manualModalidade, setManualModalidade] = useState<"FLEX" | "COLETA">("FLEX");
  const [manualPedidosTexto, setManualPedidosTexto] = useState("");

  // Formulário 2: Inserção via Planilha
  const [matrizPlanilha, setMatrizPlanilha] = useState<any[]>([]);
  const [planilhaDataEnvio, setPlanilhaDataEnvio] = useState(new Date().toISOString().split("T")[0]);
  const [planilhaCanal, setPlanilhaCanal] = useState(canaisPadraoBase[0]);
  const [planilhaModalidade, setPlanilhaModalidade] = useState<"FLEX" | "COLETA">("FLEX");
  const [colunaPedido, setColunaPedido] = useState("A");
  const [linhaInicial, setLinhaInicial] = useState("2");
  const [previewPlanilha, setPreviewPlanilha] = useState<string[]>([]);

  // Filtros de Consulta e Exportação
  const [filtroDataInicio, setFiltroDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [filtroDataFim, setFiltroDataFim] = useState(new Date().toISOString().split("T")[0]);
  const [filtroCanal, setFiltroCanal] = useState("TODOS");
  const [filtroModalidade, setFiltroModalidade] = useState("TODOS");
  const [pedidosFiltrados, setPedidosFiltrados] = useState<any[]>([]);

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

  // Carrega e consolida absolutamente TODOS os canais
  const carregarCanaisETaxas = async () => {
    const mapaUnico = new Map<string, string>();
    
    // 1. Canais padrão da operação
    canaisPadraoBase.forEach(c => mapaUnico.set(c.trim().toLowerCase(), c.trim()));

    // 2. Todos os canais de config_regras_canais (sem nenhum filtro de ads)
    const { data: canaisData } = await supabase.from("config_regras_canais").select("canal");
    if (canaisData) {
      canaisData.forEach((c: any) => {
        if (c.canal && String(c.canal).trim()) {
          mapaUnico.set(String(c.canal).trim().toLowerCase(), String(c.canal).trim());
        }
      });
    }

    // 3. Canais de tarifação
    const { data: tarifacaoData } = await supabase.from("config_regras_tarifacao").select("canal");
    if (tarifacaoData) {
      tarifacaoData.forEach((t: any) => {
        if (t.canal && String(t.canal).trim()) {
          mapaUnico.set(String(t.canal).trim().toLowerCase(), String(t.canal).trim());
        }
      });
    }

    // 4. Canais que já tenham pedidos gravados em PLP
    const { data: plpData } = await supabase.from("plp_pedidos").select("canal");
    if (plpData) {
      plpData.forEach((p: any) => {
        if (p.canal && String(p.canal).trim()) {
          mapaUnico.set(String(p.canal).trim().toLowerCase(), String(p.canal).trim());
        }
      });
    }

    const listaCompleta = Array.from(mapaUnico.values()).sort((a, b) => a.localeCompare(b));
    setCanais(listaCompleta);

    if (listaCompleta.length > 0) {
      setManualCanal(listaCompleta[0]);
      setPlanilhaCanal(listaCompleta[0]);
    }

    // Carrega ou inicializa taxas de frete Flex para todos os canais
    const salvo = localStorage.getItem("plp_taxas_flex_por_canal");
    const taxasAtuais: Record<string, number> = salvo ? JSON.parse(salvo) : {};

    listaCompleta.forEach((c) => {
      if (taxasAtuais[c] === undefined) {
        taxasAtuais[c] = 12.99;
      }
    });

    setTaxasFlexCanal(taxasAtuais);
    localStorage.setItem("plp_taxas_flex_por_canal", JSON.stringify(taxasAtuais));
  };

  const atualizarTaxaFlex = (canal: string, valor: number) => {
    const novo = { ...taxasFlexCanal, [canal]: valor };
    setTaxasFlexCanal(novo);
    localStorage.setItem("plp_taxas_flex_por_canal", JSON.stringify(novo));
  };

  const handleAdicionarCanal = () => {
    const nomeLimpo = novoCanalNome.trim();
    if (!nomeLimpo) return;

    if (!canais.some(c => c.toLowerCase() === nomeLimpo.toLowerCase())) {
      const novaLista = [...canais, nomeLimpo].sort((a, b) => a.localeCompare(b));
      setCanais(novaLista);
      atualizarTaxaFlex(nomeLimpo, 12.99);
      setNovoCanalNome("");
      alert(`✅ Canal "${nomeLimpo}" adicionado com sucesso!`);
    } else {
      alert("Este canal já está na lista.");
    }
  };

  // Buscar pedidos do banco
  const buscarPedidos = async () => {
    setLoading(true);
    let query = supabase
      .from("plp_pedidos")
      .select("*")
      .gte("data_envio", filtroDataInicio)
      .lte("data_envio", filtroDataFim)
      .order("created_at", { ascending: false });

    if (filtroCanal !== "TODOS") {
      query = query.eq("canal", filtroCanal);
    }
    if (filtroModalidade !== "TODOS") {
      query = query.eq("modalidade", filtroModalidade);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Erro ao buscar pedidos PLP:", error);
    } else {
      setPedidosFiltrados(data || []);
    }
    setLoading(false);
  };

  // Inserção Manual
  const handleGravarManual = async () => {
    if (!manualPedidosTexto.trim()) {
      return alert("Digite ao menos um número de pedido.");
    }

    const linhas = manualPedidosTexto
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (linhas.length === 0) return alert("Nenhum pedido válido informado.");

    setSalvando(true);
    const taxaFlexUnit = manualModalidade === "FLEX" ? Number(taxasFlexCanal[manualCanal] ?? 12.99) : 0;

    const payload = linhas.map((ped) => ({
      data_envio: manualDataEnvio,
      numero_pedido: ped,
      modalidade: manualModalidade,
      canal: manualCanal,
      valor_frete: taxaFlexUnit,
    }));

    const { error } = await supabase.from("plp_pedidos").insert(payload);
    if (error) {
      alert("Erro ao gravar pedidos: " + error.message);
    } else {
      alert(`✅ ${payload.length} pedido(s) gravado(s) com sucesso para o canal ${manualCanal}!`);
      setManualPedidosTexto("");
      buscarPedidos();
    }
    setSalvando(false);
  };

  // Inserção via Planilha
  const handleUploadPlanilha = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" });
        setMatrizPlanilha(matrix);
        setPreviewPlanilha([]);
      } catch (err: any) {
        alert("Erro ao ler ficheiro: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePreviewPlanilha = () => {
    if (matrizPlanilha.length === 0) return alert("Suba um ficheiro Excel/CSV primeiro.");
    const col = colunaPedido.trim().toUpperCase();
    const start = Math.max(0, parseInt(linhaInicial, 10) - 1 || 0);

    const extraidos: string[] = [];
    for (let r = start; r < matrizPlanilha.length; r++) {
      const row = matrizPlanilha[r];
      if (!row) continue;
      const valor = String(row[col] || "").trim();
      if (valor && valor.toLowerCase() !== "pedido" && valor.toLowerCase() !== "n.º de venda") {
        extraidos.push(valor);
      }
    }

    if (extraidos.length === 0) {
      return alert(`Nenhum pedido encontrado na coluna ${col} a partir da linha ${linhaInicial}.`);
    }

    setPreviewPlanilha(extraidos);
  };

  const handleGravarPlanilha = async () => {
    if (previewPlanilha.length === 0) return alert("Clique em Pré-visualizar antes de gravar.");
    setSalvando(true);

    const taxaFlexUnit = planilhaModalidade === "FLEX" ? Number(taxasFlexCanal[planilhaCanal] ?? 12.99) : 0;

    const payload = previewPlanilha.map((ped) => ({
      data_envio: planilhaDataEnvio,
      numero_pedido: ped,
      modalidade: planilhaModalidade,
      canal: planilhaCanal,
      valor_frete: taxaFlexUnit,
    }));

    const { error } = await supabase.from("plp_pedidos").insert(payload);
    if (error) {
      alert("Erro ao gravar pedidos da planilha: " + error.message);
    } else {
      alert(`✅ ${payload.length} pedido(s) importado(s) com sucesso para ${planilhaCanal}!`);
      setPreviewPlanilha([]);
      setMatrizPlanilha([]);
      buscarPedidos();
    }
    setSalvando(false);
  };

  const handleExcluirPedido = async (id: number) => {
    if (!confirm("Deseja remover este pedido?")) return;
    const { error } = await supabase.from("plp_pedidos").delete().eq("id", id);
    if (error) alert("Erro ao excluir: " + error.message);
    else buscarPedidos();
  };

  const handleLimparPeriodo = async () => {
    if (
      !confirm(
        `ATENÇÃO: Deseja apagar TODOS os ${pedidosFiltrados.length} pedidos listados entre ${filtroDataInicio} e ${filtroDataFim}?`
      )
    )
      return;

    const idsParaExcluir = pedidosFiltrados.map((p) => p.id);
    if (idsParaExcluir.length === 0) return;

    setLoading(true);
    const { error } = await supabase.from("plp_pedidos").delete().in("id", idsParaExcluir);
    if (error) alert("Erro ao limpar período: " + error.message);
    else {
      alert("🗑️ Pedidos excluídos com sucesso!");
      buscarPedidos();
    }
    setLoading(false);
  };

  // Exportação com Frete estritamente na Coluna D
  const handleBaixarExcel = () => {
    if (pedidosFiltrados.length === 0) {
      return alert("Nenhum pedido encontrado no período filtrado para exportar.");
    }

    const dadosExportacao = pedidosFiltrados.map((item) => ({
      "Data de Envio": item.data_envio,
      "Número do Pedido": item.numero_pedido,
      Canal: item.canal,
      "Valor Frete (R$)": item.modalidade === "FLEX" ? Number(item.valor_frete || 0) : 0, // COLUNA D
      Modalidade: item.modalidade,
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExportacao);

    ws["!cols"] = [
      { wch: 14 }, // A: Data
      { wch: 24 }, // B: Pedido
      { wch: 20 }, // C: Canal
      { wch: 18 }, // D: Valor Frete
      { wch: 14 }, // E: Modalidade
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PLP Expedição");

    const nomeArquivo = `PLP_${filtroDataInicio}_ate_${filtroDataFim}_${filtroModalidade}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  };

  const kpis = {
    total: pedidosFiltrados.length,
    flex: pedidosFiltrados.filter((p) => p.modalidade === "FLEX").length,
    coleta: pedidosFiltrados.filter((p) => p.modalidade === "COLETA").length,
    custoTotalFlex: pedidosFiltrados
      .filter((p) => p.modalidade === "FLEX")
      .reduce((acc, p) => acc + Number(p.valor_frete || 0), 0),
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">PLP e Gestão de Expedição</h1>
            <p className="text-sm font-medium text-slate-400">
              Controle de pedidos Flex e Coleta com apuração de fretes por canal
            </p>
          </div>
          <Navbar />
        </div>

        {/* Abas Superiores de Inserção */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setAbaAtiva("manual")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "manual" ? "bg-purple-600 text-white shadow-purple-900/40" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            ✍️ 1. Inserir Manualmente
          </button>
          <button
            onClick={() => setAbaAtiva("planilha")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "planilha" ? "bg-indigo-600 text-white shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            📑 2. Inserir via Planilha
          </button>
          <button
            onClick={() => setAbaAtiva("config")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "config" ? "bg-amber-600 text-white shadow-amber-900/40" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            ⚙️ 3. Taxas de Frete Flex ({canais.length} Canais)
          </button>
        </div>

        {/* ================= ABA 1: INSERÇÃO MANUAL ================= */}
        {abaAtiva === "manual" && (
          <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5 animate-in fade-in duration-300">
            <h2 className="text-base font-bold text-purple-400 flex items-center gap-2">
              <span>✍️ Registro Manual de Pedidos</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Data de Envio:</label>
                <input
                  type="date"
                  value={manualDataEnvio}
                  onChange={(e) => setManualDataEnvio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-white outline-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Canal de Venda ({canais.length} disponíveis):
                </label>
                <select
                  value={manualCanal}
                  onChange={(e) => setManualCanal(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer"
                >
                  {canais.map((c, i) => (
                    <option key={i} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Modalidade:</label>
                <select
                  value={manualModalidade}
                  onChange={(e) => setManualModalidade(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-amber-400 outline-none cursor-pointer"
                >
                  <option value="FLEX">⚡ Mercado Envios Flex (Com Frete)</option>
                  <option value="COLETA">📦 Coleta / Correios (R$ 0,00)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Número(s) do(s) Pedido(s):
                </label>
                <span className="text-[10px] text-slate-500">Cole múltiplos pedidos (um por linha ou separados por vírgula)</span>
              </div>
              <textarea
                rows={4}
                value={manualPedidosTexto}
                onChange={(e) => setManualPedidosTexto(e.target.value)}
                placeholder="Exemplo:&#10;2000018949435054&#10;2000018941773046&#10;2000018941467386"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-white outline-none focus:border-purple-500 transition-all resize-y"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="text-xs text-slate-400">
                Valor do frete que será aplicado:{" "}
                <strong className={manualModalidade === "FLEX" ? "text-amber-400" : "text-slate-400"}>
                  {manualModalidade === "FLEX" ? formatarMoeda(taxasFlexCanal[manualCanal] ?? 12.99) : "R$ 0,00"}
                </strong>
              </div>
              <button
                onClick={handleGravarManual}
                disabled={salvando}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-900/40 transition-all"
              >
                {salvando ? "A Gravar..." : "Salvar Pedido(s)"}
              </button>
            </div>
          </div>
        )}

        {/* ================= ABA 2: INSERÇÃO VIA PLANILHA ================= */}
        {abaAtiva === "planilha" && (
          <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5 animate-in fade-in duration-300">
            <h2 className="text-base font-bold text-indigo-400 flex items-center gap-2">
              <span>📑 Importação em Lote via Planilha</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ficheiro (Excel / CSV):</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleUploadPlanilha}
                  className="w-full bg-slate-950 border border-slate-700 file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-bold file:py-2.5 file:px-4 file:rounded-lg file:mr-4 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Data de Envio:</label>
                <input
                  type="date"
                  value={planilhaDataEnvio}
                  onChange={(e) => setPlanilhaDataEnvio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-white outline-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Canal:</label>
                <select
                  value={planilhaCanal}
                  onChange={(e) => setPlanilhaCanal(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer"
                >
                  {canais.map((c, i) => (
                    <option key={i} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                  Coluna com N.º do Pedido:
                </label>
                <input
                  type="text"
                  value={colunaPedido}
                  onChange={(e) => setColunaPedido(e.target.value.toUpperCase())}
                  placeholder="A"
                  className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Linha Inicial dos Dados:
                </label>
                <input
                  type="number"
                  value={linhaInicial}
                  onChange={(e) => setLinhaInicial(e.target.value)}
                  placeholder="2"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Modalidade do Arquivo:
                </label>
                <select
                  value={planilhaModalidade}
                  onChange={(e) => setPlanilhaModalidade(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-bold text-amber-400 outline-none cursor-pointer"
                >
                  <option value="FLEX">⚡ Mercado Envios Flex (Com Frete)</option>
                  <option value="COLETA">📦 Coleta / Correios (R$ 0,00)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handlePreviewPlanilha}
                disabled={matrizPlanilha.length === 0}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                1. Ler e Pré-visualizar
              </button>
              {previewPlanilha.length > 0 && (
                <button
                  onClick={handleGravarPlanilha}
                  disabled={salvando}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-indigo-900/40"
                >
                  {salvando ? "A Gravar..." : `2. Importar ${previewPlanilha.length} Pedidos`}
                </button>
              )}
            </div>

            {previewPlanilha.length > 0 && (
              <div className="overflow-x-auto max-h-[300px] border border-slate-800 rounded-xl bg-slate-950/40 p-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Pré-visualização ({previewPlanilha.length} encontrados):
                </span>
                <div className="flex flex-wrap gap-2">
                  {previewPlanilha.slice(0, 40).map((ped, idx) => (
                    <span key={idx} className="bg-slate-900 border border-slate-700 text-white px-2.5 py-1 rounded text-xs font-mono">
                      {ped}
                    </span>
                  ))}
                  {previewPlanilha.length > 40 && (
                    <span className="text-slate-500 text-xs self-center italic">
                      + {previewPlanilha.length - 40} pedidos adicionais...
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= ABA 3: CONFIGURAÇÃO DE FRETE FLEX ================= */}
        {abaAtiva === "config" && (
          <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-5 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-amber-400 flex items-center gap-2">
                  <span>⚙️ Configuração de Valor de Frete Flex por Canal</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Defina o valor do frete atribuído na <strong>Coluna D</strong> para envios <strong>FLEX</strong>. Pedidos em <strong>COLETA</strong> saem automaticamente como <strong>R$ 0,00</strong>.
                </p>
              </div>

              {/* Adicionar Canal Personalizado */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome de novo canal..."
                  value={novoCanalNome}
                  onChange={(e) => setNovoCanalNome(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none w-48"
                />
                <button
                  type="button"
                  onClick={handleAdicionarCanal}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm"
                >
                  + Adicionar Canal
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {canais.map((c, i) => (
                <div key={i} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">{c}</span>
                    <span className="text-[10px] text-slate-500 uppercase">Valor Frete Flex</span>
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={taxasFlexCanal[c] ?? 12.99}
                      onChange={(e) => atualizarTaxaFlex(c, parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-amber-600/50 rounded-lg p-2 text-xs font-mono text-center text-amber-300 font-bold outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= SEÇÃO DE CONSULTA, KPIS E EXPORTAÇÃO ================= */}
        <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <h2 className="text-base font-bold text-white">Relatório de Expedição e PLPs</h2>
              <p className="text-xs text-slate-400">Filtre por datas, audite os envios e baixe a planilha pronta</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleBaixarExcel}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2"
              >
                <span>📥 Baixar Excel (Coluna D = Frete)</span>
              </button>
              <button
                onClick={handleLimparPeriodo}
                disabled={pedidosFiltrados.length === 0}
                className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
              >
                🗑️ Limpar Período
              </button>
            </div>
          </div>

          {/* Filtros de Data e Canal */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Data Início:</label>
              <input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-white outline-none cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Data Fim:</label>
              <input
                type="date"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-white outline-none cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Filtrar Canal ({canais.length}):
              </label>
              <select
                value={filtroCanal}
                onChange={(e) => setFiltroCanal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="TODOS">Todos os Canais</option>
                {canais.map((c, i) => (
                  <option key={i} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filtrar Modalidade:</label>
              <select
                value={filtroModalidade}
                onChange={(e) => setFiltroModalidade(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="TODOS">Todas</option>
                <option value="FLEX">Apenas Flex</option>
                <option value="COLETA">Apenas Coleta</option>
              </select>
            </div>
          </div>

          {/* Cards de KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total de Pedidos</span>
              <span className="text-xl font-black text-white">{kpis.total} pedidos</span>
            </div>
            <div className="bg-slate-950 border border-amber-900/40 p-4 rounded-xl">
              <span className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Pedidos FLEX</span>
              <span className="text-xl font-black text-amber-400">{kpis.flex} envios</span>
            </div>
            <div className="bg-slate-950 border border-indigo-900/40 p-4 rounded-xl">
              <span className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Pedidos COLETA</span>
              <span className="text-xl font-black text-indigo-400">{kpis.coleta} envios</span>
            </div>
            <div className="bg-slate-950 border border-emerald-900/40 p-4 rounded-xl">
              <span className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Total Frete Flex (R$)</span>
              <span className="text-xl font-black text-emerald-400">{formatarMoeda(kpis.custoTotalFlex)}</span>
            </div>
          </div>

          {/* Tabela de Pedidos */}
          <div className="overflow-x-auto max-h-[500px] border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                <tr>
                  <th className="p-3 text-center">#</th>
                  <th className="p-3">Data de Envio</th>
                  <th className="p-3">N.º do Pedido</th>
                  <th className="p-3">Canal</th>
                  <th className="p-3 text-center">Modalidade</th>
                  <th className="p-3 text-right text-amber-300">Valor Frete (Coluna D)</th>
                  <th className="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                {pedidosFiltrados.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="p-3 font-mono text-slate-300">{item.data_envio}</td>
                    <td className="p-3 font-mono font-bold text-white">{item.numero_pedido}</td>
                    <td className="p-3 text-slate-300 font-bold">{item.canal}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
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
                        title="Remover pedido"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {pedidosFiltrados.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      Nenhum pedido encontrado para o período ou filtros selecionados.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      Carregando pedidos...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}