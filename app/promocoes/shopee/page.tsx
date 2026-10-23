"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import * as XLSX from "xlsx";

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "");
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

export default function PromocoesShopeePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [margemAlvo, setMargemAlvo] = useState("10");
  const [dadosEstoqueRaw, setDadosEstoqueRaw] = useState<any[][] | null>(null);
  const [dadosShopeeRaw, setDadosShopeeRaw] = useState<any[][] | null>(null);
  const [dadosProcessados, setDadosProcessados] = useState<any[]>([]);

  const [custosMap, setCustosMap] = useState<Map<string, number>>(new Map());
  const [regrasTarifacao, setRegrasTarifacao] = useState<any[]>([]);

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
          const custoVal = parseNumeroBruto(c.custo_unitario ?? c.custo ?? 0);
          cMap.set(k, custoVal);
        }
      });
      setCustosMap(cMap);

      const { data: tarifacaoData } = await supabase.from("config_regras_tarifacao").select("*");
      if (tarifacaoData) {
        setRegrasTarifacao(tarifacaoData);
      }

    } catch (e) {
      console.error("Erro ao carregar bases:", e);
    }
    setLoading(false);
  };

  const obterRegraCanalDaTabela = (canalNome: string, precoReferencia: number) => {
    const cLower = canalNome.toLowerCase();
    
    const regrasDoCanal = regrasTarifacao.filter((r) => {
      const rCanal = String(r.canal || "").toLowerCase();
      if (rCanal === cLower) return true;
      if (cLower.includes("shopee") && rCanal.includes("shopee")) return true;
      return rCanal.includes(cLower) || cLower.includes(rCanal);
    });

    if (regrasDoCanal.length === 0) {
      return { comissao: 14, tarifa_fixa: 0, frete: 0 };
    }

    for (const regra of regrasDoCanal) {
      const faixaStr = String(regra.faixa_preco || "").toLowerCase();
      const matchNums = faixaStr.match(/[\d.,]+/g);

      if (faixaStr.includes("em diante") || faixaStr.includes("99999") || (matchNums && matchNums.length === 1)) {
        const limiteInf = matchNums ? parseNumeroBruto(matchNums[0]) : 0;
        if (precoReferencia >= limiteInf) return regra;
      } else if (matchNums && matchNums.length >= 2) {
        const min = parseNumeroBruto(matchNums[0]);
        const max = parseNumeroBruto(matchNums[1]);
        if (precoReferencia >= min && precoReferencia <= max) return regra;
      }
    }

    return regrasDoCanal[0];
  };

  const lerArquivoGenerico = (file: File): Promise<any[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const buffer = evt.target?.result;
          const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
          resolve(rawData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleEstoqueUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const rawData = await lerArquivoGenerico(e.target.files[0]);
        setDadosEstoqueRaw(rawData);
        alert("✅ Planilha de estoque (Tiny) carregada com sucesso!");
      } catch (err: any) {
        alert("Erro ao ler estoque: " + err.message);
      }
    }
  };

  const handleShopeeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const rawData = await lerArquivoGenerico(e.target.files[0]);
        setDadosShopeeRaw(rawData);
        alert("✅ Planilha da Shopee carregada com sucesso!");
      } catch (err: any) {
        alert("Erro ao ler planilha da Shopee: " + err.message);
      }
    }
  };

  const processarCampanhaShopee = () => {
    if (!dadosEstoqueRaw || !dadosShopeeRaw) {
      alert("Por favor, selecione tanto a Planilha de Estoque quanto a Planilha da Shopee.");
      return;
    }

    setLoading(true);
    try {
      const estoqueMap = new Map<string, number>();
      let colSkuEstoque = 2;
      let colSaldoEstoque = 5;

      if (dadosEstoqueRaw.length > 0) {
        const cabecalhoEstoque = dadosEstoqueRaw[0].map(c => String(c || "").trim().toLowerCase());
        const foundSku = cabecalhoEstoque.findIndex(h => h.includes("sku") || h.includes("código"));
        const foundSaldo = cabecalhoEstoque.findIndex(h => h.includes("saldo") || h.includes("estoque"));
        if (foundSku !== -1) colSkuEstoque = foundSku;
        if (foundSaldo !== -1) colSaldoEstoque = foundSaldo;
      }

      for (let i = 1; i < dadosEstoqueRaw.length; i++) {
        const row = dadosEstoqueRaw[i];
        if (!row || row.length <= Math.max(colSkuEstoque, colSaldoEstoque)) continue;

        const skuEstoque = normalizarSku(row[colSkuEstoque]);
        const saldoEstoque = parseNumeroBruto(row[colSaldoEstoque]);

        if (skuEstoque) {
          estoqueMap.set(skuEstoque, saldoEstoque);
        }
      }

      // Cabeçalho da Shopee na linha 3 (índice 2)
      const headerRow = dadosShopeeRaw[2].map(c => String(c || "").trim().toLowerCase());
      const idxProdId = headerRow.findIndex(h => h.includes("id do produto") || h.includes("product id"));
      const idxVarId = headerRow.findIndex(h => h.findIndex(str => str.includes("variante") || str.includes("variation")) !== -1 ? true : h.includes("variação"));
      const idxSku = headerRow.findIndex(h => h === "sku" || h.includes("sku do vendedor"));
      const idxPrice = headerRow.findIndex(h => h.includes("preço") || h.includes("price"));

      if (idxProdId === -1 || idxSku === -1) {
        alert("Erro: Não foi possível localizar as colunas 'ID do Produto' e 'SKU' na linha 3 da planilha da Shopee.");
        setLoading(false);
        return;
      }

      const margemAlvoDec = parseFloat(margemAlvo) / 100 || 0.10;
      const imposto = 0.09;
      const embalagem = 0.70;
      const resultados: any[] = [];

      // Os dados reais na planilha da Shopee começam a partir da linha 7 (índice 6)
      for (let i = 6; i < dadosShopeeRaw.length; i++) {
        const r = dadosShopeeRaw[i];
        if (!r || r.length === 0) continue;

        const prodId = r[idxProdId] || "";
        const varId = idxVarId !== -1 ? r[idxVarId] : "";
        const skuVendedor = normalizarSku(r[idxSku]);
        const precoOriginal = idxPrice !== -1 ? parseNumeroBruto(r[idxPrice]) : 0;

        if (!skuVendedor) continue;

        const saldoAtual = estoqueMap.get(skuVendedor) || 0;
        const custo = custosMap.get(skuVendedor) || 0;

        let statusItem = "APTO";
        let errosList: string[] = [];

        if (saldoAtual <= 0) {
          statusItem = "INAPTO";
          errosList.push(`Sem estoque (Saldo: ${saldoAtual})`);
        } else if (custo <= 0) {
          statusItem = "INAPTO";
          errosList.push("Custo não encontrado na base");
        }

        let precoOferta = precoOriginal;
        if (statusItem === "APTO") {
          let pdvEstimado = custo * 1.5;
          for (let iter = 0; iter < 15; iter++) {
            const regraTabela = obterRegraCanalDaTabela("Shopee", pdvEstimado);
            const comissaoVal = parseNumeroBruto(regraTabela.comissao ?? 14);
            const comissaoDec = comissaoVal > 1 ? comissaoVal / 100 : comissaoVal;
            const tarifaFixa = parseNumeroBruto(regraTabela.tarifa_fixa ?? 0);
            const freteValor = parseNumeroBruto(regraTabela.frete ?? 0);

            const denominador = 1 - (comissaoDec + imposto + margemAlvoDec);
            if (denominador > 0) {
              pdvEstimado = (custo + tarifaFixa + embalagem + freteValor) / denominador;
            }
          }
          precoOferta = pdvEstimado > 0 ? pdvEstimado : precoOriginal * 0.9;
        }

        resultados.push({
          productId: prodId,
          varId: varId,
          sku: r[idxSku],
          originalPrice: precoOriginal,
          offerPrice: Number(precoOferta.toFixed(2)),
          status: statusItem,
          erro: errosList.join(" | ")
        });
      }

      setDadosProcessados(resultados);
      const aptos = resultados.filter(r => r.status === "APTO").length;
      const inaptos = resultados.filter(r => r.status === "INAPTO").length;
      alert(`✅ Processamento Shopee concluído!\n• Aptos: ${aptos}\n• Inaptos (sem estoque ou custo): ${inaptos}`);
    } catch (err: any) {
      alert("Erro ao processar: " + err.message);
    }
    setLoading(false);
  };

  const baixarTemplateDiscount = () => {
    if (!dadosProcessados || dadosProcessados.length === 0) {
      alert("Processe a planilha primeiro.");
      return;
    }

    const aptos = dadosProcessados.filter(item => item.status === "APTO");
    if (aptos.length === 0) {
      alert("Nenhum item apto para exportação.");
      return;
    }

    // Mantendo a estrutura original exata da Shopee para o template de desconto
    const wsData = [
      ["et_title_product_id", "et_title_product_name", "et_title_variation_id", "et_title_variation_name", "et_title_parent_sku", "et_title_variation_sku", "et_title_variation_price", "ps_gtin_code", "et_title_variation_stock", "et_title_reason"],
      ["sales_info", "700a3d5d251db047505a7f359", "0", "471903358", '{"search_condition":{}}', "nan", "nan", "nan", "nan", "nan"],
      ["ID do Produto", "Nome do Produto", "Variante Identificador", "Nome", "SKU de referência", "SKU", "Preço", "GTIN (EAN)", "Estoque do Vendedor", "Motivo da Falha"],
      ["nan", "nan", "nan", "nan", "nan", "nan", "Obrigatório", "nan", "nan", "nan"],
      ["nan", "nan", "nan", "nan", "nan", "nan", "nan", "nan", "nan", "nan"],
      ["nan", "nan", "nan", "nan", "nan", "nan", "Insira de1.00 a 1000", "nan", "nan", "nan"]
    ];

    aptos.forEach(item => {
      wsData.push([
        item.productId,
        "",
        item.varId,
        "",
        "",
        item.sku,
        Number(item.offerPrice.toFixed(2)),
        "",
        "",
        ""
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Template_Discount_Shopee.xlsx");
  };

  const itensAptos = dadosProcessados.filter(i => i.status === "APTO");
  const qtdInaptos = dadosProcessados.filter(i => i.status === "INAPTO").length;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Promoções — Shopee</h1>
            <p className="text-sm font-medium text-slate-400">Geração de Template Discount com base em estoque (Tiny) e regras dinâmicas</p>
          </div>
          <Navbar />
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">⚙️ Configurações & Uploads (Shopee)</h3>
          
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
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">2. Planilha de Anúncios Shopee (Mass Update):</label>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleShopeeUpload}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white cursor-pointer"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800 items-end">
            <button
              type="button"
              onClick={processarCampanhaShopee}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
            >
              {loading ? "A processar..." : "Processar Campanha Shopee"}
            </button>
            {dadosProcessados.length > 0 && (
              <button
                type="button"
                onClick={baixarTemplateDiscount}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
              >
                Baixar Template Discount (XLSX)
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
                <h3 className="text-sm font-bold text-white">Pré-visualização do Template Discount</h3>
                <span className="text-xs text-slate-400">Total exibidos: {itensAptos.length}</span>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3">ID Produto</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3 text-right">Preço Original</th>
                      <th className="p-3 text-right">Preço de Desconto</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {itensAptos.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono text-indigo-400">{item.productId}</td>
                        <td className="p-3 font-mono text-slate-300">{item.sku}</td>
                        <td className="p-3 text-right font-mono text-slate-300">{formatarMoeda(item.originalPrice)}</td>
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