"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

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

  const [rebatesCanais, setRebatesCanais] = useState<{ [key: string]: string }>({});

  const [produtoEncontrado, setProdutoEncontrado] = useState<any>(null);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());
  
  const [mapeamentoMl1, setMapeamentoMl1] = useState<Map<string, any[]>>(new Map());
  const [mapeamentoMl2, setMapeamentoMl2] = useState<Map<string, any[]>>(new Map());
  
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
        const info = {
          comissao: parsePorcentagem(m.comissao),
          peso_real: Number(m.peso_real || 2.0),
          altura: Number(m.altura || 10),
          largura: Number(m.largura || 10),
          comprimento: Number(m.comprimento || 10)
        };
        const canalConta = m.canal || "Mercado Livre 1";
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

    const { data: canaisData } = await supabase.from("config_regras_canais").select("*").order("id");
    let listaNomesCanais: string[] = [];
    if (canaisData && canaisData.length > 0) {
      const filtrados = canaisData.map((c: any) => c.canal).filter((c: string) => !c.toLowerCase().includes("mercado livre"));
      const listaCanaisBase = ["Mercado Livre 1 Clássico", "Mercado Livre 1 Premium", "Mercado Livre 2 Clássico", "Mercado Livre 2 Premium", ...filtrados];
      listaNomesCanais = Array.from(new Set(listaCanaisBase));
    } else {
      listaNomesCanais = ["Mercado Livre 1 Clássico", "Mercado Livre 1 Premium", "Mercado Livre 2 Clássico", "Mercado Livre 2 Premium", "Amazon", "Shopee", "Magalu", "Netshoes", "Shein", "TikTok Shop", "Centauro", "Site"];
    }

    setCanaisConfig(listaNomesCanais);
    setCanaisSelecionados(listaNomesCanais);

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
            // Procura anúncio clássico específico (comissão <= 14%) para puxar as medidas do clássico
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
            // Procura anúncio premium específico (comissão > 14%) para puxar as medidas do premium
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

        if (modoCalculo === "pdv_ideal") {
          const custoProduto = Number(produtoEncontrado.custo_unitario || 25.88);
          const margemAlvoDec = parseFloat(margemAlvo) / 100;
          let pdvCalculado = custoProduto * 2;

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
            pdvCalculado = denominador > 0 ? (custoProduto + tarifaFixa + freteVariavel) / denominador : custoProduto * 2;
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
          const lucroLiquido = pdvCalculado - (custoProduto + valorComissao + tarifaFixaFinal + freteFinal + valorImposto);
          const margemFinal = pdvCalculado > 0 ? (lucroLiquido / pdvCalculado) * 100 : 0;

          return {
            canal: canalNome,
            pdv: pdvCalculado,
            custoProduto,
            comissaoPct: comissaoPct * 100,
            valorComissao,
            tarifaFixa: tarifaFixaFinal,
            frete: freteFinal,
            valorImposto,
            lucroLiquido,
            margemFinal,
            custoIdealCalculado: null,
            temMlb: cLower.includes("mercado livre") ? (temMlbEncontrado || anunciosSku.length > 0) : true
          };
        } else if (modoCalculo === "reversa") {
          const custoProduto = Number(produtoEncontrado.custo_unitario || 25.88);
          const pdvBase = parseNumero(precoFixo);
          const valRebate = parseNumero(rebatesCanais[canalNome] || "0");

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
          const custoIdealCalculado = (pdvAlvo * termoMultiplicador) - tarifaFixaFinal - freteFinal;

          const lucroLiquidoIdeal = pdvAlvo - (custoIdealCalculado + valorComissao + tarifaFixaFinal + freteFinal + valorImposto);
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
            <p className="text-sm font-medium text-slate-400">Precificação com medidas e comissões específicas por Clássico e Premium</p>
          </div>
          <Navbar />
        </div>

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