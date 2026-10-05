"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

export default function Dashboard() {
  const [competencia, setCompetencia] = useState("09/2026");
  const [dadosCruzados, setDadosCruzados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const buscarDados = async () => {
    setLoading(true);

    // 1. Busca dados da Curva ABC gravados na competência
    const { data: abc, error: errAbc } = await supabase
      .from('curva_abc')
      .select('*')
      .eq('mes_referencia', competencia);

    // 2. Busca dados de Inventário para o cruzamento de estoque
    const { data: inv, error: errInv } = await supabase
      .from('inventario')
      .select('*')
      .eq('mes_referencia', competencia);

    if (errAbc || errInv) {
      console.error("Erro ao buscar dados:", errAbc || errInv);
      setLoading(false);
      return;
    }

    // 3. Cruzamento e Aplicação da Lógica da Curva ABC com o Estoque Real
    const cruzamento = abc?.map((item: any) => {
      // Procura o saldo correspondente pelo SKU/Código
      const estoqueMatch = inv?.find(
        (i: any) => String(i.codigo_sku || i.codigo).trim() === String(item.codigo).trim()
      );

      const estoqueAtual = estoqueMatch ? Number(estoqueMatch.saldo || estoqueMatch.saldoEstoque || 0) : Number(item.estoque || 0);
      const vendas = Number(item.quantidade || 0);
      
      // Lógica de Média Diária e Cobertura (considerando mês de ~31 dias ou média padrão)
      const mediaDiaria = vendas > 0 ? vendas / 30 : 0;
      const coberturaDias = mediaDiaria > 0 ? estoqueAtual / mediaDiaria : 0;
      const coberturaMeses = coberturaDias / 30;
      
      const status = coberturaMeses >= 2 ? "Cobertura Igual ou Maior 2 Meses" : "Sugestão de Compra";

      return {
        codigo: item.codigo,
        produto: item.produto,
        vendas: vendas,
        valor: Number(item.valor || 0),
        porcentagemIndividual: item.porcentagemIndividual || 0,
        porcentagemAcumulada: item.porcentagemAcumulada || 0,
        classificacao: item.classificacao || 'C',
        mediaDiaria: mediaDiaria.toFixed(2),
        estoqueAtual: estoqueAtual,
        coberturaDias: coberturaDias.toFixed(1),
        coberturaMeses: coberturaMeses.toFixed(2),
        status: status
      };
    });

    setDadosCruzados(cruzamento || []);
    setLoading(false);
  };

  useEffect(() => {
    buscarDados();
  }, [competencia]);

  // Função para Baixar a Planilha no Formato Exato
  const baixarPlanilhaExcel = () => {
    if (dadosCruzados.length === 0) {
      alert("Não há dados para exportar.");
      return;
    }

    // Mapeia para o formato exato das colunas da sua planilha de referência
    const dadosFormatadosParaExcel = dadosCruzados.map(item => ({
      "Código": item.codigo,
      "Produto": item.produto,
      "Vendas": item.vendas,
      "Valor": item.valor,
      "% Individual": item.porcentagemIndividual,
      "% Acumulado": item.porcentagemAcumulada,
      "Classificação": item.classificacao,
      "Média Diária Vendas": item.mediaDiaria,
      "Estoque Atual Total - GERAL": item.estoqueAtual,
      "Cobertura (dias)": item.coberturaDias,
      "Cobertura MESES": item.coberturaMeses,
      "STATUS": item.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(dadosFormatadosParaExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Curva ABC Consolidada");
    
    XLSX.writeFile(workbook, `Relatorio_CurvaABC_${competencia.replace('/', '-')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-7xl mx-auto">
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

        {/* Filtro e Botão de Download */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-700">Análise Consolidada Curva ABC & Estoque</h2>
            <p className="text-sm text-gray-500">Lógica de cobertura, giro e sugestão de compra automatizada.</p>
          </div>
          
          <div className="flex items-center gap-4">
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

            <button
              onClick={baixarPlanilhaExcel}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg shadow transition-colors flex items-center gap-2 text-sm"
            >
              📥 Baixar Relatório Excel
            </button>
          </div>
        </div>

        {/* Tabela de Resultados Estilo Excel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="p-6 text-center text-gray-500">Processando cruzamento e lógica de estoque...</p>
          ) : dadosCruzados.length === 0 ? (
            <p className="p-6 text-center text-gray-500">Nenhum dado encontrado para {competencia}. Realize o upload na aba ao lado.</p>
          ) : (
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-gray-100 sticky top-0 border-b border-gray-200 uppercase text-gray-700 font-semibold">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3 text-center">Classificação</th>
                    <th className="p-3 text-right">Vendas</th>
                    <th className="p-3 text-right">Valor (R$)</th>
                    <th className="p-3 text-right">Média Diária</th>
                    <th className="p-3 text-right">Estoque Atual</th>
                    <th className="p-3 text-right">Cobertura (Dias)</th>
                    <th className="p-3 text-center">Status / Sugestão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {dadosCruzados.map((linha, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-700">{linha.codigo}</td>
                      <td className="p-3 text-gray-900 font-normal">{linha.produto}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          linha.classificacao === 'A' ? 'bg-red-100 text-red-700' :
                          linha.classificacao === 'B' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {linha.classificacao}
                        </span>
                      </td>
                      <td className="p-3 text-right">{linha.vendas}</td>
                      <td className="p-3 text-right">R$ {Number(linha.valor).toFixed(2)}</td>
                      <td className="p-3 text-right">{linha.mediaDiaria}</td>
                      <td className="p-3 text-right font-bold text-gray-800">{linha.estoqueAtual}</td>
                      <td className="p-3 text-right">{linha.coberturaDias} dias</td>
                      <td className="p-3 text-center font-medium">
                        <span className={`px-2 py-1 rounded text-[10px] ${
                          linha.status.includes('Sugestão') ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {linha.status}
                        </span>
                      </td>
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