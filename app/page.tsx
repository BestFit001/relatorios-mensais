"use client";
import { useState, ChangeEvent } from "react";
import * as XLSX from "xlsx";

export default function Home() {
  const [abaAtiva, setAbaAtiva] = useState("upload");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState("");

  // Só libera o upload se os dois campos estiverem preenchidos
  const mesReferencia = mes && ano ? `${mes}/${ano}` : "";

  // Arrays dinâmicos para os dropdowns
  const meses = [
    { valor: "01", nome: "Janeiro" }, { valor: "02", nome: "Fevereiro" },
    { valor: "03", nome: "Março" }, { valor: "04", nome: "Abril" },
    { valor: "05", nome: "Maio" }, { valor: "06", nome: "Junho" },
    { valor: "07", nome: "Julho" }, { valor: "08", nome: "Agosto" },
    { valor: "09", nome: "Setembro" }, { valor: "10", nome: "Outubro" },
    { valor: "11", nome: "Novembro" }, { valor: "12", nome: "Dezembro" }
  ];
  
  // Pega o ano atual e gera uma lista (ex: 2025 até 2035)
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 11 }, (_, i) => anoAtual - 1 + i); 

  const processarPlanilha = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNomeArquivo(file.name);

    const reader = new FileReader();
    reader.onload = (evento) => {
      const arrayBuffer = evento.target?.result;
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      
      const nomePrimeiraAba = workbook.SheetNames[0];
      const aba = workbook.Sheets[nomePrimeiraAba];
      
      const dados = XLSX.utils.sheet_to_json(aba);
      
      console.log(`[SUCESSO] Referência: ${mesReferencia} | Arquivo: ${file.name}`);
      console.log("Dados extraídos prontos para o Supabase:", dados);
      
      alert(`Planilha "${file.name}" processada! Pressione F12 para ver os dados no Console.`);
    };
    
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Painel de Performance</h1>

        <div className="flex space-x-6 border-b border-gray-300 pb-2 mb-6">
          <button
            onClick={() => setAbaAtiva("dashboard")}
            className={`px-4 py-2 font-semibold text-lg transition-colors ${
              abaAtiva === "dashboard"
                ? "border-b-4 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-blue-500"
            }`}
          >
            Curva ABC & Histórico
          </button>
          <button
            onClick={() => setAbaAtiva("upload")}
            className={`px-4 py-2 font-semibold text-lg transition-colors ${
              abaAtiva === "upload"
                ? "border-b-4 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-blue-500"
            }`}
          >
            Upload de Planilhas
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          
          {abaAtiva === "dashboard" && (
            <div>
              <h2 className="text-xl font-bold mb-4 text-gray-700">Análise de Vendas</h2>
              <p className="text-gray-500">O cruzamento de dados com o estoque aparecerá aqui após o envio para o banco.</p>
            </div>
          )}

          {abaAtiva === "upload" && (
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold mb-2 text-gray-800">Abastecimento do Banco de Dados</h2>
              <p className="text-gray-500 mb-8">Selecione o mês e o ano da análise antes de enviar as planilhas de Curva ABC e Inventário.</p>
              
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                
                {/* Seleção de Mês e Ano Dinâmica */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">1. Mês e Ano de Referência</label>
                  <div className="flex space-x-4">
                    <select 
                      className="w-1/2 border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500"
                      value={mes}
                      onChange={(e) => setMes(e.target.value)}
                    >
                      <option value="">Selecione o mês...</option>
                      {meses.map(m => (
                        <option key={m.valor} value={m.valor}>{m.nome}</option>
                      ))}
                    </select>

                    <select 
                      className="w-1/2 border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500"
                      value={ano}
                      onChange={(e) => setAno(e.target.value)}
                    >
                      <option value="">Selecione o ano...</option>
                      {anos.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  {!mesReferencia && <p className="text-sm text-red-500 mt-2 font-medium">* Obrigatório selecionar Mês e Ano para prosseguir.</p>}
                </div>

                {/* Zona de Upload */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">2. Selecionar Arquivo (.xls, .xlsx)</label>
                  <div className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors ${mesReferencia ? 'border-blue-400 bg-blue-50/50 hover:bg-blue-50' : 'border-gray-300 bg-gray-100 opacity-60'}`}>
                    
                    <input 
                      type="file" 
                      accept=".xls,.xlsx"
                      disabled={!mesReferencia}
                      onChange={processarPlanilha}
                      className="block w-full text-sm text-gray-500 
                        file:mr-4 file:py-2.5 file:px-4 
                        file:rounded-md file:border-0 
                        file:text-sm file:font-semibold 
                        file:bg-blue-600 file:text-white 
                        hover:file:bg-blue-700 file:cursor-pointer disabled:cursor-not-allowed cursor-pointer"
                    />
                    
                    {nomeArquivo && (
                      <p className="mt-4 text-sm text-green-600 font-semibold">
                        Arquivo carregado: {nomeArquivo}
                      </p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}