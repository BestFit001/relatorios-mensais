"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import * as XLSX from "xlsx";
import { letrasDaFormula, avaliarFormulaLive } from "@/lib/formulaLive";
import { detectarOrdemData, interpretarDataHora, dataIsoParaBr, type ItemAnalise } from "@/lib/analiseLives";
import AnaliseDesempenho from "./AnaliseDesempenho";
import { colunaParaIndice, normalizarSkuLive as normalizarSku, parseNumeroBruto, formatarDataCurta, PADRAO_COL_MODAL, PADRAO_COL_VENDEDOR, PADRAO_TEXTO_LIVE } from "@/lib/livesVendas";

function parseDataParaTimestamp(dataStr: any): number | null {
  if (!dataStr) return null;
  const s = String(dataStr).trim().split(" ")[0];

  if (s.includes("/")) {
    const partes = s.split("/");
    if (partes.length === 3) {
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1;
      let ano = parseInt(partes[2], 10);
      if (ano < 100) ano += 2000;
      const d = new Date(ano, mes, dia);
      return isNaN(d.getTime()) ? null : d.setHours(0, 0, 0, 0);
    }
  }

  if (s.includes("-")) {
    const partes = s.split("-");
    if (partes.length === 3) {
      const ano = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1;
      const dia = parseInt(partes[2], 10);
      const d = new Date(ano, mes, dia);
      return isNaN(d.getTime()) ? null : d.setHours(0, 0, 0, 0);
    }
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.setHours(0, 0, 0, 0);
}

const SEM_VENDEDOR = "__sem_vendedor__";

const formatarMoeda = (valor: number) =>
  "R$ " + (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RelatorioLivesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subAba, setSubAba] = useState<"dados" | "analise" | "config">("dados");
  const [modoPainel, setModoPainel] = useState<"detalhado" | "compacto">("detalhado");

  // Configurações
  const [colunaSku, setColunaSku] = useState("H");
  const [colunaStatus, setColunaStatus] = useState("C");
  const [colunaRepasse, setColunaRepasse] = useState("X");
  const [colunaPdv, setColunaPdv] = useState("N");
  const [colunaRebate, setColunaRebate] = useState("");   // rebate dos pedidos (subsídio do TikTok): vazio = não usa
  const [colunaData, setColunaData] = useState("AD");
  const [colunaModal, setColunaModal] = useState(PADRAO_COL_MODAL);   // modal de venda (a venda foi feita via live?)
  const [textoModal, setTextoModal] = useState(PADRAO_TEXTO_LIVE);     // texto que identifica live nessa coluna
  const [colunaVendedor, setColunaVendedor] = useState(PADRAO_COL_VENDEDOR);
  const [colunaCustosLive, setColunaCustosLive] = useState("F");
  const [colunaRoiLive, setColunaRoiLive] = useState("K");
  const [percentualImposto, setPercentualImposto] = useState("9");
  const [percentualComissao, setPercentualComissao] = useState("14");
  // Taxas e tarifas: a fórmula vem da aba Regras (canal escolhido). A coluna do valor pago (abaixo) é a base da fórmula;
  // as outras letras da fórmula (ex.: U2 no TikTok) precisam de uma coluna correspondente na planilha de Lives (vazio = 0).
  const [canalRegras, setCanalRegras] = useState("TikTok");
  const [regrasCanais, setRegrasCanais] = useState<{ canal: string; formula: string; colPdv: string }[]>([]);
  const [mapaExtras, setMapaExtras] = useState<Record<string, string>>({});

  // Dados
  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);
  const [custosLiveBrutos, setCustosLiveBrutos] = useState<any[]>([]);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;

  // Filtros
  const [buscaSku, setBuscaSku] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const statusPermitidos = ["aguardando envio", "em trânsito", "concluído", "entregue", "enviado", "a ser enviado", "paid", "completed"];
  const TABELA_DESTINO_LIVES = "vendas_lives_separadas";

  useEffect(() => {
    setMounted(true);
    const usuarioLogado = typeof window !== "undefined" ? localStorage.getItem("usuario_logado") : null;
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

      const { data: configData } = await supabase.from("config_regras_tiny").select("*").like("campo", "live_%");
      if (configData && configData.length > 0) {
        configData.forEach((cfg: any) => {
          if (cfg.campo === "live_col_sku") setColunaSku(cfg.coluna);
          if (cfg.campo === "live_col_status") setColunaStatus(cfg.coluna);
          if (cfg.campo === "live_col_repasse") setColunaRepasse(cfg.coluna);
          if (cfg.campo === "live_col_pdv") setColunaPdv(cfg.coluna);
          if (cfg.campo === "live_col_rebate") setColunaRebate(String(cfg.coluna || ""));
          if (cfg.campo === "live_col_data") setColunaData(cfg.coluna);
          if (cfg.campo === "live_col_modal") setColunaModal(String(cfg.coluna || PADRAO_COL_MODAL));
          if (cfg.campo === "live_texto_modal") setTextoModal(String(cfg.coluna || PADRAO_TEXTO_LIVE));
          if (cfg.campo === "live_col_vendedor") setColunaVendedor(String(cfg.coluna || PADRAO_COL_VENDEDOR));
          if (cfg.campo === "live_col_custo_live") setColunaCustosLive(cfg.coluna);
          if (cfg.campo === "live_col_roi_live") setColunaRoiLive(cfg.coluna);
          if (cfg.campo === "live_imposto") setPercentualImposto(cfg.coluna);
          if (cfg.campo === "live_comissao") setPercentualComissao(cfg.coluna);
          if (cfg.campo === "live_canal_regras") setCanalRegras(cfg.coluna);
          if (String(cfg.campo).startsWith("live_map_")) {
            const letra = String(cfg.campo).replace("live_map_", "").toUpperCase();
            setMapaExtras((prev) => ({ ...prev, [letra]: String(cfg.coluna || "").toUpperCase() }));
          }
        });
      }

      const { data: regrasData } = await supabase.from("config_regras_canais").select("canal, formula_excel, col_pdv");
      setRegrasCanais((regrasData || []).filter((r: any) => r.canal).map((r: any) => ({ canal: String(r.canal), formula: String(r.formula_excel || "").trim(), colPdv: String(r.col_pdv || "").trim().toUpperCase() })));

      let allVendas: any[] = [];
      let vFrom = 0;
      let vKeep = true;
      while (vKeep) {
        const { data } = await supabase.from(TABELA_DESTINO_LIVES).select("*").range(vFrom, vFrom + step - 1);
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
          // linhas antigas não têm valor_pago: o "repasse" delas era o valor pago pelo cliente
          valorPago: v.valor_pago !== null && v.valor_pago !== undefined ? Number(v.valor_pago) : Number(v.repasse) || 0,
          variaveis: v.variaveis || {},
          rebate: Number(v.rebate) || 0,
          pdv: v.pdv,
          data: v.data_venda,
          dataHora: v.data_hora || "",
          productName: v.nome_produto,
          vendedor: String(v.vendedor || "").trim(),
          idPedido: v.id_pedido || "",
        })));
      }

      const { data: metricasData } = await supabase.from("metricas_lives").select("*");
      if (metricasData && metricasData.length > 0) {
        setCustosLiveBrutos(metricasData.map(m => ({
          custoTotal: Number(m.custo_total) || 0,
          roiMedio: Number(m.roi_medio) || 0
        })));
      }
    } catch (e) {
      console.error("Erro ao carregar do Supabase:", e);
    }
    setLoading(false);
  };

  const salvarConfiguracoes = async () => {
    try {
      await supabase.from("config_regras_tiny").delete().like("campo", "live_%");

      const configs = [
        { campo: "live_col_sku", coluna: String(colunaSku) },
        { campo: "live_col_status", coluna: String(colunaStatus) },
        { campo: "live_col_repasse", coluna: String(colunaRepasse) },
        { campo: "live_col_pdv", coluna: String(colunaPdv) },
        ...(colunaRebate.trim() ? [{ campo: "live_col_rebate", coluna: colunaRebate.trim().toUpperCase() }] : []),
        { campo: "live_col_data", coluna: String(colunaData) },
        { campo: "live_col_modal", coluna: String(colunaModal).trim().toUpperCase() || PADRAO_COL_MODAL },
        { campo: "live_texto_modal", coluna: String(textoModal).trim() || PADRAO_TEXTO_LIVE },
        { campo: "live_col_vendedor", coluna: String(colunaVendedor).trim().toUpperCase() || PADRAO_COL_VENDEDOR },
        { campo: "live_col_custo_live", coluna: String(colunaCustosLive) },
        { campo: "live_col_roi_live", coluna: String(colunaRoiLive) },
        { campo: "live_imposto", coluna: String(percentualImposto) },
        { campo: "live_comissao", coluna: String(percentualComissao) },
        { campo: "live_canal_regras", coluna: String(canalRegras) },
        ...Object.entries(mapaExtras).filter(([, col]) => String(col || "").trim()).map(([letra, col]) => ({ campo: `live_map_${letra}`, coluna: String(col).trim().toUpperCase() })),
      ];

      for (const c of configs) {
        const { error } = await supabase.from("config_regras_tiny").upsert(c, { onConflict: "campo" });
        if (error) throw error;
      }

      alert("✅ Configurações salvas com sucesso no Supabase!");
      setSubAba("dados");
    } catch (err: any) {
      alert("❌ Erro ao salvar configurações: " + err.message);
    }
  };

  const limparBaseSupabase = async () => {
    if (!confirm("⚠️ Deseja limpar toda a base de Vendas e Métricas de Lives gravada na tabela isolada?")) return;
    setLoading(true);
    try {
      await supabase.from(TABELA_DESTINO_LIVES).delete().neq("id", 0);
      await supabase.from("metricas_lives").delete().neq("id", 0);
      setDadosBrutos([]);
      setCustosLiveBrutos([]);
      setPaginaAtual(1);
      alert("✅ Base isolada de lives limpa com sucesso!");
    } catch (err: any) {
      alert("Erro ao limpar base: " + err.message);
    }
    setLoading(false);
  };

  // Fórmula de taxas e tarifas do canal escolhido (aba Regras) e a letra que representa o preço nela
  const formulaDoCanal = () => regrasCanais.find((r) => r.canal === canalRegras)?.formula || "";
  const letraDoPreco = () => {
    // o preço é a coluna de PDV da regra do canal (ex.: R no TikTok); as demais letras da fórmula são colunas extras
    const regra = regrasCanais.find((r) => r.canal === canalRegras);
    if (regra && /^[A-Z]{1,2}$/.test(regra.colPdv)) return regra.colPdv;
    const m = formulaDoCanal().match(/\b([A-Za-z]{1,2})\d*\b/);
    return m ? m[1].toUpperCase() : "";
  };
  const repasseDaLinha = (valorPago: number, variaveis: Record<string, number> = {}) => {
    const f = formulaDoCanal();
    if (!f) return valorPago;   // canal sem fórmula nas Regras: sem desconto de taxas (a tela avisa)
    const preco = letraDoPreco();
    const r = avaliarFormulaLive(f, (l) => (l === preco ? valorPago : Number(variaveis[l]) || 0), valorPago, 1);
    return r === null ? valorPago : r;
  };

  const handleFileUploadCustosRoi = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const idxCusto = colunaParaIndice(colunaCustosLive);
        const idxRoi = colunaParaIndice(colunaRoiLive);

        let custoTotalLives = 0;
        let roiSoma = 0;
        let countLives = 0;

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0) continue;
          const c = parseNumeroBruto(row[idxCusto]);
          const r = parseNumeroBruto(row[idxRoi]);
          custoTotalLives += c;
          if (r > 0) {
            roiSoma += r;
            countLives++;
          }
        }

        const roiMedioCalc = countLives > 0 ? roiSoma / countLives : 0;

        await supabase.from("metricas_lives").delete().neq("id", 0);
        await supabase.from("metricas_lives").insert({
          custo_total: custoTotalLives,
          roi_medio: roiMedioCalc
        });

        setCustosLiveBrutos([{ custoTotal: custoTotalLives, roiMedio: roiMedioCalc }]);
        alert(`✅ Métricas carregadas! Custo Total: R$ ${custoTotalLives.toFixed(2)} | ROI Médio: ${roiMedioCalc.toFixed(2)}x`);
      } catch (err: any) {
        alert("Erro ao ler/salvar planilha de métricas: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  // Ordem das datas "a/b/aaaa" da planilha (mês/dia ou dia/mês), decidida olhando a base inteira
  const ordemData = detectarOrdemData(dadosBrutos.map((r) => r.dataHora || r.data));

  // Processamento e Filtragem Corrigida por Timestamp
  const dadosProcessados = dadosBrutos.map((row) => {
    const skuRaw = row.sku;
    const skuNorm = normalizarSku(skuRaw);
    const valorPago = parseNumeroBruto(row.valorPago);
    const repasseSemRebate = repasseDaLinha(valorPago, row.variaveis || {});   // valor pago - taxas e tarifas (fórmula das Regras)
    const tarifas = Math.max(0, valorPago - repasseSemRebate);
    const rebate = Math.max(0, Number(row.rebate) || 0);   // subsídio do TikTok: não sai do vendedor, entra no repasse
    const repasse = repasseSemRebate + rebate;
    const pdv = parseNumeroBruto(row.pdv);
    const dataPagamento = row.data;
    const dh = interpretarDataHora(row.dataHora || row.data, ordemData);
    const statusVenda = String(row.status || "").trim().toLowerCase();
    const vendedor = String(row.vendedor || "").trim();

    const custoObj = custosMap.get(skuNorm);
    const custoUnitario = custoObj ? parseNumeroBruto(custoObj.custo_unitario ?? custoObj.custo ?? 0) : 0;
    const nomeProduto = custoObj ? (custoObj.produto || custoObj.descricao || "Produto Cadastrado") : (row.productName || "Produto Desconhecido");

    // imposto e comissão incidem sobre o valor da venda (o que o cliente pagou), como no dashboard
    const impostoVal = valorPago * (parseFloat(percentualImposto) / 100 || 0);
    const comissaoVendedoraVal = valorPago * (parseFloat(percentualComissao) / 100 || 0);
    const liquidez = repasse - custoUnitario - impostoVal - comissaoVendedoraVal;

    const valorPdv = pdv > 0 ? pdv : valorPago;
    const percentualLucroPdv = valorPdv > 0 ? (liquidez / valorPdv) * 100 : 0;
    // data reconhecida (dia/mês ou mês/dia detectado na base inteira); senão cai no jeito antigo
    const dataCurta = dh ? dataIsoParaBr(dh.iso) : formatarDataCurta(dataPagamento);
    const timestamp = dh ? new Date(+dh.iso.slice(0, 4), +dh.iso.slice(5, 7) - 1, +dh.iso.slice(8, 10)).getTime() : parseDataParaTimestamp(dataCurta);

    return {
      sku: skuRaw,
      skuNorm,
      nomeProduto,
      valorPago,
      tarifas,
      rebate,
      repasse,
      pdv: valorPdv,
      custo: custoUnitario,
      imposto: impostoVal,
      comissaoVendedora: comissaoVendedoraVal,
      liquidez,
      percentualLucroPdv,
      data: dataCurta,
      dataIso: dh ? dh.iso : "",
      hora: dh ? dh.hora : null,
      minuto: dh ? dh.minuto : null,
      timestamp,
      status: statusVenda,
      vendedor,
      idPedido: String(row.idPedido || ""),
    };
  }).filter(item => {
    if (!item.skuNorm) return false;

    if (filtroVendedor === SEM_VENDEDOR ? item.vendedor !== "" : (filtroVendedor && item.vendedor !== filtroVendedor)) return false;

    const statusLimpo = item.status.replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const statusValido = statusPermitidos.some(st => statusLimpo.includes(st.toLowerCase()));
    if (!statusValido) return false;

    if (buscaSku && !item.skuNorm.includes(buscaSku.toLowerCase()) && !item.nomeProduto.toLowerCase().includes(buscaSku.toLowerCase())) {
      return false;
    }

    if (filtroMes && item.timestamp) {
      const d = new Date(item.timestamp);
      const ano = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, "0");
      if (`${ano}-${mes}` !== filtroMes) return false;
    }

    const tsInicio = dataInicio ? parseDataParaTimestamp(dataInicio) : null;
    const tsFim = dataFim ? parseDataParaTimestamp(dataFim) : null;

    if (tsInicio !== null && item.timestamp !== null && item.timestamp < tsInicio) {
      return false;
    }

    if (tsFim !== null && item.timestamp !== null && item.timestamp > tsFim) {
      return false;
    }

    return true;
  });

  const totalVenda = dadosProcessados.reduce((acc, cur) => acc + cur.valorPago, 0);
  const totalTarifas = dadosProcessados.reduce((acc, cur) => acc + cur.tarifas, 0);
  const totalRebate = dadosProcessados.reduce((acc, cur) => acc + cur.rebate, 0);
  const totalRepasse = dadosProcessados.reduce((acc, cur) => acc + cur.repasse, 0);
  const semFormula = !formulaDoCanal();
  const totalCusto = dadosProcessados.reduce((acc, cur) => acc + cur.custo, 0);
  const totalImposto = dadosProcessados.reduce((acc, cur) => acc + cur.imposto, 0);
  const totalComissaoVendedora = dadosProcessados.reduce((acc, cur) => acc + cur.comissaoVendedora, 0);
  
  const custoTotalLivesImportado = custosLiveBrutos.reduce((acc, cur) => acc + (cur.custoTotal || 0), 0);
  const roiMedioImportado = custosLiveBrutos.length > 0 ? custosLiveBrutos[0].roiMedio || 0 : 0;

  const totalLiquidez = dadosProcessados.reduce((acc, cur) => acc + cur.liquidez, 0) - custoTotalLivesImportado;
  
  // % de lucro sobre o PDV, ponderado pelo valor (soma da liquidez / soma do PDV)
  const totalPdv = dadosProcessados.reduce((acc, cur) => acc + cur.pdv, 0);
  const mediaLucroPdvGeral = totalPdv > 0 ? (totalLiquidez / totalPdv) * 100 : 0;

  const compactoMap = new Map<string, { sku: string; nome: string; qtd: number; venda: number; tarifas: number; rebate: number; pdv: number; repasse: number; custo: number; comissaoVendedora: number; liquidez: number; percentualLucroPdv: number }>();
  dadosProcessados.forEach(item => {
    if (!compactoMap.has(item.skuNorm)) {
      compactoMap.set(item.skuNorm, {
        sku: item.sku,
        nome: item.nomeProduto,
        qtd: 0,
        venda: 0,
        tarifas: 0,
        rebate: 0,
        pdv: 0,
        repasse: 0,
        custo: 0,
        comissaoVendedora: 0,
        liquidez: 0,
        percentualLucroPdv: 0,
      });
    }
    const c = compactoMap.get(item.skuNorm)!;
    c.qtd += 1;
    c.venda += item.valorPago;
    c.tarifas += item.tarifas;
    c.rebate += item.rebate;
    c.pdv += item.pdv;
    c.repasse += item.repasse;
    c.custo += item.custo;
    c.comissaoVendedora += item.comissaoVendedora;
    c.liquidez += item.liquidez;
  });

  const dadosCompactos = Array.from(compactoMap.values()).map(item => ({
    ...item,
    percentualLucroPdv: item.pdv > 0 ? (item.liquidez / item.pdv) * 100 : 0
  })).sort((a, b) => b.qtd - a.qtd);

  const itensAtivos = modoPainel === "detalhado" ? dadosProcessados : dadosCompactos;

  const totalPaginas = Math.ceil(itensAtivos.length / itensPorPagina) || 1;
  const indexUltimoItem = paginaAtual * itensPorPagina;
  const indexPrimeiroItem = indexUltimoItem - itensPorPagina;
  const itensPaginados = itensAtivos.slice(indexPrimeiroItem, indexUltimoItem);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#07090e] p-6 md:p-8 text-slate-100 flex items-center justify-center font-sans">
        <p className="text-slate-400 text-xs">Carregando painel de lives...</p>
      </div>
    );
  }

  const vendedoresBase = Array.from(new Set(dadosBrutos.map((r) => String(r.vendedor || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const haSemVendedor = dadosBrutos.some((r) => !String(r.vendedor || "").trim());

  const barraFiltros = (
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
          <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Vendedor:</label>
          <select
            value={filtroVendedor}
            onChange={(e) => { setFiltroVendedor(e.target.value); setPaginaAtual(1); }}
            className="bg-slate-950 border border-emerald-900/60 rounded-xl p-2.5 text-xs text-emerald-300 outline-none font-mono min-w-[150px]"
          >
            <option value="">Todos</option>
            {vendedoresBase.map((v) => <option key={v} value={v}>{v}</option>)}
            {haSemVendedor && <option value={SEM_VENDEDOR}>(sem vendedor)</option>}
          </select>
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
          onClick={() => { setBuscaSku(""); setFiltroMes(""); setFiltroVendedor(""); setDataInicio(""); setDataFim(""); setPaginaAtual(1); }}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase cursor-pointer"
        >
          Limpar Filtros
        </button>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#07090e] p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Relatório de Vendas via LIVES</h1>
            <p className="text-sm font-medium text-slate-400">Alimentada pelo upload de vendas ({TABELA_DESTINO_LIVES}); aqui só falta subir a planilha de Ads</p>
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
              onClick={() => setSubAba("analise")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
                subAba === "analise" ? "bg-indigo-600 text-white shadow-indigo-950/50" : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              📈 Análise de Desempenho
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

          <div className="flex flex-wrap items-center gap-4">
            <div className="text-[11px] text-indigo-300 font-bold max-w-[320px]" title="Uploads > Updates e Alimenta Dashboard > Vendas do canal">
              1. Vendas: vêm sozinhas do upload de vendas do {canalRegras} (só faturados)
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-cyan-400 font-bold">2. Planilha de Ads (Métricas/Custo/ROI):</label>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUploadCustosRoi}
                className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-cyan-600 file:text-white cursor-pointer"
              />
            </div>
          </div>
        </div>

        {subAba === "analise" && (
          <div className="space-y-6">
          {barraFiltros}
          <AnaliseDesempenho
            custoLives={custoTotalLivesImportado}
            itens={dadosProcessados.map((d): ItemAnalise => ({
              sku: d.sku, nome: d.nomeProduto, valorPago: d.valorPago, tarifas: d.tarifas, rebate: d.rebate, repasse: d.repasse,
              custo: d.custo, imposto: d.imposto, comissaoVendedora: d.comissaoVendedora, liquidez: d.liquidez,
              dataIso: d.dataIso, hora: d.hora, minuto: d.minuto,
            }))}
          />
          </div>
        )}

        {subAba === "config" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800/80 shadow-xl max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">⚙️ Configurações e Mapeamento Completo</h2>
                <p className="text-xs text-slate-400 mt-1">Defina as colunas da planilha de vendas do canal e salve no Supabase. Valem para o próximo upload de vendas.</p>
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
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Valor da Venda — preço pago após desconto (Letra):</label>
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
                <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Coluna Rebate dos Pedidos — subsídio do TikTok (Letra, vazio = não usar):</label>
                <input
                  type="text"
                  value={colunaRebate}
                  onChange={(e) => setColunaRebate(e.target.value)}
                  placeholder="Ex: Y"
                  className="w-full bg-slate-900 border border-emerald-700/60 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                />
                <p className="text-[10px] text-slate-500 mt-1">É o desconto que o TikTok subsidia e que não sai de você: o valor é somado ao repasse (depois das taxas e tarifas da fórmula). Vale para as próximas planilhas enviadas.</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Modal de Venda — como a venda foi feita (Letra):</label>
                <input
                  type="text"
                  value={colunaModal}
                  onChange={(e) => setColunaModal(e.target.value)}
                  placeholder="BG"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Texto que identifica uma venda de live nessa coluna:</label>
                <input
                  type="text"
                  value={textoModal}
                  onChange={(e) => setTextoModal(e.target.value)}
                  placeholder="live"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold"
                />
                <p className="text-[10px] text-slate-500 mt-1">Basta conter o texto (sem diferenciar maiúsculas e acentos). Vários termos: separe por vírgula. O upload de vendas mostra os valores encontrados na coluna.</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Vendedor — quem gerou a venda (Letra):</label>
                <input
                  type="text"
                  value={colunaVendedor}
                  onChange={(e) => setColunaVendedor(e.target.value)}
                  placeholder="BH"
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
                <label className="block text-[10px] font-bold text-cyan-400 uppercase mb-1">Coluna Custo por Live (Planilha 2 - Letra ex: F):</label>
                <input
                  type="text"
                  value={colunaCustosLive}
                  onChange={(e) => setColunaCustosLive(e.target.value)}
                  className="w-full bg-slate-900 border border-cyan-700/60 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-cyan-400 uppercase mb-1">Coluna ROI (Planilha 2 - Letra ex: K):</label>
                <input
                  type="text"
                  value={colunaRoiLive}
                  onChange={(e) => setColunaRoiLive(e.target.value)}
                  className="w-full bg-slate-900 border border-cyan-700/60 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
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

            <div className="bg-slate-950 p-6 rounded-xl border border-amber-800/50 space-y-4">
              <div>
                <h3 className="text-xs font-black text-amber-300 uppercase tracking-wider">Taxas e tarifas (fórmula da aba Regras)</h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  O repasse de cada venda é calculado aplicando a fórmula do canal escolhido sobre o valor da venda (coluna acima). Imposto e comissão incidem sobre o valor da venda.
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Canal das Regras usado nas lives:</label>
                <select
                  value={canalRegras}
                  onChange={(e) => setCanalRegras(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-bold"
                >
                  {Array.from(new Set(["TikTok", ...regrasCanais.map((r) => r.canal)])).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {formulaDoCanal() ? (
                <p className="text-[11px] text-slate-300">Fórmula: <span className="font-mono text-amber-300">{formulaDoCanal()}</span> — a letra <b className="font-mono">{letraDoPreco()}</b> é o valor da venda.</p>
              ) : (
                <p className="text-[11px] text-rose-400 font-bold">⚠️ Este canal não tem fórmula cadastrada na aba Regras: o repasse ficará igual ao valor pago.</p>
              )}
              {letrasDaFormula(formulaDoCanal()).filter((l) => l !== letraDoPreco()).map((l) => (
                <div key={l}>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Coluna da planilha de vendas para a variável {l} da fórmula (vazio = a própria coluna {l}):</label>
                  <input
                    type="text"
                    value={mapaExtras[l] || ""}
                    onChange={(e) => setMapaExtras({ ...mapaExtras, [l]: e.target.value })}
                    className="w-32 bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono font-bold uppercase"
                  />
                </div>
              ))}
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
            
            {semFormula && (
              <div className="bg-amber-950/40 border border-amber-700/60 text-amber-300 text-xs font-bold rounded-xl p-3">
                ⚠️ O canal "{canalRegras}" não tem fórmula de apuração na aba Regras: o repasse está igual ao valor pago (sem descontar taxas e tarifas). Escolha o canal em Configurações Live.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Valor das Vendas</span>
                <span className="text-sm font-black font-mono text-white mt-1 block">{formatarMoeda(totalVenda)}</span>
              </div>
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Taxas e Tarifas ({canalRegras})</span>
                <span className="text-sm font-black font-mono text-rose-400 mt-1 block">- {formatarMoeda(totalTarifas)}</span>
              </div>
              {(totalRebate > 0 || colunaRebate.trim()) && (
                <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl" title="Subsídio do TikTok: não é descontado do vendedor e entra no repasse">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Rebate dos Pedidos (TikTok)</span>
                  <span className="text-sm font-black font-mono text-emerald-400 mt-1 block">+ {formatarMoeda(totalRebate)}</span>
                </div>
              )}
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Total Repasse</span>
                <span className="text-sm font-black font-mono text-white mt-1 block">{formatarMoeda(totalRepasse)}</span>
              </div>
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Custo Total (CMV)</span>
                <span className="text-sm font-black font-mono text-rose-400 mt-1 block">- {formatarMoeda(totalCusto)}</span>
              </div>
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Impostos ({percentualImposto}%)</span>
                <span className="text-sm font-black font-mono text-amber-400 mt-1 block">- {formatarMoeda(totalImposto)}</span>
              </div>
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Comissão Vend. ({percentualComissao}%)</span>
                <span className="text-sm font-black font-mono text-indigo-400 mt-1 block">- {formatarMoeda(totalComissaoVendedora)}</span>
              </div>
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Custo de Lives</span>
                <span className="text-sm font-black font-mono text-cyan-400 mt-1 block">- {formatarMoeda(custoTotalLivesImportado)}</span>
              </div>
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">ROI Médio</span>
                <span className="text-sm font-black font-mono text-indigo-300 mt-1 block">{roiMedioImportado.toFixed(2)}x</span>
              </div>
              <div className="bg-emerald-950/40 border-emerald-800/60 p-3.5 rounded-2xl border shadow-xl" title="Repasse - CMV - Impostos - Comissão - Custo de lives">
                <span className="block text-[10px] font-bold text-emerald-300 uppercase">Liquidez</span>
                <span className="text-sm font-black font-mono text-emerald-400 mt-1 block">{formatarMoeda(totalLiquidez)}</span>
                <span className="block text-[9px] text-slate-500 mt-0.5">após custo das lives</span>
              </div>
              <div className="bg-slate-900/90 border-slate-800/80 p-3.5 rounded-2xl border shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">% Lucro sobre PDV</span>
                <span className="text-sm font-black font-mono text-cyan-400 mt-1 block">{mediaLucroPdvGeral.toFixed(2)}%</span>
              </div>
            </div>

            {barraFiltros}

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
                        <th className="p-3 text-right">VENDA</th>
                        <th className="p-3 text-right">TAXAS/TARIFAS</th>
                        <th className="p-3 text-right">REBATE</th>
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
                            {item.vendedor && <span className="text-[10px] text-emerald-400 font-bold block">Vendedor: {item.vendedor}</span>}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(item.valorPago)}</td>
                          <td className="p-3 text-right font-mono text-rose-300">- {formatarMoeda(item.tarifas)}</td>
                          <td className="p-3 text-right font-mono text-emerald-300">+ {formatarMoeda(item.rebate)}</td>
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
                          <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(item.venda)}</td>
                          <td className="p-3 text-right font-mono text-rose-300">- {formatarMoeda(item.tarifas)}</td>
                          <td className="p-3 text-right font-mono text-emerald-300">+ {formatarMoeda(item.rebate)}</td>
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
                          <td colSpan={9} className="p-8 text-center text-slate-500">Nenhum registo encontrado com os filtros atuais.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

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