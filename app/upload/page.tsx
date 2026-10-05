"use client";
import { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function UploadPage() {
  // Aba ativa interna ("relatorios" ou "cadastros")
  const [abaAtiva, setAbaAtiva] = useState<"relatorios" | "cadastros">("relatorios");

  // Estados dos Relatórios Mensais
  const [mes, setMes] = useState("09");
  const [ano, setAno] = useState("2026");
  const [ficheiroABC, setFicheiroABC] = useState("");
  const [ficheiroInventario, setFicheiroInventario] = useState("");
  const [dadosABC, setDadosABC] = useState<any[]>([]);
  const [dadosInvBruto, setDadosInvBruto] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  // Estados da Gestão de Cadastros e Canais
  const [regrasCanais, setRegrasCanais] = useState<any[]>([]);
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

  // Funções de Relatórios Mensais
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

          const produtoLower = produto.toLowerCase();
          const codigoLower = codigo.toLowerCase();

          if (
            codigo && 
            codigo !== "" && 
            !codigoLower.includes("código") && 
            !codigoLower.includes("id") &&
            !produtoLower.includes("produto") &&
            !isNaN(quantidade)
          ) {
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
        alert(`Curva ABC processada com sucesso: ${formatado.length} produtos válidos identificados.`);
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
      alert("Por favor, faça o upload e processe primeiro a planilha de Curva ABC.");
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
            const saldoVal = Number(row[row.length - 1] ?? row[1] ?? row[5] ?? 0);
            if (!isNaN(saldoVal)) saldoEstoque = saldoVal;

            formatado.push({
              mes_referencia: mesReferencia,
              codigo_sku: skuEncontrado,
              saldo: saldoEstoque
            });
          }
        }

        setDadosInvBruto(formatado);
        alert(`Inventário processado: ${formatado.length} SKUs correspondentes à Curva ABC foram identificados.`);
      } catch (err: any) {
        alert("Erro ao ler Inventário: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const enviarParaBanco = async () => {
    if (dadosABC.length === 0) {
      alert("Nenhum dado da Curva ABC carregado.");
      return;
    }

    setLoading(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);

    const { error: errAbc } = await supabase.from('curva_abc').insert(dadosABC);
    if (errAbc) {
      alert("Erro ao gravar Curva ABC: " + errAbc.message);
      setLoading(false);
      return;
    }

    if (dadosInvBruto.length > 0) {
      const { error: errInv } = await supabase.from('inventario').insert(dadosInvBruto);
      if (errInv) {
        alert("Erro ao gravar Inventário: " + errInv.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    alert(`🚀 Sucesso! ${dadosABC.length} SKUs da Curva ABC e ${dadosInvBruto.length} registos de inventário guardados no Supabase.`);
    setFicheiroABC("");
    setFicheiroInventario("");
    setDadosABC([]);
    setDadosInvBruto([]);
  };

  const limparDadosCompetencia = async () => {
    if (!mesReferencia) return;
    setLoadingDelete(true);
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);
    setLoadingDelete(false);
    alert(`🗑 Dados da competência ${mesReferencia} limpos.`);
  };

  // Funções de Cadastros e Canais (Regra de Ouro: Validados estritamente pelo Tiny)
  const handleUploadTiny = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        const registros = data.map(row => {
          const skuKey = Object.keys(row).find(k => /sku|código|codigo/i.test(k));
          const estoqueKey = Object.keys(row).find(k => /estoque|saldo|qtde|quantidade/i.test(k));
          if (!skuKey) return null;
          return {
            sku: String(row[skuKey]).trim(),
            estoque: estoqueKey ? Number(row[estoqueKey]) || 0 : 0
          };
        }).filter(Boolean);

        const { error } = await supabase.from('cadastros_base_tiny').upsert(registros, { onConflict: 'sku' });
        if (error) throw error;

        alert(`Base Tiny atualizada com sucesso! ${registros.length} SKUs processados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro ao processar planilha do Tiny: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUploadStatus = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        const { data: tinyData } = await supabase.from('cadastros_base_tiny').select('sku');
        const skusTinySet = new Set(tinyData?.map(t => t.sku) || []);

        const registros = data.map(row => {
          const skuKey = Object.keys(row).find(k => /sku|código|codigo/i.test(k));
          const statusKey = Object.keys(row).find(k => /status|tipo|condicao|situação/i.test(k));
          if (!skuKey) return null;
          const sku = String(row[skuKey]).trim();
          
          if (!skusTinySet.has(sku)) return null; // Ignora se não estiver no Tiny

          let statusVal = statusKey ? String(row[statusKey]).trim() : 'Normal';
          if (/obsoleto|inativo|arquivo|descontinuado/i.test(statusVal)) {
            statusVal = 'Obsoleto';
          } else {
            statusVal = 'Normal';
          }

          return { sku, status: statusVal };
        }).filter(Boolean);

        const { error } = await supabase.from('status_skus_catalogo').upsert(registros, { onConflict: 'sku' });
        if (error) throw error;

        alert(`Status atualizados com sucesso! ${registros.length} SKUs validados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro ao processar status: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUploadCanal = async (canalNome: string, colunaConfigurada: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        const { data: tinyData } = await supabase.from('cadastros_base_tiny').select('sku');
        const skusTinySet = new Set(tinyData?.map(t => t.sku) || []);

        const skusNoCanal = new Set<string>();
        data.forEach(row => {
          const colKey = Object.keys(row).find(k => 
            k.trim().toLowerCase() === colunaConfigurada.trim().toLowerCase() ||
            /sku|código|codigo/i.test(k)
          );
          if (colKey && row[colKey]) {
            const skuVal = String(row[colKey]).trim();
            if (skusTinySet.has(skuVal)) {
              skusNoCanal.add(skuVal);
            }
          }
        });

        const registrosUpsert: any[] = [];
        skusTinySet.forEach(sku => {
          registrosUpsert.push({
            canal: canalNome,
            sku: sku,
            presente: skusNoCanal.has(sku)
          });
        });

        const { error } = await supabase.from('mapeamento_canais_skus').upsert(registrosUpsert, { onConflict: 'canal,sku' });
        if (error) throw error;

        alert(`Canal "${canalNome}" sincronizado com sucesso! ${skusNoCanal.size} SKUs mapeados.`);
        setLoading(false);
        carregarDadosCadastros();
      } catch (err: any) {
        alert("Erro ao processar canal: " + err.message);
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Central de Uploads</h1>
            <p className="text-sm font-medium text-slate-400">Abastecimento de Relatórios e Mapeamento de Canais</p>
          </div>

          <div className="flex items-center bg-slate-900 p-1.5 rounded-xl border border-slate-800">
            <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/">
              Dashboard
            </Link>
            <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-indigo-600 text-white shadow-sm transition-all" href="/upload">
              Upload
            </Link>
            <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/regras">
              Regras
            </Link>
            <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-all" href="/admin">
              Admin
            </Link>
          </div>
        </div>

        {/* ABAS INTERNAS */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setAbaAtiva("relatorios")}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "relatorios" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            📊 Relatórios Mensais (Curva ABC & Inventário)
          </button>
          <button
            onClick={() => setAbaAtiva("cadastros")}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              abaAtiva === "cadastros" ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            🛒 Cadastros e Canais (11 Marketplaces)
          </button>
        </div>

        {/* CONTEÚDO DA ABA: RELATÓRIOS MENSAIS */}
        {abaAtiva === "relatorios" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
            <h2 className="text-lg font-bold mb-1 text-white">Abastecimento de Relatórios Mensais</h2>
            <p className="text-xs text-slate-400 mb-6">Defina a competência, envie os ficheiros e grave no Supabase de forma integrada.</p>
            
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800/80 mb-6">
              <div className="mb-6 border-b border-slate-800 pb-6">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">1. Competência (Mês e Ano)</label>
                  <button
                    onClick={limparDadosCompetencia}
                    disabled={!mesReferencia || loadingDelete}
                    className="bg-rose-950/60 text-rose-400 border border-rose-900/50 text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer hover:bg-rose-900/60 transition-all"
                  >
                    {loadingDelete ? "A limpar..." : `🗑️ Limpar Base (${mesReferencia})`}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <select className="border border-slate-700 rounded-xl p-3 bg-slate-900 text-xs font-semibold text-white outline-none focus:border-indigo-500 cursor-pointer" value={mes} onChange={(e) => setMes(e.target.value)}>
                    <option value="">Selecione o mês...</option>
                    {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                  </select>
                  <select className="border border-slate-700 rounded-xl p-3 bg-slate-900 text-xs font-semibold text-white outline-none focus:border-indigo-500 cursor-pointer" value={ano} onChange={(e) => setAno(e.target.value)}>
                    <option value="">Selecione o ano...</option>
                    {anos.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">2. Planilha Curva ABC (Carregar 1º)</label>
                  <div className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center transition-all ${mesReferencia ? 'border-indigo-500/50 bg-indigo-950/20' : 'border-slate-800 bg-slate-900/50 opacity-50'}`}>
                    <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia} onChange={processarABC} className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer" />
                    {ficheiroABC && <p className="mt-3 text-xs text-emerald-400 font-bold">✓ {ficheiroABC}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">3. Planilha de Inventário (Carregar 2º)</label>
                  <div className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center transition-all ${mesReferencia && dadosABC.length > 0 ? 'border-indigo-500/50 bg-indigo-950/20' : 'border-slate-800 bg-slate-900/50 opacity-50'}`}>
                    <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia || dadosABC.length === 0} onChange={processarInventario} className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer" />
                    {ficheiroInventario && <p className="mt-3 text-xs text-emerald-400 font-bold">✓ {ficheiroInventario}</p>}
                  </div>
                </div>
              </div>

              {(dadosABC.length > 0 || dadosInvBruto.length > 0) && (
                <div className="mt-6 pt-5 border-t border-slate-800 flex justify-end">
                  <button 
                    onClick={enviarParaBanco} 
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all text-xs uppercase tracking-wider cursor-pointer"
                  >
                    {loading ? "A gravar dados..." : "🚀 Gravar Dados no Supabase"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTEÚDO DA ABA: CADASTROS E CANAIS */}
        {abaAtiva === "cadastros" && (
          <div className="space-y-6">
            
            {/* CARDS DE RESUMO */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total SKUs no Tiny ERP</span>
                <p className="text-3xl font-black text-white tracking-tight mt-2">{estatisticas.totalTiny}</p>
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">SKUs Normais (Ativos)</span>
                <p className="text-3xl font-black text-white tracking-tight mt-2">{estatisticas.normais}</p>
              </div>
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-lg">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">SKUs Obsoletos</span>
                <p className="text-3xl font-black text-white tracking-tight mt-2">{estatisticas.obsoletos}</p>
              </div>
            </div>

            {/* UPLOADS CENTRAIS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
                <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">1. Base Central (Tiny ERP)</h3>
                <p className="text-xs text-slate-400 mb-4">Upe a planilha de SKUs e Estoques oficiais. Valida toda a base.</p>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleUploadTiny}
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700"
                />
              </div>

              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
                <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">2. Status dos SKUs (Normal / Obsoleto)</h3>
                <p className="text-xs text-slate-400 mb-4">Upe a planilha de classificação (filtrada estritamente pelo Tiny).</p>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleUploadStatus}
                  className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-violet-600 file:text-white hover:file:bg-violet-500 cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700"
                />
              </div>
            </div>

            {/* PROGRESSO DOS 11 CANAIS */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold mb-2 text-white">3. Progresso de Cadastros por Canal</h2>
              <p className="text-xs text-slate-400 mb-6">
                Importe a planilha de cada canal. As colunas de leitura seguem as regras configuradas na aba <Link href="/regras" className="text-indigo-400 underline">Regras</Link>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {progressoCanais.map((p, idx) => {
                  const regraCanal = regrasCanais.find(r => r.canal === p.canal);
                  const colunaSkuUsada = regraCanal ? regraCanal.coluna_sku : 'SKU';

                  return (
                    <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-white text-sm">{p.canal}</span>
                          <span className="text-xs font-mono font-bold text-indigo-400">{p.percentual}%</span>
                        </div>
                        
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-3">
                          <div 
                            className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${Math.min(Number(p.percentual), 100)}%` }}
                          ></div>
                        </div>

                        <p className="text-[11px] text-slate-400">
                          <strong className="text-slate-200">{p.cadastrados}</strong> de <strong className="text-slate-200">{p.total}</strong> SKUs
                        </p>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Atualizar canal:</label>
                        <input 
                          type="file" 
                          accept=".xlsx, .xls, .csv" 
                          onChange={(e) => handleUploadCanal(p.canal, colunaSkuUsada, e)}
                          className="block w-full text-[10px] text-slate-400 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:font-bold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer bg-slate-900 p-1.5 rounded-lg border border-slate-800"
                        />
                      </div>
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