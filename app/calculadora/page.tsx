"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

function normalizarSku(valor: any) {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  return s.toLowerCase();
}

const formatarMoeda = (valor: number) =>
  "R$ " + (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CalculadoraPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [modoCalculo, setModoCalculo] = useState<"pdv_ideal" | "reversa">("pdv_ideal");

  // Inputs
  const [skuBusca, setSkuBusca] = useState("");
  const [marcaFiltro, setMarcaFiltro] = useState("");
  const [margemAlvo, setMargemAlvo] = useState("30");
  const [precoFixo, setPrecoFixo] = useState("60.00");
  const [rebate, setRebate] = useState("0.00");

  // Dados e Bases
  const [produtoEncontrado, setProdutoEncontrado] = useState<any>(null);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  const [mapeamentoMap, setMapeamentoMap] = useState<Map<string, any[]>>(new Map());
  const [canaisConfig, setCanaisConfig] = useState<any[]>([]);

  // Canais selecionados para exibição (Checkbox filter)
  const [canaisSelecionados, setCanaisSelecionados] = useState<string[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarBases();
  }, []);

  const carregarBases = async () => {
    setLoading(true);

    // 1. Carrega custos dos SKUs
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
      if (k) mapaCustos.set(k, c);
    });
    setCustosMap(mapaCustos);

    // 2. Carrega tabela de mapeamento / anúncios (para verificar se tem MLB e comissões específicas)
    let allMap: any[] = [];
    from = 0;
    keep = true;
    while (keep) {
      const { data } = await supabase.from("config_regras_canais").select("*").range(from, from + step - 1);
      if (data && data.length > 0) {
        allMap = [...allMap, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }

    // Se houver tabela de mapeamento de anúncios (ex: mapeamento_skus ou similar)
    const { data: mapAnuncios } = await supabase.from("mapeamento_skus").select("*").limit(2000).catch(() => ({ data: [] }));
    const mapaAnunciosSku = new Map();
    if (mapAnuncios) {
      mapAnuncios.forEach((m: any) => {
        const k = normalizarSku(m.sku);
        if (k) {
          if (!mapaAnunciosSku.has(k)) mapaAnunciosSku.set(k, []);
          mapaAnunciosSku.get(k).push(m);
        }
      });
    }
    setMapeamentoMap(mapaAnunciosSku);

    // 3. Carrega regras de canais (comissões, tarifas fixas, fretes)
    const { data: regrasData } = await supabase.from("config_regras_canais").select("*");
    let listaCanais = [];
    if (regrasData && regrasData.length > 0) {
      listaCanais = regrasData;
    } else {
      listaCanais = [
        { canal: "Mercado Livre Clássico", comissao: 14, tarifa_fixa: 0, frete: 0 },
        { canal: "Mercado Livre Premium", comissao: 18, tarifa_fixa: 0, frete: 0 },
        { canal: "Shopee", comissao: 20, tarifa_fixa: 4.00, frete: 0 },
        { canal: "Amazon", comissao: 14, tarifa_fixa: 4.00, frete: 21.95 },
        { canal: "Magalu", comissao: 18, tarifa_fixa: 5.00, frete: 20.45 },
        { canal: "Netshoes", comissao: 25, tarifa_fixa: 5.00, frete: 0 },
        { canal: "Shein", comissao: 16, tarifa_fixa: 6.00, frete: 0 },
        { canal: "TikTok", comissao: 15, tarifa_fixa: 3.00, frete: 0 },
        { canal: "Centauro", comissao: 21, tarifa_fixa: 0, frete: 0 }
      ];
    }

    setCanaisConfig(listaCanais);
    // Por padrão, seleciona todos os canais
    setCanaisSelecionados(listaCanais.map((c: any) => c.canal));

    setLoading(false);
  };

  const handleBuscarProduto = () => {
    const key = normalizarSku(skuBusca);
    if (!key) {
      alert("Digite um SKU válido.");
      return;
    }
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

  const toggleCanalSelecao = (canalNome: string) => {
    if (canaisSelecionados.includes(canalNome)) {
      setCanaisSelecionados(canaisSelecionados.filter((c) => c !== canalNome));
    } else {
      setCanaisSelecionados([...canaisSelecionados, canalNome]);
    }
  };

  const selecionarTodosCanais = (selecionar: boolean) => {
    if (selecionar) {
      setCanaisSelecionados(canaisConfig.map((c) => c.canal));
    } else {
      setCanaisSelecionados([]);
    }
  };

  // Cálculo por canal aplicando regras de comissão ML (MLB) e taxa de imposto 9%
  const calcularResultadosCanais = () => {
    if (!produtoEncontrado) return [];

    const custoProduto = Number(produtoEncontrado.custo_unitario || 25.88);
    const impostoPercent = 0.09; // 9% imposto corporativo fixo
    const skuKey = normalizarSku(produtoEncontrado.sku);

    // Verifica se tem anúncio com MLB na base para este SKU
    const anunciosSku = mapeamentoMap.get(skuKey) || [];
    const temMlbClassico = anunciosSku.some((a: any) => String(a.tipo || a.canal || "").toLowerCase().includes("clássico") || Number(a.comissao) <= 14);
    const temMlbPremium = anunciosSku.some((a: any) => String(a.tipo || a.canal || "").toLowerCase().includes("premium") || Number(a.comissao) > 14);

    return canaisConfig
      .filter((c) => canaisSelecionados.includes(c.canal))
      .map((regra) => {
        const canalNome = regra.canal;
        let comissaoPct = Number(regra.comissao || 14) / 100;

        // Regra específica solicitada para o Mercado Livre:
        // Se for Clássico e não houver MLB específico, usa margem travada de 14%
        // Se for Premium e não houver MLB específico, usa margem travada de 18%
        if (canalNome.toLowerCase().includes("clássico") && !temMlbClassico) {
          comissaoPct = 0.14;
        } else if (canalNome.toLowerCase().includes("premium") && !temMlbPremium) {
          comissaoPct = 0.18;
        }

        const tarifaFixa = Number(regra.tarifa_fixa || regra.tarifa || 0);
        let freteVariavel = Number(regra.frete || 12.99);

        if (modoCalculo === "pdv_ideal") {
          const margemAlvoDec = parseFloat(margemAlvo) / 100;
          const denominador = 1 - (comissaoPct + impostoPercent + margemAlvoDec);

          let pdvCalculado = denominador > 0 ? (custoProduto + tarifaFixa + freteVariavel) / denominador : custoProduto * 2;

          // Regra de isenção/redução de frete para preços <= R$ 78.99 em marketplaces parceiros
          if (pdvCalculado <= 78.99 && (canalNome.toLowerCase().includes("amazon") || canalNome.toLowerCase().includes("magalu") || canalNome.toLowerCase().includes("shopee"))) {
            freteVariavel = 0;
            pdvCalculado = denominador > 0 ? (custoProduto + tarifaFixa + freteVariavel) / denominador : pdvCalculado;
          }

          const valorComissao = pdvCalculado * comissaoPct;
          const valorImposto = pdvCalculado * impostoPercent;
          const lucroLiquido = pdvCalculado - (custoProduto + valorComissao + tarifaFixa + freteVariavel + valorImposto);
          const margemFinal = pdvCalculado > 0 ? (lucroLiquido / pdvCalculado) * 100 : 0;

          return {
            canal: canalNome,
            pdv: pdvCalculado,
            custoProduto,
            comissaoPct: comissaoPct * 100,
            valorComissao,
            tarifaFixa,
            frete: freteVariavel,
            valorImposto,
            lucroLiquido,
            margemFinal
          };
        } else {
          // Modo Margem Reversa
          const pdvBase = parseNumero(precoFixo);
          const valRebate = parseNumero(rebate);
          const pdvEfetivo = Math.max(0, pdvBase - valRebate);

          if (pdvEfetivo <= 78.99 && (canalNome.toLowerCase().includes("amazon") || canalNome.toLowerCase().includes("magalu"))) {
            freteVariavel = 0;
          }

          const valorComissao = pdvEfetivo * comissaoPct;
          const valorImposto = pdvEfetivo * impostoPercent;
          const lucroLiquido = pdvEfetivo - (custoProduto + valorComissao + tarifaFixa + freteVariavel + valorImposto);
          const margemFinal = pdvEfetivo > 0 ? (lucroLiquido / pdvEfetivo) * 100 : 0;

          return {
            canal: canalNome,
            pdv: pdvBase,
            rebate: valRebate,
            custoProduto,
            comissaoPct: comissaoPct * 100,
            valorComissao,
            tarifaFixa,
            frete: freteVariavel,
            valorImposto,
            lucroLiquido,
            margemFinal
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
        
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Calculadora de Precificação & Margens</h1>
            <p className="text-sm font-medium text-slate-400">Simulação de PDV ideal e margem reversa com regras MLB e seleção customizada de canais</p>
          </div>
          <Navbar />
        </div>

        {/* Selecionar Modo de Cálculo */}
        <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
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
        </div>

        {/* Formulário de Busca e Parâmetros */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">SKU(s) — Digite o SKU:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skuBusca}
                  onChange={(e) => setSkuBusca(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBuscarProduto()}
                  placeholder="Ex: 18181"
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
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
              />
            </div>

            {modoCalculo === "pdv_ideal" ? (
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Margem Alvo (%):</label>
                <input
                  type="number"
                  value={margemAlvo}
                  onChange={(e) => setMargemAlvo(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2.5 text-xs font-mono text-amber-300 font-bold outline-none"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-purple-400 uppercase mb-1">Preço Fixo (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={precoFixo}
                    onChange={(e) => setPrecoFixo(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-600/50 rounded-xl p-2.5 text-xs font-mono text-purple-300 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-purple-400 uppercase mb-1">Rebate (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rebate}
                    onChange={(e) => setRebate(e.target.value)}
                    className="w-full bg-slate-950 border border-purple-600/50 rounded-xl p-2.5 text-xs font-mono text-purple-300 font-bold outline-none"
                  />
                </div>
              </>
            )}
          </div>

          {/* SELETOR DE CANAIS POR CHECKBOX */}
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
              {canaisConfig.map((c, i) => {
                const ativo = canaisSelecionados.includes(c.canal);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleCanalSelecao(c.canal)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      ativo
                        ? "bg-purple-600/30 text-purple-300 border-purple-500/60 shadow-sm"
                        : "bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300"
                    }`}
                  >
                    {ativo ? "✓ " : "+ "} {c.canal}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detalhes do Produto Selecionado */}
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
              <span className="block text-[9px] font-bold text-slate-500 uppercase">Custo Base (CMV)</span>
              <span className="text-xs font-mono font-bold text-rose-400">{formatarMoeda(produtoEncontrado.custo_unitario)}</span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-900/50 px-3 py-1.5 rounded-xl">
              <span className="block text-[9px] font-bold text-emerald-400 uppercase">Status do Item</span>
              <span className="text-xs font-bold text-emerald-300">LINHA NORMAL (Ativo)</span>
            </div>
          </div>
        )}

        {/* Cards de Resultados por Canal Selecionado */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {resultadosCanais.map((res, idx) => (
            <div key={idx} className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white">{res.canal}</h3>
                <span className="text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800/40 px-2 py-0.5 rounded">
                  Comissão: {res.comissaoPct.toFixed(0)}%
                </span>
              </div>

              <div className="p-5 space-y-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">
                    {modoCalculo === "pdv_ideal" ? "Preço de Venda (PDV Ideal)" : "Preço de Venda (PDV Fixo)"}
                  </span>
                  <span className="text-2xl font-black text-emerald-400 font-mono mt-0.5 block">
                    {formatarMoeda(res.pdv)}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono text-slate-300 pt-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Custo Produto:</span>
                    <span className="text-rose-400">- {formatarMoeda(res.custoProduto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Comissão ({res.comissaoPct.toFixed(0)}%):</span>
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

      </div>
    </div>
  );
}