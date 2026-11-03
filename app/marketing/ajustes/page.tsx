"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "@/app/components/Navbar";

function normalizarSku(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function letraParaIndice(letra: string): number {
  if (!letra) return -1;
  const l = letra.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(l)) return -1;
  let num = 0;
  for (let i = 0; i < l.length; i++) {
    num = num * 26 + (l.charCodeAt(i) - 64);
  }
  return Math.max(0, num - 1);
}

interface AjusteItem {
  id: string;
  sku: string;
  titulo: string;
  marca: string;
  descricao: boolean;
  video: boolean;
  imagens: boolean;
  titulo_ajustado: boolean;
  observacoes: string;
  concluido: boolean;
}

export default function AjustesSitePage() {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<AjusteItem[]>([]);
  const [custosMap, setCustosMap] = useState<Record<string, string>>({});

  const [colunaSku, setColunaSku] = useState("A");
  const [colunaTitulo, setColunaTitulo] = useState("B");
  const [linhaInicial, setLinhaInicial] = useState("2");

  const [filtroAba, setFiltroAba] = useState<"pendentes" | "concluidos" | "todos">("pendentes");
  const [filtroMarca, setFiltroMarca] = useState("TODAS");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    let allCustos: any[] = [];
    let from = 0;
    const step = 1000;
    let keep = true;
    while (keep) {
      const { data } = await supabase
        .from("tabela_custos_skus")
        .select("sku, marca")
        .range(from, from + step - 1);
      if (data && data.length > 0) {
        allCustos = [...allCustos, ...data];
        from += step;
        if (data.length < step) keep = false;
      } else keep = false;
    }

    const mapa: Record<string, string> = {};
    allCustos.forEach((c: any) => {
      const k = normalizarSku(c.sku);
      if (k) mapa[k] = c.marca || "Outros";
    });
    setCustosMap(mapa);

    const { data: dadosAjustes } = await supabase
      .from("ajustes_site")
      .select("*")
      .order("created_at", { ascending: false });

    setItens(dadosAjustes || []);
    setLoading(false);
  };

  const handleUploadPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSalvando(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        // Importação dinâmica sob demanda: não consome memória estática no build
        const XLSX = await import("xlsx");
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[];

        const idxSku = letraParaIndice(colunaSku);
        const idxTitulo = letraParaIndice(colunaTitulo);
        const startRow = Math.max(0, parseInt(linhaInicial, 10) - 1 || 0);

        const novosRegistros: any[] = [];

        for (let i = startRow; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;

          const rawSku = String(row[idxSku] || "").trim();
          const rawTitulo = String(row[idxTitulo] || "").trim();
          const skuNorm = normalizarSku(rawSku);

          if (!skuNorm || !rawTitulo) continue;

          const marcaEncontrada = custosMap[skuNorm] || "Outros";

          novosRegistros.push({
            sku: rawSku,
            titulo: rawTitulo,
            marca: marcaEncontrada,
            descricao: false,
            video: false,
            imagens: false,
            titulo_ajustado: false,
            concluido: false,
            observacoes: ""
          });
        }

        if (novosRegistros.length === 0) {
          alert("Nenhum item válido identificado nas colunas informadas.");
          setSalvando(false);
          return;
        }

        for (let i = 0; i < novosRegistros.length; i += 500) {
          const { error } = await supabase
            .from("ajustes_site")
            .insert(novosRegistros.slice(i, i + 500));
          if (error) throw error;
        }

        alert(`✅ ${novosRegistros.length} produto(s) importado(s) com sucesso!`);
        carregarDados();
      } catch (err: any) {
        alert("Erro ao importar planilha: " + err.message);
      } finally {
        setSalvando(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleTopico = async (
    id: string,
    campo: "descricao" | "video" | "imagens" | "titulo_ajustado" | "concluido",
    valorAtual: boolean
  ) => {
    const novoValor = !valorAtual;
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: novoValor } : item))
    );
    await supabase.from("ajustes_site").update({ [campo]: novoValor }).eq("id", id);
  };

  const atualizarObs = async (id: string, texto: string) => {
    await supabase.from("ajustes_site").update({ observacoes: texto }).eq("id", id);
  };

  const excluirItem = async (id: string) => {
    if (!confirm("Remover este item dos ajustes?")) return;
    setItens((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("ajustes_site").delete().eq("id", id);
  };

  const marcasDisponiveis = useMemo(() => {
    return Array.from(new Set(itens.map((i) => i.marca).filter(Boolean)));
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    return itens.filter((i) => {
      const matchAba =
        filtroAba === "todos"
          ? true
          : filtroAba === "pendentes"
          ? !i.concluido
          : !!i.concluido;

      const matchMarca = filtroMarca === "TODAS" || i.marca === filtroMarca;

      const matchBusca =
        !busca.trim() ||
        i.sku.toLowerCase().includes(busca.toLowerCase()) ||
        i.titulo.toLowerCase().includes(busca.toLowerCase()) ||
        i.marca.toLowerCase().includes(busca.toLowerCase());

      return matchAba && matchMarca && matchBusca;
    });
  }, [itens, filtroAba, filtroMarca, busca]);

  const totalPendentes = itens.filter((i) => !i.concluido).length;
  const totalConcluidos = itens.filter((i) => i.concluido).length;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
              <span>Marketing</span> <span>/</span> <span className="text-indigo-400">Ajustes no Site</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel de Ajustes de Catálogo</h1>
            <p className="text-xs text-slate-400">Controle de melhorias de Descrição, Vídeo, Imagens e Título por SKU</p>
          </div>
          <Navbar />
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              📥 Importar Novos Produtos para Ajuste
            </h2>
            <span className="text-[11px] text-slate-400">
              A marca é consultada automaticamente na base de custos via SKU
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna SKU:</label>
              <input
                type="text"
                value={colunaSku}
                onChange={(e) => setColunaSku(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-indigo-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna Título:</label>
              <input
                type="text"
                value={colunaTitulo}
                onChange={(e) => setColunaTitulo(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono font-bold text-indigo-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha Inicial:</label>
              <input
                type="number"
                value={linhaInicial}
                onChange={(e) => setLinhaInicial(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-center font-mono text-white outline-none"
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ficheiro (.xlsx, .xls, .csv):</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={salvando}
                onChange={handleUploadPlanilha}
                className="w-full bg-slate-950 border border-slate-700 file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-bold file:py-1.5 file:px-3 file:rounded-lg file:mr-3 file:cursor-pointer rounded-lg p-1 text-xs text-slate-300 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setFiltroAba("pendentes")}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  filtroAba === "pendentes" ? "bg-amber-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>⏳ Em Ajuste</span>
                <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded-full">{totalPendentes}</span>
              </button>
              <button
                onClick={() => setFiltroAba("concluidos")}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  filtroAba === "concluidos" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                <span>✅ Concluídos</span>
                <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded-full">{totalConcluidos}</span>
              </button>
              <button
                onClick={() => setFiltroAba("todos")}
                className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                  filtroAba === "todos" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-white"
                }`}
              >
                Todos
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filtroMarca}
                onChange={(e) => setFiltroMarca(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer"
              >
                <option value="TODAS">Todas as Marcas</option>
                {marcasDisponiveis.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Buscar SKU, Título..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-48"
              />
            </div>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400 text-xs">Carregando itens...</p>
          ) : itensFiltrados.length === 0 ? (
            <p className="p-8 text-center text-slate-500 text-xs">Nenhum produto cadastrado para este filtro.</p>
          ) : (
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px] z-10">
                  <tr>
                    <th className="p-3">SKU</th>
                    <th className="p-3 min-w-[220px]">Título do Produto</th>
                    <th className="p-3 text-center">Marca</th>
                    <th className="p-3 text-center w-24">Descrição</th>
                    <th className="p-3 text-center w-24">Vídeo</th>
                    <th className="p-3 text-center w-24">Imagens</th>
                    <th className="p-3 text-center w-24">Título</th>
                    <th className="p-3 min-w-[200px]">Observações</th>
                    <th className="p-3 text-center w-20">Concluído</th>
                    <th className="p-3 text-center w-12">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {itensFiltrados.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        item.concluido ? "bg-emerald-950/10 opacity-75" : ""
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-indigo-400">{item.sku}</td>
                      <td className="p-3 text-slate-200 font-medium max-w-[280px] truncate" title={item.titulo}>
                        {item.titulo}
                      </td>
                      <td className="p-3 text-center">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">
                          {item.marca}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.descricao}
                          onChange={() => toggleTopico(item.id, "descricao", item.descricao)}
                          className="accent-indigo-600 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.video}
                          onChange={() => toggleTopico(item.id, "video", item.video)}
                          className="accent-indigo-600 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.imagens}
                          onChange={() => toggleTopico(item.id, "imagens", item.imagens)}
                          className="accent-indigo-600 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.titulo_ajustado}
                          onChange={() => toggleTopico(item.id, "titulo_ajustado", item.titulo_ajustado)}
                          className="accent-indigo-600 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      <td className="p-3">
                        <input
                          type="text"
                          defaultValue={item.observacoes || ""}
                          placeholder="Notas do ajuste..."
                          onBlur={(e) => atualizarObs(item.id, e.target.value.trim())}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500"
                        />
                      </td>

                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.concluido}
                          onChange={() => toggleTopico(item.id, "concluido", item.concluido)}
                          className="accent-emerald-500 w-5 h-5 cursor-pointer"
                        />
                      </td>

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => excluirItem(item.id)}
                          className="text-rose-400 hover:text-rose-300 font-bold p-1 cursor-pointer"
                        >
                          ✕
                        </button>
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