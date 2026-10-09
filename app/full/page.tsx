"use client";
import React, { useState, useEffect } from "react";
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
    idx = idx * 26 + (s.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseNumero(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function verificarDataNoPeriodo(dataStr: any, periodoCompetencia: string): boolean {
  if (periodoCompetencia === "TODOS") return true;
  if (!dataStr) return false;
  const [mesAlvo, anoAlvo] = periodoCompetencia.split("/");
  const str = String(dataStr).trim();
  if (str.includes("-")) {
    const partes = str.split("-");
    if (partes.length >= 3) {
      const a = partes[0]; const m = partes[1].padStart(2, "0");
      return a === anoAlvo && m === mesAlvo.padStart(2, "0");
    }
  }
  if (str.includes("/")) {
    const partes = str.split("/");
    if (partes.length === 3) {
      const m = partes[1].padStart(2, "0"); const a = partes[2];
      return a === anoAlvo && m === mesAlvo.padStart(2, "0");
    }
  }
  return false;
}

const formatarMoeda = (valor: number) => "R$ " + (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LogisticaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // MODO PRINCIPAL
  const [modoLogistica, setModoLogistica] = useState<"full" | "padrao">("full");
  const [subAba, setSubAba] = useState<"estoque" | "vendas" | "relatorio">("vendas");

  // Filtros Globais
  const [canais, setCanais] = useState<string[]>([]);
  const [canalSelecionado, setCanalSelecionado] = useState("");
  const meses = ["01/2026", "02/2026", "03/2026", "04/2026", "05/2026", "06/2026", "07/2026", "08/2026", "09/2026", "10/2026", "11/2026", "12/2026"];
  const [mesSelecionado, setMesSelecionado] = useState("10/2026");

  // Bases de Dados (Memória)
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [regrasMlMap, setRegrasMlMap] = useState<Map<string, any>>(new Map());
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [tinyMap, setTinyMap] = useState<Map<string, number>>(new Map());
  const [lancamentosGravados, setLancamentosGravados] = useState<any[]>([]);

  // ESTADOS - ESTOQUE
  const [matrizEstoque, setMatrizEstoque] = useState<any[]>([]);
  const [linhaEstoque, setLinhaEstoque] = useState("13");
  const [colSkuEstoque, setColSkuEstoque] = useState("D");
  const [colQtdEstoque, setColQtdEstoque] = useState("X");
  const [previewEstoque, setPreviewEstoque] = useState<any[]>([]);

  // ESTADOS - VENDAS (MOTOR)
  const [matrizVendas, setMatrizVendas] = useState<any[]>([]);
  const [linhaVendas, setLinhaVendas] = useState("7");
  const [colSkuVendas, setColSkuVendas] = useState("W");
  const [colQtdVendas, setColQtdVendas] = useState("H");
  const [colReceitaVendas, setColReceitaVendas] = useState("I");
  
  // Parâmetros Globais de Cálculo
  const [aliquotaImposto, setAliquotaImposto] = useState("9");
  const [metaDiasCobertura, setMetaDiasCobertura] = useState("45");
  const [custoEmbalagem, setCustoEmbalagem] = useState("0.70");

  // Parâmetros de Diagnóstico (Logística Padrão)
  const [margemMinimaPromissora, setMargemMinimaPromissora] = useState("12");
  const [vendasMinimasPromissoras, setVendasMinimasPromissoras] = useState("3");
  const [tetoMaxDevolucao, setTetoMaxDevolucao] = useState("10");
  
  const [dadosProcessados, setDadosProcessados] = useState<any[]>([]);
  const [pesquisaBusca, setPesquisaBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) { router.push("/login"); return; }
    carregarDadosBase();
  }, []);

  useEffect(() => {
    if (canalSelecionado && mesSelecionado) {
      carregarConfiguracoes(canalSelecionado);
      carregarHistoricoGravado();
      setDadosProcessados([]);
    }
  }, [canalSelecionado, mesSelecionado, modoLogistica]);

  const carregarDadosBase = async () => {
    const { data: canaisData } = await supabase.from('config_regras_canais').select('*').order('id');
    if (canaisData) {
      const lista = canaisData.filter((c: any) => c.ativo_ads !== false).map((c: any) => c.canal);
      setCanais(lista);
      if (lista.length > 0) {
        setCanalSelecionado(lista[0]);
        carregarConfiguracoes(lista[0]);
      }
    }

    let step = 1000;
    let from = 0; let keep = true;
    const mapaC = new Map();
    while (keep) {
      const { data } = await supabase.from('tabela_custos_skus').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach((c: any) => mapaC.set(normalizarSku(c.sku), c));
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setCustosMap(mapaC);

    from = 0; keep = true;
    const mapaMl = new Map();
    while (keep) {
      const { data } = await supabase.from('ml_anuncios_regras').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach((m: any) => mapaMl.set(normalizarSku(m.sku), m)); 
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setRegrasMlMap(mapaMl);

    const { data: tarData } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (tarData) setRegrasTarifacao(tarData);

    from = 0; keep = true;
    const mapaTiny = new Map();
    while (keep) {
      const { data } = await supabase.from('cadastros_base_tiny').select('sku, estoque').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach((t: any) => mapaTiny.set(normalizarSku(t.sku), Number(t.estoque || 0)));
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setTinyMap(mapaTiny);
  };

  const carregarHistoricoGravado = async () => {
    setLoading(true);
    const tabela = modoLogistica === "full" ? "full_lancamentos" : "vendas_padrao_lancamentos";
    const { data } = await supabase
      .from(tabela)
      .select('*')
      .eq('canal', canalSelecionado)
      .eq('mes_referencia', mesSelecionado)
      .order('receita_bruta', { ascending: false });

    if (data) setLancamentosGravados(data);
    setLoading(false);
  };

  const carregarConfiguracoes = (canal: string) => {
    const keyPrefix = modoLogistica === "full" ? "full_" : "padrao_";
    const salvoVen = localStorage.getItem(`${keyPrefix}vendas_${canal.toLowerCase()}`);
    if (salvoVen) {
      const p = JSON.parse(salvoVen);
      if (p.linha) setLinhaVendas(p.linha);
      if (p.colSku) setColSkuVendas(p.colSku);
      if (p.colQtd) setColQtdVendas(p.colQtd);
      if (p.colReceita) setColReceitaVendas(p.colReceita);
      if (p.imposto) setAliquotaImposto(p.imposto);
      if (p.metaDias) setMetaDiasCobertura(p.metaDias);
      if (p.embalagem) setCustoEmbalagem(p.embalagem);
      if (p.margemMin) setMargemMinimaPromissora(p.margemMin);
      if (p.vendasMin) setVendasMinimasPromissoras(p.vendasMin);
      if (p.tetoDev) setTetoMaxDevolucao(p.tetoDev);
    }
  };

  const salvarConfiguracoes = () => {
    const keyPrefix = modoLogistica === "full" ? "full_" : "padrao_";
    localStorage.setItem(`${keyPrefix}vendas_${canalSelecionado.toLowerCase()}`, JSON.stringify({
      linha: linhaVendas, colSku: colSkuVendas, colQtd: colQtdVendas, colReceita: colReceitaVendas, 
      imposto: aliquotaImposto, metaDias: metaDiasCobertura, embalagem: custoEmbalagem,
      margemMin: margemMinimaPromissora, vendasMin: vendasMinimasPromissoras, tetoDev: tetoMaxDevolucao
    }));
  };

  const calcularCustoCanal = (canal: string, precoUnit: number, receita: number, unidades: number, skuKey: string) => {
    let comissaoPct = 14; let tarifaFixa = 0; let freteUnitario = 0;
    const isMercadoLivre = canal.toLowerCase().includes("mercado livre");

    if (isMercadoLivre) {
      const mlRegra = regrasMlMap.get(skuKey);
      comissaoPct = mlRegra ? Number(mlRegra.comissao || 0) : 14;
      let pesoReal = mlRegra ? Number(mlRegra.peso_real || 0) : 2.0;
      let altura = mlRegra ? Number(mlRegra.altura || 0) : 10;
      let largura = mlRegra ? Number(mlRegra.largura || 0) : 10;
      let comprimento = mlRegra ? Number(mlRegra.comprimento || 0) : 10;
      freteUnitario = calcularFreteML(precoUnit, pesoReal, altura, largura, comprimento);
    } else {
      const regrasDoCanal = regrasTarifacao.filter((r: any) => r.canal.toLowerCase() === canal.toLowerCase());
      if (regrasDoCanal.length > 0) {
        let regraAplicavel = regrasDoCanal[0];
        for (const r of regrasDoCanal) {
          const numeros = r.faixa_preco.match(/\d+[\.,]?\d*/g);
          if (numeros && numeros.length >= 2) {
            const min = parseFloat(numeros[0].replace(',', '.'));
            const max = parseFloat(numeros[1].replace(',', '.'));
            if (precoUnit >= min && precoUnit <= max) { regraAplicavel = r; break; }
          }
        }
        comissaoPct = Number(regraAplicavel.comissao || 0);
        tarifaFixa = Number(regraAplicavel.tarifa_fixa || 0);
        freteUnitario = Number(regraAplicavel.frete || 0);
      }
    }
    return { freteTotal: freteUnitario * unidades, tarifaComissaoTotal: (receita * (comissaoPct / 100)) + (tarifaFixa * unidades) };
  };

  const handleUploadVendas = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" });
        setMatrizVendas(matrix);
        setDadosProcessados([]);
      } catch (err: any) { alert("Erro ao ler o ficheiro: " + err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const handleUploadEstoque = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: "A", defval: "" });
        setMatrizEstoque(matrix);
        setPreviewEstoque([]);
      } catch (err: any) { alert("Erro ao ler o ficheiro: " + err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const processarPreviewEstoque = () => {
    if (matrizEstoque.length === 0) return alert("Suba a planilha de Estoque primeiro.");
    localStorage.setItem(`full_estoque_${canalSelecionado.toLowerCase()}`, JSON.stringify({ linha: linhaEstoque, colSku: colSkuEstoque, colQtd: colQtdEstoque }));

    const colSku = colSkuEstoque.trim().toUpperCase();
    const colQtd = colQtdEstoque.trim().toUpperCase();
    const startRow = Math.max(0, parseInt(linhaEstoque, 10) - 1 || 0);
    const mapaAgrupado = new Map<string, number>();

    for (let r = startRow; r < matrizEstoque.length; r++) {
      const row = matrizEstoque[r];
      if (!row) continue;
      const skuNorm = normalizarSku(row[colSku]);
      if (!skuNorm || skuNorm.toLowerCase() === "sku") continue;
      const qtd = parseNumero(row[colQtd]);
      
      if (mapaAgrupado.has(skuNorm)) mapaAgrupado.set(skuNorm, mapaAgrupado.get(skuNorm)! + qtd);
      else mapaAgrupado.set(skuNorm, qtd);
    }

    const extraidos = Array.from(mapaAgrupado.entries()).map(([skuNorm, qtd]) => ({ sku: skuNorm, skuNorm, quantidade: qtd }));
    setPreviewEstoque(extraidos);
  };

  const salvarEstoqueNoBanco = async () => {
    if (previewEstoque.length === 0) return;
    setSalvando(true);
    const payload = previewEstoque.map((item: any) => ({ canal: canalSelecionado, mes_referencia: mesSelecionado, sku: item.skuNorm, estoque: item.quantidade }));
    const { error } = await supabase.from('estoque_cd_mensal').upsert(payload, { onConflict: 'canal, mes_referencia, sku' });
    if (error) alert("Erro ao salvar estoque no banco: " + error.message);
    else {
      alert(`✅ Estoque do CD atualizado com sucesso! Foram guardados ${payload.length} SKUs consolidados.`);
      setPreviewEstoque([]); setMatrizEstoque([]); setSubAba("vendas"); 
    }
    setSalvando(false);
  };

  const limparEstoqueSalvo = async () => {
    if (!confirm(`ATENÇÃO: Deseja apagar todo o Estoque do CD guardado em ${canalSelecionado} para o mês ${mesSelecionado}?`)) return;
    setSalvando(true);
    const { error } = await supabase.from('estoque_cd_mensal').delete().eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    if (error) alert("Erro ao limpar estoque: " + error.message);
    else { alert("🗑️ Estoque limpo com sucesso!"); setPreviewEstoque([]); setMatrizEstoque([]); }
    setSalvando(false);
  };

  const processarMotorFull = async (mapaAgrupado: Map<string, any>) => {
    const { data: estData } = await supabase.from('estoque_cd_mensal').select('sku, estoque').eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    const mapaEstoqueCD = new Map();
    if (estData) estData.forEach((e: any) => mapaEstoqueCD.set(e.sku, Number(e.estoque)));

    const impostoPct = Number(aliquotaImposto.replace(",", ".")) || 0;
    const metaDias = Number(metaDiasCobertura) || 45;

    const resultados = Array.from(mapaAgrupado.values()).map((item: any) => {
      const skuKey = item.skuKey;
      const custoData = custosMap.get(skuKey);
      const custoUnitario = Number(custoData?.custo_unitario || 0);
      const produtoNome = custoData?.produto || "Produto Desconhecido";
      
      const estoqueCD = mapaEstoqueCD.get(skuKey) || 0;
      const estoqueCentral = tinyMap.get(skuKey) || 0;

      const precoUnitEstimado = item.qtdVendida > 0 ? (item.receitaBruta / item.qtdVendida) : 0;
      const { freteTotal, tarifaComissaoTotal } = calcularCustoCanal(canalSelecionado, precoUnitEstimado, item.receitaBruta, item.qtdVendida, skuKey);

      const impostoTotal = item.receitaBruta * (impostoPct / 100);
      const custoProdutoTotal = custoUnitario * item.qtdVendida;

      const tarifaFreteSoma = tarifaComissaoTotal + freteTotal;
      const lucroRs = item.receitaBruta - custoProdutoTotal - impostoTotal - tarifaFreteSoma;
      
      const margemBrutaRs = item.receitaBruta - custoProdutoTotal - impostoTotal;
      const margemBrutaPct = item.receitaBruta > 0 ? (margemBrutaRs / item.receitaBruta) * 100 : 0;
      const margemPct = item.receitaBruta > 0 ? (lucroRs / item.receitaBruta) * 100 : 0;

      const vmd = item.qtdVendida / 30;
      const coberturaAtual = vmd > 0 ? (estoqueCD / vmd) : (estoqueCD > 0 ? 999 : 0);
      
      let sugestaoEnvioBruta = Math.ceil((vmd * metaDias) - estoqueCD);
      if (sugestaoEnvioBruta < 0) sugestaoEnvioBruta = 0;

      let statusEstoque = "";
      if (coberturaAtual < 10 && vmd > 0) statusEstoque = "Ruptura Iminente";
      else if (coberturaAtual > 60 && estoqueCD > 5) statusEstoque = "Risco de Aging";
      else if (vmd === 0 && estoqueCD > 0) statusEstoque = "Estoque Parado";
      else statusEstoque = "Saudável";

      let statusEnvio = "";
      let qtdEnviar = sugestaoEnvioBruta;
      
      if (sugestaoEnvioBruta > 0) {
        if (estoqueCentral >= sugestaoEnvioBruta) statusEnvio = "✅ Enviar Agora";
        else if (estoqueCentral > 0 && estoqueCentral < sugestaoEnvioBruta) {
          statusEnvio = "⚠️ Enviar Parcial";
          qtdEnviar = estoqueCentral; 
        } else {
          statusEnvio = "❌ Falta no Central";
          qtdEnviar = 0;
        }
      } else {
        statusEnvio = "⏸️ Não Enviar";
      }

      return {
        canal: canalSelecionado, mes_referencia: mesSelecionado, sku: item.sku, produto: produtoNome,
        qtd_vendida: item.qtdVendida, receita_bruta: item.receitaBruta, estoque_cd: estoqueCD, armazenagem: 0,
        estoque_central: estoqueCentral, custo_produto: custoProdutoTotal, imposto: impostoTotal,
        tarifa_frete: tarifaFreteSoma, lucro_liquido: lucroRs, margem_pct: margemPct, margem_bruta_pct: margemBrutaPct,
        vmd: Number(vmd.toFixed(2)), cobertura_dias: Number(coberturaAtual.toFixed(1)), sugestao_envio: qtdEnviar,
        status_estoque: statusEstoque, status_envio: statusEnvio
      };
    });

    setDadosProcessados(resultados.sort((a: any, b: any) => b.receita_bruta - a.receita_bruta));
  };

  const processarMotorPadrao = async (mapaAgrupado: Map<string, any>) => {
    const impostoPct = Number(aliquotaImposto.replace(",", ".")) || 0;
    const embalagemUnit = Number(custoEmbalagem.replace(",", ".")) || 0;

    // Metas configuradas na interface pelo usuário
    const metaMargemPromissora = Number(margemMinimaPromissora.replace(",", ".")) || 12;
    const metaVendasMin = Number(vendasMinimasPromissoras) || 3;
    const limiteDevolucao = Number(tetoMaxDevolucao.replace(",", ".")) || 10;

    const { data: dadosDevolucaoRaw } = await supabase.from("devolucoes").select("sku, data_retorno, canal");
    const mapaDevContagem = new Map<string, number>();
    if (dadosDevolucaoRaw) {
      dadosDevolucaoRaw.forEach((d: any) => {
        if (verificarDataNoPeriodo(d.data_retorno, mesSelecionado) && d.canal === canalSelecionado) {
          const skuKey = normalizarSku(d.sku);
          if (skuKey) mapaDevContagem.set(skuKey, (mapaDevContagem.get(skuKey) || 0) + 1);
        }
      });
    }

    const { data: dadosAbcRaw } = await supabase.from("curva_abc").select("codigo, quantidade").eq("mes_referencia", mesSelecionado);
    const mapaVendasAbc = new Map<string, number>();
    if (dadosAbcRaw) {
      dadosAbcRaw.forEach((a: any) => {
        const skuKey = normalizarSku(a.codigo);
        if (skuKey) mapaVendasAbc.set(skuKey, (mapaVendasAbc.get(skuKey) || 0) + Number(a.quantidade || 0));
      });
    }

    const resultados = Array.from(mapaAgrupado.values()).map((item: any) => {
      const skuKey = item.skuKey;
      const custoData = custosMap.get(skuKey);
      const custoUnitario = Number(custoData?.custo_unitario || 0);
      const produtoNome = custoData?.produto || "Produto Desconhecido";
      
      const precoUnitEstimado = item.qtdVendida > 0 ? (item.receitaBruta / item.qtdVendida) : 0;
      const { freteTotal, tarifaComissaoTotal } = calcularCustoCanal(canalSelecionado, precoUnitEstimado, item.receitaBruta, item.qtdVendida, skuKey);

      const impostoTotal = item.receitaBruta * (impostoPct / 100);
      const custoProdutoTotal = custoUnitario * item.qtdVendida;
      const embalagemTotal = embalagemUnit * item.qtdVendida;

      const tarifaFreteSoma = tarifaComissaoTotal + freteTotal;
      const lucroRs = item.receitaBruta - custoProdutoTotal - impostoTotal - tarifaFreteSoma - embalagemTotal;
      const margemPct = item.receitaBruta > 0 ? (lucroRs / item.receitaBruta) * 100 : 0;

      const vendasTotais = Math.max(mapaVendasAbc.get(skuKey) || 0, item.qtdVendida);
      const totalDevolucoes = mapaDevContagem.get(skuKey) || 0;
      const taxaDevolucao = vendasTotais > 0 ? (totalDevolucoes / vendasTotais) * 100 : 0;

      // Diagnóstico dinâmico usando as regras inseridas nos inputs
      let diagnostico = "";
      if (margemPct <= 0) {
        diagnostico = "❌ Prejuízo (Sem Futuro)";
      } else if (taxaDevolucao >= limiteDevolucao && totalDevolucoes > 0) {
        diagnostico = "⛔ Alta Devolução (Sem Futuro)";
      } else if (margemPct >= metaMargemPromissora && item.qtdVendida >= metaVendasMin && taxaDevolucao < limiteDevolucao) {
        diagnostico = "🌟 Promissor (Escalar)";
      } else if (margemPct < 10) {
        diagnostico = "⚠️ Margem Baixa (Atenção)";
      } else {
        diagnostico = "✅ Regular (Manter)";
      }

      return {
        canal: canalSelecionado, mes_referencia: mesSelecionado, sku: item.sku, produto: produtoNome,
        qtd_vendida: item.qtdVendida, receita_bruta: item.receitaBruta, custo_produto: custoProdutoTotal,
        imposto: impostoTotal, tarifa_frete: tarifaFreteSoma, embalagem: embalagemTotal,
        lucro_liquido: lucroRs, margem_pct: margemPct, taxa_devolucao: taxaDevolucao,
        qtd_devolucoes: totalDevolucoes, diagnostico: diagnostico
      };
    });

    setDadosProcessados(resultados.sort((a: any, b: any) => b.receita_bruta - a.receita_bruta));
  };

  const executarMotorGeral = async () => {
    if (matrizVendas.length === 0) return alert("Suba a planilha de Vendas primeiro.");
    setLoading(true);
    salvarConfiguracoes();

    const colSku = colSkuVendas.trim().toUpperCase();
    const colQtd = colQtdVendas.trim().toUpperCase();
    const colReceita = colReceitaVendas.trim().toUpperCase();
    const startRow = Math.max(0, parseInt(linhaVendas, 10) - 1 || 0);
    const mapaAgrupado = new Map<string, any>();

    for (let r = startRow; r < matrizVendas.length; r++) {
      const row = matrizVendas[r];
      if (!row) continue;

      const skuOriginal = String(row[colSku] || "").trim();
      const skuKey = normalizarSku(skuOriginal);
      if (!skuKey || skuKey === "sku" || skuKey === "total") continue;

      const receitaBruta = parseNumero(row[colReceita]);
      const qtdVendida = parseNumero(row[colQtd]);

      if (mapaAgrupado.has(skuKey)) {
        const item = mapaAgrupado.get(skuKey);
        item.receitaBruta += receitaBruta;
        item.qtdVendida += qtdVendida;
      } else {
        mapaAgrupado.set(skuKey, { sku: skuOriginal, skuKey, receitaBruta, qtdVendida });
      }
    }

    if (modoLogistica === "full") await processarMotorFull(mapaAgrupado);
    else await processarMotorPadrao(mapaAgrupado);
    
    setLoading(false);
  };

  const salvarDadosNoBanco = async () => {
    if (dadosProcessados.length === 0) return;
    setSalvando(true);
    const tabela = modoLogistica === "full" ? "full_lancamentos" : "vendas_padrao_lancamentos";
    
    await supabase.from(tabela).delete().eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    
    let res = await supabase.from(tabela).insert(dadosProcessados);
    
    if (res.error && res.error.message.includes("margem_bruta_pct")) {
      const fallbackPayload = dadosProcessados.map((item: any) => {
        const copy = { ...item }; delete copy.margem_bruta_pct; return copy;
      });
      res = await supabase.from(tabela).insert(fallbackPayload);
    }

    if (res.error) {
      alert("Erro ao gravar resultados no banco: " + res.error.message);
    } else {
      alert(`✅ Análise de Logística ${modoLogistica === "full" ? "Full/FBA" : "Própria"} gravada com sucesso!`);
      setMatrizVendas([]);
      setDadosProcessados([]);
      carregarHistoricoGravado();
      setSubAba("relatorio");
    }
    setSalvando(false);
  };

  const limparCanalInteiro = async () => {
    if (!confirm(`ATENÇÃO: Deseja apagar todo o Relatório Analítico salvo de ${canalSelecionado} no mês de ${mesSelecionado}?`)) return;
    const tabela = modoLogistica === "full" ? "full_lancamentos" : "vendas_padrao_lancamentos";
    await supabase.from(tabela).delete().eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    carregarHistoricoGravado();
  };

  const dataSource = dadosProcessados.length > 0 ? dadosProcessados : lancamentosGravados;
  
  const filtradosFull = dataSource.filter((item: any) => {
    const mText = !pesquisaBusca || String(item.sku).toLowerCase().includes(pesquisaBusca.toLowerCase()) || String(item.produto).toLowerCase().includes(pesquisaBusca.toLowerCase());
    const mStatus = filtroStatus === "TODOS" || item.status_estoque === filtroStatus || (item.status_envio && item.status_envio.includes(filtroStatus));
    return mText && mStatus;
  });

  const filtradosPadrao = dataSource.filter((item: any) => {
    const mText = !pesquisaBusca || String(item.sku).toLowerCase().includes(pesquisaBusca.toLowerCase()) || String(item.produto).toLowerCase().includes(pesquisaBusca.toLowerCase());
    const mDiag = filtroStatus === "TODOS" || (item.diagnostico && item.diagnostico.includes(filtroStatus));
    return mText && mDiag;
  });

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Logística Integrada</h1>
            <p className="text-sm font-medium text-slate-400">Motor de Análise para Modalidade Full/FBA e Própria</p>
          </div>
          <Navbar />
        </div>

        {/* TOGGLE MODALIDADE */}
        <div className="flex flex-wrap gap-4 mb-8 border-b border-slate-800 pb-6">
          <button 
            onClick={() => { setModoLogistica("full"); setSubAba("vendas"); setDadosProcessados([]); }} 
            className={`px-8 py-3.5 rounded-xl font-black text-sm tracking-wider cursor-pointer transition-all ${modoLogistica === "full" ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800"}`}
          >
            ⚡ Logística Full / FBA
          </button>
          <button 
            onClick={() => { setModoLogistica("padrao"); setSubAba("vendas"); setDadosProcessados([]); }} 
            className={`px-8 py-3.5 rounded-xl font-black text-sm tracking-wider cursor-pointer transition-all ${modoLogistica === "padrao" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800"}`}
          >
            📦 Logística Própria (Padrão)
          </button>
        </div>

        {/* PARÂMETROS GLOBAIS COMUNS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Canal Logístico:</label>
              <select value={canalSelecionado} onChange={e => setCanalSelecionado(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer">
                {canais.map((c, i) => <option key={i} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Competência (Mês de Análise):</label>
              <select value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} className={`w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold outline-none cursor-pointer ${modoLogistica === "full" ? "text-purple-400" : "text-indigo-400"}`}>
                {meses.map((m, i) => <option key={i} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* NAVEGAÇÃO DE SUB-ABAS */}
        <div className="flex flex-wrap gap-3 mb-6">
          {modoLogistica === "full" && (
            <button onClick={() => setSubAba("estoque")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "estoque" ? "bg-amber-600 text-white shadow-amber-900/30" : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
              📦 1. Upload Estoque do CD
            </button>
          )}
          <button onClick={() => setSubAba("vendas")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "vendas" ? (modoLogistica === "full" ? "bg-purple-600 text-white" : "bg-indigo-600 text-white") : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
            ⚡ {modoLogistica === "full" ? "2. Motor de Reposição" : "1. Motor de Diagnóstico"}
          </button>
          <button onClick={() => setSubAba("relatorio")} className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${subAba === "relatorio" ? "bg-emerald-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
            📊 {modoLogistica === "full" ? "3. Ranking e Relatório" : "2. Veredicto e Relatório"}
          </button>
        </div>

        {/* ABA ESTOQUE (SÓ FULL) */}
        {subAba === "estoque" && modoLogistica === "full" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2"><span>📦 Registar Fotografia de Estoque do CD</span></h2>
                <p className="text-xs text-slate-400 mt-1">Carregue a planilha de inventário do marketplace para cruzamento e reposição.</p>
              </div>
              <button onClick={limparEstoqueSalvo} disabled={salvando} className="bg-rose-950/80 hover:bg-rose-900 text-rose-400 border border-rose-800/50 font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all">
                🗑️ Limpar Estoque do Mês
              </button>
            </div>
            <div className="bg-amber-950/20 p-5 rounded-xl border border-amber-900/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Ficheiro de Estoque (Excel/CSV):</label>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUploadEstoque} className="w-full bg-slate-950 border border-slate-700 file:border-0 file:bg-amber-600 file:text-white file:text-xs file:font-bold file:py-2.5 file:px-4 file:rounded-lg file:mr-4 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer" />
                </div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Linha Inicial</label><input type="number" value={linhaEstoque} onChange={e => setLinhaEstoque(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Coluna SKU</label><input type="text" value={colSkuEstoque} onChange={e => setColSkuEstoque(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Coluna Qtd</label><input type="text" value={colQtdEstoque} onChange={e => setColQtdEstoque(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-emerald-400 outline-none" /></div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={processarPreviewEstoque} disabled={matrizEstoque.length === 0} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">1. Ler e Pré-visualizar</button>
                {previewEstoque.length > 0 && <button onClick={salvarEstoqueNoBanco} disabled={salvando} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-900/40">{salvando ? "A Salvar..." : "2. Guardar Estoque"}</button>}
              </div>
            </div>
            {previewEstoque.length > 0 && (
              <div className="overflow-x-auto max-h-[400px] border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 uppercase text-[10px]"><tr><th className="p-3">SKU Consolidado</th><th className="p-3 text-right">Estoque Lido Total</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {previewEstoque.slice(0, 50).map((item: any, idx: number) => (<tr key={idx}><td className="p-3 font-mono font-bold text-white">{item.sku}</td><td className="p-3 text-right font-bold text-emerald-400">{item.quantidade} un.</td></tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ABA VENDAS / MOTOR */}
        {subAba === "vendas" && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-lg font-bold flex items-center gap-2 ${modoLogistica === "full" ? "text-purple-400" : "text-indigo-400"}`}>
                  <span>⚡ Cruzamento e Motor ({modoLogistica === "full" ? "Reposição" : "Diagnóstico"})</span>
                </h2>
              </div>
              
              {/* FILTROS SUPERIORES DE ENTRADA */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Ficheiro de Vendas Brutas (Excel/CSV):</label>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUploadVendas} className={`w-full bg-slate-950 border border-slate-700 file:border-0 file:text-white file:text-xs file:font-bold file:py-2.5 file:px-4 file:rounded-lg file:mr-4 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer ${modoLogistica === "full" ? "file:bg-purple-600" : "file:bg-indigo-600"}`} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Imposto (%):</label>
                  <input type="number" value={aliquotaImposto} onChange={e => setAliquotaImposto(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-emerald-400 outline-none" />
                </div>

                {modoLogistica === "full" ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Meta Cobertura (Dias):</label>
                    <input type="number" value={metaDiasCobertura} onChange={e => setMetaDiasCobertura(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-indigo-400 outline-none" />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Custo Embalagem (R$):</label>
                      <input type="number" step="0.01" value={custoEmbalagem} onChange={e => setCustoEmbalagem(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-rose-400 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Margem Promissora (%):</label>
                      <input type="number" value={margemMinimaPromissora} onChange={e => setMargemMinimaPromissora(e.target.value)} placeholder="12" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-emerald-400 font-bold outline-none" title="Piso de margem para ser considerado Promissor" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Vendas Mínimas (un):</label>
                      <input type="number" value={vendasMinimasPromissoras} onChange={e => setVendasMinimasPromissoras(e.target.value)} placeholder="3" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-indigo-400 font-bold outline-none" title="Mínimo de vendas para validar o produto" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Teto Devolução (%):</label>
                      <input type="number" value={tetoMaxDevolucao} onChange={e => setTetoMaxDevolucao(e.target.value)} placeholder="10" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-center text-rose-400 font-bold outline-none" title="Taxa máxima permitida antes de ser considerado Sem Futuro" />
                    </div>
                  </>
                )}
              </div>

              {/* MAPEAMENTO DE COLUNAS */}
              <div className={`p-5 rounded-xl border mb-6 ${modoLogistica === "full" ? "bg-purple-950/10 border-purple-900/20" : "bg-indigo-950/10 border-indigo-900/20"}`}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Linha Inicial</label><input type="number" value={linhaVendas} onChange={e => setLinhaVendas(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                  <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. SKU</label><input type="text" value={colSkuVendas} onChange={e => setColSkuVendas(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                  <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. Qtd Vendida</label><input type="text" value={colQtdVendas} onChange={e => setColQtdVendas(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                  <div><label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. Receita Bruta</label><input type="text" value={colReceitaVendas} onChange={e => setColReceitaVendas(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" /></div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={executarMotorGeral} disabled={matrizVendas.length === 0 || loading} className={`py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg ${matrizVendas.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-white cursor-pointer'}`}>
                  {loading ? "A Cruzar..." : "1. Processar na Tela"}
                </button>
                {dadosProcessados.length > 0 && (
                  <button onClick={salvarDadosNoBanco} disabled={salvando} className={`py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg text-white ${modoLogistica === "full" ? "bg-purple-600 hover:bg-purple-500 shadow-purple-900/40" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40"}`}>
                    {salvando ? "A Gravar..." : "2. Gravar Análise no Banco"}
                  </button>
                )}
              </div>
            </div>

            {dadosProcessados.length > 0 && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 text-center animate-in zoom-in duration-300">
                 <h3 className="text-xl font-black text-emerald-400 mb-2">Relatório Processado com Sucesso!</h3>
                 <p className="text-sm text-slate-400 mb-4">O motor analisou <strong>{dadosProcessados.length} SKUs</strong>.</p>
                 <p className="text-xs text-slate-500">Clique em "Gravar Análise no Banco" para armazenar os dados e ir para o Relatório Oficial.</p>
              </div>
            )}
          </div>
        )}

        {/* ABA RELATÓRIO */}
        {subAba === "relatorio" && (
           <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             
             {/* KPIs */}
             <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Faturamento Apurado</span>
                <span className="text-xl font-black text-white">{formatarMoeda(dataSource.reduce((a: number, b: any) => a + Number(b.receita_bruta || 0), 0))}</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Lucro Líquido Real</span>
                <span className="text-xl font-black text-emerald-400">{formatarMoeda(dataSource.reduce((a: number, b: any) => a + Number(b.lucro_liquido || 0), 0))}</span>
              </div>
              
              {modoLogistica === "full" ? (
                <>
                  <div className="bg-slate-900/90 border border-rose-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-rose-400 uppercase mb-2">Ruptura Iminente</span>
                    <span className="text-xl font-black text-rose-400">{dataSource.filter((i:any) => i.status_estoque === "Ruptura Iminente").length} SKUs</span>
                  </div>
                  <div className="bg-slate-900/90 border border-amber-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-amber-400 uppercase mb-2">Risco de Aging</span>
                    <span className="text-xl font-black text-amber-400">{dataSource.filter((i:any) => i.status_estoque === "Risco de Aging").length} SKUs</span>
                  </div>
                  <div className="bg-purple-900/30 border border-purple-800 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-purple-400 uppercase mb-2">Sugestão Envio Hoje</span>
                    <span className="text-xl font-black text-purple-300">{dataSource.reduce((a: number, b: any) => a + Number(b.sugestao_envio || 0), 0)} un.</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-emerald-950/20 border border-emerald-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-emerald-400 uppercase mb-2">🌟 SKUs Promissores</span>
                    <span className="text-xl font-black text-emerald-400">{dataSource.filter((i:any) => i.diagnostico?.includes("Promissor")).length} Produtos</span>
                  </div>
                  <div className="bg-rose-950/20 border border-rose-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-rose-400 uppercase mb-2">⛔ Sem Futuro (Cortar)</span>
                    <span className="text-xl font-black text-rose-400">{dataSource.filter((i:any) => i.diagnostico?.includes("Sem Futuro")).length} Produtos</span>
                  </div>
                  <div className="bg-amber-950/20 border border-amber-900/40 p-5 rounded-2xl shadow-lg">
                    <span className="block text-[10px] font-bold text-amber-400 uppercase mb-2">⚠️ Ponto de Atenção</span>
                    <span className="text-xl font-black text-amber-400">{dataSource.filter((i:any) => i.diagnostico?.includes("Atenção")).length} Produtos</span>
                  </div>
                </>
              )}
            </div>

            {/* TABELA COMPLETA */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-white">Relatório Completo ({canalSelecionado} - {mesSelecionado})</h3>
                <div className="flex gap-2">
                  <input type="text" placeholder="Buscar SKU/Produto" value={pesquisaBusca} onChange={e => setPesquisaBusca(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-48" />
                  
                  {modoLogistica === "full" ? (
                    <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                      <option value="TODOS">Todos os Status</option>
                      <option value="Enviar">Apenas c/ Sugestão de Envio</option>
                      <option value="Ruptura Iminente">Ruptura Iminente</option>
                      <option value="Risco de Aging">Risco de Aging</option>
                      <option value="Falta no Central">Sem Saldo na Sede</option>
                    </select>
                  ) : (
                    <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                      <option value="TODOS">Todos os Diagnósticos</option>
                      <option value="Promissor">🌟 Apenas Promissores</option>
                      <option value="Sem Futuro">⛔ Sem Futuro (Prejuízo/Alta Dev.)</option>
                      <option value="Atenção">⚠️ Em Atenção (Margem Baixa)</option>
                      <option value="Regular">✅ Regulares</option>
                    </select>
                  )}
                  
                  <button onClick={limparCanalInteiro} className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm ml-2">
                    🗑️ Apagar Mês
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    {modoLogistica === "full" ? (
                      <tr>
                        <th className="p-3 text-center">#</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 min-w-[200px]">Produto</th>
                        <th className="p-3 text-right">Vendas</th>
                        <th className="p-3 text-right">Receita (R$)</th>
                        <th className="p-3 text-right text-emerald-300">Est. CD</th>
                        <th className="p-3 text-right text-indigo-300">Sede</th>
                        <th className="p-3 text-center">Cobertura</th>
                        <th className="p-3 text-right">Margem LÍQ.</th>
                        <th className="p-3 text-center border-l border-slate-800">Status CD</th>
                        <th className="p-3 text-center">Ação Reposição</th>
                        <th className="p-3 text-center font-black text-purple-400">📦 Enviar Qtd</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="p-3 text-center">#</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3 min-w-[200px]">Produto</th>
                        <th className="p-3 text-right text-indigo-300">Vendas (Qtd)</th>
                        <th className="p-3 text-right">Receita (R$)</th>
                        <th className="p-3 text-right text-rose-300" title="Custo com caixa, fita, etc.">Custo Embalagem</th>
                        <th className="p-3 text-right">Margem LÍQ.</th>
                        <th className="p-3 text-center text-amber-300">Qtd Devolvida</th>
                        <th className="p-3 text-center">Taxa Devolução</th>
                        <th className="p-3 text-center border-l border-slate-800 bg-slate-900">Veredicto (Diagnóstico)</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {modoLogistica === "full" ? (
                      filtradosFull.map((item: any, idx: number) => (
                        <tr key={item.id || idx} className="hover:bg-slate-800/40">
                          <td className="p-3 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-white">{item.sku}</td>
                          <td className="p-3 text-slate-300 truncate max-w-[220px]" title={item.produto}>{item.produto}</td>
                          <td className="p-3 text-right font-bold text-slate-200">{item.qtd_vendida}</td>
                          <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.receita_bruta)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">{item.estoque_cd}</td>
                          <td className="p-3 text-right font-mono font-bold text-indigo-400">{item.estoque_central}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.cobertura_dias < 10 ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40' : item.cobertura_dias > 60 ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' : 'text-slate-400'}`}>
                              {item.cobertura_dias > 900 ? '+90' : item.cobertura_dias.toFixed(0)} dias
                            </span>
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${item.margem_pct >= 10 ? 'text-emerald-400' : 'text-rose-500'}`} title={`Lucro R$: ${formatarMoeda(item.lucro_liquido)}`}>
                            {Number(item.margem_pct).toFixed(1)}%
                          </td>
                          <td className="p-3 text-center border-l border-slate-800/50">
                            {item.status_estoque === "Ruptura Iminente" ? <span className="text-rose-400 font-bold text-[10px]">🔥 Ruptura</span> : item.status_estoque === "Risco de Aging" ? <span className="text-amber-400 font-bold text-[10px]">⚠️ Aging Alto</span> : item.status_estoque === "Estoque Parado" ? <span className="text-amber-400 font-bold text-[10px]">⏳ Parado</span> : <span className="text-emerald-400 text-[10px]">✔️ Saudável</span>}
                          </td>
                          <td className="p-3 text-center">
                            {item.status_envio.includes("Parcial") ? <span className="bg-amber-900/30 text-amber-400 border border-amber-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.status_envio}</span> : item.status_envio.includes("Falta") ? <span className="bg-rose-900/30 text-rose-400 border border-rose-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.status_envio}</span> : item.status_envio.includes("Não") ? <span className="text-slate-500 text-[10px] uppercase font-bold">{item.status_envio}</span> : <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.status_envio}</span>}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-lg text-purple-400">
                            {item.sugestao_envio > 0 ? `+${item.sugestao_envio}` : '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      filtradosPadrao.map((item: any, idx: number) => {
                        let rowStyle = "";
                        if (item.diagnostico?.includes("Sem Futuro")) rowStyle = "bg-rose-950/10";
                        else if (item.diagnostico?.includes("Promissor")) rowStyle = "bg-emerald-950/10";
                        
                        return (
                          <tr key={item.id || idx} className={`hover:bg-slate-800/40 transition-colors ${rowStyle}`}>
                            <td className="p-3 text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-white">{item.sku}</td>
                            <td className="p-3 text-slate-300 truncate max-w-[220px]" title={item.produto}>{item.produto}</td>
                            <td className="p-3 text-right font-bold text-indigo-300">{item.qtd_vendida} un.</td>
                            <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.receita_bruta)}</td>
                            <td className="p-3 text-right font-mono text-rose-300/70">{formatarMoeda(item.embalagem)}</td>
                            
                            <td className={`p-3 text-right font-mono font-bold ${item.margem_pct >= 10 ? 'text-emerald-400' : 'text-rose-500'}`} title={`Lucro R$: ${formatarMoeda(item.lucro_liquido)}`}>
                              {Number(item.margem_pct).toFixed(1)}%
                            </td>
  
                            <td className="p-3 text-center font-bold text-amber-300">{item.qtd_devolucoes}</td>
                            
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.taxa_devolucao >= 10 ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40' : item.taxa_devolucao > 5 ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' : 'text-emerald-400'}`}>
                                {Number(item.taxa_devolucao).toFixed(1)}%
                              </span>
                            </td>
  
                            <td className="p-3 text-center border-l border-slate-800/50 bg-slate-950/20">
                              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                item.diagnostico?.includes("Sem Futuro") ? 'bg-rose-900/30 text-rose-400 border border-rose-800/50' : 
                                item.diagnostico?.includes("Promissor") ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50' : 
                                item.diagnostico?.includes("Atenção") ? 'bg-amber-900/30 text-amber-400 border border-amber-800/50' : 
                                'text-slate-400 border border-slate-700'
                              }`}>
                                {item.diagnostico}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
           </div>
        )}

      </div>
    </div>
  );
}