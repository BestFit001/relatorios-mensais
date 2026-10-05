"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

export default function Dashboard() {
  const [competencia, setCompetencia] = useState("09/2026");
  const [competenciaAnterior, setCompetenciaAnterior] = useState(""); // Opcional
  const [dadosConsolidados, setDadosConsolidados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const carregarDados = async () => {
    setLoading(true);

    // 1. Busca dados da Curva ABC do mês atual
    const { data: abcAtual, error } = await supabase
      .from('curva_abc')
      .select('*')
      .eq('mes_referencia', competencia);

    if (error) {
      console.error("Erro ao carregar Supabase:", error.message);
    }

    // 2. Busca dados de Inventário do mês atual
    const { data: inventario } = await supabase
      .from('inventario')
      .select('*')
      .eq('mes_referencia', competencia);

    // 3. Busca Curva ABC anterior apenas se preenchido (opcional)
    let abcAnterior: any[] = [];
    if (competenciaAnterior.trim() !== "") {
      const { data: antData } = await supabase
        .from('curva_abc')
        .select('*')
        .eq('mes_referencia', competenciaAnterior);
      if (antData) abcAnterior = antData;
    }

    if (!abcAtual || abcAtual.length === 0) {
      setDadosConsolidados([]);
      setLoading(false);
      return;
    }

    // 4. Cruzamento e Montagem das Colunas (A até G + Estoque Cruzado)
    const resultado = abcAtual.map((item: any, index: number) => {
      const invMatch = inventario?.find(
        (inv: any) => String(inv.codigo_sku || "").trim() === String(item.codigo || "").trim()
      );
      const saldoEstoque = invMatch ? Number(invMatch.saldo || 0) : 0;

      let variacaoPercentual: number | null = null;
      if (competenciaAnterior.trim() !== "") {
        const anteriorMatch = abcAnterior.find(
          (ant: any) => String(ant.codigo || "").trim() === String(item.codigo || "").trim()
        );
        const qtdAnterior = anteriorMatch ? Number(anteriorMatch.quantidade || 0) : 0;
        const qtdAtual = Number(item.quantidade || 0);

        if (qtdAnterior > 0) {
          variacaoPercentual = ((qtdAtual - qtdAnterior) / qtdAnterior) * 100;
        } else if (qtdAtual > 0) {
          variacaoPercentual = 100;
        } else {
          variacaoPercentual = 0;
        }
      }

      return {
        id: item.id || index + 1,
        produto: item.produto || "",
        codigo: item.codigo || "",
        gtin: invMatch ? invMatch.gtin_ean : "-",
        localizacao: "-",
        saldoEstoque: saldoEstoque,
        vendas: Number(item.quantidade || 0),
        valor: Number(item.valor || 0),
        porcentagemIndividual: Number(item.porcentagem_individual || 0),
        porcentagemAcumulada: Number(item.porcentagem_acumulada || 0),
        classificacao: item.classificacao || "C",
        variacao: variacaoPercentual
      };
    });

    setDadosConsolidados(resultado);
    setLoading(false);
  };

  useEffect(() => {
    carregarDados();
  }, [competencia, competenciaAnterior]);

  const baixarExcel = () => {
    if (dadosConsolidados.length === 0) {
      alert("Sem dados para exportar.");
      return;
    }

    const dadosExportar = dadosConsolidados.map(d => ({
      "ID": d.id,
      "Produto": d.produto,
      "Código (SKU)": d.codigo,
      "GTIN/EAN": d.gtin,
      "Localização": d.localizacao,
      "Saldo em estoque": d.saldoEstoque,
      "Vendas": d.vendas,
      "Valor": d.valor,
      "% Individual": d.porcentagemIndividual,
      "% Acumulado": d.porcentagemAcumulada,
      "Classificação": d.classificacao,
      ...(competenciaAnterior ? { "Variação vs Mês Anterior": `${d.variacao! > 0 ? '+' : ''}${d.variacao?.toFixed(1)}%` } : {})
    }));

    const worksheet = XLSX.utils.json_to_sheet(dadosExportar);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Curva ABC Consolidada");
    XLSX.writeFile(workbook, `CurvaABC_${competencia.replace('/', '-')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Painel de Performance - Curva ABC</h1>

        <div className="flex space-x-6 border-b border-gray-300 pb-2 mb-6">
          <Link href="/" className="px-4 py-2 font-semibold text-lg border-b-4 border-blue-600 text-blue-600">
            Curva ABC & Histórico
          </Link>
          <Link href="/upload" className="px-4 py-2 font-semibold text-lg text-gray-500 hover:text-blue-500 transition-colors">
            Upload de Planilhas
          </Link>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Mês Atual (Competência):</label>
              <input 
                type="text" 
                value={competencia} 
                onChange={(e) => setCompetencia(e.target.value)} 
                placeholder="MM/AAAA"
                className="border border-gray-300 rounded-md p-2 w-28 text-center font-semibold text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Mês Comparativo (Opcional):</label>
              <input 
                type="text" 
                value={competenciaAnterior} 
                onChange={(e) => setCompetenciaAnterior(e.target.value)} 
                placeholder="Ex: 08/2026"
                className="border border-gray-300 rounded-md p-2 w-32 text-center font-semibold text-sm bg-white"
              />
            </div>
          </div>

          <button
            onClick={baixarExcel}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg shadow transition-colors text-sm cursor-pointer flex items-center gap-2"
          >
            📥 Baixar Relatório Excel
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="p-6 text-center text-gray-500">Carregando e cruzando dados em nuvem...</p>
          ) : dadosConsolidados.length === 0 ? (
            <p className="p-6 text-center text-gray-500">Nenhum registo encontrado para a competência {competencia}. Vá na aba "Upload de Planilhas" para abastecer a base.</p>
          ) : (
            <div className="overflow-x-auto max-h-[650px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-gray-100 sticky top-0 border-b border-gray-200 uppercase text-gray-700 font-semibold">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Código (SKU)</th>
                    <th className="p-3">GTIN/EAN</th>
                    <th className="p-3 text-center">Classificação</th>
                    <th className="p-3 text-right">Vendas</th>
                    <th className="p-3 text-right">Valor (R$)</th>
                    <th className="p-3 text-right">Saldo Estoque</th>
                    {competenciaAnterior && <th className="p-3 text-center">Crescimento / Queda</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {dadosConsolidados.map((d, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-500">{d.id}</td>
                      <td className="p-3 font-medium text-gray-900">{d.produto}</td>
                      <td className="p-3 font-mono text-gray-700">{d.codigo}</td>
                      <td className="p-3 font-mono text-gray-600">{d.gtin}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          d.classificacao === 'A' ? 'bg-red-100 text-red-700' :
                          d.classificacao === 'B' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {d.classificacao}
                        </span>
                      </td>
                      <td className="p-3 text-right font-semibold">{d.vendas}</td>
                      <td className="p-3 text-right">R$ {d.valor.toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-blue-600">{d.saldoEstoque}</td>
                      {competenciaAnterior && (
                        <td className="p-3 text-center font-bold">
                          {d.variacao === 0 ? (
                            <span className="text-gray-400">0.0%</span>
                          ) : d.variacao! > 0 ? (
                            <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                              +{d.variacao?.toFixed(1)}% 📈
                            </span>
                          ) : (
                            <span className="text-red-600 bg-red-50 px-2 py-1 rounded">
                              {d.variacao?.toFixed(1)}% 📉
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}