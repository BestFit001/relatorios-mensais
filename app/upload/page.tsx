"use client";
import { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function UploadPage() {
  const [abaAtiva, setAbaAtiva] = useState<"relatorios" | "cadastros">("relatorios");

  const [mes, setMes] = useState("09");
  const [ano, setAno] = useState("2026");
  const [ficheiroABC, setFicheiroABC] = useState("");
  const [ficheiroInventario, setFicheiroInventario] = useState("");
  const [dadosABC, setDadosABC] = useState<any[]>([]);
  const [dadosInvBruto, setDadosInvBruto] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
  const [regrasTiny, setRegrasTiny] = useState({ sku: 'A', estoque: 'E', status_sku: 'A', status_valor: 'B' });
  const [estatisticas, setEstatisticas] = useState({ totalTiny: 0, normais: 0, obsoletos: 0 });
  const [progressoCanais, setProgressoCanais] = useState<any[]>([]);

  const mesReferencia = mes && ano ? `${mes}/${ano}` : "";
  const meses = [
    { valor: "01", nome: "Janeiro" }, { valor: "02", nome: "Fevereiro" },
    { valor: "03", nome: "Março" }, { valor: "04", nome: "Abril" },
    { valor: "05", nome: "Maio" }, { valor: "06", nome: "Junho" },
    { valor: "07", nome: "Julho" }, { valor: "08", nome: "Agosto" },
    { valor: "09", nome: "Setembro" }, { valor: "10", nome: "Outubro" },
    { valor: "11", nome: "Novembro" }, { valor: "12", nome: "Dezembro" }
  ];
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 11 }, (_, i) => anoAtual - 1 + i);

  useEffect(() => {
    carregarDadosCadastros();
  }, []);

  const carregarDadosCadastros = async () => {
    const { data: regras } = await supabase.from('config_regras_canais').select('*').order('id');
    if (regras) setRegrasCanais(regras);

    const { data: tinyConfig } = await supabase.from('config_regras_tiny').select('*');
    if (tinyConfig) {
      const cfgSku = tinyConfig.find(t => t.campo === 'sku')?.coluna || 'A';
      const cfgEstoque = tinyConfig.find(t => t.campo === 'estoque')?.coluna || 'E';
      const cfgStatusSku = tinyConfig.find(t => t.campo === 'status_sku')?.coluna || 'A';
      const cfgStatusValor = tinyConfig.find(t => t.campo === 'status_valor')?.coluna || 'B';
      setRegrasTiny({ sku: cfgSku, estoque: cfgEstoque, status_sku: cfgStatusSku, status_valor: cfgStatusValor });
    }

    const { data: tinyData } = await supabase.from('cadastros_base_tiny').select('sku, estoque');
    const { data: statusData } = await supabase.from('status_skus_catalogo').select('*');

    const totalTiny = tinyData?.length || 0;
    const mapaStatus = new Map(statusData?.map(s => [s.sku, s.status]) || []);

    let normais = 0;
    let obsoletos = 0;

    tinyData?.forEach(item => {
      const st = mapaStatus.get(item.sku) || 'Normal';
      if (st === 'Obsoleto') obsoletos++;
      else normais++;
    });

    setEstatisticas({ totalTiny, normais, obsoletos });

    if (regras && tinyData) {
      const skusTinySet = new Set(tinyData.map(t => t.sku));
      const { data: mapeamentoData } = await supabase.from('mapeamento_canais_skus').select('*');

      const progresso = regras.map(r => {
        const skusCanal = new Set(
          mapeamentoData?.filter(m => m.canal === r.canal && m.presente).map(m => m.sku) || []
        );

        let cadastrados = 0;
        skusTinySet.forEach(sku => {
          if (skusCanal.has(sku)) cadastrados++;
        });

        const percentual = totalTiny > 0 ? (cadastrados / totalTiny) * 100 : 0;
        return {
          canal: r.canal,
          cadastrados,
          total: totalTiny,
          percentual: percentual.toFixed(1)
        };
      });

      setProgressoCanais(progresso);
    }
  };

  const letraParaIndice = (str: string) => {
    let base = str.toUpperCase().trim();
    let coluna = 0;
    for (let i = 0; i < base.length; i++) {
      coluna = coluna * 26 + (base.charCodeAt(i) - 64);
    }
    return coluna - 1;
  };

  const processarABC = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroABC(file.name);

    const reader = new FileReader();
    reader.onload = (evento) => {
      try {
        const data = new Uint8Array(evento.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        
        const formatado = [];
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          const produto = String(row[0] || "").trim();
          const codigo = String(row[1] || "").trim();
          const quantidade = Number(row[2]);
          const valor = Number(row[3]);

          if (codigo && !isNaN(quantidade)) {
            formatado.push({
              mes_referencia: mesReferencia,
              codigo: codigo,
              produto: produto,
              quantidade: quantidade,
              valor: isNaN(valor) ? 0 : valor,
              porcentagem_individual: Number(row[4] || 0),
              porcentagem_acumulada: Number(row[5] || 0),
              classificacao: String(row[6] || "C").trim().toUpperCase()
            });
          }
        }
        setDadosABC(formatado);
        alert(`Curva ABC processada: ${formatado.length} produtos válidos.`);
      } catch (err: any) {
        alert("Erro ao ler Curva ABC: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processarInventario = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (dadosABC.length === 0) {
      alert("Processe primeiro a Curva ABC.");
      e.target.value = "";
      return;
    }
    setFicheiroInventario(file.name);
    const skusPermitidos = new Set(dadosABC.map(item => String(item.codigo).trim()));

    const reader = new FileReader();
    reader.onload = (evento) => {
      try {
        const data = new Uint8Array(evento.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
        
        const formatado = [];
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          let skuEncontrado = "";
          let saldoEstoque = 0;

          for (let col = 0; col < row.length; col++) {
            const val = String(row[col] || "").trim();
            if (skusPermitidos.has(val)) {
              skuEncontrado = val;
              break;
            }
          }

          if (skuEncontrado) {
            const saldoVal = Number(row[row.length - 1] ?? 0);
            if (!isNaN(saldoVal)) saldoEstoque = saldoVal;
            formatado.push({ mes_referencia: mesReferencia, codigo_sku: skuEncontrado, saldo: saldoEstoque });
          }
        }
        setDadosInvBruto(formatado);
        alert(`Inventário processado: ${formatado.length} SKUs identificados.`);
      } catch (err: any) {
        alert("Erro ao ler Inventário: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const enviarParaBanco = async () => {
    if (dadosABC.length === 0) return;
    setLoading(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);

    await supabase.from('curva_abc').insert(dadosABC);
    if (dadosInvBruto.length > 0) {
      await supabase.from('inventario').insert(dadosInvBruto);
    }
    setLoading(false);
    alert(`🚀 Dados guardados no Supabase com sucesso!`);
    setFicheiroABC(""); setFicheiroInventario(""); setDadosABC([]); setDadosInvBruto([]);
  };

  const limparDadosCompetencia = async () => {
    if (!mesReferencia) return;
    setLoadingDelete(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);
    setLoadingDelete(false);
    alert(`🗑 Dados limpos.`);
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
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceEstoque)) continue;

          const sku = String(row[indiceSku] || "").trim();
          const estoque = Number(row[indiceEstoque] || 0);

          if (sku && !/sku|código|codigo/i.test(sku)) {
            mapaUnico.set(sku, { sku, estoque: isNaN(estoque) ? 0 : estoque });
          }
        }
        const registros = Array.from(mapaUnico.values());

        // Inserção em lotes de 500 para evitar limites de payload do Supabase
        const tamanhoLote = 500;
        for (let i = 0; i < registros.length; i += tamanhoLote) {
          const lote = registros.slice(i, i + tamanhoLote);
          const { error } = await supabase.from('cadastros_base_tiny').upsert(lote, { onConflict: 'sku' });
          if (error) throw error;
        }

        alert(`Base Tiny atualizada com sucesso! ${registros.length} SKUs únicos processados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadStatus = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const indiceSku = letraParaIndice(regrasTiny.status_sku);
    const indiceValor = letraParaIndice(regrasTiny.status_valor);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const { data: tinyData } = await supabase.from('cadastros_base_tiny').select('sku');
        const skusTinySet = new Set(tinyData?.map(t => t.sku) || []);

        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceValor)) continue;

          const sku = String(row[indiceSku] || "").trim();
          if (!skusTinySet.has(sku)) continue;

          let statusVal = String(row[indiceValor] || 'Normal').trim();
          if (/obsoleto|inativo|arquivo|descontinuado/i.test(statusVal)) statusVal = 'Obsoleto';
          else statusVal = 'Normal';

          mapaUnico.set(sku, { sku, status: statusVal });
        }
        const registros = Array.from(mapaUnico.values());

        const tamanhoLote = 500;
        for (let i = 0; i < registros.length; i += tamanhoLote) {
          const lote = registros.slice(i, i + tamanhoLote);
          const { error } = await supabase.from('status_skus_catalogo').upsert(lote, { onConflict: 'sku' });
          if (error) throw error;
        }

        alert(`Status atualizados com sucesso! ${registros.length} SKUs validados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadCanal = async (canalNome: string, letraColuna: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    const indiceColuna = letraParaIndice(letraColuna || "A");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const { data: tinyData } = await supabase.from('cadastros_base_tiny').select('sku');
        const skusTinySet = new Set(tinyData?.map(t => t.sku) || []);

        const skusNoCanal = new Set<string>();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= indiceColuna) continue;
          const skuVal = String(row[indiceColuna] || "").trim();
          if (skusTinySet.has(skuVal)) {
            skusNoCanal.add(skuVal);
          }
        }

        const registrosUpsert: any[] = [];
        skusTinySet.forEach(sku => {
          registrosUpsert.push({ canal: canalNome, sku: sku, presente: skusNoCanal.has(sku) });
        });

        const tamanhoLote = 500;
        for (let i = 0; i < registrosUpsert.length; i += tamanhoLote) {
          const lote = registrosUpsert.slice(i, i + tamanhoLote);
          const { error } = await supabase.from('mapeamento_canais_skus').upsert(lote, { onConflict: 'canal,sku' });
          if (error) throw error;
        }

        alert(`Canal "${canalNome}" sincronizado! ${skusNoCanal.size} SKUs mapeados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-5xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Abastecimento</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Relatórios e Mapeamento de Canais</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">Dashboard</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/upload">Upload & Canais</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/mapeamento">Mapeamento</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/regras">Regras</Link>
              <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">Admin</Link>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setAbaAtiva("relatorios")}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "relatorios" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            📊 Relatórios Mensais (ABC & Inventário)
          </button>
          <button
            onClick={() => setAbaAtiva("cadastros")}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "cadastros" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            🛒 Cadastros e Canais (11 Marketplaces)
          </button>
        </div>

        {abaAtiva === "relatorios" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <h2 className="text-lg font-bold mb-1 text-white">Relatórios Mensais</h2>
            <p className="text-xs text-slate-400 mb-6">Defina a competência e envie as planilhas mensais.</p>
            
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800/80 mb-6">
              <div className="mb-6 border-b border-slate-800 pb-6">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Competência</label>
                  <button onClick={limparDadosCompetencia} disabled={!mesReferencia || loadingDelete} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer">
                    {loadingDelete ? "A limpar..." : `🗑️ Limpar Base (${mesReferencia})`}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select className="border border-slate-700 rounded-xl p-3 bg-slate-900 text-xs text-white outline-none cursor-pointer" value={mes} onChange={(e) => setMes(e.target.value)}>
                    {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                  </select>
                  <select className="border border-slate-700 rounded-xl p-3 bg-slate-900 text-xs text-white outline-none cursor-pointer" value={ano} onChange={(e) => setAno(e.target.value)}>
                    {anos.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Curva ABC</label>
                  <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia} onChange={processarABC} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-lg file:bg-indigo-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" />
                  {ficheiroABC && <p className="mt-2 text-xs text-emerald-400 font-bold">✓ {ficheiroABC}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">Inventário</label>
                  <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia || dadosABC.length === 0} onChange={processarInventario} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-lg file:bg-indigo-600 file:text-white cursor-pointer bg-slate-900 p-3 rounded-xl border border-slate-700" />
                  {ficheiroInventario && <p className="mt-2 text-xs text-emerald-400 font-bold">✓ {ficheiroInventario}</p>}
                </div>
              </div>

              {(dadosABC.length > 0 || dadosInvBruto.length > 0) && (
                <div className="mt-6 pt-5 border-t border-slate-800 flex justify-end">
                  <button onClick={enviarParaBanco} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                    {loading ? "A gravar..." : "🚀 Gravar Dados no Supabase"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {abaAtiva === "cadastros" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total SKUs Tiny</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.totalTiny}</p>
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Normais</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.normais}</p>
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Obsoletos</span>
                <p className="text-3xl font-black text-white mt-2">{estatisticas.obsoletos}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
                <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Base Central (Tiny ERP)</h3>
                <p className="text-xs text-slate-400 mb-3">Lê todas as linhas (SKU: <strong>{regrasTiny.sku}</strong>, Estoque: <strong>{regrasTiny.estoque}</strong>).</p>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadTiny} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
                <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Status (Normal / Obsoleto)</h3>
                <p className="text-xs text-slate-400 mb-3">Lê todas as linhas (SKU: <strong>{regrasTiny.status_sku}</strong>, Status: <strong>{regrasTiny.status_valor}</strong>).</p>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadStatus} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-violet-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>
            </div>

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-2 text-white">Progresso de Cadastros por Canal</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-4">
                {progressoCanais.map((p, idx) => {
                  const regraCanal = regrasCanais.find(r => r.canal === p.canal);
                  const letraColunaConfigurada = regraCanal ? regraCanal.coluna_sku : 'A';
                  return (
                    <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-white text-sm">{p.canal}</span>
                          <span className="text-xs font-mono font-bold text-indigo-400">{p.percentual}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-3">
                          <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${Math.min(Number(p.percentual), 100)}%` }}></div>
                        </div>
                        <p className="text-[11px] text-slate-400"><strong>{p.cadastrados}</strong> de <strong>{p.total}</strong> SKUs (Coluna: {letraColunaConfigurada})</p>
                      </div>
                      <input type="file" accept=".xlsx, .xls, .csv" onChange={(e) => handleUploadCanal(p.canal, letraColunaConfigurada, e)} className="block w-full text-[10px] text-slate-400 file:py-1.5 file:px-3 file:rounded-lg file:bg-slate-800 file:text-slate-200 cursor-pointer bg-slate-900 p-1.5 rounded-lg border border-slate-800" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}