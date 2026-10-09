"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

// Matriz de Frete do Mercado Livre (mesma inteligência do Ads)
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
    return { coluna: match[1], linha: match[2] ? parseInt(match[2], 10) : undefined };
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

export default function FullPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [canais, setCanais] = useState<string[]>(["Mercado Livre 1", "Amazon", "Shopee"]);
  const [canalSelecionado, setCanalSelecionado] = useState("");
  
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [regrasMlMap, setRegrasMlMap] = useState<Map<string, any>>(new Map());
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [tinyMap, setTinyMap] = useState<Map<string, number>>(new Map());

  // Mapeamento e Planilha
  const [matrizPlanilha, setMatrizPlanilha] = useState<any[][]>([]);
  const [linhaInicial, setLinhaInicial] = useState("7");
  const [colunaSku, setColunaSku] = useState("A");
  const [colunaReceita, setColunaReceita] = useState("B");
  const [colunaQtdVendida, setColunaQtdVendida] = useState("C");
  const [colunaEstoqueFull, setColunaEstoqueFull] = useState("D");
  const [aliquotaImposto, setAliquotaImposto] = useState("9");
  
  // Parâmetro de Reposição
  const [metaDiasCobertura, setMetaDiasCobertura] = useState("45"); // Dias alvo de estoque no Full

  const [dadosProcessados, setDadosProcessados] = useState<any[]>([]);
  const [pesquisaBusca, setPesquisaBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosBase();
  }, []);

  const carregarDadosBase = async () => {
    // 1. Canais
    const { data: canaisData } = await supabase.from('config_regras_canais').select('*').order('id');
    if (canaisData) {
      const lista = canaisData.filter(c => c.ativo_ads !== false).map(c => c.canal);
      setCanais(lista);
      if (lista.length > 0) setCanalSelecionado(lista[0]);
    }

    // 2. Custos
    let from = 0; let step = 1000; let keep = true;
    const mapaC = new Map();
    while (keep) {
      const { data } = await supabase.from('tabela_custos_skus').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach(c => mapaC.set(normalizarSku(c.sku), c));
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setCustosMap(mapaC);

    // 3. Regras ML
    from = 0; keep = true;
    const mapaMl = new Map();
    while (keep) {
      const { data } = await supabase.from('ml_anuncios_regras').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach(m => mapaMl.set(String(m.mlb || "").trim().toUpperCase(), m));
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setRegrasMlMap(mapaMl);

    // 4. Tarifação
    const { data: tarData } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (tarData) setRegrasTarifacao(tarData);

    // 5. Estoque Físico Central (Tiny)
    from = 0; keep = true;
    const mapaTiny = new Map();
    while (keep) {
      const { data } = await supabase.from('cadastros_base_tiny').select('sku, estoque').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach(t => mapaTiny.set(normalizarSku(t.sku), Number(t.estoque || 0)));
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setTinyMap(mapaTiny);
  };

  const handleUploadPlanilha = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setMatrizPlanilha(matrix);
      } catch (err: any) {
        alert("Erro ao ler o ficheiro: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
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

    return { freteTotal: freteUnitario * unidades, tarifaComissaoTotal: (receita * (comissaoPct / 100)) + (tarifaFixa * unidades) };
  };

  const processarMotorFull = () => {
    if (matrizPlanilha.length === 0) return alert("Carregue uma planilha primeiro.");

    const idxSku = colLetraParaIndice(extrairLetraERow(colunaSku).coluna);
    const idxReceita = colLetraParaIndice(extrairLetraERow(colunaReceita).coluna);
    const idxQtd = colLetraParaIndice(extrairLetraERow(colunaQtdVendida).coluna);
    const idxEstoqueFull = colLetraParaIndice(extrairLetraERow(colunaEstoqueFull).coluna);

    const startRowIndex = Math.max(0, parseInt(linhaInicial, 10) - 1 || 0);
    const impostoPct = Number(aliquotaImposto.replace(",", ".")) || 0;
    const metaDias = Number(metaDiasCobertura) || 30;

    const mapaAgrupado = new Map<string, any>();

    for (let r = startRowIndex; r < matrizPlanilha.length; r++) {
      const row = matrizPlanilha[r];
      if (!row || row.length === 0) continue;

      const skuOriginal = String(row[idxSku] || "").trim();
      const skuKey = normalizarSku(skuOriginal);
      if (!skuKey || skuKey === "sku" || skuKey === "total") continue;

      const receitaBruta = parseNumero(row[idxReceita]);
      const qtdVendida = parseNumero(row[idxQtd]);
      const estoqueFull = parseNumero(row[idxEstoqueFull]);

      if (mapaAgrupado.has(skuKey)) {
        const item = mapaAgrupado.get(skuKey);
        item.receitaBruta += receitaBruta;
        item.qtdVendida += qtdVendida;
        // Assume-se que a foto do estoque do CD na planilha vem num consolidado linha a linha. Se duplicar, será somado.
        item.estoqueFull += estoqueFull; 
      } else {
        mapaAgrupado.set(skuKey, {
          sku: skuOriginal,
          receitaBruta,
          qtdVendida,
          estoqueFull,
        });
      }
    }

    const resultados = Array.from(mapaAgrupado.values()).map(item => {
      const skuKey = normalizarSku(item.sku);
      const custoData = custosMap.get(skuKey);
      const custoUnitario = Number(custoData?.custo_unitario || 0);
      const produtoNome = custoData?.produto || "Produto Desconhecido";
      
      const estoqueCentral = tinyMap.get(skuKey) || 0;
      
      // Assume MLB pela regra mapeada (tentativa genérica caso não haja MLB específico na linha)
      // Numa versão futura, o ID do anúncio pode ser extraído de uma coluna.
      let mlRegra = null;
      for (const [k, v] of regrasMlMap.entries()) {
        if (normalizarSku(v.sku) === skuKey) { mlRegra = v; break; }
      }

      const precoUnitEstimado = item.qtdVendida > 0 ? (item.receitaBruta / item.qtdVendida) : 0;
      const { freteTotal, tarifaComissaoTotal } = calcularCustoCanal(canalSelecionado, precoUnitEstimado, item.receitaBruta, item.qtdVendida, mlRegra);

      const impostoTotal = item.receitaBruta * (impostoPct / 100);
      const custoProdutoTotal = custoUnitario * item.qtdVendida;
      const embalagemTotal = 0.70 * item.qtdVendida;

      const lucroRs = item.receitaBruta - custoProdutoTotal - impostoTotal - tarifaComissaoTotal - freteTotal - embalagemTotal;
      const margemPct = item.receitaBruta > 0 ? (lucroRs / item.receitaBruta) * 100 : 0;

      // MOTOR DE REPOSIÇÃO E COBERTURA
      const vmd = item.qtdVendida / 30;
      const coberturaAtual = vmd > 0 ? (item.estoqueFull / vmd) : (item.estoqueFull > 0 ? 999 : 0);
      
      let sugestaoEnvioBruta = Math.ceil((vmd * metaDias) - item.estoqueFull);
      if (sugestaoEnvioBruta < 0) sugestaoEnvioBruta = 0;

      // Status
      let statusEstoque = "";
      if (coberturaAtual < 10 && vmd > 0) statusEstoque = "Ruptura Iminente";
      else if (coberturaAtual > 60 && item.estoqueFull > 10) statusEstoque = "Risco de Aging";
      else if (vmd === 0 && item.estoqueFull > 0) statusEstoque = "Estoque Parado";
      else statusEstoque = "Saudável";

      let statusEnvio = "";
      let qtdEnviar = sugestaoEnvioBruta;
      
      if (sugestaoEnvioBruta > 0) {
        if (estoqueCentral >= sugestaoEnvioBruta) statusEnvio = "✅ Enviar Agora";
        else if (estoqueCentral > 0 && estoqueCentral < sugestaoEnvioBruta) {
          statusEnvio = "⚠️ Enviar Parcial";
          qtdEnviar = estoqueCentral; // Manda o que tem
        } else {
          statusEnvio = "❌ Faltante no Central";
          qtdEnviar = 0;
        }
      } else {
        statusEnvio = "⏸️ Não Enviar";
      }

      return {
        ...item,
        produto: produtoNome,
        estoqueCentral,
        custoProdutoTotal,
        impostoTotal,
        tarifaComissaoTotal,
        freteTotal,
        lucroRs,
        margemPct,
        vmd,
        coberturaAtual,
        qtdEnviar,
        statusEstoque,
        statusEnvio
      };
    });

    setDadosProcessados(resultados.sort((a, b) => b.receitaBruta - a.receitaBruta));
  };

  const dadosFiltrados = dadosProcessados.filter(item => {
    const mText = !pesquisaBusca || item.sku.includes(pesquisaBusca) || item.produto.toLowerCase().includes(pesquisaBusca.toLowerCase());
    const mStatus = filtroStatus === "TODOS" || item.statusEstoque === filtroStatus || item.statusEnvio.includes(filtroStatus);
    return mText && mStatus;
  });

  const kpis = {
    receita: dadosProcessados.reduce((a, b) => a + b.receitaBruta, 0),
    lucro: dadosProcessados.reduce((a, b) => a + b.lucroRs, 0),
    rupturas: dadosProcessados.filter(i => i.statusEstoque === "Ruptura Iminente").length,
    aging: dadosProcessados.filter(i => i.statusEstoque === "Risco de Aging" || i.statusEstoque === "Estoque Parado").length,
    enviarHoje: dadosProcessados.reduce((a, b) => a + b.qtdEnviar, 0)
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Logística Full & FBA</h1>
            <p className="text-sm font-medium text-slate-400">Motor de Reposição e Análise de Performance Logística</p>
          </div>
          <Navbar />
        </div>

        {/* PARÂMETROS E UPLOAD */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold text-white mb-4">⚙️ Configuração do Motor</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Canal do Relatório:</label>
              <select value={canalSelecionado} onChange={e => setCanalSelecionado(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer">
                {canais.map((c, i) => <option key={i} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Meta de Cobertura (Dias):</label>
              <input type="number" value={metaDiasCobertura} onChange={e => setMetaDiasCobertura(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-indigo-400 outline-none text-center" title="Quantos dias de stock pretende garantir no Full?" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Ficheiro do Marketplace (.xlsx, .csv):</label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUploadPlanilha} className="w-full bg-slate-950 border border-slate-700 file:border-0 file:bg-purple-600 file:text-white file:text-xs file:font-bold file:py-2.5 file:px-4 file:rounded-lg file:mr-4 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer" />
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 mb-6">
            <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-wider mb-3">📌 Mapeamento de Colunas</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Linha Inicial</label>
                <input type="number" value={linhaInicial} onChange={e => setLinhaInicial(e.target.value)} placeholder="7" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. SKU</label>
                <input type="text" value={colunaSku} onChange={e => setColunaSku(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. Qtd Vendida</label>
                <input type="text" value={colunaQtdVendida} onChange={e => setColunaQtdVendida(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. Receita Bruta</label>
                <input type="text" value={colunaReceita} onChange={e => setColunaReceita(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-white outline-none" />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Col. Estoque no CD</label>
                <input type="text" value={colunaEstoqueFull} onChange={e => setColunaEstoqueFull(e.target.value.toUpperCase())} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-emerald-400 outline-none" />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
             <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Imposto (%):</label>
                <input type="text" value={aliquotaImposto} onChange={e => setAliquotaImposto(e.target.value)} className="w-16 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs font-mono text-center text-emerald-400 outline-none" />
             </div>
            <button onClick={processarMotorFull} disabled={matrizPlanilha.length === 0} className={`py-3 px-8 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg ${matrizPlanilha.length === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer'}`}>
              🚀 Executar Análise Logística
            </button>
          </div>
        </div>

        {/* RESULTADOS */}
        {dadosProcessados.length > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Faturamento Full</span>
                <span className="text-xl font-black text-white">{formatarMoeda(kpis.receita)}</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Lucro Líquido Estimado</span>
                <span className="text-xl font-black text-emerald-400">{formatarMoeda(kpis.lucro)}</span>
              </div>
              <div className="bg-slate-900/90 border border-rose-900/40 p-5 rounded-2xl">
                <span className="block text-[10px] font-bold text-rose-400 uppercase mb-2">Ruptura Iminente</span>
                <span className="text-xl font-black text-rose-400">{kpis.rupturas} SKUs</span>
              </div>
              <div className="bg-slate-900/90 border border-amber-900/40 p-5 rounded-2xl">
                <span className="block text-[10px] font-bold text-amber-400 uppercase mb-2">Risco de Aging / Lentos</span>
                <span className="text-xl font-black text-amber-400">{kpis.aging} SKUs</span>
              </div>
              <div className="bg-purple-900/30 border border-purple-800 p-5 rounded-2xl">
                <span className="block text-[10px] font-bold text-purple-400 uppercase mb-2">Qtd Enviar (Reposição)</span>
                <span className="text-xl font-black text-purple-300">{kpis.enviarHoje} un.</span>
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-white">Relatório de Operação & Envio</h3>
                <div className="flex gap-2">
                  <input type="text" placeholder="Buscar SKU/Produto" value={pesquisaBusca} onChange={e => setPesquisaBusca(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-48" />
                  <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                    <option value="TODOS">Todos os Status</option>
                    <option value="Enviar">Apenas c/ Sugestão de Envio</option>
                    <option value="Ruptura Iminente">Ruptura Iminente</option>
                    <option value="Risco de Aging">Risco de Aging</option>
                    <option value="Faltante no Central">Falta no Estoque Central</option>
                  </select>
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3">SKU</th>
                      <th className="p-3 min-w-[200px]">Produto</th>
                      <th className="p-3 text-right">Vendas</th>
                      <th className="p-3 text-right">Receita (R$)</th>
                      <th className="p-3 text-right text-emerald-300">Estoque CD</th>
                      <th className="p-3 text-right text-indigo-300">Central (Sede)</th>
                      <th className="p-3 text-center">Cobertura</th>
                      <th className="p-3 text-right">Margem %</th>
                      <th className="p-3 text-center border-l border-slate-800">Status CD</th>
                      <th className="p-3 text-center">Ação Reposição</th>
                      <th className="p-3 text-center font-black text-purple-400">📦 Enviar Qtd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dadosFiltrados.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-white">{item.sku}</td>
                        <td className="p-3 text-slate-300 truncate max-w-[220px]" title={item.produto}>{item.produto}</td>
                        <td className="p-3 text-right font-bold text-slate-200">{item.qtdVendida}</td>
                        <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.receitaBruta)}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">{item.estoqueFull}</td>
                        <td className="p-3 text-right font-mono font-bold text-indigo-400">{item.estoqueCentral}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.coberturaAtual < 10 ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40' : item.coberturaAtual > 60 ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' : 'text-slate-400'}`}>
                            {item.coberturaAtual > 900 ? '+90' : item.coberturaAtual.toFixed(0)} dias
                          </span>
                        </td>
                        <td className={`p-3 text-right font-mono font-bold ${item.margemPct >= 10 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {item.margemPct.toFixed(1)}%
                        </td>
                        <td className="p-3 text-center border-l border-slate-800/50">
                          {item.statusEstoque === "Ruptura Iminente" ? <span className="text-rose-400 font-bold text-[10px]">🔥 Ruptura</span> : item.statusEstoque === "Risco de Aging" ? <span className="text-amber-400 font-bold text-[10px]">⚠️ Aging Alto</span> : <span className="text-emerald-400 text-[10px]">✔️ Saudável</span>}
                        </td>
                        <td className="p-3 text-center">
                          {item.statusEnvio.includes("Parcial") ? <span className="bg-amber-900/30 text-amber-400 border border-amber-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.statusEnvio}</span> : item.statusEnvio.includes("Faltante") ? <span className="bg-rose-900/30 text-rose-400 border border-rose-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.statusEnvio}</span> : item.statusEnvio.includes("Não") ? <span className="text-slate-500 text-[10px] uppercase font-bold">{item.statusEnvio}</span> : <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 px-2 py-1 rounded text-[10px] font-bold uppercase">{item.statusEnvio}</span>}
                        </td>
                        <td className="p-3 text-center font-mono font-black text-lg text-purple-400">
                          {item.qtdEnviar > 0 ? `+${item.qtdEnviar}` : '-'}
                        </td>
                      </tr>
                    ))}
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