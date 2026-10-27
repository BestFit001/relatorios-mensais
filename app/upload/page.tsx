"use client";
import { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { useRouter } from "next/navigation";

function letraParaIndice(letra: string): number {
  let l = letra.trim().toUpperCase();
  let num = 0;
  for (let i = 0; i < l.length; i++) {
    num = num * 26 + (l.charCodeAt(i) - 64);
  }
  return num - 1;
}

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
  let s = String(valor).replace(/R\$/g, "").replace(/BRL/g, "").replace(/\$/g, "").replace(/\s/g, "").trim();
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

export default function UpdatesPage() {
  const router = useRouter();
  const [abaAtiva, setAbaAtiva] = useState<"relatorios" | "cadastros" | "custos" | "regras_ml" | "dashboard_admin">("relatorios");

  const [mes, setMes] = useState("09");
  const [ano, setAno] = useState("2026");
  const [ficheiroABC, setFicheiroABC] = useState("");
  const [ficheiroInventario, setFicheiroInventario] = useState("");
  const [dadosABC, setDadosABC] = useState<any[]>([]);
  const [dadosInvBruto, setDadosInvBruto] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });
  const [contaMlSelecionada, setContaMlSelecionada] = useState<"Mercado Livre 1" | "Mercado Livre 2">("Mercado Livre 1");

  const [colunasPorConta, setColunasPorConta] = useState<{ [key: string]: { ml_mlb: string, ml_sku: string, ml_comissao: string, ml_peso: string, ml_altura: string, ml_largura: string, ml_comprimento: string } }>({
    "Mercado Livre 1": { ml_mlb: 'B', ml_sku: 'E', ml_comissao: 'AA', ml_peso: 'AF', ml_altura: 'AC', ml_largura: 'AD', ml_comprimento: 'AE' },
    "Mercado Livre 2": { ml_mlb: 'B', ml_sku: 'E', ml_comissao: 'AA', ml_peso: 'AF', ml_altura: 'AC', ml_largura: 'AD', ml_comprimento: 'AE' }
  });

  const [regrasColsCusto, setRegrasColsCusto] = useState({
    custo_sku: 'B', custo_produto: 'C', custo_valor: 'D', custo_marca: 'E'
  });

  const [pesquisaCusto, setPesquisaCusto] = useState("");
  const [listaCustosFiltrados, setListaCustosFiltrados] = useState<any[]>([]);

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 11 }, (_, i) => anoAtual - 5 + i);
  const meses = [
    { valor: "01", nome: "Janeiro" }, { valor: "02", nome: "Fevereiro" },
    { valor: "03", nome: "Março" }, { valor: "04", nome: "Abril" },
    { valor: "05", nome: "Maio" }, { valor: "06", nome: "Junho" },
    { valor: "07", nome: "Julho" }, { valor: "08", nome: "Agosto" },
    { valor: "09", nome: "Setembro" }, { valor: "10", nome: "Outubro" },
    { valor: "11", nome: "Novembro" }, { valor: "12", nome: "Dezembro" }
  ];
  const mesAlvoDash = `${ano}-${mes}`;

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarConfiguracoesSupabase();
  }, []);

  const carregarConfiguracoesSupabase = async () => {
    try {
      const { data } = await supabase.from('config_regras_canais').select('*');
      if (data && data.length > 0) {
        const novoObj: any = { ...colunasPorConta };
        data.forEach((r: any) => {
          if (novoObj[r.conta]) {
            novoObj[r.conta] = {
              ml_mlb: r.coluna_mlb || novoObj[r.conta].ml_mlb,
              ml_sku: r.coluna_sku || novoObj[r.conta].ml_sku,
              ml_comissao: r.coluna_comissao || novoObj[r.conta].ml_comissao,
              ml_peso: r.coluna_peso || novoObj[r.conta].ml_peso,
              ml_altura: r.coluna_altura || novoObj[r.conta].ml_altura,
              ml_largura: r.coluna_largura || novoObj[r.conta].ml_largura,
              ml_comprimento: r.coluna_comprimento || novoObj[r.conta].ml_comprimento,
            };
          }
        });
        setColunasPorConta(novoObj);
      }
    } catch (e) {}
  };

  const salvarRegrasMlSupabase = async () => {
    try {
      setLoading(true);
      for (const conta of ["Mercado Livre 1", "Mercado Livre 2"]) {
        const c = colunasPorConta[conta];
        await supabase.from('config_regras_canais').upsert({
          conta,
          coluna_mlb: c.ml_mlb,
          coluna_sku: c.ml_sku,
          coluna_comissao: c.ml_comissao,
          coluna_peso: c.ml_peso,
          coluna_altura: c.ml_altura,
          coluna_largura: c.ml_largura,
          coluna_comprimento: c.ml_comprimento,
        }, { onConflict: 'conta' });
      }
      alert("✅ Regras de Mercado Livre salvas com sucesso!");
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    }
    setLoading(false);
  };

  const handleUploadFaturados = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evento) => {
      try {
        const buffer = evento.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });

        const registros = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          const idPedido = String(row[3] || row[0] || "").trim();
          if (idPedido) {
            registros.push({ id_pedido: idPedido, mes_referencia: mesAlvoDash });
          }
        }

        if (registros.length > 0) {
          await supabase.from('faturados').delete().eq('mes_referencia', mesAlvoDash);
          for (let i = 0; i < registros.length; i += 500) {
            await supabase.from('faturados').insert(registros.slice(i, i + 500));
          }
        }

        alert(`✅ Faturados importados com sucesso! Total: ${registros.length} registos.`);
      } catch (err: any) {
        alert("Erro ao importar Faturados: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadCustosUnitarios = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evento) => {
      try {
        const buffer = evento.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });

        const idxSku = letraParaIndice(regrasColsCusto.custo_sku);
        const idxProd = letraParaIndice(regrasColsCusto.custo_produto);
        const idxCusto = letraParaIndice(regrasColsCusto.custo_valor);

        const mapaCustos = new Map();
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          const sku = String(row[idxSku] || "").trim().toLowerCase();
          const produto = String(row[idxProd] || "").trim();
          const custoStr = String(row[idxCusto] || "0").replace("R$", "").replace(",", ".").trim();
          const custoNum = parseFloat(custoStr) || 0;

          if (sku) {
            mapaCustos.set(sku, { sku, produto, custo_unitario: custoNum });
          }
        }

        const registros = Array.from(mapaCustos.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('tabela_custos_skus').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }

        alert(`✅ Custos importados com sucesso! Total: ${registros.length} SKUs.`);
      } catch (err: any) {
        alert("Erro ao importar custos: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const limparTabelaCustos = async () => {
    if (!confirm("Apagar todos os custos guardados?")) return;
    await supabase.from('tabela_custos_skus').delete().neq('id', 0);
    setListaCustosFiltrados([]);
    alert("✅ Custos limpos com sucesso.");
  };

  const pesquisarCustosNoBanco = async () => {
    if (!pesquisaCusto || pesquisaCusto.trim() === "") { setListaCustosFiltrados([]); return; }
    const termo = pesquisaCusto.trim();
    const { data } = await supabase.from('tabela_custos_skus').select('*').or(`sku.ilike.%${termo}%,produto.ilike.%${termo}%`).limit(50);
    if (data) setListaCustosFiltrados(data);
  };

  useEffect(() => {
    pesquisarCustosNoBanco();
  }, [pesquisaCusto]);

  const apagarDadosPorTipo = async (tabela: string) => {
    if (!confirm(`Deseja limpar os registros de [${tabela}] para o mês [${mesAlvoDash}]?`)) return;
    setLoading(true);
    try {
      await supabase.from(tabela).delete().eq('mes_referencia', mesAlvoDash);
      alert(`✅ Registros de ${tabela} limpos.`);
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
    setLoading(false);
  };

  const processarABC = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroABC(file.name);
    const reader = new FileReader();
    reader.onload = (evento) => {
      try {
        const buffer = evento.target?.result;
        const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
        const temp: any[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || r.length === 0) continue;
          temp.push({
            sku: String(r[1] || "").trim(),
            produto: String(r[2] || "").trim(),
            quantidade_vendida: parseNumeroBruto(r[3]),
            faturamento_total: parseNumeroBruto(r[4]),
            curva: String(r[5] || "").trim(),
            mes_referencia: mesAlvoDash
          });
        }
        setDadosABC(temp);
      } catch (err: any) { alert("Erro ao ler ABC: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const processarInventario = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroInventario(file.name);
    const reader = new FileReader();
    reader.onload = (evento) => {
      try {
        const buffer = evento.target?.result;
        const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
        const temp: any[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || r.length === 0) continue;
          temp.push({
            sku: String(r[1] || "").trim(),
            estoque_atual: parseNumeroBruto(r[2]),
            custo_unitario: parseNumeroBruto(r[3]),
            mes_referencia: mesAlvoDash
          });
        }
        setDadosInvBruto(temp);
      } catch (err: any) { alert("Erro ao ler Inventário: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const guardarRelatoriosSupabase = async () => {
    if (dadosABC.length === 0) return;
    setLoading(true);
    try {
      await supabase.from('curva_abc').delete().eq('mes_referencia', mesAlvoDash);
      await supabase.from('inventario').delete().eq('mes_referencia', mesAlvoDash);
      for (let i = 0; i < dadosABC.length; i += 500) {
        await supabase.from('curva_abc').insert(dadosABC.slice(i, i + 500));
      }
      if (dadosInvBruto.length > 0) {
        for (let i = 0; i < dadosInvBruto.length; i += 500) {
          await supabase.from('inventario').insert(dadosInvBruto.slice(i, i + 500));
        }
      }
      alert(`🚀 Relatórios guardados no Supabase com sucesso!`);
      setFicheiroABC(""); setFicheiroInventario(""); setDadosABC([]); setDadosInvBruto([]);
    } catch (err: any) { alert("Erro: " + err.message); }
    setLoading(false);
  };

  const limparDadosCompetencia = async () => {
    if (!mesAlvoDash) return;
    setLoadingDelete(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesAlvoDash);
    await supabase.from('inventario').delete().eq('mes_referencia', mesAlvoDash);
    setLoadingDelete(false);
    alert(`🗑 Dados da competência ${mesAlvoDash} limpos.`);
  };

  const limparBaseTiny = async () => {
    if (!confirm("Tem certeza que deseja apagar toda a base do Tiny ERP?")) return;
    await supabase.from('cadastros_base_tiny').delete().neq('id', 0);
    alert("✅ Base do Tiny limpa.");
  };

  const handleUploadTiny = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const indiceSku = letraParaIndice(regrasTiny.sku);
    const indiceEstoque = letraParaIndice(regrasTiny.estoque);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
        const mapaUnico = new Map();
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          const sku = normalizarSku(row[indiceSku]);
          const estoque = parseNumeroBruto(row[indiceEstoque]);
          if (sku) {
            mapaUnico.set(sku, { sku, estoque });
          }
        }
        const registros = Array.from(mapaUnico.values());
        for (let i = 0; i < registros.length; i += 500) {
          await supabase.from('cadastros_base_tiny').upsert(registros.slice(i, i + 500), { onConflict: 'sku' });
        }
        alert(`✅ Base Tiny sincronizada! Total: ${registros.length} registos.`);
      } catch (err: any) { alert("Erro: " + err.message); }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Abastecimento & Updates</h1>
            <p className="text-sm font-medium text-slate-400">Gestão completa de relatórios, bases ERP, custos, faturamento e tarifas do site</p>
          </div>
          <Navbar />
        </div>

        {/* ABAS DA CENTRAL */}
        <div className="flex flex-wrap gap-2 bg-slate-900/90 p-2 rounded-2xl border border-slate-800">
          <button
            onClick={() => setAbaAtiva("relatorios")}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer transition ${
              abaAtiva === "relatorios" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            📊 Relatórios (ABC & Inventário)
          </button>
          <button
            onClick={() => setAbaAtiva("cadastros")}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer transition ${
              abaAtiva === "cadastros" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            📦 Cadastros e Canais
          </button>
          <button
            onClick={() => setAbaAtiva("custos")}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer transition ${
              abaAtiva === "custos" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            💰 Custos por SKU
          </button>
          <button
            onClick={() => setAbaAtiva("regras_ml")}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer transition ${
              abaAtiva === "regras_ml" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            ⚙️ Regras & Medidas ML
          </button>
          <button
            onClick={() => setAbaAtiva("dashboard_admin")}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer transition ${
              abaAtiva === "dashboard_admin" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            ⚙️ Updates & Alimenta Dashboard
          </button>
        </div>

        {/* ABA: RELATÓRIOS */}
        {abaAtiva === "relatorios" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-6">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Competência</label>
              <button onClick={limparDadosCompetencia} disabled={loadingDelete} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer">
                {loadingDelete ? "A limpar..." : `🗑️ Limpar Base (${mesAlvoDash})`}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 max-w-md mb-6">
              <select className="border border-slate-700 rounded-xl p-3 bg-slate-950 text-xs text-white" value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
              </select>
              <select className="border border-slate-700 rounded-xl p-3 bg-slate-950 text-xs text-white" value={ano} onChange={(e) => setAno(e.target.value)}>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white">Curva ABC</h3>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={processarABC} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer" />
                {ficheiroABC && <p className="text-xs text-emerald-400 font-mono">Ficheiro: {ficheiroABC} ({dadosABC.length} linhas)</p>}
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white">Inventário Bruto</h3>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={processarInventario} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer" />
                {ficheiroInventario && <p className="text-xs text-emerald-400 font-mono">Ficheiro: {ficheiroInventario} ({dadosInvBruto.length} linhas)</p>}
              </div>
            </div>

            {dadosABC.length > 0 && (
              <div className="pt-4 flex justify-end">
                <button onClick={guardarRelatoriosSupabase} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase cursor-pointer">
                  {loading ? "A guardar..." : "🚀 Guardar Relatórios no Supabase"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ABA: CADASTROS E CANAIS */}
        {abaAtiva === "cadastros" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Base Central (Tiny ERP)</h3>
                  <button onClick={limparBaseTiny} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer">Limpar Base Tiny</button>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadTiny} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer" />
              </div>
            </div>
          </div>
        )}

        {/* ABA: CUSTOS POR SKU */}
        {abaAtiva === "custos" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Gestão de Custos Unitários por SKU</h2>
              <button onClick={limparTabelaCustos} className="bg-rose-950/60 text-rose-400 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border border-rose-900">🗑️ Limpar Custos</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. SKU (Letra):</label>
                <input type="text" value={regrasColsCusto.custo_sku} onChange={(e) => setRegrasColsCusto({ ...regrasColsCusto, custo_sku: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white uppercase font-mono text-center font-bold" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. Produto (Letra):</label>
                <input type="text" value={regrasColsCusto.custo_produto} onChange={(e) => setRegrasColsCusto({ ...regrasColsCusto, custo_produto: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white uppercase font-mono text-center font-bold" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Col. Custo (Letra):</label>
                <input type="text" value={regrasColsCusto.custo_valor} onChange={(e) => setRegrasColsCusto({ ...regrasColsCusto, custo_valor: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white uppercase font-mono text-center font-bold" />
              </div>
            </div>

            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadCustosUnitarios} className="block w-full text-xs text-slate-400 file:py-3 file:px-5 file:rounded-xl file:bg-emerald-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
            
            <input type="text" value={pesquisaCusto} onChange={(e) => setPesquisaCusto(e.target.value)} placeholder="🔍 Pesquisar SKU ou nome do produto nos custos salvos..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none" />
            
            {pesquisaCusto.trim() !== "" && (
              <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[350px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px]">
                    <tr><th className="p-3">SKU</th><th className="p-3">Produto</th><th className="p-3 text-right">Custo Unitário</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {listaCustosFiltrados.map(item => (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-indigo-400">{item.sku}</td>
                        <td className="p-3">{item.produto}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">R$ {Number(item.custo_unitario || item.custo || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ABA: REGRAS & MEDIDAS ML */}
        {abaAtiva === "regras_ml" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white">Regras & Medidas do Mercado Livre</h2>
                <p className="text-xs text-slate-400">Mapeamento de colunas para leitura de anúncios por conta.</p>
              </div>
              <button onClick={salvarRegrasMlSupabase} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase cursor-pointer">
                Salvar Configurações
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setContaMlSelecionada("Mercado Livre 1")} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${contaMlSelecionada === "Mercado Livre 1" ? "bg-indigo-600 text-white" : "bg-slate-950 text-slate-400 border border-slate-800"}`}>Mercado Livre 1</button>
              <button onClick={() => setContaMlSelecionada("Mercado Livre 2")} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${contaMlSelecionada === "Mercado Livre 2" ? "bg-indigo-600 text-white" : "bg-slate-950 text-slate-400 border border-slate-800"}`}>Mercado Livre 2</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-5 rounded-xl border border-slate-800">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna MLB (ID):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_mlb} onChange={(e) => setColunasPorConta({ ...colunasPorConta, [contaMlSelecionada]: { ...colunasPorConta[contaMlSelecionada], ml_mlb: e.target.value } })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white uppercase font-mono text-center font-bold" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna SKU:</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_sku} onChange={(e) => setColunasPorConta({ ...colunasPorConta, [contaMlSelecionada]: { ...colunasPorConta[contaMlSelecionada], ml_sku: e.target.value } })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white uppercase font-mono text-center font-bold" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Comissão:</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_comissao} onChange={(e) => setColunasPorConta({ ...colunasPorConta, [contaMlSelecionada]: { ...colunasPorConta[contaMlSelecionada], ml_comissao: e.target.value } })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white uppercase font-mono text-center font-bold" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Coluna Peso (kg):</label>
                <input type="text" value={colunasPorConta[contaMlSelecionada].ml_peso} onChange={(e) => setColunasPorConta({ ...colunasPorConta, [contaMlSelecionada]: { ...colunasPorConta[contaMlSelecionada], ml_peso: e.target.value } })} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white uppercase font-mono text-center font-bold" />
              </div>
            </div>

            <input type="file" accept=".xlsx, .xls, .csv" className="block w-full text-xs text-slate-400 file:py-3 file:px-5 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
          </div>
        )}

        {/* ABA: UPDATES & ALIMENTA DASHBOARD */}
        {abaAtiva === "dashboard_admin" && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-lg font-bold text-white">Updates para Alimentar o Dashboard</h2>
            
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-indigo-400 uppercase">Passo 1: Importar Faturados (Competência: {mesAlvoDash})</h3>
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadFaturados} className="block w-full text-xs text-slate-400 file:py-2.5 file:px-4 file:rounded-xl file:bg-emerald-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" />
            </div>

            <div className="pt-4 border-t border-slate-800 flex gap-4">
              <button onClick={() => apagarDadosPorTipo('faturados')} className="bg-slate-950 hover:bg-rose-950/40 text-rose-300 border border-rose-900 font-bold py-2.5 px-4 rounded-xl text-xs cursor-pointer">
                Apagar Faturados ({mesAlvoDash})
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}