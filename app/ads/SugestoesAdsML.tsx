"use client";
// Sugestões de Ads do Mercado Livre, automáticas: usa as vendas do mês que já estão no dashboard (upload de vendas), o custo do SKU,
// a aba de devoluções e o que já está no Ads, e indica o que vale colocar no Adsense segundo as regras de Configurações.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugCanal } from "../../lib/adsImportDb";
import { carregarBaseSugestoes, carregarCfgSug } from "../../lib/adsMlDb";
import { CFG_SUG_PADRAO, calcularSugestoes, normSkuSug, type AdsDoMlb, type CfgSugestoes, type Sugestao, type SituacaoSug } from "../../lib/adsMlSugestoes";
import { useDadosML } from "./useDadosML";
import { NUM, PCT, R$ } from "./fmtML";

const MESES = [2026, 2027].flatMap((a) => Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${a}`));
const mesAtual = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const ROTULO: Record<SituacaoSug, { t: string; c: string }> = {
  recomendar: { t: "Colocar no Ads", c: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
  no_ads: { t: "Já está no Ads", c: "bg-sky-900/40 text-sky-300 border-sky-700" },
  nao: { t: "Não recomendado", c: "bg-slate-800 text-slate-300 border-slate-600" },
};
const card = (titulo: string, valor: string, sub?: string, c = "text-white") => (
  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titulo}</div>
    <div className={`text-lg font-black mt-1 ${c}`}>{valor}</div>
    {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

export default function SugestoesAdsML({ canal }: { canal: string }) {
  const slug = slugCanal(canal);
  const { ctx, atual, analise, carregando: carregandoAds } = useDadosML(canal);
  const [escolhido, setMes] = useState<string | null>(null);
  const mes = escolhido ?? atual?.mes ?? mesAtual();   // sem escolha: o mês do relatório de Ads em vigor
  const [cfg, setCfg] = useState<CfgSugestoes>(CFG_SUG_PADRAO);
  const [base, setBase] = useState<{ vendas: any[]; cancelados: any[]; devolucoes: any[] } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<SituacaoSug | "todas">("recomendar");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"liquido" | "margem" | "vendas" | "liquidoUn">("liquido");
  const [porPagina, setPorPagina] = useState(10);
  const [pag, setPag] = useState(1);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    if (carregandoAds) return;
    let ativo = true;
    setCarregando(true);
    (async () => {
      const [b, c] = await Promise.all([carregarBaseSugestoes(supabase, canal, mes), carregarCfgSug(supabase, slug)]);
      if (!ativo) return;
      setBase(b); setCfg(c); setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [canal, mes, slug, carregandoAds]);

  const lista: Sugestao[] = useMemo(() => {
    if (!base || !ctx) return [];
    const custos = new Map<string, { custo: number; produto: string }>(ctx.custos);
    const mlbsPorSku = new Map<string, string[]>();
    ctx.regras.forEach((rs, mlb) => rs.forEach((r) => { const k = normSkuSug(r.sku); if (k) mlbsPorSku.set(k, Array.from(new Set([...(mlbsPorSku.get(k) || []), mlb]))); }));
    const ads = new Map<string, AdsDoMlb>();
    analise?.anuncios.forEach((a) => ads.set(a.mlb, { status: a.status, roi: a.roi }));
    return calcularSugestoes(base.vendas, base.cancelados, base.devolucoes, canal, mes, custos, mlbsPorSku, ads, cfg);
  }, [base, ctx, analise, canal, mes, cfg]);

  const cont = useMemo(() => ({ recomendar: lista.filter((s) => s.situacao === "recomendar").length, no_ads: lista.filter((s) => s.situacao === "no_ads").length, nao: lista.filter((s) => s.situacao === "nao").length }), [lista]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const f = lista.filter((s) => (filtro === "todas" || s.situacao === filtro) && (!q || s.sku.toLowerCase().includes(q) || s.produto.toLowerCase().includes(q) || s.mlbs.some((m) => m.toLowerCase().includes(q))));
    const v: Record<string, (s: Sugestao) => number> = { liquido: (s) => s.liquido, margem: (s) => s.margemPct, vendas: (s) => s.un, liquidoUn: (s) => s.liquidoUn };
    return [...f].sort((a, b) => v[ordem](b) - v[ordem](a));
  }, [lista, filtro, busca, ordem]);

  const inicio = (pag - 1) * porPagina;
  const carregandoTudo = carregando || carregandoAds;
  return (
    <div className="space-y-6" data-sugestoes-ml>
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">💡 Sugestões de Ads — {canal}</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">Automático: usa as vendas do mês enviadas no upload do dashboard, o custo do SKU e as devoluções registradas. Um produto é indicado para o Ads quando vende bem, tem margem líquida boa e poucas devoluções, e ainda não está no Ads.</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mês das vendas e devoluções</label>
            <select data-mes-sug value={mes} onChange={(e) => { setMes(e.target.value); setPag(1); }} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-purple-400 outline-none cursor-pointer">{MESES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </div>
        </div>
        <p data-regras-sug className="text-[11px] text-slate-300 bg-slate-950 border border-slate-800 rounded-xl p-3 mb-4">
          Regras em vigor: pelo menos <strong>{NUM(cfg.vendasMin)} un.</strong> vendidas · margem líquida de pelo menos <strong>{NUM(cfg.margemMinPct)}%</strong> (imposto de {NUM(cfg.impostoPct)}%) · devoluções de no máximo <strong>{NUM(cfg.taxaDevMaxPct)}%</strong> das vendas e até <strong>{cfg.devMaxQtd}</strong> no mês. Mude em Configurações.
        </p>
        {!carregandoTudo && lista.length === 0 && <div data-sem-vendas-sug className="text-sm text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-4">Não há vendas de {canal} em {mes}. Envie a planilha de vendas do canal em Upload (dashboard) ou escolha outro mês.</div>}
        {lista.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-cards-sug>
            {card("SKUs vendidos", String(lista.length), `${NUM(lista.reduce((t, s) => t + s.un, 0))} unidades`)}
            {card("Colocar no Ads", String(cont.recomendar), `${R$(lista.filter((s) => s.situacao === "recomendar").reduce((t, s) => t + s.liquido, 0))} de líquido`, "text-emerald-400")}
            {card("Já estão no Ads", String(cont.no_ads), analise ? `relatório de ${atual?.mes}` : "sem relatório de Ads enviado", "text-sky-300")}
            {card("Não recomendados", String(cont.nao))}
          </div>
        )}
        {lista.some((s) => s.semCusto) && <p className="text-[11px] text-amber-300 mt-3">⚠ {lista.filter((s) => s.semCusto).length} SKU(s) sem custo cadastrado ficam de fora das recomendações.</p>}
        {!analise && lista.length > 0 && <p className="text-[11px] text-slate-500 mt-3">Sem o relatório de anúncios patrocinados enviado, o app não sabe o que já está no Ads e pode indicar produtos que já anunciam.</p>}
      </div>

      {lista.length > 0 && (
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex flex-wrap items-center gap-2 mb-4" data-filtros-sug>
            {([["recomendar", `Colocar no Ads (${cont.recomendar})`], ["no_ads", `Já no Ads (${cont.no_ads})`], ["nao", `Não recomendados (${cont.nao})`], ["todas", `Todos (${lista.length})`]] as const).map(([k, t]) => (
              <button key={k} type="button" data-filtro-sug={k} onClick={() => { setFiltro(k); setPag(1); }} className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${filtro === k ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{t}</button>
            ))}
            <input data-busca-sug value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1); }} placeholder="Buscar produto, SKU ou MLB…" className="ml-auto bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-purple-500 w-60" />
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
              <option value="liquido">Ordenar: maior líquido (R$)</option><option value="margem">Ordenar: maior margem (%)</option><option value="vendas">Ordenar: mais vendas</option><option value="liquidoUn">Ordenar: maior líquido por unidade</option>
            </select>
          </div>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap" data-tabela-sug>
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold text-[10px]">
                <tr><th className="p-3 min-w-[260px]">Produto</th><th className="p-3 text-right">Vendas (un.)</th><th className="p-3 text-right">Receita</th><th className="p-3 text-right">Líquido</th><th className="p-3 text-right">Margem</th><th className="p-3 text-right">Líquido/un.</th><th className="p-3 text-right">Devoluções</th><th className="p-3">Situação</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visiveis.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">Nenhum produto neste filtro.</td></tr>}
                {visiveis.slice(inicio, inicio + porPagina).map((s) => (
                  <React.Fragment key={s.sku}>
                    <tr data-sug={s.sku} onClick={() => setAberto(aberto === s.sku ? null : s.sku)} className="hover:bg-slate-800/40 cursor-pointer">
                      <td className="p-3"><div className="font-bold text-slate-100 whitespace-normal max-w-[340px] line-clamp-2">{s.produto}</div><div className="text-[10px] text-slate-500 font-mono">{s.sku}{s.mlbs.length > 0 && ` · ${s.mlbs.slice(0, 2).join(", ")}${s.mlbs.length > 2 ? ` +${s.mlbs.length - 2}` : ""}`}</div></td>
                      <td className="p-3 text-right">{NUM(s.un)}</td>
                      <td className="p-3 text-right">{R$(s.receita)}</td>
                      <td className={`p-3 text-right font-bold ${s.liquido >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{R$(s.liquido)}</td>
                      <td className={`p-3 text-right font-bold ${s.margemPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{s.semCusto ? "—" : PCT(s.margemPct)}</td>
                      <td className="p-3 text-right">{R$(s.liquidoUn)}</td>
                      <td className="p-3 text-right">{s.devQtd} <span className="text-slate-500">({PCT(s.taxaDev)})</span></td>
                      <td className="p-3"><span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${ROTULO[s.situacao].c}`}>{ROTULO[s.situacao].t}</span>{s.adsStatus === "inativo" && <span className="ml-2 text-[10px] text-amber-400 font-bold">anúncio pausado</span>}</td>
                    </tr>
                    {aberto === s.sku && (
                      <tr data-sug-detalhe={s.sku} className="bg-slate-950/60"><td colSpan={8} className="p-4 whitespace-normal text-[11px] text-slate-300 space-y-1">
                        {s.situacao === "recomendar" && <p className="text-emerald-300">Passou em todas as regras: vende bem, tem margem e poucas devoluções{s.adsStatus === "inativo" ? " (o anúncio patrocinado está pausado: vale reativar)" : ""}.</p>}
                        {s.situacao === "no_ads" && <p className="text-sky-300">Já tem anúncio patrocinado ativo{s.adsRoi !== null ? ` (ROI do relatório atual: ${PCT(s.adsRoi)})` : ""}.</p>}
                        {s.motivos.map((m, i) => <p key={i} className="text-amber-300">• {m}</p>)}
                        <p className="text-slate-400">Repasse {R$(s.repasse)} − custo {R$(s.custoTotal)} ({R$(s.custoUn)} por un.) − imposto {R$(s.imposto)} = <strong className="text-slate-200">{R$(s.liquido)}</strong>. MLBs ligados ao SKU: {s.mlbs.length ? s.mlbs.join(", ") : "nenhum no cadastro de anúncios"}.</p>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
            <span className="text-[11px] text-slate-500">{visiveis.length === 0 ? "0 produtos" : `${inicio + 1}–${Math.min(inicio + porPagina, visiveis.length)} de ${visiveis.length} produto(s)`}</span>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <select value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPag(1); }} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">{[10, 25, 50, 100, 500].map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
              <button type="button" disabled={pag <= 1} onClick={() => setPag(pag - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
              <span>{pag}/{Math.max(1, Math.ceil(visiveis.length / porPagina))}</span>
              <button type="button" disabled={inicio + porPagina >= visiveis.length} onClick={() => setPag(pag + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
