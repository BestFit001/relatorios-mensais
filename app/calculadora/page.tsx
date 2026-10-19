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
  const [canalSelecionado, setCanalSelecionado] = useState("TODOS");
  const [margemAlvo, setMargemAlvo] = useState("30");
  const [precoFixo, setPrecoFixo] = useState("60.00");
  const [rebate, setRebate] = useState("0.00");

  // Dados do produto encontrado
  const [produtoEncontrado, setProdutoEncontrado] = useState<any>(null);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());

  // Canais disponíveis e regras de taxas
  const [canaisConfig, setCanaisConfig] = useState<any[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarBaseCustosECanais();
  }, []);

  const carregarBaseCustosECanais = async () => {
    setLoading(true);
    // 1. Carrega custos dos SKUs da base unificada
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

    const mapa = new Map();
    allCustos.forEach((c: any) => {
      const k = normalizarSku(c.sku);
      if (k) mapa.set(k, c);
    });
    setCustosMap(mapa);

    // 2. Carrega configuração de canais, comissões e tarifas do Supabase
    const { data: regrasData } = await supabase.from("config_regras_canais").select("*");
    if (regrasData && regrasData.length > 0) {
      setCanaisConfig(regrasData);
    } else {
      // Padrões se não houver tabela carregada
      setCanaisConfig([
        { canal: "Mercado Livre Clássico", comissao: 14, tarifa_fixa: 0, frete: 0 },
        { canal: "Mercado Livre Premium", comissao: 18, tarifa_fixa: 0, frete: 0 },
        { canal: "Shopee", comissao: 20, tarifa_fixa: 4.00, frete: 0 },
        { canal: "Amazon", comissao: 14, tarifa_fixa: 4.00, frete: 21.95 },
        { canal: "Magalu", comissao: 18, tarifa_fixa: 5.00, frete: 20.45 },
      ]);
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
      // Cria um produto genérico caso não esteja na tabela de custos para não travar o teste
      setProdutoEncontrado({
        sku: skuBusca.trim(),
        produto: "Produto Base (Manual)",
        marca: marcaFiltro || "BEST FIT",
        custo_unitario: 25.88
      });
    }
  };

  // Lógica de cálculo dos canais
  const calcularResultadosCanais = () => {
    if (!produtoEncontrado) return [];

    const custoProduto = Number(produtoEncontrado.custo_unitario || 25.88);
    const impostoPercent = 0.09; // 9% imposto fixo corporativo

    // Se o usuário selecionou um canal específico, filtra; senão, mostra os principais
    const canaisExibidos = canalSelecionado === "TODOS" 
      ? ["Mercado Livre Clássico", "Mercado Livre Premium", "Shopee", "Amazon", "Magalu"]
      : [canalSelecionado];

    return canaisExibidos.map((canalNome) => {
      const regra = canaisConfig.find((c) => c.canal.toLowerCase() === canalNome.toLowerCase()) || {
        comissao: canalNome.includes("Premium") ? 18 : 14,
        tarifa_fixa: 0,
        frete: 12.99
      };

      const comissaoPct = Number(regra.comissao || 14) / 100;
      const tarifaFixa = Number(regra.tarifa_fixa || 0);
      let freteVariavel = Number(regra.frete || 12.99);

      if (modoCalculo === "pdv_ideal") {
        // --- CÁLCULO MARGEM NORMAL (PDV IDEAL) ---
        // Fórmula de formação de preço com base em margem alvo:
        // PDV = (Custo + Tarifa Fixa + Frete) / (1 - (Comissão + Imposto + MargemAlvo))
        const margemAlvoDec = parseFloat(margemAlvo) / 100;
        const denominador = 1 - (comissaoPct + impostoPercent + margemAlvoDec);

        let pdvCalculado = denominador > 0 ? (custoProduto + tarifaFixa + freteVariavel) / denominador : custoProduto * 2;

        // Regra de frete para ML / Shopee / Magalu baseada em faixa de preço (Ex: < 78.99 frete zero ou diferenciado)
        if (pdvCalculado <= 78.99 && (canalNome.includes("Amazon") || canalNome.includes("Magalu") || canalNome.includes("Shopee"))) {
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
          comissaoPct: Number(regra.comissao || 14),
          valorComissao,
          tarifaFixa,
          frete: freteVariavel,
          valorImposto,
          lucroLiquido,
          margemFinal
        };
      } else {
        // --- CÁLCULO MARGEM REVERSA ---
        const pdvBase = parseNumero(precoFixo);
        const valRebate = parseNumero(rebate);
        const pdvEfetivo = Math.max(0, pdvBase - valRebate);

        if (pdvEfetivo <= 78.99 && (canalNome.includes("Amazon") || canalNome.includes("Magalu"))) {
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
          comissaoPct: Number(regra.comissao || 14),
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
            <p className="text-sm font-medium text-slate-400">Simulação de PDV ideal e margem reversa por canal com custos integrados</p>
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

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal de Venda:</label>
              <select
                value={canalSelecionado}
                onChange={(e) => setCanalSelecionado(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="TODOS">Todos os Canais</option>
                {canaisConfig.map((c, i) => (
                  <option key={i} value={c.canal}>{c.canal}</option>
                ))}
              </select>
            </div>

            {modoCalculo === "pdv_ideal" ? (
              <div>
                <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Margem Alvo (%):</label>
                <input
                  type="number"
                  value={margemAlvo}
                  onChange={(e) => setMargemAlvo(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2.5 text-xs font-mono text-amber-300 font-bold outline-none"
                />
              </div>
            ) : (
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
            )}
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

        {/* Cards de Resultados por Canal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {resultadosCanais.map((res, idx) => (
            <div key={idx} className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white">{res.canal}</h3>
                {modoCalculo === "reversa" && (
                  <div>
                    <span className="text-[9px] text-slate-400 block text-right">Rebate (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={rebate}
                      onChange={(e) => setRebate(e.target.value)}
                      className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-right text-xs font-mono text-purple-300"
                    />
                  </div>
                )}
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
                    <span className="text-slate-500">Comissão ({res.comissaoPct}%):</span>
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