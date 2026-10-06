import Navbar from "../../components/Navbar"; // ajuste o caminho relativo conforme a página

// No cabeçalho da página:
<div className="flex items-center gap-3">
  <Navbar />
</div>
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

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

export default function AdsPage() {
  const [subAba, setSubAba] = useState<"campanhas" | "dashboard">("campanhas");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  const [canalSelecionado, setCanalSelecionado] = useState("");
  const [mesSelecionado, setMesSelecionado] = useState("09/2026");
  const [mesComparativo, setMesComparativo] = useState("08/2026");

  const [canaisAtivos, setCanaisAtivos] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [dadosComparativo, setDadosComparativo] = useState<any[]>([]);

  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [regrasMlMap, setRegrasMlMap] = useState<Map<string, any>>(new Map());

  const [idEditando, setIdEditando] = useState<number | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<any>({});

  // Estado para controlo de seleção de linhas
  const [selecionadosIds, setSelecionadosIds] = useState<number[]>([]);

  const [linhas, setLinhas] = useState([
    { mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "" }
  ]);

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
      setSelecionadosIds([]); // Limpa seleção ao trocar canal ou mês
    }
  }, [canalSelecionado, mesSelecionado]);

  useEffect(() => {
    if (subAba === "dashboard") {
      carregarDadosDashboard();
    }
  }, [subAba, mesSelecionado, mesComparativo]);

  const carregarDadosAuxiliares = async () => {
    const { data: regrasCanaisData } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regrasCanaisData) {
      const ativos = regrasCanaisData.filter((c: any) => c.ativo_ads !== false);
      setCanaisAtivos(ativos);
      if (ativos.length > 0) setCanalSelecionado(ativos[0].canal);
    }

    let allCustos: any[] = [];
    let from = 0;
    let step = 1000;
    let keep = true;
    while (keep) {
      const { data } = await supabase.from('tabela_custos_skus').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        allCustos = [...allCustos, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else {
        keep = false;
      }
    }
    const mapaC = new Map();
    allCustos.forEach((c: any) => {
      const skuNorm = normalizarSku(c.sku);
      if (skuNorm) mapaC.set(skuNorm, c);
    });
    setCustosMap(mapaC);

    let allMl: any[] = [];
    from = 0;
    keep = true;
    while (keep) {
      const { data } = await supabase.from('ml_anuncios_regras').select('*').range(from, from + step - 1);
      if (data && data.length > 0) {
        allMl = [...allMl, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else {
        keep = false;
      }
    }
    const mapaMl = new Map();
    allMl.forEach((m: any) => {
      const mlbLimpo = String(m.mlb || "").trim().toUpperCase();
      if (mlbLimpo) mapaMl.set(mlbLimpo, m);
    });
    setRegrasMlMap(mapaMl);
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

    const { data: dadosAtual } = await supabase.from('ads_campanhas_lancamentos').select('*').eq('mes_referencia', mesSelecionado);
    const { data: dadosAnterior } = await supabase.from('ads_campanhas_lancamentos').select('*').eq('mes_referencia', mesComparativo);

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

      const totFatAtual = itensA.reduce((sum, i) => sum + Number(i.faturamento_total || 0), 0);
      const totFatAnt = itensB.reduce((sum, i) => sum + Number(i.faturamento_total || 0), 0);

      const tacosAtual = totFatAtual > 0 ? (invAtual / totFatAtual) * 100 : 0;
      const tacosAnt = totFatAnt > 0 ? (invAnt / totFatAnt) * 100 : 0;

      const margemRsAtual = itensA.reduce((sum, i) => sum + Number(i.margem_liquida_rs || 0), 0);
      const margemRsAnt = itensB.reduce((sum, i) => sum + Number(i.margem_liquida_rs || 0), 0);
      const diffMargemRs = margemRsAtual - margemRsAnt;

      const repAds = totFatAtual > 0 ? (fatAdsAtual / totFatAtual) * 100 : 0;
      const tacosSugerido = fatAdsAtual > 0 ? (fatAdsAtual * 0.15) : 0;

      return {
        canal,
        fatAdsAtual,
        fatAdsAnt,
        diffAds,
        roasAtual,
        roasAnt,
        tacosAtual,
        tacosAnt,
        margemRsAtual,
        margemRsAnt,
        diffMargemRs,
        totFatAtual,
        repAds,
        tacosSugerido
      };
    });

    setDadosComparativo(consolidado);
    setLoading(false);
  };

  const adicionarLinhaForm = () => {
    setLinhas([...linhas, { mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "" }]);
  };

  const atualizarLinhaForm = (index: number, campo: string, valor: string) => {
    const novasLinhas = [...linhas];
    novasLinhas[index] = { ...novasLinhas[index], [campo]: valor };
    setLinhas(novasLinhas);
  };

  const removerLinhaForm = (index: number) => {
    setLinhas(linhas.filter((_, i) => i !== index));
  };

  const salvarLancamentos = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const formatados = linhas
      .filter(l => l.mlb.trim() !== "" && l.sku.trim() !== "")
      .map(l => {
        const skuLimpo = l.sku.trim();
        const skuKey = normalizarSku(skuLimpo);
        const mlbLimpo = l.mlb.trim().toUpperCase();
        const unidades = Number(l.unidades || 0);
        const receitaAds = Number(l.receitaAds || 0);
        const investimento = Number(l.investimento || 0);

        const custoRegra = custosMap.get(skuKey);
        const mlRegra = regrasMlMap.get(mlbLimpo);

        const produtoNome = custoRegra?.produto || "Produto sem nome";
        const custoUnitario = Number(custoRegra?.custo_unitario || 0);
        const custoProdutoTotal = custoUnitario * unidades;

        let comissaoPct = mlRegra ? Number(mlRegra.comissao || 0) : 14;
        let pesoReal = mlRegra ? Number(mlRegra.peso_real || 0) : 2.0;
        let altura = mlRegra ? Number(mlRegra.altura || 0) : 10;
        let largura = mlRegra ? Number(mlRegra.largura || 0) : 10;
        let comprimento = mlRegra ? Number(mlRegra.comprimento || 0) : 10;

        const precoUnitarioEstimado = unidades > 0 ? (receitaAds / unidades) : 100;
        const freteUnitario = calcularFreteML(precoUnitarioEstimado, pesoReal, altura, largura, comprimento);
        const freteTotal = freteUnitario * unidades;

        const impostoTotal = receitaAds * 0.08;
        const tarifaComissaoTotal = receitaAds * (comissaoPct / 100);
        const embalagemTotal = 0.70 * unidades;

        const faturamentoTotal = receitaAds;
        const margemLiquidaVal = faturamentoTotal - (investimento + custoProdutoTotal + impostoTotal + tarifaComissaoTotal + embalagemTotal + freteTotal);
        const margemLiquidaPct = faturamentoTotal > 0 ? (margemLiquidaVal / faturamentoTotal) : 0;

        return {
          canal: canalSelecionado,
          mes_referencia: mesSelecionado,
          identificador_anuncio: mlbLimpo,
          nome_anuncio: produtoNome,
          sku: skuLimpo,
          unidades_vendidas: unidades,
          investimento: investimento,
          retorno_bruto: receitaAds,
          faturamento_total: faturamentoTotal,
          custo_produto: custoProdutoTotal,
          imposto: impostoTotal,
          tarifa: tarifaComissaoTotal,
          embalagem: embalagemTotal,
          frete: freteTotal,
          margem_liquida_rs: margemLiquidaVal,
          margem_liquida_pct: margemLiquidaPct
        };
      });

    if (formatados.length === 0) {
      alert("Preencha pelo menos um MLB e SKU válidos.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase.from('ads_campanhas_lancamentos').insert(formatados);
    if (error) {
      alert("Erro ao gravar lançamentos: " + error.message);
    } else {
      alert("✅ Anúncios salvos e calculados com sucesso!");
      setLinhas([{ mlb: "", sku: "", unidades: "", receitaAds: "", investimento: "" }]);
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
    const skuLimpo = String(dadosEdicao.sku || "").trim();
    const skuKey = normalizarSku(skuLimpo);
    const mlbLimpo = String(dadosEdicao.identificador_anuncio || "").trim().toUpperCase();

    const custoRegra = custosMap.get(skuKey);
    const mlRegra = regrasMlMap.get(mlbLimpo);

    const produtoNome = custoRegra?.produto || "Produto sem nome";
    const custoUnitario = Number(custoRegra?.custo_unitario || 0);
    const custoProdutoTotal = custoUnitario * unidades;

    let comissaoPct = mlRegra ? Number(mlRegra.comissao || 0) : 14;
    let pesoReal = mlRegra ? Number(mlRegra.peso_real || 0) : 2.0;
    let altura = mlRegra ? Number(mlRegra.altura || 0) : 10;
    let largura = mlRegra ? Number(mlRegra.largura || 0) : 10;
    let comprimento = mlRegra ? Number(mlRegra.comprimento || 0) : 10;

    const precoUnitarioEstimado = unidades > 0 ? (receitaAds / unidades) : 100;
    const freteUnitario = calcularFreteML(precoUnitarioEstimado, pesoReal, altura, largura, comprimento);
    const freteTotal = freteUnitario * unidades;

    const impostoTotal = receitaAds * 0.08;
    const tarifaComissaoTotal = receitaAds * (comissaoPct / 100);
    const embalagemTotal = 0.70 * unidades;

    const faturamentoTotal = receitaAds;
    const margemLiquidaVal = faturamentoTotal - (investimento + custoProdutoTotal + impostoTotal + tarifaComissaoTotal + embalagemTotal + freteTotal);
    const margemLiquidaPct = faturamentoTotal > 0 ? (margemLiquidaVal / faturamentoTotal) : 0;

    const atualizacao = {
      identificador_anuncio: mlbLimpo,
      sku: skuLimpo,
      nome_anuncio: produtoNome,
      unidades_vendidas: unidades,
      retorno_bruto: receitaAds,
      investimento: investimento,
      faturamento_total: faturamentoTotal,
      custo_produto: custoProdutoTotal,
      imposto: impostoTotal,
      tarifa: tarifaComissaoTotal,
      embalagem: embalagemTotal,
      frete: freteTotal,
      margem_liquida_rs: margemLiquidaVal,
      margem_liquida_pct: margemLiquidaPct
    };

    const { error } = await supabase.from('ads_campanhas_lancamentos').update(atualizacao).eq('id', id);
    if (error) {
      alert("Erro ao atualizar: " + error.message);
    } else {
      setIdEditando(null);
      carregarLancamentos();
    }
  };

  const excluirLancamento = async (id: number) => {
    if (!confirm("Tem certeza que deseja apagar este registo?")) return;
    const { error } = await supabase.from('ads_campanhas_lancamentos').delete().eq('id', id);
    if (error) alert("Erro ao excluir: " + error.message);
    else carregarLancamentos();
  };

  // Funções de exclusão em massa
  const selecionarTodosCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelecionadosIds(lancamentos.map(i => i.id));
    } else {
      setSelecionadosIds([]);
    }
  };

  const selecionarLinhaCheckbox = (id: number) => {
    if (selecionadosIds.includes(id)) {
      setSelecionadosIds(selecionadosIds.filter(i => i !== id));
    } else {
      setSelecionadosIds([...selecionadosIds, id]);
    }
  };

  const excluirSelecionados = async () => {
    if (selecionadosIds.length === 0) {
      alert("Nenhum registo selecionado.");
      return;
    }
    if (!confirm(`Tem certeza que deseja apagar os ${selecionadosIds.length} registos selecionados?`)) return;

    const { error } = await supabase.from('ads_campanhas_lancamentos').delete().in('id', selecionadosIds);
    if (error) {
      alert("Erro ao excluir selecionados: " + error.message);
    } else {
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

    if (error) {
      alert("Erro ao limpar canal: " + error.message);
    } else {
      alert(`🗑️ Todos os registos de "${canalSelecionado}" (${mesSelecionado}) foram eliminados com sucesso!`);
      setSelecionadosIds([]);
      carregarLancamentos();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Unificado de Ads & Campanhas</h1>
            <p className="text-sm font-medium text-slate-400">Gestão e Performance de Ads por Canal</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">Dashboard</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/upload">Upload & Canais</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/mapeamento">Mapeamento</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/ads">Painel Ads</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/regras">Regras</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">Admin</Link>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
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
            📊 Dashboard Comparativo & Budget
          </button>
        </div>

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
              <p className="text-xs text-slate-400 mb-6">Insira o MLB, SKU, Unidades e Receita Ads para o canal <strong>{canalSelecionado}</strong> ({mesSelecionado}).</p>

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
                      {linhas.map((l, index) => (
                        <tr key={index} className="bg-slate-950/40">
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={l.mlb} 
                              onChange={(e) => atualizarLinhaForm(index, "mlb", e.target.value)}
                              placeholder="Ex: MLB4384359235" 
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none"
                              required 
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={l.sku} 
                              onChange={(e) => atualizarLinhaForm(index, "sku", e.target.value)}
                              placeholder="Ex: 22362042067" 
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-white outline-none"
                              required 
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              type="number" 
                              value={l.unidades} 
                              onChange={(e) => atualizarLinhaForm(index, "unidades", e.target.value)}
                              placeholder="0" 
                              className="w-24 mx-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-center text-white outline-none" 
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              type="number" 
                              step="0.01" 
                              value={l.receitaAds} 
                              onChange={(e) => atualizarLinhaForm(index, "receitaAds", e.target.value)}
                              placeholder="0.00" 
                              className="w-32 ml-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-white outline-none" 
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              type="number" 
                              step="0.01" 
                              value={l.investimento} 
                              onChange={(e) => atualizarLinhaForm(index, "investimento", e.target.value)}
                              placeholder="0.00" 
                              className="w-32 ml-auto block bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-right font-mono text-white outline-none" 
                            />
                          </td>
                          <td className="p-2 text-center">
                            {linhas.length > 1 && (
                              <button 
                                type="button" 
                                onClick={() => removerLinhaForm(index)}
                                className="bg-rose-950/60 text-rose-400 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
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
                            onChange={selecionarTodosCheckbox}
                            checked={lancamentos.length > 0 && selecionadosIds.length === lancamentos.length}
                            className="cursor-pointer accent-purple-600 rounded"
                          />
                        </th>
                        <th className="p-3">MLB</th>
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
                              {isEditing ? <input type="number" step="0.01" value={dadosEdicao.retorno_bruto} onChange={(e) => setDadosEdicao({ ...dadosEdicao, retorno_bruto: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-right text-white" /> : `R$ ${Number(item.retorno_bruto).toFixed(2)}`}
                            </td>
                            <td className="p-3 text-right font-mono text-rose-400">
                              {isEditing ? <input type="number" step="0.01" value={dadosEdicao.investimento} onChange={(e) => setDadosEdicao({ ...dadosEdicao, investimento: e.target.value })} className="bg-slate-900 border border-slate-700 rounded p-1 w-24 text-right text-white" /> : `R$ ${Number(item.investimento).toFixed(2)}`}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.custo_produto || 0).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.imposto || 0).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.tarifa || 0).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.embalagem || 0).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono text-slate-300">R$ {Number(item.frete || 0).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-bold text-indigo-400">{roas}x</td>
                            <td className="p-3 text-right font-mono font-bold text-amber-400">{tacos}%</td>
                            <td className={`p-3 text-right font-mono font-bold ${margemVal >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>R$ {margemVal.toFixed(2)}</td>
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
              </div>
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
                      <th className="p-3 text-right">Fat. Ads (Anterior)</th>
                      <th className="p-3 text-right">Dif. Ads (R$)</th>
                      <th className="p-3 text-right">ROAS Atual</th>
                      <th className="p-3 text-right">ROAS Anterior</th>
                      <th className="p-3 text-right">TACOS Atual</th>
                      <th className="p-3 text-right">TACOS Anterior</th>
                      <th className="p-3 text-right">Margem Líq. R$ (Atual)</th>
                      <th className="p-3 text-right">Margem Líq. R$ (Ant)</th>
                      <th className="p-3 text-right">Dif. Margem R$</th>
                      <th className="p-3 text-right">Total Faturado</th>
                      <th className="p-3 text-right">Rep. Ads %</th>
                      <th className="p-3 text-right">TACOS Sugerido (Budget)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {dadosComparativo.map((d, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-bold text-white">{d.canal}</td>
                        <td className="p-3 text-right font-mono text-emerald-400">R$ {d.fatAdsAtual.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-slate-300">R$ {d.fatAdsAnt.toFixed(2)}</td>
                        <td className={`p-3 text-right font-mono font-bold ${d.diffAds >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {d.diffAds >= 0 ? '+' : ''}R$ {d.diffAds.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-indigo-400 font-bold">{d.roasAtual.toFixed(2)}x</td>
                        <td className="p-3 text-right font-mono text-slate-300">{d.roasAnt.toFixed(2)}x</td>
                        <td className="p-3 text-right font-mono text-amber-400 font-bold">{d.tacosAtual.toFixed(2)}%</td>
                        <td className="p-3 text-right font-mono text-slate-300">{d.tacosAnt.toFixed(2)}%</td>
                        <td className="p-3 text-right font-mono text-emerald-300">R$ {d.margemRsAtual.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-slate-300">R$ {d.margemRsAnt.toFixed(2)}</td>
                        <td className={`p-3 text-right font-mono font-bold ${d.diffMargemRs >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {d.diffMargemRs >= 0 ? '+' : ''}R$ {d.diffMargemRs.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-white">R$ {d.totFatAtual.toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-violet-400 font-bold">{d.repAds.toFixed(2)}%</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">R$ {d.tacosSugerido.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}