"use client";
import { useState, ChangeEvent, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { useRouter } from "next/navigation";
import { lerArquivoComoMatriz, lerArquivoComoLinhas } from "../../lib/lerArquivo";
import { removerSufixoFba } from "../../lib/fulfillment";

async function fetchTodosRegistros(tabela: string, select: string = '*', eqCampo?: string, eqValor?: any) {
  let todos: any[] = [];
  let from = 0;
  const step = 1000;
  let continuar = true;
  
  while (continuar) {
    let query = supabase.from(tabela).select(select).range(from, from + step - 1);
    if (eqCampo && eqValor !== undefined) {
      query = query.eq(eqCampo, eqValor);
    }
    
    const { data, error } = await query;
    if (error || !data) break;
    todos = [...todos, ...data];
    from += step;
    if (data.length < step) continuar = false;
  }
  return todos;
}

function letraParaIndice(letra: string): number {
  if (!letra) return -1;
  let l = letra.trim().toUpperCase();
  if (!l || !/^[A-Z]+$/.test(l)) return -1;
  let num = 0;
  for (let i = 0; i < l.length; i++) {
    num = num * 26 + (l.charCodeAt(i) - 64);
  }
  return Math.max(0, num - 1);
}

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function normalizarIdPedido(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .trim()
    .replace(/\.0$/, "")
    .replace(/^['"]/, "")
    .replace(/['"]$/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

// Data em qualquer formato comum (dd/mm/aaaa [hh:mm], aaaa-mm-dd, número serial do Excel) -> "aaaa-mm-dd" ("" se não reconhecer)
function paraDataIso(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

// Célula "com valor": ignora vazio, "-", "0", "0,00", "R$ 0,00"
function celulaTemValor(v: any): boolean {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return !/^[\s0.,\-R$]+$/i.test(s);
}

function textoSemAcento(v: any): string {
  return String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Regras de leitura por canal que não ficam na tela de Regras: status (cancelado), nota fiscal e data do pedido.
type CfgImportCanal = { colStatus: string; textoCancelado: string; colNF: string; colData: string };
function cfgImportPadrao(canal: string): CfgImportCanal {
  // O Site (Wake) tem layout fixo: Situação = AL, Nota Fiscal = AU, Data = C
  if (normalizarCanal(canal).includes("site")) return { colStatus: "AL", textoCancelado: "cancel", colNF: "AU", colData: "C" };
  return { colStatus: "", textoCancelado: "cancel", colNF: "", colData: "" };
}

function normalizarCanal(canal: any): string {
  return String(canal ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Clubes (Hebraica, Paineiras e qualquer outro "Clube ...") vendem em loja física: não têm ID de pedido nem SKU de marketplace
// e nunca entram na aba de vendas pendentes nem nas planilhas auxiliares.
function ehCanalClube(canal: any): boolean {
  const n = normalizarCanal(canal);
  return n.includes("clube") || n.includes("hebraica") || n.includes("paineiras");
}

function ehCanalAmazon(canal: any): boolean {
  return normalizarCanal(canal).includes("amazon");
}

// SKU já normalizado (sem hífen) que termina em "f" ou "fba": é o "-F"/"-FBA" da Amazon colado ao código (ex.: 18181042001f)
function skuTerminaEmF(skuNorm: string): boolean {
  return /(f|fba)$/.test(skuNorm);
}

// SKU da Amazon sem o sufixo de FBA: "18181042001-F", "18181042001-FBA" e "18181042001F" viram "18181042001".
// Um SKU que já existe exatamente assim na base de custos é preservado.
function limparSkuAmazon(valor: any, skusBase?: Set<string>): string {
  const original = normalizarSku(valor);
  if (!original) return "";
  const semHifen = normalizarSku(removerSufixoFba(String(valor ?? "")));
  if (skusBase && skusBase.has(original) && semHifen === original) return original;
  if (skusBase && skusBase.has(semHifen)) return semHifen;
  return semHifen.replace(/(\d)(fba|f)$/, "$1");
}

function parseSmartFloat(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    if (val >= 44000 && val <= 49000 && Number.isInteger(Math.floor(val))) return 0;
    return val;
  }

  let strVal = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(strVal) || /^\d{2}\/\d{2}\/\d{4}/.test(strVal)) return 0;

  strVal = strVal.replace(/[^\d.,-]/g, '');
  if (!strVal) return 0;

  const hasComma = strVal.includes(',');
  const hasDot = strVal.includes('.');

  if (hasComma && hasDot) {
    if (strVal.lastIndexOf(',') > strVal.lastIndexOf('.')) {
      strVal = strVal.replace(/\./g, '').replace(',', '.');
    } else {
      strVal = strVal.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    strVal = strVal.replace(/\./g, '').replace(',', '.');
  } else if (hasDot && !hasComma) {
    const parts = strVal.split('.');
    if (parts.length > 2) {
      strVal = strVal.replace(/\./g, '');
    }
  }

  const num = parseFloat(strVal);
  if (isNaN(num)) return 0;
  if (num >= 44000 && num <= 49000 && Number.isInteger(Math.floor(num))) return 0;
  if (num > 500000) return 0;

  return num;
}

// AVALIADOR UNIVERSAL: SUPORTA CONDICIONAIS (EX: Q >= 79 ? 21.95 : 0)
function avaliarExpressaoOuColuna(expr: string, row: any[], variaveis?: { PDV?: number; QTD?: number }): number {
  if (!expr || !expr.trim()) return 0;
  const s = expr.trim();

  if (/^[A-Za-z]{1,3}$/.test(s)) {
    const idx = letraParaIndice(s);
    if (idx >= 0 && row[idx] !== undefined) {
      return parseSmartFloat(row[idx]);
    }
    return 0;
  }

  try {
    let exp = s;

    if (variaveis) {
      if (variaveis.PDV !== undefined) exp = exp.replace(/\bPDV\b/gi, String(variaveis.PDV));
      if (variaveis.QTD !== undefined) {
        exp = exp.replace(/\bQTD\b/gi, String(variaveis.QTD));
        exp = exp.replace(/\bQUANTIDADE\b/gi, String(variaveis.QTD));
      }
    }

    exp = exp.replace(/\b([A-Za-z]{1,2})\d*\b/g, (match, colLetra) => {
      if (/^(true|false|null|undefined)$/i.test(colLetra)) return match;
      const idx = letraParaIndice(colLetra);
      if (idx >= 0 && row[idx] !== undefined) {
        return String(parseSmartFloat(row[idx]));
      }
      return '0';
    });

    exp = exp.replace(/(\d+(\.\d+)?)%/g, '($1 / 100)');

    if (/^[0-9+\-*/().\s><=?:!&|]+$/.test(exp)) {
      const res = Function(`"use strict"; return (${exp})`)();
      if (typeof res === 'number' && !isNaN(res)) {
        return Math.max(0, res);
      }
    }
  } catch (err) {}

  return 0;
}

const MESES_NOMES: Record<string, string> = {
  "01": "janeiro", "02": "fevereiro", "03": "março", "04": "abril",
  "05": "maio", "06": "junho", "07": "julho", "08": "agosto",
  "09": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro"
};

export default function UpdatesPage() {
  const router = useRouter();
  const [abaAtiva, setAbaAtiva] = useState<"relatorios" | "cadastros" | "custos" | "regras_ml" | "vendas_pendentes" | "dashboard_admin">("relatorios");

  const [mes, setMes] = useState("10");
  const [ano, setAno] = useState("2026");
  const [ficheiroABC, setFicheiroABC] = useState("");
  const [ficheiroInventario, setFicheiroInventario] = useState("");
  const [dadosABC, setDadosABC] = useState<any[]>([]);
  const [dadosInvBruto, setDadosInvBruto] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [loadingDownloadCustos, setLoadingDownloadCustos] = useState(false);

  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });
  
  const [contaMlSelecionada, setContaMlSelecionada] = useState<"Mercado Livre 1" | "Mercado Livre 2">("Mercado Livre 1");

  const [colunasPorConta, setColunasPorConta] = useState<{ [key: string]: { ml_mlb: string, ml_sku: string, ml_comissao: string, ml_peso: string, ml_altura: string, ml_largura: string, ml_comprimento: string } }>({
    "Mercado Livre 1": { ml_mlb: 'B', ml_sku: 'E', ml_comissao: 'AA', ml_peso: 'AF', ml_altura: 'AC', ml_largura: 'AD', ml_comprimento: 'AE' },
    "Mercado Livre 2": { ml_mlb: 'B', ml_sku: 'E', ml_comissao: 'AA', ml_peso: 'AF', ml_altura: 'AC', ml_largura: 'AD', ml_comprimento: 'AE' }
  });

  const [regrasColsCusto, setRegrasColsCusto] = useState({
    custo_sku: 'B', custo_produto: 'C', custo_valor: 'E', custo_marca: 'D'
  });

  const [estatisticas, setEstatisticas] = useState({ totalTiny: 0, normais: 0, obsoletos: 0 });

  const [pesquisaCusto, setPesquisaCusto] = useState("");
  const [listaCustosFiltrados, setListaCustosFiltrados] = useState<any[]>([]);
  const [pesquisaMl, setPesquisaMl] = useState("");

  const [vendasPendentes, setVendasPendentes] = useState<any[]>([]);

  // Planilhas auxiliares de SKU (ID do pedido -> SKU): corrigem vendas importadas com o SKU oculto/em branco
  const [auxLinha, setAuxLinha] = useState("2");
  const [auxColPedido, setAuxColPedido] = useState("A");
  const [auxColSku, setAuxColSku] = useState("B");
  const [auxArquivos, setAuxArquivos] = useState<File[]>([]);
  const [auxProcessando, setAuxProcessando] = useState(false);
  const [auxResultado, setAuxResultado] = useState<any | null>(null);
  const [auxCfgPronta, setAuxCfgPronta] = useState(false);
  const [edicoesPendentes, setEdicoesPendentes] = useState<{ [id: number]: string }>({});
  const [selecionadosPendentes, setSelecionadosPendentes] = useState<{ [id: number]: boolean }>({});
  const [skuEmLote, setSkuEmLote] = useState("");
  const [filtroPendentes, setFiltroPendentes] = useState<"todos" | "sem_sku" | "fora_base">("todos");
  // Cadastro rápido de custo (lápis) para SKUs que existem nas vendas mas não na base de custos
  const [cadastroCusto, setCadastroCusto] = useState<{ sku: string; produto: string; marca: string; custo: string } | null>(null);
  const [cadastroSalvando, setCadastroSalvando] = useState(false);

  const [mesUpload, setMesUpload] = useState("10");
  const [anoUpload, setAnoUpload] = useState("2026");
  const mesAlvoDash = `${MESES_NOMES[mesUpload] || "outubro"} de ${anoUpload}`;

  const [canalAlvoDash, setCanalAlvoDash] = useState("Mercado Livre 1");
  const [canaisDashList, setCanaisDashList] = useState<string[]>([
    "Mercado Livre 1", "Mercado Livre 2", "Amazon", "Magalu", "Shopee", "TikTok", "Shein", "Netshoes", "Site", "Clube Hebraica", "Clube Paineiras", "Centauro"
  ]);
  const [colunaIdFaturados, setColunaIdFaturados] = useState("AI");
  const [colunaDataFaturados, setColunaDataFaturados] = useState("D");
  const [colunaIdSite, setColunaIdSite] = useState("A");
  const [colunaTarifaSite, setColunaTarifaSite] = useState("E");

  // Status (cancelado), Nota Fiscal e Data do pedido por canal: ficam salvos junto com as demais colunas
  const [cfgImportPorCanal, setCfgImportPorCanal] = useState<Record<string, CfgImportCanal>>({});
  const cfgImportAtual: CfgImportCanal = { ...cfgImportPadrao(canalAlvoDash), ...(cfgImportPorCanal[canalAlvoDash] || {}) };
  const setCfgImportCampo = (campo: keyof CfgImportCanal, valor: string) =>
    setCfgImportPorCanal((prev) => ({ ...prev, [canalAlvoDash]: { ...cfgImportPadrao(canalAlvoDash), ...(prev[canalAlvoDash] || {}), [campo]: valor } }));

  // Colunas/linhas definidas nesta tela ficam salvas (neste navegador) e voltam sozinhas no próximo acesso
  const [uploadCfgPronta, setUploadCfgPronta] = useState(false);
  const cfgSalvaRef = useRef<any>(null);
  const baselineUploadCfg = useRef<string>("");
  const jaSalvouUploadCfg = useRef(false);

  const mesReferencia = mes && ano ? `${mes}/${ano}` : "";
  const meses = [
    { valor: "01", nome: "Janeiro" }, { valor: "02", nome: "Fevereiro" },
    { valor: "03", nome: "Março" }, { valor: "04", nome: "Abril" },
    { valor: "05", nome: "Maio" }, { valor: "06", nome: "Junho" },
    { valor: "07", nome: "Julho" }, { valor: "08", nome: "Agosto" },
    { valor: "09", nome: "Setembro" }, { valor: "10", nome: "Outubro" },
    { valor: "11", nome: "Novembro" }, { valor: "12", nome: "Dezembro" }
  ];
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 11 }, (_, i) => anoAtual - 1 + i);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    // Restaura as colunas salvas (as que dependem do banco são reaplicadas depois que ele responde)
    try {
      const salva = JSON.parse(localStorage.getItem("upload_cfg_v2") || "null");
      if (salva && typeof salva === "object") {
        cfgSalvaRef.current = salva;
        if (salva.mes) setMes(String(salva.mes));
        if (salva.ano) setAno(String(salva.ano));
        if (salva.mesUpload) setMesUpload(String(salva.mesUpload));
        if (salva.anoUpload) setAnoUpload(String(salva.anoUpload));
        if (salva.canalAlvoDash) setCanalAlvoDash(String(salva.canalAlvoDash));
        if (salva.colunaIdFaturados) setColunaIdFaturados(String(salva.colunaIdFaturados));
        if (salva.colunaDataFaturados) setColunaDataFaturados(String(salva.colunaDataFaturados));
        if (salva.colunaIdSite) setColunaIdSite(String(salva.colunaIdSite));
        if (salva.colunaTarifaSite) setColunaTarifaSite(String(salva.colunaTarifaSite));
        if (salva.contaMlSelecionada) setContaMlSelecionada(salva.contaMlSelecionada);
        if (salva.colunasPorConta) setColunasPorConta((prev) => ({ ...prev, ...salva.colunasPorConta }));
        if (salva.cfgImportPorCanal) setCfgImportPorCanal(salva.cfgImportPorCanal);
      }
    } catch { /* configuração corrompida: usa o padrão */ }
    carregarDadosCadastros().finally(() => {
      const salva = cfgSalvaRef.current;
      if (salva?.regrasTiny) setRegrasTiny((prev) => ({ ...prev, ...salva.regrasTiny }));
      if (salva?.regrasColsCusto) setRegrasColsCusto((prev) => ({ ...prev, ...salva.regrasColsCusto }));
      setUploadCfgPronta(true);
    });
    carregarVendasPendentes();
    try {
      const cfg = JSON.parse(localStorage.getItem("upload_sku_aux_cfg") || "null");
      if (cfg) {
        if (cfg.linha) setAuxLinha(String(cfg.linha));
        if (cfg.colPedido) setAuxColPedido(String(cfg.colPedido));
        if (cfg.colSku) setAuxColSku(String(cfg.colSku));
      }
    } catch { /* configuração corrompida: usa o padrão */ }
    setAuxCfgPronta(true);
  }, []);

  // Linha e colunas da planilha auxiliar ficam salvas
  useEffect(() => {
    if (!auxCfgPronta) return;
    try { localStorage.setItem("upload_sku_aux_cfg", JSON.stringify({ linha: auxLinha, colPedido: auxColPedido, colSku: auxColSku })); } catch { /* ignora */ }
  }, [auxCfgPronta, auxLinha, auxColPedido, auxColSku]);

  // Salva sozinho toda coluna/linha/mês que o usuário alterar (não grava os valores padrão antes de qualquer edição)
  useEffect(() => {
    if (!uploadCfgPronta) return;
    const atual = JSON.stringify({
      mes, ano, mesUpload, anoUpload, canalAlvoDash, colunaIdFaturados, colunaDataFaturados, colunaIdSite, colunaTarifaSite,
      contaMlSelecionada, colunasPorConta, regrasColsCusto, regrasTiny, cfgImportPorCanal,
    });
    if (baselineUploadCfg.current === "") { baselineUploadCfg.current = atual; return; }
    if (atual === baselineUploadCfg.current && !jaSalvouUploadCfg.current) return;
    jaSalvouUploadCfg.current = true;
    try { localStorage.setItem("upload_cfg_v2", atual); } catch { /* ignora */ }
  }, [uploadCfgPronta, mes, ano, mesUpload, anoUpload, canalAlvoDash, colunaIdFaturados, colunaDataFaturados, colunaIdSite, colunaTarifaSite, contaMlSelecionada, colunasPorConta, regrasColsCusto, regrasTiny, cfgImportPorCanal]);

  useEffect(() => {
    pesquisarCustosNoBanco();
  }, [pesquisaCusto]);

  const carregarDadosCadastros = async () => {
    const { data: regras } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regras) setRegrasCanais(regras);

    const { data: tinyConfig } = await supabase.from('config_regras_tiny').select('*');
    if (tinyConfig) {
      const getC = (k: string, d: string) => tinyConfig.find((t: any) => t.campo === k)?.coluna || d;
      setRegrasTiny({ sku: getC('sku', 'C'), estoque: getC('estoque', 'F'), status_sku: getC('status_sku', 'A'), status_valor: getC('status_valor', 'B') });
      setRegrasColsCusto({
        custo_sku: getC('custo_sku', 'B'), custo_produto: getC('custo_produto', 'C'), custo_valor: getC('custo_valor', 'E'), custo_marca: getC('custo_marca', 'D')
      });
    }

    const allTiny = await fetchTodosRegistros('cadastros_base_tiny', 'sku, estoque');
    const statusData = await fetchTodosRegistros('status_skus_catalogo', 'sku, status');
    
    const totalTiny = allTiny.length;
    const mapaStatus = new Map(statusData.map((s: any) => [String(s.sku).trim(), s.status]));

    let normais = 0;
    let obsoletos = 0;
    allTiny.forEach(item => {
      const st = mapaStatus.get(String(item.sku).trim()) || 'Normal';
      if (st === 'Obsoleto') obsoletos++;
      else normais++;
    });

    setEstatisticas({ totalTiny, normais, obsoletos });
  };

  const carregarVendasPendentes = async () => {
    try {
      const vendas = await fetchTodosRegistros('vendas_canais');
      const custos = await fetchTodosRegistros('tabela_custos_skus', 'sku');

      const skusComCusto = new Set(custos.map((c: any) => normalizarSku(c.sku)));

      // Vendas de clubes nunca entram nesta aba
      const pendentes = vendas
        .filter((v: any) => !ehCanalClube(v.canal))
        .map((v: any) => {
          const skuNorm = normalizarSku(v.sku);
          const semSku = !skuNorm || skuNorm === 'semsku';
          return { ...v, __semSku: semSku, __foraBase: !semSku && !skusComCusto.has(skuNorm) };
        })
        .filter((v: any) => v.__semSku || v.__foraBase);

      setVendasPendentes(pendentes);
    } catch (err) {
      console.error("Erro ao carregar vendas pendentes:", err);
    }
  };

  // Itens com SKU preenchido que não existem na base de custos, agrupados por SKU
  const agruparForaDaBase = () => {
    const mapa = new Map<string, { sku: string; produtos: string[]; canais: Set<string>; linhas: number; somaPreco: number }>();
    vendasPendentes.filter((v) => v.__foraBase).forEach((v) => {
      const sku = normalizarSku(v.sku);
      const g = mapa.get(sku) || { sku, produtos: [], canais: new Set<string>(), linhas: 0, somaPreco: 0 };
      const nome = String(v.produto ?? "").trim();
      if (nome && isNaN(Number(nome)) && !g.produtos.includes(nome)) g.produtos.push(nome);
      g.canais.add(String(v.canal || ""));
      g.linhas += 1;
      g.somaPreco += Number(v.preco_venda || v.valor || 0);
      mapa.set(sku, g);
    });
    return Array.from(mapa.values());
  };

  // Baixa a lista de SKUs fora da base já no layout do upload de custos (B=SKU, C=Produto, D=Marca, E=Custo)
  const baixarItensForaDaBase = () => {
    const grupos = agruparForaDaBase();
    if (grupos.length === 0) return alert("Nenhum item fora da base de custos no momento.");
    const linhas = grupos
      .sort((a, b) => b.linhas - a.linhas)
      .map((g, i) => [
        i + 1, g.sku, g.produtos[0] || "", "", "", Array.from(g.canais).join(" / "), g.linhas, Number((g.somaPreco / g.linhas).toFixed(2)),
      ]);
    const ws = XLSX.utils.aoa_to_sheet([
      ["#", "SKU", "PRODUTO", "MARCA", "CUSTO UNITÁRIO", "CANAIS", "LINHAS DE VENDA", "PREÇO MÉDIO"],
      ...linhas,
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fora da base");
    XLSX.writeFile(wb, `itens_fora_da_base_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const abrirCadastroCusto = (item: any) => {
    const nome = String(item.produto ?? "").trim();
    setCadastroCusto({ sku: normalizarSku(item.sku), produto: nome && isNaN(Number(nome)) ? nome : "", marca: "BEST FIT", custo: "" });
  };

  const salvarCadastroCusto = async () => {
    if (!cadastroCusto) return;
    const produto = cadastroCusto.produto.trim();
    const marca = cadastroCusto.marca.trim() || "BEST FIT";
    const custoTxt = cadastroCusto.custo.trim();
    if (!produto) return alert("Informe o nome do produto.");
    if (!custoTxt) return alert("Informe o custo unitário.");
    const custo = parseSmartFloat(custoTxt);
    if (!(custo > 0)) return alert("Informe um custo unitário válido (maior que zero).");

    setCadastroSalvando(true);
    try {
      const { error } = await supabase
        .from("tabela_custos_skus")
        .upsert({ sku: cadastroCusto.sku, produto, marca, custo_unitario: custo }, { onConflict: "sku" });
      if (error) throw error;
      // As vendas desse SKU passam a mostrar o nome cadastrado
      await supabase.from("vendas_canais").update({ produto }).eq("sku", cadastroCusto.sku);
      setCadastroCusto(null);
      await carregarVendasPendentes();
      pesquisarCustosNoBanco();
    } catch (err: any) {
      alert("Erro ao cadastrar o custo: " + err.message);
    }
    setCadastroSalvando(false);
  };

  const salvarSkuPendente = async (id: number, skuInput?: string) => {
    const novoSku = (skuInput !== undefined ? skuInput : edicoesPendentes[id] || "").trim();
    if (!novoSku) {
      if (skuInput === undefined) alert("Digite um SKU válido.");
      return;
    }

    setLoading(true);
    try {
      const skuNorm = normalizarSku(novoSku);
      const { data: custoMatch } = await supabase
        .from('tabela_custos_skus')
        .select('sku, produto')
        .eq('sku', skuNorm)
        .maybeSingle();

      const produtoNome = custoMatch?.produto ? custoMatch.produto : "Produto Cadastrado";

      const { error } = await supabase
        .from('vendas_canais')
        .update({ sku: skuNorm, produto: produtoNome })
        .eq('id', id);

      if (error) throw error;

      setVendasPendentes(prev => prev.filter(item => item.id !== id));
      setEdicoesPendentes(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });

      if (skuInput === undefined) {
        alert("✅ SKU atualizado e validado com sucesso!");
      }
    } catch (err: any) {
      if (skuInput === undefined) alert("Erro ao atualizar SKU: " + err.message);
    }
    setLoading(false);
  };

  // Lê as planilhas auxiliares (2 colunas: ID do pedido e SKU) e grava o SKU nas vendas que estão SEM SKU.
  // Vendas que já têm SKU não são alteradas; as demais colunas da planilha são descartadas.
  const aplicarSkusAuxiliares = async () => {
    if (auxArquivos.length === 0) return alert("Escolha ao menos uma planilha auxiliar.");
    const colPed = auxColPedido.trim().toUpperCase();
    const colSku = auxColSku.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(colPed) || !/^[A-Z]+$/.test(colSku)) return alert("Informe as letras das colunas do ID do pedido e do SKU.");
    const inicio = Math.max(0, (parseInt(auxLinha, 10) || 1) - 1);

    setAuxProcessando(true);
    setAuxResultado(null);
    try {
      // 1) Lê todos os arquivos: ID do pedido -> SKUs (na ordem em que aparecem)
      const porPedido = new Map<string, string[]>();
      const porArquivo: { nome: string; lidas: number; ignoradas: number; erro?: string }[] = [];
      for (const arq of auxArquivos) {
        try {
          const matriz = await lerArquivoComoMatriz(arq);
          const doArquivo = new Map<string, string[]>();
          let lidas = 0, ignoradas = 0;
          for (let r = inicio; r < matriz.length; r++) {
            const row = matriz[r];
            if (!row) continue;
            const pedido = normalizarIdPedido(row[colPed]);
            const sku = normalizarSku(removerSufixoFba(String(row[colSku] ?? "")));   // "-F"/"-FBA" (e o que vier depois) não faz parte do SKU
            if (!pedido && !sku) continue;                   // linha vazia
            if (!pedido || !sku || sku === "sku" || sku === "semsku") { ignoradas++; continue; }
            lidas++;
            doArquivo.set(pedido, [...(doArquivo.get(pedido) || []), sku]);
          }
          // Mesma venda em mais de uma planilha: não duplica o item (SKU já visto em outro arquivo é ignorado)
          doArquivo.forEach((skus, pedido) => {
            const atual = porPedido.get(pedido) || [];
            if (atual.length === 0) porPedido.set(pedido, skus);
            else skus.forEach((sk) => { if (!atual.includes(sk)) atual.push(sk); });
          });
          porArquivo.push({ nome: arq.name, lidas, ignoradas });
        } catch (e: any) {
          porArquivo.push({ nome: arq.name, lidas: 0, ignoradas: 0, erro: e.message });
        }
      }

      // 2) Vendas no banco e custos (para informar o nome do produto)
      const vendas = await fetchTodosRegistros("vendas_canais", "id, id_pedido, sku, canal");
      const custos = await fetchTodosRegistros("tabela_custos_skus", "sku, produto");
      const produtoPorSku = new Map<string, string>();
      custos.forEach((c: any) => { const k = normalizarSku(c.sku); if (k && c.produto) produtoPorSku.set(k, c.produto); });

      const existentes = new Set<string>();
      const pendentesPorPedido = new Map<string, any[]>();
      const idsComSufixo = new Set<number>();   // vendas da Amazon cujo SKU terminava em f/-f/-fba e serão substituídas
      vendas.forEach((v: any) => {
        if (ehCanalClube(v.canal)) return;                       // clubes nunca são alterados
        const ped = normalizarIdPedido(v.id_pedido);
        if (!ped) return;
        existentes.add(ped);
        const sk = normalizarSku(v.sku);
        const vazio = !sk || sk === "semsku";
        // Na Amazon, além dos vazios, também troca o SKU que termina em "f"/"fba" (o "-F"/"-FBA" colado), desde que não seja um SKU válido da base
        const comSufixo = !vazio && ehCanalAmazon(v.canal) && skuTerminaEmF(sk) && !produtoPorSku.has(sk);
        if (vazio || comSufixo) {
          if (comSufixo) idsComSufixo.add(v.id);
          pendentesPorPedido.set(ped, [...(pendentesPorPedido.get(ped) || []), v]);
        }
      });

      // 3) Casa pedido a pedido: 1 SKU -> todas as linhas em branco do pedido; vários SKUs -> um por linha, na ordem
      const atualizar = new Map<string, number[]>();          // sku -> ids das vendas
      let pedidosCorrigidos = 0, jaTinhamSku = 0, naoEncontrados = 0, linhasSemSku = 0, vendasCorrigidas = 0, sufixosSubstituidos = 0;
      const exemplosNaoEncontrados: string[] = [];
      porPedido.forEach((skus, pedido) => {
        const linhas = (pendentesPorPedido.get(pedido) || []).slice().sort((a: any, b: any) => Number(a.id) - Number(b.id));
        if (linhas.length === 0) {
          if (existentes.has(pedido)) jaTinhamSku++;
          else { naoEncontrados++; if (exemplosNaoEncontrados.length < 15) exemplosNaoEncontrados.push(pedido); }
          return;
        }
        let algum = false;
        linhas.forEach((linha: any, i: number) => {
          const sku = skus.length === 1 ? skus[0] : skus[i];
          if (!sku) { linhasSemSku++; return; }
          atualizar.set(sku, [...(atualizar.get(sku) || []), linha.id]);
          vendasCorrigidas++; algum = true;
          if (idsComSufixo.has(linha.id)) sufixosSubstituidos++;
        });
        if (algum) pedidosCorrigidos++;
      });

      // 4) Grava (em lotes por SKU)
      const erros: string[] = [];
      let skusForaDaBase = 0;
      for (const [sku, ids] of atualizar) {
        const produto = produtoPorSku.get(sku);
        if (!produto) skusForaDaBase++;
        const campos: any = produto ? { sku, produto } : { sku };
        for (let i = 0; i < ids.length; i += 100) {
          const { error } = await supabase.from("vendas_canais").update(campos).in("id", ids.slice(i, i + 100));
          if (error) { erros.push(`${sku}: ${error.message}`); break; }
        }
      }

      setAuxResultado({
        arquivos: porArquivo, pedidosNaPlanilha: porPedido.size, pedidosCorrigidos, vendasCorrigidas, sufixosSubstituidos, jaTinhamSku,
        naoEncontrados, exemplosNaoEncontrados, linhasSemSku, skusForaDaBase, erros,
      });
      await carregarVendasPendentes();
    } catch (err: any) {
      alert("Erro ao aplicar as planilhas auxiliares: " + err.message);
    }
    setAuxProcessando(false);
  };

  const listaPendentesVisivel = () =>
    vendasPendentes.filter((v) => filtroPendentes === "todos" || (filtroPendentes === "sem_sku" ? v.__semSku : v.__foraBase));

  const selecionarTodosPendentes = (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    const novoMap: { [id: number]: boolean } = {};
    if (checked) {
      listaPendentesVisivel().forEach(item => {
        novoMap[item.id] = true;
      });
    }
    setSelecionadosPendentes(novoMap);
  };

  const salvarSelecionadosEmLote = async () => {
    const idsParaSalvar = Object.keys(selecionadosPendentes).filter(id => selecionadosPendentes[Number(id)]);
    if (idsParaSalvar.length === 0) {
      alert("Nenhum item selecionado.");
      return;
    }
    if (!skuEmLote.trim()) {
      alert("Digite o SKU correto para aplicar aos itens selecionados.");
      return;
    }

    setLoading(true);
    try {
      for (const idStr of idsParaSalvar) {
        await salvarSkuPendente(Number(idStr), skuEmLote);
      }
      alert(`✅ ${idsParaSalvar.length} itens atualizados com sucesso em lote!`);
      setSkuEmLote("");
      setSelecionadosPendentes({});
      carregarVendasPendentes();
    } catch (err: any) {
      alert("Erro ao salvar em lote: " + err.message);
    }
    setLoading(false);
  };

  const atualizarColunaSkuCanal = async (id: number, novaLetraCol: string) => {
    const letraUpper = novaLetraCol.toUpperCase().trim();
    const atualizadas = regrasCanais.map(r => r.id === id ? { ...r, coluna_sku: letraUpper } : r);
    setRegrasCanais(atualizadas);

    try {
      await supabase.from('config_regras_canais').update({ coluna_sku: letraUpper }).eq('id', id);
    } catch (err) {
      console.error("Erro ao atualizar coluna do canal:", err);
    }
  };

  const salvarRegrasMlSupabase = async () => {
    try {
      setLoading(true);
      for (const conta of ["Mercado Livre 1", "Mercado Livre 2"] as const) {
        const c = colunasPorConta[conta];
        await supabase.from('config_regras_canais').upsert({
          canal: conta,
          coluna_mlb: c.ml_mlb,
          coluna_sku: c.ml_sku,
          coluna_comissao: c.ml_comissao,
          coluna_peso: c.ml_peso,
          coluna_altura: c.ml_altura,
          coluna_largura: c.ml_largura,
          coluna_comprimento: c.ml_comprimento,
        }, { onConflict: 'canal' });
      }
      alert("✅ Regras de Mercado Livre salvas com sucesso!");
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    }
    setLoading(false);
  };

  const limparTabelaCustos = async () => {
    if (!confirm("Apagar todos os custos guardados?")) return;
    try {
      await supabase.from('tabela_custos_skus').delete().neq('id', 0);
      setListaCustosFiltrados([]);
      alert("✅ Custos limpos com sucesso.");
    } catch (err: any) {
      alert("Erro ao limpar custos: " + err.message);
    }
  };

  // EXPORTAÇÃO DOS CUSTOS SALVOS NO SUPABASE PARA EXCEL
  const baixarCustosExcel = async () => {
    try {
      setLoadingDownloadCustos(true);
      const custos = await fetchTodosRegistros('tabela_custos_skus', 'sku, produto, custo_unitario, marca');
      
      if (!custos || custos.length === 0) {
        alert("⚠️ Nenhum custo encontrado no banco de dados para exportação.");
        setLoadingDownloadCustos(false);
        return;
      }

      const dadosFormatados = custos.map((c: any) => ({
        "SKU": c.sku || "",
        "PRODUTO": c.produto || "",
        "CUSTO UNITÁRIO": Number(c.custo_unitario) || 0,
        "MARCA": c.marca || ""
      }));

      const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Custos por SKU");

      const dataHoje = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `base_custos_skus_${dataHoje}.xlsx`);
    } catch (err: any) {
      alert("Erro ao baixar custos: " + err.message);
    } finally {
      setLoadingDownloadCustos(false);
    }
  };

  const handleSubirFaturados = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = await lerArquivoComoLinhas(file);   // qualquer formato: xlsx, xls, csv, txt...

        const idxId = letraParaIndice(colunaIdFaturados);
        const idxData = letraParaIndice(colunaDataFaturados);

        const registros = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row) continue;
          const rawObs = idxId >= 0 && row[idxId] !== undefined ? String(row[idxId]).trim() : '';
          
          let pedidoId = null;

          const matchAmazon = rawObs.match(/\b\d{3}-\d{7}-\d{7}\b/);
          const matchMagalu = rawObs.match(/\bLU-[A-Z0-9-]+\b/i);
          const matchML = rawObs.match(/\b20000\d+\b/);
          const matchNum = rawObs.match(/\b\d{10,20}\b/);
          const matchGen = rawObs.match(/\b[A-Z0-9]{8,22}\b/i);

          if (matchAmazon) pedidoId = matchAmazon[0].trim();
          else if (matchMagalu) pedidoId = matchMagalu[0].trim();
          else if (matchML) pedidoId = matchML[0].trim();
          else if (matchNum) pedidoId = matchNum[0].trim();
          else if (matchGen) pedidoId = matchGen[0].trim();

          const dataFaturamento = paraDataIso(row[idxData]);

          if (pedidoId) {
            registros.push({
              id_pedido: normalizarIdPedido(pedidoId),
              data_faturamento: dataFaturamento || new Date().toISOString().slice(0, 10),
              mes_referencia: mesAlvoDash
            });
          }
        }

        if (registros.length > 0) {
          await supabase.from('faturados').delete().eq('mes_referencia', mesAlvoDash);
          for (let i = 0; i < registros.length; i += 500) {
            await supabase.from('faturados').insert(registros.slice(i, i + 500));
          }
        }

        alert(`✅ Faturados salvos na tabela 'faturados' (${mesAlvoDash})!\nTotal: ${registros.length} pedidos identificados.`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao importar Faturados: " + err.message);
        setLoading(false);
      } finally {
        try { (e.target as HTMLInputElement).value = ""; } catch { /* ignora */ }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubirVendasCanal = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = await lerArquivoComoLinhas(file);   // qualquer formato: xlsx, xls, csv, txt...

        const canalNorm = canalAlvoDash.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isFisico = ehCanalClube(canalAlvoDash);
        const isML = canalNorm.includes("mercado livre");
        const isAmazon = canalNorm.includes("amazon");
        const isSite = canalNorm.includes("site");

        // Status (cancelado), Nota Fiscal e Data do pedido configurados para este canal
        const cfgI = cfgImportAtual;
        const idxStatus = letraParaIndice(cfgI.colStatus);
        const idxNF = letraParaIndice(cfgI.colNF);
        const idxDataPed = letraParaIndice(cfgI.colData);
        const textoCancel = textoSemAcento(cfgI.textoCancelado || "cancel");
        const novosFaturados = new Map<string, any>();      // pedidos faturados pela Nota Fiscal da própria planilha (Site)
        const exemplosDescartados: string[] = [];
        let foraDoMesData = 0;
        const hojeIso = new Date().toISOString().slice(0, 10);

        const faturadosBanco = await fetchTodosRegistros('faturados', 'id_pedido', 'mes_referencia', mesAlvoDash);
        
        const idsFaturadosSet = new Set<string>();
        const idsFaturadosSemTracos = new Set<string>();

        faturadosBanco.forEach((f: any) => {
          const idLimpo = normalizarIdPedido(f.id_pedido);
          if (idLimpo) {
            idsFaturadosSet.add(idLimpo);
            idsFaturadosSemTracos.add(idLimpo.replace(/[^A-Z0-9]/g, ''));
          }
        });
        
        if (!isFisico && idsFaturadosSet.size === 0 && idxNF < 0) {
          alert(`⚠️ ATENÇÃO: Nenhum pedido faturado encontrado na tabela 'faturados' para o mês [${mesAlvoDash}]. Suba os faturados no Passo 1 primeiro (ou informe a coluna da Nota Fiscal nesta planilha).`);
          setLoading(false);
          return;
        }

        const { data: regraData } = await supabase
          .from('config_regras_canais')
          .select('*')
          .eq('canal', canalAlvoDash)
          .maybeSingle();

        const custosBanco = await fetchTodosRegistros('tabela_custos_skus', 'sku, produto');
        const mapaProdutos = new Map();
        const skusBaseSet = new Set();
        custosBanco.forEach((c: any) => {
          const sNorm = normalizarSku(c.sku);
          const pVal = String(c.produto || "").trim();
          if (sNorm) {
            mapaProdutos.set(sNorm, pVal);
            skusBaseSet.add(sNorm);
          }
        });

        const colIdDef = regraData?.col_id_pedido || 'A';
        const colSkuDef = regraData?.col_sku || regraData?.coluna_sku || (isML ? 'E' : (isAmazon ? 'L' : 'B'));
        const colPdvDef = regraData?.col_pdv || regraData?.col_preco_venda || (isML ? 'I' : (isAmazon ? 'Q' : 'P'));
        const colQtdDef = regraData?.col_quantidade || regraData?.coluna_quantidade || (isML ? 'H' : (isAmazon ? 'O' : 'O'));
        const colRepasseDef = regraData?.col_repasse || regraData?.col_estado || (isML ? 'T' : '');
        const formulaExcel = regraData?.formula_excel || '';

        const idxId = letraParaIndice(colIdDef);
        const idxSku = letraParaIndice(colSkuDef);
        const idxDescricao = letraParaIndice(regraData?.col_descricao || (isAmazon ? 'K' : (isSite ? 'BE' : 'D'))); 

        const novasVendas = [];
        let totalImportados = 0;
        let ignoradosForaDoMes = 0;

        let ignoradosTotalClube = 0;
        let totalCancelados = 0;

        // Clubes: a ÚLTIMA linha com valores é o total (soma) da planilha e nunca entra nas vendas
        let ultimaLinhaComValor = -1;
        const colsRelevantes: number[] = [];
        if (isFisico) {
          [colIdDef, colSkuDef, colPdvDef, colQtdDef, colRepasseDef, formulaExcel].forEach((c) => {
            if (/^[A-Za-z]{1,3}$/.test(String(c || "").trim())) colsRelevantes.push(letraParaIndice(String(c).trim()));
          });
          if (idxDescricao >= 0) colsRelevantes.push(idxDescricao);
          for (let r = json.length - 1; r >= 1; r--) {
            const rw = json[r];
            if (rw && colsRelevantes.some((c) => c >= 0 && celulaTemValor(rw[c]))) { ultimaLinhaComValor = r; break; }
          }
        }

        let i = isML ? 6 : 1;

        while (i < json.length) {
          const row = json[i];
          if (!row || row.length === 0) {
            i++;
            continue;
          }

          if (isFisico) {
            if (i === ultimaLinhaComValor) { ignoradosTotalClube++; i++; continue; }
            if (!colsRelevantes.some((c) => c >= 0 && celulaTemValor(row[c]))) { i++; continue; }   // linha sem nenhum valor
          }

          let rawId = idxId >= 0 && row[idxId] !== undefined ? String(row[idxId]).trim() : '';

          if (isFisico && !rawId) {
            rawId = `${canalAlvoDash.replace(/\s+/g, '').toUpperCase()}-${i}`;
          }

          if (!rawId) {
            i++;
            continue;
          }

          const idFormatado = normalizarIdPedido(rawId);
          const idSemTracos = idFormatado.replace(/[^A-Z0-9]/g, '');

          if (!isFisico) {
            const noBanco = idsFaturadosSet.has(idFormatado) || idsFaturadosSemTracos.has(idSemTracos);
            const comNF = idxNF >= 0 && celulaTemValor(row[idxNF]);
            if (!noBanco && !comNF) {
              ignoradosForaDoMes++;
              if (exemplosDescartados.length < 6 && !exemplosDescartados.includes(idFormatado)) exemplosDescartados.push(idFormatado);
              i++;
              continue;
            }
            if (!noBanco && comNF) {
              // Faturado pela Nota Fiscal da própria planilha: só entra se a data do pedido estiver no mês escolhido
              const dataIso = idxDataPed >= 0 ? paraDataIso(row[idxDataPed]) : "";
              if (dataIso && dataIso.slice(0, 7) !== `${anoUpload}-${mesUpload}`) { foraDoMesData++; i++; continue; }
              if (!novosFaturados.has(idFormatado)) novosFaturados.set(idFormatado, { id_pedido: idFormatado, data_faturamento: dataIso || hojeIso, mes_referencia: mesAlvoDash });
            }
          }

          const statusTxt = idxStatus >= 0 ? textoSemAcento(row[idxStatus]) : "";
          const cancelado = idxStatus >= 0 && !!textoCancel && statusTxt.includes(textoCancel);
          if (cancelado) totalCancelados++;

          const descRaw = idxDescricao >= 0 && row[idxDescricao] !== undefined ? String(row[idxDescricao]).trim() : '';

          if (isML && descRaw.toLowerCase().includes("pacote de") && descRaw.toLowerCase().includes("produtos")) {
            const match = descRaw.match(/\d+/);
            const qtdItensNoPacote = match ? parseInt(match[0], 10) : 0;
            
            if (qtdItensNoPacote > 0) {
              const pdvPrincipal = avaliarExpressaoOuColuna(colPdvDef, row);
              let repasseTotal = 0;

              if (formulaExcel) {
                repasseTotal = avaliarExpressaoOuColuna(formulaExcel, row, { PDV: pdvPrincipal, QTD: 1 });
              } else if (colRepasseDef) {
                repasseTotal = avaliarExpressaoOuColuna(colRepasseDef, row, { PDV: pdvPrincipal, QTD: 1 });
              }
              if (repasseTotal <= 0) repasseTotal = Math.max(0, pdvPrincipal - (pdvPrincipal * 0.16));

              let subItens = [];
              let somaPdvSubItens = 0;

              for (let j = 1; j <= qtdItensNoPacote; j++) {
                const subRow = json[i + j];
                if (subRow) {
                  const skuSub = normalizarSku(subRow[idxSku >= 0 ? idxSku : 23]);
                  const pdvSub = parseSmartFloat(subRow[letraParaIndice(colPdvDef) >= 0 ? letraParaIndice(colPdvDef) : 8]);
                  const qtdSub = Number(subRow[letraParaIndice(colQtdDef) >= 0 ? letraParaIndice(colQtdDef) : 7] !== undefined ? subRow[letraParaIndice(colQtdDef)] : 1) || 1;
                  
                  const existe = skuSub && skusBaseSet.has(skuSub);
                  const skuFinal = existe ? skuSub : (skuSub || 'sem-sku');
                  const nome = existe ? mapaProdutos.get(skuSub) : 'Produto Carrinho';
                  
                  somaPdvSubItens += (pdvSub * qtdSub);
                  subItens.push({ skuFinal, nome, pdvSub, qtdSub });
                }
              }

              for (const item of subItens) {
                let repasseRateado = 0;
                if (somaPdvSubItens > 0) {
                  repasseRateado = repasseTotal * ((item.pdvSub * item.qtdSub) / somaPdvSubItens);
                } else {
                  repasseRateado = repasseTotal / qtdItensNoPacote;
                }

                novasVendas.push({
                  id_pedido: idFormatado,
                  canal: canalAlvoDash,
                  mes_referencia: mesAlvoDash,
                  sku: item.skuFinal,
                  produto: item.nome,
                  quantidade: item.qtdSub,
                  preco_venda: item.pdvSub,
                  repasse_liquido: repasseRateado,
                  __cancelado: cancelado
                });
                totalImportados++;
              }

              i += (qtdItensNoPacote + 1);
              continue;
            }
          }

          const skuRaw = idxSku >= 0 && row[idxSku] !== undefined ? row[idxSku] : '';
          // Amazon: "-F", "-FBA" (e o que vier depois) e o "F"/"FBA" colado ao código não fazem parte do SKU
          const skuNorm = isAmazon ? limparSkuAmazon(skuRaw, skusBaseSet as Set<string>) : normalizarSku(skuRaw);

          const quantidade = Math.max(1, avaliarExpressaoOuColuna(colQtdDef, row) || 1);
          const precoVenda = avaliarExpressaoOuColuna(colPdvDef, row, { QTD: quantidade });

          if (isFisico && precoVenda <= 0 && !skuNorm) { i++; continue; }   // linha de clube sem valor nenhum

          const existeNaBase = skuNorm && skusBaseSet.has(skuNorm);
          const skuFinal = existeNaBase ? skuNorm : (skuNorm || 'sem-sku');
          const nomeProduto = existeNaBase ? mapaProdutos.get(skuNorm) : (descRaw || (skuRaw && isNaN(Number(skuRaw)) ? String(skuRaw).trim() : 'Produto Comercial'));

          let repasseLiquido = 0;
          if (formulaExcel && formulaExcel.trim()) {
            repasseLiquido = avaliarExpressaoOuColuna(formulaExcel, row, { PDV: precoVenda, QTD: quantidade });
          } else if (colRepasseDef && colRepasseDef.trim()) {
            repasseLiquido = avaliarExpressaoOuColuna(colRepasseDef, row, { PDV: precoVenda, QTD: quantidade });
          }

          if (isFisico && repasseLiquido <= 0) {
            repasseLiquido = precoVenda;
          } else if (repasseLiquido <= 0 || (precoVenda > 0 && repasseLiquido > precoVenda * quantidade * 1.5)) {
            const taxaFallback = isAmazon ? 0.14 : 0.16;
            repasseLiquido = Math.max(0, (precoVenda * quantidade) - ((precoVenda * quantidade) * taxaFallback));
          }

          novasVendas.push({
            id_pedido: idFormatado,
            canal: canalAlvoDash,
            mes_referencia: mesAlvoDash,
            sku: skuFinal,
            produto: nomeProduto,
            quantidade: quantidade,
            preco_venda: precoVenda,
            repasse_liquido: repasseLiquido,
            __cancelado: cancelado
          });
          totalImportados++;

          i++;
        }

        // Site (Wake): "Valor do Pedido" e "Quantidade de Produtos" se repetem em cada item do pedido.
        // Quando todos os itens do mesmo pedido trazem o mesmo valor, ele é dividido entre os itens (não soma em dobro).
        if (isSite) {
          const grupos = new Map<string, any[]>();
          novasVendas.forEach((v: any) => grupos.set(v.id_pedido, [...(grupos.get(v.id_pedido) || []), v]));
          grupos.forEach((linhas) => {
            const n = linhas.length;
            if (n < 2) return;
            const todosIguais = (campo: string) => linhas.every((l) => Math.abs(Number(l[campo]) - Number(linhas[0][campo])) < 0.005);
            // O último item fica com o centavo que sobra, para a soma bater exatamente com o valor do pedido
            const ratear = (campo: string) => {
              const total = Number(linhas[0][campo]);
              const parte = Number((total / n).toFixed(2));
              linhas.forEach((l, idx) => { l[campo] = idx === n - 1 ? Number((total - parte * (n - 1)).toFixed(2)) : parte; });
            };
            if (todosIguais("preco_venda") && linhas[0].preco_venda > 0) ratear("preco_venda");
            if (todosIguais("repasse_liquido") && linhas[0].repasse_liquido > 0) ratear("repasse_liquido");
            if (todosIguais("quantidade") && linhas[0].quantidade >= n && linhas[0].quantidade % n === 0) linhas.forEach((l) => { l.quantidade = l.quantidade / n; });
          });
        }

        let canceladosGravados = 0;
        if (novasVendas.length > 0) {
          const vendasGravar = novasVendas.map(({ __cancelado, ...v }: any) => v);
          await supabase.from('vendas_canais').delete().eq('canal', canalAlvoDash).eq('mes_referencia', mesAlvoDash);
          for (let k = 0; k < vendasGravar.length; k += 500) {
            const { error } = await supabase.from('vendas_canais').insert(vendasGravar.slice(k, k + 500));
            if (error) throw error;
          }

          // Cancelados do canal/mês: refeitos a cada upload. O dashboard abate receita, repasse, CMV e frete deles.
          const { error: erroLimpaCanc } = await supabase.from('cancelados').delete().eq('canal', canalAlvoDash).eq('mes_referencia', mesAlvoDash);
          if (erroLimpaCanc) throw new Error("tabela 'cancelados': " + erroLimpaCanc.message);
          const listaCancelados = novasVendas.filter((v: any) => v.__cancelado).map((v: any) => ({
            canal: canalAlvoDash, mes_referencia: mesAlvoDash, id_pedido: v.id_pedido, sku: v.sku, quantidade: v.quantidade, valor: v.preco_venda,
          }));
          for (let k = 0; k < listaCancelados.length; k += 500) {
            const { error } = await supabase.from('cancelados').insert(listaCancelados.slice(k, k + 500));
            if (error) throw new Error("tabela 'cancelados': " + error.message);
          }
          canceladosGravados = listaCancelados.length;

          // Pedidos faturados pela Nota Fiscal da planilha (Site) passam a constar em 'faturados' para o dashboard enxergá-los
          const idsNovos = Array.from(novosFaturados.keys());
          for (let k = 0; k < idsNovos.length; k += 100) {
            await supabase.from('faturados').delete().eq('mes_referencia', mesAlvoDash).in('id_pedido', idsNovos.slice(k, k + 100));
          }
          const regsFat = Array.from(novosFaturados.values());
          for (let k = 0; k < regsFat.length; k += 500) {
            const { error } = await supabase.from('faturados').insert(regsFat.slice(k, k + 500));
            if (error) throw error;
          }
        }

        const linhasMsg = [
          `✅ Vendas salvas em 'vendas_canais' (${mesAlvoDash})!`,
          `• Canal: ${canalAlvoDash} ${isFisico ? '(Loja Física)' : ''}`,
          `• Importados com sucesso: ${totalImportados} itens`,
        ];
        if (idxStatus >= 0) linhasMsg.push(`• Cancelados (abatidos no dashboard): ${canceladosGravados}`);
        linhasMsg.push(`• Descartados (${idxNF >= 0 ? 'sem faturamento nem Nota Fiscal' : 'não faturados'}): ${ignoradosForaDoMes}${exemplosDescartados.length ? ` (ex.: ${exemplosDescartados.join(', ')})` : ''}`);
        if (novosFaturados.size > 0) linhasMsg.push(`• Faturados registrados pela Nota Fiscal da planilha: ${novosFaturados.size}`);
        if (foraDoMesData > 0) linhasMsg.push(`• Fora do mês escolhido (pela data do pedido): ${foraDoMesData}`);
        if (isFisico) linhasMsg.push(`• Linha de total da planilha ignorada: ${ignoradosTotalClube > 0 ? 'sim' : 'não encontrada'}`);
        if (totalImportados === 0) linhasMsg.push(`⚠️ Nada foi importado: confira a coluna do ID do pedido (${colIdDef}) e se os faturados do mês foram subidos antes.`);
        alert(linhasMsg.join("\n"));
        carregarVendasPendentes();
      } catch (err: any) {
        alert("Erro ao cruzar e importar vendas: " + err.message);
      } finally {
        setLoading(false);
        try { (e.target as HTMLInputElement).value = ""; } catch { /* ignora */ }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubirTarifasSite = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = await lerArquivoComoLinhas(file);   // qualquer formato: xlsx, xls, csv, txt...

        const idxId = letraParaIndice(colunaIdSite);
        const idxTarifa = letraParaIndice(colunaTarifaSite);

        const registros = [];
        let tarifasCanceladas = 0;
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row) continue;
          const idPedido = normalizarIdPedido(row[idxId]);
          const valorTarifa = parseSmartFloat(row[idxTarifa]);
          // Transação cancelada no gateway (ex.: Vindi "Cancelada") não gera tarifa
          if (row.some((c: any) => /^cancelad[ao]$/i.test(String(c ?? "").trim()))) { tarifasCanceladas++; continue; }

          if (idPedido) {
            registros.push({ id_pedido: idPedido, valor_tarifa: valorTarifa });
          }
        }

        if (registros.length > 0) {
          await supabase.from('tarifas_site').delete().neq('id', 0);
          for (let i = 0; i < registros.length; i += 500) {
            await supabase.from('tarifas_site').upsert(registros.slice(i, i + 500), { onConflict: 'id_pedido' });
          }
        }

        alert(`✅ Tarifas do Site salvas em 'tarifas_site'! Total: ${registros.length} registos.${tarifasCanceladas ? `\n• Transações canceladas ignoradas: ${tarifasCanceladas}` : ""}`);
        setLoading(false);
      } catch (err: any) {
        alert("Erro ao importar Tarifas do Site: " + err.message);
        setLoading(false);
      } finally {
        try { (e.target as HTMLInputElement).value = ""; } catch { /* ignora */ }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const apagarDadosPorTipo = async (tabela: string) => {
    if (!confirm(`Deseja limpar os registros de [${tabela}] para o mês [${mesAlvoDash}]?`)) return;
    setLoading(true);
    try {
      if (tabela === 'faturados') {
        await supabase.from('faturados').delete().eq('mes_referencia', mesAlvoDash);
      } else if (tabela === 'vendas') {
        await supabase.from('vendas_canais').delete().eq('canal', canalAlvoDash).eq('mes_referencia', mesAlvoDash);
      }
      alert(`✅ Registros de ${tabela} limpos.`);
      carregarVendasPendentes();
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
    setLoading(false);
  };

  const zerarBancoTotal = async () => {
    if (!confirm("⚠️ Deseja apagar TODAS as informações das novas bases?")) return;
    setLoading(true);
    try {
      await supabase.from('vendas_canais').delete().neq('id', 0);
      await supabase.from('faturados').delete().neq('id', 0);
      await supabase.from('tarifas_site').delete().neq('id', 0);
      alert("✅ Bases limpas com sucesso!");
      carregarVendasPendentes();
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
    setLoading(false);
  };

  const processarABC = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroABC(file.name);
    const reader = new FileReader();
    reader.onload = (evento) => {
      try {
        const data = new Uint8Array(evento.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        const formatado = [];
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          const produto = String(row[0] || "").trim();
          const codigo = normalizarSku(row[1]);
          const quantidade = Number(row[2]);
          const valor = Number(row[3]);
          if (codigo && !isNaN(quantidade)) {
            formatado.push({ mes_referencia: mesReferencia, codigo, produto, quantidade, valor: isNaN(valor) ? 0 : valor });
          }
        }
        setDadosABC(formatado);
        alert(`Curva ABC processada: ${formatado.length} produtos válidos.`);
      } catch (err: any) { alert("Erro ao ler Curva ABC: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const processarInventario = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (dadosABC.length === 0) { alert("Processe primeiro a Curva ABC."); e.target.value = ""; return; }
    setFicheiroInventario(file.name);
    const skusPermitidos = new Set(dadosABC.map(item => String(item.codigo).trim()));
    const reader = new FileReader();
    reader.onload = (evento) => {
      try {
        const data = new Uint8Array(evento.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        const formatado = [];
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          let skuEncontrado = "";
          for (let col = 0; col < row.length; col++) {
            const val = normalizarSku(row[col]);
            if (skusPermitidos.has(val)) { skuEncontrado = val; break; }
          }
          if (skuEncontrado) {
            const saldoVal = Number(row[row.length - 1] ?? 0);
            formatado.push({ mes_referencia: mesReferencia, codigo_sku: skuEncontrado, saldo: isNaN(saldoVal) ? 0 : saldoVal });
          }
        }
        setDadosInvBruto(formatado);
        alert(`Inventário processado: ${formatado.length} SKUs identificados.`);
      } catch (err: any) { alert("Erro ao ler Inventário: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const enviarParaBanco = async () => {
    if (dadosABC.length === 0) return;
    setLoading(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('curva_abc').insert(dadosABC);
    if (dadosInvBruto.length > 0) await supabase.from('inventario').insert(dadosInvBruto);
    setLoading(false);
    alert(`🚀 Dados guardados no Supabase com sucesso!`);
    setFicheiroABC(""); setFicheiroInventario(""); setDadosABC([]); setDadosInvBruto([]);
  };

  const limparDadosCompetencia = async () => {
    if (!mesReferencia) return;
    setLoadingDelete(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);
    setLoadingDelete(false);
    alert(`🗑 Dados limpos.`);
  };

  const limparBaseTiny = async () => {
    if (!confirm("Tem certeza que deseja apagar toda a base do Tiny ERP?")) return;
    await supabase.from('cadastros_base_tiny').delete().neq('id', 0);
  };

  const limparCanal = async (canalNome: string) => {
    if (!confirm(`Apagar canal "${canalNome}"?`)) return;
    await supabase.from('mapeamento_canais_skus').delete().eq('canal', canalNome);
    alert(`Canal limpo.`);
  };

  const handleUploadTiny = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const indiceSku = letraParaIndice(regrasTiny.sku);
    const indiceEstoque = letraParaIndice(regrasTiny.estoque);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];
        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceEstoque)) continue;
          const sku = normalizarSku(row[indiceSku]);
          const estoque = Number(row[indiceEstoque] || 0);
          if (sku && !/sku|código|codigo/i.test(sku)) {
            mapaUnico.set(sku, { sku, estoque: isNaN(estoque) ? 0 : estoque });
          }
        }
        const registros = Array.from(mapaUnico.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('cadastros_base_tiny').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }
        alert(`Base Tiny atualizada! ${registros.length} SKUs processados.`);
        setLoading(false);
      } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadStatus = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const indiceSku = letraParaIndice(regrasTiny.status_sku);
    const indiceValor = letraParaIndice(regrasTiny.status_valor);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];
        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceValor)) continue;
          const sku = normalizarSku(row[indiceSku]);
          let statusVal = String(row[indiceValor] || 'Normal').trim();
          if (/obsoleto|inativo|arquivo|descontinuado/i.test(statusVal)) statusVal = 'Obsoleto';
          else statusVal = 'Normal';
          mapaUnico.set(sku, { sku, status: statusVal });
        }
        const registros = Array.from(mapaUnico.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('status_skus_catalogo').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }
        alert(`Status atualizados! ${registros.length} SKUs validados.`);
        setLoading(false);
      } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadCustosUnitarios = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const idxSku = letraParaIndice(regrasColsCusto.custo_sku);
    const idxProd = letraParaIndice(regrasColsCusto.custo_produto);
    const idxCusto = letraParaIndice(regrasColsCusto.custo_valor);
    const idxMarca = letraParaIndice(regrasColsCusto.custo_marca);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];
        const mapaUnicoCustos = new Map();
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          const sku = normalizarSku(row[idxSku]);
          const produto = String(row[idxProd] || "Produto").trim();
          const custo = parseSmartFloat(row[idxCusto]);
          const marca = String(row[idxMarca] || "").trim();
          if (sku && !isNaN(custo)) {
            mapaUnicoCustos.set(sku, { sku, produto, custo_unitario: custo, marca });
          }
        }
        const registros = Array.from(mapaUnicoCustos.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('tabela_custos_skus').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }
        alert(`💰 Custos salvos com sucesso! Total: ${registros.length} registos.`);
        setLoading(false);
        pesquisarCustosNoBanco();
        carregarVendasPendentes();
      } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadRegrasML = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const cols = colunasPorConta[contaMlSelecionada];
    const idxMlb = letraParaIndice(cols.ml_mlb);
    const idxSku = letraParaIndice(cols.ml_sku);
    const idxCom = letraParaIndice(cols.ml_comissao);
    const idxPeso = cols.ml_peso ? letraParaIndice(cols.ml_peso) : -1;
    const idxAlt = cols.ml_altura ? letraParaIndice(cols.ml_altura) : -1;
    const idxLarg = cols.ml_largura ? letraParaIndice(cols.ml_largura) : -1;
    const idxComp = cols.ml_comprimento ? letraParaIndice(cols.ml_comprimento) : -1;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        let sheetName = workbook.SheetNames[0];
        if (workbook.SheetNames.includes("Anúncios")) sheetName = "Anúncios";
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];
        const mapaMlPendente = new Map<string, any>();
        for (let i = 4; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(idxMlb, idxSku)) continue;
          const mlb = String(row[idxMlb] || "").trim().toUpperCase();
          if (!mlb || !mlb.startsWith("MLB")) continue;
          let sku = idxSku !== -1 ? normalizarSku(row[idxSku]) : "";
          let comissaoNum = 14;
          let rawComissao = row[idxCom];
          if (rawComissao !== undefined && rawComissao !== "") {
            let parsed = parseFloat(String(rawComissao).replace("%", "").trim().replace(",", "."));
            if (!isNaN(parsed) && parsed > 0) comissaoNum = parsed < 1 ? parsed * 100 : parsed;
          }
          let pesoReal = 2.000;
          if (idxPeso >= 0 && row[idxPeso] !== undefined) {
            let p = Number(String(row[idxPeso]).replace(",", "."));
            if (!isNaN(p) && p > 0) pesoReal = p;
          }
          const altura = idxAlt >= 0 ? Number(String(row[idxAlt] || "0").replace(",", ".")) || 0 : 0;
          const largura = idxLarg >= 0 ? Number(String(row[idxLarg] || "0").replace(",", ".")) || 0 : 0;
          const comprimento = idxComp >= 0 ? Number(String(row[idxComp] || "0").replace(",", ".")) || 0 : 0;

          mapaMlPendente.set(mlb, { mlb, sku, comissao: comissaoNum, peso_real: pesoReal, altura, largura, comprimento, canal: contaMlSelecionada });
        }
        const registros = Array.from(mapaMlPendente.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('ml_anuncios_regras').upsert(registros.slice(i, i + 500), { onConflict: 'mlb' });
        }
        alert(`🚀 Regras de ${contaMlSelecionada} processadas (${registros.length} anúncios).`);
        setLoading(false);
      } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadCanalMultiplos = async (canalNome: string, letraColuna: string, e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoading(true);
    const indiceColuna = letraParaIndice(letraColuna || "A");
    try {
      const allTiny = await fetchTodosRegistros('cadastros_base_tiny', 'sku');
      const skusTinySet = new Set(allTiny.map((t: any) => normalizarSku(t.sku)));
      const skusEncontradosNoCanal = new Set<string>();

      for (let f = 0; f < files.length; f++) {
        const file = files[f];
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];
        for (let i = 4; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= indiceColuna) continue;
          const skuVal = normalizarSku(row[indiceColuna]);
          if (skuVal && skusTinySet.has(skuVal)) {
            skusEncontradosNoCanal.add(skuVal);
          }
        }
      }

      await supabase.from('mapeamento_canais_skus').delete().eq('canal', canalNome);
      const registrosUpsert = Array.from(skusEncontradosNoCanal).map(sku => ({ canal: canalNome, sku, presente: true }));
      for (let i = 0; i < registrosUpsert.length; i += 500) {
        await supabase.from('mapeamento_canais_skus').insert(registrosUpsert.slice(i, i + 500));
      }
      alert(`Canal "${canalNome}" sincronizado com sucesso!`);
      setLoading(false);
    } catch (err: any) { alert("Erro: " + err.message); setLoading(false); }
  };

  const pesquisarCustosNoBanco = async () => {
    if (!pesquisaCusto || pesquisaCusto.trim() === "") { setListaCustosFiltrados([]); return; }
    const termo = pesquisaCusto.trim();
    const { data } = await supabase.from('tabela_custos_skus').select('*').or(`sku.ilike.%${termo}%,produto.ilike.%${termo}%`).limit(50);
    if (data) setListaCustosFiltrados(data);
  };

  const excluirCusto = async (id: number) => {
    if (!confirm("Excluir?")) return;
    await supabase.from('tabela_custos_skus').delete().eq('id', id);
    pesquisarCustosNoBanco();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Abastecimento & Updates</h1>
            <p className="text-sm font-medium text-slate-400">Gestão completa de relatórios, bases ERP, custos, faturamento e tarifas do site</p>
          </div>
          <Navbar />
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button onClick={() => setAbaAtiva("relatorios")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "relatorios" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            📊 Relatórios (ABC & Inventário)
          </button>
          <button onClick={() => setAbaAtiva("cadastros")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "cadastros" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            🛒 Cadastros e Canais
          </button>
          <button onClick={() => setAbaAtiva("custos")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "custos" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            💰 Custos por SKU
          </button>
          <button onClick={() => setAbaAtiva("regras_ml")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "regras_ml" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
            📦 Regras & Medidas ML
          </button>
          <button onClick={() => setAbaAtiva("vendas_pendentes")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "vendas_pendentes" ? 'bg-amber-600 text-white' : 'bg-slate-900 text-amber-400 border border-amber-900/50'}`}>
            ⚠️ Vendas Pendentes de Ajustes ({vendasPendentes.length})
          </button>
          <button onClick={() => setAbaAtiva("dashboard_admin")} className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${abaAtiva === "dashboard_admin" ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-emerald-400 border border-emerald-800'}`}>
            ⚙️ Updates & Alimenta Dashboard
          </button>
        </div>

        {/* ABA: RELATÓRIOS */}
        {abaAtiva === "relatorios" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <h2 className="text-lg font-bold mb-1 text-white">Relatórios Mensais</h2>
            <p className="text-xs text-slate-400 mb-6">Defina a competência e envie as planilhas mensais.</p>
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800/80 mb-6">
              <div className="mb-6 border-b border-slate-800 pb-6">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Competência</label>
                  <button onClick={limparDadosCompetencia} disabled={!mesReferencia || loadingDelete} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer">
                    {loadingDelete ? "A limpar..." : `🗑️ Limpar Base (${mesReferencia})`}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select className="border border-slate-700 rounded-xl p-3 bg-slate-900 text-xs text-white outline-none cursor-pointer" value={mes} onChange={(e) => setMes(e.target.value)}>
                    {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                  </select>
                  <select className="border border-slate-700 rounded-xl p-3 bg-slate-900 text-xs text-white outline-none cursor-pointer" value={ano} onChange={(e) => setAno(e.target.value)}>
                    {anos.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Curva ABC</label>
                  <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia} onChange={processarABC} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-lg file:bg-indigo-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" />
                  {ficheiroABC && <p className="mt-2 text-xs text-emerald-400 font-bold">✓ {ficheiroABC}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Inventário</label>
                  <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia || dadosABC.length === 0} onChange={processarInventario} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-lg file:bg-indigo-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" />
                  {ficheiroInventario && <p className="mt-2 text-xs text-emerald-400 font-bold">✓ {ficheiroInventario}</p>}
                </div>
              </div>
              {(dadosABC.length > 0 || dadosInvBruto.length > 0) && (
                <div className="mt-6 pt-5 border-t border-slate-800 flex justify-end">
                  <button onClick={enviarParaBanco} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                    {loading ? "A gravar..." : "🚀 Gravar Dados no Supabase"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: CADASTROS E CANAIS */}
        {abaAtiva === "cadastros" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total SKUs Tiny</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.totalTiny}</p>
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Normais</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.normais}</p>
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Obsoletos</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.obsoletos}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Base Central (Tiny ERP)</h3>
                    <button onClick={limparBaseTiny} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer">
                      🗑️ Limpar Base Tiny
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Lê linhas (SKU: <strong>{regrasTiny.sku}</strong>, Estoque: <strong>{regrasTiny.estoque}</strong>).</p>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadTiny} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>

              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Status (Normal / Obsoleto)</h3>
                  <p className="text-xs text-slate-400 mb-3">Lê linhas (SKU: <strong>{regrasTiny.status_sku}</strong>, Status: <strong>{regrasTiny.status_valor}</strong>).</p>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadStatus} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-violet-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>
            </div>

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-2 text-white">Upload e Gestão Individual dos Canais</h2>
              <p className="text-xs text-slate-400 mb-6">Suba as planilhas por canal definindo e salvando a coluna onde o SKU será lido.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {regrasCanais.map((r, idx) => (
                  <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-4">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">{r.canal}</span>
                      <button onClick={() => limparCanal(r.canal)} className="text-rose-400 text-[10px] font-bold bg-rose-950/40 px-2.5 py-1 rounded cursor-pointer">Limpar</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Coluna SKU:</label>
                      <input 
                        type="text" 
                        value={r.coluna_sku || "A"} 
                        onChange={(e) => atualizarColunaSkuCanal(r.id, e.target.value)}
                        className="w-14 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none" 
                      />
                    </div>
                    <input type="file" multiple accept=".xlsx, .xls, .csv" onChange={(e) => handleUploadCanalMultiplos(r.canal, r.coluna_sku, e)} className="block w-full text-[10px] text-slate-400 file:py-1.5 file:px-3 file:rounded-lg file:bg-slate-800 file:text-slate-200 cursor-pointer bg-slate-900 p-1.5 rounded-lg border border-slate-800" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ABA: CUSTOS POR SKU */}
        {abaAtiva === "custos" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <h2 className="text-lg font-bold text-white">Gestão de Custos Unitários por SKU</h2>
              <div className="flex items-center gap-3">
                <button 
                  onClick={baixarCustosExcel} 
                  disabled={loadingDownloadCustos}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition shadow flex items-center gap-2"
                >
                  {loadingDownloadCustos ? "A descarregar..." : "📥 Baixar Custos Salvos (Excel)"}
                </button>
                <button onClick={limparTabelaCustos} className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition">
                  🗑️ Limpar Custos
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. SKU:</label>
                <input type="text" value={regrasColsCusto.custo_sku} onChange={e => setRegrasColsCusto({...regrasColsCusto, custo_sku: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. Produto:</label>
                <input type="text" value={regrasColsCusto.custo_produto} onChange={e => setRegrasColsCusto({...regrasColsCusto, custo_produto: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. Custo:</label>
                <input type="text" value={regrasColsCusto.custo_valor} onChange={e => setRegrasColsCusto({...regrasColsCusto, custo_valor: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. Marca:</label>
                <input type="text" value={regrasColsCusto.custo_marca} onChange={e => setRegrasColsCusto({...regrasColsCusto, custo_marca: e.target.value.toUpperCase()})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
            </div>

            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadCustosUnitarios} className="block w-full text-xs text-slate-400 file:py-3 file:px-5 file:rounded-xl file:bg-emerald-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700 mb-6" />
            <input type="text" value={pesquisaCusto} onChange={(e) => setPesquisaCusto(e.target.value)} placeholder="🔍 Pesquisar SKU..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none mb-4" />
            
            {pesquisaCusto.trim() !== "" && (
              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[400px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px]">
                    <tr><th className="p-3">SKU</th><th className="p-3">Produto</th><th className="p-3">Custo Unitário</th><th className="p-3 text-center">Ações</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {listaCustosFiltrados.map(item => (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono">{item.sku}</td>
                        <td className="p-3">{item.produto}</td>
                        <td className="p-3 font-mono text-emerald-400 font-bold">R$ {Number(item.custo_unitario).toFixed(2)}</td>
                        <td className="p-3 text-center"><button onClick={() => excluirCusto(item.id)} className="text-rose-400 font-bold">Remover</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ABA: REGRAS & MEDIDAS ML */}
        {abaAtiva === "regras_ml" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">Regras & Medidas do Mercado Livre</h2>
                <p className="text-xs text-slate-400">Mapeamento de colunas para leitura de anúncios por conta (MLB, SKU, Comissão, Peso, Altura, Largura, Comprimento).</p>
              </div>
              <button onClick={salvarRegrasMlSupabase} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase cursor-pointer">
                Salvar Configurações
              </button>
            </div>

            <div className="flex bg-slate-950 p-2 rounded-xl border border-slate-800 w-fit gap-2">
              <button type="button" onClick={() => setContaMlSelecionada("Mercado Livre 1")} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer ${contaMlSelecionada === "Mercado Livre 1" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Mercado Livre 1</button>
              <button type="button" onClick={() => setContaMlSelecionada("Mercado Livre 2")} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer ${contaMlSelecionada === "Mercado Livre 2" ? "bg-indigo-600 text-white" : "text-slate-400"}`}>Mercado Livre 2</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-5 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna MLB (ID):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_mlb} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_mlb: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna SKU:</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_sku} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_sku: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Comissão:</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_comissao} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_comissao: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Peso (kg):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_peso} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_peso: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Altura (cm):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_altura} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_altura: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Largura (cm):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_largura} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_largura: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Comprimento (cm):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_comprimento} onChange={e => setColunasPorConta({...colunasPorConta, [contaMlSelecionada]: {...colunasPorConta[contaMlSelecionada], ml_comprimento: e.target.value.toUpperCase()}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono font-bold text-center uppercase outline-none" />
              </div>
            </div>

            <input type="file" accept=".xlsx, .xls" onChange={handleUploadRegrasML} className="block w-full text-xs text-slate-400 file:py-3 file:px-5 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
            <input type="text" value={pesquisaMl} onChange={(e) => setPesquisaMl(e.target.value)} placeholder="🔍 Pesquisar MLB ou SKU..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none" />
          </div>
        )}

        {/* ABA: VENDAS PENDENTES DE AJUSTES */}
        {abaAtiva === "vendas_pendentes" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-amber-900/50 shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">⚠️ Vendas Pendentes de Ajustes de SKU</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Estes itens foram importados nas vendas, mas o SKU veio inválido, vazio ou não foi encontrado na base de custos. Vendas dos clubes não aparecem aqui.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <input
                  type="text"
                  value={skuEmLote}
                  onChange={(e) => setSkuEmLote(e.target.value)}
                  placeholder="SKU para aplicar aos selecionados..."
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono uppercase outline-none w-52"
                />
                <button
                  type="button"
                  onClick={salvarSelecionadosEmLote}
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs uppercase transition cursor-pointer shadow"
                >
                  Salvar Selecionados
                </button>
              </div>
            </div>

            {/* PLANILHAS AUXILIARES DE SKU (ID do pedido -> SKU) */}
            <div className="bg-slate-950/70 border border-violet-900/40 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-black text-violet-300 uppercase tracking-wider">📎 Planilhas auxiliares de SKU (ID do pedido → SKU)</h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Quando o canal oculta o SKU, suba aqui a planilha com 2 colunas: o ID do pedido e o SKU dele. O SKU é gravado nas vendas que estão <strong>sem SKU</strong>;
                  vendas que já têm SKU não são alteradas, <strong>exceto na Amazon</strong>, onde SKUs terminados em <strong>f, -f ou -fba</strong> (que não existem na base) também são substituídos. Clubes nunca são alterados.
                  As outras colunas da planilha são descartadas. Você pode selecionar várias planilhas de uma vez (qualquer formato: xlsx, xls, csv, txt…).
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha inicial</label>
                  <input type="number" min={1} value={auxLinha} onChange={(e) => setAuxLinha(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-violet-300 uppercase mb-1">Coluna ID do pedido</label>
                  <input type="text" value={auxColPedido} onChange={(e) => setAuxColPedido(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-violet-600/50 rounded-lg p-2 text-xs font-mono text-center text-violet-300 font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-300 uppercase mb-1">Coluna SKU</label>
                  <input type="text" value={auxColSku} onChange={(e) => setAuxColSku(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-emerald-600/50 rounded-lg p-2 text-xs font-mono text-center text-emerald-300 font-bold outline-none" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => { setAuxArquivos(Array.from(e.target.files || [])); setAuxResultado(null); }}
                    className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-lg file:bg-violet-600 file:text-white file:border-0 cursor-pointer bg-slate-900 p-2 rounded-xl border border-slate-700"
                  />
                </div>
              </div>
              {auxArquivos.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {auxArquivos.map((a, i) => <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-300">{a.name}</span>)}
                  <button type="button" onClick={aplicarSkusAuxiliares} disabled={auxProcessando}
                    className="ml-auto bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-lg">
                    {auxProcessando ? "Aplicando..." : `Aplicar SKUs (${auxArquivos.length} planilha${auxArquivos.length > 1 ? "s" : ""})`}
                  </button>
                </div>
              )}
              {auxResultado && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs space-y-1.5" data-resultado-aux>
                  <div className="text-sm font-black text-emerald-400">✅ {auxResultado.vendasCorrigidas} venda(s) corrigida(s) em {auxResultado.pedidosCorrigidos} pedido(s)</div>
                  {auxResultado.sufixosSubstituidos > 0 && <div className="text-emerald-300">↻ {auxResultado.sufixosSubstituidos} venda(s) da Amazon tinham SKU terminado em f/-f/-fba e foram substituídas.</div>}
                  {auxResultado.arquivos.map((a: any, i: number) => (
                    <div key={i} className={a.erro ? "text-rose-300" : "text-slate-400"}>
                      📄 {a.nome}: {a.erro ? `não foi possível ler (${a.erro})` : `${a.lidas} linha(s) lida(s)${a.ignoradas ? `, ${a.ignoradas} ignorada(s) (sem ID ou sem SKU)` : ""}`}
                    </div>
                  ))}
                  <div className="text-slate-300">Pedidos distintos nas planilhas: {auxResultado.pedidosNaPlanilha}</div>
                  {auxResultado.jaTinhamSku > 0 && <div className="text-slate-400">↷ {auxResultado.jaTinhamSku} pedido(s) já tinham SKU e foram mantidos como estão.</div>}
                  {auxResultado.naoEncontrados > 0 && (
                    <div className="text-amber-300">⚠️ {auxResultado.naoEncontrados} pedido(s) não existem nas vendas importadas{auxResultado.exemplosNaoEncontrados.length ? ` (ex.: ${auxResultado.exemplosNaoEncontrados.slice(0, 5).join(", ")})` : ""}.</div>
                  )}
                  {auxResultado.linhasSemSku > 0 && <div className="text-amber-300">⚠️ {auxResultado.linhasSemSku} linha(s) de venda ficaram sem SKU: o pedido tem mais itens do que SKUs na planilha.</div>}
                  {auxResultado.skusForaDaBase > 0 && <div className="text-amber-300">⚠️ {auxResultado.skusForaDaBase} SKU(s) aplicado(s) não estão na base de custos; as vendas continuam na lista até o cadastro.</div>}
                  {auxResultado.erros.length > 0 && <div className="text-rose-300">❌ Erros ao gravar: {auxResultado.erros.slice(0, 3).join(" | ")}</div>}
                </div>
              )}
            </div>

            {/* FILTRO + DOWNLOAD DOS ITENS FORA DA BASE */}
            <div className="flex flex-wrap items-center gap-2" data-barra-pendentes>
              {([
                ["todos", `Todos (${vendasPendentes.length})`],
                ["sem_sku", `Sem SKU (${vendasPendentes.filter((v) => v.__semSku).length})`],
                ["fora_base", `Fora da base (${vendasPendentes.filter((v) => v.__foraBase).length})`],
              ] as const).map(([chave, rotulo]) => (
                <button key={chave} type="button" onClick={() => setFiltroPendentes(chave)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer border transition ${filtroPendentes === chave ? "bg-amber-600 text-white border-amber-500" : "bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-700"}`}>
                  {rotulo}
                </button>
              ))}
              <button type="button" onClick={baixarItensForaDaBase}
                className="ml-auto bg-sky-700 hover:bg-sky-600 text-white font-bold px-4 py-1.5 rounded-lg text-[11px] uppercase tracking-wider cursor-pointer shadow">
                ⬇️ Baixar itens fora da base ({agruparForaDaBase().length} SKU{agruparForaDaBase().length === 1 ? "" : "s"})
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3 text-center w-10">
                      <input 
                        type="checkbox" 
                        onChange={selecionarTodosPendentes}
                        checked={listaPendentesVisivel().length > 0 && listaPendentesVisivel().every(item => selecionadosPendentes[item.id])}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">ID Pedido</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">Mês Ref.</th>
                    <th className="p-3">Produto (Planilha)</th>
                    <th className="p-3 text-right">Preço Venda</th>
                    <th className="p-3 text-center">SKU Atual</th>
                    <th className="p-3 min-w-[220px]">Atribuir SKU Correto (Base de Custos)</th>
                    <th className="p-3 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {listaPendentesVisivel().map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 text-center">
                        <input 
                          type="checkbox"
                          checked={!!selecionadosPendentes[item.id]}
                          onChange={(e) => setSelecionadosPendentes({ ...selecionadosPendentes, [item.id]: e.target.checked })}
                          className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-mono font-bold text-indigo-400">{item.id_pedido}</td>
                      <td className="p-3 font-bold text-white">{item.canal}</td>
                      <td className="p-3 font-mono text-slate-400">{item.mes_referencia}</td>
                      <td className="p-3 max-w-[250px] truncate" title={item.__foraBase ? `Planilha: ${item.produto ?? ""}` : item.produto}>
                        {item.__foraBase
                          ? <span className="inline-block px-2 py-0.5 rounded-md bg-yellow-400/15 border border-yellow-500/40 text-yellow-300 font-black uppercase tracking-wider text-[10px]">fora da base</span>
                          : <span className="text-slate-300">{item.produto}</span>}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-400 font-bold">R$ {Number(item.preco_venda || item.valor || 0).toFixed(2)}</td>
                      <td className="p-3 text-center font-mono text-rose-400 font-bold">{item.sku || "vazio"}</td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={edicoesPendentes[item.id] ?? ""}
                          onChange={(e) => setEdicoesPendentes({ ...edicoesPendentes, [item.id]: e.target.value })}
                          placeholder="Digite o SKU correto..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-amber-500 uppercase"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => salvarSkuPendente(item.id)}
                            disabled={loading}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow-sm transition-all"
                          >
                            Salvar
                          </button>
                          {item.__foraBase && (
                            <button
                              type="button"
                              onClick={() => abrirCadastroCusto(item)}
                              title="Cadastrar este SKU na base de custos"
                              aria-label="Cadastrar custo"
                              data-lapis
                              className="bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-500/50 text-yellow-300 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {listaPendentesVisivel().length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-emerald-400 font-bold">
                        {vendasPendentes.length === 0
                          ? "🎉 Parabéns! Não há nenhuma venda pendente de ajustes. Todos os SKUs estão validados com sucesso."
                          : "Nenhum item neste filtro."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* CADASTRO RÁPIDO DE CUSTO (lápis) */}
            {cadastroCusto && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-modal-custo onClick={() => !cadastroSalvando && setCadastroCusto(null)}>
                <div className="w-full max-w-md bg-slate-900 border border-yellow-600/50 rounded-2xl p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <h3 className="text-sm font-black text-yellow-300 uppercase tracking-wider">✏️ Cadastrar na base de custos</h3>
                    <p className="text-[11px] text-slate-400 mt-1">Grava o SKU em <span className="font-mono">tabela_custos_skus</span>. As vendas desse SKU saem da lista de pendentes.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">SKU</label>
                    <input type="text" value={cadastroCusto.sku} readOnly className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-slate-400 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Produto (nome)</label>
                    <input type="text" value={cadastroCusto.produto} onChange={(e) => setCadastroCusto({ ...cadastroCusto, produto: e.target.value })}
                      placeholder="Ex.: Tapete para Yoga em EVA" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-yellow-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Marca</label>
                      <input type="text" value={cadastroCusto.marca} onChange={(e) => setCadastroCusto({ ...cadastroCusto, marca: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-yellow-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Custo unitário (R$)</label>
                      <input type="text" inputMode="decimal" value={cadastroCusto.custo} onChange={(e) => setCadastroCusto({ ...cadastroCusto, custo: e.target.value })}
                        placeholder="0,00" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-white outline-none focus:border-yellow-500" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setCadastroCusto(null)} disabled={cadastroSalvando}
                      className="px-4 py-2 rounded-lg text-xs font-bold uppercase bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer">Cancelar</button>
                    <button type="button" onClick={salvarCadastroCusto} disabled={cadastroSalvando}
                      className="px-5 py-2 rounded-lg text-xs font-bold uppercase bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white cursor-pointer shadow">
                      {cadastroSalvando ? "Salvando..." : "Cadastrar"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA: UPDATES & ALIMENTA DASHBOARD (ADMIN) */}
        {abaAtiva === "dashboard_admin" && (
          <div className="space-y-6">
            
            {/* PASSO 1: FATURADOS */}
            <div className="grid grid-cols-1 gap-6 max-w-xl">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Passo 1: Faturados (NFes Saída)</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mês de Referência dos Faturados</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select 
                        value={mesUpload} 
                        onChange={e => setMesUpload(e.target.value)} 
                        className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-bold cursor-pointer"
                      >
                        {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                      </select>
                      <select 
                        value={anoUpload} 
                        onChange={e => setAnoUpload(e.target.value)} 
                        className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-bold cursor-pointer"
                      >
                        {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
                      </select>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold mt-1.5 block">
                      Cadastrando como: <span className="font-mono uppercase">{mesAlvoDash}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna ID (Observações / AI)</label>
                      <input type="text" value={colunaIdFaturados} onChange={e => setColunaIdFaturados(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-indigo-400 font-mono font-bold text-center uppercase outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Data (D)</label>
                      <input type="text" value={colunaDataFaturados} onChange={e => setColunaDataFaturados(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-emerald-400 font-mono font-bold text-center uppercase outline-none" />
                    </div>
                  </div>
                  <label className="block w-full text-center bg-emerald-600 hover:bg-emerald-500 transition text-white font-extrabold text-xs py-3 rounded-xl shadow-lg cursor-pointer">
                    <span>Subir Faturados (Excel/CSV)</span>
                    <input type="file" onChange={handleSubirFaturados} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            {/* PASSO 2: VENDAS POR CANAL E TARIFAS DO SITE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Passo 2: Importar Vendas (Canal)</h3>
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mês de Referência</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select 
                        value={mesUpload} 
                        onChange={e => setMesUpload(e.target.value)} 
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none font-bold cursor-pointer"
                      >
                        {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                      </select>
                      <select 
                        value={anoUpload} 
                        onChange={e => setAnoUpload(e.target.value)} 
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none font-bold cursor-pointer"
                      >
                        {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
                      </select>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold mt-1.5 block">
                      Referência: <span className="font-mono uppercase">{mesAlvoDash}</span>
                    </span>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal de Destino</label>
                    <select value={canalAlvoDash} onChange={e => setCanalAlvoDash(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none font-bold cursor-pointer">
                      {canaisDashList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="rounded-lg border border-slate-800 p-3 space-y-2" data-cfg-import>
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Opcional · cancelados e nota fiscal ({canalAlvoDash})</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1" title="Coluna com a situação do pedido. Linhas cujo texto contenha a palavra ao lado são canceladas e abatidas no dashboard.">Col. Status</label>
                        <input type="text" value={cfgImportAtual.colStatus} onChange={e => setCfgImportCampo("colStatus", e.target.value.toUpperCase())} placeholder="ex.: AL" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Cancelado se contiver</label>
                        <input type="text" value={cfgImportAtual.textoCancelado} onChange={e => setCfgImportCampo("textoCancelado", e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono text-white outline-none" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1" title="Se preenchida, o pedido com Nota Fiscal nesta coluna conta como faturado mesmo sem estar na tabela de faturados (Site/Wake).">Col. Nota Fiscal</label>
                        <input type="text" value={cfgImportAtual.colNF} onChange={e => setCfgImportCampo("colNF", e.target.value.toUpperCase())} placeholder="ex.: AU" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1" title="Data do pedido, usada com a Nota Fiscal para conferir o mês e registrar o faturamento.">Col. Data do pedido</label>
                        <input type="text" value={cfgImportAtual.colData} onChange={e => setCfgImportCampo("colData", e.target.value.toUpperCase())} placeholder="ex.: C" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">Em branco = não usa. Vale para qualquer formato de arquivo (xlsx, xls, csv, txt). Nos clubes, a última linha com valores (total) é sempre ignorada.</p>
                  </div>
                  <label className="block w-full text-center bg-purple-600 hover:bg-purple-500 transition text-white font-bold text-xs py-2.5 rounded-lg shadow cursor-pointer">
                    <span>Importar e Cruzar Vendas</span>
                    <input type="file" onChange={handleSubirVendasCanal} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
                <h3 className="text-sm font-black text-emerald-400 uppercase tracking-wider">Consulta Tarifas Site</h3>
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                  <p className="text-[10px] text-slate-400">Cruza ID do Pedido com a tarifa para descontar do líquido final.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col ID Pedido</label>
                      <input type="text" value={colunaIdSite} onChange={e => setColunaIdSite(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col Valor Tarifa</label>
                      <input type="text" value={colunaTarifaSite} onChange={e => setColunaTarifaSite(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-white uppercase outline-none" />
                    </div>
                  </div>
                  <label className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 transition text-white font-bold text-xs py-2.5 rounded-lg shadow cursor-pointer">
                    <span>Subir Tarifas do Site</span>
                    <input type="file" onChange={handleSubirTarifasSite} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            {/* ZONA DE LIMPEZA DE DADOS */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-rose-950/60 shadow-xl space-y-4 max-w-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-sm font-black text-rose-400 uppercase tracking-wider">⚠️ Zona de Limpeza de Dados</h3>
                <div className="grid grid-cols-2 gap-2 w-48">
                  <select 
                    value={mesUpload} 
                    onChange={e => setMesUpload(e.target.value)} 
                    className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white font-bold outline-none cursor-pointer"
                  >
                    {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                  </select>
                  <select 
                    value={anoUpload} 
                    onChange={e => setAnoUpload(e.target.value)} 
                    className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white font-bold outline-none cursor-pointer"
                  >
                    {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => apagarDadosPorTipo('faturados')} className="bg-slate-950 hover:bg-rose-950/40 text-rose-300 border border-rose-900 font-bold py-2 px-4 rounded-xl text-xs transition cursor-pointer">
                  Apagar Faturados ({mesAlvoDash})
                </button>
                <button onClick={() => apagarDadosPorTipo('vendas')} className="bg-slate-950 hover:bg-rose-950/40 text-rose-300 border border-rose-900 font-bold py-2 px-4 rounded-xl text-xs transition cursor-pointer">
                  Apagar Vendas ({mesAlvoDash})
                </button>
              </div>
              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button onClick={zerarBancoTotal} className="bg-rose-600 hover:bg-rose-500 text-white font-black py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                  🗑️ Zerar Banco Principal
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}