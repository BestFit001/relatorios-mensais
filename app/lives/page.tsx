"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import * as XLSX from "xlsx";

function colunaParaIndice(letra: string): number {
  let l = letra.trim().toUpperCase();
  let num = 0;
  for (let i = 0; i < l.length; i++) {
    num = num * 26 + (l.charCodeAt(i) - 64);
  }
  return num - 1;
}

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "");
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  if (/e\+/i.test(s)) {
    try { s = BigInt(Math.trunc(Number(s))).toString(); } catch {}
  }
  return s.toLowerCase();
}

function parseNumeroBruto(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function formatarDataCurta(dataStr: any): string {
  if (!dataStr) return "";
  const s = String(dataStr).trim();
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("pt-BR");
    }
  } catch {}
  return s.split(" ")[0];
}

const formatarMoeda = (valor: number) =>
  "R$ " + (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RelatorioLivesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [subAba, setSubAba] = useState<"dados" | "config">("dados");
  const [modoPainel, setModoPainel] = useState<"detalhado" | "compacto">("detalhado");

  // Configurações
  const [linhaInicial, setLinhaInicial] = useState("3");
  const [colunaSku, setColunaSku] = useState("H");
  const [colunaStatus, setColunaStatus] = useState("C");
  const [colunaRepasse, setColunaRepasse] = useState("X");
  const [colunaPdv, setColunaPdv] = useState("N");
  const [colunaData, setColunaData] = useState("AD");
  const [percentualImposto, setPercentualImposto] = useState("9");
  const [percentualComissao, setPercentualComissao] = useState("14");

  // Dados
  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;

  // Filtros
  const [buscaSku, setBuscaSku] = useState("");
  const [filtroMes, setFiltroMes] = useState(""); // Formato AAAA-MM
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const statusPermitidos = ["aguardando envio", "em trânsito", "concluído", "entregue", "enviado", "a ser enviado", "paid", "completed"];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarTudoDoSupabase();
  }, []);

  const carregarTudoDoSupabase = async () => {
    setLoading(true);
    try {
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

      const cMap = new Map();
      allCustos.forEach((c: any) => {
        const k = normalizarSku(c.sku);
        if (k) cMap.set(k, c);
      });
      setCustosMap(cMap);

      const { data: configData } = await supabase.from("config_regras_tiny").select("*").eq("canal", "live_config");
      if (configData && configData.length > 0) {
        configData.forEach((cfg: any) => {
          if (cfg.campo === "linha_inicial") setLinhaInicial(cfg.coluna);
          if (cfg.campo === "col_sku") setColunaSku(cfg.coluna);
          if (cfg.campo === "col_status") setColunaStatus(cfg.coluna);
          if (cfg.campo === "col_repasse") setColunaRepasse(cfg.coluna);
          if (cfg.campo === "col_pdv") setColunaPdv(cfg.coluna);
          if (cfg.campo === "col_data") setColunaData(cfg.coluna);
          if (cfg.campo === "imposto") setPercentualImposto(cfg.coluna);
          if (cfg.campo === "comissao") setPercentualComissao(cfg.coluna);
        });
      }

      let allVendas: any[] = [];
      let vFrom = 0;
      let vKeep = true;
      while (vKeep) {
        const { data } = await supabase.from("vendas_lives").select("*").range(vFrom, vFrom + step - 1);
        if (data && data.length > 0) {
          allVendas = [...allVendas, ...data];
          vFrom += step;
          if (data.length < step) vKeep = false;
        } else vKeep = false;
      }

      if (allVendas.length > 0) {
        setDadosBrutos(allVendas.map(v => ({
          sku: v.sku,
          status: v.status,
          repasse: v.repasse,
          pdv: v.pdv,
          data: v.data_venda,
          productName: v.nome_produto
        })));
      }
    } catch (e) {
      console.error("Erro ao carregar do Supabase:", e);
    }
    setLoading(false);
  };

  const salvarConfiguracoes = async () => {
    try {
      const configs = [
        { canal: "live_config", campo: "linha_inicial", coluna: linhaInicial },
        { canal: "live_config", campo: "col_sku", coluna: colunaSku },
        { canal: "live_config", campo: "col_status", coluna: colunaStatus },
        { canal: "live_config", campo: "col_repasse", coluna: colunaRepasse },
        { canal: "live_config", campo: "col_pdv", coluna: colunaPdv },
        { canal: "live_config", campo: "col_data", coluna: colunaData },
        { canal: "live_config", campo: "imposto", coluna: percentualImposto },
        { canal: "live_config", campo: "comissao", coluna: percentualComissao },
      ];

      for (const c of configs) {
        await supabase.from("config_regras_tiny").upsert(c, { onConflict: "canal,campo" });
      }

      alert("✅ Configurações salvas no Supabase com sucesso!");
      setSubAba("dados");
    } catch (err: any) {
      alert("Erro ao salvar configurações: " + err.message);
    }
  };

  const limparBaseSupabase = async () => {
    if (!confirm("⚠️ Tem certeza absoluta que deseja limpar/zerar toda a base de Vendas de Lives gravada no Supabase?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("vendas_lives").delete().neq("id", 0);
      if (error) throw error;
      setDadosBrutos([]);
      setPaginaAtual(1);
      alert("✅ Base de Vendas de Lives limpa com sucesso!");
    } catch (err: any) {
      alert("Erro ao limpar base: " + err.message);
    }
    setLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

        const startRow = Math.max(0, parseInt(linhaInicial) - 1);
        const idxSku = colunaParaIndice(colunaSku);
        const idxStatus = colunaParaIndice(colunaStatus);
        const idxRepasse = colunaParaIndice(colunaRepasse);
        const idxPdv = colunaParaIndice(colunaPdv);
        const idxData = colunaParaIndice(colunaData);
        const idxNomeProd = colunaParaIndice("I");

        const novasLinhas = [];
        for (let i = startRow; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0) continue;

          novasLinhas.push({
            sku: String(row[idxSku] || "").trim(),
            status: String(row[idxStatus] || "").trim(),
            repasse: parseNumeroBruto(row[idxRepasse]),
            pdv: parseNumeroBruto(row[idxPdv]),
            data: String(row[idxData] || "").trim(),
            productName: String(row[idxNomeProd] || "Produto Live").trim(),
          });
        }

        await supabase.from("vendas_lives").delete().neq("id", 0);

        const registrosParaSalvar = novasLinhas.map(row => {
          const skuNorm = normalizarSku(row.sku);
          const custoObj = custosMap.get(skuNorm);
          const custoUnit = custoObj ? parseNumeroBruto(custoObj.custo_unitario ?? custoObj.custo ?? 0) : 0;
          const nomeProd = custoObj ? (custoObj.produto || custoObj.descricao || row.productName) : row.productName;
          
          const impVal = row.repasse * (parseFloat(percentualImposto) / 100 || 0);
          const comVal = row.repasse * (parseFloat(percentualComissao) / 100 || 0);
          const liq = row.repasse - custoUnit - impVal - comVal;
          const vPdv = row.pdv > 0 ? row.pdv : row.repasse;
          const pctPdv = vPdv > 0 ? (liq / vPdv) * 100 : 0;

          return {
            sku: row.sku,
            nome_produto: nomeProd,
            repasse: row.repasse,
            pdv: vPdv,
            custo: custoUnit,
            imposto: impVal,
            comissao_vendedora: comVal,
            liquidez: liq,
            percentual_lucro_pdv: pctPdv,
            data_venda: formatarDataCurta(row.data),
            status: row.status
          };
        });

        for (let i = 0; i < registrosParaSalvar.length; i += 500) {
          const lote = registrosParaSalvar.slice(i, i + 500);
          await supabase.from("vendas_lives").insert(lote);
        }

        setDadosBrutos(novasLinhas);
        setPaginaAtual(1);
        alert(`✅ Sucesso! ${novasLinhas.length} registos lidos e salvos no Supabase.`);
      } catch (err: any) {
        alert("Erro ao processar e salvar planilha: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const dadosProcessados = dadosBrutos.map((row) => {
    const skuRaw = row.sku;
    const skuNorm = normalizarSku(skuRaw);
    const repasse = parseNumeroBruto(row.repasse);
    const pdv = parseNumeroBruto(row.pdv);
    const dataPagamento = row.data;
    const statusVenda = String(row.status || "").trim().toLowerCase();

    const custoObj = custosMap.get(skuNorm);
    const custoUnitario = custoObj ? parseNumeroBruto(custoObj.custo_unitario ?? custoObj.custo ?? 0) : 0;
    const nomeProduto = custoObj ? (custoObj.produto || custoObj.descricao || "Produto Cadastrado") : (row.productName || "Produto Desconhecido");

    const impostoVal = repasse * (parseFloat(percentualImposto) / 100 || 0);
    const comissaoVendedoraVal = repasse * (parseFloat(percentualComissao) / 100 || 0);
    const liquidez = repasse - custoUnitario - impostoVal - comissaoVendedoraVal;

    const valorPdv = pdv > 0 ? pdv : repasse;
    const percentualLucroPdv = valorPdv > 0 ? (liquidez / valorPdv) * 100 : 0;

    const dataCurta = formatarDataCurta(dataPagamento);

    return {
      sku: skuRaw,
      skuNorm,
      nomeProduto,
      repasse,
      pdv: valorPdv,
      custo: custoUnitario,
      imposto: impostoVal,
      comissaoVendedora: comissaoVendedoraVal,
      liquidez,
      percentualLucroPdv,
      data: dataCurta,
      status: statusVenda,
    };
  }).filter(item => {
    if (!item.skuNorm) return false;

    const statusLimpo = item.status.replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const statusValido = statusPermitidos.some(st => statusLimpo.includes(st.toLowerCase()));
    if (!statusValido) return false;

    if (buscaSku && !item.skuNorm.includes(buscaSku.toLowerCase()) && !item.nomeProduto.toLowerCase().includes(buscaSku.toLowerCase())) {
      return false;
    }

    // Filtro por Mês (Ex: 2026-10)
    if (filtroMes && item.data) {
      // item.data está no formato DD/MM/AAAA, convertemos para testar AAAA-MM
      const partes = item.data.split("/");
      if (partes.length === 3) {
        const mesAno = `${partes[2]}-${partes[1]}`;
        if (mesAno !== filtroMes) return false;
      }
    }

    if (dataInicio && item.data && item.data < dataInicio) return false;
    if (dataFim && item.data && item.data > dataFim) return false;

    return true;
  });

  const totalRepasse = dadosProcessados.reduce((acc, cur) => acc + cur.repasse, 0);
  const totalCusto = dadosProcessados.reduce((acc, cur) => acc + cur.custo, 0);
  const totalImposto = dadosProcessados.reduce((acc, cur) => acc + cur.imposto, 0);
  const totalComissaoVendedora = dadosProcessados.reduce((acc, cur) => acc + cur.comissaoVendedora, 0);
  const totalLiquidez = dadosProcessados.reduce((acc, cur) => acc + cur.liquidez, 0);
  const mediaLucroPdvGeral = dadosProcessados.length > 0 
    ? dadosProcessados.reduce((acc, cur) => acc + cur.percentualLucroPdv, 0) / dadosProcessados.length 
    : 0;

  const compactoMap = new Map<string, { sku: string; nome: string; qtd: number; repasse: number; custo: number; comissaoVendedora: number; liquidez: number; percentualLucroPdv: number }>();
  dadosProcessados.forEach(item => {
    if (!compactoMap.has(item.skuNorm)) {
      compactoMap.set(item.skuNorm, {
        sku: item.sku,
        nome: item.nomeProduto,
        qtd: 0,
        repasse: 0,
        custo: 0,
        comissaoVendedora: 0,
        liquidez: 0,
        percentualLucroPdv: 0,
      });
    }
    const c = compactoMap.get(item.skuNorm)!;
    c.qtd += 1;
    c.repasse += item.repasse;
    c.custo += item.custo;
    c.comissaoVendedora += item.comissaoVendedora;
    c.liquidez += item.liquidez;
  });

  const dadosCompactos = Array.from(compactoMap.values()).map(item => ({
    ...item,
    percentualLucroPdv: item.repasse > 0 ? (item.liquidez / item.repasse) * 100 : 0
  })).sort((a, b) => b.qtd - a.qtd);

  const itensAtivos = modoPainel === "detalhado" ? dadosProcessados : dadosCompactos;

  const totalPaginas = Math.ceil(itensAtivos.length / itensPorPagina) || 1;
  const indexUltimoItem = paginaAtual * itensPorPagina;
  const indexPrimeiroItem = indexUltimoItem - itensPorPagina;
  const itensPaginados = itensAtivos.slice(indexPrimeiroItem, indexUltimoItem);

  return (
    <div className="min-h-screen bg-[#07090e] p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Relatório de Vendas via LIVES</h1>
            <p className="text-sm font-medium text-slate-400">Supabase, comissão vendedora, filtro por mês e painel unificado</p>
          </div>
          <Navbar />
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4 bg-slate-900/90 p-3 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex gap-3">
            <button
              onClick={() => setSubAba("dados")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
                subAba === "dados" ? "bg-indigo-600 text-white shadow-indigo-950/50" : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              📊 Relatório & Vendas
            </button>
            <button
              onClick={() => setSubAba("config")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
                subAba === "config" ? "bg-indigo-600 text-white shadow-indigo-950/50" : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              ⚙️ Configurações Live
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-indigo-400 font-bold">Carregar Planilha (Salva automático):</label>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white cursor-pointer"
            />
          </div>
        </div>

        {subAba === "config" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800/80 shadow-xl max-w-3xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">⚙️ Configurações e Limpeza da Base</h2>
                <p className="text-xs text-slate-400 mt-1">Ajuste as colunas e gerencie os dados salvos.</p>
              </div>
              <button
                type="button"
                onClick={limparBaseSupabase}
                className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2 px-4 rounded-xl text-xs uppercase cursor-pointer transition-all shadow-md"
              >
                🗑️ Limpar Base Inteira
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-950 p-6 rounded-xl border border-slate-800/80">
              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Linha Inicial dos Dados:</label>
                <input
                  type="number"
                  value={linhaInicial}
                  onChange={(e) => setLinhaInicial(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna SKU (Letra):</label>
                <input
                  type="text"
                  value={colunaSku}
                  onChange={(e) => setColunaSku(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Status (Letra):</label>
                <input
                  type="text"
                  value={colunaStatus}
                  onChange={(e) => setColunaStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Valor de Repasse (Letra):</label>
                <input
                  type="text"
                  value={colunaRepasse}
                  onChange={(e) => setColunaRepasse(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna PDV / Preço Original (Letra):</label>
                <input
                  type="text"
                  value={colunaPdv}
                  onChange={(e) => setColunaPdv(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Data de Pagamento (Letra):</label>
                <input
                  type="text"
                  value={colunaData}
                  onChange={(e) => setColunaData(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Imposto (%):</label>
                <input
                  type="number"
                  step="0.1"
                  value={percentualImposto}
                  onChange={(e) => setPercentualImposto(e.target.value)}
                  className="w-full bg-slate-900 border border-amber-600/50 rounded-xl p-3 text-xs text-amber-300 font-bold outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Comissão Vendedora (%):</label>
                <input
                  type="number"
                  step="0.1"
                  value={percentualComissao}
                  onChange={(e) => setPercentualComissao(e.target.value)}
                  className="w-full bg-slate-900 border border-emerald-600/50 rounded-xl p-3 text-xs text-emerald-300 font-bold outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={salvarConfiguracoes}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg shadow-indigo-950/50"
              >
                Salvar Configurações no Supabase
              </button>
            </div>
          </div>
        )}

        {subAba === "dados" && (
          <div className="space-y-6">
            
            {/* CARDS DE RESUMO */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Total Repasse</span>
                <span className="text-base font-black font-mono text-white mt-1 block">{formatarMoeda(totalRepasse)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Custo Total (CMV)</span>
                <span className="text-base font-black font-mono text-rose-400 mt-1 block">- {formatarMoeda(totalCusto)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Impostos ({percentualImposto}%)</span>
                <span className="text-base font-black font-mono text-amber-400 mt-1 block">- {formatarMoeda(totalImposto)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Comissão Vendedora</span>
                <span className="text-base font-black font-mono text-indigo-400 mt-1 block">- {formatarMoeda(totalComissaoVendedora)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Liquidez Líquida</span>
                <span className="text-base font-black font-mono text-emerald-400 mt-1 block">{formatarMoeda(totalLiquidez)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">% Lucro sobre PDV</span>
                <span className="text-base font-black font-mono text-cyan-400 mt-1 block">{(mediaLucroPdvGeral).toFixed(2)}%</span>
              </div>
            </div>

            {/* FILTROS (INCLUINDO FILTRO POR MÊS) */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-xl flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pesquisar por SKU ou Nome do Produto:</label>
                <input
                  type="text"
                  value={buscaSku}
                  onChange={(e) => { setBuscaSku(e.target.value); setPaginaAtual(1); }}
                  placeholder="Ex: 22652042281 ou Garrafa..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Filtrar por Mês:</label>
                <input
                  type="month"
                  value={filtroMes}
                  onChange={(e) => { setFiltroMes(e.target.value); setPaginaAtual(1); }}
                  className="bg-slate-950 border border-indigo-900/60 rounded-xl p-2.5 text-xs text-indigo-300 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Início:</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => { setDataInicio(e.target.value); setPaginaAtual(1); }}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Fim:</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => { setDataFim(e.target.value); setPaginaAtual(1); }}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none font-mono"
                />
              </div>

              <button
                type="button"
                onClick={() => { setBuscaSku(""); setFiltroMes(""); setDataInicio(""); setDataFim(""); setPaginaAtual(1); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase cursor-pointer"
              >
                Limpar Filtros
              </button>
            </div>

            {/* PAINEL UNIFICADO COM BOTÕES DE VISUALIZAÇÃO (DETALHADO / COMPACTO) */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-xl overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex flex-wrap justify-between items-center gap-4">
                  <h3 className="text-sm font-bold text-white">📋 Painel de Faturamento de Vendas (Live)</h3>
                  
                  <div className="flex gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => { setModoPainel("detalhado"); setPaginaAtual(1); }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                        modoPainel === "detalhado" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      📑 Detalhado (Individual)
                    </button>
                    <button
                      onClick={() => { setModoPainel("compacto"); setPaginaAtual(1); }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                        modoPainel === "compacto" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      📦 Compacto (Por SKU)
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">{modoPainel === "detalhado" ? "DATA" : "QUANTIDADE"}</th>
                        <th className="p-3">SKU / PRODUTO</th>
                        <th className="p-3 text-right">REPASSE</th>
                        <th className="p-3 text-right">CUSTO</th>
                        <th className="p-3 text-right">COMISSÃO VEND.</th>
                        <th className="p-3 text-right">LIQUIDEZ (% PDV)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {modoPainel === "detalhado" && itensPaginados.map((item: any, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono text-white font-bold whitespace-nowrap">
                            {item.data}
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-indigo-400 block">{item.sku}</span>
                            <span className="text-slate-300 font-medium truncate block max-w-[280px]">{item.nomeProduto}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-white">{formatarMoeda(item.repasse)}</td>
                          <td className="p-3 text-right font-mono text-rose-400">- {formatarMoeda(item.custo)}</td>
                          <td className="p-3 text-right font-mono text-indigo-300">- {formatarMoeda(item.comissaoVendedora)}</td>
                          <td className="p-3 text-right font-mono">
                            <span className="font-bold text-emerald-400 block">{formatarMoeda(item.liquidez)}</span>
                            <span className="text-[10px] text-cyan-400 font-semibold">{item.percentualLucroPdv.toFixed(1)}% PDV</span>
                          </td>
                        </tr>
                      ))}

                      {modoPainel === "compacto" && itensPaginados.map((item: any, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono text-indigo-300 font-bold whitespace-nowrap">
                            {item.qtd} un. vendidas
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-indigo-400 block">{item.sku}</span>
                            <span className="text-slate-300 font-medium truncate block max-w-[280px]">{item.nome}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-white">{formatarMoeda(item.repasse)}</td>
                          <td className="p-3 text-right font-mono text-rose-400">- {formatarMoeda(item.custo)}</td>
                          <td className="p-3 text-right font-mono text-indigo-300">- {formatarMoeda(item.comissaoVendedora)}</td>
                          <td className="p-3 text-right font-mono">
                            <span className="font-bold text-emerald-400 block">{formatarMoeda(item.liquidez)}</span>
                            <span className="text-[10px] text-cyan-400 font-semibold">{item.percentualLucroPdv.toFixed(1)}% PDV</span>
                          </td>
                        </tr>
                      ))}

                      {itensPaginados.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500">Nenhum registo encontrado com os filtros atuais.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PAGINAÇÃO */}
              <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex justify-between items-center text-xs">
                <span className="text-slate-400">
                  Exibindo modo <strong>{modoPainel.toUpperCase()}</strong> — Página <strong>{paginaAtual}</strong> de <strong>{totalPaginas}</strong> ({itensAtivos.length} itens no total)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPaginaAtual(prev => Math.max(prev - 1, 1))}
                    disabled={paginaAtual === 1}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                  >
                    ◀ Anterior
                  </button>
                  <button
                    onClick={() => setPaginaAtual(prev => Math.min(prev + 1, totalPaginas))}
                    disabled={paginaAtual === totalPaginas}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                  >
                    Próxima ▶
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}