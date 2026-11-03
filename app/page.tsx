"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "./components/Navbar";

// Função para equiparar SKUs com formatos diferentes entre canais, custos e devoluções
function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export default function CurvaABCPage() {
  const [loading, setLoading] = useState(true);

  // Estados de dados do Supabase
  const [vendas, setVendas] = useState<any[]>([]);
  const [custosMap, setCustosMap] = useState<Record<string, { custo: number; marca: string; titulo: string }>>({});
  const [devolucoesMap, setDevolucoesMap] = useState<Record<string, { qtd: number; valor: number }>>({});
  const [canaisDisponiveis, setCanaisDisponiveis] = useState<string[]>([]);

  // Filtros
  const [dateFilter, setDateFilter] = useState("MES");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [searchSku, setSearchSku] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("TODAS");
  const [selectedChannel, setSelectedChannel] = useState("TODOS");

  // Filtros da tabela de pedidos
  const [searchOrderId, setSearchOrderId] = useState("");
  const [sortOrder, setSortOrder] = useState("DEFAULT");
  const [filtroDevolucao, setFiltroDevolucao] = useState("TODOS");
  const [currentPageOrders, setCurrentPageOrders] = useState(1);
  const itemsPerPageOrders = 20;

  useEffect(() => {
    carregarDadosBase();
  }, []);

  useEffect(() => {
    setCurrentPageOrders(1);
  }, [searchOrderId, sortOrder, filtroDevolucao, dateFilter, customStartDate, customEndDate, selectedChannel, selectedBrand, searchSku]);

  // 1. Carrega dados de apoio (Custos, Devoluções e Vendas)
  const carregarDadosBase = async () => {
    setLoading(true);
    try {
      // 1.1 Tabela de Custos e Cadastro
      let allCustos: any[] = [];
      let from = 0;
      const step = 1000;
      let keep = true;
      while (keep) {
        const { data } = await supabase
          .from("tabela_custos_skus")
          .select("sku, marca, produto, custo_unitario")
          .range(from, from + step - 1);
        if (data && data.length > 0) {
          allCustos = [...allCustos, ...data];
          from += step;
          if (data.length < step) keep = false;
        } else keep = false;
      }

      const cMap: Record<string, { custo: number; marca: string; titulo: string }> = {};
      allCustos.forEach((c) => {
        const k = normalizarSku(c.sku);
        if (k) {
          cMap[k] = {
            custo: Number(c.custo_unitario) || 0,
            marca: (c.marca || "SEM MARCA").trim().toUpperCase(),
            titulo: c.produto || "Produto não identificado"
          };
        }
      });
      setCustosMap(cMap);

      // 1.2 Tabela de Devoluções (Agrupada por SKU e por ID Pedido)
      const { data: dadosDevolucoes } = await supabase
        .from("devolucoes")
        .select("sku, id_pedido, valor_reembolso, quantidade, motivo");

      const devMap: Record<string, { qtd: number; valor: number }> = {};
      (dadosDevolucoes || []).forEach((d: any) => {
        const k = normalizarSku(d.sku);
        if (k) {
          if (!devMap[k]) devMap[k] = { qtd: 0, valor: 0 };
          devMap[k].qtd += Number(d.quantidade) || 1;
          devMap[k].valor += Number(d.valor_reembolso) || 0;
        }
      });
      setDevolucoesMap(devMap);

      // 1.3 Vendas dos Canais
      let allVendas: any[] = [];
      from = 0;
      keep = true;
      while (keep) {
        const { data } = await supabase
          .from("vendas_canais")
          .select("id_pedido, sku, canal, data_faturamento, preco_venda, repasse_liquido, quantidade, frete_flex, status")
          .range(from, from + step - 1);
        if (data && data.length > 0) {
          allVendas = [...allVendas, ...data];
          from += step;
          if (data.length < step) keep = false;
        } else keep = false;
      }

      setVendas(allVendas);

      // Extrai canais dinâmicos excluindo lojas físicas
      const canaisUnicos = Array.from(new Set(allVendas.map((v) => v.canal).filter(Boolean)))
        .filter((c: any) => {
          const nome = String(c || "").toLowerCase();
          return !(nome.includes("clube") || nome.includes("loja") || nome.includes("paineiras") || nome.includes("hebraica"));
        });
      setCanaisDisponiveis(canaisUnicos);

    } catch (err) {
      console.error("Erro ao carregar base da Curva ABC:", err);
    } finally {
      setLoading(false);
    }
  };

  // Lista de marcas disponíveis
  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    Object.values(custosMap).forEach((item) => {
      if (item.marca) brands.add(item.marca);
    });
    return ["TODAS", ...Array.from(brands).sort((a, b) => a.localeCompare(b))];
  }, [custosMap]);

  // Motor Temporal e Cálculo da Curva ABC com Impacto de Devoluções
  const { currentSales, abcCurve, kpis } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    let currStartMs = 0, currEndMs = endOfDay.getTime();
    let prevStartMs = 0, prevEndMs = 0;
    const DAY_MS = 24 * 60 * 60 * 1000;

    if (dateFilter === "HOJE") {
      currStartMs = today.getTime();
      prevStartMs = currStartMs - DAY_MS;
      prevEndMs = currEndMs - DAY_MS;
    } else if (dateFilter === "SEMANA") {
      currStartMs = today.getTime() - 6 * DAY_MS;
      prevEndMs = currStartMs - 1;
      prevStartMs = prevEndMs - 6 * DAY_MS;
    } else if (dateFilter === "QUINZENA") {
      currStartMs = today.getTime() - 14 * DAY_MS;
      prevEndMs = currStartMs - 1;
      prevStartMs = prevEndMs - 14 * DAY_MS;
    } else if (dateFilter === "MES") {
      currStartMs = today.getTime() - 29 * DAY_MS;
      prevEndMs = currStartMs - 1;
      prevStartMs = prevEndMs - 29 * DAY_MS;
    } else if (dateFilter === "PERSONALIZADO" && customStartDate && customEndDate) {
      const start = new Date(customStartDate + "T00:00:00").getTime();
      const end = new Date(customEndDate + "T23:59:59").getTime();
      currStartMs = start;
      currEndMs = end;
      const duration = currEndMs - currStartMs + 1;
      prevEndMs = currStartMs - 1;
      prevStartMs = currStartMs - duration;
    }

    const currSales: any[] = [];
    const prevSales: any[] = [];

    (vendas || []).forEach((s) => {
      const nomeCanal = String(s.canal || "").toLowerCase();
      const isFisico = nomeCanal.includes("clube") || nomeCanal.includes("loja") || nomeCanal.includes("paineiras") || nomeCanal.includes("hebraica");
      if (isFisico) return;
      if (selectedChannel !== "TODOS" && s.canal !== selectedChannel) return;

      if (s.data_faturamento) {
        const t = new Date(s.data_faturamento + "T00:00:00").getTime();
        if (dateFilter !== "TUDO") {
          if (t >= currStartMs && t <= currEndMs) currSales.push(s);
          else if (t >= prevStartMs && t <= prevEndMs) prevSales.push(s);
        } else {
          currSales.push(s);
        }
      }
    });

    // 1. Agregação Período Atual
    const skuStats: Record<string, any> = {};
    currSales.forEach((s) => {
      const k = normalizarSku(s.sku);
      if (!skuStats[k]) {
        skuStats[k] = {
          rawSku: s.sku,
          skuNorm: k,
          qtd: 0,
          revenue: 0,
          repasse: 0,
          freteFlex: 0
        };
      }
      skuStats[k].qtd += Number(s.quantidade) || 1;
      skuStats[k].revenue += Number(s.preco_venda) || 0;
      skuStats[k].repasse += Number(s.repasse_liquido) || 0;
      skuStats[k].freteFlex += Number(s.frete_flex) || 0;
    });

    let faturamentoTotalPeriodo = 0;
    let devolucoesTotalPeriodo = 0;

    let allSkus = Object.values(skuStats).map((s) => {
      const infoCusto = custosMap[s.skuNorm] || { custo: 0, marca: "SEM MARCA", titulo: "Produto não cadastrado" };
      const infoDevolucao = devolucoesMap[s.skuNorm] || { qtd: 0, valor: 0 };

      const cmvTotal = infoCusto.custo * s.qtd;
      // Lucro Real = Repasse Líquido - CMV - Frete Flex - Valor Perdido em Devoluções
      const lucroTotal = s.repasse - cmvTotal - s.freteFlex - infoDevolucao.valor;
      
      const taxaDevolucao = s.qtd > 0 ? (infoDevolucao.qtd / s.qtd) * 100 : 0;

      faturamentoTotalPeriodo += s.revenue;
      devolucoesTotalPeriodo += infoDevolucao.valor;

      return {
        ...s,
        sku: s.rawSku,
        titulo: infoCusto.titulo,
        marca: infoCusto.marca,
        custoUnitario: infoCusto.custo,
        cmvTotal,
        lucroTotal,
        qtdDevolvida: infoDevolucao.qtd,
        valorDevolvido: infoDevolucao.valor,
        taxaDevolucao
      };
    });

    allSkus.sort((a, b) => b.revenue - a.revenue);

    let cumulative = 0;
    allSkus.forEach((s) => {
      cumulative += s.revenue;
      const pct = (cumulative / (faturamentoTotalPeriodo || 1)) * 100;
      s.pctRepresentatividade = (s.revenue / (faturamentoTotalPeriodo || 1)) * 100;

      if (pct <= 80) s.curva = "A";
      else if (pct <= 95) s.curva = "B";
      else s.curva = "C";
    });

    // Filtros de Pesquisa (SKU e Marca)
    let displaySkus = allSkus;
    if (searchSku.trim()) {
      displaySkus = displaySkus.filter((s) => s.sku.toLowerCase().includes(searchSku.toLowerCase()));
    }
    if (selectedBrand !== "TODAS") {
      displaySkus = displaySkus.filter((s) => s.marca === selectedBrand);
    }

    let fatFiltrado = 0, lucFiltrado = 0, devFiltrada = 0;
    let cA = 0, cB = 0, cC = 0;

    displaySkus.forEach((s) => {
      fatFiltrado += s.revenue;
      lucFiltrado += s.lucroTotal;
      devFiltrada += s.valorDevolvido;
      if (s.curva === "A") cA++;
      if (s.curva === "B") cB++;
      if (s.curva === "C") cC++;
    });

    // 2. Agregação Período Anterior para Comparativo
    const prevSkuMap: Record<string, any> = {};
    prevSales.forEach((s) => {
      const k = normalizarSku(s.sku);
      if (!prevSkuMap[k]) prevSkuMap[k] = { qtd: 0, revenue: 0, repasse: 0, freteFlex: 0 };
      prevSkuMap[k].qtd += Number(s.quantidade) || 1;
      prevSkuMap[k].revenue += Number(s.preco_venda) || 0;
      prevSkuMap[k].repasse += Number(s.repasse_liquido) || 0;
      prevSkuMap[k].freteFlex += Number(s.frete_flex) || 0;
    });

    let prevFatFiltrado = 0, prevLucFiltrado = 0;
    Object.entries(prevSkuMap).forEach(([k, s]) => {
      const infoCusto = custosMap[k] || { custo: 0, marca: "SEM MARCA" };
      if (searchSku.trim() && !k.includes(searchSku.toLowerCase())) return;
      if (selectedBrand !== "TODAS" && infoCusto.marca !== selectedBrand) return;

      const infoDevolucao = devolucoesMap[k] || { valor: 0 };
      const cmvTotal = infoCusto.custo * s.qtd;
      const lucroTotal = s.repasse - cmvTotal - s.freteFlex - infoDevolucao.valor;

      prevFatFiltrado += s.revenue;
      prevLucFiltrado += lucroTotal;
    });

    const diffFat = prevFatFiltrado > 0 ? ((fatFiltrado - prevFatFiltrado) / prevFatFiltrado) * 100 : 0;
    const diffLuc = prevLucFiltrado !== 0 ? ((lucFiltrado - prevLucFiltrado) / Math.abs(prevLucFiltrado)) * 100 : 0;

    return {
      currentSales: currSales,
      abcCurve: displaySkus,
      kpis: {
        faturamentoTotal: fatFiltrado,
        lucroTotal: lucFiltrado,
        hasPrev: dateFilter !== "TUDO" && prevSales.length > 0,
        diffFat,
        diffLuc,
        countA: cA,
        countB: cB,
        countC: cC,
        devolucoesTotal: devFiltrada,
        taxaDevolucaoGeral: fatFiltrado > 0 ? (devFiltrada / fatFiltrado) * 100 : 0
      }
    };
  }, [vendas, custosMap, devolucoesMap, dateFilter, customStartDate, customEndDate, searchSku, selectedBrand, selectedChannel]);

  // Desempenho por Marca
  const brandStats = useMemo(() => {
    const brands: Record<string, any> = {};
    abcCurve.forEach((s) => {
      const b = s.marca;
      if (!brands[b]) brands[b] = { marca: b, revenue: 0, lucro: 0, qtd: 0, devolucoes: 0 };
      brands[b].revenue += s.revenue;
      brands[b].lucro += s.lucroTotal;
      brands[b].qtd += s.qtd;
      brands[b].devolucoes += s.valorDevolvido;
    });
    return Object.values(brands).sort((a: any, b: any) => b.revenue - a.revenue);
  }, [abcCurve]);

  // Fragmentação por Pedido com verificação de devolução
  const enrichedOrders = useMemo(() => {
    const orderMap: Record<string, any> = {};

    currentSales.forEach((s) => {
      const k = normalizarSku(s.sku);
      const infoCusto = custosMap[k] || { custo: 0 };
      const infoDevolucao = devolucoesMap[k] || { qtd: 0, valor: 0 };

      const custoCMV = infoCusto.custo * (Number(s.quantidade) || 1);
      const custoFlex = Number(s.frete_flex) || 0;

      if (!orderMap[s.id_pedido]) {
        orderMap[s.id_pedido] = {
          ...s,
          custoCMV: 0,
          repasse_liquido: 0,
          preco_venda: 0,
          custoFlex: 0,
          valorDevolucao: 0,
          skus_concat: []
        };
      }

      orderMap[s.id_pedido].custoCMV += custoCMV;
      orderMap[s.id_pedido].preco_venda += Number(s.preco_venda) || 0;
      orderMap[s.id_pedido].repasse_liquido += Number(s.repasse_liquido) || 0;
      orderMap[s.id_pedido].custoFlex += custoFlex;
      orderMap[s.id_pedido].valorDevolucao += infoDevolucao.valor;
      orderMap[s.id_pedido].skus_concat.push(`${s.sku} (x${s.quantidade || 1})`);
    });

    return Object.values(orderMap).map((o: any) => {
      const ganhoLiquido = o.repasse_liquido - o.custoCMV - o.custoFlex - o.valorDevolucao;
      return {
        ...o,
        sku_display: o.skus_concat.join(" + "),
        ganhoLiquido,
        teveDevolucao: o.valorDevolucao > 0
      };
    });
  }, [currentSales, custosMap, devolucoesMap]);

  const displayOrders = useMemo(() => {
    let result = enrichedOrders;

    if (filtroDevolucao === "COM_DEVOLUCAO") {
      result = result.filter((o) => o.teveDevolucao);
    } else if (filtroDevolucao === "SEM_CMV") {
      result = result.filter((o) => !o.custoCMV || o.custoCMV === 0);
    }

    if (searchOrderId.trim()) {
      result = result.filter((s) => s.id_pedido && String(s.id_pedido).includes(searchOrderId.trim()));
    }

    if (sortOrder === "MAIOR_LIQUIDEZ") {
      result = [...result].sort((a, b) => b.ganhoLiquido - a.ganhoLiquido);
    } else if (sortOrder === "MENOR_LIQUIDEZ") {
      result = [...result].sort((a, b) => a.ganhoLiquido - b.ganhoLiquido);
    }
    return result;
  }, [enrichedOrders, searchOrderId, sortOrder, filtroDevolucao]);

  const totalPagesOrders = Math.ceil(displayOrders.length / itemsPerPageOrders) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPageOrders - 1) * itemsPerPageOrders;
    return displayOrders.slice(start, start + itemsPerPageOrders);
  }, [displayOrders, currentPageOrders]);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">

        {/* CABEÇALHO COM NAVBAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
              <span>Relatórios</span> <span>/</span> <span className="text-indigo-400">Curva ABC</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Inteligência de Produtos (Curva ABC)</h1>
            <p className="text-xs text-slate-400">Classificação de SKUs por faturamento, margem real líquida e impacto de devoluções</p>
          </div>
          <Navbar />
        </div>

        {/* BARRA DE FILTROS */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900/90 p-5 rounded-2xl border border-slate-800 gap-4 shadow-xl">
          <div className="flex flex-wrap gap-3 items-center w-full">
            <div className="flex gap-2 items-center bg-slate-950 p-2 rounded-xl border border-slate-800 w-full sm:w-auto">
              <span className="text-slate-400 text-xs">🔍</span>
              <input
                type="text"
                placeholder="Pesquisar SKU..."
                value={searchSku}
                onChange={(e) => setSearchSku(e.target.value)}
                className="bg-transparent text-slate-200 font-bold text-xs outline-none w-full sm:w-36"
              />
            </div>

            <div className="flex gap-2 items-center bg-slate-950 p-2 rounded-xl border border-slate-800 w-full sm:w-auto">
              <span className="text-sky-400 text-xs">🏪</span>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="bg-transparent text-sky-300 font-bold text-xs outline-none cursor-pointer"
              >
                <option value="TODOS" className="bg-slate-900 text-white">Todos os Canais</option>
                {canaisDisponiveis.map((c) => (
                  <option key={c} value={c} className="bg-slate-900 text-white">{c}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 items-center bg-slate-950 p-2 rounded-xl border border-slate-800 w-full sm:w-auto">
              <span className="text-purple-400 text-xs">🏷️</span>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="bg-transparent text-purple-300 font-bold text-xs outline-none cursor-pointer"
              >
                {availableBrands.map((b) => (
                  <option key={b} value={b} className="bg-slate-900 text-white">{b}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 items-center bg-slate-950 p-2 rounded-xl border border-slate-800 w-full sm:w-auto">
              <span className="text-indigo-400 text-xs">📅</span>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent text-indigo-300 font-bold text-xs outline-none cursor-pointer"
              >
                <option value="TUDO" className="bg-slate-900 text-white">Todo o Histórico</option>
                <option value="HOJE" className="bg-slate-900 text-white">Hoje</option>
                <option value="SEMANA" className="bg-slate-900 text-white">Últimos 7 dias</option>
                <option value="QUINZENA" className="bg-slate-900 text-white">Últimos 15 dias</option>
                <option value="MES" className="bg-slate-900 text-white">Últimos 30 dias</option>
                <option value="PERSONALIZADO" className="bg-slate-900 text-white">Personalizado</option>
              </select>
            </div>

            {dateFilter === "PERSONALIZADO" && (
              <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-slate-300 font-bold text-xs outline-none cursor-pointer"
                />
                <span className="text-slate-500 text-xs">até</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-slate-300 font-bold text-xs outline-none cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>

        {/* CARDS DE KPI COM IMPACTO DE DEVOLUÇÕES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-center">
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento Bruto</span>
              {kpis.hasPrev && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1 ${kpis.diffFat >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                  {kpis.diffFat >= 0 ? "▲" : "▼"} {Math.abs(kpis.diffFat).toFixed(1)}%
                </span>
              )}
            </div>
            <h3 className="text-2xl font-black text-white">
              R$ {kpis.faturamentoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800">
              <p className="text-[11px] text-emerald-400 font-bold">
                Lucro Real: R$ {kpis.lucroTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {kpis.hasPrev && (
                <span className={`text-[10px] font-black ${kpis.diffLuc >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {kpis.diffLuc >= 0 ? "▲" : "▼"} {Math.abs(kpis.diffLuc).toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-indigo-500/30 shadow-xl">
            <span className="text-[10px] font-bold text-indigo-400 uppercase">Curva A (80% Receita)</span>
            <h3 className="text-2xl font-black text-indigo-400 mt-1">{kpis.countA} SKUs</h3>
            <p className="text-[10px] text-slate-500 mt-1">Carros-chefes e foco absoluto de reposição</p>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-emerald-500/30 shadow-xl">
            <span className="text-[10px] font-bold text-emerald-400 uppercase">Curva B (15% Receita)</span>
            <h3 className="text-2xl font-black text-emerald-400 mt-1">{kpis.countB} SKUs</h3>
            <p className="text-[10px] text-slate-500 mt-1">Desempenho intermediário ({kpis.countC} em Curva C)</p>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-rose-500/30 shadow-xl">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-rose-400 uppercase">Perda Real em Devoluções</span>
              <span className="text-[10px] font-bold bg-rose-950/60 text-rose-300 px-1.5 py-0.5 rounded">
                {kpis.taxaDevolucaoGeral.toFixed(1)}% taxa
              </span>
            </div>
            <h3 className="text-2xl font-black text-rose-400 mt-1">
              - R$ {kpis.devolucoesTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[10px] text-slate-500 mt-1">Dedução direta no lucro operacional dos produtos</p>
          </div>
        </div>

        {/* GRID COM FATURAMENTO POR MARCA E TABELA DA CURVA ABC */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <h3 className="font-bold text-white text-sm mb-4">🏆 Faturamento por Marca</h3>
            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
              {brandStats.map((brand, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-slate-300 truncate max-w-[50%]">{brand.marca}</span>
                    <div className="text-right">
                      <span className="block text-xs font-black text-white">
                        R$ {brand.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="block text-[10px] text-emerald-400 font-bold">
                        Lucro: R$ {brand.lucro.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full"
                      style={{ width: `${Math.min((brand.revenue / (kpis.faturamentoTotal || 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {brandStats.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">Sem marcas para os filtros selecionados.</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">Classificação Detalhada de SKUs</h3>
              <span className="text-[11px] text-slate-400 font-mono">{abcCurve.length} itens listados</span>
            </div>
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 uppercase text-[9px] font-bold z-10">
                  <tr>
                    <th className="py-3 px-4 text-center">Curva</th>
                    <th className="py-3 px-4">SKU / Marca</th>
                    <th className="py-3 px-4 min-w-[200px]">Título do Produto</th>
                    <th className="py-3 px-4 text-center">Qtd Vend.</th>
                    <th className="py-3 px-4 text-center text-rose-400">Devoluções</th>
                    <th className="py-3 px-4 text-right">Fat. Bruto</th>
                    <th className="py-3 px-4 text-right text-emerald-400">Lucro Líquido</th>
                    <th className="py-3 px-4 text-right">Part. (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {loading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">Carregando dados da Curva ABC...</td></tr>
                  ) : abcCurve.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-slate-500">Nenhum SKU encontrado com os filtros selecionados.</td></tr>
                  ) : (
                    abcCurve.map((sku: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-black text-xs ${
                            sku.curva === "A" ? "bg-indigo-950 text-indigo-400 border border-indigo-700/50" :
                            sku.curva === "B" ? "bg-emerald-950 text-emerald-400 border border-emerald-700/50" :
                            "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}>
                            {sku.curva}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="block font-mono font-bold text-white">{sku.sku}</span>
                          <span className="block text-[9px] uppercase text-indigo-400 font-bold mt-0.5">{sku.marca}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-300 max-w-[220px] truncate" title={sku.titulo}>
                          {sku.titulo}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-200">{sku.qtd}</td>
                        <td className="py-3 px-4 text-center">
                          {sku.qtdDevolvida > 0 ? (
                            <span className="bg-rose-950/60 text-rose-300 border border-rose-900/40 px-2 py-0.5 rounded text-[10px] font-bold">
                              {sku.qtdDevolvida} un ({sku.taxaDevolucao.toFixed(0)}%)
                            </span>
                          ) : (
                            <span className="text-slate-600 font-mono">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-amber-400 font-mono">
                          R$ {sku.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`py-3 px-4 text-right font-black font-mono ${sku.lucroTotal < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          R$ {sku.lucroTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-300 font-mono font-bold">
                          {sku.pctRepresentatividade.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FRAGMENTAÇÃO POR PEDIDO COM IDENTIFICAÇÃO DE DEVOLUÇÕES */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <h3 className="font-bold text-white text-sm">Fragmentação por Pedido (Auditoria de Margem Real)</h3>
              <p className="text-[11px] text-slate-400">Verificação de repasse, CMV, taxas flex e retenção de devolução por pedido</p>
            </div>

            <div className="flex flex-wrap gap-3 w-full sm:w-auto">
              <select
                value={filtroDevolucao}
                onChange={(e) => setFiltroDevolucao(e.target.value)}
                className="p-2 bg-slate-950 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
              >
                <option value="TODOS">Todos os Pedidos</option>
                <option value="COM_DEVOLUCAO">Somente com Devolução</option>
                <option value="SEM_CMV">Alerta: Sem CMV (Custo 0)</option>
              </select>

              <input
                type="text"
                placeholder="Buscar ID Pedido..."
                value={searchOrderId}
                onChange={(e) => setSearchOrderId(e.target.value)}
                className="p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white outline-none w-44"
              />

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="p-2 bg-slate-950 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
              >
                <option value="DEFAULT">Ordem Original</option>
                <option value="MAIOR_LIQUIDEZ">Maior Lucro Líquido</option>
                <option value="MENOR_LIQUIDEZ">Maior Prejuízo</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">ID Pedido</th>
                  <th className="py-3 px-3">Canal</th>
                  <th className="py-3 px-3 min-w-[180px]">SKUs (Qtd)</th>
                  <th className="py-3 px-3 text-right">Venda Bruta</th>
                  <th className="py-3 px-3 text-right">Repasse Líquido</th>
                  <th className="py-3 px-3 text-right">CMV</th>
                  <th className="py-3 px-3 text-right text-rose-400">Flex</th>
                  <th className="py-3 px-3 text-right text-rose-300">Devolução</th>
                  <th className="py-3 px-3 text-right text-emerald-400 font-extrabold">Ganho Real</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono font-medium">
                {paginatedOrders.map((s: any, i: number) => (
                  <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${s.teveDevolucao ? "bg-rose-950/10" : ""}`}>
                    <td className="py-2.5 px-3 text-slate-400 font-sans">
                      {s.data_faturamento ? s.data_faturamento.split("-").reverse().join("/") : "-"}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-indigo-400">{s.id_pedido}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">{s.canal}</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-300 truncate max-w-[220px]" title={s.sku_display}>
                      {s.sku_display}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      R$ {(s.preco_venda || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-indigo-300 font-bold">
                      R$ {(s.repasse_liquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`py-2.5 px-3 text-right ${!s.custoCMV || s.custoCMV === 0 ? "text-rose-400 font-bold bg-rose-950/20" : "text-amber-400"}`}>
                      - R$ {(s.custoCMV || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-400">
                      - R$ {(s.custoFlex || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-300 font-bold">
                      {s.valorDevolucao > 0 ? `- R$ ${s.valorDevolucao.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-black ${s.ganhoLiquido < 0 ? "text-rose-500" : "text-emerald-400"}`}>
                      R$ {(s.ganhoLiquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {paginatedOrders.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-slate-500 font-bold font-sans">Nenhum pedido encontrado para este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPagesOrders > 1 && (
            <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs">
              <span className="text-slate-400 font-bold">
                Página {currentPageOrders} de {totalPagesOrders} ({displayOrders.length} pedidos)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPageOrders((p) => Math.max(1, p - 1))}
                  disabled={currentPageOrders === 1}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-700 hover:bg-slate-800 rounded-lg text-slate-300 disabled:opacity-30 font-bold cursor-pointer"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentPageOrders((p) => Math.min(totalPagesOrders, p + 1))}
                  disabled={currentPageOrders === totalPagesOrders}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-700 hover:bg-slate-800 rounded-lg text-slate-300 disabled:opacity-30 font-bold cursor-pointer"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}