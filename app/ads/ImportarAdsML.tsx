"use client";
// Adsense do Mercado Livre: envio das duas planilhas (Anúncios patrocinados e Relatório de vendas). Salva o mês, cruza e
// espelha os anúncios na Análise global. Os lançamentos manuais e as Sugestões de Ads continuam como estavam.
import React, { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { lerRelatorioPatrocinados, lerRelatorioVendas, mesDoPeriodo, type LeituraPads, type LeituraVendas } from "../../lib/adsMl";
import { excluirAtualML, registrarEnvio } from "../../lib/adsMlDb";
import { useDadosML } from "./useDadosML";
import { NUM, R$, ROAS, PCT, dataBR, quando } from "./fmtML";

type Props = { canal: string; mes: string; setMes: (m: string) => void; meses: string[]; onMudou?: () => void };   // mes: só o de reserva, quando o arquivo não informa o período

async function lerAba(arquivo: File, aba: string): Promise<{ linhas: any[][] | null; abas: string[] }> {
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
  const nome = wb.SheetNames.find((n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim() === aba.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim());
  return { linhas: nome ? (XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: "", raw: true }) as any[][]) : null, abas: wb.SheetNames };
}

const card = (titulo: string, valor: string, sub?: string, cor = "text-white") => (
  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titulo}</div>
    <div className={`text-lg font-black mt-1 ${cor}`}>{valor}</div>
    {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

export default function ImportarAdsML({ canal, mes, setMes, meses, onMudou }: Props) {
  const { slug, pads, vendas, mes: mesAtual, anterior, ctx, cfg, analise, carregando, recarregar } = useDadosML(canal);
  const [arqPads, setArqPads] = useState<File | null>(null);
  const [arqVendas, setArqVendas] = useState<File | null>(null);
  const [lidoPads, setLidoPads] = useState<LeituraPads | null>(null);
  const [lidoVendas, setLidoVendas] = useState<LeituraVendas | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "aviso"; texto: string } | null>(null);

  const escolherPads = async (f: File | null) => {
    setArqPads(f); setLidoPads(null); setMsg(null);
    if (!f) return;
    setLendo(true);
    try {
      const { linhas, abas } = await lerAba(f, "Relatório Anúncios patrocinados");
      if (!linhas) { setMsg({ tipo: "erro", texto: `Não achei a aba “Relatório Anúncios patrocinados” (abas: ${abas.join(", ")}).` }); return; }
      const r = lerRelatorioPatrocinados(linhas);
      if (r.erro) { setMsg({ tipo: "erro", texto: r.erro }); return; }
      setLidoPads(r);
    } catch (e: any) { setMsg({ tipo: "erro", texto: "Não consegui ler a planilha: " + (e?.message || e) }); }
    finally { setLendo(false); }
  };
  const escolherVendas = async (f: File | null) => {
    setArqVendas(f); setLidoVendas(null); setMsg(null);
    if (!f) return;
    setLendo(true);
    try {
      const { linhas, abas } = await lerAba(f, "Relatório de vendas");
      if (!linhas) { setMsg({ tipo: "erro", texto: `Não achei a aba “Relatório de vendas” (abas: ${abas.join(", ")}).` }); return; }
      const r = lerRelatorioVendas(linhas);
      if (r.erro) { setMsg({ tipo: "erro", texto: r.erro }); return; }
      setLidoVendas(r);
    } catch (e: any) { setMsg({ tipo: "erro", texto: "Não consegui ler a planilha: " + (e?.message || e) }); }
    finally { setLendo(false); }
  };

  const salvar = async () => {
    if (!ctx || (!lidoPads && !lidoVendas)) return;
    setSalvando(true); setMsg(null);
    try {
      const r = await registrarEnvio(supabase, slug, canal, ctx, cfg, mes === "TODOS" ? (meses[0] || "") : mes, {
        pads: lidoPads ? { arq: arqPads?.name || "", leitura: lidoPads } : undefined,
        vendas: lidoVendas ? { arq: arqVendas?.name || "", leitura: lidoVendas } : undefined,
      });
      if (r.erro) { setMsg({ tipo: "erro", texto: r.erro }); return; }
      setLidoPads(null); setLidoVendas(null); setArqPads(null); setArqVendas(null);
      document.querySelectorAll<HTMLInputElement>("[data-ml-arq]").forEach((i) => { i.value = ""; });
      if (r.mes && meses.includes(r.mes)) setMes(r.mes);   // a lista manual abaixo passa a mostrar o mesmo mês
      recarregar(); onMudou?.();
      setMsg({ tipo: r.avisos.length ? "aviso" : "ok", texto: ["Salvo e cruzado" + (r.mes ? " (competência " + r.mes + ")" : "") + ".", ...r.avisos].join(" ") });
    } finally { setSalvando(false); }
  };

  const apagar = async () => {
    if (!confirm(`Apagar o relatório atual do Mercado Livre${mesAtual ? " (" + mesAtual + ")" : ""}? Os anúncios dele também saem da Análise global. Os lançamentos manuais não são afetados.`)) return;
    setSalvando(true);
    const erro = await excluirAtualML(supabase, slug);
    setSalvando(false);
    if (erro) setMsg({ tipo: "erro", texto: erro }); else { setMsg({ tipo: "ok", texto: "Relatório atual apagado." }); recarregar(); onMudou?.(); }
  };

  const t = analise?.tot;
  return (
    <div className="space-y-6" data-importar-ml>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">📥 Importar planilhas — {canal}</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">Envie o <strong>Relatório de anúncios patrocinados</strong> (só entram os anúncios com investimento acima de R$ 0,00) e o <strong>Relatório de vendas</strong> do mesmo período. Cada novo envio passa a valer nas telas e o anterior fica guardado só para a comparação em “Atual vs anterior”. O app acha o SKU de cada MLB no cadastro de anúncios, busca o custo e calcula a liquidez real de cada anúncio, inclusive as vendas de outros produtos que ele puxou.</p>
          </div>
          {mesAtual && <div data-competencia className="text-right"><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Em vigor</div><div className="text-sm font-black text-white">{mesAtual}</div><div className="text-[10px] text-slate-500">{anterior ? `anterior guardada: ${anterior.mes}` : "sem relatório anterior"}</div></div>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">1. Relatório de anúncios patrocinados</label>
            <input type="file" accept=".xlsx,.xls" data-ml-arq data-arq-pads onChange={(e) => escolherPads(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-700 file:text-white file:font-bold cursor-pointer" />
            <p data-status-pads className="text-[10px] mt-1 text-slate-500">
              {pads ? `Salva: ${pads.anuncios.length} anúncios com investimento (${pads.semInvestimento} sem investimento ignorados) · ${dataBR(pads.periodo.ini)} a ${dataBR(pads.periodo.fim)} · enviada em ${quando(pads.importadoEm)}` : "Nenhuma planilha de patrocinados salva."}
            </p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">2. Relatório de vendas por publicidade</label>
            <input type="file" accept=".xlsx,.xls" data-ml-arq data-arq-vendas onChange={(e) => escolherVendas(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:font-bold cursor-pointer" />
            <p data-status-vendas className="text-[10px] mt-1 text-slate-500">
              {vendas ? `Salva: ${vendas.vendas.length} cruzamentos anúncio × produto vendido · ${dataBR(vendas.periodo.ini)} a ${dataBR(vendas.periodo.fim)} · enviada em ${quando(vendas.importadoEm)}` : "Nenhuma planilha de vendas salva."}
            </p>
          </div>
        </div>
        {(lidoPads || lidoVendas) && (
          <div className="mt-4 text-[11px] text-sky-300 bg-sky-950/20 border border-sky-900/40 rounded-xl p-3 space-y-1" data-previa-ml>
            {lidoPads && <div>Patrocinados: <strong>{lidoPads.anuncios.length}</strong> anúncios com investimento · {lidoPads.semInvestimento} sem investimento (ignorados) · total investido <strong>{R$(lidoPads.anuncios.reduce((s, a) => s + a.investimento, 0))}</strong> · período {dataBR(lidoPads.periodo.ini)} a {dataBR(lidoPads.periodo.fim)}</div>}
            {lidoVendas && <div>Vendas: <strong>{lidoVendas.vendas.length}</strong> cruzamentos · {NUM(lidoVendas.vendas.reduce((s, v) => s + v.un, 0))} unidades · {R$(lidoVendas.vendas.reduce((s, v) => s + v.rec, 0))} em vendas · período {dataBR(lidoVendas.periodo.ini)} a {dataBR(lidoVendas.periodo.fim)}</div>}
            <div className="text-slate-400">Confira e clique em Salvar. A competência vem do período da planilha{lidoPads ? ` (${mesDoPeriodo(lidoPads.periodo) || "não informado"})` : ""}.</div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button type="button" data-salvar-ml disabled={salvando || lendo || carregando || (!lidoPads && !lidoVendas)} onClick={salvar} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">{salvando ? "Salvando…" : lendo ? "Lendo…" : "💾 Salvar e cruzar"}</button>
          {(pads || vendas) && <button type="button" data-apagar-ml disabled={salvando} onClick={apagar} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">🗑️ Apagar relatório atual</button>}
          {msg && <span data-msg-importar-ml className={`text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-400" : msg.tipo === "erro" ? "text-rose-400" : "text-amber-400"}`}>{msg.texto}</span>}
        </div>
      </div>

      {!carregando && !pads && <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-500">Nenhuma planilha do Mercado Livre enviada. Envie as planilhas acima para começar.</div>}
      {analise && t && (
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-resumo-ml>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-white">Resumo de {mesAtual}</h3>
            <span className="text-[11px] text-slate-500">Detalhe por anúncio e recomendações na sub-aba “Análise dos anúncios”.</span>
          </div>
          {analise.semCruzamento && <p className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3 mb-4">Falta a planilha de vendas: por enquanto a liquidez usa só as vendas informadas na planilha de patrocinados. Envie a de vendas para cruzar com o que foi vendido sem patrocínio.</p>}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {card("Investimento", R$(t.investimento), `${analise.anuncios.length} anúncios`)}
            {card("Retorno", R$(t.receita), `${R$(t.receitaDir)} diretas · ${R$(t.receitaInd)} indiretas`)}
            {card("ROAS", ROAS(t.roas), "retorno ÷ investimento")}
            {card("Liquidez", R$(t.liquidez), "após custo, taxas e anúncio", t.liquidez >= 0 ? "text-emerald-400" : "text-rose-400")}
            {card("ROI", PCT(t.roi), "liquidez ÷ investimento", (t.roi ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}
            {card("Vendas s/ patrocínio", String(analise.haloTot.mlbs), `${NUM(analise.haloTot.un)} un. puxadas pelos anúncios`)}
          </div>
          {(t.semCusto > 0 || t.semCadastro > 0) && <p className="text-[11px] text-amber-300 mt-3" data-aviso-custo>⚠ {t.semCadastro > 0 ? `${t.semCadastro} anúncio(s) com MLB que não está no cadastro de anúncios do ML (usei comissão de 14% e frete padrão). ` : ""}{t.semCusto > 0 ? `${t.semCusto} anúncio(s) com SKU sem custo cadastrado: a liquidez deles está maior que a real.` : ""}</p>}
        </div>
      )}
    </div>
  );
}
