"use client";
// Adsense do Mercado Livre: envio das duas planilhas (Anúncios patrocinados e Relatório de vendas). Salva o mês, cruza e
// espelha os anúncios na Análise global. Os lançamentos manuais e as Sugestões de Ads continuam como estavam.
import React, { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { lerRelatorioPatrocinados, lerRelatorioVendas, mesDoPeriodo, type LeituraPads, type LeituraVendas } from "../../lib/adsMl";
import { campanhasDoAtual, excluirAtualML, excluirCampanhaML, planejarPads, registrarEnvio } from "../../lib/adsMlDb";
import { chaveCampanha, totaisAnuncios } from "../../lib/adsMl";
import SeletorCampanhaML from "./SeletorCampanhaML";
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
  const { slug, atual, pads, vendas, mes: mesAtual, anterior, ctx, cfg, analise, carregando, recarregar } = useDadosML(canal);
  const [arqPads, setArqPads] = useState<File | null>(null);
  const [arqVendas, setArqVendas] = useState<File | null>(null);
  const [lidoPads, setLidoPads] = useState<LeituraPads | null>(null);
  const [lidoVendas, setLidoVendas] = useState<LeituraVendas | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "aviso"; texto: string } | null>(null);
  const [campSel, setCampSel] = useState<string>("todas");   // "todas" = Geral (soma das campanhas)

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
    if (!confirm(`Apagar TODAS as campanhas em vigor do Mercado Livre${mesAtual ? " (" + mesAtual + ")" : ""}? Os anúncios delas também saem da Análise global. Os lançamentos manuais não são afetados.`)) return;
    setSalvando(true);
    const erro = await excluirAtualML(supabase, slug);
    setSalvando(false);
    if (erro) setMsg({ tipo: "erro", texto: erro }); else { setMsg({ tipo: "ok", texto: "Relatório atual apagado." }); recarregar(); onMudou?.(); }
  };

  const apagarCampanha = async (chave: string, nome: string) => {
    if (!ctx) return;
    if (!confirm(`Apagar a campanha “${nome}”? Os anúncios dela também saem da Análise global; as outras campanhas continuam.`)) return;
    setSalvando(true);
    const erro = await excluirCampanhaML(supabase, slug, canal, ctx, cfg, chave);
    setSalvando(false);
    if (erro) setMsg({ tipo: "erro", texto: erro }); else { setMsg({ tipo: "ok", texto: `Campanha “${nome}” apagada.` }); recarregar(); onMudou?.(); }
  };

  const camps = campanhasDoAtual(atual);
  const plano = lidoPads ? planejarPads(atual, lidoPads.anuncios, lidoPads.periodo, mes === "TODOS" ? (meses[0] || "") : mes) : null;
  const porCamp = new Map<string, ReturnType<typeof totaisAnuncios>>();
  camps.forEach((c) => porCamp.set(c.chave, totaisAnuncios((analise?.anuncios || []).filter((a) => chaveCampanha(a.campanha) === c.chave))));
  const sel = campSel !== "todas" && camps.some((c) => c.chave === campSel) ? campSel : "todas";
  const anunciosSel = (analise?.anuncios || []).filter((a) => sel === "todas" || chaveCampanha(a.campanha) === sel);
  const t = analise ? (sel === "todas" ? analise.tot : porCamp.get(sel) || totaisAnuncios([])) : null;
  const nomeSel = sel === "todas" ? "" : camps.find((c) => c.chave === sel)?.nome || "";
  const indiretos = new Set<string>(); let indUn = 0;
  anunciosSel.forEach((a) => a.itens.filter((i) => !a.semCruzamento && !i.direta && !i.patrocinado).forEach((i) => { indiretos.add(i.mlb); indUn += i.un; }));
  const geral = analise?.tot;
  const mesCorrente = `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
  return (
    <div className="space-y-6" data-importar-ml>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        {mesAtual && mesAtual !== mesCorrente && (
          <div data-aviso-mes className="mb-4 bg-amber-950/30 border border-amber-900/50 text-amber-200 text-xs rounded-xl px-4 py-3">
            ⚠️ O relatório em vigor é de <strong>{mesAtual}</strong>{pads?.periodo?.ini ? ` (período ${dataBR(pads.periodo.ini)} a ${dataBR(pads.periodo.fim)})` : ""}, e o mês atual é <strong>{mesCorrente}</strong>. A competência vem do período que está <em>dentro da planilha</em> (campo “Desde”), não da data do envio. Para ver {mesCorrente} aqui, exporte o relatório do Mercado Livre com o período do mês atual e envie de novo.
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">📥 Importar planilhas — {canal}</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">Envie o <strong>Relatório de anúncios patrocinados</strong> (só entram os anúncios com investimento acima de R$ 0,00) e o <strong>Relatório de vendas</strong> do mesmo período. Cada campanha tem o seu envio: <strong>uma campanha nova é somada às que já estão em vigor</strong>, e reenviar a mesma campanha atualiza só ela (o envio anterior dela fica guardado para a comparação em “Atual vs anterior”). O app acha o SKU de cada MLB no cadastro de anúncios, busca o custo e calcula a liquidez real de cada anúncio, inclusive as vendas de outros produtos que ele puxou.</p>
          </div>
          {mesAtual && <div data-competencia className="text-right"><div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Em vigor</div><div className="text-sm font-black text-white">{mesAtual}</div>{pads?.periodo?.ini && <div className="text-[10px] text-slate-300" data-periodo-vigor>período {dataBR(pads.periodo.ini)} a {dataBR(pads.periodo.fim)}</div>}<div className="text-[10px] text-slate-500">{anterior ? `anterior guardada: ${anterior.mes}` : "sem relatório anterior"}</div></div>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">1. Relatório de anúncios patrocinados</label>
            <input type="file" accept=".xlsx,.xls" data-ml-arq data-arq-pads onChange={(e) => escolherPads(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-700 file:text-white file:font-bold cursor-pointer" />
            <p data-status-pads className="text-[10px] mt-1 text-slate-500">
              {pads ? `Em vigor: ${pads.anuncios.length} anúncios com investimento em ${camps.length} campanha(s) · último envio em ${quando(pads.importadoEm)}` : "Nenhuma planilha de patrocinados salva."}
            </p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">2. Relatório de vendas por publicidade</label>
            <input type="file" accept=".xlsx,.xls" data-ml-arq data-arq-vendas onChange={(e) => escolherVendas(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:font-bold cursor-pointer" />
            <p data-status-vendas className="text-[10px] mt-1 text-slate-500">
              {vendas ? `Em vigor: ${vendas.vendas.length} cruzamentos anúncio × produto vendido · último envio em ${quando(vendas.importadoEm)}` : "Nenhuma planilha de vendas salva."}
            </p>
          </div>
        </div>
        {(lidoPads || lidoVendas) && (
          <div className="mt-4 text-[11px] text-sky-300 bg-sky-950/20 border border-sky-900/40 rounded-xl p-3 space-y-1" data-previa-ml>
            {lidoPads && <div>Patrocinados: <strong>{lidoPads.anuncios.length}</strong> anúncios com investimento · {lidoPads.semInvestimento} sem investimento (ignorados) · total investido <strong>{R$(lidoPads.anuncios.reduce((s, a) => s + a.investimento, 0))}</strong> · período {dataBR(lidoPads.periodo.ini)} a {dataBR(lidoPads.periodo.fim)}</div>}
            {lidoVendas && <div>Vendas: <strong>{lidoVendas.vendas.length}</strong> cruzamentos · {NUM(lidoVendas.vendas.reduce((s, v) => s + v.un, 0))} unidades · {R$(lidoVendas.vendas.reduce((s, v) => s + v.rec, 0))} em vendas · período {dataBR(lidoVendas.periodo.ini)} a {dataBR(lidoVendas.periodo.fim)}</div>}
            {plano && (
              <ul data-plano-ml className="text-slate-300 space-y-0.5">
                {plano.trocaMes && <li className="text-amber-300">Competência nova ({plano.mes}): o que está em vigor ({atual?.mes}) vai para o “Atual vs anterior” e este envio abre o mês.</li>}
                {plano.campanhas.map((c) => (
                  <li key={c.chave} data-plano-camp={c.chave}>
                    <strong>{c.nome}</strong> ({c.n} anúncios): {c.acao === "nova" ? (plano.trocaMes || camps.length === 0 ? "entra como campanha em vigor." : "campanha nova, será somada às que já estão em vigor.") : c.acao === "corrige" ? "mesmo período de um envio já salvo: corrige essa campanha." : `novo período (antes ${dataBR(c.periodoAnterior?.ini ?? null)} a ${dataBR(c.periodoAnterior?.fim ?? null)}): atualiza só essa campanha; o envio anterior dela vai para a comparação.`}
                  </li>
                ))}
              </ul>
            )}
            <div className="text-slate-400">Confira e clique em Salvar. A competência vem do período da planilha{lidoPads ? ` (${mesDoPeriodo(lidoPads.periodo) || "não informado"})` : ""}.</div>
            {lidoPads && mesDoPeriodo(lidoPads.periodo) && mesDoPeriodo(lidoPads.periodo) !== mesCorrente && <div data-aviso-mes-previa className="text-amber-300">⚠️ O período desta planilha é de {mesDoPeriodo(lidoPads.periodo)}, não do mês atual ({mesCorrente}). Se queria o mês atual, exporte o relatório com o período certo antes de salvar.</div>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button type="button" data-salvar-ml disabled={salvando || lendo || carregando || (!lidoPads && !lidoVendas)} onClick={salvar} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">{salvando ? "Salvando…" : lendo ? "Lendo…" : "💾 Salvar e cruzar"}</button>
          {(pads || vendas) && <button type="button" data-apagar-ml disabled={salvando} onClick={apagar} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">🗑️ Apagar todas as campanhas</button>}
          {msg && <span data-msg-importar-ml className={`text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-400" : msg.tipo === "erro" ? "text-rose-400" : "text-amber-400"}`}>{msg.texto}</span>}
        </div>
      </div>

      {!carregando && !pads && <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-500">Nenhuma planilha do Mercado Livre enviada. Envie as planilhas acima para começar.</div>}
      {camps.length > 0 && (
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-campanhas-ml>
          <h3 className="text-sm font-bold text-white mb-1">Campanhas em vigor ({camps.length})</h3>
          <p className="text-[11px] text-slate-500 mb-3">Campanhas de períodos que se sobrepõem convivem: o resumo, a Análise global e o “Atual vs anterior” somam todas.</p>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold text-[10px]"><tr><th className="p-3">Campanha</th><th className="p-3">Período</th><th className="p-3 text-right">Anúncios</th><th className="p-3 text-right">Investimento</th><th className="p-3 text-right">Retorno</th><th className="p-3 text-right">Liquidez</th><th className="p-3 text-right">ROI</th><th className="p-3">Último envio</th><th className="p-3"></th></tr></thead>
              <tbody className="divide-y divide-slate-800/70">
                {camps.map((c) => (
                  <tr key={c.chave} data-camp-ml={c.chave}>
                    <td className="p-3 font-bold text-slate-100">{c.nome}</td>
                    <td className="p-3 text-slate-300">{dataBR(c.periodo.ini)} a {dataBR(c.periodo.fim)}</td>
                    <td className="p-3 text-right">{c.n}</td>
                    <td className="p-3 text-right">{R$(porCamp.get(c.chave)?.investimento || 0)}</td>
                    <td className="p-3 text-right">{R$(porCamp.get(c.chave)?.receita || 0)}</td>
                    <td className={`p-3 text-right font-bold ${(porCamp.get(c.chave)?.liquidez || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{R$(porCamp.get(c.chave)?.liquidez || 0)}</td>
                    <td className="p-3 text-right">{PCT(porCamp.get(c.chave)?.roi ?? null)}</td>
                    <td className="p-3 text-slate-400">{quando(c.importadoEm)}</td>
                    <td className="p-3 text-right"><button type="button" data-apagar-camp-ml={c.chave} disabled={salvando} onClick={() => apagarCampanha(c.chave, c.nome)} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">🗑️ apagar</button></td>
                  </tr>
                ))}
              </tbody>
              {camps.length > 1 && geral && (
                <tfoot data-camp-geral className="bg-slate-950 border-t border-slate-700 font-bold text-slate-100">
                  <tr>
                    <td className="p-3">Geral (soma das campanhas)</td><td className="p-3 text-slate-500 font-normal">—</td>
                    <td className="p-3 text-right">{camps.reduce((n, c) => n + c.n, 0)}</td>
                    <td className="p-3 text-right">{R$(geral.investimento)}</td><td className="p-3 text-right">{R$(geral.receita)}</td>
                    <td className={`p-3 text-right ${geral.liquidez >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{R$(geral.liquidez)}</td>
                    <td className="p-3 text-right">{PCT(geral.roi)}</td><td className="p-3"></td><td className="p-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
      {analise && t && (
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-resumo-ml>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-white" data-titulo-resumo-ml>Resumo de {mesAtual} — {sel === "todas" ? (camps.length > 1 ? `Geral (soma das ${camps.length} campanhas)` : "Geral") : nomeSel}</h3>
            <span className="text-[11px] text-slate-500">Detalhe por anúncio e recomendações na sub-aba “Análise dos anúncios”.</span>
          </div>
          {camps.length > 1 && <div className="mb-4"><SeletorCampanhaML attr={{ "data-seletor-resumo-ml": "" }} valor={sel} onChange={setCampSel} opcoes={camps.map((c) => ({ chave: c.chave, nome: c.nome }))} /></div>}
          {!analise.semCruzamento && analise.campanhasSemVendas.length > 0 && <p data-aviso-camp-sem-vendas className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3 mb-4">Falta a planilha de vendas de: <strong>{analise.campanhasSemVendas.join(", ")}</strong>. Até enviar, a liquidez dessas campanhas usa só as vendas da planilha de patrocinados.</p>}
          {analise.semCruzamento && <p className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3 mb-4">Falta a planilha de vendas: por enquanto a liquidez usa só as vendas informadas na planilha de patrocinados. Envie a de vendas para cruzar com o que foi vendido sem patrocínio.</p>}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {card("Investimento", R$(t.investimento), `${anunciosSel.length} anúncios`)}
            {card("Retorno", R$(t.receita), `${R$(t.receitaDir)} diretas · ${R$(t.receitaInd)} indiretas`)}
            {card("ROAS", ROAS(t.roas), "retorno ÷ investimento")}
            {card("Liquidez", R$(t.liquidez), "após custo, taxas e anúncio", t.liquidez >= 0 ? "text-emerald-400" : "text-rose-400")}
            {card("ROI", PCT(t.roi), "liquidez ÷ investimento", (t.roi ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}
            {card("Vendas s/ patrocínio", String(sel === "todas" ? analise.haloTot.mlbs : indiretos.size), `${NUM(sel === "todas" ? analise.haloTot.un : indUn)} un. puxadas pelos anúncios`)}
          </div>
          {(t.semCusto > 0 || t.semCadastro > 0) && <p className="text-[11px] text-amber-300 mt-3" data-aviso-custo>⚠ {t.semCadastro > 0 ? `${t.semCadastro} anúncio(s) com MLB que não está no cadastro de anúncios do ML (usei comissão de 14% e frete padrão). ` : ""}{t.semCusto > 0 ? `${t.semCusto} anúncio(s) com SKU sem custo cadastrado: a liquidez deles está maior que a real.` : ""}</p>}
        </div>
      )}
    </div>
  );
}
