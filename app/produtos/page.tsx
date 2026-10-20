"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import * as XLSX from "xlsx";

export default function ProdutosPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"pendentes" | "realizados">("pendentes");
  const [loading, setLoading] = useState(false);

  const [dadosPendentes, setDadosPendentes] = useState<any[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");

  const [cadastrosRealizados, setCadastrosRealizados] = useState<any[]>([]);
  const [canaisLista, setCanaisLista] = useState<string[]>([]);
  const [pesquisaRealizados, setPesquisaRealizados] = useState("");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarDadosIniciais();
  }, []);

  const carregarDadosIniciais = async () => {
    setLoading(true);
    const { data: regrasCanais } = await supabase.from("config_regras_canais").select("canal").order("id");
    if (regrasCanais && regrasCanais.length > 0) {
      setCanaisLista(regrasCanais.map((r: any) => r.canal));
    } else {
      setCanaisLista(["Mercado Livre 1", "Mercado Livre 2", "Shopee", "Amazon", "Magalu", "TikTok Shop"]);
    }

    carregarRealizadosDoBanco();
    setLoading(false);
  };

  // Carrega apenas os cadastrados inseridos por esta ferramenta (tabela dedicada)
  const carregarRealizadosDoBanco = async () => {
    const { data } = await supabase.from("produtos_novos_cadastrados").select("*").order("id", { ascending: false });
    if (data) {
      setCadastrosRealizados(data);
    }
  };

  const handleUploadPendentes = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        let idxHeader = -1;
        for (let i = 0; i < Math.min(json.length, 10); i++) {
          const row = json[i];
          if (row && row.some((cell: any) => /sku/i.test(String(cell)))) {
            idxHeader = i;
            break;
          }
        }

        if (idxHeader === -1) idxHeader = 2;

        const headers = json[idxHeader].map((h: any) => String(h || "").trim());
        const getCol = (nameRegex: RegExp) => headers.findIndex((h: string) => nameRegex.test(h));

        const idxSku = getCol(/sku/i);
        const idxNome = getCol(/nome do produto|produto/i);
        const idxCor = getCol(/cor/i);
        const idxTam = getCol(/tamanho/i);
        const idxOrigem = getCol(/origem/i);
        const idxNcm = getCol(/ncm/i);
        const idxCest = getCol(/cest/i);
        const idxEan = getCol(/ean/i);
        const idxCusto = getCol(/custo/i);
        const idxPreco = getCol(/preço venda|preco|venda/i);
        const idxMarca = getCol(/marca/i);
        const idxAtivo = getCol(/ativo/i);

        const skusExistentesSet = new Set(cadastrosRealizados.map((c: any) => String(c.sku).trim().toLowerCase()));
        const mapTemp = new Map();
        let ignoradosAtivoSim = 0;
        let ignoradosDuplicados = 0;

        for (let i = idxHeader + 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;

          const skuVal = idxSku !== -1 ? String(row[idxSku] || "").trim() : String(row[0] || "").trim();
          if (!skuVal || skuVal.length < 5 || /sku/i.test(skuVal)) continue;

          const ativoVal = idxAtivo !== -1 ? String(row[idxAtivo] || "").trim().toLowerCase() : "";
          if (ativoVal === "sim" || ativoVal === "true" || ativoVal === "1") {
            ignoradosAtivoSim++;
            continue;
          }

          const skuLower = skuVal.toLowerCase();
          if (skusExistentesSet.has(skuLower) || mapTemp.has(skuLower)) {
            ignoradosDuplicados++;
            continue;
          }

          const produtoObj = {
            sku: skuVal,
            produto: idxNome !== -1 ? String(row[idxNome] || "").trim() : "Produto sem nome",
            cor: idxCor !== -1 ? String(row[idxCor] || "").trim() : "",
            tamanho: idxTam !== -1 ? String(row[idxTam] || "").trim() : "",
            origem: idxOrigem !== -1 ? String(row[idxOrigem] || "").trim() : "",
            ncm: idxNcm !== -1 ? String(row[idxNcm] || "").trim() : "",
            cest: idxCest !== -1 ? String(row[idxCest] || "").trim() : "",
            ean: idxEan !== -1 ? String(row[idxEan] || "").trim() : "",
            custo: idxCusto !== -1 ? Number(row[idxCusto]) || 0 : 0,
            preco_venda: idxPreco !== -1 ? Number(row[idxPreco]) || 0 : 0,
            marca: idxMarca !== -1 ? String(row[idxMarca] || "").trim() : "",
            canais_enviados: {}
          };

          mapTemp.set(skuLower, produtoObj);
        }

        const listaFinal = Array.from(mapTemp.values());
        setDadosPendentes(listaFinal);
        alert(`Planilha processada!\n- Pendentes: ${listaFinal.length}\n- Ignorados (Ativos = Sim): ${ignoradosAtivoSim}\n- Ignorados (Duplicados): ${ignoradosDuplicados}`);
      } catch (err: any) {
        alert("Erro ao ler planilha: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Envia para Realizados e também adiciona na base do Tiny (`cadastros_base_tiny`)
  const enviarParaRealizados = async (item: any) => {
    setLoading(true);
    try {
      // 1. Insere na tabela dedicada de novos cadastros realizados
      const { error: errRealizado } = await supabase.from("produtos_novos_cadastrados").upsert({
        sku: item.sku,
        produto: item.produto,
        marca: item.marca,
        custo: item.custo,
        preco_venda: item.preco_venda
      }, { onConflict: "sku" });

      if (errRealizado) throw errRealizado;

      // 2. Interliga com a base do Tiny ERP
      await supabase.from("cadastros_base_tiny").upsert({
        sku: item.sku,
        produto: item.produto,
        estoque: 0
      }, { onConflict: "sku" });

      // Remove dos pendentes locais
      setDadosPendentes(dadosPendentes.filter((p) => p.sku !== item.sku));
      carregarRealizadosDoBanco();
      alert(`✅ Produto ${item.sku} movido para Cadastros Realizados e integrado ao Tiny!`);
    } catch (err: any) {
      alert("Erro ao cadastrar: " + err.message);
    }
    setLoading(false);
  };

  const toggleCanalRealizado = async (sku: string, canal: string, checked: boolean) => {
    try {
      // Atualiza o estado visual e grava o mapeamento do canal
      if (checked) {
        await supabase.from("mapeamento_canais_skus").insert([{ canal, sku, presente: true }]);
      } else {
        await supabase.from("mapeamento_canais_skus").delete().eq("canal", canal).eq("sku", sku);
      }
    } catch (err: any) {
      console.error("Erro ao atualizar canal:", err);
    }
  };

  const realizadosFiltrados = cadastrosRealizados.filter((c) =>
    String(c.sku || "").toLowerCase().includes(pesquisaRealizados.toLowerCase()) ||
    String(c.produto || "").toLowerCase().includes(pesquisaRealizados.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Produtos</h1>
            <p className="text-sm font-medium text-slate-400">Controle exclusivo de Cadastros Pendentes, Realizados e Integração com Canais</p>
          </div>
          <Navbar />
        </div>

        <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
          <button
            onClick={() => setSubAba("pendentes")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              subAba === "pendentes" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Cadastros Pendentes ({dadosPendentes.length})
          </button>
          <button
            onClick={() => setSubAba("realizados")}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              subAba === "realizados" ? "bg-purple-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            }`}
          >
            Cadastros Realizados ({cadastrosRealizados.length})
          </button>
        </div>

        {subAba === "pendentes" ? (
          <div className="space-y-6">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Upload de Planilha de Produtos a Cadastrar</h3>
              <p className="text-xs text-slate-400">Itens duplicados e com Ativo = "Sim" são descartados automaticamente.</p>
              
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleUploadPendentes}
                  className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-300 outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
                />
                {nomeArquivo && <span className="text-xs text-emerald-400 font-bold">✓ {nomeArquivo}</span>}
              </div>
            </div>

            {dadosPendentes.length > 0 && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white">Produtos Pendentes de Cadastro</h3>
                  <span className="text-xs text-slate-400">Total: {dadosPendentes.length}</span>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Nome do Produto</th>
                        <th className="p-3">Cor</th>
                        <th className="p-3">Tamanho</th>
                        <th className="p-3">Marca</th>
                        <th className="p-3 text-right">Custo</th>
                        <th className="p-3 text-right">Preço Venda</th>
                        <th className="p-3 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {dadosPendentes.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-mono text-indigo-400 font-bold">{item.sku}</td>
                          <td className="p-3 text-white">{item.produto}</td>
                          <td className="p-3 text-slate-300">{item.cor || "—"}</td>
                          <td className="p-3 text-slate-300">{item.tamanho || "—"}</td>
                          <td className="p-3 text-slate-300">{item.marca || "—"}</td>
                          <td className="p-3 text-right font-mono text-rose-400">R$ {Number(item.custo).toFixed(2)}</td>
                          <td className="p-3 text-right font-mono text-emerald-400">R$ {Number(item.preco_venda).toFixed(2)}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => enviarParaRealizados(item)}
                              disabled={loading}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow"
                            >
                              Cadastrar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cadastros Realizados & Marcação por Canais</h3>
              <input
                type="text"
                value={pesquisaRealizados}
                onChange={(e) => setPesquisaRealizados(e.target.value)}
                placeholder="Pesquisar por SKU ou Nome..."
                className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none w-full md:w-80"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[600px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5">Nome do Produto</th>
                    {canaisLista.map((canal, cIdx) => (
                      <th key={cIdx} className="p-3.5 text-center text-[9px]">{canal}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {realizadosFiltrados.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-indigo-400">{item.sku}</td>
                      <td className="p-3.5 font-semibold text-white">{item.produto || "—"}</td>
                      {canaisLista.map((canal, cIdx) => (
                        <td key={cIdx} className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            onChange={(e) => toggleCanalRealizado(item.sku, canal, e.target.checked)}
                            className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {realizadosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={2 + canaisLista.length} className="p-8 text-center text-slate-500">Nenhum cadastro realizado via planilha ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}