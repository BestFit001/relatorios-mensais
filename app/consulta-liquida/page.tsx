"use client";
// Ferramentas > Consulta líquida (aba provisória).
// Sobe uma planilha com ID do pedido e repasse (você diz em quais colunas estão; o PDV da planilha é opcional, só conferência).
// Cada pedido é procurado na base de vendas (vendas_canais): o SKU, a quantidade e o PDV vêm da venda cadastrada, igual ao dashboard.
// Líquido = repasse da planilha − custo do SKU × quantidade − imposto (9% do PDV cadastrado). Mostra por pedido e por produto.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import { indiceDaLetra } from "../../lib/cobertura";
import { canaisSemRepeticao } from "../../lib/vendasCanaisLogica";
import { lerArquivoComoLinhas } from "../../lib/lerArquivo";
import { IMPOSTO_PADRAO_PCT, consultar, indexarBase, indexarCustos, porProduto, totalizar, type LinhaIgnoradaStatus, type ResultadoLinha, type StatusConsulta } from "../../lib/consultaLiquidaLogica";
import Navbar from "../components/Navbar";

const CHAVE_FORM = "bestfit_consulta_liquida_form";   // só lembra as últimas colunas (conveniência)
const CANAIS_PADRAO = ["TikTok", "Mercado Livre 1", "Mercado Livre 2", "Shopee", "Amazon", "Magalu", "Netshoes", "Centauro", "Shein", "Site"];
const LIMITE_TELA = 300;
const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

interface Form { linha: string; colPedido: string; colPdv: string; colRepasse: string; imposto: string; colStatus: string; ignorar: string }
const FORM_VAZIO: Form = { linha: "2", colPedido: "A", colPdv: "B", colRepasse: "C", imposto: String(IMPOSTO_PADRAO_PCT), colStatus: "", ignorar: "" };

const ROTULO: Record<StatusConsulta, string> = { ok: "Calculado", sem_pedido: "Pedido não encontrado", sem_custo: "SKU sem custo", sem_valor: "PDV/repasse inválido", somado: "Vários repasses somados" };
const COR: Record<StatusConsulta, string> = { ok: "text-emerald-400", somado: "text-sky-300", sem_pedido: "text-rose-400", sem_custo: "text-amber-400", sem_valor: "text-amber-400" };

export default function ConsultaLiquidaPage() {
  const router = useRouter();
  const [canais, setCanais] = useState<string[]>(CANAIS_PADRAO);
  const [canal, setCanal] = useState("TikTok");
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro" | "info"; linhas: string[] } | null>(null);
  const [resultados, setResultados] = useState<ResultadoLinha[]>([]);
  const [arquivo, setArquivo] = useState("");
  const [ignoradosStatus, setIgnoradosStatus] = useState<LinhaIgnoradaStatus[]>([]);
  const [visao, setVisao] = useState<"pedido" | "produto">("pedido");
  const [filtro, setFiltro] = useState<"todos" | StatusConsulta | "pendentes">("todos");
  const [impostoUsado, setImpostoUsado] = useState(IMPOSTO_PADRAO_PCT);

  const carregarCanais = useCallback(async () => {
    const { data } = await supabase.from("config_regras_canais").select("canal").order("id");
    const lista = canaisSemRepeticao((data || []).map((r: any) => r.canal));
    if (lista.length) { setCanais(lista); setCanal((c) => (lista.includes(c) ? c : (lista.find((x) => /tiktok/i.test(x)) || lista[0]))); }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    try { const s = JSON.parse(localStorage.getItem(CHAVE_FORM) || "null"); if (s) setForm({ ...FORM_VAZIO, ...s }); } catch { /* sem memória: usa o padrão */ }
    carregarCanais().catch(() => { /* usa a lista padrão */ });
  }, [carregarCanais, router]);

  const processar = async (arquivos: File[]) => {
    const f = arquivos[0]; if (!f) return;
    const iPed = indiceDaLetra(form.colPedido), iRep = indiceDaLetra(form.colRepasse);
    const usaPdvPlanilha = form.colPdv.trim() !== "";
    const iPdv = usaPdvPlanilha ? indiceDaLetra(form.colPdv) : -1;
    const linhaInicial = parseInt(form.linha, 10);
    const imposto = Number(String(form.imposto).replace(",", "."));
    const usaStatus = form.colStatus.trim() !== "";
    const iStatus = usaStatus ? indiceDaLetra(form.colStatus) : -1;
    if (iPed < 0 || iRep < 0 || (usaPdvPlanilha && iPdv < 0)) return setAviso({ tipo: "erro", linhas: ["Informe as letras das colunas do ID do pedido e do repasse (ex.: A, C). A do PDV é opcional."] });
    if (new Set([iPed, iRep, ...(usaPdvPlanilha ? [iPdv] : [])]).size < (usaPdvPlanilha ? 3 : 2)) return setAviso({ tipo: "erro", linhas: ["As colunas precisam ser diferentes."] });
    if (usaStatus && iStatus < 0) return setAviso({ tipo: "erro", linhas: ["Coluna do status inválida: use só a letra (ex.: N)."] });
    if (!usaStatus && form.ignorar.trim()) return setAviso({ tipo: "erro", linhas: ["Você escreveu o que ignorar, mas não informou a coluna do status."] });
    if (!(linhaInicial >= 1)) return setAviso({ tipo: "erro", linhas: ["A linha inicial deve ser 1 ou mais (use 2 se a primeira linha for o cabeçalho)."] });
    if (!(imposto >= 0 && imposto < 100)) return setAviso({ tipo: "erro", linhas: ["Informe o imposto entre 0 e 99,9%."] });

    setProcessando(true); setAviso(null); setResultados([]); setIgnoradosStatus([]);
    try { localStorage.setItem(CHAVE_FORM, JSON.stringify(form)); } catch { /* sem localStorage: só não lembra */ }
    try {
      const linhas = await lerArquivoComoLinhas(f);
      const [vendas, custos] = await Promise.all([
        buscarTudo("vendas_canais", "id_pedido,canal,sku,quantidade,preco_venda", (q) => (canal === "__todos" ? q : q.eq("canal", canal))),
        buscarTudo("tabela_custos_skus", "sku,custo_unitario,produto,marca"),
      ]);
      const { resultados: rs, ignoradas, ignoradasStatus } = consultar(linhas, { linhaInicial, colPedido: iPed, colPdv: iPdv, colRepasse: iRep, impostoPct: imposto, colStatus: iStatus, ignorarStatus: form.ignorar }, indexarBase(vendas as any[]), indexarCustos(custos as any[]));
      setResultados(rs); setIgnoradosStatus(ignoradasStatus); setArquivo(f.name); setImpostoUsado(imposto); setFiltro("todos"); setVisao("pedido");
      const t = totalizar(rs);
      const linhasAviso = [`${f.name}: ${rs.length} pedido(s) lido(s) — ${t.calculadas} calculado(s)${t.semPedido ? `, ${t.semPedido} não encontrado(s) na base` : ""}${t.semCusto ? `, ${t.semCusto} com SKU sem custo` : ""}${t.semValor ? `, ${t.semValor} com PDV/repasse inválido` : ""}.`];
      if (rs.length === 0) linhasAviso.push(`Nenhuma linha a partir da linha ${linhaInicial}. Confira a linha inicial e as colunas.`);
      if (t.semPedido > 0 && t.semPedido === rs.length) linhasAviso.push(`Nenhum pedido foi achado na base de ${canal === "__todos" ? "todos os canais" : canal}. Confira o canal e se a coluna ${form.colPedido.toUpperCase()} é mesmo o ID do pedido (e se as vendas desse canal já foram enviadas em Uploads Base).`);
      if (ignoradasStatus.length) linhasAviso.push(`${ignoradasStatus.length} linha(s) ignorada(s) pelo status “${form.ignorar.trim()}” (coluna ${form.colStatus.trim().toUpperCase()}): não entram na conta nem nos totais. Elas estão na aba “Ignorados pelo status” do Excel.`);
      if (usaStatus && form.ignorar.trim() && ignoradasStatus.length === 0) linhasAviso.push(`Nenhuma linha tinha “${form.ignorar.trim()}” na coluna ${form.colStatus.trim().toUpperCase()}. Confira se é a coluna certa.`);
      if (ignoradas) linhasAviso.push(`${ignoradas} linha(s) ignorada(s) (em branco, cabeçalho ou observações do relatório).`);
      setAviso({ tipo: t.calculadas > 0 ? "ok" : "info", linhas: linhasAviso });
    } catch (e: any) {
      setAviso({ tipo: "erro", linhas: ["Erro ao processar a planilha: " + (e?.message || e)] });
    }
    setProcessando(false);
  };

  const totais = useMemo(() => totalizar(resultados), [resultados]);
  const produtos = useMemo(() => porProduto(resultados), [resultados]);
  const [ordemProd, setOrdemProd] = useState<"maior" | "menor" | "unidades">("maior");
  const produtosOrdenados = useMemo(() => [...produtos].sort((a, b) => ordemProd === "menor" ? a.liquido - b.liquido : ordemProd === "unidades" ? b.unidades - a.unidades : b.liquido - a.liquido), [produtos, ordemProd]);
  const visiveis = useMemo(() => resultados.filter((r) => filtro === "todos" ? true : filtro === "pendentes" ? r.liquido == null : r.status === filtro), [resultados, filtro]);

  const baixar = () => {
    const dados = visiveis.map((r) => ({
      "Linha(s) da planilha": r.linhasPlanilha.join(", "), "ID do pedido": r.idPedido, "Canal": r.canal ?? "", "SKU": r.skus.map((x) => x.sku).join(" + "), "Produto": r.skus.map((x) => x.produto).filter(Boolean).join(" + "), "Qtd": r.skus.reduce((q, i) => q + i.quantidade, 0) || "",
      "PDV (venda cadastrada)": r.pdv ?? "", "PDV da planilha": r.pdvPlanilha ?? "", "Repasse": r.repasse ?? "", "Custo (CMV)": r.custo ?? "", [`Imposto (${impostoUsado}% do PDV)`]: r.imposto ?? "", "Líquido": r.liquido ?? "",
      "Margem sobre o PDV (%)": r.margemPct == null ? "" : Math.round(r.margemPct * 10) / 10, "Situação": ROTULO[r.status], "Observação": r.detalhe,
    }));
    const itens = visiveis.flatMap((r) => r.skus.map((x) => ({
      "ID do pedido": r.idPedido, "SKU": x.sku, "Produto": x.produto, "Marca": x.marca, "Qtd": x.quantidade, "PDV": x.pdv, "Repasse (parte do item)": x.repasse ?? "", "Custo unitário": x.custoUnitario ?? "", "Custo (CMV)": x.custo ?? "",
      [`Imposto (${impostoUsado}%)`]: x.imposto ?? "", "Líquido do item": x.liquido ?? "", "Situação do pedido": ROTULO[r.status],
    })));
    const prod = produtosOrdenados.map((p) => ({
      "SKU": p.sku, "Produto": p.produto, "Marca": p.marca, "Unidades": p.unidades, "Pedidos": p.pedidos, "PDV": p.pdv, "Repasse": p.repasse, "Custo (CMV)": p.custo, [`Imposto (${impostoUsado}%)`]: p.imposto,
      "Líquido": p.liquido, "Líquido por unidade": p.liquidoPorUnidade ?? "", "Margem sobre o PDV (%)": p.margemPct == null ? "" : Math.round(p.margemPct * 10) / 10,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), "Por pedido");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prod), "Por produto");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itens), "Itens dos pedidos");
    if (ignoradosStatus.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ignoradosStatus.map((x) => ({ "Linha da planilha": x.linha, "ID do pedido": x.idPedido, "Status": x.status }))), "Ignorados pelo status");
    XLSX.writeFile(wb, `consulta_liquida_${canal.replace(/[^a-zA-Z0-9]+/g, "-")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const campo = "w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500";

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Consulta líquida</h1>
            <p className="text-sm font-medium text-slate-400">Ferramenta provisória: do pedido, PDV e repasse da planilha ao líquido depois do custo do SKU e do imposto</p>
          </div>
          <Navbar />
        </div>

        {aviso && (
          <div data-aviso className={`p-4 rounded-xl border text-sm font-semibold flex items-start justify-between gap-3 ${
            aviso.tipo === "erro" ? "border-rose-900/60 bg-rose-950/40 text-rose-300" : aviso.tipo === "ok" ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300" : "border-amber-900/60 bg-amber-950/40 text-amber-300"}`}>
            <div className="space-y-1">{aviso.linhas.map((l, i) => <p key={i} className={i === 0 ? "" : "text-xs font-medium opacity-90"}>{l}</p>)}</div>
            <button type="button" onClick={() => setAviso(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">✕</button>
          </div>
        )}

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">Subir a planilha</h2>
            <p className="text-[11px] text-slate-400 mt-1 max-w-4xl">
              Escolha o canal e diga em quais colunas estão o <b className="text-slate-200">ID do pedido</b> e o <b className="text-slate-200">repasse</b>.
              Para cada pedido o painel procura a venda cadastrada na base (SKU, quantidade e PDV, como no dashboard), pega o custo do SKU (× a quantidade) e o imposto sobre o PDV cadastrado, e calcula:
              <span className="font-mono text-slate-300"> líquido = repasse − custo − imposto</span>.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Canal (onde o pedido é procurado)</label>
              <select value={canal} onChange={(e) => setCanal(e.target.value)} data-canal className={campo + " cursor-pointer font-bold"}>
                {canais.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__todos">Todos os canais</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Linha inicial</label>
              <input type="number" min={1} value={form.linha} onChange={(e) => setForm({ ...form, linha: e.target.value })} data-linha className={campo + " font-mono"} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. do ID do pedido</label>
              <input type="text" maxLength={3} value={form.colPedido} onChange={(e) => setForm({ ...form, colPedido: e.target.value.toUpperCase() })} data-col-pedido className={campo + " font-mono text-center font-bold"} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. do PDV (opcional)</label>
              <input type="text" maxLength={3} value={form.colPdv} onChange={(e) => setForm({ ...form, colPdv: e.target.value.toUpperCase() })} data-col-pdv placeholder="—" className={campo + " font-mono text-center font-bold"} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. do repasse</label>
              <input type="text" maxLength={3} value={form.colRepasse} onChange={(e) => setForm({ ...form, colRepasse: e.target.value.toUpperCase() })} data-col-repasse className={campo + " font-mono text-center font-bold"} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Imposto sobre o PDV (%)</label>
              <input type="text" inputMode="decimal" value={form.imposto} onChange={(e) => setForm({ ...form, imposto: e.target.value })} data-imposto className={campo + " font-mono text-center font-bold"} />
            </div>
            <div className="col-span-2 md:col-span-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Planilha (xlsx, xls, csv)</label>
              <input type="file" accept=".xlsx,.xls,.csv,.txt" disabled={processando} data-upload
                onChange={(e) => { const a = Array.from(e.target.files || []); e.target.value = ""; processar(a); }}
                className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-700" />
              {processando && <p className="text-xs text-slate-400 mt-2">Lendo a planilha e consultando a base…</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. do status (opcional)</label>
              <input type="text" maxLength={3} value={form.colStatus} onChange={(e) => setForm({ ...form, colStatus: e.target.value.toUpperCase() })} data-col-status placeholder="ex.: N" className={campo + " font-mono text-center font-bold"} />
            </div>
            <div className="col-span-2 md:col-span-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ignorar linhas cujo status contenha</label>
              <input type="text" value={form.ignorar} onChange={(e) => setForm({ ...form, ignorar: e.target.value })} data-ignorar placeholder="ex.: cancelado   ou   cancelado; devolvido" className={campo} />
              <p className="text-[10px] text-slate-500 mt-1">Ignora maiúsculas e acentos. “cancelado” já pega “Pedido cancelado”. Use <b className="text-slate-300">;</b> para mais de um termo. Essas linhas não entram na conta nem nos totais.</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 max-w-4xl">Pedido de carrinho (o mesmo ID em várias linhas da planilha, uma por item): os repasses de todas as linhas são somados e os custos de todos os SKUs da venda entram (custo × quantidade de cada um). O PDV da planilha não entra na conta (se informado, só avisa quando difere do cadastrado). IDs grandes (como os do TikTok) precisam estar como texto na planilha: se o Excel os tiver virado número com “E+17”, os últimos dígitos já foram perdidos e o pedido não será achado.</p>
        </div>

        {(resultados.length > 0 || ignoradosStatus.length > 0) && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-resultado>
            <div className="grid grid-cols-2 md:grid-cols-6 divide-x divide-slate-800 rounded-xl border border-slate-800" data-totais>
              {[["Pedidos calculados", `${totais.calculadas} de ${totais.linhas}`], ["PDV", brl(totais.pdv)], ["Repasse", brl(totais.repasse)], ["Custo dos SKUs", brl(totais.custo)], [`Imposto (${impostoUsado}%)`, brl(totais.imposto)], ["Líquido", `${brl(totais.liquido)}${totais.margemPct != null ? ` · ${pct(totais.margemPct)}` : ""}`]].map(([t, v]) => (
                <div key={t} className="px-4 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{t}</p><p data-total={t} className="text-base font-black text-white">{v}</p></div>
              ))}
            </div>
            {ignoradosStatus.length > 0 && (
              <details data-ignorados className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-2 text-xs text-slate-400">
                <summary className="cursor-pointer font-bold text-slate-300">{ignoradosStatus.length} linha(s) ignorada(s) pelo status</summary>
                <ul className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
                  {ignoradosStatus.slice(0, 200).map((x) => <li key={x.linha} className="font-mono">linha {x.linha} · {x.idPedido} · {x.status || "—"}</li>)}
                  {ignoradosStatus.length > 200 && <li>… e mais {ignoradosStatus.length - 200} (todas na aba “Ignorados pelo status” do Excel)</li>}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-slate-700 overflow-hidden text-xs font-black uppercase tracking-wider">
                {(["pedido", "produto"] as const).map((v) => (
                  <button key={v} type="button" data-visao={v} onClick={() => setVisao(v)} className={`px-4 py-2 cursor-pointer ${visao === v ? "bg-indigo-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white"}`}>{v === "pedido" ? "Por pedido" : "Por produto"}</button>
                ))}
              </div>
              {visao === "pedido" ? (
                <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} data-filtro className={campo + " !w-auto cursor-pointer"}>
                  <option value="todos">Todas as linhas ({resultados.length})</option>
                  <option value="pendentes">Sem líquido calculado ({resultados.filter((r) => r.liquido == null).length})</option>
                  {(["ok", "somado", "sem_pedido", "sem_custo", "sem_valor"] as StatusConsulta[]).map((s) => <option key={s} value={s}>{ROTULO[s]} ({resultados.filter((r) => r.status === s).length})</option>)}
                </select>
              ) : (
                <select value={ordemProd} onChange={(e) => setOrdemProd(e.target.value as any)} data-ordem-produto className={campo + " !w-auto cursor-pointer"}>
                  <option value="maior">Maior líquido primeiro</option>
                  <option value="menor">Menor líquido primeiro (prejuízo no topo)</option>
                  <option value="unidades">Mais unidades vendidas</option>
                </select>
              )}
              <button data-acao="baixar" onClick={baixar} className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-wider cursor-pointer">⬇ Baixar Excel{visao === "pedido" && filtro !== "todos" ? " (filtrado)" : ""}</button>
              <span className="text-[11px] text-slate-500">{arquivo}</span>
            </div>
            {visao === "pedido" ? (
            <div className="overflow-x-auto" data-tabela="pedido">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="py-2 pr-3">Linha</th><th className="py-2 pr-3">ID do pedido</th><th className="py-2 pr-3">SKU</th><th className="py-2 pr-3 text-right">Qtd</th><th className="py-2 pr-3 text-right">PDV (base)</th><th className="py-2 pr-3 text-right">Repasse</th>
                    <th className="py-2 pr-3 text-right">Custo</th><th className="py-2 pr-3 text-right">Imposto</th><th className="py-2 pr-3 text-right">Líquido</th><th className="py-2 pr-3 text-right">Margem</th><th className="py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.slice(0, LIMITE_TELA).map((r) => (
                    <tr key={r.linha} data-linha-resultado={r.idPedido} data-status={r.status} className="border-b border-slate-800/60">
                      <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{r.linhasPlanilha.join(", ")}</td>
                      <td className="py-2 pr-3 font-mono text-slate-200 whitespace-nowrap">{r.idPedido || "—"}</td>
                      <td className="py-2 pr-3 text-slate-300">{r.skus.length ? r.skus.map((x) => <span key={x.sku} className="block whitespace-nowrap" title={x.produto}>{x.sku}{x.custoUnitario == null ? " ⚠" : ""}</span>) : "—"}</td>
                      <td className="py-2 pr-3 text-right text-slate-300">{r.skus.length ? r.skus.reduce((q, i) => q + i.quantidade, 0) : "—"}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(r.pdv)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(r.repasse)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(r.custo)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(r.imposto)}</td>
                      <td data-liquido className={`py-2 pr-3 text-right font-black whitespace-nowrap ${r.liquido == null ? "text-slate-500" : r.liquido < 0 ? "text-rose-400" : "text-emerald-400"}`}>{brl(r.liquido)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{pct(r.margemPct)}</td>
                      <td className={`py-2 font-bold ${COR[r.status]}`} title={r.detalhe}>{ROTULO[r.status]}{r.detalhe ? <span className="block text-[10px] font-normal text-slate-500">{r.detalhe}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visiveis.length > LIMITE_TELA && <p className="text-[11px] text-slate-500 mt-2">Mostrando {LIMITE_TELA} de {visiveis.length} linhas. O Excel baixado leva todas.</p>}
            </div>
            ) : (
            <div className="overflow-x-auto" data-tabela="produto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="py-2 pr-3">SKU</th><th className="py-2 pr-3">Produto</th><th className="py-2 pr-3 text-right">Unid.</th><th className="py-2 pr-3 text-right">Pedidos</th><th className="py-2 pr-3 text-right">PDV</th><th className="py-2 pr-3 text-right">Repasse</th>
                    <th className="py-2 pr-3 text-right">Custo</th><th className="py-2 pr-3 text-right">Imposto</th><th className="py-2 pr-3 text-right">Líquido</th><th className="py-2 pr-3 text-right">Líq./unid.</th><th className="py-2 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosOrdenados.slice(0, LIMITE_TELA).map((p) => (
                    <tr key={p.sku} data-linha-produto={p.sku} className="border-b border-slate-800/60">
                      <td className="py-2 pr-3 font-mono text-slate-200 whitespace-nowrap">{p.sku}</td>
                      <td className="py-2 pr-3 text-slate-300 max-w-[360px] truncate" title={p.produto}>{p.produto || "—"}{p.marca ? <span className="block text-[10px] text-slate-500">{p.marca}</span> : null}</td>
                      <td className="py-2 pr-3 text-right text-slate-300">{p.unidades}</td>
                      <td className="py-2 pr-3 text-right text-slate-300">{p.pedidos}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(p.pdv)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(p.repasse)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(p.custo)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(p.imposto)}</td>
                      <td data-liquido-produto className={`py-2 pr-3 text-right font-black whitespace-nowrap ${p.liquido < 0 ? "text-rose-400" : "text-emerald-400"}`}>{brl(p.liquido)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(p.liquidoPorUnidade)}</td>
                      <td className="py-2 text-right text-slate-300 whitespace-nowrap">{pct(p.margemPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {produtos.length === 0 && <p className="text-[11px] text-slate-500 mt-2">Nenhum produto com líquido calculado.</p>}
              {produtos.length > LIMITE_TELA && <p className="text-[11px] text-slate-500 mt-2">Mostrando {LIMITE_TELA} de {produtos.length} produtos. O Excel baixado leva todos.</p>}
            </div>
            )}
            <p className="text-[10px] text-slate-500">Os totais somam só os pedidos com líquido calculado. O imposto é {impostoUsado}% do PDV da venda cadastrada na base; o custo é o custo unitário do SKU (Uploads Base) × a quantidade da venda cadastrada. Por produto, o repasse de um pedido com vários itens é dividido na proporção do PDV de cada um.</p>
          </div>
        )}
      </div>
    </div>
  );
}
