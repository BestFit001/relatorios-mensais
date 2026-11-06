"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";
import { lerArquivoComoLinhas } from "../../lib/lerArquivo";

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

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  if (/e\+/i.test(s)) {
    try { s = BigInt(Math.trunc(Number(s))).toString(); } catch {}
  }
  return s.toLowerCase();
}

function skuValido(sku: string): boolean {
  const limpo = normalizarSku(sku);
  return limpo.length >= 10;
}

function parsePorcentagem(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return (valor > 0 && valor < 1) ? valor * 100 : valor;
  let s = String(valor).replace(/%/g, "").trim().replace(",", ".");
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  return (num > 0 && num < 1) ? num * 100 : num;
}

const formatarMoeda = (valor: number) =>
  "R$ " + (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CalculadoraPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [modoCalculo, setModoCalculo] = useState<"pdv_ideal" | "reversa" | "custo_ideal">("pdv_ideal");

  const [skuBusca, setSkuBusca] = useState("");
  const [marcaFiltro, setMarcaFiltro] = useState("");
  const [margemAlvo, setMargemAlvo] = useState("30");
  const [precoFixo, setPrecoFixo] = useState("60.00");
  const [precoAlvoCustoIdeal, setPrecoAlvoCustoIdeal] = useState("100.00");
  const [margemCustoIdeal, setMargemCustoIdeal] = useState("20");

  // Estado para armazenar o valor de rebate inserido por canal
  const [rebatesCanais, setRebatesCanais] = useState<{ [key: string]: string }>({});

  const [produtoEncontrado, setProdutoEncontrado] = useState<any>(null);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  
  const [mapeamentoMl1, setMapeamentoMl1] = useState<Map<string, any[]>>(new Map());
  const [mapeamentoMl2, setMapeamentoMl2] = useState<Map<string, any[]>>(new Map());
  
  const [canaisConfig, setCanaisConfig] = useState<string[]>([]);
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [canaisSelecionados, setCanaisSelecionados] = useState<string[]>([]);

  const [subAba, setSubAba] = useState<"calculadora" | "lote">("calculadora");
  // correção de custo (lápis) do produto buscado
  const [editandoCusto, setEditandoCusto] = useState(false);
  const [custoEdit, setCustoEdit] = useState("");
  const [salvandoCusto, setSalvandoCusto] = useState(false);
  const [avisoCusto, setAvisoCusto] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Precificação em lote (planilha de SKUs)
  const [custosTodos, setCustosTodos] = useState<Map<string, any>>(new Map());
  const [canalLote, setCanalLote] = useState("Mercado Livre 1 Clássico");
  const [margemLote, setMargemLote] = useState("30");
  const [processandoLote, setProcessandoLote] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<{ nomeArquivo: string; canal: string; margem: number; linhas: any[][]; total: number; calculados: number; semCusto: number; inviaveis: number } | null>(null);
  const [erroLote, setErroLote] = useState("");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }

    const listaNomesCanais = [
      "Mercado Livre 1 Clássico", 
      "Mercado Livre 1 Premium", 
      "Mercado Livre 2 Clássico", 
      "Mercado Livre 2 Premium", 
      "Amazon", "Shopee", "Magalu", "Netshoes", "Shein", "TikTok Shop", "Centauro", "Site"
    ];
    setCanaisConfig(listaNomesCanais);

    const canaisSalvosDoUsuario = localStorage.getItem(`canais_selecionados_${usuarioLogado}`);
    if (canaisSalvosDoUsuario) {
      try {
        const parsed = JSON.parse(canaisSalvosDoUsuario);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCanaisSelecionados(parsed);
        } else {
          setCanaisSelecionados(listaNomesCanais);
        }
      } catch (e) {
        setCanaisSelecionados(listaNomesCanais);
      }
    } else {
      setCanaisSelecionados(listaNomesCanais);
    }

    carregarBasesEmTempoReal();
  }, []);

  const salvarCanaisDoUsuario = (novosCanais: string[]) => {
    setCanaisSelecionados(novosCanais);
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (usuarioLogado) {
      localStorage.setItem(`canais_selecionados_${usuarioLogado}`, JSON.stringify(novosCanais));
    }
  };

  const carregarBasesEmTempoReal = async () => {
    setLoading(true);

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

    const mapaCustos = new Map();
    allCustos.forEach((c: any) => {
      const k = normalizarSku(c.sku);
      if (k && k.length >= 10) mapaCustos.set(k, c);
    });
    setCustosMap(mapaCustos);

    const mapaTodos = new Map();
    allCustos.forEach((c: any) => {
      const k = normalizarSku(c.sku);
      if (k) mapaTodos.set(k, c);
    });
    setCustosTodos(mapaTodos);

    let allMlRegras: any[] = [];
    from = 0;
    keep = true;
    while (keep) {
      const { data } = await supabase.from("ml_anuncios_regras").select("*").range(from, from + step - 1);
      if (data && data.length > 0) {
        allMlRegras = [...allMlRegras, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }

    const mapaMl1 = new Map();
    const mapaMl2 = new Map();

    allMlRegras.forEach((m: any) => {
      const k = skuValido(m.sku) ? normalizarSku(m.sku) : "";
      if (k) {
        const comissaoVal = parsePorcentagem(m.comissao);
        const info = {
          comissao: comissaoVal,
          peso_real: Number(m.peso_real || 2.0),
          altura: Number(m.altura || 10),
          largura: Number(m.largura || 10),
          comprimento: Number(m.comprimento || 10)
        };

        const canalConta = m.canal || (m.id % 2 === 0 ? "Mercado Livre 2" : "Mercado Livre 1");

        if (canalConta === "Mercado Livre 2") {
          if (!mapaMl2.has(k)) mapaMl2.set(k, []);
          mapaMl2.get(k).push(info);
        } else {
          if (!mapaMl1.has(k)) mapaMl1.set(k, []);
          mapaMl1.get(k).push(info);
        }
      }
    });

    setMapeamentoMl1(mapaMl1);
    setMapeamentoMl2(mapaMl2);

    const { data: tarifacaoData } = await supabase.from("config_regras_tarifacao").select("*");
    if (tarifacaoData) {
      setRegrasTarifacao(tarifacaoData);
    }

    setLoading(false);
  };

  const handleBuscarProduto = () => {
    const key = normalizarSku(skuBusca);
    if (!key || key.length < 10) {
      alert("Digite um SKU válido com pelo menos 10 dígitos.");
      return;
    }
    setEditandoCusto(false); setAvisoCusto(null);
    const match = custosMap.get(key);
    if (match) {
      setProdutoEncontrado(match);
    } else {
      setProdutoEncontrado({
        sku: skuBusca.trim(),
        produto: "Produto Base (Manual)",
        marca: marcaFiltro || "BEST FIT",
        custo_unitario: 25.88
      });
    }
  };

  // o produto buscado existe na base de custos (tem id)?  Se não, é só uma simulação com custo padrão.
  const produtoNaBase = Boolean(produtoEncontrado?.id);

  const abrirEdicaoCusto = () => {
    if (!produtoEncontrado) return;
    setCustoEdit(Number(produtoEncontrado.custo_unitario || 0).toFixed(2).replace(".", ","));
    setAvisoCusto(null);
    setEditandoCusto(true);
  };

  const salvarCustoProduto = async () => {
    if (!produtoEncontrado?.id) return;
    const novo = parseNumero(custoEdit);
    if (!(novo > 0)) { setAvisoCusto({ tipo: "erro", texto: "Informe um custo válido (maior que zero)." }); return; }
    setSalvandoCusto(true);
    const antigo = Number(produtoEncontrado.custo_unitario || 0);
    const { error } = await supabase.from("tabela_custos_skus").update({ custo_unitario: novo }).eq("id", produtoEncontrado.id);
    setSalvandoCusto(false);
    if (error) { setAvisoCusto({ tipo: "erro", texto: "Não consegui salvar o custo: " + error.message }); return; }
    // a base passa a ter o custo novo (calculadora, lote e demais telas leem esta tabela)
    const atualizado = { ...produtoEncontrado, custo_unitario: novo };
    const key = normalizarSku(produtoEncontrado.sku);
    setCustosMap((m) => (m.has(key) ? new Map(m).set(key, atualizado) : m));
    setCustosTodos((m) => new Map(m).set(key, atualizado));
    setProdutoEncontrado(atualizado);
    setResultadoLote(null);
    setEditandoCusto(false);
    setAvisoCusto({ tipo: "ok", texto: `Custo atualizado na base: ${formatarMoeda(antigo)} → ${formatarMoeda(novo)}.` });
  };

  const toggleCanalSelecao = (canalNome: string) => {
    let atualizados = [];
    if (canaisSelecionados.includes(canalNome)) {
      atualizados = canaisSelecionados.filter((c) => c !== canalNome);
    } else {
      atualizados = [...canaisSelecionados, canalNome];
    }
    salvarCanaisDoUsuario(atualizados);
  };

  const selecionarTodosCanais = (selecionar: boolean) => {
    if (selecionar) {
      salvarCanaisDoUsuario(canaisConfig);
    } else {
      salvarCanaisDoUsuario([]);
    }
  };

  const obterRegraCanalDaTabela = (canalNome: string, precoReferencia: number) => {
    const cLower = canalNome.toLowerCase();
    
    const regrasDoCanal = regrasTarifacao.filter((r) => {
      const rCanal = String(r.canal || "").toLowerCase();
      if (rCanal === cLower) return true;
      if ((cLower.includes("magalu") || cLower.includes("magazine")) && (rCanal.includes("magalu") || rCanal.includes("magazine"))) return true;
      if (cLower.includes("tiktok") && rCanal.includes("tiktok")) return true;
      return rCanal.includes(cLower) || cLower.includes(rCanal);
    });

    if (regrasDoCanal.length === 0) {
      return { comissao: cLower.includes("premium") ? 19 : 14, tarifa_fixa: 0, frete: 0 };
    }

    for (const regra of regrasDoCanal) {
      const faixaStr = String(regra.faixa_preco || "").toLowerCase();
      const matchNums = faixaStr.match(/[\d.,]+/g);

      if (faixaStr.includes("em diante") || faixaStr.includes("99999") || (matchNums && matchNums.length === 1)) {
        const limiteInf = matchNums ? parseNumero(matchNums[0]) : 0;
        if (precoReferencia >= limiteInf) return regra;
      } else if (matchNums && matchNums.length >= 2) {
        const min = parseNumero(matchNums[0]);
        const max = parseNumero(matchNums[1]);
        if (precoReferencia >= min && precoReferencia <= max) return regra;
      }
    }

    return regrasDoCanal[0];
  };

  // Cálculo do PDV ideal de UM canal para UM SKU (mesma regra usada nos cards e na planilha em lote)
  const calcularPdvIdealCanal = (canalNome: string, skuKey: string, custoProduto: number, margemPct: number, valRebate: number) => {
    const impostoPercent = 0.09;
    const cLower = canalNome.toLowerCase();
    const anunciosSku = (cLower.includes("mercado livre 2") ? mapeamentoMl2 : mapeamentoMl1).get(skuKey) || [];
    let comissaoPct = 0.14;
    let temMlbEncontrado = false;
    let refAnuncio: any = null;

    if (cLower.includes("mercado livre")) {
      if (cLower.includes("clássico")) {
        const matchClassico = anunciosSku.find((a: any) => a.comissao > 0 && a.comissao <= 14);
        if (matchClassico) { comissaoPct = matchClassico.comissao / 100; refAnuncio = matchClassico; temMlbEncontrado = true; }
        else { comissaoPct = 0.14; refAnuncio = anunciosSku.length > 0 ? anunciosSku[0] : null; }
      } else if (cLower.includes("premium")) {
        const matchPremium = anunciosSku.find((a: any) => a.comissao > 14);
        if (matchPremium) { comissaoPct = matchPremium.comissao / 100; refAnuncio = matchPremium; temMlbEncontrado = true; }
        else { comissaoPct = 0.19; refAnuncio = anunciosSku.length > 0 ? anunciosSku[0] : null; }
      }
    } else {
      refAnuncio = anunciosSku.length > 0 ? anunciosSku[0] : null;
    }

    const pesoReal = refAnuncio && Number(refAnuncio.peso_real) > 0 ? Number(refAnuncio.peso_real) : 2.0;
    const altura = refAnuncio && Number(refAnuncio.altura) > 0 ? Number(refAnuncio.altura) : 10;
    const largura = refAnuncio && Number(refAnuncio.largura) > 0 ? Number(refAnuncio.largura) : 10;
    const comprimento = refAnuncio && Number(refAnuncio.comprimento) > 0 ? Number(refAnuncio.comprimento) : 10;

    const margemAlvoDec = margemPct / 100;
    let pdvCalculado = custoProduto * 2;
    let inviavel = false;

    for (let iter = 0; iter < 5; iter++) {
      let tarifaFixa = 0;
      let freteVariavel = 0;
      if (cLower.includes("mercado livre")) {
        tarifaFixa = pdvCalculado < 79.00 ? 6.50 : 0.00;
        freteVariavel = calcularFreteML(pdvCalculado, pesoReal, altura, largura, comprimento);
      } else {
        const regraTabela = obterRegraCanalDaTabela(canalNome, pdvCalculado);
        comissaoPct = Number(regraTabela.comissao || 14) / 100;
        tarifaFixa = Number(regraTabela.tarifa_fixa || 0);
        freteVariavel = Number(regraTabela.frete || 0);
      }
      const denominador = 1 - (comissaoPct + impostoPercent + margemAlvoDec);
      inviavel = !(denominador > 0);
      // O rebate reduz o custo efetivo, facilitando o cálculo do PDV ideal
      const custoEfetivo = Math.max(0, custoProduto - valRebate);
      pdvCalculado = denominador > 0 ? (custoEfetivo + tarifaFixa + freteVariavel) / denominador : custoProduto * 2;
    }

    let tarifaFixaFinal = 0;
    let freteFinal = 0;
    if (cLower.includes("mercado livre")) {
      tarifaFixaFinal = pdvCalculado < 79.00 ? 6.50 : 0.00;
      freteFinal = calcularFreteML(pdvCalculado, pesoReal, altura, largura, comprimento);
    } else {
      const regraTabela = obterRegraCanalDaTabela(canalNome, pdvCalculado);
      tarifaFixaFinal = Number(regraTabela.tarifa_fixa || 0);
      freteFinal = Number(regraTabela.frete || 0);
    }

    const valorComissao = pdvCalculado * comissaoPct;
    const valorImposto = pdvCalculado * impostoPercent;
    const lucroLiquidoBase = pdvCalculado - (custoProduto + valorComissao + tarifaFixaFinal + freteFinal + valorImposto);
    const lucroLiquido = lucroLiquidoBase + valRebate;
    const margemFinal = pdvCalculado > 0 ? (lucroLiquido / pdvCalculado) * 100 : 0;

    return {
      pdv: pdvCalculado, comissaoPct, valorComissao, tarifaFixa: tarifaFixaFinal, frete: freteFinal, valorImposto,
      lucroLiquido, margemFinal, inviavel,
      temMlb: cLower.includes("mercado livre") ? (temMlbEncontrado || anunciosSku.length > 0) : true,
    };
  };

  // Planilha de SKUs (coluna A) -> mesma regra da calculadora no canal escolhido -> planilha SKU | PDV para baixar
  const handleUploadLote = async (file: File) => {
    setErroLote("");
    setResultadoLote(null);
    const margem = parseNumero(margemLote);
    if (margemLote.trim() === "" || !(margem >= 0) || margem >= 100) { setErroLote("Informe uma margem válida (entre 0 e 99,9%) antes de subir a planilha."); return; }
    if (!canalLote) { setErroLote("Selecione o canal."); return; }
    setProcessandoLote(true);
    try {
      const linhasArquivo = await lerArquivoComoLinhas(file);
      const valRebate = parseNumero(rebatesCanais[canalLote] || "0");
      const saida: any[][] = [["SKU", "PDV"]];
      let total = 0, calculados = 0, semCusto = 0, inviaveis = 0;

      linhasArquivo.forEach((linha, idx) => {
        const bruto = linha[0];
        const texto = String(bruto ?? "").trim();
        if (!texto) return;
        if (idx === 0 && !/\d/.test(texto)) return;   // cabeçalho ("SKU", "Código"...)
        total++;
        const info = custosTodos.get(normalizarSku(texto));
        const custo = info ? Number(info.custo_unitario) : 0;
        if (!info || !(custo > 0)) {
          semCusto++;
          saida.push([texto, "sem custo na base"]);
          return;
        }
        const r = calcularPdvIdealCanal(canalLote, normalizarSku(texto), custo, margem, valRebate);
        if (r.inviavel || !(r.pdv > 0)) {
          inviaveis++;
          saida.push([texto, "margem inviável para o canal"]);
          return;
        }
        calculados++;
        saida.push([texto, Math.round(r.pdv * 100) / 100]);
      });

      if (total === 0) { setErroLote("Não encontrei SKUs na coluna A da planilha."); return; }
      const base = file.name.replace(/\.[^.]+$/, "");
      setResultadoLote({ nomeArquivo: base, canal: canalLote, margem, linhas: saida, total, calculados, semCusto, inviaveis });
    } catch (e: any) {
      setErroLote("Não consegui ler a planilha: " + (e?.message || e));
    } finally {
      setProcessandoLote(false);
    }
  };

  const baixarResultadoLote = () => {
    if (!resultadoLote) return;
    const ws = XLSX.utils.aoa_to_sheet(resultadoLote.linhas);
    // SKU como texto e PDV com duas casas
    for (let r = 1; r < resultadoLote.linhas.length; r++) {
      const a = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (a) { a.t = "s"; a.v = String(a.v); }
      const b = ws[XLSX.utils.encode_cell({ r, c: 1 })];
      if (b && b.t === "n") b.z = "0.00";
    }
    ws["!cols"] = [{ wch: 20 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PDV");
    const canalArq = resultadoLote.canal.replace(/[^a-zA-Z0-9]+/g, "_");
    XLSX.writeFile(wb, `${resultadoLote.nomeArquivo}_PDV_${canalArq}_margem${String(resultadoLote.margem).replace(".", ",")}.xlsx`);
  };

  const calcularResultadosCanais = () => {
    if (!produtoEncontrado) return [];

    const impostoPercent = 0.09;
    const skuKey = normalizarSku(produtoEncontrado.sku);

    const anunciosMl1 = mapeamentoMl1.get(skuKey) || [];
    const anunciosMl2 = mapeamentoMl2.get(skuKey) || [];

    return canaisConfig
      .filter((canalNome) => canaisSelecionados.includes(canalNome))
      .map((canalNome) => {
        const cLower = canalNome.toLowerCase();
        let comissaoPct = 0.14;
        let temMlbEncontrado = false;
        let anunciosSku = cLower.includes("mercado livre 2") ? anunciosMl2 : anunciosMl1;

        let refAnuncio = null;

        if (cLower.includes("mercado livre")) {
          if (cLower.includes("clássico")) {
            const matchClassico = anunciosSku.find((a: any) => a.comissao > 0 && a.comissao <= 14);
            if (matchClassico) {
              comissaoPct = matchClassico.comissao / 100;
              refAnuncio = matchClassico;
              temMlbEncontrado = true;
            } else {
              comissaoPct = 0.14;
              refAnuncio = anunciosSku.length > 0 ? anunciosSku[0] : null;
            }
          } else if (cLower.includes("premium")) {
            const matchPremium = anunciosSku.find((a: any) => a.comissao > 14);
            if (matchPremium) {
              comissaoPct = matchPremium.comissao / 100;
              refAnuncio = matchPremium;
              temMlbEncontrado = true;
            } else {
              comissaoPct = 0.19;
              refAnuncio = anunciosSku.length > 0 ? anunciosSku[0] : null;
            }
          }
        } else {
          refAnuncio = anunciosSku.length > 0 ? anunciosSku[0] : null;
        }

        const pesoReal = refAnuncio && Number(refAnuncio.peso_real) > 0 ? Number(refAnuncio.peso_real) : 2.0;
        const altura = refAnuncio && Number(refAnuncio.altura) > 0 ? Number(refAnuncio.altura) : 10;
        const largura = refAnuncio && Number(refAnuncio.largura) > 0 ? Number(refAnuncio.largura) : 10;
        const comprimento = refAnuncio && Number(refAnuncio.comprimento) > 0 ? Number(refAnuncio.comprimento) : 10;

        // Valor de rebate adicionado manualmente pelo usuário para este canal
        const valRebate = parseNumero(rebatesCanais[canalNome] || "0");

        if (modoCalculo === "pdv_ideal") {
          const custoProduto = Number(produtoEncontrado.custo_unitario || 25.88);
          const r = calcularPdvIdealCanal(canalNome, skuKey, custoProduto, parseFloat(margemAlvo), valRebate);
          return {
            canal: canalNome,
            pdv: r.pdv,
            custoProduto,
            comissaoPct: r.comissaoPct * 100,
            valorComissao: r.valorComissao,
            tarifaFixa: r.tarifaFixa,
            frete: r.frete,
            valorImposto: r.valorImposto,
            lucroLiquido: r.lucroLiquido,
            margemFinal: r.margemFinal,
            rebate: valRebate,
            custoIdealCalculado: null,
            temMlb: r.temMlb
          };
        } else if (modoCalculo === "reversa") {
          const custoProduto = Number(produtoEncontrado.custo_unitario || 25.88);
          const pdvBase = parseNumero(precoFixo);

          let tarifaFixaFinal = 0;
          let freteFinal = 0;

          if (cLower.includes("mercado livre")) {
            tarifaFixaFinal = pdvBase < 79.00 ? 6.50 : 0.00;
            freteFinal = calcularFreteML(pdvBase, pesoReal, altura, largura, comprimento);
          } else {
            const regraTabela = obterRegraCanalDaTabela(canalNome, pdvBase);
            comissaoPct = Number(regraTabela.comissao || 14) / 100;
            tarifaFixaFinal = Number(regraTabela.tarifa_fixa || 0);
            freteFinal = Number(regraTabela.frete || 0);
          }

          const valorComissao = pdvBase * comissaoPct;
          const valorImposto = pdvBase * impostoPercent;
          
          // O rebate soma-se ao lucro líquido
          const lucroLiquidoBase = pdvBase - (custoProduto + valorComissao + tarifaFixaFinal + freteFinal + valorImposto);
          const lucroLiquido = lucroLiquidoBase + valRebate;
          const margemFinal = pdvBase > 0 ? (lucroLiquido / pdvBase) * 100 : 0;

          return {
            canal: canalNome,
            pdv: pdvBase,
            custoProduto,
            comissaoPct: comissaoPct * 100,
            valorComissao,
            tarifaFixa: tarifaFixaFinal,
            frete: freteFinal,
            valorImposto,
            lucroLiquido,
            margemFinal,
            rebate: valRebate,
            custoIdealCalculado: null,
            temMlb: cLower.includes("mercado livre") ? (temMlbEncontrado || anunciosSku.length > 0) : true
          };
        } else {
          const pdvAlvo = parseNumero(precoAlvoCustoIdeal);
          const margemDesejadaDec = parseNumero(margemCustoIdeal) / 100;

          let tarifaFixaFinal = 0;
          let freteFinal = 0;

          if (cLower.includes("mercado livre")) {
            tarifaFixaFinal = pdvAlvo < 79.00 ? 6.50 : 0.00;
            freteFinal = calcularFreteML(pdvAlvo, pesoReal, altura, largura, comprimento);
          } else {
            const regraTabela = obterRegraCanalDaTabela(canalNome, pdvAlvo);
            comissaoPct = Number(regraTabela.comissao || 14) / 100;
            tarifaFixaFinal = Number(regraTabela.tarifa_fixa || 0);
            freteFinal = Number(regraTabela.frete || 0);
          }

          const valorComissao = pdvAlvo * comissaoPct;
          const valorImposto = pdvAlvo * impostoPercent;

          const termoMultiplicador = 1 - (comissaoPct + impostoPercent + margemDesejadaDec);
          // O rebate ajuda a suportar um custo ideal maior
          let custoIdealCalculado = (pdvAlvo * termoMultiplicador) - tarifaFixaFinal - freteFinal + valRebate;

          const lucroLiquidoIdealBase = pdvAlvo - (custoIdealCalculado > 0 ? custoIdealCalculado : 0 + valorComissao + tarifaFixaFinal + freteFinal + valorImposto);
          const lucroLiquidoIdeal = lucroLiquidoIdealBase + valRebate;
          const margemFinalIdeal = pdvAlvo > 0 ? (lucroLiquidoIdeal / pdvAlvo) * 100 : 0;

          return {
            canal: canalNome,
            pdv: pdvAlvo,
            custoProduto: custoIdealCalculado > 0 ? custoIdealCalculado : 0,
            comissaoPct: comissaoPct * 100,
            valorComissao,
            tarifaFixa: tarifaFixaFinal,
            frete: freteFinal,
            valorImposto,
            lucroLiquido: lucroLiquidoIdeal,
            margemFinal: margemFinalIdeal,
            rebate: valRebate,
            custoIdealCalculado: custoIdealCalculado > 0 ? custoIdealCalculado : 0,
            temMlb: cLower.includes("mercado livre") ? (temMlbEncontrado || anunciosSku.length > 0) : true
          };
        }
      });
  };

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

  const resultadosCanais = calcularResultadosCanais();

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Calculadora de Precificação & Margens</h1>
            <p className="text-sm font-medium text-slate-400">Precificação com peso volumétrico e rebate manual por canal</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit" data-subabas-calc>
          <button data-subaba="calculadora" onClick={() => setSubAba("calculadora")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${subAba === "calculadora" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>
            🧮 Calculadora
          </button>
          <button data-subaba="lote" onClick={() => setSubAba("lote")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${subAba === "lote" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}>
            📑 Precificação em lote
          </button>
        </div>

        {subAba === "calculadora" && (
          <>
        <div className="flex flex-wrap gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
          <button
            onClick={() => setModoCalculo("pdv_ideal")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              modoCalculo === "pdv_ideal" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Achar PDV Ideal (Margem Alvo)
          </button>
          <button
            onClick={() => setModoCalculo("reversa")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              modoCalculo === "reversa" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Margem Reversa (Preço Fixo)
          </button>
          <button
            onClick={() => setModoCalculo("custo_ideal")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              modoCalculo === "custo_ideal" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Custo Ideal (Margem Desejada)
          </button>
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">SKU(s) — Digite o SKU (&gt;= 10 dig):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skuBusca}
                  onChange={(e) => setSkuBusca(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBuscarProduto()}
                  placeholder="Ex: 20345042233"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-white outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={handleBuscarProduto}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 rounded-xl text-xs uppercase cursor-pointer"
                >
                  Buscar
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Marca:</label>
              <input
                type="text"
                value={marcaFiltro}
                onChange={(e) => setMarcaFiltro(e.target.value)}
                placeholder="Ex: BEST FIT"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-white outline-none"
              />
            </div>

            {modoCalculo === "pdv_ideal" && (
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Margem Alvo (%):</label>
                <input
                  type="number"
                  value={margemAlvo}
                  onChange={(e) => setMargemAlvo(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2.5 text-xs font-mono text-amber-300 font-bold outline-none"
                />
              </div>
            )}

            {modoCalculo === "reversa" && (
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-purple-400 uppercase mb-1">Preço Fixo Global (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  value={precoFixo}
                  onChange={(e) => setPrecoFixo(e.target.value)}
                  className="w-full bg-slate-950 border border-purple-600/50 rounded-xl p-2.5 text-xs font-mono text-purple-300 font-bold outline-none"
                />
              </div>
            )}

            {modoCalculo === "custo_ideal" && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-cyan-400 uppercase mb-1">Preço de Venda Alvo (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={precoAlvoCustoIdeal}
                    onChange={(e) => setPrecoAlvoCustoIdeal(e.target.value)}
                    className="w-full bg-slate-950 border border-cyan-600/50 rounded-xl p-2.5 text-xs font-mono text-cyan-300 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Lucro / Margem Desejada (%):</label>
                  <input
                    type="number"
                    value={margemCustoIdeal}
                    onChange={(e) => setMargemCustoIdeal(e.target.value)}
                    className="w-full bg-slate-950 border border-emerald-600/50 rounded-xl p-2.5 text-xs font-mono text-emerald-300 font-bold outline-none"
                  />
                </div>
              </>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Canais Visíveis na Precificação:</span>
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => selecionarTodosCanais(true)} className="text-purple-400 hover:underline cursor-pointer">
                  Marcar Todos
                </button>
                <span className="text-slate-600">|</span>
                <button type="button" onClick={() => selecionarTodosCanais(false)} className="text-slate-400 hover:underline cursor-pointer">
                  Desmarcar Todos
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {canaisConfig.map((canalNome, i) => {
                const ativo = canaisSelecionados.includes(canalNome);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleCanalSelecao(canalNome)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      ativo
                        ? "bg-purple-600/30 text-purple-300 border-purple-500/60 shadow-sm"
                        : "bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300"
                    }`}
                  >
                    {ativo ? "✓ " : "+ "} {canalNome}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {produtoEncontrado && (
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="block text-[9px] font-bold text-slate-500 uppercase">SKU</span>
              <span className="text-xs font-mono font-bold text-indigo-400">{produtoEncontrado.sku}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold text-slate-500 uppercase">Nome do Produto</span>
              <span className="text-xs font-bold text-white">{produtoEncontrado.produto}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold text-slate-500 uppercase">Marca</span>
              <span className="text-xs font-bold text-slate-300">{produtoEncontrado.marca}</span>
            </div>
            <div>
              <span className="block text-[9px] font-bold text-slate-500 uppercase">Custo Base Atual (CMV)</span>
              {editandoCusto ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="text" inputMode="decimal" autoFocus value={custoEdit} data-custo-calc-input
                    onChange={(e) => setCustoEdit(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") salvarCustoProduto(); if (e.key === "Escape") setEditandoCusto(false); }}
                    className="w-24 bg-slate-950 border border-indigo-500/60 rounded-lg px-2 py-1 text-xs font-mono font-bold text-white outline-none"
                  />
                  <button type="button" onClick={salvarCustoProduto} disabled={salvandoCusto} data-custo-calc-salvar
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer">{salvandoCusto ? "..." : "Salvar"}</button>
                  <button type="button" onClick={() => setEditandoCusto(false)} disabled={salvandoCusto}
                    className="bg-slate-800 text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded-lg cursor-pointer">✕</button>
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-rose-400" data-custo-calc-valor>{formatarMoeda(produtoEncontrado.custo_unitario)}</span>
                  {produtoNaBase && (
                    <button type="button" onClick={abrirEdicaoCusto} data-editar-custo-calc title="Corrigir o custo deste produto na base"
                      className="text-sm leading-none cursor-pointer hover:scale-110 transition-transform">✏️</button>
                  )}
                </span>
              )}
            </div>
            <div className="bg-emerald-950/40 border border-emerald-900/50 px-3 py-1.5 rounded-xl">
              <span className="block text-[9px] font-bold text-emerald-400 uppercase">Status do Item</span>
              <span className="text-xs font-bold text-emerald-300">LINHA NORMAL (Ativo)</span>
            </div>
            {!produtoNaBase && (
              <p className="basis-full text-[11px] text-amber-400" data-sku-fora-base>SKU fora da base de custos: o cálculo usa um custo padrão só para simular. Cadastre o SKU em Uploads &gt; Custos por SKU para corrigir o custo.</p>
            )}
            {avisoCusto && (
              <p className={`basis-full text-[11px] font-bold ${avisoCusto.tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`} data-aviso-custo>{avisoCusto.tipo === "ok" ? "✅ " : "⚠️ "}{avisoCusto.texto}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {resultadosCanais.map((res, idx) => (
            <div key={idx} className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white">{res.canal}</h3>
                <div className="flex items-center gap-2">
                  {res.canal.toLowerCase().includes("mercado livre") && (
                    <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${res.temMlb ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-amber-950 text-amber-400 border border-amber-800"}`}>
                      {res.temMlb ? "MLB Encontrado" : "Padrão (Sem MLB)"}
                    </span>
                  )}
                  <span className="text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800/40 px-2 py-0.5 rounded">
                    Comissão: {res.comissaoPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">
                      {modoCalculo === "custo_ideal" ? "Custo Máximo (Ideal de Aquisição)" : (modoCalculo === "pdv_ideal" ? "Preço de Venda (PDV Ideal)" : "Preço de Venda (PDV)")}
                    </span>
                    <span className={`text-xl font-black font-mono mt-0.5 block ${modoCalculo === "custo_ideal" ? "text-cyan-400" : "text-emerald-400"}`}>
                      {modoCalculo === "custo_ideal" ? formatarMoeda(res.custoIdealCalculado || 0) : formatarMoeda(res.pdv)}
                    </span>
                  </div>
                </div>

                {/* CAMPO DE REBATE MANUAL POR CANAL */}
                <div className="bg-purple-950/20 border border-purple-900/40 p-2.5 rounded-xl flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-purple-300 uppercase">Rebate / Subsídio (R$):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={rebatesCanais[res.canal] || ""}
                    onChange={(e) => setRebatesCanais({ ...rebatesCanais, [res.canal]: e.target.value })}
                    placeholder="0.00"
                    className="w-24 bg-slate-950 border border-purple-700/60 rounded-lg p-1 text-xs font-mono font-bold text-purple-200 text-right outline-none"
                  />
                </div>

                <div className="space-y-1.5 text-xs font-mono text-slate-300 pt-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{modoCalculo === "custo_ideal" ? "Custo Ideal Calculado:" : "Custo Produto:"}</span>
                    <span className={modoCalculo === "custo_ideal" ? "text-cyan-400 font-bold" : "text-rose-400"}>
                      - {formatarMoeda(modoCalculo === "custo_ideal" ? (res.custoIdealCalculado || 0) : res.custoProduto)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Comissão ({res.comissaoPct.toFixed(1)}%):</span>
                    <span className="text-rose-400">- {formatarMoeda(res.valorComissao)}</span>
                  </div>
                  {res.tarifaFixa > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tarifa Fixa:</span>
                      <span className="text-rose-400">- {formatarMoeda(res.tarifaFixa)}</span>
                    </div>
                  )}
                  {res.frete > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Frete:</span>
                      <span className="text-rose-400">- {formatarMoeda(res.frete)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Imposto (9%):</span>
                    <span className="text-rose-400">- {formatarMoeda(res.valorImposto)}</span>
                  </div>
                  {res.rebate > 0 && (
                    <div className="flex justify-between font-bold text-purple-400">
                      <span>Rebate Adicionado:</span>
                      <span>+ {formatarMoeda(res.rebate)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-emerald-950/20 border-t border-emerald-900/30 flex justify-between items-center">
                <div>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Lucro Líquido</span>
                  <span className="text-sm font-black text-emerald-400 font-mono">{formatarMoeda(res.lucroLiquido)}</span>
                </div>
                <div className="text-right">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase">Margem Final</span>
                  <span className="text-sm font-black text-emerald-400 font-mono">{res.margemFinal.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

          </>
        )}

        {subAba === "lote" && (
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-indigo-500/30 shadow-xl space-y-4" data-lote>
          <div>
            <h2 className="text-sm font-black text-white">📑 Precificação em lote (planilha de SKUs)</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Suba uma planilha com os SKUs na <strong>coluna A</strong>, escolha o canal e a margem. A calculadora aplica a regra do canal (comissão, tarifa, frete e imposto de 9%)
              e devolve uma planilha com o SKU na coluna A e o <strong>PDV</strong> na coluna B. SKU sem custo na aba de custos recebe &quot;sem custo na base&quot;.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-sky-400 uppercase mb-1">Canal:</label>
              <select
                value={canalLote}
                onChange={(e) => { setCanalLote(e.target.value); setResultadoLote(null); }}
                data-lote-canal
                className="w-full bg-slate-950 border border-sky-600/50 rounded-xl p-2.5 text-xs font-bold text-sky-300 outline-none cursor-pointer"
              >
                {canaisConfig.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Margem desejada (%):</label>
              <input
                type="number"
                value={margemLote}
                onChange={(e) => { setMargemLote(e.target.value); setResultadoLote(null); }}
                data-lote-margem
                className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2.5 text-xs font-mono text-amber-300 font-bold outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha de SKUs (xlsx, xls, csv...):</label>
              <input
                type="file"
                data-lote-arquivo
                disabled={processandoLote || loading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadLote(f); e.target.value = ""; }}
                className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer cursor-pointer"
              />
            </div>
          </div>
          {parseNumero(rebatesCanais[canalLote] || "0") > 0 && (
            <p className="text-[11px] text-purple-300">Rebate de R$ {parseNumero(rebatesCanais[canalLote]).toFixed(2)} informado em {canalLote} será considerado no cálculo.</p>
          )}
          {processandoLote && <p className="text-xs text-slate-400">Calculando...</p>}
          {erroLote && <p className="text-xs font-bold text-rose-400" data-lote-erro>{erroLote}</p>}
          {resultadoLote && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-4" data-lote-resultado>
              <div className="text-xs text-slate-300 space-y-0.5">
                <p><strong className="text-white">{resultadoLote.total}</strong> SKU(s) lidos · <strong className="text-emerald-400">{resultadoLote.calculados}</strong> com PDV calculado ({resultadoLote.canal}, margem {resultadoLote.margem}%)</p>
                {resultadoLote.semCusto > 0 && <p className="text-amber-400"><strong>{resultadoLote.semCusto}</strong> sem custo na base</p>}
                {resultadoLote.inviaveis > 0 && <p className="text-rose-400"><strong>{resultadoLote.inviaveis}</strong> com margem inviável para o canal (comissão + imposto + margem ≥ 100%)</p>}
              </div>
              <button
                type="button"
                onClick={baixarResultadoLote}
                data-lote-baixar
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow"
              >
                ⬇️ Baixar planilha (SKU + PDV)
              </button>
            </div>
          )}
        </div>

        )}

      </div>
    </div>
  );
}