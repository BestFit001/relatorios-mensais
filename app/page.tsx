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

  // Estados de Paginação, Filtros e Modo Ocultar
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 30;

  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [ordenacao, setOrdenacao] = useState("padrao");
  const [ocultarAnalise, setOcultarAnalise] = useState(false);

  // Estados para edição do Retorno de Compras
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null);
  const [textoRetorno, setTextoRetorno] = useState("");

  const carregarDados = async () => {
    setLoading(true);
    const compBusca = competencia.trim();

    const { data: abcAtual, error } = await supabase
      .from('curva_abc')
      .select('*')
      .eq('mes_referencia', compBusca);

    if (error) {
      console.error("Erro Supabase ABC:", error.message);
    }

    const { data: inventario } = await supabase
      .from('inventario')
      .select('*')
      .eq('mes_referencia', compBusca);

    let abcAnterior: any[] = [];
    if (competenciaAnterior.trim() !== "") {
      const { data: antData } = await supabase
        .from('curva_abc')
        .select('*')
        .eq('mes_referencia', competenciaAnterior.trim());
      if (antData) abcAnterior = antData;
    }

    if (!abcAtual || abcAtual.length === 0) {
      setDadosConsolidados([]);
      setLoading(false);
      return;
    }

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
        id: item.id,
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
        variacao: variacaoPercentual,
        retornoCompras: item.retorno_compras || ""
      };
    });

    setDadosConsolidados(resultado);
    setPaginaAtual(1);
    setLoading(false);
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const salvarRetorno = async (id: number, codigo: string) => {
    const { error } = await supabase
      .from('curva_abc')
      .update({ retorno_compras: textoRetorno })
      .eq('id', id);

    if (error) {
      await supabase
        .from('curva_abc')
        .update({ retorno_compras: textoRetorno })
        .eq('codigo', codigo)
        .eq('mes_referencia', competencia.trim());
    }

    setDadosConsolidados(prev =>
      prev.map(item => item.codigo === codigo ? { ...item, retornoCompras: textoRetorno } : item)
    );

    setEditandoIndex(null);
    setTextoRetorno("");
  };

  const totalUnidadesVendas = dadosConsolidados.reduce((acc, item) => acc + item.vendas, 0);
  const totalFaturamentoBruto = dadosConsolidados.reduce((acc, item) => acc + item.valor, 0);
  const totalTicketMedio = totalUnidadesVendas > 0 ? totalFaturamentoBruto / totalUnidadesVendas : 0;

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
      "Produto": d.produto,
      "Código (SKU)": d.codigo,
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
      "Retorno Compras": d.retornoCompras,
      ...(competenciaAnterior ? { "Variação vs Mês Anterior": `${d.variacao! > 0 ? '+' : ''}${d.variacao?.toFixed(1)}%` } : {})
    }));

    const worksheet = XLSX.utils.json_to_sheet(dadosExportar);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório Consolidado");
    XLSX.writeFile(workbook, `Relatorio_CurvaABC_${competencia.replace('/', '-')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 p-8 text-slate-800 font-sans">
      <div className="max-w-[96%] mx-auto">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Relatórios Mensais</h1>
            <p className="text-sm font-medium text-slate-500">Gestão de Performance e Compras — Best Fit</p>
          </div>

          <div className="flex items-center bg-white p-1.5 rounded-xl shadow-xs border border-slate-200">
            <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-slate-900 text-white shadow-xs transition-all" href="/">
              Dashboard
            </Link>
            <Link className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-600 hover:text-slate-900 transition-all" href="/upload">
              Upload de Planilhas
            </Link>
          </div>
        </div>

        {/* CARDS DE RESUMO EXECUTIVO (MODERNOS) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unidades Vendidas</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">📦</div>
            </div>
            <p className="text-3xl font-black text-slate-900 tracking-tight">{totalUnidadesVendas.toLocaleString()}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faturamento Bruto</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-sm">💰</div>
            </div>
            <p className="text-3xl font-black text-slate-900 tracking-tight">
              R$ {totalFaturamentoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket Médio</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm">🎯</div>
            </div>
            <p className="text-3xl font-black text-slate-900 tracking-tight">
              R$ {totalTicketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mês de Referência</span>
              <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 font-bold text-sm">📅</div>
            </div>
            <p className="text-3xl font-black text-slate-900 tracking-tight">{competencia}</p>
          </div>
        </div>

        {/* BARRA DE FILTROS E AÇÕES */}
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 mb-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Competência:</label>
                <input 
                  type="text" 
                  value={competencia} 
                  onChange={(e) => setCompetencia(e.target.value)} 
                  placeholder="MM/AAAA"
                  className="border border-slate-200 rounded-xl p-2.5 w-32 text-center font-bold text-sm bg-slate-50 focus:bg-white focus:border-slate-400 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Mês Comparativo:</label>
                <input 
                  type="text" 
                  value={competenciaAnterior} 
                  onChange={(e) => setCompetenciaAnterior(e.target.value)} 
                  placeholder="Ex: 08/2026"
                  className="border border-slate-200 rounded-xl p-2.5 w-32 text-center font-bold text-sm bg-slate-50 focus:bg-white focus:border-slate-400 outline-none transition-all"
                />
              </div>
              <div className="self-end">
                <button
                  onClick={carregarDados}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-5 rounded-xl shadow-xs transition-all text-xs uppercase tracking-wider cursor-pointer"
                >
                  🔍 Filtrar Dados
                </button>
              </div>
            </div>

            <button
              onClick={baixarExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-xs transition-all text-xs uppercase tracking-wider cursor-pointer flex items-center gap-2"
            >
              📥 Baixar Relatório Excel
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Status:</label>
                <select 
                  value={filtroStatus} 
                  onChange={(e) => { setFiltroStatus(e.target.value); setPaginaAtual(1); }}
                  className="border border-slate-200 rounded-xl p-2.5 text-xs font-semibold bg-slate-50 focus:bg-white focus:border-slate-400 outline-none transition-all cursor-pointer"
                >
                  <option value="TODOS">Todos os Status</option>
                  <option value="Sugestão de Compra">Sugestão de Compra</option>
                  <option value="Cobertura Igual ou Maior 2 Meses">Cobertura Igual ou Maior 2 Meses</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Ordenar:</label>
                <select 
                  value={ordenacao} 
                  onChange={(e) => { setOrdenacao(e.target.value); setPaginaAtual(1); }}
                  className="border border-slate-200 rounded-xl p-2.5 text-xs font-semibold bg-slate-50 focus:bg-white focus:border-slate-400 outline-none transition-all cursor-pointer"
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

            {/* CHECKBOX OCULTAR ANÁLISE */}
            <div className="flex items-center bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 select-none">
                <input 
                  type="checkbox" 
                  checked={ocultarAnalise} 
                  onChange={(e) => setOcultarAnalise(e.target.checked)}
                  className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900 cursor-pointer"
                />
                Ocultar campos de análise
              </label>
            </div>
          </div>
        </div>

        {/* TABELA MODERNA */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-slate-400 font-medium">A carregar e a cruzar dados em nuvem...</p>
          ) : dadosConsolidados.length === 0 ? (
            <p className="p-8 text-center text-slate-400 font-medium">Nenhum registo encontrado para a competência {competencia}. Vá na aba "Upload de Planilhas" para abastecer a base.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="p-4">Produto</th>
                      <th className="p-4">Código (SKU)</th>
                      {!ocultarAnalise && (
                        <>
                          <th className="p-4 text-center">Classificação</th>
                          <th className="p-4 text-right">Vendas</th>
                          <th className="p-4 text-right">Valor (R$)</th>
                          <th className="p-4 text-right">SALDO</th>
                          <th className="p-4 text-right">Média Diária</th>
                          <th className="p-4 text-right">Cob. Dias</th>
                          <th className="p-4 text-right">Cob. Meses</th>
                          <th className="p-4 text-center">Status</th>
                          {competenciaAnterior && <th className="p-4 text-center">Cresc. / Queda</th>}
                        </>
                      )}
                      <th className="p-4 text-center">Retorno Compras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itensAtuais.map((d, index) => {
                      const globalIndex = indicePrimeiroItem + index;
                      const isEditing = editandoIndex === globalIndex;

                      return (
                        <tr key={index} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-4 font-semibold text-slate-900">{d.produto}</td>
                          <td className="p-4 font-mono text-slate-500">{d.codigo}</td>
                          
                          {!ocultarAnalise && (
                            <>
                              <td className="p-4 text-center">
                                <span className={`px-2.5 py-1 rounded-lg font-black text-[10px] ${
                                  d.classificacao === 'A' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                  d.classificacao === 'B' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                }`}>
                                  {d.classificacao}
                                </span>
                              </td>
                              <td className="p-4 text-right font-bold text-slate-700">{d.vendas}</td>
                              <td className="p-4 text-right text-slate-600">R$ {d.valor.toFixed(2)}</td>
                              <td className="p-4 text-right font-black text-indigo-600">{d.saldoEstoque}</td>
                              <td className="p-4 text-right text-slate-600">{d.mediaDiaria}</td>
                              <td className="p-4 text-right text-slate-600">{d.coberturaDias}d</td>
                              <td className="p-4 text-right font-bold text-slate-700">{d.coberturaMeses}</td>
                              <td className="p-4 text-center">
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                                  d.status.includes('Sugestão') ? 'bg-orange-50 text-orange-700 border border-orange-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                }`}>
                                  {d.status}
                                </span>
                              </td>
                              {competenciaAnterior && (
                                <td className="p-4 text-center font-bold">
                                  {d.variacao === 0 ? (
                                    <span className="text-slate-400">0.0%</span>
                                  ) : d.variacao! > 0 ? (
                                    <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                      +{d.variacao?.toFixed(1)}% 📈
                                    </span>
                                  ) : (
                                    <span className="text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                                      {d.variacao?.toFixed(1)}% 📉
                                    </span>
                                  )}
                                </td>
                              )}
                            </>
                          )}

                          {/* CAMPO DE RETORNO DE COMPRAS COM EDIÇÃO (CANETINHA) */}
                          <td className="p-4 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <input
                                  type="text"
                                  value={textoRetorno}
                                  onChange={(e) => setTextoRetorno(e.target.value)}
                                  placeholder="Escreva o retorno..."
                                  className="border border-slate-300 rounded-lg p-1.5 text-xs bg-white w-44 outline-none focus:border-slate-600 shadow-xs"
                                  autoFocus
                                />
                                <button
                                  onClick={() => salvarRetorno(d.id, d.codigo)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all shadow-xs"
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setEditandoIndex(null)}
                                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-slate-600 font-medium">{d.retornoCompras || <span className="text-slate-300 italic">Sem retorno</span>}</span>
                                <button
                                  onClick={() => {
                                    setEditandoIndex(globalIndex);
                                    setTextoRetorno(d.retornoCompras || "");
                                  }}
                                  title="Editar Retorno de Compras"
                                  className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer transition-all border border-transparent hover:border-indigo-100"
                                >
                                  ✏️
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* RODAPÉ COM PAGINAÇÃO MODERNA */}
              <div className="p-5 bg-slate-50/50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
                <span>
                  A mostrar de <strong className="text-slate-800">{indicePrimeiroItem + 1}</strong> até <strong className="text-slate-800">{Math.min(indiceUltimoItem, dadosFiltradosEOrdenados.length)}</strong> de <strong className="text-slate-800">{dadosFiltradosEOrdenados.length}</strong> produtos
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaginaAtual(p => Math.max(p - 1, 1))}
                    disabled={paginaAtual === 1}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-xs"
                  >
                    Anterior
                  </button>
                  <span className="px-3 font-bold text-slate-700">
                    Página {paginaAtual} de {totalPaginas}
                  </span>
                  <button
                    onClick={() => setPaginaAtual(p => Math.min(p + 1, totalPaginas))}
                    disabled={paginaAtual === totalPaginas}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-xs"
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