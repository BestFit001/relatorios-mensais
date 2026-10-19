"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

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

function normalizarSku(valor: any) {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  s = s.replace(/^["']|["']$/g, "").trim();
  return s.toLowerCase();
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

export default function PromocoesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [margemAlvo, setMargemAlvo] = useState("20");
  const [arquivoUpload, setArquivoUpload] = useState<File | null>(null);
  const [workbookOriginal, setWorkbookOriginal] = useState<any>(null);
  const [dadosProcessados, setDadosProcessados] = useState<any[]>([]);
  const [promocoesAtivas, setPromocoesAtivas] = useState<any[]>([]);
  const [termoBusca, setTermoBusca] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"precificar" | "ativas">("precificar");

  const [custosMap, setCustosMap] = useState<Map<string, number>>(new Map());
  const [mlRegrasMap, setMlRegrasMap] = useState<Map<string, any>>(new Map());
  const [mapeamentoMap, setMapeamentoMap] = useState<Map<string, any>>(new Map());
  const [obsoletosSet, setObsoletosSet] = useState<Set<string>>(new Set());

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
      // 1. Custos
      const { data: custos } = await supabase.from("tabela_custos_skus").select("*");
      const cMap = new Map<string, number>();
      const obsSet = new Set<string>();

      if (custos) {
        custos.forEach((c: any) => {
          const k = normalizarSku(c.sku);
          if (k) {
            cMap.set(k, Number(c.custo_unitario || c.custo || 0));
            if (String(c.status || "").toLowerCase().includes("obsoleto")) {
              obsSet.add(k);
            }
          }
        });
      }
      setCustosMap(cMap);
      setObsoletosSet(obsSet);

      // 2. Regras ML (ml_anuncios_regras) com suporte a peso e dimensões para o frete dinâmico
      const mlMap = new Map<string, any>();
      const { data: mlRegras } = await supabase.from("ml_anuncios_regras").select("*");
      if (mlRegras) {
        mlRegras.forEach((m: any) => {
          const mlbKey = String(m.mlb || "").trim().toUpperCase();
          const skuKey = normalizarSku(m.sku);
          const comissaoNum = parsePorcentagem(m.comissao);
          const info = {
            comissao: comissaoNum,
            peso_real: Number(m.peso_real || 2.0),
            altura: Number(m.altura || 10),
            largura: Number(m.largura || 10),
            comprimento: Number(m.comprimento || 10)
          };
          if (mlbKey) mlMap.set(mlbKey, info);
          if (skuKey) mlMap.set(skuKey, info);
        });
      }
      setMlRegrasMap(mlMap);

      // 3. Mapeamento de SKUs (mapeamento_skus)
      const mapMap = new Map<string, any>();
      const { data: mapAnuncios } = await supabase.from("mapeamento_skus").select("*");
      if (mapAnuncios) {
        mapAnuncios.forEach((m: any) => {
          const mlbKey = String(m.mlb || "").trim().toUpperCase();
          const skuKey = normalizarSku(m.sku);
          const comissaoNum = parsePorcentagem(m.comissao);
          const info = {
            comissao: comissaoNum,
            peso_real: Number(m.peso_real || 2.0),
            altura: Number(m.altura || 10),
            largura: Number(m.largura || 10),
            comprimento: Number(m.comprimento || 10)
          };
          if (mlbKey) mapMap.set(mlbKey, info);
          if (skuKey) mapMap.set(skuKey, info);
        });
      }
      setMapeamentoMap(mapMap);

    } catch (e) {
      console.error("Erro ao carregar bases:", e);
    }
    setLoading(false);
  };

  const carregarPromocoesAtivasSupabase = async () => {
    const { data } = await supabase.from("promocoes_ativas_ml").select("*").order("id", { ascending: false });
    if (data) setPromocoesAtivas(data);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setArquivoUpload(file);

      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        setWorkbookOriginal(wb);
      };
      reader.readAsBinaryString(file);
    }
  };

  const processarPlanilhaCampanha = async () => {
    if (!workbookOriginal) {
      alert("Por favor, selecione uma planilha de campanha do Mercado Livre.");
      return;
    }

    setLoading(true);
    try {
      const sheetName = workbookOriginal.SheetNames.includes("Promoções") ? "Promoções" : workbookOriginal.SheetNames[0];
      const ws = workbookOriginal.Sheets[sheetName];
      const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rawData.length < 5) {
        alert("A planilha parece estar vazia ou fora do formato esperado.");
        setLoading(false);
        return;
      }

      const headers = rawData[0];
      const colIdx: any = {};
      headers.forEach((h: string, idx: number) => {
        if (h) colIdx[h.trim()] = idx;
      });

      const margemDesejada = parseFloat(margemAlvo) / 100 || 0.20;
      const imposto = 0.09; // 9% de imposto corporativo[cite: 1]

      const resultados: any[] = [];

      for (let i = 5; i < rawData.length; i++) {
        const r = rawData[i];
        if (!r || r.length === 0) continue;

        const mlb = String(r[colIdx["ITEM_ID"]] || "").trim().toUpperCase();
        if (!mlb || !mlb.startsWith("MLB")) continue;

        const skuRaw = String(r[colIdx["SKU"]] || "");
        const skuKey = normalizarSku(skuRaw);
        const originalPrice = Number(r[colIdx["ORIGINAL_PRICE"]] || 0);
        const promoName = r[colIdx["PROMOTION_NAME"]] || "Campanha Geral";
        const dateValidity = r[colIdx["DATE_VALIDITY"]] || "Indeterminado";

        // 1. Custo
        const custo = custosMap.has(skuKey) ? Number(custosMap.get(skuKey)) : 0;

        // 2. Consulta nas bases do Supabase
        const anuncioInfo = mlRegrasMap.get(mlb) || mlRegrasMap.get(skuKey) || mapeamentoMap.get(mlb) || mapeamentoMap.get(skuKey);
        
        let statusItem = "APTO";
        let errosList: string[] = [];
        let comissaoVal = 0;
        let pesoReal = 2.0;
        let altura = 10;
        let largura = 10;
        let comprimento = 10;

        if (!anuncioInfo) {
          statusItem = "INAPTO";
          errosList.push("MLB não cadastrado na base — Atualizar base");
        } else {
          comissaoVal = Number(anuncioInfo.comissao) || 0;
          pesoReal = Number(anuncioInfo.peso_real || 2.0);
          altura = Number(anuncioInfo.altura || 10);
          largura = Number(anuncioInfo.largura || 10);
          comprimento = Number(anuncioInfo.comprimento || 10);

          if (comissaoVal <= 0) {
            statusItem = "INAPTO";
            errosList.push("Comissão 0% na base — Atualizar base");
          }
        }

        if (custo <= 0) {
          statusItem = "INAPTO";
          errosList.push("Custo não encontrado — Atualizar base");
        }

        let novoPreco = originalPrice;
        if (statusItem === "APTO") {
          const comissaoDec = comissaoVal > 1 ? comissaoVal / 100 : comissaoVal;
          
          // Cálculo iterativo para encontrar o preço ideal englobando Frete Dinâmico (que varia conforme a faixa de preço >= 79)
          let precoEstimado = originalPrice * 0.9;
          for (let iter = 0; iter < 5; iter++) {
            let tarifaFixaItem = precoEstimado < 79.00 ? 6.50 : 0.00;
            let freteItem = calcularFreteML(precoEstimado, pesoReal, altura, largura, comprimento);
            
            const denominador = 1 - (comissaoDec + imposto + margemDesejada);
            if (denominador > 0) {
              precoEstimado = (custo + tarifaFixaItem + freteItem) / denominador;
            }
          }
          novoPreco = precoEstimado > 0 ? precoEstimado : originalPrice * 0.9;

          if (originalPrice <= 0 || novoPreco <= 0) {
            statusItem = "INAPTO";
            errosList.push("Preço Inválido");
          }
        }

        resultados.push({
          rowIndex: i,
          MLB: mlb,
          SKU: skuRaw,
          PROMOTION_NAME: promoName,
          DATE_VALIDITY: dateValidity,
          ORIGINAL_PRICE: originalPrice,
          FINAL_PRICE: Number(novoPreco.toFixed(2)),
          STATUS: statusItem,
          OBSOLETO: obsoletosSet.has(skuKey) ? "SIM" : "NÃO",
          ERRO: errosList.length > 0 ? errosList.join(" | ") : ""
        });
      }

      setDadosProcessados(resultados);

      for (const item of resultados.filter(r => r.STATUS === "APTO")) {
        try {
          await supabase.from("promocoes_ativas_ml").insert([{
            mlb: item.MLB,
            sku: item.SKU,
            promocao: item.PROMOTION_NAME,
            date_validity: item.DATE_VALIDITY
          }]);
        } catch (err) {}
      }

      carregarPromocoesAtivasSupabase();
      alert(`✅ Processamento concluído! ${resultados.filter(r => r.STATUS === "APTO").length} itens aptos e ${resultados.filter(r => r.STATUS === "INAPTO").length} inaptos.`);
    } catch (err: any) {
      alert("Erro ao processar: " + err.message);
    }
    setLoading(false);
  };

  const baixarAptosExcel = () => {
    if (!workbookOriginal || dadosProcessados.length === 0) {
      alert("Processe a planilha primeiro.");
      return;
    }

    const sheetName = workbookOriginal.SheetNames.includes("Promoções") ? "Promoções" : workbookOriginal.SheetNames[0];
    const ws = workbookOriginal.Sheets[sheetName];
    const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const headers = rawData[0];
    const colIdx: any = {};
    headers.forEach((h: string, idx: number) => {
      if (h) colIdx[h.trim()] = idx;
    });

    dadosProcessados.forEach((item) => {
      const i = item.rowIndex;
      if (item.STATUS === "APTO") {
        if (colIdx["FINAL_PRICE"] !== undefined) rawData[i][colIdx["FINAL_PRICE"]] = item.FINAL_PRICE;
        if (colIdx["STATUS"] !== undefined) rawData[i][colIdx["STATUS"]] = "Elegível";
        if (colIdx["ACTION"] !== undefined) rawData[i][colIdx["ACTION"]] = "Participar";
        if (colIdx["ERRORS"] !== undefined) rawData[i][colIdx["ERRORS"]] = "";
      } else {
        if (colIdx["STATUS"] !== undefined) rawData[i][colIdx["STATUS"]] = "Inapto";
        if (colIdx["ACTION"] !== undefined) rawData[i][colIdx["ACTION"]] = "Não participar";
        if (colIdx["ERRORS"] !== undefined) rawData[i][colIdx["ERRORS"]] = item.ERRO || "base desatualizada";
      }
    });

    const newWs = XLSX.utils.aoa_to_sheet(rawData);
    workbookOriginal.Sheets[sheetName] = newWs;

    XLSX.writeFile(workbookOriginal, "ml_campanha_precificada_com_cabecalho.xlsx");
  };

  const promocoesFiltradas = promocoesAtivas.filter((p) => 
    String(p.sku || "").toLowerCase().includes(termoBusca.toLowerCase()) ||
    String(p.mlb || "").toLowerCase().includes(termoBusca.toLowerCase()) ||
    String(p.promocao || "").toLowerCase().includes(termoBusca.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Promoções — Mercado Livre</h1>
            <p className="text-sm font-medium text-slate-400">Validação rigorosa de percentuais e custos com cálculo dinâmico de frete por cubagem</p>
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
            Precificar Campanha
          </button>
          <button
            onClick={() => setAbaAtiva("ativas")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              abaAtiva === "ativas" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Promoções Ativas ({promocoesAtivas.length})
          </button>
        </div>

        {abaAtiva === "precificar" ? (
          <div className="space-y-6">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha de Campanha (Excel):</label>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
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
                  onClick={processarPlanilhaCampanha}
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
                >
                  {loading ? "A processar..." : "Executar Precificação"}
                </button>
              </div>

              {dadosProcessados.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={baixarAptosExcel}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                  >
                    Baixar Planilha Pronta (.xlsx)
                  </button>
                </div>
              )}
            </div>

            {dadosProcessados.length > 0 && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white">Resultado do Processamento da Campanha</h3>
                  <span className="text-xs text-slate-400">Total processados: {dadosProcessados.length}</span>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-3">MLB</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Campanha</th>
                        <th className="p-3 text-right">Preço Original</th>
                        <th className="p-3 text-right">Novo Preço Sugerido</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-center">Observações / Erros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {dadosProcessados.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono text-indigo-400">{item.MLB}</td>
                          <td className="p-3 font-mono text-slate-300">{item.SKU}</td>
                          <td className="p-3 text-slate-300">{item.PROMOTION_NAME}</td>
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Painel de Campanhas & Promoções Ativas</h3>
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Pesquisar por SKU, MLB ou Promoção..."
                className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none w-full md:w-80"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3.5">MLB</th>
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5">Nome da Promoção</th>
                    <th className="p-3.5">Período de Validade (DATE_VALIDITY)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {promocoesFiltradas.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-mono text-indigo-400">{p.mlb}</td>
                      <td className="p-3.5 font-mono text-slate-300">{p.sku}</td>
                      <td className="p-3.5 font-bold text-white">{p.promocao}</td>
                      <td className="p-3.5 font-mono text-amber-400">{p.date_validity}</td>
                    </tr>
                  ))}
                  {promocoesFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">Nenhuma promoção ativa encontrada.</td>
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