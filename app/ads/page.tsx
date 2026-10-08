"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

const matrizFretes = [
  { atePeso: 0.3, faixas: { "78.99": 8.15, "99.99": 12.95, "119.99": 14.95, "149.99": 16.95, "199.99": 19.05, "200": 21.65 } },
  { atePeso: 0.5, faixas: { "78.99": 8.25, "99.99": 13.85, "119.99": 16.15, "149.99": 18.15, "199.99": 20.45, "200": 23.25 } },
  { atePeso: 1.0, faixas: { "78.99": 8.45, "99.99": 14.45, "119.99": 16.85, "149.99": 19.05, "199.99": 21.35, "200": 24.45 } },
  { atePeso: 1.5, faixas: { "78.99": 8.65, "99.99": 14.75, "119.99": 17.15, "149.99": 19.45, "199.99": 21.75, "200": 25.45 } },
  { atePeso: 2.0, faixas: { "78.99": 8.75, "99.99": 15.05, "119.99": 17.65, "149.99": 19.85, "199.99": 22.25, "200": 25.55 } },
  { atePeso: 3.0, faixas: { "78.99": 9.15, "99.99": 16.45, "119.99": 19.15, "149.99": 21.65, "199.99": 24.35, "200": 27.05 } },
  { atePeso: 4.0, faixas: { "78.99": 9.75, "99.99": 17.85, "119.99": 20.75, "149.99": 23.35, "199.99": 26.35, "200": 29.25 } },
  { atePeso: 5.0, faixas: { "78.99": 10.25, "99.99": 19.75, "119.99": 22.85, "149.99": 26.05, "199.99": 29.25, "200": 32.45 } },
  { atePeso: 6.0, faixas: { "78.99": 10.35, "99.99": 25.95, "119.99": 29.15, "149.99": 33.35, "199.99": 36.45, "200": 40.85 } },
  { atePeso: 7.0, faixas: { "78.99": 10.45, "99.99": 27.55, "119.99": 31.65, "149.99": 36.75, "199.99": 40.85, "200": 45.25 } },
  { atePeso: 9.0, faixas: { "78.99": 10.75, "99.99": 29.45, "119.99": 34.25, "149.99": 39.85, "199.99": 44.45, "200": 49.35 } },
  { atePeso: 13.0, faixas: { "78.99": 11.25, "99.99": 33.65, "119.99": 39.25, "149.99": 45.85, "199.99": 51.35, "200": 57.15 } },
  { atePeso: 17.0, faixas: { "78.99": 11.75, "99.99": 37.85, "119.99": 44.25, "149.99": 51.85, "199.99": 58.25, "200": 64.95 } },
  { atePeso: 23.0, faixas: { "78.99": 12.45, "99.99": 44.15, "119.99": 51.85, "149.99": 60.85, "199.99": 68.55, "200": 76.65 } },
  { atePeso: 30.0, faixas: { "78.99": 13.25, "99.99": 51.15, "119.99": 60.15, "149.99": 70.75, "199.99": 79.85, "200": 89.45 } },
];

function calcularFreteML(pdv: number, pesoReal: number, altura: number, largura: number, comprimento: number): number {
  if (pdv < 79.00) return 0.00;
  const pesoVolumetrico = (altura * largura * comprimento) / 6000;
  const pesoConsiderado = Math.max(pesoReal, pesoVolumetrico);

  let linhaFrete = matrizFretes.find(m => pesoConsiderado <= m.atePeso);
  if (!linhaFrete) linhaFrete = matrizFretes[matrizFretes.length - 1];

  let valorFrete = 0;
  if (pdv < 79) valorFrete = linhaFrete.faixas["78.99"];
  else if (pdv < 100) valorFrete = linhaFrete.faixas["99.99"];
  else if (pdv < 120) valorFrete = linhaFrete.faixas["119.99"];
  else if (pdv < 150) valorFrete = linhaFrete.faixas["149.99"];
  else if (pdv < 200) valorFrete = linhaFrete.faixas["199.99"];
  else valorFrete = linhaFrete.faixas["200"];

  return valorFrete || 0;
}

function normalizarSku(valor: any) {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  return s.toLowerCase();
}

function colLetraParaIndice(colStr: string): number {
  const s = colStr.trim().toUpperCase().replace(/[^A-Z]/g, "");
  let idx = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      idx = idx * 26 + (code - 64);
    }
  }
  return idx - 1;
}

function extrairLetraERow(val: string): { coluna: string; linha?: number } {
  const limpo = String(val || "").trim().toUpperCase();
  const match = limpo.match(/^([A-Z]+)(\d+)?$/);
  if (match) {
    return {
      coluna: match[1],
      linha: match[2] ? parseInt(match[2], 10) : undefined
    };
  }
  return { coluna: limpo };
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

type SubItemLive = { sku: string; unidades: string | number; receitaAds: string | number };

export default function AdsPage() {
  const [subAba, setSubAba] = useState<"campanhas" | "dashboard" | "budget" | "sugestoes">("campanhas");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  const [canalSelecionado, setCanalSelecionado] = useState("");
  const [mesSelecionado, setMesSelecionado] = useState("09/2026");
  const [mesComparativo, setMesComparativo] = useState("08/2026");
  
  const [metaTacosGlobal, setMetaTacosGlobal] = useState(2); 
  const [ocultarComparacao, setOcultarComparacao] = useState(false);

  const [canaisAtivos, setCanaisAtivos] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [dadosComparativo, setDadosComparativo] = useState<any[]>([]);

  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [regrasMlMap, setRegrasMlMap] = useState<Map<string, any>>(new Map());
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);

  const [idEditando, setIdEditando] = useState<number | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<any>({});

  const [selecionadosIds, setSelecionadosIds] = useState<number[]>([]);

  const [linhas, setLinhas] = useState([
    { mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "", itensLive: [] as SubItemLive[] }
  ]);

  const [showModalMLB, setShowModalMLB] = useState(false);
  const [mlbsPendentes, setMlbsPendentes] = useState<any[]>([]);
  const [dadosPendentesTemp, setDadosPendentesTemp] = useState<any>(null);
  const [modoPendente, setModoPendente] = useState<"novo" | "edicao">("novo");

  // ==================== ESTADOS DA ABA SUGESTÕES ====================
  const [canalSugestao, setCanalSugestao] = useState("");
  const [matrizPlanilha, setMatrizPlanilha] = useState<any[][]>([]);
  const [linhaInicial, setLinhaInicial] = useState("7");
  const [colunaSku, setColunaSku] = useState("W7");
  const [colunaPdv, setColunaPdv] = useState("I7");
  const [colunaRepasse, setColunaRepasse] = useState("S7");
  const [colunaQtd, setColunaQtd] = useState("H7");
  const [colunaRebate, setColunaRebate] = useState("");
  const [aliquotaImposto, setAliquotaImposto] = useState("9");
  const [formulaLiquidez, setFormulaLiquidez] = useState("S - (H * CUSTO) - (I * IMPOSTO)");
  const [sugestoesCalculadas, setSugestoesCalculadas] = useState<any[]>([]);
  const [filtroSugestao, setFiltroSugestao] = useState<"vendas" | "liquidez_valor" | "liquidez_pct">("vendas");
  const [pesquisaSkuSugestao, setPesquisaSkuSugestao] = useState("");
  const [apenasPositivos, setApenasPositivos] = useState(false);

  const mesesCompetencia = [
    "01/2026", "02/2026", "03/2026", "04/2026", "05/2026", "06/2026", 
    "07/2026", "08/2026", "09/2026", "10/2026", "11/2026", "12/2026"
  ];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosAuxiliares();
  }, []);

  useEffect(() => {
    if (canalSelecionado && mesSelecionado) {
      carregarLancamentos();
      setSelecionadosIds([]); 
    }
  }, [canalSelecionado, mesSelecionado]);

  useEffect(() => {
    if (subAba === "dashboard" || subAba === "budget") {
      carregarDadosDashboard();
    }
  }, [subAba, mesSelecionado, mesComparativo]);

  useEffect(() => {
    if (canalSugestao) {
      carregarConfiguracoesSugestao(canalSugestao);
    }
  }, [canalSugestao]);

  const carregarConfiguracoesSugestao = (canal: string) => {
    const salvo = localStorage.getItem(`sugestoes_config_${canal.toLowerCase()}`);
    if (salvo) {
      try {
        const parsed = JSON.parse(salvo);
        if (parsed.linhaInicial) setLinhaInicial(parsed.linhaInicial);
        if (parsed.colunaSku) setColunaSku(parsed.colunaSku);
        if (parsed.colunaPdv) setColunaPdv(parsed.colunaPdv);
        if (parsed.colunaRepasse) setColunaRepasse(parsed.colunaRepasse);
        if (parsed.colunaQtd) setColunaQtd(parsed.colunaQtd);
        if (parsed.colunaRebate !== undefined) setColunaRebate(parsed.colunaRebate);
        if (parsed.aliquotaImposto) setAliquotaImposto(parsed.aliquotaImposto);
        if (parsed.formulaLiquidez) setFormulaLiquidez(parsed.formulaLiquidez);
      } catch (err) {
        console.error("Erro ao carregar configurações salvas:", err);
      }
    }
  };

  const salvarConfiguracoesSugestao = (canal: string, overrides: any = {}) => {
    if (!canal) return;
    const config = {
      linhaInicial: overrides.linhaInicial ?? linhaInicial,
      colunaSku: overrides.colunaSku ?? colunaSku,
      colunaPdv: overrides.colunaPdv ?? colunaPdv,
      colunaRepasse: overrides.colunaRepasse ?? colunaRepasse,
      colunaQtd: overrides.colunaQtd ?? colunaQtd,
      colunaRebate: overrides.colunaRebate ?? colunaRebate,
      aliquotaImposto: overrides.aliquotaImposto ?? aliquotaImposto,
      formulaLiquidez: overrides.formulaLiquidez ?? formulaLiquidez,
    };
    localStorage.setItem(`sugestoes_config_${canal.toLowerCase()}`, JSON.stringify(config));
  };

  const carregarDadosAuxiliares = async () => {
    const { data: regrasCanaisData } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regrasCanaisData) {
      const ativos = regrasCanaisData.filter((c: any) => c.ativo_ads !== false);
      setCanaisAtivos(ativos);
      if (ativos.length > 0) {
        setCanalSelecionado(ativos[0].canal);
        setCanalSugestao(ativos[0].canal);
        carregarConfiguracoesSugestao(ativos[0].canal);
      }
    }

    let allCustos: any[] = [];
    let from = 0; let step = 1000; let keep = true;
    while (keep) {
      const { data } = await supabase.from('tabela_custos_skus').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        allCustos = [...allCustos, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    const mapaC = new Map();
    allCustos.forEach((c: any) => {
      const skuNorm = normalizarSku(c.sku);
      if (skuNorm) mapaC.set(skuNorm, c);
    });
    setCustosMap(mapaC);

    let allMl: any[] = [];
    from = 0; keep = true;
    while (keep) {
      const { data } = await supabase.from('ml_anuncios_regras').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        allMl = [...allMl, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    const mapaMl = new Map();
    allMl.forEach((m: any) => {
      const mlbLimpo = String(m.mlb || "").trim().toUpperCase();
      if (mlbLimpo) mapaMl.set(mlbLimpo, m);
    });
    setRegrasMlMap(mapaMl);

    const { data: tarifacaoData } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (tarifacaoData) setRegrasTarifacao(tarifacaoData);
  };

  const carregarLancamentos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ads_campanhas_lancamentos')
      .select('*')
      .eq('canal', canalSelecionado)
      .eq('mes_referencia', mesSelecionado)
      .order('id');

    if (data) setLancamentos(data);
    setLoading(false);
  };

  const carregarDadosDashboard = async () => {
    setLoading(true);
    const listaCanais = canaisAtivos.map(c => c.canal);

    const { data: configTiny } = await supabase.from('config_regras_tiny').select('coluna').eq('campo', 'meta_tacos').maybeSingle();
    const metaAtualDb = configTiny?.coluna ? Number(configTiny.coluna) : 2;
    setMetaTacosGlobal(metaAtualDb);

    const { data: dadosAtual } = await supabase.from('ads_campanhas_lancamentos').select('*').eq('mes_referencia', mesSelecionado);
    const { data: dadosAnterior } = await supabase.from('ads_campanhas_lancamentos').select('*').eq('mes_referencia', mesComparativo);

    const { data: faturamentosAtual } = await supabase.from('ads_faturamento_canal').select('*').eq('mes_referencia', mesSelecionado);
    const { data: faturamentosAnt } = await supabase.from('ads_faturamento_canal').select('*').eq('mes_referencia', mesComparativo);

    const consolidado = listaCanais.map(canal => {
      const itensA = dadosAtual?.filter(d => d.canal === canal) || [];
      const itensB = dadosAnterior?.filter(d => d.canal === canal) || [];

      const fatAdsAtual = itensA.reduce((sum, i) => sum + Number(i.retorno_bruto || 0), 0);
      const fatAdsAnt = itensB.reduce((sum, i) => sum + Number(i.retorno_bruto || 0), 0);
      const diffAds = fatAdsAtual - fatAdsAnt;

      const invAtual = itensA.reduce((sum, i) => sum + Number(i.investimento || 0), 0);
      const invAnt = itensB.reduce((sum, i) => sum + Number(i.investimento || 0), 0);

      const roasAtual = invAtual > 0 ? fatAdsAtual / invAtual : 0;
      const roasAnt = invAnt > 0 ? fatAdsAnt / invAnt : 0;

      const dadosFatAtual = faturamentosAtual?.find(f => f.canal === canal);
      const fatCanalBrutoAtual = dadosFatAtual?.faturamento_total || "";
      const gastoAdsBrutoAtual = dadosFatAtual?.gasto_ads || "";
      
      const fatCanalAtualDB = Number(fatCanalBrutoAtual);
      const totFatAtual = fatCanalAtualDB > 0 ? fatCanalAtualDB : fatAdsAtual;

      const dadosFatAnt = faturamentosAnt?.find(f => f.canal === canal);
      const fatCanalAntDB = Number(dadosFatAnt?.faturamento_total || 0);
      const totFatAnt = fatCanalAntDB > 0 ? fatCanalAntDB : fatAdsAnt;

      const tacosAtual = totFatAtual > 0 ? (invAtual / totFatAtual) * 100 : 0;
      const tacosAnt = totFatAnt > 0 ? (invAnt / totFatAnt) * 100 : 0;

      const margemRsAtual = itensA.reduce((sum, i) => sum + Number(i.margem_liquida_rs || 0), 0);
      const margemRsAnt = itensB.reduce((sum, i) => sum + Number(i.margem_liquida_rs || 0), 0);
      const diffMargemRs = margemRsAtual - margemRsAnt;

      const repAds = totFatAtual > 0 ? (fatAdsAtual / totFatAtual) * 100 : 0;

      return {
        canal, fatAdsAtual, fatAdsAnt, diffAds, roasAtual, roasAnt,
        tacosAtual, tacosAnt, margemRsAtual, margemRsAnt, diffMargemRs,
        totFatAtual, totFatAnt, totFatAtual_bruto: fatCanalBrutoAtual,
        gastoAdsBrutoAtual, repAds
      };
    });

    setDadosComparativo(consolidado);
    setLoading(false);
  };

  const salvarFaturamentoEGasto = async (canal: string, campo: "faturamento_total" | "gasto_ads", valorStr: string) => {
    let valorLimpo = valorStr.replace(/\./g, '').replace(',', '.');
    const numVal = Number(valorLimpo);
    if (isNaN(numVal)) return;

    const { data: existente } = await supabase.from('ads_faturamento_canal')
      .select('*').eq('canal', canal).eq('mes_referencia', mesSelecionado).maybeSingle();

    const payload = {
      canal,
      mes_referencia: mesSelecionado,
      faturamento_total: existente?.faturamento_total || 0,
      gasto_ads: existente?.gasto_ads || 0,
      [campo]: numVal
    };

    const { error } = await supabase.from('ads_faturamento_canal').upsert(payload, { onConflict: 'canal, mes_referencia' });
    if (error) alert("Erro ao salvar: " + error.message);
    else carregarDadosDashboard();
  };

  const adicionarLinhaForm = () => setLinhas([...linhas, { mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "", itensLive: [] }]);
  const removerLinhaForm = (index: number) => setLinhas(linhas.filter((_, i) => i !== index));

  const atualizarLinhaForm = (index: number, campo: string, valor: string) => {
    const novasLinhas = [...linhas];
    novasLinhas[index] = { ...novasLinhas[index], [campo]: valor };

    if (campo === "mlb" && valor.trim().toUpperCase().startsWith("LIVE")) {
      if (novasLinhas[index].itensLive.length === 0) {
        novasLinhas[index].itensLive = [{ sku: "", unidades: "", receitaAds: "" }];
      }
      novasLinhas[index].sku = "";
    }
    setLinhas(novasLinhas);
  };

  const adicionarItemLive = (index: number) => {
    const novasLinhas = [...linhas];
    novasLinhas[index].itensLive.push({ sku: "", unidades: "", receitaAds: "" });
    setLinhas(novasLinhas);
  };

  const removerItemLive = (index: number, subIndex: number) => {
    const novasLinhas = [...linhas];
    novasLinhas[index].itensLive.splice(subIndex, 1);
    novasLinhas[index].unidades = String(novasLinhas[index].itensLive.reduce((acc, sub) => acc + Number(sub.unidades || 0), 0));
    novasLinhas[index].receitaAds = String(novasLinhas[index].itensLive.reduce((acc, sub) => acc + Number(sub.receitaAds || 0), 0));
    setLinhas(novasLinhas);
  };

  const atualizarItemLive = (index: number, subIndex: number, campo: string, valor: string) => {
    const novasLinhas = [...linhas];
    novasLinhas[index].itensLive[subIndex] = { ...novasLinhas[index].itensLive[subIndex], [campo]: valor };
    novasLinhas[index].unidades = String(novasLinhas[index].itensLive.reduce((acc, sub) => acc + Number(sub.unidades || 0), 0));
    novasLinhas[index].receitaAds = String(novasLinhas[index].itensLive.reduce((acc, sub) => acc + Number(sub.receitaAds || 0), 0));
    setLinhas(novasLinhas);
  };

  const atualizarDadoPendente = (index: number, campo: string, valor: string) => {
    const novaLista = [...mlbsPendentes];
    novaLista[index][campo] = valor;
    setMlbsPendentes(novaLista);
  };

  const confirmarMlbsPendentes = async () => {
    for (const item of mlbsPendentes) {
      if (!item.comissao || Number(item.comissao) <= 0) {
        return alert(`Preencha a comissão (maior que 0) para o MLB: ${item.mlb}`);
      }
    }

    setSalvando(true);
    const novoMapaMl = new Map(regrasMlMap);

    for (const item of mlbsPendentes) {
      const dadosInsercao = {
        mlb: item.mlb,
        sku: item.sku,
        comissao: Number(item.comissao),
        peso_real: Number(item.peso_real || 2),
        altura: Number(item.altura || 10),
        largura: Number(item.largura || 10),
        comprimento: Number(item.comprimento || 10)
      };

      const regraExistente = regrasMlMap.get(item.mlb);
      if (regraExistente) {
        await supabase.from('ml_anuncios_regras').update(dadosInsercao).eq('id', regraExistente.id);
      } else {
        await supabase.from('ml_anuncios_regras').insert([dadosInsercao]);
      }
      novoMapaMl.set(item.mlb, dadosInsercao);
    }

    setRegrasMlMap(novoMapaMl);
    setShowModalMLB(false);

    if (modoPendente === "novo") processarGravacaoFinal(dadosPendentesTemp, novoMapaMl);
    else processarEdicaoFinal(dadosPendentesTemp, novoMapaMl);
  };

  const calcularCustoCanal = (canal: string, precoUnit: number, receita: number, unidades: number, mlRegra: any) => {
    let comissaoPct = 14;
    let tarifaFixa = 0;
    let freteUnitario = 0;

    const isMercadoLivre = canal.toLowerCase().includes("mercado livre");

    if (isMercadoLivre) {
      comissaoPct = mlRegra ? Number(mlRegra.comissao || 0) : 14;
      let pesoReal = mlRegra ? Number(mlRegra.peso_real || 0) : 2.0;
      let altura = mlRegra ? Number(mlRegra.altura || 0) : 10;
      let largura = mlRegra ? Number(mlRegra.largura || 0) : 10;
      let comprimento = mlRegra ? Number(mlRegra.comprimento || 0) : 10;
      freteUnitario = calcularFreteML(precoUnit, pesoReal, altura, largura, comprimento);
    } else {
      const regrasDoCanal = regrasTarifacao.filter(r => r.canal.toLowerCase() === canal.toLowerCase());
      if (regrasDoCanal.length > 0) {
        let regraAplicavel = regrasDoCanal[0];
        for (const r of regrasDoCanal) {
          const numeros = r.faixa_preco.match(/\d+[\.,]?\d*/g);
          if (numeros && numeros.length >= 2) {
            const min = parseFloat(numeros[0].replace(',', '.'));
            const max = parseFloat(numeros[1].replace(',', '.'));
            if (precoUnit >= min && precoUnit <= max) {
              regraAplicavel = r;
              break;
            }
          } else if (numeros && numeros.length === 1) {
            const val = parseFloat(numeros[0].replace(',', '.'));
            if (r.faixa_preco.toLowerCase().includes("acima") || r.faixa_preco.toLowerCase().includes("maior")) {
              if (precoUnit >= val) {
                regraAplicavel = r;
                break;
              }
            }
          }
        }
        comissaoPct = Number(regraAplicavel.comissao || 0);
        tarifaFixa = Number(regraAplicavel.tarifa_fixa || 0);
        freteUnitario = Number(regraAplicavel.frete || 0);
      }
    }

    const freteTotal = freteUnitario * unidades;
    const tarifaComissaoTotal = (receita * (comissaoPct / 100)) + (tarifaFixa * unidades);

    return { freteTotal, tarifaComissaoTotal };
  };

  const salvarLancamentos = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const registrosBrutos: any[] = [];

    for (const l of linhas) {
      const mlbLimpo = l.mlb.trim().toUpperCase();
      const isLive = mlbLimpo.startsWith("LIVE");
      const investimentoTotal = Number(l.investimento || 0);

      if (isLive) {
        if (!l.itensLive || l.itensLive.length === 0) continue;
        const receitaTotalLive = l.itensLive.reduce((acc, sub) => acc + Number(sub.receitaAds || 0), 0);

        for (const sub of l.itensLive) {
          const skuLimpo = sub.sku.trim();
          if (!skuLimpo) continue;
          
          const subReceita = Number(sub.receitaAds || 0);
          const subUnidades = Number(sub.unidades || 0);
          let subInvestimento = 0;

          if (receitaTotalLive > 0) subInvestimento = (subReceita / receitaTotalLive) * investimentoTotal;
          else subInvestimento = investimentoTotal / l.itensLive.length;

          registrosBrutos.push({ mlb: mlbLimpo, sku: skuLimpo, unidades: subUnidades, receitaAds: subReceita, investimento: subInvestimento });
        }
      } else {
        const skuLimpo = l.sku.trim();
        if (!skuLimpo || !mlbLimpo) continue;
        registrosBrutos.push({ mlb: mlbLimpo, sku: skuLimpo, unidades: Number(l.unidades || 0), receitaAds: Number(l.receitaAds || 0), investimento: investimentoTotal });
      }
    }

    if (registrosBrutos.length === 0) {
      alert("Preencha pelo menos um MLB/LIVE e SKU válidos.");
      setSalvando(false);
      return;
    }

    const hasOverflow = registrosBrutos.some(f => f.unidades > 9999999 || f.investimento > 99999999 || f.receitaAds > 99999999);
    if (hasOverflow) {
        alert("⚠️ ATENÇÃO: Um valor excessivamente alto foi detetado. Verifique se não colou um código SKU num campo numérico.");
        setSalvando(false);
        return;
    }

    const isMercadoLivre = canalSelecionado.toLowerCase().includes("mercado livre");

    if (isMercadoLivre) {
      const missing: any[] = [];
      const processados = new Set();

      for (const raw of registrosBrutos) {
        if (raw.mlb.startsWith("LIVE")) continue;
        
        if (!processados.has(raw.mlb)) {
          processados.add(raw.mlb);
          const regra = regrasMlMap.get(raw.mlb);
          
          if (!regra || !regra.comissao || Number(regra.comissao) === 0) {
            missing.push({
              mlb: raw.mlb, sku: raw.sku, comissao: "",
              peso_real: regra?.peso_real || "2.0",
              altura: regra?.altura || "10",
              largura: regra?.largura || "10",
              comprimento: regra?.comprimento || "10"
            });
          }
        }
      }

      if (missing.length > 0) {
        setMlbsPendentes(missing);
        setDadosPendentesTemp(registrosBrutos);
        setModoPendente("novo");
        setShowModalMLB(true);
        setSalvando(false);
        return;
      }
    }

    processarGravacaoFinal(registrosBrutos, regrasMlMap);
  };

  const processarGravacaoFinal = async (registrosBrutos: any[], mapaMlAtual: Map<string, any>) => {
    const formatados = registrosBrutos.map(raw => {
      const skuKey = normalizarSku(raw.sku);
      const custoRegra = custosMap.get(skuKey);
      const mlRegra = mapaMlAtual.get(raw.mlb);

      const produtoNome = custoRegra?.produto || "Produto sem nome";
      const custoUnitario = Number(custoRegra?.custo_unitario || 0);
      const custoProdutoTotal = custoUnitario * raw.unidades;
      const precoUnitarioEstimado = raw.unidades > 0 ? (raw.receitaAds / raw.unidades) : 100;
      
      const { freteTotal, tarifaComissaoTotal } = calcularCustoCanal(canalSelecionado, precoUnitarioEstimado, raw.receitaAds, raw.unidades, mlRegra);

      const impostoTotal = raw.receitaAds * 0.08;
      const embalagemTotal = 0.70 * raw.unidades;

      const faturamentoTotal = raw.receitaAds;
      const margemLiquidaVal = faturamentoTotal - (raw.investimento + custoProdutoTotal + impostoTotal + tarifaComissaoTotal + embalagemTotal + freteTotal);
      const margemLiquidaPct = faturamentoTotal > 0 ? (margemLiquidaVal / faturamentoTotal) : 0;

      return {
        canal: canalSelecionado,
        mes_referencia: mesSelecionado,
        identificador_anuncio: raw.mlb,
        nome_anuncio: produtoNome,
        sku: raw.sku,
        unidades_vendidas: raw.unidades,
        investimento: Number(raw.investimento.toFixed(2)),
        retorno_bruto: Number(raw.receitaAds.toFixed(2)),
        faturamento_total: Number(faturamentoTotal.toFixed(2)),
        custo_produto: Number(custoProdutoTotal.toFixed(2)),
        imposto: Number(impostoTotal.toFixed(2)),
        tarifa: Number(tarifaComissaoTotal.toFixed(2)),
        embalagem: Number(embalagemTotal.toFixed(2)),
        frete: Number(freteTotal.toFixed(2)),
        margem_liquida_rs: Number(margemLiquidaVal.toFixed(2)),
        margem_liquida_pct: Number(margemLiquidaPct.toFixed(4))
      };
    });

    const { error } = await supabase.from('ads_campanhas_lancamentos').insert(formatados);
    if (error) alert("Erro ao gravar lançamentos: " + error.message);
    else {
      alert("✅ Anúncios salvos e calculados com sucesso!");
      setLinhas([{ mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "", itensLive: [] }]);
      carregarLancamentos();
    }
    setSalvando(false);
  };

  const iniciarEdicao = (item: any) => {
    setIdEditando(item.id);
    setDadosEdicao({
      identificador_anuncio: item.identificador_anuncio,
      sku: item.sku,
      unidades_vendidas: item.unidades_vendidas,
      retorno_bruto: item.retorno_bruto,
      investimento: item.investimento
    });
  };

  const salvarEdicao = async (id: number) => {
    const unidades = Number(dadosEdicao.unidades_vendidas || 0);
    const receitaAds = Number(dadosEdicao.retorno_bruto || 0);
    const investimento = Number(dadosEdicao.investimento || 0);
    
    if (unidades > 9999999 || investimento > 99999999 || receitaAds > 99999999) {
        alert("⚠️ ATENÇÃO: Valor excessivamente alto. Verifique se não inseriu um SKU num campo numérico.");
        return;
    }

    const skuLimpo = String(dadosEdicao.sku || "").trim();
    const mlbLimpo = String(dadosEdicao.identificador_anuncio || "").trim().toUpperCase();
    const isMercadoLivre = canalSelecionado.toLowerCase().includes("mercado livre");

    if (isMercadoLivre && !mlbLimpo.startsWith("LIVE")) {
      const regra = regrasMlMap.get(mlbLimpo);
      if (!regra || !regra.comissao || Number(regra.comissao) === 0) {
        setMlbsPendentes([{
          mlb: mlbLimpo, sku: skuLimpo, comissao: "",
          peso_real: regra?.peso_real || "2.0",
          altura: regra?.altura || "10",
          largura: regra?.largura || "10",
          comprimento: regra?.comprimento || "10"
        }]);
        setDadosPendentesTemp(id);
        setModoPendente("edicao");
        setShowModalMLB(true);
        return;
      }
    }
    processarEdicaoFinal(id, regrasMlMap);
  };

  const processarEdicaoFinal = async (id: number, mapaMlAtual: Map<string, any>) => {
    const unidades = Number(dadosEdicao.unidades_vendidas || 0);
    const receitaAds = Number(dadosEdicao.retorno_bruto || 0);
    const investimento = Number(dadosEdicao.investimento || 0);
    const skuLimpo = String(dadosEdicao.sku || "").trim();
    const skuKey = normalizarSku(skuLimpo);
    const mlbLimpo = String(dadosEdicao.identificador_anuncio || "").trim().toUpperCase();

    const custoRegra = custosMap.get(skuKey);
    const mlRegra = mapaMlAtual.get(mlbLimpo);

    const produtoNome = custoRegra?.produto || "Produto sem nome";
    const custoUnitario = Number(custoRegra?.custo_unitario || 0);
    const custoProdutoTotal = custoUnitario * unidades;
    const precoUnitarioEstimado = unidades > 0 ? (receitaAds / unidades) : 100;
    
    const { freteTotal, tarifaComissaoTotal } = calcularCustoCanal(canalSelecionado, precoUnitarioEstimado, receitaAds, unidades, mlRegra);

    const impostoTotal = receitaAds * 0.08;
    const embalagemTotal = 0.70 * unidades;

    const faturamentoTotal = receitaAds;
    const margemLiquidaVal = faturamentoTotal - (investimento + custoProdutoTotal + impostoTotal + tarifaComissaoTotal + embalagemTotal + freteTotal);
    const margemLiquidaPct = faturamentoTotal > 0 ? (margemLiquidaVal / faturamentoTotal) : 0;

    const atualizacao = {
      identificador_anuncio: mlbLimpo,
      sku: skuLimpo,
      nome_anuncio: produtoNome,
      unidades_vendidas: unidades,
      retorno_bruto: Number(receitaAds.toFixed(2)),
      investimento: Number(investimento.toFixed(2)),
      faturamento_total: Number(faturamentoTotal.toFixed(2)),
      custo_produto: Number(custoProdutoTotal.toFixed(2)),
      imposto: Number(impostoTotal.toFixed(2)),
      tarifa: Number(tarifaComissaoTotal.toFixed(2)),
      embalagem: Number(embalagemTotal.toFixed(2)),
      frete: Number(freteTotal.toFixed(2)),
      margem_liquida_rs: Number(margemLiquidaVal.toFixed(2)),
      margem_liquida_pct: Number(margemLiquidaPct.toFixed(4))
    };

    const { error } = await supabase.from('ads_campanhas_lancamentos').update(atualizacao).eq('id', id);
    if (error) alert("Erro ao atualizar: " + error.message);
    else {
      setIdEditando(null);
      setSalvando(false);
      carregarLancamentos();
    }
  };

  const excluirLancamento = async (id: number) => {
    if (!confirm("Tem certeza que deseja apagar este registo?")) return;
    const { error } = await supabase.from('ads_campanhas_lancamentos').delete().eq('id', id);
    if (error) alert("Erro ao excluir: " + error.message);
    else carregarLancamentos();
  };

  const selecionarTodosCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelecionadosIds(lancamentos.map(i => i.id));
    else setSelecionadosIds([]);
  };

  const selecionarLinhaCheckbox = (id: number) => {
    if (selecionadosIds.includes(id)) setSelecionadosIds(selecionadosIds.filter(i => i !== id));
    else setSelecionadosIds([...selecionadosIds, id]);
  };

  const excluirSelecionados = async () => {
    if (selecionadosIds.length === 0) return alert("Nenhum registo selecionado.");
    if (!confirm(`Tem certeza que deseja apagar os ${selecionadosIds.length} registos selecionados?`)) return;

    const { error } = await supabase.from('ads_campanhas_lancamentos').delete().in('id', selecionadosIds);
    if (error) alert("Erro ao excluir selecionados: " + error.message);
    else {
      alert("✅ Registos selecionados eliminados com sucesso!");
      setSelecionadosIds([]);
      carregarLancamentos();
    }
  };

  const limparCanalInteiro = async () => {
    if (!confirm(`ATENÇÃO: Tem certeza que deseja apagar TODOS os registos do canal "${canalSelecionado}" para o período ${mesSelecionado}?`)) return;

    const { error } = await supabase
      .from('ads_campanhas_lancamentos')
      .delete()
      .eq('canal', canalSelecionado)
      .eq('mes_referencia', mesSelecionado);

    if (error) alert("Erro ao limpar canal: " + error.message);
    else {
      alert(`🗑️ Todos os registos de "${canalSelecionado}" (${mesSelecionado}) foram eliminados com sucesso!`);
      setSelecionadosIds([]);
      carregarLancamentos();
    }
  };

  // ==================== PROCESSAMENTO DE SUGESTÕES VIA COORDENADAS ====================

  const handleUploadPlanilhaSugestao = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (!matrix || matrix.length === 0) {
          alert("A planilha está vazia.");
          return;
        }

        setMatrizPlanilha(matrix);
      } catch (err: any) {
        alert("Erro ao ler o ficheiro: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleMapeamentoChange = (campo: string, valor: string) => {
    const parsed = extrairLetraERow(valor);
    if (parsed.linha && !isNaN(parsed.linha)) {
      setLinhaInicial(String(parsed.linha));
    }

    if (campo === "sku") setColunaSku(valor.toUpperCase());
    if (campo === "pdv") setColunaPdv(valor.toUpperCase());
    if (campo === "repasse") setColunaRepasse(valor.toUpperCase());
    if (campo === "qtd") setColunaQtd(valor.toUpperCase());
    if (campo === "rebate") setColunaRebate(valor.toUpperCase());

    salvarConfiguracoesSugestao(canalSugestao, {
      [campo === "sku" ? "colunaSku" :
       campo === "pdv" ? "colunaPdv" :
       campo === "repasse" ? "colunaRepasse" :
       campo === "qtd" ? "colunaQtd" : "colunaRebate"]: valor.toUpperCase(),
      linhaInicial: parsed.linha ? String(parsed.linha) : linhaInicial
    });
  };

  const calcularSugestoes = () => {
    if (!matrizPlanilha || matrizPlanilha.length === 0) {
      alert("Por favor, carregue uma planilha primeiro.");
      return;
    }

    const { coluna: cSku } = extrairLetraERow(colunaSku);
    const { coluna: cPdv } = extrairLetraERow(colunaPdv);
    const { coluna: cRepasse } = extrairLetraERow(colunaRepasse);
    const { coluna: cQtd } = extrairLetraERow(colunaQtd);
    const { coluna: cRebate } = extrairLetraERow(colunaRebate);

    if (!cSku || !cPdv || !cRepasse || !cQtd) {
      alert("Por favor, preencha as letras das colunas de SKU, PDV, Repasse e Quantidade.");
      return;
    }

    salvarConfiguracoesSugestao(canalSugestao);

    const idxSku = colLetraParaIndice(cSku);
    const idxPdv = colLetraParaIndice(cPdv);
    const idxRepasse = colLetraParaIndice(cRepasse);
    const idxQtd = colLetraParaIndice(cQtd);
    const idxRebate = cRebate ? colLetraParaIndice(cRebate) : -1;

    const startRowIndex = Math.max(0, parseInt(linhaInicial, 10) - 1 || 0);
    const impostoPct = Number(aliquotaImposto.replace(",", ".")) || 0;

    const mapaAgrupado = new Map<string, {
      sku: string;
      produto: string;
      quantidade: number;
      pdvTotal: number;
      repasseTotal: number;
      rebateTotal: number;
      custoUnitario: number;
      custoTotal: number;
      impostoTotal: number;
      liquidezValor: number;
    }>();

    for (let r = startRowIndex; r < matrizPlanilha.length; r++) {
      const row = matrizPlanilha[r];
      if (!row || row.length === 0) continue;

      const skuOriginal = String(row[idxSku] || "").trim();
      const skuKey = normalizarSku(skuOriginal);
      if (!skuKey || skuKey === "sku" || skuKey === "codigo" || skuKey === "total") continue;

      const pdv = parseNumero(row[idxPdv]);
      const repasse = parseNumero(row[idxRepasse]);
      const qtd = parseNumero(row[idxQtd]) || 1;
      const rebate = idxRebate >= 0 ? parseNumero(row[idxRebate]) : 0;

      const custoData = custosMap.get(skuKey);
      const custoUnitario = Number(custoData?.custo_unitario || 0);
      const produtoNome = custoData?.produto || "Produto sem cadastro de custo";

      const impostoLinha = pdv * (impostoPct / 100);
      const custoLinha = qtd * custoUnitario;

      // Execução da fórmula
      let liquidezLinha = 0;
      try {
        let formulaProcessada = formulaLiquidez
          .replace(/\bCUSTO\b/gi, String(custoUnitario))
          .replace(/\bIMPOSTO\s*%/gi, `(${impostoPct}/100)`)
          .replace(/\bIMPOSTO\s*\/\s*100\b/gi, `(${impostoPct}/100)`)
          .replace(/\bIMPOSTO\b/gi, `(${impostoPct}/100)`)
          .replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

        // Substituição das células por coluna linha a linha
        formulaProcessada = formulaProcessada.replace(/\b([A-Za-z]+)\d+\b/g, (_match, colLetters) => {
          const cIndex = colLetraParaIndice(colLetters);
          if (cIndex >= 0 && cIndex < row.length) {
            return String(parseNumero(row[cIndex]));
          }
          return "0";
        });

        // Letras avulsas
        formulaProcessada = formulaProcessada.replace(/\b([A-Za-z]{1,2})\b/g, (match) => {
          const cIndex = colLetraParaIndice(match);
          if (cIndex >= 0 && cIndex < row.length) {
            return String(parseNumero(row[cIndex]));
          }
          return "0";
        });

        if (/^[0-9+\-*/().\s]+$/.test(formulaProcessada)) {
          liquidezLinha = Function(`"use strict"; return (${formulaProcessada})`)();
        } else {
          liquidezLinha = repasse - impostoLinha - custoLinha + rebate;
        }
      } catch {
        liquidezLinha = repasse - impostoLinha - custoLinha + rebate;
      }

      if (mapaAgrupado.has(skuKey)) {
        const item = mapaAgrupado.get(skuKey)!;
        item.quantidade += qtd;
        item.pdvTotal += pdv;
        item.repasseTotal += repasse;
        item.rebateTotal += rebate;
        item.custoTotal += custoLinha;
        item.impostoTotal += impostoLinha;
        item.liquidezValor += liquidezLinha;
      } else {
        mapaAgrupado.set(skuKey, {
          sku: skuOriginal,
          produto: produtoNome,
          quantidade: qtd,
          pdvTotal: pdv,
          repasseTotal: repasse,
          rebateTotal: rebate,
          custoUnitario: custoUnitario,
          custoTotal: custoLinha,
          impostoTotal: impostoLinha,
          liquidezValor: liquidezLinha
        });
      }
    }

    const lista = Array.from(mapaAgrupado.values()).map(item => {
      const margemPct = item.pdvTotal > 0 ? (item.liquidezValor / item.pdvTotal) * 100 : 0;
      return {
        ...item,
        liquidezMargemPct: margemPct
      };
    });

    setSugestoesCalculadas(lista);
  };

  // Ordenação com rigor semântico entre Liquidez R$ e Margem %
  const sugestoesExibidas = [...sugestoesCalculadas]
    .filter(item => {
      const matchBusca = !pesquisaSkuSugestao || 
        item.sku.toLowerCase().includes(pesquisaSkuSugestao.toLowerCase()) || 
        item.produto.toLowerCase().includes(pesquisaSkuSugestao.toLowerCase());
      const matchPositivo = !apenasPositivos || item.liquidezValor > 0;
      return matchBusca && matchPositivo;
    })
    .sort((a, b) => {
      if (filtroSugestao === "vendas") return b.quantidade - a.quantidade;
      if (filtroSugestao === "liquidez_valor") return b.liquidezValor - a.liquidezValor; // Dinheiro real em caixa
      if (filtroSugestao === "liquidez_pct") return b.liquidezMargemPct - a.liquidezMargemPct; // Eficiência percentual
      return 0;
    });

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Unificado de Ads & Campanhas</h1>
            <p className="text-sm font-medium text-slate-400">Gestão e Performance de Ads por Canal</p>
          </div>
          <Navbar />
        </div>

        {/* NAVEGAÇÃO ENTRE ABAS */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => setSubAba("campanhas")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              subAba === "campanhas" ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            📋 Campanhas por Canal
          </button>
          <button
            onClick={() => setSubAba("dashboard")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              subAba === "dashboard" ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            📊 Dashboard Comparativo
          </button>
          <button
            onClick={() => setSubAba("budget")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              subAba === "budget" ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            ⚖️ Disponibilizado x Usado
          </button>
          <button
            onClick={() => setSubAba("sugestoes")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              subAba === "sugestoes" ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            💡 Sugestões de Ads
          </button>
        </div>

        {/* ===================== ABA 1: CAMPANHAS ===================== */}
        {subAba === "campanhas" && (
          <>
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-6">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Selecione o Canal (Ativos para Ads):</label>
              <div className="flex flex-wrap gap-2.5">
                {canaisAtivos.map((c, i) => {
                  const ativo = canalSelecionado === c.canal;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCanalSelecionado(c.canal)}
                      className={`px-5 py-2.5 rounded-xl font-bold text-xs tracking-wide cursor-pointer transition-all shadow-sm ${
                        ativo 
                          ? 'bg-purple-600 text-white shadow-purple-900/40 shadow-md scale-105' 
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {c.canal}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8 flex items-center gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Selecione o Mês / Período:</label>
                <select 
                  value={mesSelecionado} 
                  onChange={(e) => setMesSelecionado(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer min-w-[180px]"
                >
                  {mesesCompetencia.map((m, i) => <option key={i} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
              <h2 className="text-lg font-bold text-white mb-2">➕ Lançamento de Anúncios</h2>
              <p className="text-xs text-slate-400 mb-6">
                Insira o MLB, SKU, Unidades e Receita Ads para o canal <strong>{canalSelecionado}</strong> ({mesSelecionado}). <br/>
                <span className="text-purple-400 font-bold">Dica:</span> Inicie o ID com <strong>LIVE</strong> para distribuir um investimento único por vários SKUs vendidos.
              </p>

              <form onSubmit={salvarLancamentos} className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="p-3">MLB / ID</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 text-center">Unidades</th>
                        <th className="p-3 text-right">Receita Ads (R$)</th>
                        <th className="p-3 text-right">Investimento Ads (R$)</th>
                        <th className="p-3 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {linhas.map((l, index) => {
                        const isLive = l.mlb.trim().toUpperCase().startsWith("LIVE");

                        return (
                          <React.Fragment key={index}>
                            <tr className="bg-slate-950/40">
                              <td className="p-2">
                                <input 
                                  type="text" 
                                  value={l.mlb} 
                                  onChange={(e) => atualizarLinhaForm(index, "mlb", e.target.value)}
                                  placeholder="Ex: MLB4384... ou LIVE_..." 
                                  className={`w-full bg-slate-900 border ${isLive ? 'border-purple-600 text-purple-400 font-black' : 'border-slate-700 text-white'} rounded-lg p-2 text-xs font-mono outline-none uppercase`}
                                  required 
                                />
                              </td>
                              <td className="p-2">
                                <input 
                                  type="text" 
                                  value={isLive ? "Múltiplos (Live)" : l.sku} 
                                  onChange={(e) => atualizarLinhaForm(index, "sku", e.target.value)}
                                  placeholder="Ex: 22362042067" 
                                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono outline-none ${isLive ? 'text-slate-500 opacity-60 cursor-not-allowed' : 'text-white'}`}
                                  required={!isLive}
                                  disabled={isLive} 
                                />
                              </td>
                              <td className="p-2">
                                <input 
                                  type="number" 
                                  value={l.unidades} 
                                  onChange={(e) => atualizarLinhaForm(index, "unidades", e.target.value)}
                                  placeholder="0" 
                                  className={`w-24 mx-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center outline-none ${isLive ? 'text-purple-400 font-bold opacity-80 cursor-not-allowed' : 'text-white'}`} 
                                  required={!isLive}
                                  disabled={isLive}
                                />
                              </td>
                              <td className="p-2">
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  value={l.receitaAds} 
                                  onChange={(e) => atualizarLinhaForm(index, "receitaAds", e.target.value)}
                                  placeholder="0.00" 
                                  className={`w-32 ml-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono outline-none ${isLive ? 'text-emerald-400 font-bold opacity-80 cursor-not-allowed' : 'text-white'}`} 
                                  required={!isLive}
                                  disabled={isLive}
                                />
                              </td>
                              <td className="p-2">
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  value={l.investimento} 
                                  onChange={(e) => atualizarLinhaForm(index, "investimento", e.target.value)}
                                  placeholder="0.00" 
                                  className={`w-32 ml-auto block bg-slate-900 border ${isLive ? 'border-purple-600/50 focus:border-purple-500' : 'border-slate-700'} rounded-lg p-2 text-xs text-right font-mono text-white outline-none`} 
                                />
                              </td>
                              <td className="p-2 text-center">
                                {linhas.length > 1 && (
                                  <button 
                                    type="button" 
                                    onClick={() => removerLinhaForm(index)}
                                    className="bg-rose-950/60 text-rose-400 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer hover:bg-rose-900"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            </tr>
                            
                            {isLive && (
                              <tr className="bg-purple-950/10 border-b border-purple-900/30">
                                <td colSpan={6} className="p-4 pl-8">
                                  <div className="bg-slate-950/50 p-4 rounded-xl border border-purple-900/30">
                                    <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-wider mb-3">↳ Produtos vendidos na Live (Rateio de Investimento)</h4>
                                    <div className="space-y-2">
                                      {l.itensLive.map((sub, subIdx) => (
                                        <div key={subIdx} className="flex flex-wrap items-center gap-3">
                                          <div className="flex-1">
                                            <input type="text" placeholder="SKU do Produto" value={sub.sku} onChange={(e) => atualizarItemLive(index, subIdx, "sku", e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-purple-500" required />
                                          </div>
                                          <div className="w-24">
                                            <input type="number" placeholder="Unidades" value={sub.unidades} onChange={(e) => atualizarItemLive(index, subIdx, "unidades", e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center text-white outline-none focus:border-purple-500" required />
                                          </div>
                                          <div className="w-32">
                                            <input type="number" step="0.01" placeholder="Receita (R$)" value={sub.receitaAds} onChange={(e) => atualizarItemLive(index, subIdx, "receitaAds", e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-white outline-none focus:border-purple-500" required />
                                          </div>
                                          <div>
                                            {l.itensLive.length > 1 && (
                                              <button type="button" onClick={() => removerItemLive(index, subIdx)} className="text-rose-400 hover:text-rose-300 font-bold px-2 py-1">✕</button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                      <button type="button" onClick={() => adicionarItemLive(index)} className="mt-2 text-[10px] font-bold uppercase text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                        <span>+ Adicionar Produto à Live</span>
                                      </button>
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
                    onClick={adicionarLinhaForm}
                    className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                  >
                    + Adicionar Outra Linha
                  </button>

                  <button 
                    type="submit" 
                    disabled={salvando}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg"
                  >
                    {salvando ? "A calcular e gravar..." : "🚀 Gravar e Calcular Anúncios"}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Relatório Consolidado ({canalSelecionado} - {mesSelecionado})</h2>
                  <p className="text-xs text-slate-400 mt-1">Demonstrativo completo com custos, tarifas, impostos, fretes e margens calculadas.</p>
                </div>

                <div className="flex items-center gap-3">
                  {selecionadosIds.length > 0 && (
                    <button 
                      onClick={excluirSelecionados} 
                      className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                    >
                      🗑️ Excluir Selecionados ({selecionadosIds.length})
                    </button>
                  )}
                  <button 
                    onClick={limparCanalInteiro} 
                    className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                  >
                    🗑️ Excluir Tudo do Canal ({canalSelecionado})
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="p-8 text-center text-slate-400 font-medium">A carregar registos...</p>
              ) : lancamentos.length === 0 ? (
                <p className="p-8 text-center text-slate-500 font-medium">Nenhum registo encontrado para este canal no período selecionado.</p>
              ) : (
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-3 text-center w-10">
                          <input 
                            type="checkbox" 
                            onChange={selecionadosIds.length > 0 ? undefined : selecionarTodosCheckbox}
                            checked={lancamentos.length > 0 && selecionadosIds.length === lancamentos.length}
                            className="cursor-pointer accent-purple-600 rounded"
                          />
                        </th>
                        <th className="p-3">MLB / ID</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Produto</th>
                        <th className="p-3 text-center">Unid.</th>
                        <th className="p-3 text-right">Receita Ads</th>
                        <th className="p-3 text-right">Investimento</th>
                        <th className="p-3 text-right">Custo Produto</th>
                        <th className="p-3 text-right">Imposto</th>
                        <th className="p-3 text-right">Tarifa</th>
                        <th className="p-3 text-right">Embalagem</th>
                        <th className="p-3 text-right">Frete</th>
                        <th className="p-3 text-right">ROAS</th>
                        <th className="p-3 text-right">TACOS</th>
                        <th className="p-3 text-right">Margem R$</th>
                        <th className="p-3 text-right">Margem %</th>
                        <th className="p-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {lancamentos.map((item) => {
                        const isEditing = idEditando === item.id;
                        const isSelected = selecionadosIds.includes(item.id);
                        const roas = item.investimento > 0 ? (item.retorno_bruto / item.investimento).toFixed(2) : "0.00";
                        const tacos = item.faturamento_total > 0 ? ((item.investimento / item.faturamento_total) * 100).toFixed(2) : "0.00";
                        const margemVal = Number(item.margem_liquida_rs || 0);
                        const margemPct = Number(item.margem_liquida_pct || 0) * 100;

                        return (
                          <tr key={item.id} className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-purple-950/20' : ''}`}>
                            <td className="p-3 text-center">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => selecionarLinhaCheckbox(item.id)}
                                className="cursor-pointer accent-purple-600 rounded"
                              />
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-200">
                              {isEditing ? <input type="text" value={dadosEdicao.identificador_anuncio} onChange={(e) => setDadosEdicao({ ...dadosEdicao, identificador_anuncio: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-28 text-white" /> : item.identificador_anuncio}
                            </td>
                            <td className="p-3 font-mono text-slate-400">
                              {isEditing ? <input type="text" value={dadosEdicao.sku} onChange={(e) => setDadosEdicao({ ...dadosEdicao, sku: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-white" /> : item.sku}
                            </td>
                            <td className="p-3 text-slate-300 max-w-[200px] truncate">{item.nome_anuncio}</td>
                            <td className="p-3 text-center font-bold text-white">
                              {isEditing ? <input type="number" value={dadosEdicao.unidades_vendidas} onChange={(e) => setDadosEdicao({ ...dadosEdicao, unidades_vendidas: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-16 text-center text-white" /> : item.unidades_vendidas}
                            </td>
                            <td className="p-3 text-right font-mono text-emerald-400 font-bold">
                              {isEditing ? <input type="number" step="0.01" value={dadosEdicao.retorno_bruto} onChange={(e) => setDadosEdicao({ ...dadosEdicao, retorno_bruto: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-right text-white" /> : formatarMoeda(item.retorno_bruto)}
                            </td>
                            <td className="p-3 text-right font-mono text-rose-400">
                              {isEditing ? <input type="number" step="0.01" value={dadosEdicao.investimento} onChange={(e) => setDadosEdicao({ ...dadosEdicao, investimento: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-right text-white" /> : formatarMoeda(item.investimento)}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(item.custo_produto || 0)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(item.imposto || 0)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(item.tarifa || 0)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(item.embalagem || 0)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(item.frete || 0)}</td>
                            <td className="p-3 text-right font-mono font-bold text-indigo-400">{roas}x</td>
                            <td className="p-3 text-right font-mono font-bold text-amber-400">{tacos}%</td>
                            <td className={`p-3 text-right font-mono font-bold ${margemVal >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>{formatarMoeda(margemVal)}</td>
                            <td className={`p-3 text-right font-mono font-bold ${margemPct >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>{margemPct.toFixed(1)}%</td>
                            <td className="p-3 text-center flex items-center justify-center gap-2">
                              {isEditing ? (
                                <>
                                  <button onClick={() => salvarEdicao(item.id)} className="bg-emerald-600 text-white px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Salvar</button>
                                  <button onClick={() => setIdEditando(null)} className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-[11px] font-bold cursor-pointer">Cancelar</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => iniciarEdicao(item)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Editar</button>
                                  <button onClick={() => excluirLancamento(item.id)} className="bg-rose-950/60 hover:bg-rose-900/60 text-rose-400 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">Remover</button>
                                </>
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
          </>
        )}

        {/* ===================== ABA 2: DASHBOARD ===================== */}
        {subAba === "dashboard" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Dashboard Comparativo de Performance & Budget</h2>
                <p className="text-xs text-slate-400 mt-1">Comparativo entre o período selecionado e o período anterior.</p>
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Período Atual:</label>
                  <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none">
                    {mesesCompetencia.map((m, i) => <option key={i} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Período Comparativo:</label>
                  <select value={mesComparativo} onChange={(e) => setMesComparativo(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none">
                    {mesesCompetencia.map((m, i) => <option key={i} value={m}>{m}</option>)}
                  </select>
                </div>
                <button 
                  onClick={() => setOcultarComparacao(!ocultarComparacao)}
                  className="mt-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-2.5 px-4 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                >
                  {ocultarComparacao ? "👁️ Mostrar Comparação" : "👁️ Ocultar Comparação"}
                </button>
              </div>
            </div>

            <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800 mb-8">
              <div className="flex flex-wrap items-center justify-between mb-4">
                <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-wider">💰 Inserir Faturamento Total do Canal (Orgânico + Ads) - {mesSelecionado}</h3>
                <div className="flex items-center gap-2 bg-purple-900/30 border border-purple-800/50 px-3 py-1.5 rounded-lg">
                  <span className="text-[10px] font-bold text-purple-300 uppercase">Meta TACOS Global:</span>
                  <span className="text-white font-bold text-xs">{metaTacosGlobal}%</span>
                  <span className="text-[9px] text-purple-400 ml-1">(Definido na aba Regras)</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {canaisAtivos.map(c => {
                  const valorAtual = dadosComparativo.find(d => d.canal === c.canal)?.totFatAtual_bruto || "";
                  return (
                    <div key={c.canal}>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{c.canal}</label>
                      <input 
                        type="text" 
                        defaultValue={valorAtual} 
                        onBlur={(e) => salvarFaturamentoEGasto(c.canal, "faturamento_total", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-emerald-400 outline-none focus:border-purple-500"
                        placeholder="Ex: 153.000,00"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-slate-500 mt-3">* Ao clicar fora do campo, o valor é salvo. O TACOS e Budget Sugerido ajustam-se automaticamente à sua meta definida acima.</p>
            </div>

            {loading ? (
              <p className="p-8 text-center text-slate-400">A processar comparativo...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Canal</th>
                      <th className="p-3 text-right">Fat. Ads (Atual)</th>
                      {!ocultarComparacao && <th className="p-3 text-right">Fat. Ads (Anterior)</th>}
                      {!ocultarComparacao && <th className="p-3 text-right">Dif. Ads (R$)</th>}
                      <th className="p-3 text-right">ROAS Atual</th>
                      {!ocultarComparacao && <th className="p-3 text-right">ROAS Anterior</th>}
                      <th className="p-3 text-right">TACOS Atual</th>
                      {!ocultarComparacao && <th className="p-3 text-right">TACOS Anterior</th>}
                      <th className="p-3 text-right">Margem Líq. R$ (Atual)</th>
                      {!ocultarComparacao && <th className="p-3 text-right">Margem Líq. R$ (Ant)</th>}
                      {!ocultarComparacao && <th className="p-3 text-right">Dif. Margem R$</th>}
                      <th className="p-3 text-right">Total Faturado</th>
                      <th className="p-3 text-right">Rep. Ads %</th>
                      <th className="p-3 text-right">TACOS Sugerido (Budget)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {dadosComparativo.map((d, idx) => {
                      const tacosSugeridoDinamico = (d.totFatAtual * metaTacosGlobal) / 100;
                      
                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-bold text-white">{d.canal}</td>
                          <td className="p-3 text-right font-mono text-emerald-400">{formatarMoeda(d.fatAdsAtual)}</td>
                          {!ocultarComparacao && <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(d.fatAdsAnt)}</td>}
                          {!ocultarComparacao && (
                            <td className={`p-3 text-right font-mono font-bold ${d.diffAds >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                              {d.diffAds >= 0 ? '+' : ''}{formatarMoeda(d.diffAds)}
                            </td>
                          )}
                          <td className="p-3 text-right font-mono text-indigo-400 font-bold">{d.roasAtual.toFixed(2)}x</td>
                          {!ocultarComparacao && <td className="p-3 text-right font-mono text-slate-300">{d.roasAnt.toFixed(2)}x</td>}
                          <td className="p-3 text-right font-mono text-amber-400 font-bold">{d.tacosAtual.toFixed(2)}%</td>
                          {!ocultarComparacao && <td className="p-3 text-right font-mono text-slate-300">{d.tacosAnt.toFixed(2)}%</td>}
                          <td className="p-3 text-right font-mono text-emerald-300">{formatarMoeda(d.margemRsAtual)}</td>
                          {!ocultarComparacao && <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(d.margemRsAnt)}</td>}
                          {!ocultarComparacao && (
                            <td className={`p-3 text-right font-mono font-bold ${d.diffMargemRs >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                              {d.diffMargemRs >= 0 ? '+' : ''}{formatarMoeda(d.diffMargemRs)}
                            </td>
                          )}
                          <td className="p-3 text-right font-mono text-white">{formatarMoeda(d.totFatAtual)}</td>
                          <td className="p-3 text-right font-mono text-violet-400 font-bold">{d.repAds.toFixed(2)}%</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatarMoeda(tacosSugeridoDinamico)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===================== ABA 3: BUDGET ===================== */}
        {subAba === "budget" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Disponibilizado x Usado</h2>
                <p className="text-xs text-slate-400 mt-1">Comparativo entre o Budget Sugerido do Mês Anterior e o Valor Realmente Gasto no Mês Atual.</p>
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mês de Referência (Gasto):</label>
                  <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none">
                    {mesesCompetencia.map((m, i) => <option key={i} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Base do TACOS (Anterior):</label>
                  <select value={mesComparativo} onChange={(e) => setMesComparativo(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none">
                    {mesesCompetencia.map((m, i) => <option key={i} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {loading ? (
              <p className="p-8 text-center text-slate-400">A processar dados de budget...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-4">Canal</th>
                      <th className="p-4 text-right">Budget Mês Anterior (Disponível)</th>
                      <th className="p-4 text-right w-48">Valor Gasto (Inserir)</th>
                      <th className="p-4 text-right">Saldo</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {dadosComparativo.map((d, idx) => {
                      const budgetDisponivel = (d.totFatAnt * metaTacosGlobal) / 100;
                      const valorGastoReal = Number(d.gastoAdsBrutoAtual || 0);
                      const saldo = budgetDisponivel - valorGastoReal;
                      const status = saldo >= 0 ? "Dentro do Budget" : "Estourou Budget";

                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 font-bold text-white">{d.canal}</td>
                          <td className="p-4 text-right font-mono font-bold text-emerald-400">{formatarMoeda(budgetDisponivel)}</td>
                          <td className="p-4 text-right">
                            <input 
                              type="text" 
                              defaultValue={d.gastoAdsBrutoAtual} 
                              onBlur={(e) => salvarFaturamentoEGasto(d.canal, "gasto_ads", e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-purple-500 text-right"
                              placeholder="Ex: 1530,00"
                            />
                          </td>
                          <td className={`p-4 text-right font-mono font-black ${saldo >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                            {saldo >= 0 ? '+' : ''}{formatarMoeda(saldo)}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${saldo >= 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50' : 'bg-rose-950/60 text-rose-400 border border-rose-900/50'}`}>
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===================== ABA 4: SUGESTÕES DE ADS ===================== */}
        {subAba === "sugestoes" && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span>💡 Análise de Vendas e Sugestões para Ads</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Insira as coordenadas das colunas (ex: <strong>W7</strong>, <strong>I7</strong>) para ler os dados da planilha e calcular a liquidez de cada SKU.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Memória Volátil:</span>
                  <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-mono">
                    {matrizPlanilha.length} linhas carregadas
                  </span>
                </div>
              </div>

              {/* SELEÇÃO DE CANAL E UPLOAD */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">1. Selecione o Canal:</label>
                  <select
                    value={canalSugestao}
                    onChange={(e) => setCanalSugestao(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer"
                  >
                    {canaisAtivos.map((c, i) => (
                      <option key={i} value={c.canal}>{c.canal}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">2. Ficheiro de Vendas (.xlsx, .xls, .csv):</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleUploadPlanilhaSugestao}
                    className="w-full bg-slate-950 border border-slate-700 file:border-0 file:bg-purple-600 file:text-white file:text-xs file:font-bold file:py-2.5 file:px-4 file:rounded-lg file:mr-4 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer"
                  />
                </div>
              </div>

              {/* MAPEAMENTO DAS COORDENADAS / COLUNAS */}
              <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black text-purple-400 uppercase tracking-wider">
                    📌 Mapeamento de Colunas / Coordenadas ({canalSugestao || "Canal"})
                  </h3>
                  <span className="text-[10px] text-slate-500">* Salvo no navegador para este canal</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha Inicial:</label>
                    <input
                      type="number"
                      value={linhaInicial}
                      onChange={(e) => {
                        setLinhaInicial(e.target.value);
                        salvarConfiguracoesSugestao(canalSugestao, { linhaInicial: e.target.value });
                      }}
                      placeholder="7"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna SKU:</label>
                    <input
                      type="text"
                      value={colunaSku}
                      onChange={(e) => handleMapeamentoChange("sku", e.target.value)}
                      placeholder="W7 ou W"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna PDV:</label>
                    <input
                      type="text"
                      value={colunaPdv}
                      onChange={(e) => handleMapeamentoChange("pdv", e.target.value)}
                      placeholder="I7 ou I"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Repasse:</label>
                    <input
                      type="text"
                      value={colunaRepasse}
                      onChange={(e) => handleMapeamentoChange("repasse", e.target.value)}
                      placeholder="S7 ou S"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Qtd:</label>
                    <input
                      type="text"
                      value={colunaQtd}
                      onChange={(e) => handleMapeamentoChange("qtd", e.target.value)}
                      placeholder="H7 ou H"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Rebate:</label>
                    <input
                      type="text"
                      value={colunaRebate}
                      onChange={(e) => handleMapeamentoChange("rebate", e.target.value)}
                      placeholder="Opcional"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* CAMPOS FIXOS: IMPOSTO E FÓRMULA DE LIQUIDEZ */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Alíquota Imposto (%):</label>
                  <input
                    type="text"
                    value={aliquotaImposto}
                    onChange={(e) => {
                      setAliquotaImposto(e.target.value);
                      salvarConfiguracoesSugestao(canalSugestao, { aliquotaImposto: e.target.value });
                    }}
                    placeholder="9"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-emerald-400 outline-none"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Fórmula de Liquidez (Ex: S - (H * CUSTO) - (I * IMPOSTO)):
                  </label>
                  <input
                    type="text"
                    value={formulaLiquidez}
                    onChange={(e) => {
                      setFormulaLiquidez(e.target.value);
                      salvarConfiguracoesSugestao(canalSugestao, { formulaLiquidez: e.target.value });
                    }}
                    placeholder="S - (H * CUSTO) - (I * IMPOSTO)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-purple-300 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={calcularSugestoes}
                  disabled={matrizPlanilha.length === 0}
                  className={`py-3 px-8 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg ${
                    matrizPlanilha.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                  }`}
                >
                  ⚡ Executar Motor & Calcular Sugestões
                </button>
              </div>
            </div>

            {/* TABELA DE RESULTADOS DAS SUGESTÕES */}
            {sugestoesCalculadas.length > 0 && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Ranking de Sugestões de Ads ({canalSugestao})</h3>
                    <p className="text-xs text-slate-400 mt-1">Produtos calculados linha a linha a partir da linha {linhaInicial} com a fórmula definida.</p>
                  </div>

                  {/* FILTROS E ORDENAÇÃO */}
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      placeholder="Pesquisar SKU ou Produto..."
                      value={pesquisaSkuSugestao}
                      onChange={(e) => setPesquisaSkuSugestao(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-48"
                    />

                    <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                      <button
                        onClick={() => setFiltroSugestao("vendas")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          filtroSugestao === "vendas" ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        🔥 Mais Vendas
                      </button>
                      <button
                        onClick={() => setFiltroSugestao("liquidez_valor")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          filtroSugestao === "liquidez_valor" ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                        title="Ordena pelo valor bruto em R$ que sobra em caixa"
                      >
                        💰 Maior Liquidez R$
                      </button>
                      <button
                        onClick={() => setFiltroSugestao("liquidez_pct")}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          filtroSugestao === "liquidez_pct" ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                        title="Ordena pela margem percentual de lucro sobre o faturamento"
                      >
                        📈 Maior Margem %
                      </button>
                    </div>

                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer pl-2">
                      <input
                        type="checkbox"
                        checked={apenasPositivos}
                        onChange={(e) => setApenasPositivos(e.target.checked)}
                        className="rounded accent-purple-600"
                      />
                      <span>Apenas Positivos</span>
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-3 text-center">#</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 min-w-[220px]">Produto</th>
                        <th className="p-3 text-center">Qtd Vendida</th>
                        <th className="p-3 text-right">PDV Total</th>
                        <th className="p-3 text-right">Repasse Total</th>
                        <th className="p-3 text-right">Custo Unitário</th>
                        <th className="p-3 text-right">Custo Total</th>
                        <th className="p-3 text-right">Imposto Estimado</th>
                        <th className="p-3 text-right">Rebate</th>
                        <th className="p-3 text-right">Liquidez R$</th>
                        <th className="p-3 text-right">Margem Líq. %</th>
                        <th className="p-3 text-center">Recomendação Ads</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {sugestoesExibidas.map((item, idx) => {
                        const margem = item.liquidezMargemPct;
                        const liquidezR = item.liquidezValor;
                        const permiteRisco = liquidezR >= 40.0;

                        return (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-white">{item.sku}</td>
                            <td className="p-3 text-slate-300 max-w-[240px] truncate" title={item.produto}>{item.produto}</td>
                            <td className="p-3 text-center font-bold text-indigo-400">{item.quantidade}</td>
                            <td className="p-3 text-right font-mono text-slate-200">{formatarMoeda(item.pdvTotal)}</td>
                            <td className="p-3 text-right font-mono text-slate-200">{formatarMoeda(item.repasseTotal)}</td>
                            <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.custoUnitario)}</td>
                            <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.custoTotal)}</td>
                            <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.impostoTotal)}</td>
                            <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.rebateTotal)}</td>
                            <td className={`p-3 text-right font-mono font-bold ${liquidezR >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                              {formatarMoeda(liquidezR)}
                            </td>
                            <td className={`p-3 text-right font-mono font-bold ${margem >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                              {margem.toFixed(1)}%
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                {liquidezR <= 0 ? (
                                  <span className="bg-rose-950/80 text-rose-300 border border-rose-700/60 px-2.5 py-0.5 rounded text-[10px] font-bold">
                                    ❌ Prejuízo / Não Usar
                                  </span>
                                ) : margem >= 15 ? (
                                  <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 px-2.5 py-0.5 rounded text-[10px] font-bold">
                                    🌟 Forte Potencial
                                  </span>
                                ) : margem >= 12 ? (
                                  <span className="bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 px-2.5 py-0.5 rounded text-[10px] font-bold">
                                    ✅ Viável p/ Ads
                                  </span>
                                ) : margem <= 10 ? (
                                  <span className="bg-rose-950/80 text-rose-300 border border-rose-700/60 px-2.5 py-0.5 rounded text-[10px] font-bold">
                                    ⚠️ Margem Baixa
                                  </span>
                                ) : (
                                  <span className="bg-amber-950/80 text-amber-300 border border-amber-700/60 px-2.5 py-0.5 rounded text-[10px] font-bold">
                                    ⚠️ Margem Regular
                                  </span>
                                )}

                                {permiteRisco && (
                                  <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 px-2 py-0.5 rounded text-[9px] font-bold">
                                    🛡️ Liquidez permite risco
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAL DE INTERCEÇÃO: PREENCHIMENTO DE MLB SEM COMISSÃO */}
        {showModalMLB && (
          <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
              
              <div className="p-6 border-b border-slate-800">
                <h2 className="text-xl font-black text-rose-400 flex items-center gap-2">⚠️ Atenção: Informações Ausentes</h2>
                <p className="text-xs text-slate-400 mt-2">
                  Os seguintes anúncios do Mercado Livre <strong className="text-white">não possuem percentual de comissão registado</strong> na base de dados. 
                  Preencha os valores reais abaixo para que as tarifas e margens sejam calculadas corretamente. Eles serão salvos no sistema para as próximas vezes.
                </p>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {mlbsPendentes.map((item, index) => (
                  <div key={index} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col lg:flex-row gap-4 lg:items-center">
                    <div className="lg:w-1/4">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">MLB / ID</p>
                      <p className="font-mono font-bold text-white text-sm truncate">{item.mlb}</p>
                    </div>
                    
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-rose-300 uppercase mb-1">Comissão % *</label>
                        <input type="number" step="0.01" value={item.comissao} onChange={(e) => atualizarDadoPendente(index, "comissao", e.target.value)} className="w-full bg-slate-900 border border-rose-500/50 rounded-lg p-2 text-xs text-white outline-none focus:border-rose-400" required />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Peso (kg)</label>
                        <input type="number" step="0.01" value={item.peso_real} onChange={(e) => atualizarDadoPendente(index, "peso_real", e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Alt. (cm)</label>
                        <input type="number" value={item.altura} onChange={(e) => atualizarDadoPendente(index, "altura", e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Larg. (cm)</label>
                        <input type="number" value={item.largura} onChange={(e) => atualizarDadoPendente(index, "largura", e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Comp. (cm)</label>
                        <input type="number" value={item.comprimento} onChange={(e) => atualizarDadoPendente(index, "comprimento", e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-4 rounded-b-2xl">
                <button 
                  onClick={() => { setShowModalMLB(false); setSalvando(false); }} 
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Cancelar e Fechar
                </button>
                <button 
                  onClick={confirmarMlbsPendentes}
                  disabled={salvando}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg"
                >
                  {salvando ? "A Processar..." : "Salvar na Base e Concluir Gravação"}
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}