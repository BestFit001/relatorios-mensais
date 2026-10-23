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
  const [nomePromocao, setNomePromocao] = useState("Campanha Magalu");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [dadosEstoqueRaw, setDadosEstoqueRaw] = useState<any[][] | null>(null);
  const [dadosProcessados, setDadosProcessados] = useState<any[]>([]);
  const [promocoesAtivas, setPromocoesAtivas] = useState<any[]>([]);
  const [termoBusca, setTermoBusca] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"precificar" | "ativas">("precificar");

  const [custosMap, setCustosMap] = useState<Map<string, number>>(new Map());
  const [skusMagaluBaseSet, setSkusMagaluBaseSet] = useState<Set<string>>(new Set());
  const [regrasMagaluList, setRegrasMagaluList] = useState<any[]>([]);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarBasesIniciais();
    carregarPromocoesAtivasSupabase();
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
        if (k && k.length >= 10) {
          cMap.set(k, Number(c.custo_unitario || c.custo || 0));
        }
      });
      setCustosMap(cMap);

      let allMapeamentos: any[] = [];
      from = 0;
      keep = true;
      while (keep) {
        const { data } = await supabase
          .from("mapeamento_canais_skus")
          .select("sku")
          .ilike("canal", "Magazine Luiza")
          .range(from, from + step - 1);

        if (data && data.length > 0) {
          allMapeamentos = [...allMapeamentos, ...data];
          from += step;
          if (data.length < step) keep = false;
        } else keep = false;
      }

      const magaluSet = new Set<string>();
      allMapeamentos.forEach((m: any) => {
        const sk = normalizarSku(m.sku);
        if (sk) magaluSet.add(sk);
      });
      setSkusMagaluBaseSet(magaluSet);

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

      const regrasMag = allRegras.filter((r: any) => {
        const campoStr = String(r.campo || r.canal || "").toLowerCase();
        return campoStr.includes("magalu");
      });
      setRegrasMagaluList(regrasMag);

    } catch (e) {
      console.error("Erro ao carregar bases:", e);
    }
    setLoading(false);
  };

  const carregarPromocoesAtivasSupabase = async () => {
    const { data } = await supabase.from("promocoes_ativas_magalu").select("*").order("id", { ascending: false });
    if (data) setPromocoesAtivas(data);
  };

  const handleEstoqueUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          setDadosEstoqueRaw(rawData);
          alert("✅ Planilha de estoque (Tiny) carregada com sucesso!");
        } catch (err: any) {
          alert("Erro ao ler estoque: " + err.message);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const processarCampanhaMagalu = () => {
    if (!dadosEstoqueRaw) {
      alert("Por favor, selecione a Planilha de Estoque do Tiny.");
      return;
    }

    setLoading(true);
    try {
      const estoqueMap = new Map<string, number>();
      for (let i = 0; i < dadosEstoqueRaw.length; i++) {
        const row = dadosEstoqueRaw[i];
        if (!row || row.length < 6) continue;

        const skuEstoque = normalizarSku(row[2]); // Coluna C = Índice 2
        const saldoEstoque = parseNumeroBruto(row[5]); // Coluna F = Índice 5

        if (skuEstoque) {
          estoqueMap.set(skuEstoque, saldoEstoque);
        }
      }

      const margemDesejada = parseFloat(margemAlvo) / 100 || 0.20;
      const imposto = 0.09;
      const resultados: any[] = [];

      for (const skuMapeado of skusMagaluBaseSet.values()) {
        const saldoAtual = estoqueMap.get(skuMapeado) || 0;
        const custo = custosMap.get(skuMapeado) || 0;

        let statusItem = "APTO";
        let errosList: string[] = [];

        if (saldoAtual <= 0) {
          statusItem = "INAPTO";
          errosList.push(`Sem estoque (Saldo: ${saldoAtual})`);
        } else if (!skuValido(skuMapeado) || custo <= 0) {
          statusItem = "INAPTO";
          errosList.push("Custo não encontrado");
        }

        let precoSugerido = 0;
        if (statusItem === "APTO") {
          // Lógica exata da calculadora: calcular primeiro com a regra abaixo de 78.99 (frete R$ 0,00)
          let pdvEstimado = custo * 2;
          for (let iter = 0; iter < 10; iter++) {
            let regraAplicada = regrasMagaluList.find((r: any) => {
              const min = Number(r.faixa_min || r.min || 0);
              const max = Number(r.faixa_max || r.max || 999999);
              return pdvEstimado >= min && pdvEstimado <= max;
            });

            if (!regraAplicada && regrasMagaluList.length > 0) {
              regraAplicada = regrasMagaluList[0];
            }

            const comissaoVal = regraAplicada ? parseNumeroBruto(regraAplicada.comissao || regraAplicada.valor_comissao || 18) : 18;
            const comissaoDec = comissaoVal > 1 ? comissaoVal / 100 : comissaoVal;
            const tarifaFixa = regraAplicada ? parseNumeroBruto(regraAplicada.tarifa_fixa || regraAplicada.tarifa || 5) : 5;
            const freteValor = regraAplicada ? parseNumeroBruto(regraAplicada.frete || regraAplicada.valor_frete || 0) : 0;

            const denominador = 1 - (comissaoDec + imposto + margemDesejada);
            if (denominador > 0) {
              pdvEstimado = (custo + tarifaFixa + freteValor) / denominador;
            }
          }

          // Se o preço estimado ultrapassar 79.00, reavaliar aplicando a regra da faixa superior (com frete correspondente)
          if (pdvEstimado >= 79.00 && regrasMagaluList.length > 1) {
            let pdvAlto = custo * 2;
            for (let iter = 0; iter < 10; iter++) {
              let regraAlta = regrasMagaluList.find((r: any) => {
                const min = Number(r.faixa_min || r.min || 0);
                const max = Number(r.faixa_max || r.max || 999999);
                return pdvAlto >= min && pdvAlto <= max;
              }) || regrasMagaluList[1];

              const comissaoVal = parseNumeroBruto(regraAlta.comissao || regraAlta.valor_comissao || 18);
              const comissaoDec = comissaoVal > 1 ? comissaoVal / 100 : comissaoVal;
              const tarifaFixa = parseNumeroBruto(regraAlta.tarifa_fixa || regraAlta.tarifa || 5);
              const freteValor = parseNumeroBruto(regraAlta.frete || regraAlta.valor_frete || 20.45);

              const denominador = 1 - (comissaoDec + imposto + margemDesejada);
              if (denominador > 0) {
                pdvAlto = (custo + tarifaFixa + freteValor) / denominador;
              }
            }
            pdvEstimado = pdvAlto;
          }

          precoSugerido = pdvEstimado > 0 ? pdvEstimado : custo * 2;
        }

        resultados.push({
          SKU: skuMapeado,
          SALDO: saldoAtual,
          CUSTO: custo,
          FINAL_PRICE: Number(precoSugerido.toFixed(2)),
          STATUS: statusItem,
          ERRO: errosList.join(" | ")
        });
      }

      setDadosProcessados(resultados);
      const qtdAptos = resultados.filter(r => r.STATUS === "APTO").length;
      const qtdInaptos = resultados.filter(r => r.STATUS === "INAPTO").length;
      alert(`✅ Processamento concluído!\n• Itens Aptos: ${qtdAptos}\n• Itens Inaptos (ocultos): ${qtdInaptos}`);
    } catch (err: any) {
      alert("Erro ao processar: " + err.message);
    }
    setLoading(false);
  };

  const salvarNoBanco = async () => {
    if (!dadosProcessados || dadosProcessados.length === 0) return;
    const aptos = dadosProcessados.filter((i: any) => i.STATUS === "APTO");
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
          promocao: nomePromocao,
          data_inicio: dataInicio || null,
          data_fim: dataFim || null
        }]);
      }
      await carregarPromocoesAtivasSupabase();
      alert(`🚀 ${aptos.length} promoções salvas com sucesso na base Magalu!`);
      setAbaAtiva("ativas");
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message);
    }
    setSalvandoBanco(false);
  };

  const baixarExcelOtimizado = () => {
    if (!dadosProcessados || dadosProcessados.length === 0) {
      alert("Processe a planilha primeiro.");
      return;
    }

    const dadosOtimizados = dadosProcessados
      .filter((item: any) => item.STATUS === "APTO")
      .map((item: any) => ({
        "SKU": item.SKU,
        "PDV": item.FINAL_PRICE
      }));

    if (dadosOtimizados.length === 0) {
      alert("Nenhum item elegível para exportação.");
      return;
    }

    const newWs = XLSX.utils.json_to_sheet(dadosOtimizados);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, "Magalu");
    XLSX.writeFile(newWb, "magalu_promocoes_PDV.xlsx");
  };

  const itensAptosList = dadosProcessados.filter((item: any) => item.STATUS === "APTO");
  const qtdInaptosTotal = dadosProcessados.filter((item: any) => item.STATUS === "INAPTO").length;
  const itensFiltradosAtivas = promocoesAtivas.filter(p => String(p.sku || "").toLowerCase().includes(termoBusca.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Promoções — Magazine Luiza</h1>
            <p className="text-sm font-medium text-slate-400">Precificação 100% sincronizada com as faixas de preço da calculadora</p>
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
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">⚙️ Configurações da Campanha & Upload de Estoque</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome da Promoção:</label>
                  <input
                    type="text"
                    value={nomePromocao}
                    onChange={(e) => setNomePromocao(e.target.value)}
                    placeholder="Ex: Liquidação Magalu"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Início:</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Fim:</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha de Estoque do Tiny (SKU na Col. C, Qtd na Col. F):</label>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleEstoqueUpload}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white cursor-pointer"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={processarCampanhaMagalu}
                    disabled={loading}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                  >
                    {loading ? "A processar..." : "Processar Campanha Magalu (Automático)"}
                  </button>
                </div>
              </div>

              {dadosProcessados.length > 0 && (
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-2 border-t border-slate-800">
                  <div className="text-xs text-slate-300 font-medium">
                    Itens aptos exibidos: <strong className="text-emerald-400">{itensAptosList.length}</strong> | Itens inaptos ignorados: <strong className="text-rose-400">{qtdInaptosTotal}</strong>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={salvarNoBanco}
                      disabled={salvandoBanco}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                    >
                      {salvandoBanco ? "A Salvar..." : "Salvar na Base Ativa"}
                    </button>
                    <button
                      type="button"
                      onClick={baixarExcelOtimizado}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                    >
                      Baixar Excel Otimizado (Col. A: SKU, Col. B: PDV)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {dadosProcessados.length > 0 && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white">Produtos Aptos para Campanha (Magalu)</h3>
                  <span className="text-xs text-slate-400">Total exibidos: {itensAptosList.length}</span>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-3">SKU (Coluna A)</th>
                        <th className="p-3 text-center">Saldo Estoque</th>
                        <th className="p-3 text-right">Custo Unitário</th>
                        <th className="p-3 text-right">PDV Sugerido (Coluna B)</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {itensAptosList.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono text-indigo-400">{item.SKU}</td>
                          <td className="p-3 text-center font-mono font-bold text-purple-300">{item.SALDO}</td>
                          <td className="p-3 text-right font-mono text-slate-400">{formatarMoeda(item.CUSTO)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatarMoeda(item.FINAL_PRICE)}</td>
                          <td className="p-3 text-center">
                            <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              APTO
                            </span>
                          </td>
                        </tr>
                      ))}
                      {itensAptosList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500">Nenhum produto apto encontrado com estoque positivo e mapeado na Magalu.</td>
                        </tr>
                      )}
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
                    <th className="p-3.5">Promoção</th>
                    <th className="p-3.5 text-center">Início</th>
                    <th className="p-3.5 text-center">Fim</th>
                    <th className="p-3.5 text-right">Preço Sugerido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {itensFiltradosAtivas.map((p, idx) => (
                    <tr key={p.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-mono text-indigo-400">{p.sku}</td>
                      <td className="p-3.5 font-bold text-white">{p.promocao || "-"}</td>
                      <td className="p-3.5 text-center font-mono text-amber-400">{p.data_inicio || "-"}</td>
                      <td className="p-3.5 text-center font-mono text-amber-400">{p.data_fim || "-"}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400">{formatarMoeda(p.preco_sugerido)}</td>
                    </tr>
                  ))}
                  {itensFiltradosAtivas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">Nenhum registo encontrado.</td>
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