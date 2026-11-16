"use client";
// Adsense > (canal) > Atual vs anterior: compara CADA campanha com o envio anterior DELA MESMA (nunca uma campanha com outra),
// produto a produto (investido, arrecadado e ROI). A visão "Geral" soma só as campanhas que têm atual e anterior.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { padraoDoCanal, type CfgAdsCanal } from "../../lib/adsImport";
import { carregarCfgAds, carregarComparativoCampanhas, somarSnapshots, slugCanal, type CmpCampanha, type Snapshot } from "../../lib/adsImportDb";

const R$ = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const dia = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const GERAL = "__geral";
const periodoTxt = (s: Snapshot) => (s.ini && s.fim ? `${dia(s.ini)} a ${dia(s.fim)}/${s.fim.slice(0, 4)}` : s.mes);

type Situacao = "crescimento" | "queda" | "estavel" | "novo" | "saiu";
type Linha = {
  id: string; nome: string; situacao: Situacao;
  invAnt: number; invAtu: number; recAnt: number; recAtu: number; roiAnt: number; roiAtu: number; pedAnt: number; pedAtu: number;
  variacao: number;   // variação (%) da medida escolhida
};

const ROTULO: Record<Situacao, string> = { crescimento: "↑ Crescimento", queda: "↓ Queda", estavel: "= Estável", novo: "★ Novo", saiu: "✕ Não aparece mais" };
const COR: Record<Situacao, string> = {
  crescimento: "bg-emerald-950/60 text-emerald-300 border-emerald-800", queda: "bg-rose-950/60 text-rose-300 border-rose-800",
  estavel: "bg-slate-800 text-slate-300 border-slate-700", novo: "bg-sky-950/60 text-sky-300 border-sky-800", saiu: "bg-amber-950/50 text-amber-300 border-amber-800",
};
const pctVar = (ant: number, atu: number) => (ant > 0 ? ((atu - ant) / ant) * 100 : atu > 0 ? 100 : 0);
const sinal = (v: number) => (v > 0.005 ? "+" : "");

export default function ComparativoAds({ canal }: { canal: string }) {
  const slug = slugCanal(canal);
  const [camps, setCamps] = useState<CmpCampanha[] | null>(null);
  const [sel, setSel] = useState<string>(GERAL);
  const [cfg, setCfg] = useState<CfgAdsCanal>(padraoDoCanal(canal));
  const [medida, setMedida] = useState<"roi" | "receita">("roi");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Situacao>("todos");
  const [ordem, setOrdem] = useState<"variacao" | "queda" | "receita" | "investimento">("variacao");
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [c, f] = await Promise.all([carregarComparativoCampanhas(supabase, slug), carregarCfgAds(supabase, slug, canal)]);
      if (ativo) { setCamps(c); setCfg(f); }
    })();
    return () => { ativo = false; };
  }, [slug, canal]);

  const lista = camps || [];
  const varias = lista.length > 1;
  const geralAtivo = varias && sel === GERAL;
  const escolhida = geralAtivo ? null : lista.find((c) => c.id === sel) || lista[0] || null;
  const comparaveis = useMemo(() => lista.filter((c) => c.atual && c.anterior), [lista]);
  const semAnterior = useMemo(() => lista.filter((c) => !c.anterior), [lista]);
  // quando só há uma campanha comparável, "Geral" = ela mesma; com várias, a soma dos pares atual/anterior
  const cmp = useMemo<{ atual: Snapshot | null; anterior: Snapshot | null } | null>(() => {
    if (!camps) return null;
    if (geralAtivo) {
      if (comparaveis.length === 0) return { atual: null, anterior: null };
      return { atual: somarSnapshots(comparaveis.map((c) => c.atual as Snapshot), "Geral"), anterior: somarSnapshots(comparaveis.map((c) => c.anterior as Snapshot), "Geral") };
    }
    return escolhida ? { atual: escolhida.atual, anterior: escolhida.anterior } : { atual: null, anterior: null };
  }, [camps, geralAtivo, comparaveis, escolhida]);
  const rotuloCamp = (c: CmpCampanha) => {
    const nome = c.nome.replace(/^\[Auto-created\]\s*/i, "");
    return lista.filter((x) => x.nome === c.nome).length > 1 && c.id !== "sem-id" ? `${nome} · …${c.id.slice(-4)}` : nome;
  };
  const resumoCamp = useMemo(() => comparaveis.map((c) => {
    const inv = (x: { inv: number; af: number }) => x.inv + (cfg.incluirAfiliado ? x.af : 0);
    const soma = (sn: Snapshot) => sn.produtos.reduce((a, p) => ({ inv: a.inv + inv(p), rec: a.rec + p.rec }), { inv: 0, rec: 0 });
    const a = soma(c.anterior as Snapshot), b = soma(c.atual as Snapshot);
    return { c, invAnt: a.inv, invAtu: b.inv, recAnt: a.rec, recAtu: b.rec, roiAnt: a.inv > 0 ? a.rec / a.inv : 0, roiAtu: b.inv > 0 ? b.rec / b.inv : 0 };
  }), [comparaveis, cfg]);

  const { linhas, tot } = useMemo(() => {
    const vazio = { linhas: [] as Linha[], tot: null as null | { invAnt: number; invAtu: number; recAnt: number; recAtu: number; pedAnt: number; pedAtu: number; sobe: number; cai: number; igual: number; novos: number; sairam: number } };
    if (!cmp?.atual || !cmp.anterior) return vazio;
    const inv = (x: { inv: number; af: number }) => x.inv + (cfg.incluirAfiliado ? x.af : 0);
    const ant = new Map(cmp.anterior.produtos.map((p) => [p.id, p]));
    const atu = new Map(cmp.atual.produtos.map((p) => [p.id, p]));
    const ids = Array.from(new Set([...ant.keys(), ...atu.keys()]));
    const ls: Linha[] = ids.map((id) => {
      const a = ant.get(id), b = atu.get(id);
      const invAnt = a ? inv(a) : 0, invAtu = b ? inv(b) : 0, recAnt = a?.rec || 0, recAtu = b?.rec || 0;
      const roiAnt = invAnt > 0 ? recAnt / invAnt : 0, roiAtu = invAtu > 0 ? recAtu / invAtu : 0;
      const variacao = medida === "roi" ? pctVar(roiAnt, roiAtu) : pctVar(recAnt, recAtu);
      let situacao: Situacao;
      if (!a) situacao = "novo"; else if (!b) situacao = "saiu";
      else situacao = variacao > 1 ? "crescimento" : variacao < -1 ? "queda" : "estavel";
      return { id, nome: b?.n || a?.n || "Produto sem nome", situacao, invAnt, invAtu, recAnt, recAtu, roiAnt, roiAtu, pedAnt: a?.ped || 0, pedAtu: b?.ped || 0, variacao };
    });
    const t = { invAnt: 0, invAtu: 0, recAnt: 0, recAtu: 0, pedAnt: 0, pedAtu: 0, sobe: 0, cai: 0, igual: 0, novos: 0, sairam: 0 };
    for (const l of ls) {
      t.invAnt += l.invAnt; t.invAtu += l.invAtu; t.recAnt += l.recAnt; t.recAtu += l.recAtu; t.pedAnt += l.pedAnt; t.pedAtu += l.pedAtu;
      if (l.situacao === "crescimento") t.sobe++; else if (l.situacao === "queda") t.cai++; else if (l.situacao === "estavel") t.igual++; else if (l.situacao === "novo") t.novos++; else t.sairam++;
    }
    return { linhas: ls, tot: t };
  }, [cmp, cfg, medida]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = linhas.filter((x) => (filtro === "todos" || x.situacao === filtro) && (!q || x.nome.toLowerCase().includes(q) || x.id.includes(q)));
    const chave = (x: Linha) => (ordem === "variacao" ? x.variacao : ordem === "queda" ? -x.variacao : ordem === "receita" ? x.recAtu : x.invAtu);
    return [...l].sort((a, b) => chave(b) - chave(a));
  }, [linhas, busca, filtro, ordem]);

  useEffect(() => { setPagina(1); }, [busca, filtro, ordem, porPagina, medida]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const pag = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((pag - 1) * porPagina, pag * porPagina);
  const botoes = useMemo(() => Array.from({ length: totalPaginas }, (_, i) => i + 1).filter((n) => n === 1 || n === totalPaginas || Math.abs(n - pag) <= 2), [totalPaginas, pag]);

  if (!camps || !cmp) return <p className="p-8 text-center text-slate-400">Carregando comparativo…</p>;

  const seletor = varias && (
    <div className="flex flex-wrap items-center gap-2" data-cmp-campanhas>
      <button type="button" data-cmp-chip={GERAL} aria-pressed={geralAtivo} onClick={() => setSel(GERAL)}
        className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${geralAtivo ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"}`}>
        Geral <span className="font-normal opacity-80">(soma das {comparaveis.length} campanha{comparaveis.length === 1 ? "" : "s"} comparável{comparaveis.length === 1 ? "" : "is"})</span>
      </button>
      {lista.map((c) => (
        <button key={c.id} type="button" data-cmp-chip={c.id} aria-pressed={!geralAtivo && escolhida?.id === c.id} onClick={() => setSel(c.id)} title={c.nome + " · ID " + c.id}
          className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer max-w-xs truncate ${!geralAtivo && escolhida?.id === c.id ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"}`}>
          {rotuloCamp(c)}{!c.anterior && <span className="ml-1.5 font-normal text-slate-500">sem anterior</span>}
        </button>
      ))}
    </div>
  );

  if (lista.length === 0) {
    return (
      <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-400" data-cmp-vazio>
        Ainda não há nenhuma planilha de campanha enviada para {canal}. Envie a primeira na aba Campanhas; quando enviar a seguinte, o comparativo aparece aqui.
      </div>
    );
  }
  if (!cmp.atual || !cmp.anterior || !tot) {
    return (
      <div className="space-y-4" data-comparativo-ads>
        {seletor && <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">{seletor}</div>}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-400" data-cmp-sem-anterior>
          {geralAtivo
            ? <>Nenhuma campanha tem dois envios ainda, então não há o que comparar no Geral. Cada campanha só é comparada com o envio anterior <strong className="text-slate-200">dela mesma</strong>: quando você reenviar a planilha de uma delas, ela entra aqui.</>
            : <>Só existe um envio de <strong className="text-slate-200">{escolhida ? rotuloCamp(escolhida) : "esta campanha"}</strong>{cmp.atual ? <> ({periodoTxt(cmp.atual)})</> : null}. Na próxima vez que você enviar a planilha desta campanha, este envio vira o “anterior” e o comparativo aparece.</>}
        </div>
      </div>
    );
  }

  const roiAnt = tot.invAnt > 0 ? tot.recAnt / tot.invAnt : 0, roiAtu = tot.invAtu > 0 ? tot.recAtu / tot.invAtu : 0;
  const dv = (rotulo: string, ant: string, atu: string, delta: number, pct: number, bomQuandoSobe: boolean | null) => {
    const neutro = bomQuandoSobe === null;
    const bom = bomQuandoSobe ? delta >= 0 : delta <= 0;
    return (
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{rotulo}</div>
        <div className="text-lg font-black mt-1 text-white">{atu}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">antes: {ant}</div>
        <div className={`text-[11px] font-bold mt-1 ${Math.abs(delta) < 0.005 || neutro ? "text-slate-400" : bom ? "text-emerald-400" : "text-rose-400"}`}>{delta > 0.005 ? "▲" : delta < -0.005 ? "▼" : "="} {sinal(pct)}{NUM(pct)}%</div>
      </div>
    );
  };
  const cel = (ant: number, atu: number, fmt: (v: number) => string, bomQuandoSobe: boolean | null = true) => {
    const d = atu - ant, neutro = bomQuandoSobe === null, bom = bomQuandoSobe ? d >= 0 : d <= 0;
    return (
      <td className="p-3 text-right">
        <div className="text-slate-100">{fmt(atu)}</div>
        <div className="text-[10px] text-slate-500">antes {fmt(ant)}</div>
        <div className={`text-[10px] font-bold ${Math.abs(d) < 0.005 || neutro ? "text-slate-400" : bom ? "text-emerald-400" : "text-rose-400"}`}>{d > 0.005 ? "▲ +" : d < -0.005 ? "▼ -" : "= "}{fmt(Math.abs(d) < 0.005 ? 0 : Math.abs(d))}</div>
      </td>
    );
  };

  return (
    <div className="space-y-6" data-comparativo-ads>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <h2 className="text-lg font-bold text-white">🔄 Atual vs anterior — {canal}{geralAtivo ? " · Geral" : escolhida && varias ? ` · ${rotuloCamp(escolhida)}` : ""}</h2>
        <p className="text-xs text-slate-400 mt-1">Cada campanha é comparada com o envio anterior <strong className="text-slate-300">dela mesma</strong>. O Geral soma apenas as campanhas que têm atual e anterior, para não misturar campanhas diferentes.</p>
        {seletor && <div className="mt-4">{seletor}</div>}
        {geralAtivo && semAnterior.length > 0 && (
          <p className="text-[11px] text-amber-300/90 mt-3" data-cmp-fora-do-geral>Fora do Geral por ainda não ter envio anterior: {semAnterior.map(rotuloCamp).join(", ")}.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3" data-cmp-anterior>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Anterior</div>
            <div className="text-sm font-bold text-white mt-0.5">{periodoTxt(cmp.anterior)}</div>
            {!geralAtivo && <div className="text-[10px] text-slate-500 truncate" title={cmp.anterior.arquivo}>{cmp.anterior.arquivo} · enviada em {quando(cmp.anterior.importadoEm)}</div>}
          </div>
          <div className="bg-slate-950/70 border border-purple-900/60 rounded-xl p-3" data-cmp-atual>
            <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Atual</div>
            <div className="text-sm font-bold text-white mt-0.5">{periodoTxt(cmp.atual)}</div>
            {!geralAtivo && <div className="text-[10px] text-slate-500 truncate" title={cmp.atual.arquivo}>{cmp.atual.arquivo} · enviada em {quando(cmp.atual.importadoEm)}</div>}
          </div>
        </div>
      </div>

      {geralAtivo && (
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl" data-cmp-por-campanha>
          <h3 className="text-sm font-bold text-white mb-3">Campanha a campanha (cada uma contra o próprio envio anterior)</h3>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr><th className="p-3">Campanha</th><th className="p-3 text-right">Investido</th><th className="p-3 text-right">Arrecadado</th><th className="p-3 text-right">ROI</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {resumoCamp.map((r) => (
                  <tr key={r.c.id} data-cmp-camp-linha={r.c.id} onClick={() => setSel(r.c.id)} className="hover:bg-slate-800/40 cursor-pointer" title="Abrir só esta campanha">
                    <td className="p-3 font-bold text-slate-100">{rotuloCamp(r.c)}</td>
                    {cel(r.invAnt, r.invAtu, R$, null)}
                    {cel(r.recAnt, r.recAtu, R$)}
                    {cel(r.roiAnt, r.roiAtu, (v) => NUM(v) + "x")}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" data-cmp-resumo>
          {dv("Investido", R$(tot.invAnt), R$(tot.invAtu), tot.invAtu - tot.invAnt, pctVar(tot.invAnt, tot.invAtu), null)}
          {dv("Arrecadado", R$(tot.recAnt), R$(tot.recAtu), tot.recAtu - tot.recAnt, pctVar(tot.recAnt, tot.recAtu), true)}
          {dv("ROI", NUM(roiAnt) + "x", NUM(roiAtu) + "x", roiAtu - roiAnt, pctVar(roiAnt, roiAtu), true)}
          {dv("Pedidos", NUM(tot.pedAnt), NUM(tot.pedAtu), tot.pedAtu - tot.pedAnt, pctVar(tot.pedAnt, tot.pedAtu), true)}
        </div>
        <div className="flex flex-wrap gap-2 mb-5 text-[11px] font-bold" data-cmp-contagem>
          {([["crescimento", tot.sobe], ["queda", tot.cai], ["estavel", tot.igual], ["novo", tot.novos], ["saiu", tot.sairam]] as [Situacao, number][]).map(([k, n]) => (
            <span key={k} className={`px-3 py-1 rounded-full border ${COR[k]}`}>{ROTULO[k]}: {n}</span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input data-cmp-busca value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou ID…" className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-purple-500 w-60" />
          <select data-cmp-filtro value={filtro} onChange={(e) => setFiltro(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
            <option value="todos">Todos os produtos</option><option value="crescimento">Só crescimento</option><option value="queda">Só queda</option><option value="estavel">Só estável</option><option value="novo">Só novos</option><option value="saiu">Só os que saíram</option>
          </select>
          <select data-cmp-ordem value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
            <option value="variacao">Ordenar: maior crescimento</option><option value="queda">Ordenar: maior queda</option><option value="receita">Ordenar: mais arrecadado (atual)</option><option value="investimento">Ordenar: mais investido (atual)</option>
          </select>
          <select data-cmp-medida value={medida} onChange={(e) => setMedida(e.target.value as any)} title="O que define crescimento ou queda" className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
            <option value="roi">Desempenho medido pelo ROI</option><option value="receita">Desempenho medido pelo arrecadado</option>
          </select>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <span>Por página</span>
            <select data-cmp-por-pagina value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">
              {[10, 25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">Crescimento ou queda = variação de mais de 1% {medida === "roi" ? "no ROI (arrecadado ÷ investido)" : "no valor arrecadado"} entre a planilha anterior e a atual.</p>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs" data-cmp-tabela>
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr><th className="p-3 min-w-[260px]">Produto</th><th className="p-3 text-right">Investido</th><th className="p-3 text-right">Arrecadado</th><th className="p-3 text-right">ROI</th><th className="p-3 text-right">Variação</th><th className="p-3">Situação</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {visiveis.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Nenhum produto com esse filtro.</td></tr>}
              {visiveis.map((l) => (
                <tr key={l.id} data-cmp-linha={l.id} className="hover:bg-slate-800/40">
                  <td className="p-3"><div className="font-bold text-slate-100 whitespace-normal line-clamp-2 max-w-[340px]">{l.nome}</div><div className="text-[10px] text-slate-500">ID {l.id}</div></td>
                  {cel(l.invAnt, l.invAtu, R$, null)}
                  {cel(l.recAnt, l.recAtu, R$)}
                  {cel(l.roiAnt, l.roiAtu, (v) => NUM(v) + "x")}
                  <td className={`p-3 text-right font-bold ${l.situacao === "queda" ? "text-rose-400" : l.situacao === "crescimento" ? "text-emerald-400" : "text-slate-400"}`}>{l.situacao === "novo" || l.situacao === "saiu" ? "—" : `${sinal(l.variacao)}${NUM(l.variacao)}%`}</td>
                  <td className="p-3"><span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${COR[l.situacao]}`}>{ROTULO[l.situacao]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-4" data-cmp-paginacao>
          <span className="text-[11px] text-slate-500">{filtradas.length === 0 ? "0 produtos" : `${(pag - 1) * porPagina + 1}–${Math.min(pag * porPagina, filtradas.length)} de ${filtradas.length} produto(s)`}</span>
          <div className="flex items-center gap-1">
            <button type="button" data-cmp-pag-ant disabled={pag <= 1} onClick={() => setPagina(pag - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
            {botoes.map((n, i) => (
              <React.Fragment key={n}>
                {i > 0 && n - botoes[i - 1] > 1 && <span className="text-slate-600 px-1">…</span>}
                <button type="button" data-cmp-pag={n} onClick={() => setPagina(n)} className={`w-8 h-8 rounded-lg text-xs font-bold border cursor-pointer ${n === pag ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400"}`}>{n}</button>
              </React.Fragment>
            ))}
            <button type="button" data-cmp-pag-prox disabled={pag >= totalPaginas} onClick={() => setPagina(pag + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
