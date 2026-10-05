"use client";
import { useState, ChangeEvent } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function UploadPage() {
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [ficheiroABC, setFicheiroABC] = useState("");
  const [ficheiroInventario, setFicheiroInventario] = useState("");
  
  // Estados para guardar os dados na memória antes de enviar
  const [dadosABC, setDadosABC] = useState<any[]>([]);
  const [dadosInv, setDadosInv] = useState<any[]>([]);
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

  const processarABC = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroABC(file.name);

    const reader = new FileReader();
    reader.onload = (evento) => {
      const workbook = XLSX.read(evento.target?.result, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      const dados_brutos = XLSX.utils.sheet_to_json(worksheet, { range: 1 }) as any[];
      
      const formatado = dados_brutos.map(linha => ({
        mes_referencia: mesReferencia,
        codigo: String(linha["Código"] || linha["Código (SKU)"] || ""),
        produto: linha["Produto"] || "",
        quantidade: Number(linha["Vendas"] || linha["Quantidade"] || 0),
        valor: Number(linha["Valor"] || 0),
        porcentagemIndividual: Number(linha["% Individual"] || 0),
        porcentagemAcumulada: Number(linha["% Acumulado"] || 0),
        classificacao: String(linha["Classificação"] || "C").trim()
      })).filter(item => item.codigo);

      setDadosABC(formatado);
    };
    reader.readAsArrayBuffer(file);
  };

  const processarInventario = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFicheiroInventario(file.name);

    const reader = new FileReader();
    reader.onload = (evento) => {
      const workbook = XLSX.read(evento.target?.result, { type: "array" });
      const dados_brutos = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
      
      const formatado = dados_brutos.map(linha => ({
        mes_referencia: mesReferencia,
        codigo_sku: String(linha["Código (SKU)"] || linha["Código"] || ""),
        saldo: Number(linha["Saldo em estoque"] || linha["Saldo"] || 0)
      })).filter(item => item.codigo_sku);

      setDadosInv(formatado);
    };
    reader.readAsArrayBuffer(file);
  };

  // Função para Gravar no Supabase
  const enviarParaBanco = async () => {
    if (dadosABC.length === 0 && dadosInv.length === 0) {
      alert("Nenhum dado lido. Selecione as planilhas primeiro.");
      return;
    }

    setLoading(true);

    if (dadosABC.length > 0) {
      const { error } = await supabase.from('curva_abc').insert(dadosABC);
      if (error) {
        alert("Erro ao enviar Curva ABC: " + error.message);
        setLoading(false);
        return;
      }
    }

    if (dadosInv.length > 0) {
      const { error } = await supabase.from('inventario').insert(dadosInv);
      if (error) {
        alert("Erro ao enviar Inventário: " + error.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    alert("🚀 Sucesso! Dados gravados no Supabase.");
    
    setFicheiroABC("");
    setFicheiroInventario("");
    setDadosABC([]);
    setDadosInv([]);
  };

  // Função para Limpar Dados da Competência no Supabase
  const limparDadosCompetencia = async () => {
    if (!mesReferencia) {
      alert("Selecione o Mês e o Ano da competência que deseja limpar.");
      return;
    }

    const confirmar = window.confirm(`Tem a certeza que deseja apagar todos os dados de Curva ABC e Inventário da competência ${mesReferencia} do Supabase?`);
    if (!confirmar) return;

    setLoadingDelete(true);

    // Apaga Curva ABC da competência
    const { error: errAbc } = await supabase
      .from('curva_abc')
      .delete()
      .eq('mes_referencia', mesReferencia);

    // Apaga Inventário da competência
    const { error: errInv } = await supabase
      .from('inventario')
      .delete()
      .eq('mes_referencia', mesReferencia);

    setLoadingDelete(false);

    if (errAbc || errInv) {
      alert("Erro ao limpar dados: " + (errAbc?.message || errInv?.message));
    } else {
      alert(`🗑️️ Dados da competência ${mesReferencia} removidos com sucesso do Supabase.`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Painel de Performance</h1>

        <div className="flex space-x-6 border-b border-gray-300 pb-2 mb-6">
          <Link href="/" className="px-4 py-2 font-semibold text-lg text-gray-500 hover:text-blue-500 transition-colors">
            Curva ABC & Histórico
          </Link>
          <Link href="/upload" className="px-4 py-2 font-semibold text-lg border-b-4 border-blue-600 text-blue-600">
            Upload de Planilhas
          </Link>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-3xl">
          <h2 className="text-xl font-bold mb-2 text-gray-800">Abastecimento do Banco de Dados</h2>
          <p className="text-gray-500 mb-8">Defina a competência, envie os ficheiros isoladamente e faça a gestão dos registos.</p>
          
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
            
            {/* 1. Competência & Botão de Limpeza */}
            <div className="mb-8 border-b border-gray-200 pb-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-3">
                <label className="block text-sm font-bold text-gray-700">1. Competência (Mês e Ano)</label>
                
                <button
                  onClick={limparDadosCompetencia}
                  disabled={!mesReferencia || loadingDelete}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold py-2 px-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {loadingDelete ? "Limpando..." : `🗑️ Limpar Base (${mesReferencia || 'MM/AAAA'})`}
                </button>
              </div>

              <div className="flex space-x-4">
                <select className="w-1/2 border border-gray-300 rounded-md p-2.5" value={mes} onChange={(e) => setMes(e.target.value)}>
                  <option value="">Mês...</option>
                  {meses.map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                </select>
                <select className="w-1/2 border border-gray-300 rounded-md p-2.5" value={ano} onChange={(e) => setAno(e.target.value)}>
                  <option value="">Ano...</option>
                  {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* Zonas de Upload */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">2. Planilha Curva ABC</label>
                <div className={`border-2 border-dashed rounded-lg p-4 flex flex-col