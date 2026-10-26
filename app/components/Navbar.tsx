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

export default function RelatorioLivesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [subAba, setSubAba] = useState<"dados" | "config">("dados");

  // Configurações e Mapeamento
  const [colunaSku, setColunaSku] = useState("Seller SKU");
  const [colunaRepasse, setColunaRepasse] = useState("Order Amount");
  const [colunaPdv, setColunaPdv] = useState("SKU Unit Original Price");
  const [colunaData, setColunaData] = useState("Paid Time");
  const [colunaStatus, setColunaStatus] = useState("Order Status");
  const [percentualImposto, setPercentualImposto] = useState("9");
  const [percentualComissao, setPercentualComissao] = useState("14");

  // Dados
  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);
  const [custosMap, setCustosMap] = useState<Map<string, any>>(new Map());

  // Filtros
  const [buscaSku, setBuscaSku] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const statusPermitidos = ["aguardando envio", "em trânsito", "concluído", "entregue"];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarCustosECarregamentosSalvos();
  }, []);

  const carregarCustosECarregamentosSalvos = async () => {
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

      const cMap = new Map();
      allCustos.forEach((c: any) => {
        const k = normalizarSku(c.sku);
        if (k) cMap.set(k, c);
      });
      setCustosMap(cMap);

      const { data: configData } = await supabase.from("config_regras_tiny").select("*").eq("canal", "live_config");
      if (configData && configData.length > 0) {
        configData.forEach((cfg: any) => {
          if (cfg.campo === "coluna_sku") setColunaSku(cfg.coluna);
          if (cfg.campo === "coluna_repasse") setColunaRepasse(cfg.coluna);
          if (cfg.campo === "coluna_pdv") setColunaPdv(cfg.coluna);
          if (cfg.campo === "coluna_data") setColunaData(cfg.coluna);
          if (cfg.campo === "coluna_status") setColunaStatus(cfg.coluna);
          if (cfg.campo === "imposto") setPercentualImposto(cfg.coluna);
          if (cfg.campo === "comissao") setPercentualComissao(cfg.coluna);
        });
      }
    } catch (e) {
      console.error("Erro ao carregar bases:", e);
    }
    setLoading(false);
  };

  const salvarConfiguracoes = async () => {
    try {
      const configs = [
        { canal: "live_config", campo: "coluna_sku", coluna: colunaSku },
        { canal: "live_config", campo: "coluna_repasse", coluna: colunaRepasse },
        { canal: "live_config", campo: "coluna_pdv", coluna: colunaPdv },
        { canal: "live_config", campo: "coluna_data", coluna: colunaData },
        { canal: "live_config", campo: "coluna_status", coluna: colunaStatus },
        { canal: "live_config", campo: "imposto", coluna: percentualImposto },
        { canal: "live_config", campo: "comissao", coluna: percentualComissao },
      ];

      for (const c of configs) {
        await supabase.from("config_regras_tiny").upsert(c, { onConflict: "canal,campo" });
      }

      alert("✅ Configurações de Live salvas com sucesso!");
      setSubAba("dados");
    } catch (err: any) {
      alert("Erro ao salvar configurações: " + err.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

        if (rawData.length > 2) {
          const headers = rawData[0].map((h: any) => String(h || "").trim());
          const linhas = [];
          for (let i = 2; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;
            const obj: any = {};
            headers.forEach((h, idx) => {
              obj[h] = row[idx] || "";
            });
            linhas.push(obj);
          }
          setDadosBrutos(linhas);
          alert(`✅ Planilha de LIVES carregada com sucesso! ${linhas.length} registos encontrados.`);
        }
      } catch (err: any) {
        alert("Erro ao ler planilha: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const dadosProcessados = dadosBrutos.map((row) => {
    const skuRaw = row[colunaSku] || "";
    const skuNorm = normalizarSku(skuRaw);
    const repasse = parseNumeroBruto(row[colunaRepasse]);
    const pdv = parseNumeroBruto(row[colunaPdv]);
    const dataPagamento = row[colunaData] || "";
    const statusVenda = String(row[colunaStatus] || "").trim().toLowerCase();

    const custoObj = custosMap.get(skuNorm);
    const custoUnitario = custoObj ? parseNumeroBruto(custoObj.custo_unitario ?? custoObj.custo ?? 0) : 0;
    const nomeProduto = custoObj ? (custoObj.produto || custoObj.descricao || "Produto Cadastrado") : (row["Product Name"] || "Produto Desconhecido");

    const impostoVal = repasse * (parseFloat(percentualImposto) / 100 || 0);
    const comissaoVal = repasse * (parseFloat(percentualComissao) / 100 || 0);
    const liquidez = repasse - custoUnitario - impostoVal - comissaoVal;

    return {
      sku: skuRaw,
      skuNorm,
      nomeProduto,
      repasse,
      pdv,
      custo: custoUnitario,
      imposto: impostoVal,
      comissao: comissaoVal,
      liquidez,
      data: dataPagamento,
      status: statusVenda,
    };
  }).filter(item => {
    if (!item.skuNorm) return false;

    // Filtro estrito de status válidos
    const statusLimpo = item.status.replace(/[\u0300-\u036f]/g, ""); // normaliza acentos se houver
    const statusValido = statusPermitidos.some(st => statusLimpo.includes(st.toLowerCase()));
    if (!statusValido) return false;

    // Filtro por SKU
    if (buscaSku && !item.skuNorm.includes(buscaSku.toLowerCase()) && !item.nomeProduto.toLowerCase().includes(buscaSku.toLowerCase())) {
      return false;
    }

    // Filtro por Data
    if (dataInicio && item.data && item.data < dataInicio) return false;
    if (dataFim && item.data && item.data > dataFim) return false;

    return true;
  });

  const totalRepasse = dadosProcessados.reduce((acc, cur) => acc + cur.repasse, 0);
  const totalCusto = dadosProcessados.reduce((acc, cur) => acc + cur.custo, 0);
  const totalImposto = dadosProcessados.reduce((acc, cur) => acc + cur.imposto, 0);
  const totalComissao = dadosProcessados.reduce((acc, cur) => acc + cur.comissao, 0);
  const totalLiquidez = dadosProcessados.reduce((acc, cur) => acc + cur.liquidez, 0);

  const rankingMap = new Map<string, { sku: string; nome: string; qtd: number; repasse: number; liquidez: number }>();
  dadosProcessados.forEach(item => {
    if (!rankingMap.has(item.skuNorm)) {
      rankingMap.set(item.skuNorm, { sku: item.sku, nome: item.nomeProduto, qtd: 0, repasse: 0, liquidez: 0 });
    }
    const r = rankingMap.get(item.skuNorm)!;
    r.qtd += 1;
    r.repasse += item.repasse;
    r.liquidez += item.liquidez;
  });
  const rankingProdutos = Array.from(rankingMap.values()).sort((a, b) => b.qtd - a.qtd);

  return (
    <div className="min-h-screen bg-[#07090e] p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Relatório de Vendas via LIVES</h1>
            <p className="text-sm font-medium text-slate-400">Validação filtrada por status, repasses, custos, comissões fixas e liquidez</p>
          </div>
          <Navbar />
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4 bg-slate-900/90 p-3 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex gap-3">
            <button
              onClick={() => setSubAba("dados")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
                subAba === "dados" ? "bg-indigo-600 text-white shadow-indigo-950/50" : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              📊 Relatório & Vendas
            </button>
            <button
              onClick={() => setSubAba("config")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
                subAba === "config" ? "bg-indigo-600 text-white shadow-indigo-950/50" : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              ⚙️ Configurações Live
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white cursor-pointer"
            />
          </div>
        </div>

        {subAba === "config" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800/80 shadow-xl max-w-3xl mx-auto space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white uppercase tracking-wider">⚙️ Configurações de Mapeamento da Live</h2>
              <p className="text-xs text-slate-400 mt-1">Defina colunas, status válidos e taxas aplicadas.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-950 p-6 rounded-xl border border-slate-800/80">
              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna SKU do Vendedor:</label>
                <input
                  type="text"
                  value={colunaSku}
                  onChange={(e) => setColunaSku(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Status do Pedido:</label>
                <input
                  type="text"
                  value={colunaStatus}
                  onChange={(e) => setColunaStatus(e.target.value)}
                  placeholder="Ex: Order Status"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Valor de Repasse:</label>
                <input
                  type="text"
                  value={colunaRepasse}
                  onChange={(e) => setColunaRepasse(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Preço de Venda (PDV):</label>
                <input
                  type="text"
                  value={colunaPdv}
                  onChange={(e) => setColunaPdv(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">Coluna Data de Pagamento:</label>
                <input
                  type="text"
                  value={colunaData}
                  onChange={(e) => setColunaData(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">Imposto (%):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={percentualImposto}
                    onChange={(e) => setPercentualImposto(e.target.value)}
                    className="w-full bg-slate-900 border border-amber-600/50 rounded-xl p-3 text-xs text-amber-300 font-bold outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Comissão (%):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={percentualComissao}
                    onChange={(e) => setPercentualComissao(e.target.value)}
                    className="w-full bg-slate-900 border border-emerald-600/50 rounded-xl p-3 text-xs text-emerald-300 font-bold outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] text-slate-400">
              ℹ️ A aba considerará automaticamente apenas os status: <strong className="text-emerald-400">Aguardando envio</strong>, <strong className="text-emerald-400">Em trânsito</strong>, <strong className="text-emerald-400">Concluído</strong> e <strong className="text-emerald-400">Entregue</strong>.
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={salvarConfiguracoes}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg shadow-indigo-950/50"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        )}

        {subAba === "dados" && (
          <div className="space-y-6">
            
            {/* CARDS DE RESUMO */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Total Repasse</span>
                <span className="text-lg font-black font-mono text-white mt-1 block">{formatarMoeda(totalRepasse)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Custo Total (CMV)</span>
                <span className="text-lg font-black font-mono text-rose-400 mt-1 block">- {formatarMoeda(totalCusto)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Impostos ({percentualImposto}%)</span>
                <span className="text-lg font-black font-mono text-amber-400 mt-1 block">- {formatarMoeda(totalImposto)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Comissões ({percentualComissao}%)</span>
                <span className="text-lg font-black font-mono text-indigo-400 mt-1 block">- {formatarMoeda(totalComissao)}</span>
              </div>
              <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800/80 shadow-xl col-span-2 md:col-span-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Liquidez Líquida</span>
                <span className="text-lg font-black font-mono text-emerald-400 mt-1 block">{formatarMoeda(totalLiquidez)}</span>
              </div>
            </div>

            {/* FILTROS DE PESQUISA E DATAS */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-xl flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pesquisar por SKU ou Nome do Produto:</label>
                <input
                  type="text"
                  value={buscaSku}
                  onChange={(e) => setBuscaSku(e.target.value)}
                  placeholder="Ex: 22652042281 ou Garrafa..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Início:</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Fim:</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none font-mono"
                />
              </div>

              <button
                type="button"
                onClick={() => { setBuscaSku(""); setDataInicio(""); setDataFim(""); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase cursor-pointer"
              >
                Limpar Filtros
              </button>
            </div>

            {/* DUAS COLUNAS: RANKING DE PRODUTOS E ITENS DA LIVE */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* RANKING DE MAIS VENDIDOS */}
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white">🏆 Ranking de Produtos (Live)</h3>
                  <span className="text-xs text-slate-400">{rankingProdutos.length} SKU(s)</span>
                </div>
                <div className="overflow-y-auto max-h-[500px] divide-y divide-slate-800/60 p-2 space-y-2">
                  {rankingProdutos.map((prod, idx) => (
                    <div key={idx} className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/50 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-mono font-bold text-indigo-400">{prod.sku}</span>
                        <span className="text-[10px] font-bold bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded">
                          {prod.qtd} un. vendidas
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-200 truncate">{prod.nome}</p>
                      <div className="flex justify-between text-[11px] font-mono pt-1 text-slate-400">
                        <span>Repasse: <strong className="text-white">{formatarMoeda(prod.repasse)}</strong></span>
                        <span>Liquidez: <strong className="text-emerald-400">{formatarMoeda(prod.liquidez)}</strong></span>
                      </div>
                    </div>
                  ))}
                  {rankingProdutos.length === 0 && (
                    <p className="text-center text-slate-500 text-xs py-8">Nenhum produto válido encontrado.</p>
                  )}
                </div>
              </div>

              {/* TABELA DETALHADA DE VENDAS */}
              <div className="lg:col-span-2 bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white">📋 Detalhamento das Vendas (Live)</h3>
                  <span className="text-xs text-slate-400">Exibindo {dadosProcessados.length} registo(s) válidos</span>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-3">Data / Status</th>
                        <th className="p-3">SKU / Produto</th>
                        <th className="p-3 text-right">Repasse</th>
                        <th className="p-3 text-right">Custo</th>
                        <th className="p-3 text-right">Comissão</th>
                        <th className="p-3 text-right">Liquidez</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {dadosProcessados.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                            <span className="block text-white">{item.data}</span>
                            <span className="text-[10px] text-emerald-400 uppercase">{item.status}</span>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-indigo-400 block">{item.sku}</span>
                            <span className="text-slate-300 font-medium truncate block max-w-[200px]">{item.nomeProduto}</span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-white">{formatarMoeda(item.repasse)}</td>
                          <td className="p-3 text-right font-mono text-rose-400">- {formatarMoeda(item.custo)}</td>
                          <td className="p-3 text-right font-mono text-indigo-300">- {formatarMoeda(item.comissao)}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatarMoeda(item.liquidez)}</td>
                        </tr>
                      ))}
                      {dadosProcessados.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500">Nenhum registo correspondente aos status válidos e filtros.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}