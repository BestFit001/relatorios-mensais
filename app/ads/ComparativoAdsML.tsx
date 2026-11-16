"use client";
// Mercado Livre > Atual vs anterior: compara o relatório em vigor com o anterior, anúncio a anúncio (investimento, retorno, liquidez).
// Por campanha: compara cada campanha em vigor com o envio anterior DELA; campanhas novas entram na lista sem desequilibrar os totais.
import React, { useMemo, useState } from "react";
import { useDadosML } from "./useDadosML";
import { CHAVE_LEGADO, chaveCampanha, pecasDoResumo, type AnaliseAnuncio, type ResumoAnuncio } from "../../lib/adsMl";
import { campanhasDoAtual } from "../../lib/adsMlDb";
import { NUM, PCT, R$, ROAS, dataBR, quando } from "./fmtML";

type Linha = { mlb: string; titulo: string; situacao: "melhorou" | "piorou" | "estavel" | "novo" | "saiu" | "semant"; invAnt: number; invAtu: number; recAnt: number; recAtu: number; liqAnt: number; liqAtu: number; dLiq: number };
const ROTULO = { melhorou: "↑ Melhorou", piorou: "↓ Piorou", estavel: "= Estável", novo: "★ Novo no Ads", saiu: "✕ Saiu do Ads", semant: "• Campanha sem anterior" } as const;
const COR = {
  melhorou: "bg-emerald-950/60 text-emerald-300 border-emerald-800", piorou: "bg-rose-950/60 text-rose-300 border-rose-800", estavel: "bg-slate-800 text-slate-300 border-slate-700",
  novo: "bg-sky-950/60 text-sky-300 border-sky-800", saiu: "bg-amber-950/50 text-amber-300 border-amber-800", semant: "bg-slate-800 text-slate-300 border-slate-600",
} as const;
const sinal = (v: number) => (v > 0.005 ? "+" : "");
const cor = (v: number) => (v > 0.005 ? "text-emerald-400" : v < -0.005 ? "text-rose-400" : "text-slate-400");

export default function ComparativoAdsML({ canal }: { canal: string }) {
  const { atual, anterior, analise, carregando } = useDadosML(canal);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Linha["situacao"]>("todos");
  const [campFiltro, setCampFiltro] = useState<string>("todas");
  const [ordem, setOrdem] = useState<"variacao" | "queda" | "investimento">("variacao");
  const [porPagina, setPorPagina] = useState(10);
  const [pag, setPag] = useState(1);

  // campanhas: as em vigor, as que têm envio anterior e as comparáveis (nas duas listas)
  const escopo = useMemo(() => {
    const emVigor = campanhasDoAtual(atual);
    const pecas = pecasDoResumo(anterior);
    const legado = pecas.length === 1 && pecas[0].chave === CHAVE_LEGADO;
    const chavesAnt = new Set(pecas.map((p) => p.chave));
    const comparaveis = legado ? emVigor.map((c) => c.chave) : emVigor.filter((c) => chavesAnt.has(c.chave)).map((c) => c.chave);
    const novas = legado ? [] : emVigor.filter((c) => !chavesAnt.has(c.chave));
    const semNovoEnvio = legado ? [] : pecas.filter((p) => !emVigor.some((c) => c.chave === p.chave));
    const ativas = campFiltro === "todas" ? comparaveis : comparaveis.filter((k) => k === campFiltro);
    return { emVigor, legado, comparaveis, novas, semNovoEnvio, ativas };
  }, [atual, anterior, campFiltro]);

  const { linhas, cont, antEsc, atuEsc } = useMemo(() => {
    const cont = { melhorou: 0, piorou: 0, estavel: 0, novo: 0, saiu: 0, semant: 0 };
    if (!analise || !anterior) return { linhas: [] as Linha[], cont, antEsc: [] as ResumoAnuncio[], atuEsc: [] as AnaliseAnuncio[] };
    const ativas = new Set(escopo.ativas);
    const chAnt = (a: { c?: string }) => (escopo.legado ? CHAVE_LEGADO : a.c || CHAVE_LEGADO);
    const antEsc = anterior.anuncios.filter((a) => escopo.legado || ativas.has(chAnt(a)));
    const atuEsc = analise.anuncios.filter((a) => escopo.legado || ativas.has(chaveCampanha(a.campanha)));
    // linhas: o que está nas campanhas comparadas + os anúncios das campanhas novas (aparecem como "novo no Ads")
    const novasChaves = new Set(escopo.novas.map((c) => c.chave));
    const extras = campFiltro === "todas" ? analise.anuncios.filter((a) => novasChaves.has(chaveCampanha(a.campanha))) : campFiltro && novasChaves.has(campFiltro) ? analise.anuncios.filter((a) => chaveCampanha(a.campanha) === campFiltro) : [];
    const extraSet = new Set(extras.map((a) => a.mlb));
    const ant = new Map(antEsc.map((a) => [a.mlb, a]));
    const atu = new Map([...atuEsc, ...extras].map((a) => [a.mlb, a]));
    const ls: Linha[] = Array.from(new Set([...ant.keys(), ...atu.keys()])).map((mlb) => {
      const a = ant.get(mlb), b = atu.get(mlb);
      const liqAnt = a?.liq || 0, liqAtu = b?.liquidez || 0, dLiq = liqAtu - liqAnt;
      const situacao: Linha["situacao"] = !a ? (extraSet.has(mlb) ? "semant" : "novo") : !b ? "saiu" : Math.abs(dLiq) < 0.5 ? "estavel" : dLiq > 0 ? "melhorou" : "piorou";
      cont[situacao]++;
      return { mlb, titulo: b?.titulo || a?.t || mlb, situacao, invAnt: a?.inv || 0, invAtu: b?.investimento || 0, recAnt: a?.rec || 0, recAtu: b?.receitaTotal || 0, liqAnt, liqAtu, dLiq };
    });
    return { linhas: ls, cont, antEsc, atuEsc };
  }, [analise, anterior, escopo, campFiltro]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const f = linhas.filter((l) => (filtro === "todos" || l.situacao === filtro) && (!q || l.titulo.toLowerCase().includes(q) || l.mlb.toLowerCase().includes(q)));
    return [...f].sort((x, y) => ordem === "variacao" ? y.dLiq - x.dLiq : ordem === "queda" ? x.dLiq - y.dLiq : Math.max(y.invAtu, y.invAnt) - Math.max(x.invAtu, x.invAnt));
  }, [linhas, busca, filtro, ordem]);

  if (carregando) return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  if (!atual || !analise) return <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-500">Nenhum relatório do Mercado Livre enviado. Envie as planilhas na sub-aba Campanhas.</div>;
  if (!anterior) return <div data-sem-anterior className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-400">Ainda não há relatório anterior para comparar. Quando você enviar uma nova planilha de anúncios patrocinados de outro período, o relatório em vigor ({atual.mes}) passa a ser o anterior e esta tela mostra a diferença.</div>;

  const soma = <T,>(l: T[], f: (x: T) => number) => l.reduce((n, x) => n + f(x), 0);
  const aInv = soma(antEsc, (x) => x.inv), aRec = soma(antEsc, (x) => x.rec), aLiq = soma(antEsc, (x) => x.liq);
  const tInv = soma(atuEsc, (x) => x.investimento), tRec = soma(atuEsc, (x) => x.receitaTotal), tLiq = soma(atuEsc, (x) => x.liquidez);
  const a = { inv: aInv, rec: aRec, liq: aLiq, roas: aInv > 0 ? aRec / aInv : 0, roi: aInv > 0 ? (aLiq / aInv) * 100 : null as number | null };
  const t = { investimento: tInv, receita: tRec, liquidez: tLiq, roas: tInv > 0 ? tRec / tInv : 0, roi: tInv > 0 ? (tLiq / tInv) * 100 : null as number | null };
  const dRoi = (t.roi ?? 0) - (a.roi ?? 0);
  const quad = (titulo: string, ant: string, atu: string, delta: string, c: string) => (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titulo}</div>
      <div className="text-lg font-black mt-1 text-white">{atu}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">antes: {ant}</div>
      <div className={`text-[11px] font-bold mt-1 ${c}`}>{delta}</div>
    </div>
  );
  const inicio = (pag - 1) * porPagina;
  return (
    <div className="space-y-6" data-comparativo-ml>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <h2 className="text-lg font-bold text-white">🔄 Atual vs anterior — {canal}</h2>
        <p className="text-xs text-slate-400 mt-1 mb-5">Atual: <strong className="text-slate-200">{atual.mes}</strong> ({dataBR(atual.pads.periodo.ini)} a {dataBR(atual.pads.periodo.fim)}, enviado em {quando(atual.pads.importadoEm)}) · Anterior: <strong className="text-slate-200">{anterior.mes}</strong> ({dataBR(anterior.periodo.ini)} a {dataBR(anterior.periodo.fim)}, enviado em {quando(anterior.importadoEm)}).{!analise.semCruzamento === !anterior.comVendas ? "" : " Um dos relatórios está sem a planilha de vendas, então a liquidez não é totalmente comparável."}</p>
        {(escopo.emVigor.length > 1 || escopo.novas.length > 0 || escopo.semNovoEnvio.length > 0) && (
          <div className="mb-4 space-y-2" data-campanhas-cmp-ml>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Campanha</span>
              <select data-filtro-campanha value={campFiltro} onChange={(e) => { setCampFiltro(e.target.value); setPag(1); setFiltro("todos"); }} className="bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white outline-none cursor-pointer">
                <option value="todas">Todas as comparáveis ({escopo.comparaveis.length})</option>
                {escopo.emVigor.map((c) => <option key={c.chave} value={c.chave}>{c.nome}{escopo.novas.some((n) => n.chave === c.chave) ? " (sem anterior)" : ""}</option>)}
              </select>
            </div>
            {escopo.novas.length > 0 && <p data-aviso-novas-cmp className="text-[11px] text-sky-300 bg-sky-950/20 border border-sky-900/40 rounded-xl p-2.5">Sem envio anterior para comparar: <strong>{escopo.novas.map((c) => c.nome).join(", ")}</strong>. Os anúncios aparecem na lista, mas ficam fora dos totais abaixo até a campanha ser enviada de novo com outro período.</p>}
            {escopo.semNovoEnvio.length > 0 && <p data-aviso-sem-envio-cmp className="text-[11px] text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-2.5">Sem novo envio (fora da comparação): <strong>{escopo.semNovoEnvio.map((p) => p.nome).join(", ")}</strong>.</p>}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-cards-cmp-ml>
          {quad("Investimento", R$(a.inv), R$(t.investimento), `${sinal(t.investimento - a.inv)}${R$(t.investimento - a.inv)}`, cor(-(t.investimento - a.inv)))}
          {quad("Retorno", R$(a.rec), R$(t.receita), `${sinal(t.receita - a.rec)}${R$(t.receita - a.rec)}`, cor(t.receita - a.rec))}
          {quad("ROAS", ROAS(a.roas), ROAS(t.roas), `${sinal(t.roas - a.roas)}${(t.roas - a.roas).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`, cor(t.roas - a.roas))}
          {quad("Liquidez", R$(a.liq), R$(t.liquidez), `${sinal(t.liquidez - a.liq)}${R$(t.liquidez - a.liq)}`, cor(t.liquidez - a.liq))}
          {quad("ROI", PCT(a.roi), PCT(t.roi), `${sinal(dRoi)}${dRoi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`, cor(dRoi))}
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          <button type="button" onClick={() => { setFiltro("todos"); setPag(1); }} className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${filtro === "todos" ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400"}`}>Todos ({linhas.length})</button>
          {(Object.keys(ROTULO) as (keyof typeof ROTULO)[]).filter((k) => cont[k] > 0).map((k) => (
            <button key={k} type="button" data-filtro-cmp={k} onClick={() => { setFiltro(k); setPag(1); }} className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${filtro === k ? "bg-purple-600 border-purple-400 text-white" : COR[k]}`}>{ROTULO[k]} ({cont[k]})</button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input data-busca-cmp-ml value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1); }} placeholder="Buscar título ou MLB…" className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-purple-500 w-64" />
          <select value={ordem} onChange={(e) => { setOrdem(e.target.value as any); setPag(1); }} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
            <option value="variacao">Ordenar: maior ganho de liquidez</option><option value="queda">Ordenar: maior queda de liquidez</option><option value="investimento">Ordenar: maior investimento</option>
          </select>
        </div>
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap" data-tabela-cmp-ml>
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold text-[10px]">
              <tr><th className="p-3 min-w-[260px]">Anúncio</th><th className="p-3">Situação</th><th className="p-3 text-right">Invest. antes</th><th className="p-3 text-right">Invest. agora</th><th className="p-3 text-right">Retorno antes</th><th className="p-3 text-right">Retorno agora</th><th className="p-3 text-right">Liquidez antes</th><th className="p-3 text-right">Liquidez agora</th><th className="p-3 text-right">Variação</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {visiveis.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500">Nenhum anúncio com esse filtro.</td></tr>}
              {visiveis.slice(inicio, inicio + porPagina).map((l) => (
                <tr key={l.mlb} data-cmp-ml={l.mlb} className="hover:bg-slate-800/40">
                  <td className="p-3"><div className="font-bold text-slate-100 whitespace-normal max-w-[340px] line-clamp-2">{l.titulo}</div><div className="text-[10px] text-slate-500">{l.mlb}</div></td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${COR[l.situacao]}`}>{ROTULO[l.situacao]}</span></td>
                  <td className="p-3 text-right text-slate-400">{R$(l.invAnt)}</td><td className="p-3 text-right">{R$(l.invAtu)}</td>
                  <td className="p-3 text-right text-slate-400">{R$(l.recAnt)}</td><td className="p-3 text-right">{R$(l.recAtu)}</td>
                  <td className="p-3 text-right text-slate-400">{R$(l.liqAnt)}</td><td className="p-3 text-right">{R$(l.liqAtu)}</td>
                  <td className={`p-3 text-right font-bold ${cor(l.dLiq)}`}>{sinal(l.dLiq)}{R$(l.dLiq)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
          <span className="text-[11px] text-slate-500">{visiveis.length === 0 ? "0 anúncios" : `${inicio + 1}–${Math.min(inicio + porPagina, visiveis.length)} de ${visiveis.length} anúncio(s)`}</span>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <select value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPag(1); }} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">{[10, 25, 50, 100, 500].map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
            <button type="button" disabled={pag <= 1} onClick={() => setPag(pag - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
            <span>{pag}/{Math.max(1, Math.ceil(visiveis.length / porPagina))}</span>
            <button type="button" disabled={inicio + porPagina >= visiveis.length} onClick={() => setPag(pag + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
