"use client";
import { useState, ChangeEvent } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function UploadPage() {
  const [mes, setMes] = useState("09");
  const [ano, setAno] = useState("2026");
  const [ficheiroABC, setFicheiroABC] = useState("");
  const [ficheiroInventario, setFicheiroInventario] = useState("");
  
  const [dadosABC, setDadosABC] = useState<any[]>([]);
  const [dadosInvBruto, setDadosInvBruto] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

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

  // Leitura robusta da Curva ABC (mapeando por índices e chaves flexíveis)
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
        
        // Identifica onde estão os dados (procurando a linha de cabeçalho ou lendo a partir da linha 1 ou 2)
        const formatado = [];
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          // Se a linha tem código válido (ex: SKU numérico ou texto consistente)
          if (row && row[0] && String(row[0]).trim() !== "" && String(row[0]).toLowerCase() !== "código" && String(row[0]).toLowerCase() !== "id") {
            formatado.push({
              mes_referencia: mesReferencia,
              codigo: String(row[0] || "").trim(),
              produto: String(row[1] || "").trim(),
              quantidade: Number(row[2] || 0),
              valor: Number(row[3] || 0),
              porcentagem_individual: Number(row[4] || 0),
              porcentagem_acumulada: Number(row[5] || 0),
              classificacao: String(row[6] || "C").trim().toUpperCase()
            });
          }
        }

        setDadosABC(formatado);
        alert(`Curva ABC processada com sucesso: ${formatado.length} SKUs identificados.`);
      } catch (err: any) {
        alert("Erro ao ler Curva ABC: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Leitura robusta do Inventário
  const processarInventario = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroInventario(file.name);

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
          // No inventário, geralmente o SKU está na coluna C (índice 2) ou A (índice 0) e o saldo na F (índice 5) ou última
          const sku = String(row[2] || row[0] || "").trim();
          const saldo = Number(row[5] || row[1] || row[row.length - 1] || 0);

          if (sku && sku.toLowerCase() !== "código (sku)" && sku.toLowerCase() !== "código" && !isNaN(saldo)) {
            formatado.push({
              mes_referencia: mesReferencia,
              codigo_sku: sku,
              saldo: saldo
            });
          }
        }

        setDadosInvBruto(formatado);
        alert(`Inventário processado com sucesso: ${formatado.length} registos identificados.`);
      } catch (err: any) {
        alert("Erro ao ler Inventário: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const enviarParaBanco = async () => {
    if (dadosABC.length === 0) {
      alert("Por favor, selecione e processe primeiro a planilha de Curva ABC.");
      return;
    }

    setLoading(true);

    // Limpa dados antigos da competência antes de inserir novos para evitar duplicados
    await supabase.from('curva_abc').delete().eq('mes_referencia', mesReferencia);
    await supabase.from('inventario').delete().eq('mes_referencia', mesReferencia);

    // 1. Insere Curva ABC
    const { error: errAbc } = await supabase.from('curva_abc').insert(dadosABC);
    if (errAbc) {
      alert("Erro ao gravar Curva ABC: " + errAbc.message);
      setLoading(false);
      return;
    }

    // 2. Filtra inventário apenas para os SKUs presentes na Curva ABC
    const skusPermitidos = new Set(dadosABC.map(item => item.codigo));
    const inventarioFiltrado = dadosInvBruto.filter(inv => skusPermitidos.has(inv.codigo_sku));

    if (inventarioFiltrado.length > 0) {
      const { error: errInv } = await supabase.from('inventario').insert(inventarioFiltrado);
      if (errInv) {
        alert("Erro ao gravar Inventário: " + errInv.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    alert(`🚀 Sucesso! ${dadosABC.length} SKUs da Curva ABC e ${inventarioFiltrado.length} registos de inventário guardados no Supabase.`);
    
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

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Relatórios mensais - Best Fit</h1>

        <div className="flex space-x-6 border-b border-gray-300 pb-2 mb-6">
          <Link className="px-4 py-2 font-semibold text-lg text-gray-500 hover:text-blue-500 transition-colors" href="/">
            Curva ABC & Histórico
          </Link>
          <Link className="px-4 py-2 font-semibold text-lg border-b-4 border-blue-600 text-blue-600" href="/upload">
            Upload de Planilhas
          </Link>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-3xl">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Abastecimento do Banco de Dados</h2>
          <p className="text-gray-500 mb-8">Defina a competência, envie os ficheiros e grave no Supabase com leitura otimizada por linhas.</p>
          
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
            
            <div className="mb-8 border-b border-gray-200 pb-6">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-bold text-gray-700">1. Competência (Mês e Ano)</label>
                <button
                  onClick={limparDadosCompetencia}
                  disabled={!mesReferencia || loadingDelete}
                  className="bg-red-50 text-red-600 border border-red-200 text-xs font-bold py-1.5 px-3 rounded-md cursor-pointer"
                >
                  {loadingDelete ? "Limpando..." : `🗑️ Limpar Base (${mesReferencia})`}
                </button>
              </div>

              <div className="flex space-x-4">
                <select className="w-1/2 border border-gray-300 rounded-md p-2.5 bg-white" value={mes} onChange={(e) => setMes(e.target.value)}>
                  <option value="">Mês...</option>
                  {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                </select>
                <select className="w-1/2 border border-gray-300 rounded-md p-2.5 bg-white" value={ano} onChange={(e) => setAno(e.target.value)}>
                  <option value="">Ano...</option>
                  {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">2. Planilha Curva ABC</label>
                <div className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center ${mesReferencia ? 'border-blue-400 bg-blue-50/50' : 'border-gray-300 bg-gray-100 opacity-60'}`}>
                  <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia} onChange={processarABC} className="block w-full text-xs text-gray-500 file:mr-2 file:py-2 file:px-3 file:rounded-md file:border-0 file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer" />
                  {ficheiroABC && <p className="mt-2 text-xs text-green-600 font-semibold">{ficheiroABC}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">3. Planilha de Inventário</label>
                <div className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center ${mesReferencia ? 'border-blue-400 bg-blue-50/50' : 'border-gray-300 bg-gray-100 opacity-60'}`}>
                  <input type="file" accept=".xls,.xlsx" disabled={!mesReferencia} onChange={processarInventario} className="block w-full text-xs text-gray-500 file:mr-2 file:py-2 file:px-3 file:rounded-md file:border-0 file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer" />
                  {ficheiroInventario && <p className="mt-2 text-xs text-green-600 font-semibold">{ficheiroInventario}</p>}
                </div>
              </div>
            </div>

            {(dadosABC.length > 0 || dadosInvBruto.length > 0) && (
              <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
                <button 
                  onClick={enviarParaBanco} 
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-colors cursor-pointer"
                >
                  {loading ? "A gravar..." : "Gravar Dados no Supabase"}
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}