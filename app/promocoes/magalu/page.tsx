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

function skuValido(sku: string): boolean {
  const limpo = normalizarSku(sku);
  return limpo.length >= 10;
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

export default function PromocoesMagaluPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvandoBanco, setSalvandoBanco] = useState(false);
  const [margemAlvo, setMargemAlvo] = useState("20");
  const [dadosProcessados, setDadosProcessados] = useState<any>(null);
  const [promocoesAtivas, setPromocoesAtivas] = useState<any[]>([]);
  const [termoBusca, setTermoBusca] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"precificar" | "ativas">("precificar");

  const [custosMap, setCustosMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarBasesDoApp();
    carregarPromocoesAtivasSupabase();
  }, []);

  const carregarBasesDoApp = async () => {
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
        if (k && k.length >= 10) {
          cMap.set(k, Number(c.custo_unitario || c.custo || 0));
        }
      });
      setCustosMap(cMap);
    } catch (e) {
      console.error("Erro ao carregar custos:", e);
    }
    setLoading(false);
  };

  const carregarPromocoesAtivasSupabase = async () => {
    const { data } = await supabase.from("promocoes_ativas_magalu").select("*").order("id", { ascending: false });
    if (data) setPromocoesAtivas(data);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        setDadosProcessados({ rawData, sheetName });
      };
      reader.readAsBinaryString(file);
    }
  };

  const processarPlanilhaMagalu = async () => {
    if (!dadosProcessados || !dadosProcessados.rawData) {
      alert("Por favor, selecione uma planilha da Magalu.");
      return;
    }

    setLoading(true);
    try {
      const { rawData, sheetName } = dadosProcessados;
      if (rawData.length < 1) {
        alert("A planilha parece estar vazia.");
        setLoading(false);
        return;
      }

      const headers = rawData[0].map((h: any) => String(h || "").trim().toUpperCase());
      const getColIndex = (names: string[]) => {
        for (const name of names) {
          const idx = headers.indexOf(name.toUpperCase());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const idxSku = getColIndex(["SKU", "CÓDIGO SKU", "CODIGO"]);
      const idxPdv = getColIndex(["PDV", "PREÇO", "PRECO", "VALOR", "PRICE"]);

      if (idxSku === -1 || idxPdv === -1) {
        alert("Erro: Não foi possível localizar as colunas 'SKU' e 'PDV' no cabeçalho original.");
        setLoading(false);
        return;
      }

      const margemDesejada = parseFloat(margemAlvo) / 100 || 0.20;
      const imposto = 0.09;
      const resultados: any[] = [];

      for (let i = 1; i < rawData.length; i++) {
        const r = rawData[i];
        if (!r || r.length === 0) continue;

        const skuRaw = normalizarSku(r[idxSku]);
        const pdvOriginal = parseNumeroBruto(r[idxPdv]);

        if (!skuRaw) continue;

        const custo = custosMap.has(skuRaw) ? Number(custosMap.get(skuRaw)) : 0;

        let statusItem = "APTO";
        let errosList: string[] = [];

        if (!skuValido(skuRaw) || custo <= 0) {
          statusItem = "INAPTO";
          errosList.push("SKU inválido ou Custo não encontrado");
        }

        let comissaoDec = 0.18;
        let tarifaFixa = 5.00;
        let freteValor = 0.00;

        let novoPrecoSugerido = pdvOriginal;
        if (statusItem === "APTO") {
          let denominador = 1 - (comissaoDec + imposto + margemDesejada);
          if (denominador > 0) {
            novoPrecoSugerido = (custo + tarifaFixa + freteValor) / denominador;
          }
        }

        resultados.push({
          rowIndex: i,
          SKU: skuRaw,
          ORIGINAL_PRICE: pdvOriginal,
          FINAL_PRICE: Number(novoPrecoSugerido.toFixed(2)),
          STATUS: statusItem,
          ERRO: errosList.join(" | ")
        });
      }

      setDadosProcessados({ ...dadosProcessados, itens: resultados });
      alert(`✅ Processamento Magalu concluído!`);
    } catch (err: any) {
      alert("Erro ao processar: " + err.message);
    }
    setLoading(false);
  };

  const salvarNoBanco = async () => {
    if (!dadosProcessados || !dadosProcessados.itens) return;
    const aptos = dadosProcessados.itens.filter((i: any) => i.STATUS === "APTO");
    if (aptos.length === 0) {
      alert("Nenhum item apto para salvar.");
      return;
    }

    setSalvandoBanco(true);
    try {
      for (const item of aptos) {
        await supabase.from("promocoes_ativas_magalu").insert([{
          sku: item.SKU,
          preco_sugerido: item.FINAL_PRICE,
          preco_original: item.ORIGINAL_PRICE
        }]);
      }
      await carregarPromocoesAtivasSupabase();
      alert(`🚀 ${aptos.length} itens salvos na base Magalu com sucesso!`);
      setAbaAtiva("ativas");
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message);
    }
    setSalvandoBanco(false);
  };

  const baixarExcelOtimizado = () => {
    if (!dadosProcessados || !dadosProcessados.itens || dadosProcessados.itens.length === 0) {
      alert("Processe a planilha primeiro.");
      return;
    }

    const dadosOtimizados = dadosProcessados.itens.map((item: any) => ({
      SKU: item.SKU,
      PDV: item.STATUS === "APTO" ? item.FINAL_PRICE : item.ORIGINAL_PRICE,
      STATUS: item.STATUS === "APTO" ? "Elegível" : "Inapto",
      OBSERVACOES: item.ERRO || ""
    }));

    const newWs = XLSX.utils.json_to_sheet(dadosOtimizados);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, dadosProcessados.sheetName || "Magalu");

    XLSX.writeFile(newWb, "magalu_promocoes_otimizada.xlsx");
  };

  const listaItens = dadosProcessados?.itens || [];
  const itensFiltrados = promocoesAtivas.filter(p => String(p.sku || "").toLowerCase().includes(termoBusca.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Promoções — Magazine Luiza</h1>
            <p className="text-sm font-medium text-slate-400">Precificação e exportação respeitando o cabeçalho original</p>
          </div>
          <Navbar />
        </div>

        <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
          <button
            onClick={() => setAbaAtiva("precificar")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              abaAtiva === "precificar" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Precificação Magalu
          </button>
          <button
            onClick={() => setAbaAtiva("ativas")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              abaAtiva === "ativas" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Promoções Ativas Magalu ({promocoesAtivas.length})
          </button>
        </div>

        {abaAtiva === "precificar" ? (
          <div className="space-y-6">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha Magalu (Cabeçalho Original):</label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Margem Desejada (%):</label>
                <input
                  type="number"
                  value={margemAlvo}
                  onChange={(e) => setMargemAlvo(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-600/50 rounded-xl p-2.5 text-xs font-mono text-amber-300 font-bold outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={processarPlanilhaMagalu}
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
                >
                  {loading ? "A processar..." : "Processar Magalu"}
                </button>
              </div>

              {listaItens.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={salvarNoBanco}
                    disabled={salvandoBanco}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                  >
                    {salvandoBanco ? "A Salvar..." : "Salvar na Base"}
                  </button>
                  <button
                    type="button"
                    onClick={baixarExcelOtimizado}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                  >
                    Baixar Excel
                  </button>
                </div>
              )}
            </div>

            {listaItens.length > 0 && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white">Resultado — Magazine Luiza</h3>
                  <span className="text-xs text-slate-400">Total itens: {listaItens.length}</span>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-3">SKU</th>
                        <th className="p-3 text-right">PDV Original</th>
                        <th className="p-3 text-right">Preço Sugerido (Magalu)</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-center">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {listaItens.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono text-indigo-400">{item.SKU}</td>
                          <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.ORIGINAL_PRICE)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatarMoeda(item.FINAL_PRICE)}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${item.STATUS === "APTO" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-rose-950 text-rose-400 border border-rose-800"}`}>
                              {item.STATUS}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold text-rose-400">{item.ERRO || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Promoções Ativas — Magazine Luiza</h3>
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Pesquisar por SKU..."
                className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none w-80"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5 text-right">Preço Original</th>
                    <th className="p-3.5 text-right">Preço Sugerido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {itensFiltrados.map((p, idx) => (
                    <tr key={p.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-mono text-indigo-400">{p.sku}</td>
                      <td className="p-3.5 text-right font-mono text-slate-400">{formatarMoeda(p.preco_original)}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400">{formatarMoeda(p.preco_sugerido)}</td>
                    </tr>
                  ))}
                  {itensFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-500">Nenhum registo encontrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}