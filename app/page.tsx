"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

export default function Dashboard() {
  const [competencia, setCompetencia] = useState("09/2026");
  const [competenciaAnterior, setCompetenciaAnterior] = useState("");
  const [dadosConsolidados, setDadosConsolidados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados de Paginação e Filtros/Ordenação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 30;

  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [ordenacao, setOrdenacao] = useState("padrao");

  const carregarDados = async () => {
    setLoading(true);
    const compBusca = competencia.trim();

    // 1. Busca Curva ABC sem limite de paginação (trazendo todos os registos)
    const { data: abcAtual, error } = await supabase
      .from('curva_abc')
      .select('*')
      .eq('mes_referencia', compBusca)
      .range(0, 9999);

    if (error) {
      console.error("Erro Supabase ABC:", error.message);
    }

    // 2. Busca Inventário correspondente
    const { data: inventario } = await supabase
      .from('inventario')
      .select('*')
      .eq('mes_referencia', compBusca)
      .range(0, 9999);

    // 3. Busca Mês Anterior (Opcional)
    let abcAnterior: any[] = [];
    if (competenciaAnterior.trim() !== "") {
      const { data: antData } = await supabase
        .from('curva_abc')
        .select('*')
        .eq('mes_referencia', competenciaAnterior.trim())
        .range(0, 9999);
      if (antData) abcAnterior = antData;
    }

    if (!abcAtual || abcAtual.length === 0) {
      setDadosConsolidados([]);
      setLoading(false);
      return;
    }

    // 4. Cruzamento e Cálculo de todas as linhas
    const resultado = abcAtual.map((item: any, index: number) => {
      const invMatch = inventario?.find(
        (inv: any) => String(inv.codigo_sku || "").trim() === String(item.codigo || "").trim()
      );
      
      const saldoEstoque = invMatch ? Number(invMatch.saldo || 0) : 0;
      const vendas = Number(item.quantidade || 0);
      const valor = Number(item.valor || 0);

      const mediaDiaria = vendas > 0 ? vendas / 30 : 0;
      const coberturaDias = mediaDiaria > 0 ? saldoEstoque / mediaDiaria : 0;
      const coberturaMeses = coberturaDias / 30;
      const status = coberturaMeses >= 2 ? "Cobertura Igual ou Maior 2 Meses" : "Sugestão de Compra";

      let variacaoPercentual: number | null = null;
      if (competenciaAnterior.trim() !== "") {
        const anteriorMatch = abcAnterior.find(
          (ant: any) => String(ant.codigo || "").trim() === String(item.codigo || "").trim()
        );
        const qtdAnterior = anteriorMatch ? Number(anteriorMatch.quantidade || 0) : 0;
        if (qtdAnterior > 0) {
          variacaoPercentual = ((vendas - qtdAnterior) / qtdAnterior) * 100;
        } else if (vendas > 0) {
          variacaoPercentual = 100;
        } else {
          variacaoPercentual = 0;
        }
      }

      return {
        id: item.id || index + 1,
        produto: item.produto || "",
        codigo: item.codigo || "",
        localizacao: "-",
        saldoEstoque: saldoEstoque,
        vendas: vendas,
        valor: valor,
        porcentagemIndividual: Number(item.porcentagem_individual || 0),
        porcentagemAcumulada: Number(item.porcentagem_acumulada || 0),
        classificacao: item.classificacao || "C",
        mediaDiaria: Number(mediaDiaria.toFixed(2)),
        coberturaDias: Number(coberturaDias.toFixed(1)),
        coberturaMeses: Number(coberturaMeses.toFixed(2)),
        status: status,
        variacao: variacaoPercentual
      };
    });

    setDadosConsolidados(resultado);
    setPaginaAtual(1);
    setLoading(false);
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Cálculos dos Cards de Resumo (Topo) baseados em TODOS os itens carregados
  const totalUnidadesVendas = dadosConsolidados.reduce((acc, item) => acc + item.vendas, 0);
  const totalFaturamentoBruto = dadosConsolidados.reduce((acc, item) => acc + item.valor, 0);
  const totalTicketMedio = totalUnidadesVendas > 0 ? totalFaturamentoBruto / totalUnidadesVendas : 0;

  // Filtros de Status e Ordenação
  const dadosFiltradosEOrdenados = dadosConsolidados
    .filter(item => {
      if (filtroStatus === "TODOS") return true;
      return item.status === filtroStatus;
    })
    .sort((a, b) => {
      if (ordenacao === "saldo-desc") return b.saldoEstoque - a.saldoEstoque;
      if (ordenacao === "saldo-asc") return a.saldoEstoque - b.saldoEstoque;
      if (ordenacao === "cobertura-desc") return b.coberturaMeses - a.coberturaMeses;
      if (ordenacao === "cobertura-asc") return a.coberturaMeses - b.coberturaMeses;
      if (ordenacao === "vendas-desc") return b.vendas - a.vendas;
      return 0;
    });

  // Paginação (30 itens por página)
  const totalPaginas = Math.ceil(dadosFiltradosEOrdenados.length / itensPorPagina) || 1;
  const indiceUltimoItem = paginaAtual * itensPorPagina;
  const indicePrimeiroItem = indiceUltimoItem - itensPorPagina;
  const itensAtuais = dadosFiltradosEOrdenados.slice(indicePrimeiroItem, indiceUltimoItem);

  const baixarExcel = () => {
    if (dadosFiltradosEOrdenados.length === 0) {
      alert("Sem dados para exportar.");
      return;
    }

    const dadosExportar = dadosFiltradosEOrdenados.map(d => ({
      "ID": d.id,
      "Produto": d.produto,
      "Código (SKU)": d.codigo,
      "Localização": d.localizacao,
      "SALDO": d.saldoEstoque,
      "Vendas": d.vendas,
      "Valor": d.valor,
      "% Individual": d.porcentagemIndividual,
      "% Acumulado": d.porcentagemAcumulada,
      "Classificação": d.classificacao,
      "Média Diária Vendas": d.mediaDiaria,
      "Cobertura (dias)": d.coberturaDias,
      "Cobertura MESES": d.coberturaMeses,
      "STATUS": d.status,
      ...(competenciaAnterior ? { "Variação vs Mês Anterior": `${d.variacao! > 0 ? '+' : ''}${d.variacao?.toFixed(1)}%` } : {})
    }));

    const worksheet = XLSX.utils.json_to_sheet(dadosExportar);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório Consolidado");
    XLSX.writeFile(workbook, `Relatorio_CurvaABC_${competencia.replace('/', '-')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-[95%] mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Relatórios mensais - Best Fit</h1>

        <div className="flex space-x-6 border-b border-gray-300 pb-2 mb-6">
          <Link className="px-4 py-2 font-semibold text-lg border-b-4 border-blue-600 text-blue-600" href="/">
            Curva ABC & Histórico
          </Link>
          <Link className="px-4 py-2 font-semibold text-lg text-gray-500 hover:text-blue-500 transition-colors" href="/upload">
            Upload de Planilhas
          </Link>
        </div>

        {/* CARDS DE RESUMO EXECUTIVO (TOPO) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total de Unidades Vendas</p>
            <p className="text-2xl font-extrabold text-gray-800 mt-1">{totalUnidadesVendas.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Faturamento Bruto</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">R$ {totalFaturamentoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Ticket Médio</p>
            <p className="text-2xl font-extrabold text-blue-600 mt-1">R$ {totalTicketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mês de Referência</p>
            <p className="text-2xl font-extrabold text-indigo-600 mt-1">{competencia}</p>
          </div>
        </div>

        {/* Filtros, Ordenação e Ações */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
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
              <div className="self-end">
                <button
                  onClick={carregarDados}
                  className="bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors text-sm cursor-pointer"
                >
                  🔍 Filtrar Dados
                </button>
              </div>
            </div>

            <button
              onClick={baixarExcel}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg shadow transition-colors text-sm cursor-pointer flex items-center gap-2"
            >
              📥 Baixar Relatório Excel
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-gray-100">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Filtrar por Status:</label>
              <select 
                value={filtroStatus} 
                onChange={(e) => { setFiltroStatus(e.target.value); setPaginaAtual(1); }}
                className="border border-gray-300 rounded-md p-2 text-sm bg-white"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="Sugestão de Compra">Sugestão de Compra</option>
                <option value="Cobertura Igual ou Maior 2 Meses">Cobertura Igual ou Maior 2 Meses</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Ordenar por:</label>
              <select 
                value={ordenacao} 
                onChange={(e) => { setOrdenacao(e.target.value); setPaginaAtual(1); }}
                className="border border-gray-300 rounded-md p-2 text-sm bg-white"
              >
                <option value="padrao">Ordem Padrão (Curva ABC)</option>
                <option value="saldo-desc">Maior Saldo em Estoque</option>
                <option value="saldo-asc">Menor Saldo em Estoque</option>
                <option value="cobertura-desc">Maior Cobertura (Meses)</option>
                <option value="cobertura-asc">Menor Cobertura (Meses)</option>
                <option value="vendas-desc">Maior Volume de Vendas</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabela de Resultados */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="p-6 text-center text-gray-500">Carregando e cruzando dados em nuvem...</p>
          ) : dadosConsolidados.length === 0 ? (
            <p className="p-6 text-center text-gray-500">Nenhum registo encontrado para a competência {competencia}. Vá na aba "Upload de Planilhas" para abastecer a base.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead className="bg-gray-100 border-b border-gray-200 uppercase text-gray-700 font-semibold shadow-sm">
                    <tr>
                      <th className="p-3">ID</th>
                      <th className="p-3">Produto</th>
                      <th className="p-3">Código (SKU)</th>
                      <th className="p-3 text-center">Classificação</th>
                      <th className="p-3 text-right">Vendas</th>
                      <th className="p-3 text-right">Valor (R$)</th>
                      <th className="p-3 text-right">SALDO</th>
                      <th className="p-3 text-right">Média Diária</th>
                      <th className="p-3 text-right">Cob. Dias</th>
                      <th className="p-3 text-right">Cob. Meses</th>
                      <th className="p-3 text-center">Status</th>
                      {competenciaAnterior && <th className="p-3 text-center">Cresc. / Queda</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {itensAtuais.map((d, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-500">{d.id}</td>
                        <td className="p-3 font-medium text-gray-900">{d.produto}</td>
                        <td className="p-3 font-mono text-gray-700">{d.codigo}</td>
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
                        <td className="p-3 text-right">{d.mediaDiaria}</td>
                        <td className="p-3 text-right">{d.coberturaDias}d</td>
                        <td className="p-3 text-right font-semibold">{d.coberturaMeses}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                            d.status.includes('Sugestão') ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {d.status}
                          </span>
                        </td>
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

              {/* Rodapé com Paginação Visual */}
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  Mostrando de <b>{indicePrimeiroItem + 1}</b> até <b>{Math.min(indiceUltimoItem, dadosFiltradosEOrdenados.length)}</b> de <b>{dadosFiltradosEOrdenados.length}</b> produtos
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPaginaAtual(p => Math.max(p - 1, 1))}
                    disabled={paginaAtual === 1}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-md font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="px-4 py-2 font-bold text-gray-800 self-center">
                    Página {paginaAtual} de {totalPaginas}
                  </span>
                  <button
                    onClick={() => setPaginaAtual(p => Math.min(p + 1, totalPaginas))}
                    disabled={paginaAtual === totalPaginas}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-md font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}