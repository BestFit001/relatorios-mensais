"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "@/app/components/Navbar";
import Paginacao from "@/app/components/Paginacao";
import { buscarTudo } from "@/lib/buscarTudo";
import { paginar } from "@/lib/cadastroCanais";
import { carregarParaExclusao } from "@/lib/skusExclusao";
import { carregarPaiManual } from "@/lib/skuPaiDb";
import { paiDoSku } from "@/lib/skuPai";

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
  // Informações do Mapa de Cadastros (mesmas bases): status (Normal/Obsoleto), estoque no Tiny e lista "Para exclusão"
  const [statusMap, setStatusMap] = useState<Map<string, string>>(new Map());
  const [estoqueMap, setEstoqueMap] = useState<Map<string, number>>(new Map());
  const [paraExclusao, setParaExclusao] = useState<Set<string>>(new Set());
  const [paiManual, setPaiManual] = useState<Map<string, string>>(new Map());   // ajustes do SKU pai feitos no Mapa de Cadastros
  const [filtroStatus, setFiltroStatus] = useState<"TODOS" | "Normal" | "Obsoleto">("TODOS");
  const [filtroEstoque, setFiltroEstoque] = useState<"TODOS" | "COM" | "SEM">("TODOS");
  const [filtroExclusao, setFiltroExclusao] = useState<"TODOS" | "EXCLUIR" | "MANTIDOS">("TODOS");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(100);

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
    try {
      const [custos, status, tiny, exclusao, pais] = await Promise.all([
        buscarTudo("tabela_custos_skus", "sku, marca"),
        buscarTudo("status_skus_catalogo", "sku, status").catch(() => []),
        buscarTudo("cadastros_base_tiny", "sku, estoque").catch(() => []),
        carregarParaExclusao(),
        carregarPaiManual(),
      ]);
      const mapa: Record<string, string> = {};
      custos.forEach((c: any) => { const k = normalizarSku(c.sku); if (k) mapa[k] = c.marca || "Outros"; });
      setCustosMap(mapa);
      setStatusMap(new Map(status.map((r: any) => [normalizarSku(r.sku), String(r.status || "Normal")] as [string, string])));
      setEstoqueMap(new Map(tiny.map((r: any) => [normalizarSku(r.sku), Number(r.estoque) || 0] as [string, number])));
      setParaExclusao(exclusao);
      setPaiManual(pais);
    } catch { /* sem as bases auxiliares os filtros só não separam nada */ }

    // TODOS os itens (o servidor devolve no máximo 1000 por consulta): lê página a página, com desempate pelo id para não repetir/pular linha
    const todos: any[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("ajustes_site").select("*")
        .order("created_at", { ascending: false }).order("id", { ascending: true }).range(de, de + 999);
      if (error || !data || data.length === 0) break;
      todos.push(...data);
      if (data.length < 1000) break;
    }
    const dadosAjustes = todos;

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
        // Carregamento dinâmico em tempo de execução
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

  const termosBusca = useMemo(() => busca.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), [busca]);

  const itensFiltrados = useMemo(() => {
    return itens.filter((i) => {
      const matchAba =
        filtroAba === "todos"
          ? true
          : filtroAba === "pendentes"
          ? !i.concluido
          : !!i.concluido;

      const matchMarca = filtroMarca === "TODAS" || i.marca === filtroMarca;

      // busca por SKU, SKU pai (traz todos os filhos), título ou marca; vírgula separa vários códigos
      const matchBusca =
        termosBusca.length === 0 ||
        termosBusca.some((t) => {
          const cod = normalizarSku(t);
          return i.sku.toLowerCase().includes(t) || i.titulo.toLowerCase().includes(t) || i.marca.toLowerCase().includes(t) ||
            (cod !== "" && (normalizarSku(i.sku).includes(cod) || paiDoSku(i.sku, paiManual).startsWith(cod)));
        });

      if (!(matchAba && matchMarca && matchBusca)) return false;
      const k = normalizarSku(i.sku);
      if (filtroStatus !== "TODOS" && (statusMap.get(k) || "Normal") !== filtroStatus) return false;
      if (filtroEstoque !== "TODOS" && ((estoqueMap.get(k) || 0) > 0) !== (filtroEstoque === "COM")) return false;
      if (filtroExclusao !== "TODOS" && paraExclusao.has(k) !== (filtroExclusao === "EXCLUIR")) return false;
      return true;
    });
  }, [itens, filtroAba, filtroMarca, termosBusca, paiManual, filtroStatus, filtroEstoque, filtroExclusao, statusMap, estoqueMap, paraExclusao]);

  useEffect(() => { setPagina(1); }, [filtroAba, filtroMarca, busca, filtroStatus, filtroEstoque, filtroExclusao]);
  const pg = paginar(itensFiltrados.length, pagina, tamanho);

  const totalPendentes = itens.filter((i) => !i.concluido).length;
  const totalConcluidos = itens.filter((i) => i.concluido).length;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
              <span>Marketing</span> <span>/</span> <span className="text-indigo-400">Site</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Site — ajustes de catálogo</h1>
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

              <select data-f="status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                <option value="TODOS">Todos os status</option><option value="Normal">Normais</option><option value="Obsoleto">Obsoletos</option>
              </select>
              <select data-f="estoque" value={filtroEstoque} onChange={(e) => setFiltroEstoque(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                <option value="TODOS">Com e sem estoque</option><option value="COM">Com estoque (&gt; 0)</option><option value="SEM">Sem estoque (≤ 0)</option>
              </select>
              <select data-f="exclusao" value={filtroExclusao} onChange={(e) => setFiltroExclusao(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                <option value="TODOS">Exclusão: todos</option><option value="EXCLUIR">Para exclusão</option><option value="MANTIDOS">Mantidos</option>
              </select>

              <input
                type="text"
                placeholder="Buscar SKU, SKU pai, Título..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none w-60" data-busca
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
                    <th className="p-3 text-center">SKU pai</th>
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
                  {itensFiltrados.slice(pg.inicio, pg.fim).map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        item.concluido ? "bg-emerald-950/10 opacity-75" : ""
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-indigo-400">
                        {item.sku}
                        {(statusMap.get(normalizarSku(item.sku)) || "Normal") === "Obsoleto" && <span data-tag-obsoleto className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-950/60 text-rose-400 border border-rose-900/50">Obsoleto</span>}
                        {paraExclusao.has(normalizarSku(item.sku)) && <span data-tag-exclusao className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/60">Para exclusão</span>}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-400" data-pai-col>{paiDoSku(item.sku, paiManual).toUpperCase()}</td>
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
          {!loading && itensFiltrados.length > 0 && (
            <div className="p-4 border-t border-slate-800">
              <Paginacao total={itensFiltrados.length} pagina={pg.pagina} tamanho={tamanho} onPagina={setPagina} onTamanho={(t) => { setTamanho(t); setPagina(1); }} rotulo="SKUs" opcoes={[50, 100, 200, 500]} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}