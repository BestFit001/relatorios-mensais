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
  const [regrasTiny, setRegrasTiny] = useState({ sku: 'C', estoque: 'F', status_sku: 'A', status_valor: 'B' });
  const [estatisticas, setEstatisticas] = useState({ totalTiny: 0, normais: 0, obsoletos: 0 });

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
      const cfgSku = tinyConfig.find(t => t.campo === 'sku')?.coluna || 'C';
      const cfgEstoque = tinyConfig.find(t => t.campo === 'estoque')?.coluna || 'F';
      const cfgStatusSku = tinyConfig.find(t => t.campo === 'status_sku')?.coluna || 'A';
      const cfgStatusValor = tinyConfig.find(t => t.campo === 'status_valor')?.coluna || 'B';
      setRegrasTiny({ sku: cfgSku, estoque: cfgEstoque, status_sku: cfgStatusSku, status_valor: cfgStatusValor });
    }

    let allTiny: any[] = [];
    let rangeStep = 1000;
    let from = 0;
    let keepFetching = true;
    while (keepFetching) {
      const { data } = await supabase.from('cadastros_base_tiny').select('sku, estoque').range(from, from + rangeStep - 1);
      if (data && data.length > 0) {
        allTiny = [...allTiny, ...data];
        from += rangeStep;
        if (data.length < rangeStep) keepFetching = false;
      } else {
        keepFetching = false;
      }
    }

    const { data: statusData } = await supabase.from('status_skus_catalogo').select('sku, status');
    const totalTiny = allTiny.length;
    const mapaStatus = new Map(statusData?.map(s => [String(s.sku).trim(), s.status]) || []);

    let normais = 0;
    let obsoletos = 0;
    allTiny.forEach(item => {
      const st = mapaStatus.get(String(item.sku).trim()) || 'Normal';
      if (st === 'Obsoleto') obsoletos++;
      else normais++;
    });

    setEstatisticas({ totalTiny, normais, obsoletos });
  };

  const letraParaIndice = (str: string) => {
    let base = str.toUpperCase().trim();
    let coluna = 0;
    for (let i = 0; i < base.length; i++) {
      coluna = coluna * 26 + (base.charCodeAt(i) - 64);
    }
    return coluna - 1;
  };

  const normalizarSku = (valor: any) => {
    if (valor === null || valor === undefined) return "";
    let s = String(valor).trim();
    if (s.endsWith(".0")) {
      s = s.substring(0, s.length - 2);
    }
    // Remove aspas extras se vierem do Excel em formato texto
    s = s.replace(/^["']|["']$/g, "").trim();
    return s;
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
          const codigo = normalizarSku(row[1]);
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
            const val = normalizarSku(row[col]);
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

  const limparBaseTiny = async () => {
    if (!confirm("Tem certeza que deseja apagar toda a base do Tiny ERP?")) return;
    const { error } = await supabase.from('cadastros_base_tiny').delete().neq('id', 0);
    if (error) alert("Erro: " + error.message);
    else {
      alert("Base Tiny limpa com sucesso!");
      carregarDadosCadastros();
    }
  };

  const limparCanal = async (canalNome: string) => {
    if (!confirm(`Tem certeza que deseja apagar todo o mapeamento do canal "${canalNome}"?`)) return;
    const { error } = await supabase.from('mapeamento_canais_skus').delete().eq('canal', canalNome);
    if (error) alert("Erro: " + error.message);
    else alert(`Canal "${canalNome}" limpo com sucesso!`);
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
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceEstoque)) continue;

          const sku = normalizarSku(row[indiceSku]);
          const estoque = Number(row[indiceEstoque] || 0);

          if (sku && !/sku|código|codigo/i.test(sku)) {
            mapaUnico.set(sku, { sku, estoque: isNaN(estoque) ? 0 : estoque });
          }
        }
        const registros = Array.from(mapaUnico.values());

        const tamanhoLote = 500;
        for (let i = 0; i < registros.length; i += tamanhoLote) {
          const lote = registros.slice(i, i + tamanhoLote);
          const { error } = await supabase.from('cadastros_base_tiny').upsert(lote, { onConflict: 'sku' });
          if (error) throw error;
        }

        alert(`Base Tiny atualizada com sucesso! ${registros.length} SKUs processados.`);
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
        const workbook = XLSX.read(data, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        let allTiny: any[] = [];
        let rangeStep = 1000;
        let from = 0;
        let keepFetching = true;
        while (keepFetching) {
          const { data } = await supabase.from('cadastros_base_tiny').select('sku').range(from, from + rangeStep - 1);
          if (data && data.length > 0) {
            allTiny = [...allTiny, ...data];
            from += rangeStep;
            if (data.length < rangeStep) keepFetching = false;
          } else {
            keepFetching = false;
          }
        }
        const skusTinySet = new Set(allTiny.map(t => normalizarSku(t.sku)));

        const mapaUnico = new Map();
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= Math.max(indiceSku, indiceValor)) continue;

          const sku = normalizarSku(row[indiceSku]);
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

  // Suporte a múltiplos arquivos em simultâneo para canais como o TikTok
  const handleUploadCanalMultiplos = async (canalNome: string, letraColuna: string, e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoading(true);

    const indiceColuna = letraParaIndice(letraColuna || "A");

    try {
      // 1. Buscar todos os SKUs do Tiny
      let allTiny: any[] = [];
      let rangeStep = 1000;
      let from = 0;
      let keepFetching = true;
      while (keepFetching) {
        const { data: tinyBatch } = await supabase.from('cadastros_base_tiny').select('sku').range(from, from + rangeStep - 1);
        if (tinyBatch && tinyBatch.length > 0) {
          allTiny = [...allTiny, ...tinyBatch];
          from += rangeStep;
          if (tinyBatch.length < rangeStep) keepFetching = false;
        } else {
          keepFetching = false;
        }
      }
      const skusTinySet = new Set(allTiny.map(t => normalizarSku(t.sku)));

      const skusNoCanalTotal = new Set<string>();

      // 2. Iterar por cada ficheiro selecionado
      for (let f = 0; f < files.length; f++) {
        const file = files[f];
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true, raw: false });

        let sheetName = workbook.SheetNames[0];
        if (workbook.SheetNames.includes("Template")) sheetName = "Template";
        else if (workbook.SheetNames.includes("Anúncios")) sheetName = "Anúncios";

        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        let linhaInicio = 0;
        for (let i = 0; i < Math.min(json.length, 15); i++) {
          const row = json[i];
          if (row && row.some((cell: any) => {
            const val = String(cell).trim().toLowerCase();
            return val === 'seller_sku' || val === 'sku' || val === 'sku_id';
          })) {
            linhaInicio = i + 1;
            break;
          }
        }
        if (linhaInicio === 0 || linhaInicio < 5) linhaInicio = 5;

        for (let i = linhaInicio; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length <= indiceColuna) continue;
          
          const skuVal = normalizarSku(row[indiceColuna]);
          if (skusTinySet.has(skuVal)) {
            skusNoCanalTotal.add(skuVal);
          }
        }
      }

      // 3. Registar o mapeamento no Supabase em lote
      const registrosUpsert: any[] = [];
      skusTinySet.forEach(sku => {
        registrosUpsert.push({ canal: canalNome, sku: sku, presente: skusNoCanalTotal.has(sku) });
      });

      const tamanhoLote = 500;
      for (let i = 0; i < registrosUpsert.length; i += tamanhoLote) {
        const lote = registrosUpsert.slice(i, i + tamanhoLote);
        const { error } = await supabase.from('mapeamento_canais_skus').upsert(lote, { onConflict: 'canal,sku' });
        if (error) throw error;
      }

      alert(`Canal "${canalNome}" sincronizado com sucesso (${files.length} ficheiro(s))! ${skusNoCanalTotal.size} SKUs cruzados.`);
      setLoading(false);
    } catch (err: any) {
      alert("Erro ao processar ficheiros: " + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-5xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Abastecimento</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Relatórios e Uploads</p>
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
            🛒 Cadastros e Canais (Uploads em Massa)
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
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Base Central (Tiny ERP)</h3>
                    <button onClick={limparBaseTiny} className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[10px] font-bold py-1 px-2.5 rounded-lg cursor-pointer">
                      🗑️ Limpar Base Tiny
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Lê linhas (SKU: <strong>{regrasTiny.sku}</strong>, Estoque: <strong>{regrasTiny.estoque}</strong>).</p>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadTiny} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-indigo-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>

              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Status (Normal / Obsoleto)</h3>
                  <p className="text-xs text-slate-400 mb-3">Lê linhas (SKU: <strong>{regrasTiny.status_sku}</strong>, Status: <strong>{regrasTiny.status_valor}</strong>).</p>
                </div>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleUploadStatus} className="block w-full text-xs text-slate-400 file:py-2 file:px-4 file:rounded-xl file:bg-violet-600 file:text-white cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              </div>
            </div>

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-2 text-white">Upload e Gestão Individual dos Canais</h2>
              <p className="text-xs text-slate-400 mb-6">Atualize ou limpe o mapeamento de cada marketplace. Pode selecionar <strong>múltiplos ficheiros</strong> em simultâneo caso o canal tenha várias planilhas.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {regrasCanais.map((r, idx) => (
                  <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-4">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">{r.canal}</span>
                      <button onClick={() => limparCanal(r.canal)} className="text-rose-400 hover:text-rose-300 text-[10px] font-bold bg-rose-950/40 border border-rose-900/50 px-2 py-0.5 rounded cursor-pointer">
                        🗑️ Limpar Canal
                      </button>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Atualizar canal (Coluna: {r.coluna_sku}):</label>
                      <input 
                        type="file" 
                        multiple 
                        accept=".xlsx, .xls, .csv" 
                        onChange={(e) => handleUploadCanalMultiplos(r.canal, r.coluna_sku, e)}
                        className="block w-full text-[10px] text-slate-400 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:font-bold file:bg-slate-800 file:text-slate-200 cursor-pointer bg-slate-900 p-1 rounded-lg border border-slate-800"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}