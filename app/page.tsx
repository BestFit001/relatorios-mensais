"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const [competencia, setCompetencia] = useState("09/2026"); // Competência de exemplo
  const [dadosCruzados, setDadosCruzados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const buscarDados = async () => {
    setLoading(true);

    // 1. Busca dados da Curva ABC para a competência selecionada
    const { data: abc, error: errAbc } = await supabase
      .from('curva_abc')
      .select('*')
      .eq('mes_referencia', competencia);

    // 2. Busca dados do Inventário para a mesma competência
    const { data: inv, error: errInv } = await supabase
      .from('inventario')
      .select('*')
      .eq('mes_referencia', competencia);

    if (errAbc || errInv) {
      console.error("Erro ao buscar dados:", errAbc || errInv);
      setLoading(false);
      return;
    }

    // 3. Cruzamento de Dados (Matching por Código do Produto)
    const cruzamento = abc?.map((item: any) => {
      const estoqueMatch = inv?.find((i: any) => String(i.codigo_sku).trim() === String(item.codigo).trim());
      
      return {
        ...item,
        saldoEstoque: estoqueMatch ? estoqueMatch.saldo : 0
      };
    });

    setDadosCruzados(cruzamento || []);
    setLoading(false);
  };

  useEffect(() => {
    buscarDados();
  }, [competencia]);

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Painel de Performance</h1>

        {/* Menu de Navegação */}
        <div className="flex space-x-6 border-b border-gray-300 pb-2 mb-6">
          <Link href="/" className="px-4 py-2 font-semibold text-lg border-b-4 border-blue-600 text-blue-600">
            Curva ABC & Histórico
          </Link>
          <Link href="/upload" className="px-4 py-2 font-semibold text-lg text-gray-500 hover:text-blue-500 transition-colors">
            Upload de Planilhas
          </Link>
        </div>

        {/* Filtro de Competência */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-700">Análise Cruzada de Estoque & Vendas</h2>
            <p className="text-sm text-gray-500">Cruzamento dinâmico baseado na competência gravada.</p>
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700 mr-2">Competência:</label>
            <input 
              type="text" 
              value={competencia} 
              onChange={(e) => setCompetencia(e.target.value)} 
              placeholder="MM/AAAA"
              className="border border-gray-300 rounded-md p-2 w-32 text-center font-semibold"
            />
          </div>
        </div>

        {/* Tabela de Resultados */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="p-6 text-center text-gray-500">A carregar e cruzar dados do Supabase...</p>
          ) : dadosCruzados.length === 0 ? (
            <p className="p-6 text-center text-gray-500">Nenhum registo encontrado para a competência {competencia}. Verifique se fez o upload na aba ao lado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200 text-xs uppercase text-gray-600 font-semibold">
                    <th className="p-4">Código</th>
                    <th className="p-4">Produto</th>
                    <th className="p-4 text-center">Classificação</th>
                    <th className="p-4 text-right">Qtd Vendas</th>
                    <th className="p-4 text-right">Valor Total</th>
                    <th className="p-4 text-right">Saldo em Estoque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {dadosCruzados.map((linha, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="p-4 font-medium text-gray-700">{linha.codigo}</td>
                      <td className="p-4 text-gray-900">{linha.produto}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded font-bold text-xs ${
                          linha.classificacao === 'A' ? 'bg-red-100 text-red-700' :
                          linha.classificacao === 'B' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {linha.classificacao || 'N/A'}
                        </span>
                      </td>
                      <td className="p-4 text-right">{linha.quantidade}</td>
                      <td className="p-4 text-right">R$ {Number(linha.valor).toFixed(2)}</td>
                      <td className="p-4 text-right font-bold text-blue-600">{linha.saldoEstoque}</td>
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