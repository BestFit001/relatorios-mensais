"use client";
// Curva ABC > Cobertura de Estoque (mesma lógica da planilha "Relatório Curva ABC"):
// vendas do período (já filtradas pela página) + estoque do Tiny (base "Sede") => média diária, cobertura e STATUS.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import {
  COLUNAS_COBERTURA, OPCOES_RETORNO, TODOS_STATUS, STATUS_SUGESTAO, STATUS_VALIDAR,
  calcularCobertura, normalizarSkuEstoque, corCoberturaDias, corCoberturaMeses, indiceDaLetra, lerEstoque, rotulosDasColunas,
} from "@/lib/cobertura";

export interface LinhaABC {
  sku: string; skuNorm: string; titulo: string; marca: string;
  qtd: number; revenue: number; pctRepresentatividade: number; pctAcumulada: number; curva: string;
}

const POR_PAGINA = 100;
const brl = (n: number) => (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = (n: number) => (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n2 = (n: number) => (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SEMAFORO: Record<string, string> = { verde: "bg-emerald-400", amarelo: "bg-amber-400", vermelho: "bg-rose-500" };

async function lerTodos(tabela: string, colunas: string): Promise<{ dados: any[]; erro: string }> {
  let todos: any[] = [], de = 0;
  for (;;) {
    const { data, error } = await supabase.from(tabela).select(colunas).order("id").range(de, de + 999);
    if (error) return { dados: todos, erro: `${tabela}: ${error.message}` };
    if (!data || data.length === 0) break;
    todos = todos.concat(data); de += 1000;
    if (data.length < 1000) break;
  }
  return { dados: todos, erro: "" };
}

function usuarioLogado(): string {
  try { return String(JSON.parse(localStorage.getItem("usuario_logado") || "{}").email || ""); } catch { return ""; }
}

/** Lista de seleção do retorno de compras: 4 padrões + "+" para escrever outro texto. */
function RetornoCelula({ valor, onSalvar }: { valor: string; onSalvar: (texto: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const personalizado = !!valor && !OPCOES_RETORNO.includes(valor);

  if (editando) {
    const confirmar = () => { const t = texto.trim().slice(0, 200); setEditando(false); if (t) onSalvar(t); };
    return (
      <div className="flex items-center gap-1 min-w-[260px]">
        <input
          autoFocus value={texto} maxLength={200} placeholder="Escreva o retorno…" data-retorno-input
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") confirmar(); if (e.key === "Escape") setEditando(false); }}
          className="flex-1 bg-slate-950 border border-indigo-500/60 rounded-lg px-2 py-1 text-xs text-slate-100 outline-none"
        />
        <button type="button" onClick={confirmar} data-retorno-salvar title="Salvar" className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer">✓</button>
        <button type="button" onClick={() => setEditando(false)} title="Cancelar" className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black cursor-pointer">✕</button>
      </div>
    );
  }
  return (
    <select
      value={valor} data-retorno-select
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__novo__") { setTexto(personalizado ? valor : ""); setEditando(true); return; }
        onSalvar(v);
      }}
      className={`w-full min-w-[230px] bg-slate-950 border rounded-lg px-2 py-1 text-xs outline-none cursor-pointer ${valor ? "border-indigo-500/40 text-slate-100" : "border-slate-700 text-slate-500"}`}
    >
      <option value="">— sem retorno —</option>
      {personalizado && <option value={valor}>{valor}</option>}
      {OPCOES_RETORNO.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value="__novo__">+ Escrever outro…</option>
    </select>
  );
}

export default function CoberturaEstoque({
  linhas, dias, periodo, mes, colunasOcultas, onIrParaConfig,
}: {
  linhas: LinhaABC[]; dias: number; periodo: string; mes: string; colunasOcultas: string[]; onIrParaConfig: () => void;
}) {
  const [estoque, setEstoque] = useState<Map<string, number>>(new Map());
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState("");
  const [retornos, setRetornos] = useState<Record<string, string>>({});
  const [retornosCarregados, setRetornosCarregados] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erros, setErros] = useState<string[]>([]);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [ocultando, setOcultando] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [filtroCurva, setFiltroCurva] = useState("TODAS");
  const [filtroRetorno, setFiltroRetorno] = useState("TODOS");
  const [ordem, setOrdem] = useState<"FAT" | "QTD" | "QTD_ASC" | "VALOR" | "PDV" | "COBERTURA">("FAT");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  // upload do estoque do Tiny
  const [painel, setPainel] = useState(false);
  const [arquivo, setArquivo] = useState("");
  const [linhasArq, setLinhasArq] = useState<any[][]>([]);
  const [colSku, setColSku] = useState(-1);
  const [colQtd, setColQtd] = useState(-1);
  const [confirmoRemocao, setConfirmoRemocao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [padraoRegras, setPadraoRegras] = useState<{ sku: string; estoque: string }>({ sku: "", estoque: "" });

  const carregarEstoque = useCallback(async () => {
    const r = await lerTodos("cadastros_base_tiny", "id, sku, estoque, atualizado_em");
    const m = new Map<string, number>();
    let ultima = "";
    r.dados.forEach((x) => {
      const k = String(x.sku ?? "").trim();
      if (!k) return;
      m.set(k, (m.get(k) || 0) + (Number(x.estoque) || 0));
      if (x.atualizado_em && String(x.atualizado_em) > ultima) ultima = String(x.atualizado_em);
    });
    setEstoque(m); setUltimaAtualizacao(ultima);
    return r.erro;
  }, []);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const e: string[] = [];
      const err1 = await carregarEstoque(); if (err1) e.push(err1);
      const rg = await supabase.from("config_regras_tiny").select("campo, coluna").in("campo", ["sku", "estoque"]);
      const pad = { sku: "", estoque: "" };
      (rg.data || []).forEach((x: any) => { if (x.campo === "sku") pad.sku = String(x.coluna || ""); if (x.campo === "estoque") pad.estoque = String(x.coluna || ""); });
      setPadraoRegras(pad);
      setErros(e); setCarregando(false);
    })();
  }, [carregarEstoque]);

  // Retorno de compras é do MÊS: ao trocar de mês a lista volta em branco (ou com o que foi escolhido naquele mês)
  useEffect(() => {
    let cancelado = false;
    setRetornos({}); setRetornosCarregados(false);
    (async () => {
      let todos: any[] = [], de = 0, erro = "";
      for (;;) {
        const { data, error } = await supabase.from("curva_retorno_compras").select("id, sku, retorno").eq("mes", mes).order("id").range(de, de + 999);
        if (error) { erro = "curva_retorno_compras: " + error.message; break; }
        if (!data || data.length === 0) break;
        todos = todos.concat(data); de += 1000;
        if (data.length < 1000) break;
      }
      if (cancelado) return;
      const m: Record<string, string> = {};
      todos.forEach((x) => { if (x.sku && x.retorno) m[String(x.sku)] = String(x.retorno); });
      setRetornos(m); setRetornosCarregados(true);
      setErros((p) => [...p.filter((x) => !x.startsWith("curva_retorno_compras:")), ...(erro ? [erro] : [])]);
    })();
    return () => { cancelado = true; };
  }, [mes]);

  // ---- linhas calculadas ----
  const dados = useMemo(() => linhas.map((l) => {
    const temCadastro = estoque.has(l.skuNorm);
    const est = estoque.get(l.skuNorm) ?? 0;
    const c = calcularCobertura({ vendas: l.qtd, dias, estoque: est, curva: l.curva, titulo: l.titulo });
    return { ...l, estoque: est, temCadastro, ...c, retorno: retornos[l.skuNorm] || "" };
  }), [linhas, estoque, retornos, dias]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNorm = normalizarSkuEstoque(busca);
    let r = dados.filter((d) =>
      (!termo || d.sku.toLowerCase().includes(termo) || (!!termoNorm && d.skuNorm.includes(termoNorm)) || d.titulo.toLowerCase().includes(termo)) &&
      (filtroStatus === "TODOS" || d.status === filtroStatus) &&
      (filtroCurva === "TODAS" || d.curva === filtroCurva) &&
      (filtroRetorno === "TODOS" || (filtroRetorno === "SEM" ? !d.retorno : !!d.retorno)));
    const pdvUn = (d: { qtd: number; revenue: number }) => (d.qtd > 0 ? d.revenue / d.qtd : 0);
    if (ordem === "COBERTURA") r = [...r].sort((a, b) => a.coberturaDias - b.coberturaDias || b.revenue - a.revenue);
    else if (ordem === "QTD") r = [...r].sort((a, b) => b.qtd - a.qtd || b.revenue - a.revenue);
    else if (ordem === "QTD_ASC") r = [...r].sort((a, b) => a.qtd - b.qtd || a.revenue - b.revenue);
    else if (ordem === "VALOR") r = [...r].sort((a, b) => b.revenue - a.revenue);
    else if (ordem === "PDV") r = [...r].sort((a, b) => pdvUn(b) - pdvUn(a) || b.revenue - a.revenue);
    return r;
  }, [dados, filtroStatus, filtroCurva, filtroRetorno, ordem, busca]);

  useEffect(() => { setPagina(1); }, [filtroStatus, filtroCurva, filtroRetorno, ordem, busca, linhas, dias]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const totais = useMemo(() => {
    const vendas = filtradas.reduce((a, d) => a + d.qtd, 0);
    const valor = filtradas.reduce((a, d) => a + d.revenue, 0);
    return {
      vendas, valor, ticket: vendas > 0 ? valor / vendas : 0,
      sugestoes: dados.filter((d) => d.status === STATUS_SUGESTAO).length,
      validar: dados.filter((d) => d.status === STATUS_VALIDAR).length,
      semCadastro: dados.filter((d) => !d.temCadastro).length,
    };
  }, [filtradas, dados]);

  const oculta = (id: string) => ocultando && colunasOcultas.includes(id);
  const colunasVisiveis = COLUNAS_COBERTURA.filter((c) => !oculta(c.id));

  // ---- retorno de compras ----
  const salvarRetorno = async (l: { skuNorm: string }, texto: string) => {
    if (!retornosCarregados) return;   // ainda trocando de mês: não grava no mês errado
    const t = texto.trim();
    const mesDaGravacao = mes;
    const anterior = retornos[l.skuNorm] || "";
    if (t === anterior) return;
    setRetornos((p) => { const n = { ...p }; if (t) n[l.skuNorm] = t; else delete n[l.skuNorm]; return n; });
    const { error } = t
      ? await supabase.from("curva_retorno_compras").upsert({ mes: mesDaGravacao, sku: l.skuNorm, retorno: t, atualizado_por: usuarioLogado() || null, atualizado_em: new Date().toISOString() }, { onConflict: "mes,sku" })
      : await supabase.from("curva_retorno_compras").delete().eq("mes", mesDaGravacao).eq("sku", l.skuNorm);
    if (error && mesDaGravacao === mes) {
      setRetornos((p) => { const n = { ...p }; if (anterior) n[l.skuNorm] = anterior; else delete n[l.skuNorm]; return n; });
      setAviso({ tipo: "erro", texto: "Não consegui salvar o retorno: " + error.message });
    } else if (error) {
      setAviso({ tipo: "erro", texto: "Não consegui salvar o retorno: " + error.message });
    } else setAviso(null);
  };

  // ---- upload do estoque ----
  const colunasArq = useMemo(() => rotulosDasColunas(linhasArq), [linhasArq]);
  const leitura = useMemo(() => (linhasArq.length && colSku >= 0 && colQtd >= 0 ? lerEstoque(linhasArq, colSku, colQtd) : null), [linhasArq, colSku, colQtd]);
  const comparacao = useMemo(() => {
    if (!leitura) return null;
    const novos = new Set(leitura.registros.map((r) => r.sku));
    let removidos = 0, adicionados = 0;
    estoque.forEach((_, k) => { if (!novos.has(k)) removidos++; });
    novos.forEach((k) => { if (!estoque.has(k)) adicionados++; });
    return { removidos, adicionados, base: estoque.size, grandeRemocao: removidos > Math.max(50, estoque.size * 0.2) };
  }, [leitura, estoque]);

  const escolherArquivo = async (file: File | undefined | null) => {
    if (!file) return;
    setAviso(null); setConfirmoRemocao(false);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as any[][];
      if (!rows.length) { setAviso({ tipo: "erro", texto: "A planilha está vazia." }); return; }
      setLinhasArq(rows); setArquivo(file.name);
      const largura = rows.slice(0, 50).reduce((m, r) => Math.max(m, r?.length || 0), 0);
      // sugestão inicial = o que já está configurado em Regras/Uploads para o Tiny (ou a última escolha); o usuário confere e troca se quiser
      let sku = indiceDaLetra(padraoRegras.sku), qtd = indiceDaLetra(padraoRegras.estoque);
      try { const s = JSON.parse(localStorage.getItem("cobertura_colunas_estoque") || "null"); if (s) { sku = Number(s.sku); qtd = Number(s.qtd); } } catch { /* sem preferência salva */ }
      setColSku(sku >= 0 && sku < largura ? sku : -1);
      setColQtd(qtd >= 0 && qtd < largura ? qtd : -1);
    } catch (e: any) {
      setAviso({ tipo: "erro", texto: "Não consegui ler a planilha: " + (e?.message || e) });
    }
  };

  const substituirEstoque = async () => {
    if (!leitura || !comparacao || enviando) return;
    if (!leitura.registros.length) { setAviso({ tipo: "erro", texto: "Nenhum SKU foi lido com as colunas escolhidas." }); return; }
    if (comparacao.grandeRemocao && !confirmoRemocao) return;
    setEnviando(true); setAviso(null);
    const ts = new Date().toISOString();
    const payload = leitura.registros.map((r) => ({ sku: r.sku, estoque: r.estoque, atualizado_em: ts }));
    // 1) grava tudo (se algo falhar aqui, nada foi apagado); 2) remove quem não veio na planilha nova
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from("cadastros_base_tiny").upsert(payload.slice(i, i + 500), { onConflict: "sku" });
      if (error) { setEnviando(false); setAviso({ tipo: "erro", texto: `Falhou ao gravar (lote ${i / 500 + 1}): ${error.message}. Nada foi apagado; tente de novo.` }); return; }
    }
    const del = await supabase.from("cadastros_base_tiny").delete().lt("atualizado_em", ts);
    try { localStorage.setItem("cobertura_colunas_estoque", JSON.stringify({ sku: colSku, qtd: colQtd })); } catch { /* ok */ }
    await carregarEstoque();
    setEnviando(false);
    if (del.error) { setAviso({ tipo: "erro", texto: `Estoque gravado (${payload.length} SKUs), mas não consegui remover os que saíram da planilha: ${del.error.message}` }); return; }
    setAviso({ tipo: "ok", texto: `✅ Estoque da Sede substituído: ${payload.length} SKUs gravados${comparacao.removidos ? `, ${comparacao.removidos} ${comparacao.removidos === 1 ? "SKU que não estava" : "SKUs que não estavam"} na planilha ${comparacao.removidos === 1 ? "foi removido" : "foram removidos"}` : ""}.` });
    setPainel(false); setLinhasArq([]); setArquivo(""); setColSku(-1); setColQtd(-1); setConfirmoRemocao(false);
  };

  const statusCor = (s: string) =>
    s === STATUS_SUGESTAO ? "text-rose-400 font-black" : s === STATUS_VALIDAR ? "text-amber-300 font-bold" : "text-emerald-400 font-bold";
  const corCurva = (c: string) =>
    c === "A" ? "bg-indigo-950 text-indigo-400 border border-indigo-700/50" :
    c === "B" ? "bg-emerald-950 text-emerald-400 border border-emerald-700/50" : "bg-slate-800 text-slate-400 border border-slate-700";

  const celula = (id: string, d: (typeof dados)[number]) => {
    switch (id) {
      case "codigo": return <td key={id} data-col="codigo" className="py-2 px-3 font-mono text-indigo-300 whitespace-nowrap">{d.sku}</td>;
      case "produto": return <td key={id} data-col="produto" className="py-2 px-3 text-slate-200 min-w-[220px] max-w-[320px]">{d.titulo}</td>;
      case "vendas": return <td key={id} data-col="vendas" className="py-2 px-3 text-right font-bold text-slate-100">{d.qtd}</td>;
      case "valor": return <td key={id} data-col="valor" className="py-2 px-3 text-right font-mono text-slate-200 whitespace-nowrap">R$ {brl(d.revenue)}</td>;
      case "pct_individual": return <td key={id} data-col="pct_individual" className="py-2 px-3 text-right text-slate-300">{n2(d.pctRepresentatividade)}%</td>;
      case "pct_acumulado": return <td key={id} data-col="pct_acumulado" className="py-2 px-3 text-right text-slate-300">{n2(d.pctAcumulada)}%</td>;
      case "classificacao": return <td key={id} data-col="classificacao" className="py-2 px-3 text-center"><span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${corCurva(d.curva)}`}>{d.curva}</span></td>;
      case "media_diaria": return <td key={id} data-col="media_diaria" className="py-2 px-3 text-right text-slate-300">{n2(d.mediaDiaria)}</td>;
      case "estoque": return <td key={id} data-col="estoque" className={`py-2 px-3 text-right font-bold ${d.temCadastro ? "text-slate-100" : "text-slate-600"}`} title={d.temCadastro ? "" : "SKU não encontrado na base do Tiny"}>{d.estoque}</td>;
      case "cobertura_dias": return (
        <td key={id} data-col="cobertura_dias" className="py-2 px-3 text-right text-slate-200 whitespace-nowrap">
          {Number.isFinite(d.coberturaDias) ? <><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SEMAFORO[corCoberturaDias(d.coberturaDias)]}`} />{n1(d.coberturaDias)}</> : "—"}
        </td>
      );
      case "cobertura_meses": return (
        <td key={id} data-col="cobertura_meses" className="py-2 px-3 text-right text-slate-200 whitespace-nowrap">
          {Number.isFinite(d.coberturaMeses) ? <><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SEMAFORO[corCoberturaMeses(d.coberturaMeses)]}`} />{n2(d.coberturaMeses)}</> : "—"}
        </td>
      );
      case "status": return <td key={id} data-col="status" className={`py-2 px-3 whitespace-nowrap ${statusCor(d.status)}`}>{d.status}</td>;
      case "retorno": return <td key={id} data-col="retorno" className="py-2 px-3"><RetornoCelula valor={d.retorno} onSalvar={(t) => salvarRetorno(d, t)} /></td>;
      case "marca": return <td key={id} data-col="marca" className="py-2 px-3 text-slate-300 whitespace-nowrap">{d.marca}</td>;
      default: return null;
    }
  };

  const cabecalhoAlinhado = (id: string) => (["vendas", "valor", "pct_individual", "pct_acumulado", "media_diaria", "estoque", "cobertura_dias", "cobertura_meses"].includes(id) ? "text-right" : id === "classificacao" ? "text-center" : "text-left");

  return (
    <div className="space-y-5" data-cobertura>
      {erros.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-800/60 text-rose-200 rounded-xl p-4 text-xs space-y-1">
          <p className="font-black">⚠️ Parte dos dados não pôde ser lida do banco:</p>
          {erros.map((e, i) => <p key={i} className="font-mono">• {e}</p>)}
        </div>
      )}

      {/* RESUMO (some junto com as colunas Vendas/Valor quando elas estão ocultas) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" data-cobertura-resumo>
        {!oculta("vendas") && (
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800"><span className="text-[10px] font-bold text-slate-400 uppercase">Vendas (un.)</span><h3 className="text-xl font-black text-white" data-total-vendas>{totais.vendas}</h3></div>
        )}
        {!oculta("valor") && (
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800"><span className="text-[10px] font-bold text-slate-400 uppercase">Valor</span><h3 className="text-xl font-black text-white" data-total-valor>R$ {brl(totais.valor)}</h3></div>
        )}
        {!oculta("valor") && !oculta("vendas") && (
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800"><span className="text-[10px] font-bold text-slate-400 uppercase">Ticket médio</span><h3 className="text-xl font-black text-white" data-total-ticket>R$ {brl(totais.ticket)}</h3></div>
        )}
        <div className="bg-slate-900/90 p-4 rounded-2xl border border-rose-500/30"><span className="text-[10px] font-bold text-rose-400 uppercase">Sugestão de compra</span><h3 className="text-xl font-black text-rose-400" data-total-sugestoes>{totais.sugestoes} SKUs</h3></div>
        <div className="bg-slate-900/90 p-4 rounded-2xl border border-amber-500/30"><span className="text-[10px] font-bold text-amber-300 uppercase">Validar (não é curva A)</span><h3 className="text-xl font-black text-amber-300">{totais.validar} SKUs</h3></div>
        <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800"><span className="text-[10px] font-bold text-slate-400 uppercase">Estoque (Tiny)</span><h3 className="text-xl font-black text-white">{estoque.size} SKUs</h3>
          <p className="text-[9px] text-slate-500">{ultimaAtualizacao ? "atualizado " + new Date(ultimaAtualizacao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "sem data"}</p></div>
      </div>

      {/* BARRA DE AÇÕES */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
        <button type="button" onClick={() => setPainel((p) => !p)} data-abrir-upload
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black cursor-pointer">
          📦 {painel ? "Fechar" : "Subir estoque do Tiny"}
        </button>
        <button type="button" onClick={() => setOcultando((o) => !o)} data-ocultar-informacoes aria-pressed={ocultando}
          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer border ${ocultando ? "bg-amber-500/20 border-amber-500/60 text-amber-300" : "bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800"}`}>
          {ocultando ? "👁️ Mostrar informações" : "🙈 Ocultar informações"}
        </button>
        {ocultando && colunasOcultas.length === 0 && (
          <span className="text-[11px] text-amber-300 font-bold">Nenhuma coluna escolhida para ocultar.{" "}
            <button type="button" onClick={onIrParaConfig} className="underline cursor-pointer">Escolher em Configurações</button></span>
        )}
        {ocultando && colunasOcultas.length > 0 && (
          <span className="text-[11px] text-amber-300 font-bold" data-ocultas-aviso>{colunasOcultas.length} coluna(s) oculta(s)</span>
        )}

        <div className="flex flex-wrap gap-2 ml-auto items-center">
          <div className="flex gap-2 items-center bg-slate-950 border border-slate-700 rounded-xl px-2 py-2">
            <span className="text-slate-400 text-xs">🔍</span>
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar SKU ou produto…" data-busca-sku
              className="bg-transparent text-slate-200 font-bold text-xs outline-none w-44" />
            {busca && <button type="button" onClick={() => setBusca("")} title="Limpar" className="text-slate-500 hover:text-slate-200 text-xs cursor-pointer">✕</button>}
          </div>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} data-filtro-status className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-200 outline-none cursor-pointer">
            <option value="TODOS">Todos os status</option>
            {TODOS_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filtroCurva} onChange={(e) => setFiltroCurva(e.target.value)} data-filtro-curva className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-200 outline-none cursor-pointer">
            <option value="TODAS">Todas as curvas</option><option value="A">Curva A</option><option value="B">Curva B</option><option value="C">Curva C</option>
          </select>
          <select value={filtroRetorno} onChange={(e) => setFiltroRetorno(e.target.value)} data-filtro-retorno className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-200 outline-none cursor-pointer">
            <option value="TODOS">Retorno: todos</option><option value="SEM">Sem retorno</option><option value="COM">Com retorno</option>
          </select>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as any)} data-ordem className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-200 outline-none cursor-pointer">
            <option value="FAT">Ordem: faturamento (Curva ABC)</option>
            <option value="QTD">Ordem: mais vendidos (unidades)</option>
            <option value="QTD_ASC">Ordem: menos vendidos (unidades)</option>
            <option value="VALOR">Ordem: maior valor vendido (R$)</option>
            <option value="PDV">Ordem: maior PDV (preço médio por unidade)</option>
            <option value="COBERTURA">Ordem: menor cobertura primeiro</option>
          </select>
        </div>
      </div>

      {aviso && (
        <div data-aviso className={`rounded-xl p-3 text-xs font-bold border ${aviso.tipo === "ok" ? "bg-emerald-950/40 border-emerald-700/50 text-emerald-300" : "bg-rose-950/40 border-rose-800/60 text-rose-200"}`}>{aviso.texto}</div>
      )}

      {/* UPLOAD DO ESTOQUE */}
      {painel && (
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-indigo-500/30 space-y-4" data-upload-painel>
          <div>
            <h3 className="font-black text-white text-sm">Subir estoque do Tiny</h3>
            <p className="text-[11px] text-slate-400">Só o SKU e a quantidade são guardados. Você escolhe as colunas. <strong className="text-amber-300">O estoque da Sede é substituído por completo</strong> (a aba Fulfillment e a de Cadastros usam essa mesma base).</p>
          </div>
          <input type="file" accept=".xls,.xlsx,.csv" data-upload-arquivo onChange={(e) => { escolherArquivo(e.target.files?.[0]); e.target.value = ""; }}
            className="block text-xs text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:font-bold file:cursor-pointer" />

          {linhasArq.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400"><strong className="text-slate-200">{arquivo}</strong> — {linhasArq.length} linhas, {colunasArq.length} colunas</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-[11px] font-bold text-indigo-300">Coluna do SKU
                  <select value={colSku} onChange={(e) => { setColSku(Number(e.target.value)); setConfirmoRemocao(false); }} data-col-sku className="mt-1 w-full bg-slate-950 border border-indigo-500/50 rounded-lg px-2 py-2 text-xs text-slate-100 outline-none cursor-pointer">
                    <option value={-1}>— escolha —</option>
                    {colunasArq.map((c) => <option key={c.indice} value={c.indice}>{c.rotulo}</option>)}
                  </select></label>
                <label className="text-[11px] font-bold text-emerald-300">Coluna da quantidade em estoque
                  <select value={colQtd} onChange={(e) => { setColQtd(Number(e.target.value)); setConfirmoRemocao(false); }} data-col-qtd className="mt-1 w-full bg-slate-950 border border-emerald-500/50 rounded-lg px-2 py-2 text-xs text-slate-100 outline-none cursor-pointer">
                    <option value={-1}>— escolha —</option>
                    {colunasArq.map((c) => <option key={c.indice} value={c.indice}>{c.rotulo}</option>)}
                  </select></label>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800" data-upload-previa>
                <table className="w-full text-[11px]">
                  <thead><tr className="bg-slate-950 text-slate-400">
                    {colunasArq.slice(0, 10).map((c) => (
                      <th key={c.indice} className={`p-2 text-left ${c.indice === colSku ? "text-indigo-300 bg-indigo-950/40" : c.indice === colQtd ? "text-emerald-300 bg-emerald-950/40" : ""}`}>{c.letra}{c.indice === colSku ? " · SKU" : c.indice === colQtd ? " · Qtd" : ""}</th>
                    ))}</tr></thead>
                  <tbody>{linhasArq.slice(0, 6).map((r, i) => (
                    <tr key={i} className="border-t border-slate-800 text-slate-300">
                      {colunasArq.slice(0, 10).map((c) => <td key={c.indice} className={`p-2 max-w-[180px] truncate ${c.indice === colSku ? "bg-indigo-950/20" : c.indice === colQtd ? "bg-emerald-950/20" : ""}`}>{String(r[c.indice] ?? "")}</td>)}
                    </tr>))}</tbody>
                </table>
              </div>

              {leitura && comparacao && (
                <div className="space-y-2 text-[11px]" data-upload-resumo>
                  <p className="text-slate-300">Com essas colunas: <strong className="text-white">{leitura.registros.length} SKUs</strong> lidos
                    {leitura.repetidos.length > 0 && <> · {leitura.repetidos.length} SKU(s) repetido(s) tiveram as quantidades somadas</>}
                    {leitura.semQuantidade > 0 && <> · {leitura.semQuantidade} linha(s) ignorada(s) (quantidade em texto, ex.: cabeçalho)</>}
                    {leitura.semSku > 0 && <> · {leitura.semSku} sem SKU</>}.</p>
                  <p className="text-slate-400">Base atual: {comparacao.base} SKUs → <span className="text-emerald-400">{comparacao.adicionados} novos</span> · <span className={comparacao.removidos ? "text-rose-400" : ""}>{comparacao.removidos} sairão da base</span> (não estão na planilha).</p>
                  <p className="text-slate-500">Exemplo lido: {leitura.registros.slice(0, 3).map((r) => `${r.sku} = ${r.estoque}`).join(" · ")}</p>
                  {comparacao.grandeRemocao && (
                    <label className="flex items-center gap-2 text-amber-300 font-bold cursor-pointer" data-confirmar-remocao>
                      <input type="checkbox" checked={confirmoRemocao} onChange={(e) => setConfirmoRemocao(e.target.checked)} />
                      Confirmo que {comparacao.removidos} SKUs saem da base (confira se escolheu as colunas certas).
                    </label>
                  )}
                  <button type="button" onClick={substituirEstoque} disabled={enviando || (comparacao.grandeRemocao && !confirmoRemocao) || leitura.registros.length === 0} data-substituir-estoque
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                    {enviando ? "Gravando…" : "Substituir estoque da Sede"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TABELA */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-wrap justify-between gap-2">
          <div>
            <h3 className="font-black text-white text-sm">Cobertura de Estoque por SKU</h3>
            <p className="text-[11px] text-slate-400">Período: {periodo} · média diária = vendas ÷ {dias} dia(s) · meta de cobertura: 2 meses (roupão: 2,5) · <strong className="text-indigo-300" data-mes-retorno>retorno de compras de {mes.slice(5)}/{mes.slice(0, 4)}</strong></p>
          </div>
          <p className="text-[11px] text-slate-500 self-end" data-contagem>{filtradas.length} SKUs {totais.semCadastro > 0 && <>· {totais.semCadastro} sem cadastro no Tiny (estoque 0)</>}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-cobertura-tabela>
            <thead>
              <tr className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                {colunasVisiveis.map((c) => <th key={c.id} data-col={c.id} className={`py-2.5 px-3 font-bold ${cabecalhoAlinhado(c.id)}`}>{c.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td colSpan={colunasVisiveis.length || 1} className="p-6 text-center text-slate-500 font-bold">Carregando…</td></tr>}
              {!carregando && visiveis.map((d) => (
                <tr key={d.skuNorm} data-linha-sku={d.skuNorm} className="border-t border-slate-800/70 hover:bg-slate-800/30">
                  {colunasVisiveis.map((c) => celula(c.id, d))}
                </tr>
              ))}
              {!carregando && filtradas.length === 0 && <tr><td colSpan={colunasVisiveis.length || 1} className="p-6 text-center text-slate-500 font-bold">Nenhum SKU para este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="flex justify-between items-center p-3 border-t border-slate-800 text-xs">
            <span className="text-slate-400 font-bold">Página {paginaAtual} de {totalPaginas}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPagina(Math.max(1, paginaAtual - 1))} disabled={paginaAtual === 1} data-pag-anterior className="px-3 py-1.5 bg-slate-950 border border-slate-700 hover:bg-slate-800 rounded-lg text-slate-300 disabled:opacity-30 font-bold cursor-pointer">Anterior</button>
              <button type="button" onClick={() => setPagina(Math.min(totalPaginas, paginaAtual + 1))} disabled={paginaAtual === totalPaginas} data-pag-proxima className="px-3 py-1.5 bg-slate-950 border border-slate-700 hover:bg-slate-800 rounded-lg text-slate-300 disabled:opacity-30 font-bold cursor-pointer">Próxima</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
