"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

// Matriz de Frete Mercado Livre
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

type LinhaFull = {
  sku: string;
  qtd_vendida: string;
  receita_bruta: string;
  estoque_cd: string;
  armazenagem: string;
  // Preview (Apenas visual)
  _previewProduto: string;
  _previewCusto: number;
  _previewEstoqueCentral: number;
};

export default function FullPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Filtros Globais
  const [canalSelecionado, setCanalSelecionado] = useState("Mercado Livre Full 1");
  const [mesSelecionado, setMesSelecionado] = useState("10/2026");
  const [aliquotaImposto, setAliquotaImposto] = useState("9");
  const [metaDiasCobertura, setMetaDiasCobertura] = useState("45");
  
  const [canais, setCanais] = useState<string[]>(["Mercado Livre Full 1", "Mercado Livre Full 2", "Amazon FBA", "Shopee Full"]);
  const [meses] = useState(["01/2026", "02/2026", "03/2026", "04/2026", "05/2026", "06/2026", "07/2026", "08/2026", "09/2026", "10/2026", "11/2026", "12/2026"]);

  // Dados Auxiliares
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [regrasMlMap, setRegrasMlMap] = useState<Map<string, any>>(new Map());
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [tinyMap, setTinyMap] = useState<Map<string, number>>(new Map());

  // Lançamentos Guardados
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [pesquisaBusca, setPesquisaBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [selecionadosIds, setSelecionadosIds] = useState<number[]>([]);

  // Formulário (Linhas)
  const linhaVazia: LinhaFull = { sku: "", qtd_vendida: "", receita_bruta: "", estoque_cd: "", armazenagem: "0", _previewProduto: "", _previewCusto: 0, _previewEstoqueCentral: 0 };
  const [linhas, setLinhas] = useState<LinhaFull[]>([{ ...linhaVazia }]);

  useEffect(() => {
    carregarDadosBase();
  }, []);

  useEffect(() => {
    if (canalSelecionado && mesSelecionado) {
      carregarLancamentos();
      setSelecionadosIds([]);
    }
  }, [canalSelecionado, mesSelecionado]);

  const carregarDadosBase = async () => {
    let step = 1000;
    
    // 1. Custos
    let from = 0; let keep = true;
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

    // 2. Regras ML
    from = 0; keep = true;
    const mapaMl = new Map();
    while (keep) {
      const { data } = await supabase.from('ml_anuncios_regras').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        data.forEach(m => mapaMl.set(normalizarSku(m.sku), m)); // Indexando por SKU para facilitar busca no Full
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }
    setRegrasMlMap(mapaMl);

    // 3. Tarifação
    const { data: tarData } = await supabase.from('config_regras_tarifacao').select('*').order('id');
    if (tarData) setRegrasTarifacao(tarData);

    // 4. Estoque Central (Tiny)
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

  const carregarLancamentos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('full_lancamentos')
      .select('*')
      .eq('canal', canalSelecionado)
      .eq('mes_referencia', mesSelecionado)
      .order('id', { ascending: false });

    if (data) setLancamentos(data);
    setLoading(false);
  };

  // --- Manipulação do Formulário ---
  const adicionarLinha = () => setLinhas([...linhas, { ...linhaVazia }]);
  const removerLinha = (idx: number) => setLinhas(linhas.filter((_, i) => i !== idx));

  const atualizarLinha = (index: number, campo: keyof LinhaFull, valor: string) => {
    const novas = [...linhas];
    novas[index] = { ...novas[index], [campo]: valor };

    // Auto-preenchimento Visual ao digitar SKU
    if (campo === "sku") {
      const skuKey = normalizarSku(valor);
      const c = custosMap.get(skuKey);
      const est = tinyMap.get(skuKey) || 0;
      
      if (c) {
        novas[index]._previewProduto = c.produto;
        novas[index]._previewCusto = Number(c.custo_unitario || 0);
        novas[index]._previewEstoqueCentral = est;
      } else {
        novas[index]._previewProduto = "";
        novas[index]._previewCusto = 0;
        novas[index]._previewEstoqueCentral = 0;
      }
    }

    setLinhas(novas);
  };

  const calcularCustoCanal = (canal: string, precoUnit: number, receita: number, unidades: number, skuKey: string) => {
    let comissaoPct = 14;
    let tarifaFixa = 0;
    let freteUnitario = 0;

    const isMercadoLivre = canal.toLowerCase().includes("mercado livre");

    if (isMercadoLivre) {
      const mlRegra = regrasMlMap.get(skuKey);
      comissaoPct = mlRegra ? Number(mlRegra.comissao || 0) : 14;
      let pesoReal = mlRegra ? Number(mlRegra.peso_real || 0) : 2.0;
      let altura = mlRegra ? Number(mlRegra.altura || 0) : 10;
      let largura = mlRegra ? Number(mlRegra.largura || 0) : 10;
      let comprimento = mlRegra ? Number(mlRegra.comprimento || 0) : 10;
      
      // Frete ML apenas acima de 78.99
      freteUnitario = calcularFreteML(precoUnit, pesoReal, altura, largura, comprimento);
    } else {
      // Amazon FBA, Shopee, etc.
      const regrasDoCanal = regrasTarifacao.filter(r => r.canal.toLowerCase() === canal.toLowerCase());
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

  const salvarLancamentos = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const impostoPct = Number(aliquotaImposto) || 9;
    const metaDias = Number(metaDiasCobertura) || 45;
    const payloadInsercao: any[] = [];

    for (const l of linhas) {
      if (!l.sku.trim() || !l.qtd_vendida) continue;

      const skuKey = normalizarSku(l.sku);
      const qtdVendida = parseNumero(l.qtd_vendida);
      const receitaBruta = parseNumero(l.receita_bruta);
      const estoqueCD = parseNumero(l.estoque_cd);
      const armazenagemExtra = parseNumero(l.armazenagem);

      const produtoNome = l._previewProduto || "Produto não identificado";
      const custoUnitario = l._previewCusto;
      const estoqueCentral = l._previewEstoqueCentral;

      const precoUnitEstimado = qtdVendida > 0 ? (receitaBruta / qtdVendida) : 0;
      
      const { freteTotal, tarifaComissaoTotal } = calcularCustoCanal(canalSelecionado, precoUnitEstimado, receitaBruta, qtdVendida, skuKey);

      const impostoTotal = receitaBruta * (impostoPct / 100);
      const custoProdutoTotal = custoUnitario * qtdVendida;
      // No Full/FBA, a embalagem é por conta do CD (Marketplace), portanto consideramos zero para não mascarar a margem real.
      
      const tarifaFreteSoma = tarifaComissaoTotal + freteTotal;
      const lucroLiquido = receitaBruta - custoProdutoTotal - impostoTotal - tarifaFreteSoma - armazenagemExtra;
      const margemPct = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;

      // MOTOR DE COBERTURA
      const vmd = qtdVendida / 30;
      const coberturaAtual = vmd > 0 ? (estoqueCD / vmd) : (estoqueCD > 0 ? 999 : 0);
      
      let sugestaoEnvioBruta = Math.ceil((vmd * metaDias) - estoqueCD);
      if (sugestaoEnvioBruta < 0) sugestaoEnvioBruta = 0;

      let statusEstoque = "";
      if (coberturaAtual <= 10 && vmd > 0) statusEstoque = "Ruptura Iminente";
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

      payloadInsercao.push({
        canal: canalSelecionado,
        mes_referencia: mesSelecionado,
        sku: l.sku.trim(),
        produto: produtoNome,
        qtd_vendida: qtdVendida,
        receita_bruta: receitaBruta,
        estoque_cd: estoqueCD,
        armazenagem: armazenagemExtra,
        estoque_central: estoqueCentral,
        custo_produto: custoProdutoTotal,
        imposto: impostoTotal,
        tarifa_frete: tarifaFreteSoma,
        lucro_liquido: lucroLiquido,
        margem_pct: margemPct,
        vmd: Number(vmd.toFixed(2)),
        cobertura_dias: Number(coberturaAtual.toFixed(1)),
        sugestao_envio: qtdEnviar,
        status_estoque: statusEstoque,
        status_envio: statusEnvio
      });
    }

    if (payloadInsercao.length === 0) {
      alert("Preencha ao menos um SKU e Quantidade para salvar.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase.from('full_lancamentos').insert(payloadInsercao);
    if (error) alert("Erro ao salvar: " + error.message);
    else {
      alert("🚀 Lançamentos logísticos processados e salvos com sucesso!");
      setLinhas([{ ...linhaVazia }]);
      carregarLancamentos();
    }
    setSalvando(false);
  };

  const excluirLancamento = async (id: number) => {
    if (!confirm("Excluir este registo?")) return;
    await supabase.from('full_lancamentos').delete().eq('id', id);
    carregarLancamentos();
  };

  const limparCanalInteiro = async () => {
    if (!confirm(`Tem certeza que deseja apagar TODOS os registos de ${canalSelecionado} para ${mesSelecionado}?`)) return;
    await supabase.from('full_lancamentos').delete().eq('canal', canalSelecionado).eq('mes_referencia', mesSelecionado);
    carregarLancamentos();
  };

  const excluirSelecionados = async () => {
    if (selecionadosIds.length === 0) return;
    if (!confirm(`Apagar os ${selecionadosIds.length} registos selecionados?`)) return;
    await supabase.from('full_lancamentos').delete().in('id', selecionadosIds);
    setSelecionadosIds([]);
    carregarLancamentos();
  };

  const toggleCheckbox = (id: number) => {
    if (selecionadosIds.includes(id)) setSelecionadosIds(selecionadosIds.filter(i => i !== id));
    else setSelecionadosIds([...selecionadosIds, id]);
  };

  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelecionadosIds(lancamentos.map(l => l.id));
    else setSelecionadosIds([]);
  };

  // Filtragem do Relatório
  const dadosFiltrados = lancamentos.filter(item => {
    const mText = !pesquisaBusca || item.sku.toLowerCase().includes(pesquisaBusca.toLowerCase()) || item.produto.toLowerCase().includes(pesquisaBusca.toLowerCase());
    const mStatus = filtroStatus === "TODOS" || item.status_estoque === filtroStatus || item.status_envio.includes(filtroStatus);
    return mText && mStatus;
  });

  const kpis = {
    receita: dadosFiltrados.reduce((a, b) => a + Number(b.receita_bruta || 0), 0),
    lucro: dadosFiltrados.reduce((a, b) => a + Number(b.lucro_liquido || 0), 0),
    rupturas: dadosFiltrados.filter(i => i.status_estoque === "Ruptura Iminente").length,
    aging: dadosFiltrados.filter(i => i.status_estoque === "Risco de Aging" || i.status_estoque === "Estoque Parado").length,
    enviarHoje: dadosFiltrados.reduce((a, b) => a + Number(b.sugestao_envio || 0), 0)
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Logística Full & FBA</h1>
            <p className="text-sm font-medium text-slate-400">Motor de Reposição e Análise de Rentabilidade de CD</p>
          </div>
          <Navbar />
        </div>

        {/* PARÂMETROS GLOBAIS */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Canal Logístico:</label>
              <select value={canalSelecionado} onChange={e => setCanalSelecionado(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer">
                {canais.map((c, i) => <option key={i} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Competência (Mês):</label>
              <select value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer">
                {meses.map((m, i) => <option key={i} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Alíquota Imposto (%):</label>
              <input type="number" value={aliquotaImposto} onChange={e => setAliquotaImposto(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-emerald-400 outline-none text-center" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Meta Cobertura Full (Dias):</label>
              <input type="number" value={metaDiasCobertura} onChange={e => setMetaDiasCobertura(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-indigo-400 outline-none text-center" />
            </div>
          </div>
        </div>

        {/* FORMULÁRIO INTELIGENTE */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold text-white mb-2">➕ Inserir Movimentação ({canalSelecionado})</h2>
          <p className="text-xs text-slate-400 mb-6">
            O motor vai deduzir frete Full, comissões em tempo real, calcular o giro diário e cruzar a sugestão de envio com o estoque físico disponível no seu Tiny.
          </p>

          <form onSubmit={salvarLancamentos} className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3 w-48">SKU</th>
                    <th className="p-3 text-center w-24">Qtd Vendida</th>
                    <th className="p-3 text-right w-32">Receita Total (R$)</th>
                    <th className="p-3 text-right w-32 text-emerald-400">Estoque no CD</th>
                    <th className="p-3 text-right w-32 text-amber-400">Armazenagem (R$)</th>
                    <th className="p-3 text-center w-12">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {linhas.map((l, index) => (
                    <React.Fragment key={index}>
                      <tr className="hover:bg-slate-800/40 border-b-0">
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={l.sku} 
                            onChange={(e) => atualizarLinha(index, "sku", e.target.value)}
                            placeholder="SKU..." 
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none focus:border-purple-500"
                            required 
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            value={l.qtd_vendida} 
                            onChange={(e) => atualizarLinha(index, "qtd_vendida", e.target.value)}
                            placeholder="0" 
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center font-bold text-indigo-400 outline-none focus:border-purple-500" 
                            required 
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            step="0.01" 
                            value={l.receita_bruta} 
                            onChange={(e) => atualizarLinha(index, "receita_bruta", e.target.value)}
                            placeholder="0.00" 
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-white outline-none focus:border-purple-500" 
                            required 
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            value={l.estoque_cd} 
                            onChange={(e) => atualizarLinha(index, "estoque_cd", e.target.value)}
                            placeholder="Saldo Full" 
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-bold text-emerald-400 outline-none focus:border-purple-500" 
                            required 
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            step="0.01" 
                            value={l.armazenagem} 
                            onChange={(e) => atualizarLinha(index, "armazenagem", e.target.value)}
                            placeholder="Extra" 
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-amber-400 outline-none focus:border-purple-500" 
                            title="Custos extras de permanência/aging"
                          />
                        </td>
                        <td className="p-2 text-center">
                          {linhas.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => removerLinha(index)}
                              className="bg-rose-950/60 text-rose-400 px-2 py-1.5 rounded-lg text-xs font-bold cursor-pointer hover:bg-rose-900"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* Sub-linha visual de preview */}
                      {l.sku && (
                        <tr className="bg-slate-950/20 border-t-0">
                          <td colSpan={6} className="p-1 pl-4 pb-3">
                            <span className="text-[10px] text-slate-500 flex items-center gap-3">
                              <span className="truncate max-w-[300px] text-slate-400">📦 {l._previewProduto || "Produto não encontrado no banco"}</span>
                              {l._previewCusto > 0 && <span className="font-mono text-slate-400">| Custo Un.: {formatarMoeda(l._previewCusto)}</span>}
                              <span className="font-mono font-bold text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded">🏢 Est. Sede: {l._previewEstoqueCentral}</span>
                            </span>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3">
              <button 
                type="button" 
                onClick={adicionarLinha}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                + Adicionar Outra Linha
              </button>

              <button 
                type="submit" 
                disabled={salvando}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-900/30"
              >
                {salvando ? "A Processar Motor..." : "🚀 Calcular Margem e Reposição"}
              </button>
            </div>
          </form>
        </div>

        {/* KPIs E RELATÓRIO */}
        {lancamentos.length > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Receita Bruta Total</span>
                <span className="text-xl font-black text-white">{formatarMoeda(kpis.receita)}</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Lucro Líquido Estimado</span>
                <span className="text-xl font-black text-emerald-400">{formatarMoeda(kpis.lucro)}</span>
              </div>
              <div className="bg-slate-900/90 border border-rose-900/40 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-rose-400 uppercase mb-2">Rupturas de Estoque</span>
                <span className="text-xl font-black text-rose-400">{kpis.rupturas} SKUs</span>
              </div>
              <div className="bg-slate-900/90 border border-amber-900/40 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-amber-400 uppercase mb-2">Alerta de Aging (Parados)</span>
                <span className="text-xl font-black text-amber-400">{kpis.aging} SKUs</span>
              </div>
              <div className="bg-purple-900/30 border border-purple-800 p-5 rounded-2xl shadow-lg">
                <span className="block text-[10px] font-bold text-purple-400 uppercase mb-2">Enviar ao CD Hoje</span>
                <span className="text-xl font-black text-purple-300">{kpis.enviarHoje} un.</span>
              </div>
            </div>

            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-white">Gestão e Recomendação de Envio</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <input type="text" placeholder="Buscar SKU/Produto" value={pesquisaBusca} onChange={e => setPesquisaBusca(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-48" />
                  
                  <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                    <option value="TODOS">Todos os Status</option>
                    <option value="Enviar">Com Sugestão de Envio</option>
                    <option value="Ruptura Iminente">Ruptura Iminente</option>
                    <option value="Risco de Aging">Risco de Aging</option>
                    <option value="Falta no Central">Sem Saldo na Sede</option>
                  </select>

                  {selecionadosIds.length > 0 ? (
                    <button onClick={excluirSelecionados} className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm">
                      🗑️ Excluir Selecionados
                    </button>
                  ) : (
                    <button onClick={limparCanalInteiro} className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-sm">
                      🗑️ Limpar Canal
                    </button>
                  )}
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3 text-center w-10">
                        <input type="checkbox" onChange={toggleAll} checked={lancamentos.length > 0 && selecionadosIds.length === lancamentos.length} className="accent-purple-600 rounded cursor-pointer" />
                      </th>
                      <th className="p-3">SKU</th>
                      <th className="p-3 min-w-[200px]">Produto</th>
                      <th className="p-3 text-center">Vendas</th>
                      <th className="p-3 text-right text-emerald-300">Est. CD</th>
                      <th className="p-3 text-right text-indigo-300">Est. Sede</th>
                      <th className="p-3 text-center">Cobertura</th>
                      <th className="p-3 text-right">Margem LÍQ.</th>
                      <th className="p-3 text-center border-l border-slate-800">Status CD</th>
                      <th className="p-3 text-center">Ação Reposição</th>
                      <th className="p-3 text-center font-black text-purple-400">📦 Enviar Qtd</th>
                      <th className="p-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {dadosFiltrados.map((item) => {
                      const isSelected = selecionadosIds.includes(item.id);
                      return (
                        <tr key={item.id} className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-purple-950/20' : ''}`}>
                          <td className="p-3 text-center">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleCheckbox(item.id)} className="accent-purple-600 rounded cursor-pointer" />
                          </td>
                          <td className="p-3 font-mono font-bold text-white">{item.sku}</td>
                          <td className="p-3 text-slate-300 truncate max-w-[200px]" title={item.produto}>{item.produto}</td>
                          <td className="p-3 text-center font-bold text-slate-200">{item.qtd_vendida}</td>
                          
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">{item.estoque_cd}</td>
                          <td className="p-3 text-right font-mono font-bold text-indigo-400">{item.estoque_central}</td>
                          
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.cobertura_dias < 10 ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40' : item.cobertura_dias > 60 ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' : 'text-slate-400'}`}>
                              {item.cobertura_dias > 900 ? '+90' : item.cobertura_dias.toFixed(0)} dias
                            </span>
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${item.margem_pct >= 10 ? 'text-emerald-400' : 'text-rose-500'}`} title={`Lucro: ${formatarMoeda(item.lucro_liquido)}`}>
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

                          <td className="p-3 text-center">
                            <button onClick={() => excluirLancamento(item.id)} className="bg-rose-950/60 hover:bg-rose-900 text-rose-400 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer">
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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