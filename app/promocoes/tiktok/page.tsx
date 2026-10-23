"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import * as XLSX from "xlsx";

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

function parseNumeroBruto(valor: any): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).replace(/R\$/g, "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

const formatarMoeda = (valor: number) =>
  "R$ " + (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PromocoesTiktokPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [margemAlvo, setMargemAlvo] = useState("18");
  const [dadosEstoqueRaw, setDadosEstoqueRaw] = useState<any[][] | null>(null);
  const [dadosTiktokRaw, setDadosTiktokRaw] = useState<any[][] | null>(null);
  const [dadosProcessados, setDadosProcessados] = useState<any[]>([]);

  const [custosMap, setCustosMap] = useState<Map<string, number>>(new Map());
  const [regrasTiktokList, setRegrasTiktokList] = useState<any[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarBasesIniciais();
  }, []);

  const carregarBasesIniciais = async () => {
    setLoading(true);
    try {
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

      const cMap = new Map<string, number>();
      allCustos.forEach((c: any) => {
        const k = normalizarSku(c.sku);
        if (k) {
          cMap.set(k, Number(c.custo_unitario || c.custo || 0));
        }
      });
      setCustosMap(cMap);

      let allRegras: any[] = [];
      from = 0;
      keep = true;
      while (keep) {
        const { data } = await supabase.from("config_regras_tiny").select("*").range(from, from + step - 1);
        if (data && data.length > 0) {
          allRegras = [...allRegras, ...data];
          from += step;
          if (data.length < step) keep = false;
        } else keep = false;
      }

      const regrasTiktok = allRegras.filter((r: any) => {
        const campoStr = String(r.campo || r.canal || "").toLowerCase();
        return campoStr.includes("tiktok");
      });
      setRegrasTiktokList(regrasTiktok);

    } catch (e) {
      console.error("Erro ao carregar bases:", e);
    }
    setLoading(false);
  };

  const lerArquivoParaMatriz = (file: File): Promise<any[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: "binary", cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          resolve(rawData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };

  const handleEstoqueUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const rawData = await lerArquivoParaMatriz(e.target.files[0]);
        setDadosEstoqueRaw(rawData);
        alert("✅ Planilha de estoque (Tiny) carregada com sucesso!");
      } catch (err: any) {
        alert("Erro ao ler estoque: " + err.message);
      }
    }
  };

  const handleTiktokUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const rawData = await lerArquivoParaMatriz(e.target.files[0]);
        setDadosTiktokRaw(rawData);
        alert("✅ Planilha do TikTok Seller Center carregada com sucesso!");
      } catch (err: any) {
        alert("Erro ao ler planilha do TikTok: " + err.message);
      }
    }
  };

  const processarCampanhaTiktok = () => {
    if (!dadosEstoqueRaw || !dadosTiktokRaw) {
      alert("Por favor, selecione tanto a Planilha de Estoque quanto a Planilha do TikTok Seller Center.");
      return;
    }

    setLoading(true);
    try {
      // 1. Mapear estoque do Tiny: SKU na Coluna C (índice 2) e Saldo na Coluna F (índice 5)
      const estoqueMap = new Map<string, number>();
      for (let i = 0; i < dadosEstoqueRaw.length; i++) {
        const row = dadosEstoqueRaw[i];
        if (!row || row.length < 6) continue;

        const skuEstoque = normalizarSku(row[2]);
        const saldoEstoque = parseNumeroBruto(row[5]);

        if (skuEstoque) {
          estoqueMap.set(skuEstoque, saldoEstoque);
        }
      }

      // 2. Cabeçalho técnico na linha 0 (índice 0)
      const headerRow = dadosTiktokRaw[0].map(c => String(c || "").trim().toLowerCase());
      const idxProdId = headerRow.findIndex(h => h.includes("product_id"));
      const idxSkuId = headerRow.findIndex(h => h.includes("sku_id"));
      const idxSellerSku = headerRow.findIndex(h => h.includes("seller_sku"));
      const idxPrice = headerRow.findIndex(h => h.includes("price"));

      if (idxProdId === -1 || idxSkuId === -1 || idxSellerSku === -1) {
        alert("Erro: Não foi possível localizar as colunas técnicas ('product_id', 'sku_id', 'seller_sku') na linha 1 da planilha.");
        setLoading(false);
        return;
      }

      const margemDesejada = parseFloat(margemAlvo) / 100 || 0.18;
      const imposto = 0.09;
      const resultados: any[] = [];

      // Os dados reais no template do TikTok começam a partir da linha 5 (índice 5)
      for (let i = 5; i < dadosTiktokRaw.length; i++) {
        const r = dadosTiktokRaw[i];
        if (!r || r.length === 0) continue;

        const prodId = r[idxProdId] || "";
        const skuId = r[idxSkuId] || "";
        const sellerSku = idxSellerSku !== -1 ? normalizarSku(r[idxSellerSku]) : "";
        const precoOriginal = idxPrice !== -1 ? parseNumeroBruto(r[idxPrice]) : 0;

        if (!sellerSku) continue;

        // Cruzamento com Tiny usando o seller_sku normalizado
        const saldoAtual = estoqueMap.get(sellerSku) || 0;
        // Se o custo não estiver na base, assume R$ 20,00 ou busca no custosMap
        const custo = custosMap.get(sellerSku) || 20.0;

        let statusItem = "APTO";
        let errosList: string[] = [];

        if (saldoAtual <= 0) {
          statusItem = "INAPTO";
          errosList.push(`Sem estoque (Saldo: ${saldoAtual})`);
        }

        let precoOferta = precoOriginal;
        if (statusItem === "APTO") {
          let pdvEstimado = custo * 2;
          for (let iter = 0; iter < 10; iter++) {
            let regraAplicada = regrasTiktokList.find((reg: any) => {
              const min = Number(reg.faixa_min || reg.min || 0);
              const max = Number(reg.faixa_max || reg.max || 999999);
              return pdvEstimado >= min && pdvEstimado <= max;
            }) || regrasTiktokList[0];

            const comissaoVal = regraAplicada ? parseNumeroBruto(regraAplicada.comissao || regraAplicada.valor_comissao || 14) : 14;
            const comissaoDec = comissaoVal > 1 ? comissaoVal / 100 : comissaoVal;
            const tarifaFixa = regraAplicada ? parseNumeroBruto(regraAplicada.tarifa_fixa || regraAplicada.tarifa || 4) : 4;
            const freteValor = regraAplicada ? parseNumeroBruto(regraAplicada.frete || regraAplicada.valor_frete || 0) : 0;
            const embalagem = 0.70;

            const denominador = 1 - (comissaoDec + imposto + margemDesejada);
            if (denominador > 0) {
              pdvEstimado = (custo + tarifaFixa + embalagem + freteValor) / denominador;
            }
          }
          precoOferta = pdvEstimado > 0 ? pdvEstimado : precoOriginal * 0.9;
        }

        resultados.push({
          productId: prodId,
          skuId: skuId,
          sellerSku: r[idxSellerSku],
          originalPrice: precoOriginal,
          offerPrice: Number(precoOferta.toFixed(2)),
          status: statusItem,
          erro: errosList.join(" | ")
        });
      }

      setDadosProcessados(resultados);
      const aptos = resultados.filter(r => r.status === "APTO").length;
      const inaptos = resultados.filter(r => r.status === "INAPTO").length;
      alert(`✅ Processamento TikTok concluído!\n• Aptos: ${aptos}\n• Inaptos (sem estoque ou custo): ${inaptos}`);
    } catch (err: any) {
      alert("Erro ao processar: " + err.message);
    }
    setLoading(false);
  };

  const baixarFixedPriceWithSKU = () => {
    if (!dadosProcessados || dadosProcessados.length === 0) {
      alert("Processe a planilha primeiro.");
      return;
    }

    const aptos = dadosProcessados.filter(item => item.status === "APTO");
    if (aptos.length === 0) {
      alert("Nenhum item apto para exportação.");
      return;
    }

    const templateData = aptos.map(item => ({
      "Product_id (obrigatório)": item.productId,
      "SKU_id (obrigatório)": item.skuId,
      "Preço da oferta (obrigatório)\n1. 0 < Preço da oferta ≤ Preço mais baixo nos últimos 30 dias\n2. Preço da oferta < Preço original": item.offerPrice,
      "Limite total de compra (opcional)\n1. Limite total de compra ≤ Estoque\n2. Em branco refere -se a nenhum limite": "",
      "Limite de compra do comprador (opcional)\n1. 1 ≤ Limite de compra do comprador ≤ 99\n2. Em branco refere -se a nenhum limite": ""
    }));

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "FixedPriceWithSKU_TikTok.xlsx");
  };

  const itensAptos = dadosProcessados.filter(i => i.status === "APTO");
  const qtdInaptos = dadosProcessados.filter(i => i.status === "INAPTO").length;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Promoções — TikTok Shop</h1>
            <p className="text-sm font-medium text-slate-400">Geração de FixedPriceWithSKU com base em estoque (Tiny) e regras dinâmicas</p>
          </div>
          <Navbar />
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">⚙️ Configurações & Uploads (TikTok Shop)</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Lucro Desejado (%):</label>
              <input
                type="number"
                value={margemAlvo}
                onChange={(e) => setMargemAlvo(e.target.value)}
                className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2.5 text-xs font-mono text-amber-300 font-bold outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">1. Planilha de Estoque do Tiny (Col. C e F):</label>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleEstoqueUpload}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">2. Planilha TikTok Seller Center:</label>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleTiktokUpload}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 items-end">
            <button
              type="button"
              onClick={processarCampanhaTiktok}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
            >
              {loading ? "A processar..." : "Processar Campanha TikTok"}
            </button>
            {dadosProcessados.length > 0 && (
              <button
                type="button"
                onClick={baixarFixedPriceWithSKU}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
              >
                Baixar FixedPriceWithSKU (XLSX)
              </button>
            )}
          </div>
        </div>

        {dadosProcessados.length > 0 && (
          <div className="space-y-4">
            <div className="text-xs text-slate-300 font-medium bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex justify-between">
              <span>Itens aptos (com estoque e custo): <strong className="text-emerald-400">{itensAptos.length}</strong></span>
              <span>Itens inaptos ignorados: <strong className="text-rose-400">{qtdInaptos}</strong></span>
            </div>

            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white">Pré-visualização do FixedPriceWithSKU</h3>
                <span className="text-xs text-slate-400">Total exibidos: {itensAptos.length}</span>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3">Product ID</th>
                      <th className="p-3">SKU ID</th>
                      <th className="p-3">SKU Vendedor</th>
                      <th className="p-3 text-right">Preço Oferta</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {itensAptos.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-indigo-400">{item.productId}</td>
                        <td className="p-3 font-mono text-slate-300">{item.skuId}</td>
                        <td className="p-3 font-mono text-slate-300">{item.sellerSku}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatarMoeda(item.offerPrice)}</td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            APTO
                          </span>
                        </td>
                      </tr>
                    ))}
                    {itensAptos.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">Nenhum produto apto encontrado.</td>
                      </tr>
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