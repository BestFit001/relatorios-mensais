"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "./components/Navbar";
import { avaliarFormulaPorUnidade } from "../lib/formulaRepasse";
import { diasDoPeriodo } from "../lib/cobertura";
import CoberturaEstoque from "./components/CoberturaEstoque";
import { padraoDePreco } from "@/lib/padraoPreco";
import ConfigCobertura from "./components/ConfigCobertura";

// Função para equiparar SKUs com formatos diferentes entre canais, custos e devoluções
function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

// Mesma regra do dashboard para casar o ID do pedido entre vendas, faturados, Flex e cancelados
function normalizarPedido(v: any): string {
  return String(v ?? "").trim().replace(/\.0$/, "").replace(/\s+/g, "").toLowerCase();
}

function normalizarTexto(v: any): string {
  return String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function num(v: any): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function paraIso(v: any): string {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

const brl = (n: number) => (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Lojas físicas (clubes) não têm SKU de marketplace: ficam fora da Curva ABC
function ehFisico(canal: any): boolean {
  const nome = normalizarTexto(canal);
  return nome.includes("clube") || nome.includes("loja") || nome.includes("paineiras") || nome.includes("hebraica");
}

// Marcas escritas de formas diferentes ("Best Fit", "BESTFIT", "FARM", "Farm") viram uma só
function chaveMarca(m: any): string {
  return normalizarTexto(m).replace(/[^a-z0-9]/g, "");
}

async function fetchTodos(tabela: string, select: string, erros: string[]): Promise<any[]> {
  let todos: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase.from(tabela).select(select).order("id").range(from, from + step - 1);
    if (error) { erros.push(`${tabela}: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    todos = todos.concat(data);
    from += step;
    if (data.length < step) break;
  }
  return todos;
}

type Intervalo = [number, number];
function calcularPeriodo(dateFilter: string, ini: string, fim: string, mesRef: string): { curr: Intervalo | null; prev: Intervalo | null } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fimDoDia = hoje.getTime() + DIA_MS - 1;
  const janela = (dias: number) => {
    const s = hoje.getTime() - (dias - 1) * DIA_MS;
    return { curr: [s, fimDoDia] as Intervalo, prev: [s - dias * DIA_MS, s - 1] as Intervalo };
  };
  if (dateFilter === "HOJE") return janela(1);
  if (dateFilter === "SEMANA") return janela(7);
  if (dateFilter === "QUINZENA") return janela(15);
  if (dateFilter === "MES") return janela(30);
  if (dateFilter === "MES_REF" && /^\d{4}-\d{2}$/.test(mesRef)) {
    const [a, m] = mesRef.split("-").map(Number);
    const s = new Date(a, m - 1, 1).getTime();
    const e = new Date(a, m, 1).getTime() - 1;
    const ps = new Date(a, m - 2, 1).getTime();
    return { curr: [s, e], prev: [ps, s - 1] };
  }
  if (dateFilter === "PERSONALIZADO" && ini && fim) {
    const s = new Date(ini + "T00:00:00").getTime();
    const e = new Date(fim + "T23:59:59").getTime();
    const dur = e - s + 1;
    return { curr: [s, e], prev: [s - dur, s - 1] };
  }
  return { curr: null, prev: null };   // TUDO (ou personalizado incompleto)
}

const noIntervalo = (t: number, iv: Intervalo | null) => !iv || (t >= iv[0] && t <= iv[1]);

export default function CurvaABCPage() {
  const [loading, setLoading] = useState(true);
  const [erros, setErros] = useState<string[]>([]);

  // Dados brutos do Supabase
  const [vendas, setVendas] = useState<any[]>([]);
  const [faturados, setFaturados] = useState<any[]>([]);
  const [custosLista, setCustosLista] = useState<any[]>([]);
  const [devolucoes, setDevolucoes] = useState<any[]>([]);
  const [cancelados, setCancelados] = useState<any[]>([]);
  const [plp, setPlp] = useState<any[]>([]);
  const [tarifasSite, setTarifasSite] = useState<any[]>([]);
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);

  // Filtros
  const [dateFilter, setDateFilter] = useState("MES");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [mesRef, setMesRef] = useState("");
  const [searchSku, setSearchSku] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("TODAS");
  const [selectedChannel, setSelectedChannel] = useState("TODOS");

  // Visões novas
  const [visao, setVisao] = useState<"SKU" | "MARCA">("SKU");
  const [ordenarPor, setOrdenarPor] = useState<"FAT" | "QTD" | "TICKET" | "LUCRO">("FAT");
  const [topVisao, setTopVisao] = useState<"PRODUTOS" | "MARCAS">("PRODUTOS");
  const [topMetrica, setTopMetrica] = useState<"QTD" | "FAT">("QTD");
  const [granularidade, setGranularidade] = useState<"DIA" | "SEMANA" | "MES">("DIA");

  // Filtros da tabela de pedidos
  const [searchOrderId, setSearchOrderId] = useState("");
  const [sortOrder, setSortOrder] = useState("DEFAULT");
  const [filtroDevolucao, setFiltroDevolucao] = useState("TODOS");
  const [currentPageOrders, setCurrentPageOrders] = useState(1);
  const itemsPerPageOrders = 20;

  // Sub-abas da Curva ABC + colunas que somem em "Ocultar informações" (valem para todos os usuários)
  const [subAba, setSubAba] = useState<"analise" | "cobertura" | "config">("analise");
  // Mês dos retornos de compras: o mês fechado escolhido; nos demais períodos, o mês corrente
  const mesAtual = (() => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`; })();
  const [colunasOcultas, setColunasOcultas] = useState<string[]>([]);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [erroConfig, setErroConfig] = useState("");

  useEffect(() => {
    carregarDadosBase();
    (async () => {
      const { data, error } = await supabase.from("curva_cobertura_config").select("colunas_ocultas").eq("id", 1).maybeSingle();
      if (error) setErroConfig("Não consegui ler a configuração: " + error.message);
      else if (Array.isArray(data?.colunas_ocultas)) setColunasOcultas(data!.colunas_ocultas.map(String));
    })();
  }, []);

  const alterarColunasOcultas = async (novas: string[]) => {
    const anteriores = colunasOcultas;
    setColunasOcultas(novas); setSalvandoConfig(true); setErroConfig("");
    let email = "";
    try { email = String(JSON.parse(localStorage.getItem("usuario_logado") || "{}").email || ""); } catch { /* sem usuário */ }
    const { error } = await supabase.from("curva_cobertura_config")
      .upsert({ id: 1, colunas_ocultas: novas, atualizado_por: email || null, atualizado_em: new Date().toISOString() }, { onConflict: "id" });
    setSalvandoConfig(false);
    if (error) { setColunasOcultas(anteriores); setErroConfig("Não consegui salvar: " + error.message); }
  };

  useEffect(() => {
    setCurrentPageOrders(1);
  }, [searchOrderId, sortOrder, filtroDevolucao, dateFilter, customStartDate, customEndDate, mesRef, selectedChannel, selectedBrand, searchSku]);

  const carregarDadosBase = async () => {
    setLoading(true);
    const e: string[] = [];
    try {
      const [v, f, c, d, k, p, t, rc] = await Promise.all([
        fetchTodos("vendas_canais", "id, id_pedido, sku, canal, produto, preco_venda, repasse_liquido, quantidade", e),
        fetchTodos("faturados", "id, id_pedido, data_faturamento", e),
        fetchTodos("tabela_custos_skus", "id, sku, marca, produto, custo_unitario", e),
        fetchTodos("devolucoes", "id, pedido, canal, sku, pdv, quantidade, data_retorno", e),
        fetchTodos("cancelados", "id, canal, id_pedido, sku, quantidade, valor", e),
        fetchTodos("plp_pedidos", "id, numero_pedido, valor_frete", e),
        fetchTodos("tarifas_site", "id, id_pedido, valor_tarifa", e),
        fetchTodos("config_regras_canais", "id, canal, col_pdv, col_quantidade, formula_excel", e),
      ]);
      setVendas(v); setFaturados(f); setCustosLista(c); setDevolucoes(d); setCancelados(k); setPlp(p); setTarifasSite(t); setRegrasCanais(rc);
    } catch (err: any) {
      e.push(String(err?.message || err));
    } finally {
      setErros(e);
      setLoading(false);
    }
  };

  // SKU -> custo, marca e título; marcas equivalentes são unificadas
  const custosMap = useMemo(() => {
    const rotuloPorChave: Record<string, string> = {};
    const bruto = custosLista.map((c) => {
      const marca = String(c.marca || "SEM MARCA").trim().toUpperCase().replace(/\s+/g, " ");
      const ch = chaveMarca(marca);
      // entre "BESTFIT" e "BEST FIT" fica o escrito com espaço
      if (!rotuloPorChave[ch] || (marca.includes(" ") && !rotuloPorChave[ch].includes(" "))) rotuloPorChave[ch] = marca;
      return { c, ch };
    });
    const map: Record<string, { custo: number; marca: string; titulo: string; skuOriginal: string }> = {};
    bruto.forEach(({ c, ch }) => {
      const k = normalizarSku(c.sku);
      if (k) map[k] = { custo: num(c.custo_unitario), marca: rotuloPorChave[ch], titulo: c.produto || "Produto não identificado", skuOriginal: String(c.sku ?? "").trim() };
    });
    return map;
  }, [custosLista]);

  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    Object.values(custosMap).forEach((item) => { if (item.marca) brands.add(item.marca); });
    return ["TODAS", ...Array.from(brands).sort((a, b) => a.localeCompare(b))];
  }, [custosMap]);

  const canaisDisponiveis = useMemo(
    () => Array.from(new Set(vendas.map((v) => v.canal).filter(Boolean))).filter((c: any) => !ehFisico(c)).sort() as string[],
    [vendas]
  );

  // Linhas de venda prontas: data vem dos faturados, Flex/tarifa do Site rateados por pedido, cancelados marcados
  const { linhasBase, semFaturamento, chavesVendas } = useMemo(() => {
    const dataPorPedido = new Map<string, string>();
    faturados.forEach((f) => {
      const k = normalizarPedido(f.id_pedido);
      const d = paraIso(f.data_faturamento);
      if (k && d && !dataPorPedido.has(k)) dataPorPedido.set(k, d);
    });
    const flex = new Map<string, number>();
    plp.forEach((p) => { const k = normalizarPedido(p.numero_pedido); const val = num(p.valor_frete); if (k && val > 0) flex.set(k, val); });
    const tarifa = new Map<string, number>();
    tarifasSite.forEach((t) => { const k = normalizarPedido(t.id_pedido); if (k) tarifa.set(k, num(t.valor_tarifa)); });
    const canc = new Set<string>();
    cancelados.forEach((c) => { const k = normalizarPedido(c.id_pedido); if (k) canc.add(`${normalizarTexto(c.canal)}|${k}`); });

    // Amazon: vendas antigas ainda com sufixo F / -F / -FBA casam com o SKU da base (mesma regra do upload)
    const resolverSku = (canal: any, norm: string): string => {
      if (!norm || custosMap[norm] || !normalizarTexto(canal).includes("amazon")) return norm;
      if (norm.endsWith("fba") && custosMap[norm.slice(0, -3)]) return norm.slice(0, -3);
      if (norm.endsWith("f") && custosMap[norm.slice(0, -1)]) return norm.slice(0, -1);
      return norm;
    };

    const regraDoCanal = (canal: any) => {
      const n = normalizarTexto(canal);
      return regrasCanais.find((r) => normalizarTexto(r.canal) === n)
        || (n.includes("magalu") || n.includes("magazine") ? regrasCanais.find((r) => normalizarTexto(r.canal).includes("magalu")) : undefined);
    };

    const linhas: any[] = [];
    const chaves = new Set<string>();
    let sem = 0;
    vendas.forEach((s) => {
      if (ehFisico(s.canal)) return;
      const pedN = normalizarPedido(s.id_pedido);
      const chave = `${normalizarTexto(s.canal)}|${pedN}`;
      chaves.add(chave);
      const data = dataPorPedido.get(pedN);
      if (!data) { sem++; return; }
      const skuNorm = resolverSku(s.canal, normalizarSku(s.sku));
      const qtdLinha = num(s.quantidade) || 1;
      const precoLinha = num(s.preco_venda);
      // Mesmo repasse do Dashboard: fórmula do canal (aba Regras) calculada por unidade; senão o repasse gravado no upload
      let repasseLinha = num(s.repasse_liquido);
      const regra = regraDoCanal(s.canal);
      if (regra?.formula_excel && String(regra.formula_excel).trim()) {
        const calc = avaliarFormulaPorUnidade(String(regra.formula_excel), precoLinha, qtdLinha, regra.col_pdv || "P", regra.col_quantidade || "O");
        if (calc !== null) repasseLinha = calc;
      }
      if (isNaN(repasseLinha) || repasseLinha <= 0 || (precoLinha > 0 && repasseLinha > precoLinha * qtdLinha * 1.5)) {
        repasseLinha = Math.max(0, precoLinha - precoLinha * 0.16);
      }
      linhas.push({
        ped: s.id_pedido, pedN, chave, canal: s.canal, sku: custosMap[skuNorm]?.skuOriginal || s.sku, skuNorm,
        qtd: qtdLinha, preco: precoLinha, repasse: repasseLinha,
        data, t: new Date(data + "T00:00:00").getTime(), cancelado: canc.has(chave), extra: 0,
      });
    });

    // Frete Flex (e tarifa Vindi no Site) é do pedido: divide entre os itens na proporção do valor
    const porPedido = new Map<string, any[]>();
    linhas.forEach((l) => porPedido.set(l.chave, [...(porPedido.get(l.chave) || []), l]));
    porPedido.forEach((itens) => {
      const pedN = itens[0].pedN;
      const total = (flex.get(pedN) || 0) + (normalizarTexto(itens[0].canal).includes("site") ? tarifa.get(pedN) || 0 : 0);
      if (total <= 0) return;
      const soma = itens.reduce((a, i) => a + i.preco, 0);
      itens.forEach((i) => { i.extra = total * (soma > 0 ? i.preco / soma : 1 / itens.length); });
    });
    return { linhasBase: linhas, semFaturamento: sem, chavesVendas: chaves };
  }, [vendas, faturados, plp, tarifasSite, cancelados, custosMap, regrasCanais]);

  // ----- Análise principal (respeita canal, período, marca e pesquisa) -----
  const analise = useMemo(() => {
    const per = calcularPeriodo(dateFilter, customStartDate, customEndDate, mesRef);
    const canalOk = (l: any) => selectedChannel === "TODOS" || l.canal === selectedChannel;

    const atual: any[] = [], anterior: any[] = [], canceladas: any[] = [];
    linhasBase.forEach((l) => {
      if (!canalOk(l)) return;
      if (noIntervalo(l.t, per.curr)) (l.cancelado ? canceladas : atual).push(l);
      else if (per.prev && noIntervalo(l.t, per.prev) && !l.cancelado) anterior.push(l);
    });

    // Devoluções do mesmo canal e período (data do retorno)
    const devolucoesDe = (iv: Intervalo | null) => {
      const porSku: Record<string, { qtd: number; valor: number }> = {};
      devolucoes.forEach((d) => {
        if (selectedChannel !== "TODOS" && normalizarTexto(d.canal) !== normalizarTexto(selectedChannel)) return;
        const dt = paraIso(d.data_retorno);
        if (iv && dt && !noIntervalo(new Date(dt + "T00:00:00").getTime(), iv)) return;
        const k = normalizarSku(d.sku);
        if (!k) return;
        if (!porSku[k]) porSku[k] = { qtd: 0, valor: 0 };
        porSku[k].qtd += num(d.quantidade) || 1;
        porSku[k].valor += num(d.pdv);
      });
      return porSku;
    };
    const devAtual = devolucoesDe(per.curr);
    const devAnterior = per.prev ? devolucoesDe(per.prev) : {};

    const agrupar = (linhas: any[]) => {
      const m: Record<string, any> = {};
      linhas.forEach((l) => {
        if (!m[l.skuNorm]) m[l.skuNorm] = { skuNorm: l.skuNorm, rawSku: l.sku, qtd: 0, revenue: 0, repasse: 0, extra: 0, pedidos: new Set<string>() };
        const s = m[l.skuNorm];
        s.qtd += l.qtd; s.revenue += l.preco; s.repasse += l.repasse; s.extra += l.extra; s.pedidos.add(l.chave);
      });
      return m;
    };

    // Preço praticado por canal+SKU: vendas fora do padrão (carrinho) saem do cálculo de margem da Cobertura de Estoque
    const porCanalSku = new Map<string, any[]>();
    atual.forEach((l) => { const k = `${normalizarTexto(l.canal)}|${l.skuNorm}`; (porCanalSku.get(k) || porCanalSku.set(k, []).get(k)!).push(l); });
    const padraoPorSku: Record<string, { qtdK: number; receitaK: number; repasseK: number; extraK: number; fora: { vendas: number; unidades: number; valor: number }; precos: { preco: number; unidades: number }[] }> = {};
    porCanalSku.forEach((ls) => {
      const sk = ls[0].skuNorm;
      const p = padraoPorSku[sk] || (padraoPorSku[sk] = { qtdK: 0, receitaK: 0, repasseK: 0, extraK: 0, fora: { vendas: 0, unidades: 0, valor: 0 }, precos: [] });
      const r = padraoDePreco(ls.map((l) => ({ preco: l.preco, qtd: l.qtd })));
      ls.forEach((l, i) => { if (r.manter[i]) { p.qtdK += l.qtd; p.receitaK += l.preco; p.repasseK += l.repasse; p.extraK += l.extra; } });
      p.fora.vendas += r.descartadas; p.fora.unidades += r.unidadesDescartadas; p.fora.valor += r.valorDescartado;
      r.precosPraticados.forEach((x) => p.precos.push({ preco: x.preco, unidades: x.unidades }));
    });

    // Curva ABC calculada sobre todo o período/canal (a letra não muda com marca ou pesquisa)
    const skuStats = agrupar(atual);
    const totalPeriodo = Object.values(skuStats).reduce((a: number, s: any) => a + s.revenue, 0);
    const todos = Object.values(skuStats).map((s: any) => {
      const info = custosMap[s.skuNorm] || { custo: 0, marca: "SEM MARCA", titulo: "Produto não cadastrado" };
      const dev = devAtual[s.skuNorm] || { qtd: 0, valor: 0 };
      const cmvTotal = info.custo * s.qtd;
      const pedidos = s.pedidos.size;
      return {
        ...s, sku: s.rawSku, titulo: info.titulo, marca: info.marca, custoUnitario: info.custo, cmvTotal,
        pedidosQtd: pedidos,
        ticketUn: s.qtd > 0 ? s.revenue / s.qtd : 0,
        ticketPedido: pedidos > 0 ? s.revenue / pedidos : 0,
        lucroTotal: s.repasse - cmvTotal - s.extra - dev.valor,
        ...(() => {
          const pd = padraoPorSku[s.skuNorm];
          const devK = s.qtd > 0 ? dev.valor * (pd.qtdK / s.qtd) : 0;
          return {
            lucroPadrao: pd.repasseK - info.custo * pd.qtdK - pd.extraK - devK, receitaPadrao: pd.receitaK, qtdPadrao: pd.qtdK,
            foraPadrao: pd.fora, precosPraticados: pd.precos.sort((a, b) => b.unidades - a.unidades).slice(0, 4),
          };
        })(),
        qtdDevolvida: dev.qtd, valorDevolvido: dev.valor,
        taxaDevolucao: s.qtd > 0 ? (dev.qtd / s.qtd) * 100 : 0,
        pctRepresentatividade: totalPeriodo > 0 ? (s.revenue / totalPeriodo) * 100 : 0,
        semCusto: !custosMap[s.skuNorm] || custosMap[s.skuNorm].custo <= 0,
      } as any;
    });
    todos.sort((a: any, b: any) => b.revenue - a.revenue);
    let acumulado = 0;
    todos.forEach((s: any) => {
      const antes = totalPeriodo > 0 ? (acumulado / totalPeriodo) * 100 : 0;   // o item que cruza 80% ainda é A
      acumulado += s.revenue;
      s.pctAcumulada = totalPeriodo > 0 ? (acumulado / totalPeriodo) * 100 : 0;
      s.curva = antes < 80 ? "A" : antes < 95 ? "B" : "C";
    });

    // Dias do período para a média diária da Cobertura de Estoque (mês em andamento conta só até hoje)
    let primeiraVenda: number | undefined, ultimaVenda: number | undefined;
    atual.forEach((l) => {
      if (primeiraVenda === undefined || l.t < primeiraVenda) primeiraVenda = l.t;
      if (ultimaVenda === undefined || l.t > ultimaVenda) ultimaVenda = l.t;
    });
    const diasPeriodo = diasDoPeriodo(per.curr, Date.now(), primeiraVenda, ultimaVenda);

    const termo = searchSku.trim().toLowerCase();
    const passa = (skuNorm: string, sku: any, titulo: string, marca: string) => {
      if (termo && !(String(sku).toLowerCase().includes(termo) || skuNorm.includes(termo) || titulo.toLowerCase().includes(termo))) return false;
      if (selectedBrand !== "TODAS" && marca !== selectedBrand) return false;
      return true;
    };
    const skus = todos.filter((s: any) => passa(s.skuNorm, s.sku, s.titulo, s.marca));
    // Cobertura de Estoque tem a própria pesquisa: recebe os SKUs do período/canal/marca, sem a busca do topo
    const skusCobertura = todos.filter((s: any) => selectedBrand === "TODAS" || s.marca === selectedBrand);
    const skuVisivel = new Set(skus.map((s: any) => s.skuNorm));
    const linhasFiltradas = atual.filter((l) => skuVisivel.has(l.skuNorm));

    // KPIs
    let fat = 0, luc = 0, dev = 0, qtd = 0;
    skus.forEach((s: any) => { fat += s.revenue; luc += s.lucroTotal; dev += s.valorDevolvido; qtd += s.qtd; });
    const pedidosSet = new Set(linhasFiltradas.map((l) => l.chave));

    // Período anterior para comparativo
    const prevStats = agrupar(anterior);
    let prevFat = 0, prevLuc = 0;
    Object.values(prevStats).forEach((s: any) => {
      const info = custosMap[s.skuNorm] || { custo: 0, marca: "SEM MARCA", titulo: "" };
      if (!passa(s.skuNorm, s.rawSku, info.titulo, info.marca)) return;
      prevFat += s.revenue;
      prevLuc += s.repasse - info.custo * s.qtd - s.extra - (devAnterior[s.skuNorm]?.valor || 0);
    });

    // Marcas (a partir dos SKUs filtrados)
    const marcas: Record<string, any> = {};
    skus.forEach((s: any) => {
      if (!marcas[s.marca]) marcas[s.marca] = { marca: s.marca, revenue: 0, lucro: 0, qtd: 0, devolucoes: 0, skus: 0, pedidos: new Set<string>() };
      const b = marcas[s.marca];
      b.revenue += s.revenue; b.lucro += s.lucroTotal; b.qtd += s.qtd; b.devolucoes += s.valorDevolvido; b.skus += 1;
    });
    linhasFiltradas.forEach((l) => {
      const b = marcas[(custosMap[l.skuNorm] || { marca: "SEM MARCA" }).marca];
      if (b) b.pedidos.add(l.chave);
    });
    const brandStats = Object.values(marcas).map((b: any) => ({
      ...b, pedidosQtd: b.pedidos.size,
      ticketUn: b.qtd > 0 ? b.revenue / b.qtd : 0,
      ticketPedido: b.pedidos.size > 0 ? b.revenue / b.pedidos.size : 0,
      pct: fat > 0 ? (b.revenue / fat) * 100 : 0,
    })).sort((a: any, b: any) => b.revenue - a.revenue);
    let acB = 0;
    brandStats.forEach((b: any) => { const antes = fat > 0 ? (acB / fat) * 100 : 0; acB += b.revenue; b.curva = antes < 80 ? "A" : antes < 95 ? "B" : "C"; });

    // Cancelados abatidos (somente os que casam com vendas do período/canal)
    const pedidosCanc = new Set(canceladas.map((l) => l.chave));
    const canceladosResumo = {
      pedidos: pedidosCanc.size,
      valor: canceladas.reduce((a, l) => a + l.preco, 0),
      qtd: canceladas.reduce((a, l) => a + l.qtd, 0),
    };
    const canceladosSemVenda = cancelados.filter((c) => {
      if (selectedChannel !== "TODOS" && normalizarTexto(c.canal) !== normalizarTexto(selectedChannel)) return false;
      return !chavesVendas.has(`${normalizarTexto(c.canal)}|${normalizarPedido(c.id_pedido)}`);
    }).length;

    // Devolução por pedido (para a tabela de pedidos)
    const devPorPedido: Record<string, number> = {};
    devolucoes.forEach((d) => { const k = normalizarPedido(d.pedido); if (k) devPorPedido[k] = (devPorPedido[k] || 0) + num(d.pdv); });

    return {
      atual, canceladas, linhasFiltradas, skus, skusCobertura, brandStats, devPorPedido, diasPeriodo,
      kpis: {
        faturamentoTotal: fat, lucroTotal: luc, devolucoesTotal: dev, unidades: qtd, pedidos: pedidosSet.size,
        ticketPedido: pedidosSet.size > 0 ? fat / pedidosSet.size : 0,
        ticketUn: qtd > 0 ? fat / qtd : 0,
        hasPrev: !!per.prev && anterior.length > 0,
        diffFat: prevFat > 0 ? ((fat - prevFat) / prevFat) * 100 : 0,
        diffLuc: prevLuc !== 0 ? ((luc - prevLuc) / Math.abs(prevLuc)) * 100 : 0,
        countA: skus.filter((s: any) => s.curva === "A").length,
        countB: skus.filter((s: any) => s.curva === "B").length,
        countC: skus.filter((s: any) => s.curva === "C").length,
        taxaDevolucaoGeral: fat > 0 ? (dev / fat) * 100 : 0,
        cancelados: canceladosResumo, canceladosSemVenda,
      },
    };
  }, [linhasBase, chavesVendas, custosMap, devolucoes, cancelados, dateFilter, customStartDate, customEndDate, mesRef, searchSku, selectedBrand, selectedChannel]);

  const { skus, skusCobertura, brandStats, kpis, linhasFiltradas, diasPeriodo } = analise;

  // ----- Tabela principal: ordenação por Faturamento / Quantidade / Ticket / Lucro -----
  const skusOrdenados = useMemo(() => {
    const campo = ordenarPor === "FAT" ? "revenue" : ordenarPor === "QTD" ? "qtd" : ordenarPor === "TICKET" ? "ticketUn" : "lucroTotal";
    return [...skus].sort((a: any, b: any) => b[campo] - a[campo]);
  }, [skus, ordenarPor]);
  const marcasOrdenadas = useMemo(() => {
    const campo = ordenarPor === "FAT" ? "revenue" : ordenarPor === "QTD" ? "qtd" : ordenarPor === "TICKET" ? "ticketUn" : "lucro";
    return [...brandStats].sort((a: any, b: any) => b[campo] - a[campo]);
  }, [brandStats, ordenarPor]);

  // ----- Mais vendidos (produtos e marcas) -----
  const topLista = useMemo(() => {
    const fonte: any[] = topVisao === "PRODUTOS"
      ? skus.map((s: any) => ({ nome: s.sku, sub: s.titulo, marca: s.marca, qtd: s.qtd, fat: s.revenue }))
      : brandStats.map((b: any) => ({ nome: b.marca, sub: `${b.skus} SKU(s)`, marca: "", qtd: b.qtd, fat: b.revenue }));
    const campo = topMetrica === "QTD" ? "qtd" : "fat";
    const ordenado = [...fonte].sort((a, b) => b[campo] - a[campo]).slice(0, 10);
    const max = ordenado[0]?.[campo] || 1;
    return ordenado.map((x) => ({ ...x, valor: x[campo], pct: (x[campo] / max) * 100 }));
  }, [skus, brandStats, topVisao, topMetrica]);

  // ----- Quando mais vendeu: dia / semana / mês e dia da semana -----
  const serieTempo = useMemo(() => {
    const m: Record<string, { chave: string; rotulo: string; revenue: number; qtd: number; pedidos: Set<string> }> = {};
    linhasFiltradas.forEach((l: any) => {
      const d = new Date(l.data + "T00:00:00");
      let chave = l.data, rotulo = `${l.data.slice(8, 10)}/${l.data.slice(5, 7)}`;
      if (granularidade === "SEMANA") {
        const seg = new Date(d); seg.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const iso = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, "0")}-${String(seg.getDate()).padStart(2, "0")}`;
        chave = iso; rotulo = `sem. ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
      } else if (granularidade === "MES") {
        chave = l.data.slice(0, 7); rotulo = `${l.data.slice(5, 7)}/${l.data.slice(0, 4)}`;
      }
      if (!m[chave]) m[chave] = { chave, rotulo, revenue: 0, qtd: 0, pedidos: new Set<string>() };
      m[chave].revenue += l.preco; m[chave].qtd += l.qtd; m[chave].pedidos.add(l.chave);
    });
    const lista = Object.values(m).sort((a, b) => a.chave.localeCompare(b.chave));
    const max = Math.max(1, ...lista.map((x) => x.revenue));
    let melhor = lista[0];
    lista.forEach((x) => { if (x.revenue > (melhor?.revenue ?? -1)) melhor = x; });
    let melhorQtd = lista[0];
    lista.forEach((x) => { if (x.qtd > (melhorQtd?.qtd ?? -1)) melhorQtd = x; });

    // dia da semana: média de faturamento por data com venda
    const sem: Record<number, { rev: number; datas: Set<string> }> = {};
    linhasFiltradas.forEach((l: any) => {
      const dow = new Date(l.data + "T00:00:00").getDay();
      if (!sem[dow]) sem[dow] = { rev: 0, datas: new Set<string>() };
      sem[dow].rev += l.preco; sem[dow].datas.add(l.data);
    });
    const dias = DIAS_SEMANA.map((nome, i) => ({ nome, media: sem[i] ? sem[i].rev / sem[i].datas.size : 0, total: sem[i]?.rev || 0 }));
    const melhorDia = dias.reduce((a, b) => (b.media > a.media ? b : a), dias[0]);
    return { lista, max, melhor, melhorQtd, dias, melhorDia };
  }, [linhasFiltradas, granularidade]);

  // ----- Valor que mais vendeu: faixas de preço unitário -----
  const faixas = useMemo(() => {
    const defs = [
      { nome: "Até R$ 50", min: 0, max: 50 }, { nome: "R$ 50 a 100", min: 50, max: 100 }, { nome: "R$ 100 a 150", min: 100, max: 150 },
      { nome: "R$ 150 a 200", min: 150, max: 200 }, { nome: "R$ 200 a 300", min: 200, max: 300 }, { nome: "R$ 300 a 500", min: 300, max: 500 },
      { nome: "Acima de R$ 500", min: 500, max: Infinity },
    ].map((f) => ({ ...f, qtd: 0, revenue: 0 }));
    const exato: Record<number, { preco: number; qtd: number; revenue: number }> = {};
    linhasFiltradas.forEach((l: any) => {
      const un = l.preco / (l.qtd || 1);
      const f = defs.find((x) => un >= x.min && un < x.max);
      if (f) { f.qtd += l.qtd; f.revenue += l.preco; }
      const arred = Math.round(un);
      if (!exato[arred]) exato[arred] = { preco: arred, qtd: 0, revenue: 0 };
      exato[arred].qtd += l.qtd; exato[arred].revenue += l.preco;
    });
    const maxQtd = Math.max(1, ...defs.map((f) => f.qtd));
    const melhorQtd = defs.reduce((a, b) => (b.qtd > a.qtd ? b : a), defs[0]);
    const melhorFat = defs.reduce((a, b) => (b.revenue > a.revenue ? b : a), defs[0]);
    const comuns = Object.values(exato).sort((a, b) => b.qtd - a.qtd).slice(0, 5);
    return { defs, maxQtd, melhorQtd, melhorFat, comuns };
  }, [linhasFiltradas]);

  // ----- Pedidos (auditoria) -----
  const enrichedOrders = useMemo(() => {
    const orderMap: Record<string, any> = {};
    [...analise.atual, ...analise.canceladas].forEach((l: any) => {
      const info = custosMap[l.skuNorm] || { custo: 0 };
      if (!orderMap[l.chave]) {
        orderMap[l.chave] = { id_pedido: l.ped, canal: l.canal, data_faturamento: l.data, cancelado: l.cancelado, custoCMV: 0, repasse_liquido: 0, preco_venda: 0, custoFlex: 0, valorDevolucao: analise.devPorPedido[l.pedN] || 0, skus_concat: [] as string[] };
      }
      const o = orderMap[l.chave];
      o.custoCMV += info.custo * l.qtd;
      o.preco_venda += l.preco;
      o.repasse_liquido += l.repasse;
      o.custoFlex += l.extra;
      o.skus_concat.push(`${l.sku} (x${l.qtd})`);
    });
    return Object.values(orderMap).map((o: any) => ({
      ...o,
      sku_display: o.skus_concat.join(" + "),
      ganhoLiquido: o.cancelado ? 0 : o.repasse_liquido - o.custoCMV - o.custoFlex - o.valorDevolucao,
      teveDevolucao: o.valorDevolucao > 0,
    }));
  }, [analise, custosMap]);

  const displayOrders = useMemo(() => {
    let result = enrichedOrders;
    if (filtroDevolucao === "CANCELADOS") result = result.filter((o) => o.cancelado);
    else result = result.filter((o) => !o.cancelado);
    if (filtroDevolucao === "COM_DEVOLUCAO") result = result.filter((o) => o.teveDevolucao);
    else if (filtroDevolucao === "SEM_CMV") result = result.filter((o) => !o.custoCMV || o.custoCMV === 0);
    if (searchOrderId.trim()) result = result.filter((s) => s.id_pedido && String(s.id_pedido).includes(searchOrderId.trim()));
    if (sortOrder === "MAIOR_LIQUIDEZ") result = [...result].sort((a, b) => b.ganhoLiquido - a.ganhoLiquido);
    else if (sortOrder === "MENOR_LIQUIDEZ") result = [...result].sort((a, b) => a.ganhoLiquido - b.ganhoLiquido);
    return result;
  }, [enrichedOrders, searchOrderId, sortOrder, filtroDevolucao]);

  const totalPagesOrders = Math.ceil(displayOrders.length / itemsPerPageOrders) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPageOrders - 1) * itemsPerPageOrders;
    return displayOrders.slice(start, start + itemsPerPageOrders);
  }, [displayOrders, currentPageOrders]);

  const corCurva = (c: string) =>
    c === "A" ? "bg-indigo-950 text-indigo-400 border border-indigo-700/50" :
    c === "B" ? "bg-emerald-950 text-emerald-400 border border-emerald-700/50" :
    "bg-slate-800 text-slate-400 border border-slate-700";

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
            <p className="text-xs text-slate-400">Classificação de SKUs e marcas por faturamento, ticket médio, margem real líquida, cancelados e devoluções</p>
          </div>
          <Navbar />
        </div>

        {erros.length > 0 && (
          <div className="bg-rose-950/40 border border-rose-800/60 text-rose-200 rounded-xl p-4 text-xs space-y-1" data-erros-carga>
            <p className="font-black">⚠️ Parte dos dados não pôde ser lida do banco — os números abaixo podem estar incompletos:</p>
            {erros.map((e, i) => <p key={i} className="font-mono">• {e}</p>)}
          </div>
        )}

        {/* SUB-ABAS */}
        <div className="flex flex-wrap gap-2 bg-slate-900/90 p-2 rounded-2xl border border-slate-800 w-fit" data-subabas>
          {([["analise", "📊 Análise"], ["cobertura", "📦 Cobertura de Estoque"], ["config", "⚙️ Configurações"]] as const).map(([id, nome]) => (
            <button key={id} type="button" onClick={() => setSubAba(id)} data-subaba={id} aria-pressed={subAba === id}
              className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer ${subAba === id ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>
              {nome}
            </button>
          ))}
        </div>

        {/* BARRA DE FILTROS */}
        {subAba !== "config" && (
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-slate-900/90 p-5 rounded-2xl border border-slate-800 gap-4 shadow-xl">
          <div className="flex flex-wrap gap-3 items-center w-full">
            {subAba !== "cobertura" && (
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
            )}

            <div className="flex gap-2 items-center bg-slate-950 p-2 rounded-xl border border-slate-800 w-full sm:w-auto">
              <span className="text-sky-400 text-xs">🏪</span>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="bg-transparent text-sky-300 font-bold text-xs outline-none cursor-pointer"
                data-filtro-canal
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
                data-filtro-periodo
              >
                <option value="TUDO" className="bg-slate-900 text-white">Todo o Histórico</option>
                <option value="HOJE" className="bg-slate-900 text-white">Hoje</option>
                <option value="SEMANA" className="bg-slate-900 text-white">Últimos 7 dias</option>
                <option value="QUINZENA" className="bg-slate-900 text-white">Últimos 15 dias</option>
                <option value="MES" className="bg-slate-900 text-white">Últimos 30 dias</option>
                <option value="MES_REF" className="bg-slate-900 text-white">Mês fechado…</option>
                <option value="PERSONALIZADO" className="bg-slate-900 text-white">Personalizado</option>
              </select>
            </div>

            {dateFilter === "MES_REF" && (
              <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                <input
                  type="month"
                  value={mesRef}
                  onChange={(e) => setMesRef(e.target.value)}
                  className="bg-transparent text-slate-300 font-bold text-xs outline-none cursor-pointer"
                  data-mes-ref
                />
              </div>
            )}

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
        )}

        {subAba === "cobertura" && (
          <CoberturaEstoque
            linhas={skusCobertura.map((s: any) => ({
              sku: String(s.sku ?? ""), skuNorm: s.skuNorm, titulo: s.titulo, marca: s.marca,
              qtd: s.qtd, revenue: s.revenue, pctRepresentatividade: s.pctRepresentatividade, pctAcumulada: s.pctAcumulada, curva: s.curva,
              lucro: s.lucroTotal, semCusto: !!s.semCusto,
              lucroPadrao: s.lucroPadrao, receitaPadrao: s.receitaPadrao, qtdPadrao: s.qtdPadrao, foraPadrao: s.foraPadrao, precosPraticados: s.precosPraticados,
            }))}
            dias={diasPeriodo}
            periodo={dateFilter === "MES_REF" && mesRef ? mesRef : dateFilter === "PERSONALIZADO" ? `${customStartDate || "?"} a ${customEndDate || "?"}` : ({ HOJE: "hoje", SEMANA: "últimos 7 dias", QUINZENA: "últimos 15 dias", MES: "últimos 30 dias", TUDO: "todo o histórico" } as Record<string, string>)[dateFilter] || dateFilter}
            mes={dateFilter === "MES_REF" && /^\d{4}-\d{2}$/.test(mesRef) ? mesRef : dateFilter === "PERSONALIZADO" && /^\d{4}-\d{2}/.test(customEndDate) ? customEndDate.slice(0, 7) : mesAtual}
            colunasOcultas={colunasOcultas}
            onIrParaConfig={() => setSubAba("config")}
          />
        )}

        {subAba === "config" && (
          <ConfigCobertura colunasOcultas={colunasOcultas} onAlterar={alterarColunasOcultas} salvando={salvandoConfig} erro={erroConfig} />
        )}

        {subAba === "analise" && (<>
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
            <h3 className="text-2xl font-black text-white" data-kpi-faturamento>R$ {brl(kpis.faturamentoTotal)}</h3>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800">
              <p className="text-[11px] text-emerald-400 font-bold">Lucro Real: R$ {brl(kpis.lucroTotal)}</p>
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
            <h3 className="text-2xl font-black text-rose-400 mt-1">- R$ {brl(kpis.devolucoesTotal)}</h3>
            <p className="text-[10px] text-slate-500 mt-1">Dedução direta no lucro operacional dos produtos</p>
          </div>
        </div>

        {/* TICKET MÉDIO, PEDIDOS E CANCELADOS ABATIDOS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Pedidos / Unidades</span>
            <h3 className="text-xl font-black text-white mt-1" data-kpi-pedidos>{kpis.pedidos} <span className="text-slate-500 text-sm">pedidos</span></h3>
            <p className="text-[10px] text-slate-500 mt-1">{kpis.unidades} unidades vendidas</p>
          </div>
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-sky-500/30 shadow-xl">
            <span className="text-[10px] font-bold text-sky-400 uppercase">Ticket médio por pedido</span>
            <h3 className="text-xl font-black text-sky-300 mt-1" data-kpi-ticket-pedido>R$ {brl(kpis.ticketPedido)}</h3>
            <p className="text-[10px] text-slate-500 mt-1">Faturamento ÷ pedidos</p>
          </div>
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-sky-500/30 shadow-xl">
            <span className="text-[10px] font-bold text-sky-400 uppercase">Ticket médio por unidade</span>
            <h3 className="text-xl font-black text-sky-300 mt-1" data-kpi-ticket-un>R$ {brl(kpis.ticketUn)}</h3>
            <p className="text-[10px] text-slate-500 mt-1">Faturamento ÷ unidades</p>
          </div>
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-amber-500/30 shadow-xl" data-kpi-cancelados>
            <span className="text-[10px] font-bold text-amber-400 uppercase">Cancelados abatidos</span>
            <h3 className="text-xl font-black text-amber-300 mt-1">- R$ {brl(kpis.cancelados.valor)}</h3>
            <p className="text-[10px] text-slate-500 mt-1">
              {kpis.cancelados.pedidos} pedido(s) · {kpis.cancelados.qtd} un. fora da curva
              {kpis.canceladosSemVenda > 0 && <span className="text-slate-600"> · {kpis.canceladosSemVenda} cancelado(s) sem venda correspondente</span>}
            </p>
          </div>
        </div>

        {/* GRID COM FATURAMENTO POR MARCA E TABELA DA CURVA ABC */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl">
            <h3 className="font-bold text-white text-sm mb-4">🏆 Faturamento por Marca</h3>
            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
              {brandStats.map((brand: any, i: number) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-slate-300 truncate max-w-[50%]">{brand.marca}</span>
                    <div className="text-right">
                      <span className="block text-xs font-black text-white">R$ {brl(brand.revenue)}</span>
                      <span className="block text-[10px] text-emerald-400 font-bold">Lucro: R$ {brl(brand.lucro)}</span>
                      <span className="block text-[10px] text-sky-400 font-bold">Ticket: R$ {brl(brand.ticketUn)}/un · R$ {brl(brand.ticketPedido)}/pedido</span>
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
            <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-white text-sm">Classificação Detalhada</h3>
                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  <button type="button" onClick={() => setVisao("SKU")} data-visao-sku
                    className={`px-3 py-1 rounded-md text-[11px] font-bold cursor-pointer ${visao === "SKU" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Produtos (SKU)</button>
                  <button type="button" onClick={() => setVisao("MARCA")} data-visao-marca
                    className={`px-3 py-1 rounded-md text-[11px] font-bold cursor-pointer ${visao === "MARCA" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Marcas</button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value as any)} data-ordenar
                  className="p-1.5 bg-slate-950 border border-slate-700 text-slate-200 rounded-lg text-[11px] font-bold outline-none cursor-pointer">
                  <option value="FAT">Ordenar: Faturamento</option>
                  <option value="QTD">Ordenar: Mais vendidos (qtd)</option>
                  <option value="TICKET">Ordenar: Ticket médio</option>
                  <option value="LUCRO">Ordenar: Lucro</option>
                </select>
                <span className="text-[11px] text-slate-400 font-mono">{visao === "SKU" ? skus.length : brandStats.length} itens</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[520px]">
              {visao === "SKU" ? (
                <table className="w-full text-left text-xs whitespace-nowrap" data-tabela-sku>
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 uppercase text-[9px] font-bold z-10">
                    <tr>
                      <th className="py-3 px-4 text-center">Curva</th>
                      <th className="py-3 px-4">SKU / Marca</th>
                      <th className="py-3 px-4 min-w-[200px]">Título do Produto</th>
                      <th className="py-3 px-4 text-center">Qtd Vend.</th>
                      <th className="py-3 px-4 text-center">Pedidos</th>
                      <th className="py-3 px-4 text-right text-sky-400">Ticket/un</th>
                      <th className="py-3 px-4 text-right text-sky-400">Ticket/pedido</th>
                      <th className="py-3 px-4 text-center text-rose-400">Devoluções</th>
                      <th className="py-3 px-4 text-right">Fat. Bruto</th>
                      <th className="py-3 px-4 text-right text-emerald-400">Lucro Líquido</th>
                      <th className="py-3 px-4 text-right">Part. (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {loading ? (
                      <tr><td colSpan={11} className="p-8 text-center text-slate-400">Carregando dados da Curva ABC...</td></tr>
                    ) : skusOrdenados.length === 0 ? (
                      <tr><td colSpan={11} className="p-8 text-center text-slate-500">Nenhum SKU encontrado com os filtros selecionados.</td></tr>
                    ) : (
                      skusOrdenados.map((sku: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-black text-xs ${corCurva(sku.curva)}`}>{sku.curva}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="block font-mono font-bold text-white">{sku.sku}</span>
                            <span className="block text-[9px] uppercase text-indigo-400 font-bold mt-0.5">{sku.marca}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 max-w-[220px] truncate" title={sku.titulo}>
                            {sku.titulo}
                            {sku.semCusto && <span className="ml-2 text-[9px] font-black text-yellow-300 bg-yellow-400/10 border border-yellow-500/30 rounded px-1">sem custo</span>}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-200">{sku.qtd}</td>
                          <td className="py-3 px-4 text-center text-slate-300">{sku.pedidosQtd}</td>
                          <td className="py-3 px-4 text-right font-mono text-sky-300">R$ {brl(sku.ticketUn)}</td>
                          <td className="py-3 px-4 text-right font-mono text-sky-300">R$ {brl(sku.ticketPedido)}</td>
                          <td className="py-3 px-4 text-center">
                            {sku.qtdDevolvida > 0 ? (
                              <span className="bg-rose-950/60 text-rose-300 border border-rose-900/40 px-2 py-0.5 rounded text-[10px] font-bold">
                                {sku.qtdDevolvida} un ({sku.taxaDevolucao.toFixed(0)}%)
                              </span>
                            ) : (
                              <span className="text-slate-600 font-mono">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-amber-400 font-mono">R$ {brl(sku.revenue)}</td>
                          <td className={`py-3 px-4 text-right font-black font-mono ${sku.lucroTotal < 0 ? "text-rose-400" : "text-emerald-400"}`}>R$ {brl(sku.lucroTotal)}</td>
                          <td className="py-3 px-4 text-right text-slate-300 font-mono font-bold">{sku.pctRepresentatividade.toFixed(2)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-xs whitespace-nowrap" data-tabela-marca>
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 uppercase text-[9px] font-bold z-10">
                    <tr>
                      <th className="py-3 px-4 text-center">Curva</th>
                      <th className="py-3 px-4">Marca</th>
                      <th className="py-3 px-4 text-center">SKUs</th>
                      <th className="py-3 px-4 text-center">Qtd Vend.</th>
                      <th className="py-3 px-4 text-center">Pedidos</th>
                      <th className="py-3 px-4 text-right text-sky-400">Ticket/un</th>
                      <th className="py-3 px-4 text-right text-sky-400">Ticket/pedido</th>
                      <th className="py-3 px-4 text-right">Fat. Bruto</th>
                      <th className="py-3 px-4 text-right text-emerald-400">Lucro Líquido</th>
                      <th className="py-3 px-4 text-right">Part. (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {marcasOrdenadas.length === 0 ? (
                      <tr><td colSpan={10} className="p-8 text-center text-slate-500">Nenhuma marca encontrada com os filtros selecionados.</td></tr>
                    ) : marcasOrdenadas.map((b: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 text-center"><span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-black text-xs ${corCurva(b.curva)}`}>{b.curva}</span></td>
                        <td className="py-3 px-4 font-bold text-white">{b.marca}</td>
                        <td className="py-3 px-4 text-center text-slate-300">{b.skus}</td>
                        <td className="py-3 px-4 text-center font-bold text-slate-200">{b.qtd}</td>
                        <td className="py-3 px-4 text-center text-slate-300">{b.pedidosQtd}</td>
                        <td className="py-3 px-4 text-right font-mono text-sky-300">R$ {brl(b.ticketUn)}</td>
                        <td className="py-3 px-4 text-right font-mono text-sky-300">R$ {brl(b.ticketPedido)}</td>
                        <td className="py-3 px-4 text-right font-black text-amber-400 font-mono">R$ {brl(b.revenue)}</td>
                        <td className={`py-3 px-4 text-right font-black font-mono ${b.lucro < 0 ? "text-rose-400" : "text-emerald-400"}`}>R$ {brl(b.lucro)}</td>
                        <td className="py-3 px-4 text-right text-slate-300 font-mono font-bold">{b.pct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* MAIS VENDIDOS + QUANDO MAIS VENDEU + FAIXAS DE PREÇO */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-card-top>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-white text-sm">🔥 Mais vendidos</h3>
              <div className="flex gap-2">
                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  <button type="button" onClick={() => setTopVisao("PRODUTOS")} className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer ${topVisao === "PRODUTOS" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Produtos</button>
                  <button type="button" onClick={() => setTopVisao("MARCAS")} className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer ${topVisao === "MARCAS" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Marcas</button>
                </div>
                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  <button type="button" onClick={() => setTopMetrica("QTD")} className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer ${topMetrica === "QTD" ? "bg-emerald-600 text-white" : "text-slate-400"}`}>Unidades</button>
                  <button type="button" onClick={() => setTopMetrica("FAT")} className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer ${topMetrica === "FAT" ? "bg-emerald-600 text-white" : "text-slate-400"}`}>R$</button>
                </div>
              </div>
            </div>
            <ol className="space-y-3">
              {topLista.map((x: any, i: number) => (
                <li key={i} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[11px] font-black text-slate-500 mr-1.5">{i + 1}º</span>
                      <span className="text-xs font-bold text-white font-mono">{x.nome}</span>
                      <span className="block text-[10px] text-slate-500 truncate max-w-[230px]" title={x.sub}>{x.sub}{x.marca ? ` · ${x.marca}` : ""}</span>
                    </div>
                    <span className="text-xs font-black text-emerald-300 whitespace-nowrap">
                      {topMetrica === "QTD" ? `${x.valor} un.` : `R$ ${brl(x.valor)}`}
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 border border-slate-800">
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 rounded-full" style={{ width: `${x.pct}%` }} />
                  </div>
                </li>
              ))}
              {topLista.length === 0 && <p className="text-xs text-slate-500 text-center py-6">Sem vendas para os filtros selecionados.</p>}
            </ol>
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-card-periodo>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-white text-sm">📅 Quando mais vendeu</h3>
              <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                {(["DIA", "SEMANA", "MES"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGranularidade(g)} data-gran={g}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer ${granularidade === g ? "bg-indigo-600 text-white" : "text-slate-400"}`}>
                    {g === "DIA" ? "Dia" : g === "SEMANA" ? "Semana" : "Mês"}
                  </button>
                ))}
              </div>
            </div>
            {serieTempo.lista.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Sem vendas para os filtros selecionados.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-2.5" data-melhor-periodo>
                    <span className="block text-[9px] font-bold text-amber-400 uppercase">Maior faturamento</span>
                    <span className="block font-black text-white">{serieTempo.melhor.rotulo}</span>
                    <span className="block text-amber-300 font-bold">R$ {brl(serieTempo.melhor.revenue)} · {serieTempo.melhor.qtd} un.</span>
                  </div>
                  <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-2.5">
                    <span className="block text-[9px] font-bold text-emerald-400 uppercase">Mais unidades</span>
                    <span className="block font-black text-white">{serieTempo.melhorQtd.rotulo}</span>
                    <span className="block text-emerald-300 font-bold">{serieTempo.melhorQtd.qtd} un. · R$ {brl(serieTempo.melhorQtd.revenue)}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="flex items-end gap-1 h-40 min-w-full" style={{ width: Math.max(serieTempo.lista.length * 26, 280) }}>
                    {serieTempo.lista.map((p) => (
                      <div key={p.chave} className="flex-1 min-w-[20px] flex flex-col items-center justify-end h-full" title={`${p.rotulo}: R$ ${brl(p.revenue)} · ${p.qtd} un. · ${p.pedidos.size} pedidos`}>
                        <div className={`w-full rounded-t ${p.chave === serieTempo.melhor.chave ? "bg-amber-400" : "bg-indigo-500/80"}`} style={{ height: `${Math.max((p.revenue / serieTempo.max) * 100, 2)}%` }} />
                        <span className="text-[8px] text-slate-500 mt-1 whitespace-nowrap -rotate-45 origin-top-left translate-x-1">{p.rotulo}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-800" data-melhor-dia-semana>
                  Dia da semana que mais vende (média por dia com venda): <strong className="text-white">{serieTempo.melhorDia.nome}</strong> · R$ {brl(serieTempo.melhorDia.media)}
                </p>
              </>
            )}
          </div>

          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-card-faixas>
            <h3 className="font-bold text-white text-sm">💰 Valor que mais vendeu (preço unitário)</h3>
            {kpis.unidades === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Sem vendas para os filtros selecionados.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-2.5" data-faixa-qtd>
                    <span className="block text-[9px] font-bold text-emerald-400 uppercase">Faixa com mais unidades</span>
                    <span className="block font-black text-white">{faixas.melhorQtd.nome}</span>
                    <span className="block text-emerald-300 font-bold">{faixas.melhorQtd.qtd} un.</span>
                  </div>
                  <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-2.5">
                    <span className="block text-[9px] font-bold text-amber-400 uppercase">Faixa com mais faturamento</span>
                    <span className="block font-black text-white">{faixas.melhorFat.nome}</span>
                    <span className="block text-amber-300 font-bold">R$ {brl(faixas.melhorFat.revenue)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {faixas.defs.map((f) => (
                    <div key={f.nome} className="space-y-0.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-300 font-bold">{f.nome}</span>
                        <span className="text-slate-400">{f.qtd} un. · R$ {brl(f.revenue)}</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-1.5 border border-slate-800">
                        <div className={`h-1.5 rounded-full ${f.nome === faixas.melhorQtd.nome ? "bg-emerald-400" : "bg-sky-500/70"}`} style={{ width: `${(f.qtd / faixas.maxQtd) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-slate-800">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Preços mais frequentes (arredondado ao real)</p>
                  <div className="flex flex-wrap gap-1.5" data-precos-comuns>
                    {faixas.comuns.map((c) => (
                      <span key={c.preco} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200">
                        <strong className="text-white">R$ {c.preco}</strong> · {c.qtd} un.
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* FRAGMENTAÇÃO POR PEDIDO COM IDENTIFICAÇÃO DE DEVOLUÇÕES E CANCELADOS */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <h3 className="font-bold text-white text-sm">Fragmentação por Pedido (Auditoria de Margem Real)</h3>
              <p className="text-[11px] text-slate-400">Verificação de repasse, CMV, taxas flex e retenção de devolução por pedido. Cancelados ficam fora da curva e aparecem no filtro próprio.</p>
            </div>

            <div className="flex flex-wrap gap-3 w-full sm:w-auto">
              <select
                value={filtroDevolucao}
                onChange={(e) => setFiltroDevolucao(e.target.value)}
                className="p-2 bg-slate-950 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                data-filtro-pedidos
              >
                <option value="TODOS">Todos os Pedidos</option>
                <option value="COM_DEVOLUCAO">Somente com Devolução</option>
                <option value="SEM_CMV">Alerta: Sem CMV (Custo 0)</option>
                <option value="CANCELADOS">Somente Cancelados (abatidos)</option>
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
                  <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${s.cancelado ? "bg-amber-950/10" : s.teveDevolucao ? "bg-rose-950/10" : ""}`}>
                    <td className="py-2.5 px-3 text-slate-400 font-sans">
                      {s.data_faturamento ? s.data_faturamento.split("-").reverse().join("/") : "-"}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-indigo-400">{s.id_pedido}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">{s.canal}</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-300 truncate max-w-[220px]" title={s.sku_display}>{s.sku_display}</td>
                    <td className="py-2.5 px-3 text-right text-slate-200">R$ {brl(s.preco_venda)}</td>
                    <td className="py-2.5 px-3 text-right text-indigo-300 font-bold">R$ {brl(s.repasse_liquido)}</td>
                    <td className={`py-2.5 px-3 text-right ${!s.custoCMV || s.custoCMV === 0 ? "text-rose-400 font-bold bg-rose-950/20" : "text-amber-400"}`}>- R$ {brl(s.custoCMV)}</td>
                    <td className="py-2.5 px-3 text-right text-rose-400">- R$ {brl(s.custoFlex)}</td>
                    <td className="py-2.5 px-3 text-right text-rose-300 font-bold">{s.valorDevolucao > 0 ? `- R$ ${brl(s.valorDevolucao)}` : "-"}</td>
                    <td className={`py-2.5 px-3 text-right font-black ${s.cancelado ? "text-amber-400" : s.ganhoLiquido < 0 ? "text-rose-500" : "text-emerald-400"}`}>
                      {s.cancelado ? "CANCELADO" : `R$ ${brl(s.ganhoLiquido)}`}
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
        </>)}

        {semFaturamento > 0 && (
          <p className="text-[10px] text-slate-600 text-center">
            {semFaturamento} linha(s) de venda sem data de faturamento (pedido ainda não consta nos faturados) ficaram de fora, como no dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
