"use client";
// Ferramentas > Consulta líquida (aba provisória).
// Sobe uma planilha com ID do pedido, PDV e repasse (você diz em quais colunas estão). Cada pedido é procurado na base de vendas
// (vendas_canais), o SKU é descoberto, e o líquido sai de: repasse − custo do SKU × quantidade − imposto (PDV × 9%).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import { indiceDaLetra } from "../../lib/cobertura";
import { canaisSemRepeticao } from "../../lib/vendasCanaisLogica";
import { lerArquivoComoLinhas } from "../../lib/lerArquivo";
import { IMPOSTO_PADRAO_PCT, consultar, indexarBase, indexarCustos, totalizar, type ResultadoLinha, type StatusConsulta } from "../../lib/consultaLiquidaLogica";
import Navbar from "../components/Navbar";

const CHAVE_FORM = "bestfit_consulta_liquida_form";   // só lembra as últimas colunas (conveniência)
const CANAIS_PADRAO = ["TikTok", "Mercado Livre 1", "Mercado Livre 2", "Shopee", "Amazon", "Magalu", "Netshoes", "Centauro", "Shein", "Site"];
const LIMITE_TELA = 300;
const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

interface Form { linha: string; colPedido: string; colPdv: string; colRepasse: string; imposto: string }
const FORM_VAZIO: Form = { linha: "2", colPedido: "A", colPdv: "B", colRepasse: "C", imposto: String(IMPOSTO_PADRAO_PCT) };

const ROTULO: Record<StatusConsulta, string> = { ok: "Calculado", sem_pedido: "Pedido não encontrado", sem_custo: "SKU sem custo", sem_valor: "PDV/repasse inválido", repetido: "Repetido (calculado)" };
const COR: Record<StatusConsulta, string> = { ok: "text-emerald-400", repetido: "text-sky-300", sem_pedido: "text-rose-400", sem_custo: "text-amber-400", sem_valor: "text-amber-400" };

export default function ConsultaLiquidaPage() {
  const router = useRouter();
  const [canais, setCanais] = useState<string[]>(CANAIS_PADRAO);
  const [canal, setCanal] = useState("TikTok");
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro" | "info"; linhas: string[] } | null>(null);
  const [resultados, setResultados] = useState<ResultadoLinha[]>([]);
  const [arquivo, setArquivo] = useState("");
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
    const iPed = indiceDaLetra(form.colPedido), iPdv = indiceDaLetra(form.colPdv), iRep = indiceDaLetra(form.colRepasse);
    const linhaInicial = parseInt(form.linha, 10);
    const imposto = Number(String(form.imposto).replace(",", "."));
    if (iPed < 0 || iPdv < 0 || iRep < 0) return setAviso({ tipo: "erro", linhas: ["Informe as letras das colunas do ID do pedido, do PDV e do repasse (ex.: A, B, C)."] });
    if (new Set([iPed, iPdv, iRep]).size < 3) return setAviso({ tipo: "erro", linhas: ["As três colunas precisam ser diferentes."] });
    if (!(linhaInicial >= 1)) return setAviso({ tipo: "erro", linhas: ["A linha inicial deve ser 1 ou mais (use 2 se a primeira linha for o cabeçalho)."] });
    if (!(imposto >= 0 && imposto < 100)) return setAviso({ tipo: "erro", linhas: ["Informe o imposto entre 0 e 99,9%."] });

    setProcessando(true); setAviso(null); setResultados([]);
    try { localStorage.setItem(CHAVE_FORM, JSON.stringify(form)); } catch { /* sem localStorage: só não lembra */ }
    try {
      const linhas = await lerArquivoComoLinhas(f);
      const [vendas, custos] = await Promise.all([
        buscarTudo("vendas_canais", "id_pedido,canal,sku,quantidade", (q) => (canal === "__todos" ? q : q.eq("canal", canal))),
        buscarTudo("tabela_custos_skus", "sku,custo_unitario"),
      ]);
      const { resultados: rs, ignoradas } = consultar(linhas, { linhaInicial, colPedido: iPed, colPdv: iPdv, colRepasse: iRep, impostoPct: imposto }, indexarBase(vendas as any[]), indexarCustos(custos as any[]));
      setResultados(rs); setArquivo(f.name); setImpostoUsado(imposto); setFiltro("todos");
      const t = totalizar(rs);
      const linhasAviso = [`${f.name}: ${rs.length} pedido(s) lido(s) — ${t.calculadas} calculado(s)${t.semPedido ? `, ${t.semPedido} não encontrado(s) na base` : ""}${t.semCusto ? `, ${t.semCusto} com SKU sem custo` : ""}${t.semValor ? `, ${t.semValor} com PDV/repasse inválido` : ""}.`];
      if (rs.length === 0) linhasAviso.push(`Nenhuma linha a partir da linha ${linhaInicial}. Confira a linha inicial e as colunas.`);
      if (t.semPedido > 0 && t.semPedido === rs.length) linhasAviso.push(`Nenhum pedido foi achado na base de ${canal === "__todos" ? "todos os canais" : canal}. Confira o canal e se a coluna ${form.colPedido.toUpperCase()} é mesmo o ID do pedido (e se as vendas desse canal já foram enviadas em Uploads Base).`);
      if (ignoradas) linhasAviso.push(`${ignoradas} linha(s) em branco ignorada(s).`);
      setAviso({ tipo: t.calculadas > 0 ? "ok" : "info", linhas: linhasAviso });
    } catch (e: any) {
      setAviso({ tipo: "erro", linhas: ["Erro ao processar a planilha: " + (e?.message || e)] });
    }
    setProcessando(false);
  };

  const totais = useMemo(() => totalizar(resultados), [resultados]);
  const visiveis = useMemo(() => resultados.filter((r) => filtro === "todos" ? true : filtro === "pendentes" ? r.liquido == null : r.status === filtro), [resultados, filtro]);

  const baixar = () => {
    const dados = visiveis.map((r) => ({
      "Linha da planilha": r.linha, "ID do pedido": r.idPedido, "Canal": r.canal ?? "", "SKU": r.skus.map((s) => s.sku).join(" + "), "Qtd": r.skus.reduce((s, i) => s + i.quantidade, 0) || "",
      "PDV": r.pdv ?? "", "Repasse": r.repasse ?? "", "Custo do SKU": r.custo ?? "", [`Imposto (${impostoUsado}%)`]: r.imposto ?? "", "Líquido": r.liquido ?? "",
      "Margem sobre o PDV (%)": r.margemPct == null ? "" : Math.round(r.margemPct * 10) / 10, "Situação": ROTULO[r.status], "Observação": r.detalhe,
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consulta líquida");
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
              Escolha o canal e diga em quais colunas estão o <b className="text-slate-200">ID do pedido</b>, o <b className="text-slate-200">PDV</b> e o <b className="text-slate-200">repasse</b>.
              Para cada pedido o painel procura o SKU na base de vendas, pega o custo do SKU (× a quantidade) e o imposto sobre o PDV, e calcula:
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
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Col. do PDV</label>
              <input type="text" maxLength={3} value={form.colPdv} onChange={(e) => setForm({ ...form, colPdv: e.target.value.toUpperCase() })} data-col-pdv className={campo + " font-mono text-center font-bold"} />
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
          <p className="text-[10px] text-slate-500 max-w-4xl">Se o mesmo pedido tem mais de um SKU na base, os custos de todos entram (custo × quantidade de cada um). IDs grandes (como os do TikTok) precisam estar como texto na planilha: se o Excel os tiver virado número com “E+17”, os últimos dígitos já foram perdidos e o pedido não será achado.</p>
        </div>

        {resultados.length > 0 && (
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4" data-resultado>
            <div className="grid grid-cols-2 md:grid-cols-6 divide-x divide-slate-800 rounded-xl border border-slate-800" data-totais>
              {[["Pedidos calculados", `${totais.calculadas} de ${totais.linhas}`], ["PDV", brl(totais.pdv)], ["Repasse", brl(totais.repasse)], ["Custo dos SKUs", brl(totais.custo)], [`Imposto (${impostoUsado}%)`, brl(totais.imposto)], ["Líquido", `${brl(totais.liquido)}${totais.margemPct != null ? ` · ${pct(totais.margemPct)}` : ""}`]].map(([t, v]) => (
                <div key={t} className="px-4 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{t}</p><p data-total={t} className="text-base font-black text-white">{v}</p></div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} data-filtro className={campo + " !w-auto cursor-pointer"}>
                <option value="todos">Todas as linhas ({resultados.length})</option>
                <option value="pendentes">Sem líquido calculado ({resultados.filter((r) => r.liquido == null).length})</option>
                {(["ok", "repetido", "sem_pedido", "sem_custo", "sem_valor"] as StatusConsulta[]).map((s) => <option key={s} value={s}>{ROTULO[s]} ({resultados.filter((r) => r.status === s).length})</option>)}
              </select>
              <button data-acao="baixar" onClick={baixar} className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-wider cursor-pointer">⬇ Baixar Excel{filtro !== "todos" ? " (filtrado)" : ""}</button>
              <span className="text-[11px] text-slate-500">{arquivo}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="py-2 pr-3">Linha</th><th className="py-2 pr-3">ID do pedido</th><th className="py-2 pr-3">SKU</th><th className="py-2 pr-3 text-right">Qtd</th><th className="py-2 pr-3 text-right">PDV</th><th className="py-2 pr-3 text-right">Repasse</th>
                    <th className="py-2 pr-3 text-right">Custo</th><th className="py-2 pr-3 text-right">Imposto</th><th className="py-2 pr-3 text-right">Líquido</th><th className="py-2 pr-3 text-right">Margem</th><th className="py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.slice(0, LIMITE_TELA).map((r) => (
                    <tr key={r.linha} data-linha-resultado={r.idPedido} data-status={r.status} className="border-b border-slate-800/60">
                      <td className="py-2 pr-3 text-slate-500">{r.linha}</td>
                      <td className="py-2 pr-3 font-mono text-slate-200 whitespace-nowrap">{r.idPedido || "—"}</td>
                      <td className="py-2 pr-3 text-slate-300">{r.skus.length ? r.skus.map((s) => <span key={s.sku} className="block whitespace-nowrap">{s.sku}{s.custoUnitario == null ? " ⚠" : ""}</span>) : "—"}</td>
                      <td className="py-2 pr-3 text-right text-slate-300">{r.skus.length ? r.skus.reduce((s, i) => s + i.quantidade, 0) : "—"}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(r.pdv)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(r.repasse)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(r.custo)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{brl(r.imposto)}</td>
                      <td data-liquido className={`py-2 pr-3 text-right font-black whitespace-nowrap ${r.liquido == null ? "text-slate-500" : r.liquido < 0 ? "text-rose-400" : "text-emerald-400"}`}>{brl(r.liquido)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{pct(r.margemPct)}</td>
                      <td className={`py-2 font-bold ${COR[r.status]}`} title={r.detalhe}>{ROTULO[r.status]}{r.detalhe && r.status !== "ok" ? <span className="block text-[10px] font-normal text-slate-500">{r.detalhe}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visiveis.length > LIMITE_TELA && <p className="text-[11px] text-slate-500 mt-2">Mostrando {LIMITE_TELA} de {visiveis.length} linhas. O Excel baixado leva todas.</p>}
            </div>
            <p className="text-[10px] text-slate-500">Os totais somam só os pedidos com líquido calculado. O imposto é {impostoUsado}% do PDV; o custo é o custo unitário do SKU (Uploads Base) × a quantidade do pedido na base de vendas.</p>
          </div>
        )}
      </div>
    </div>
  );
}
