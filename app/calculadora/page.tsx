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
  
  // Regras vindas em tempo real do banco
  const [canaisConfig, setCanaisConfig] = useState<string[]>([]);
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);
  const [canaisSelecionados, setCanaisSelecionados] = useState<string[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarBasesEmTempoReal();
  }, []);

  const carregarBasesEmTempoReal = async () => {
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

    // 2. Carrega tabela de mapeamento de anúncios (Mercado Livre MLB / Comissões específicas)
    const mapaAnunciosSku = new Map();
    try {
      const { data: mapAnuncios } = await supabase.from("mapeamento_skus").select("*").limit(2000);
      if (mapAnuncios) {
        mapAnuncios.forEach((m: any) => {
          const k = normalizarSku(m.sku);
          if (k) {
            if (!mapaAnunciosSku.has(k)) mapaAnunciosSku.set(k, []);
            mapaAnunciosSku.get(k).push(m);
          }
        });
      }
    } catch (err) {
      console.log("Mapeamento de SKUs opcional não encontrado.");
    }
    setMapeamentoMap(mapaAnunciosSku);

    // 3. Carrega canais cadastrados
    const { data: canaisData } = await supabase.from("config_regras_canais").select("*").order("id");
    let listaNomesCanais: string[] = [];
    if (canaisData && canaisData.length > 0) {
      listaNomesCanais = canaisData.map((c: any) => c.canal);
    } else {
      listaNomesCanais = ["Mercado Livre Clássico", "Mercado Livre Premium", "Amazon", "Shopee", "Magalu", "Netshoes", "Shein", "TikTok Shop", "Centauro", "Site"];
    }

    setCanaisConfig(listaNomesCanais);
    setCanaisSelecionados(listaNomesCanais);

    // 4. Carrega regras de tarifação em tempo real (config_regras_tarifacao)
    const { data: tarifacaoData } = await supabase.from("config_regras_tarifacao").select("*");
    if (tarifacaoData) {
      setRegrasTarifacao(tarifacaoData);
    }

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
      setCanaisSelecionados(canaisConfig);
    } else {
      setCanaisSelecionados([]);
    }
  };

  // Função auxiliar para encontrar a regra de tarifação com base no canal e faixa de preço
  const obterRegraCanal = (canalNome: string, precoReferencia: number) => {
    const regrasDoCanal = regrasTarifacao.filter((r) => r.canal.toLowerCase() === canalNome.toLowerCase());

    if (regrasDoCanal.length === 0) {
      // Regras padrão caso não estejam cadastradas na aba de regras
      if (canalNome.toLowerCase().includes("clássico")) return { comissao: 14, tarifa_fixa: 0, frete: 0 };
      if (canalNome.toLowerCase().includes("premium")) return { comissao: 18, tarifa_fixa: 0, frete: 0 };
      return { comissao: 15, tarifa_fixa: 4.00, frete: 12.99 };
    }

    // Procura por faixa de preço correspondente (ex: "R$ 0.00 até R$ 78.99" ou "0 até 50")
    for (const regra of regrasDoCanal) {
      const faixaStr = String(regra.faixa_preco || "").toLowerCase();
      if (faixaStr.includes("em diante") || faixaStr.includes("até 99999")) {
        // Verifica limite inferior se houver
        const matchNums = faixaStr.match(/[\d.,]+/g);
        if (matchNums && matchNums.length > 0) {
          const limiteInf = parseNumero(matchNums[0]);
          if (precoReferencia >= limiteInf) return regra;
        } else {
          return regra;
        }
      } else if (faixaStr.includes("até")) {
        const matchNums = faixaStr.match(/[\d.,]+/g);
        if (matchNums && matchNums.length >= 2) {
          const min = parseNumero(matchNums[0]);
          const max = parseNumero(matchNums[1]);
          if (precoReferencia >= min && precoReferencia <= max) return regra;
        }
      }
    }

    // Retorna a primeira regra encontrada caso nenhuma faixa exata bata
    return regrasDoCanal[0];
  };

  const calcularResultadosCanais = () => {
    if (!produtoEncontrado) return [];

    const custoProduto = Number(produtoEncontrado.custo_unitario || 25.88);
    const impostoPercent = 0.09; // 9% imposto fixo corporativo
    const skuKey = normalizarSku(produtoEncontrado.sku);

    // Mapeamento MLB para Mercado Livre
    const anunciosSku = mapeamentoMap.get(skuKey) || [];
    const temMlbClassico = anunciosSku.some((a: any) => String(a.tipo || a.canal || "").toLowerCase().includes("clássico") || Number(a.comissao) <= 14);
    const temMlbPremium = anunciosSku.some((a: any) => String(a.tipo || a.canal || "").toLowerCase().includes("premium") || Number(a.comissao) > 14);

    return canaisConfig
      .filter((canalNome) => canaisSelecionados.includes(canalNome))
      .map((canalNome) => {
        let comissaoPct = 0.14;
        let tarifaFixa = 0;
        let freteVariavel = 12.99;

        const cLower = canalNome.toLowerCase();

        if (cLower.includes("mercado livre")) {
          if (cLower.includes("clássico")) {
            comissaoPct = temMlbClassico ? 0.14 : 0.14;
          } else if (cLower.includes("premium")) {
            comissaoPct = temMlbPremium ? 0.18 : 0.18;
          }
          const regraMl = obterRegraCanal(canalNome, 100);
          tarifaFixa = Number(regraMl.tarifa_fixa || 0);
          freteVariavel = Number(regraMl.frete || 0);
        } else {
          // Demais canais buscam dinamicamente na aba de regras (config_regras_tarifacao)
          const precoEstimado = modoCalculo === "pdv_ideal" ? 80.0 : parseNumero(precoFixo);
          const regraEncontrada = obterRegraCanal(canalNome, precoEstimado);

          comissaoPct = Number(regraEncontrada.comissao || 14) / 100;
          tarifaFixa = Number(regraEncontrada.tarifa_fixa || 0);
          freteVariavel = Number(regraEncontrada.frete || 0);
        }

        if (modoCalculo === "pdv_ideal") {
          const margemAlvoDec = parseFloat(margemAlvo) / 100;
          const denominador = 1 - (comissaoPct + impostoPercent + margemAlvoDec);

          let pdvCalculado = denominador > 0 ? (custoProduto + tarifaFixa + freteVariavel) / denominador : custoProduto * 2;

          // Se recalculado o preço cair na faixa <= 78.99, ajusta frete conforme as regras
          if (pdvCalculado <= 78.99) {
            const regraFaixaBaixa = obterRegraCanal(canalNome, pdvCalculado);
            freteVariavel = Number(regraFaixaBaixa.frete || 0);
            tarifaFixa = Number(regraFaixaBaixa.tarifa_fixa || 0);
            comissaoPct = Number(regraFaixaBaixa.comissao || (cLower.includes("premium") ? 18 : 14)) / 100;
            const novoDenominador = 1 - (comissaoPct + impostoPercent + margemAlvoDec);
            pdvCalculado = novoDenominador > 0 ? (custoProduto + tarifaFixa + freteVariavel) / novoDenominador : pdvCalculado;
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
          // Margem Reversa
          const pdvBase = parseNumero(precoFixo);
          const valRebate = parseNumero(rebate);
          const pdvEfetivo = Math.max(0, pdvBase - valRebate);

          const regraFaixa = obterRegraCanal(canalNome, pdvEfetivo);
          comissaoPct = Number(regraFaixa.comissao || (cLower.includes("premium") ? 18 : 14)) / 100;
          tarifaFixa = Number(regraFaixa.tarifa_fixa || 0);
          freteVariavel = Number(regraFaixa.frete || 0);

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
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Calculadora de Precificação & Margens</h1>
            <p className="text-sm font-medium text-slate-400">Cálculos baseados em tempo real na aba de Regras (Tarifas, Comissões e Fretes)</p>
          </div>
          <Navbar />
        </div>

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
              <span className="block text-[9px] font-bold text-slate-500 uppercase">Custo Base (CMV)</span>
              <span className="text-xs font-mono font-bold text-rose-400">{formatarMoeda(produtoEncontrado.custo_unitario)}</span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-900/50 px-3 py-1.5 rounded-xl">
              <span className="block text-[9px] font-bold text-emerald-400 uppercase">Status do Item</span>
              <span className="text-xs font-bold text-emerald-300">LINHA NORMAL (Ativo)</span>
            </div>
          </div>
        )}

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