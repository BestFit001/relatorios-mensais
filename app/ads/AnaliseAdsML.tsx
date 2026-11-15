"use client";
// Análise dos anúncios patrocinados do Mercado Livre (ROI, ROAS, liquidez e recomendação) e as vendas que vieram sem patrocínio.
import React, { useMemo, useState } from "react";
import type { Acao, AnaliseAnuncio } from "../../lib/adsMl";
import { useDadosML } from "./useDadosML";
import { NUM, ORDEM_ACOES, PCT, R$, ROAS, ROTULO_ACAO, dataBR } from "./fmtML";

type Props = { canal: string; visao: "anuncios" | "halo" };

const Selo = ({ acao }: { acao: Acao }) => (
  <span title={ROTULO_ACAO[acao].dica} className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${ROTULO_ACAO[acao].cor}`}>{ROTULO_ACAO[acao].rotulo}</span>
);
const cor = (v: number) => (v >= 0 ? "text-emerald-400" : "text-rose-400");
const card = (titulo: string, valor: string, sub?: string, c = "text-white") => (
  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titulo}</div>
    <div className={`text-lg font-black mt-1 ${c}`}>{valor}</div>
    {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

function Paginacao({ total, pag, porPagina, setPag, setPorPagina, rotulo }: { total: number; pag: number; porPagina: number; setPag: (n: number) => void; setPorPagina: (n: number) => void; rotulo: string }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-4" data-paginacao-ml>
      <span className="text-[11px] text-slate-500">{total === 0 ? `0 ${rotulo}` : `${(pag - 1) * porPagina + 1}–${Math.min(pag * porPagina, total)} de ${total} ${rotulo}`}</span>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <select value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPag(1); }} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">{[10, 25, 50, 100, 500].map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
        <button type="button" disabled={pag <= 1} onClick={() => setPag(pag - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
        <span>{pag}/{paginas}</span>
        <button type="button" disabled={pag >= paginas} onClick={() => setPag(pag + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
      </div>
    </div>
  );
}

export default function AnaliseAdsML({ canal, visao }: Props) {
  const { pads, vendas, analise, carregando, mes } = useDadosML(canal);
  const [busca, setBusca] = useState("");
  const [acao, setAcao] = useState<Acao | "todas">("todas");
  const [ordem, setOrdem] = useState<"liquidez" | "roi" | "roas" | "investimento" | "receita" | "indireta">("liquidez");
  const [porPagina, setPorPagina] = useState(10);
  const [pag, setPag] = useState(1);
  const [aberto, setAberto] = useState<string | null>(null);

  const lista = useMemo(() => {
    if (!analise) return [] as AnaliseAnuncio[];
    const q = busca.trim().toLowerCase();
    const f = analise.anuncios.filter((a) => (acao === "todas" || a.acao === acao) && (!q || a.titulo.toLowerCase().includes(q) || a.mlb.toLowerCase().includes(q) || a.itens.some((i) => i.sku.toLowerCase().includes(q))));
    const v: Record<string, (a: AnaliseAnuncio) => number> = { liquidez: (a) => a.liquidez, roi: (a) => a.roi ?? -1e9, roas: (a) => a.roas, investimento: (a) => a.investimento, receita: (a) => a.receitaTotal, indireta: (a) => a.liquidezIndireta };
    return [...f].sort((x, y) => v[ordem](y) - v[ordem](x));
  }, [analise, busca, acao, ordem]);

  const [buscaHalo, setBuscaHalo] = useState("");
  const halo = useMemo(() => {
    if (!analise) return [];
    const q = buscaHalo.trim().toLowerCase();
    return analise.halo.filter((h) => !q || h.titulo.toLowerCase().includes(q) || h.mlb.toLowerCase().includes(q) || h.sku.toLowerCase().includes(q));
  }, [analise, buscaHalo]);
  const puxadores = useMemo(() => (analise ? analise.anuncios.filter((a) => a.itens.some((i) => !i.direta)).sort((x, y) => y.liquidezIndireta - x.liquidezIndireta) : []), [analise]);

  if (carregando) return <div className="text-sm text-slate-500 p-6">Carregando…</div>;
  if (!analise || !pads) return <div data-sem-dados-ml className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center text-sm text-slate-500">Nenhuma planilha do Mercado Livre enviada. Envie as planilhas na sub-aba Campanhas.</div>;
  const t = analise.tot;
  const inicio = (pag - 1) * porPagina;

  // ---------------- VENDAS SEM PATROCÍNIO ----------------
  if (visao === "halo") {
    return (
      <div className="space-y-6" data-halo-ml>
        {!vendas && <div className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">Esta visão precisa da planilha “Relatório de vendas”. Envie-a na sub-aba Campanhas.</div>}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <h2 className="text-lg font-bold text-white">🔗 Vendas sem patrocínio — {mes}</h2>
          <p className="text-xs text-slate-400 mt-1 mb-5 max-w-3xl">Produtos que venderam sem estar no Ads, mas vendidos por quem clicou em um anúncio patrocinado de outro produto. Esse resultado já está somado na liquidez do anúncio que o puxou, por isso pesa na decisão de manter ou retirar.</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {card("Produtos sem patrocínio", String(analise.haloTot.mlbs), "MLBs vendidos por efeito dos anúncios")}
            {card("Unidades", NUM(analise.haloTot.un))}
            {card("Receita", R$(analise.haloTot.rec))}
            {card("Lucro antes dos anúncios", R$(analise.haloTot.lucroAntesAds), "após custo, imposto, tarifa, frete e embalagem", cor(analise.haloTot.lucroAntesAds))}
          </div>
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h3 className="text-sm font-bold text-white">Produtos vendidos sem patrocínio</h3>
            <input data-busca-halo value={buscaHalo} onChange={(e) => setBuscaHalo(e.target.value)} placeholder="Buscar produto, MLB ou SKU…" className="ml-auto bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-purple-500 w-64" />
          </div>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap" data-tabela-halo>
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold text-[10px]">
                <tr><th className="p-3 min-w-[260px]">Produto vendido</th><th className="p-3">SKU</th><th className="p-3 text-right">Un.</th><th className="p-3 text-right">Receita</th><th className="p-3 text-right">Lucro antes dos anúncios</th><th className="p-3">Puxado por</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {halo.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{vendas ? "Nenhum produto vendido sem patrocínio." : "Envie a planilha de vendas."}</td></tr>}
                {halo.map((h) => (
                  <tr key={h.mlb} data-halo-mlb={h.mlb} className="hover:bg-slate-800/40">
                    <td className="p-3"><div className="font-bold text-slate-100 whitespace-normal max-w-[340px]">{h.titulo || h.mlb}</div><div className="text-[10px] text-slate-500">{h.mlb}{h.semCadastro && <span className="ml-2 text-amber-400 font-bold">fora do cadastro</span>}{!h.semCadastro && h.semCusto && <span className="ml-2 text-amber-400 font-bold">sem custo</span>}</div></td>
                    <td className="p-3 font-mono text-[11px] text-slate-300">{h.sku || "—"}</td>
                    <td className="p-3 text-right">{NUM(h.un)}</td>
                    <td className="p-3 text-right">{R$(h.rec)}</td>
                    <td className={`p-3 text-right font-bold ${cor(h.conta.lucroAntesAds)}`}>{R$(h.conta.lucroAntesAds)}</td>
                    <td className="p-3 whitespace-normal text-[11px] text-slate-400 max-w-[360px]">{h.patrocinadores.map((p) => `${p.titulo || p.mlb} (${NUM(p.un)} un.)`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-1">Anúncios que puxam outros produtos</h3>
          <p className="text-[11px] text-slate-500 mb-4">Ordenados pelo lucro que as vendas indiretas geraram (antes do investimento). Pense duas vezes antes de retirar um anúncio que está no topo desta lista.</p>
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap" data-tabela-puxadores>
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold text-[10px]">
                <tr><th className="p-3 min-w-[260px]">Anúncio patrocinado</th><th className="p-3 text-right">Investimento</th><th className="p-3 text-right">Lucro das vendas indiretas</th><th className="p-3 text-right">Liquidez total</th><th className="p-3">Recomendação</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {puxadores.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Nenhum anúncio com vendas indiretas.</td></tr>}
                {puxadores.map((a) => (
                  <tr key={a.mlb} data-puxador={a.mlb}>
                    <td className="p-3"><div className="font-bold text-slate-100 whitespace-normal max-w-[340px]">{a.titulo}</div><div className="text-[10px] text-slate-500">{a.mlb}</div></td>
                    <td className="p-3 text-right">{R$(a.investimento)}</td>
                    <td className={`p-3 text-right font-bold ${cor(a.liquidezIndireta)}`}>{R$(a.liquidezIndireta)}</td>
                    <td className={`p-3 text-right font-bold ${cor(a.liquidez)}`}>{R$(a.liquidez)}</td>
                    <td className="p-3"><Selo acao={a.acao} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- ANÁLISE DOS ANÚNCIOS ----------------
  return (
    <div className="space-y-6" data-analise-ml>
      {!vendas && <div className="text-[11px] text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">Sem a planilha de vendas, a liquidez usa só as vendas que a planilha de patrocinados informa. Envie a de vendas na sub-aba Campanhas para cruzar com os produtos vendidos sem patrocínio.</div>}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <h2 className="text-lg font-bold text-white">📈 Análise dos anúncios — {mes}</h2>
        <p className="text-xs text-slate-400 mt-1 mb-5 max-w-3xl">Liquidez = retorno atribuído ao anúncio (diretas + indiretas) − custo do SKU − imposto − tarifa − frete − embalagem − investimento. ROI = liquidez ÷ investimento. ROAS = retorno ÷ investimento. Período {dataBR(pads.periodo.ini)} a {dataBR(pads.periodo.fim)}.</p>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" data-cards-ml>
          {card("Investimento", R$(t.investimento), `${analise.anuncios.length} anúncios`)}
          {card("Retorno", R$(t.receita), `${NUM(t.unidades)} unidades`)}
          {card("ROAS", ROAS(t.roas), `ACOS ${PCT(t.acos)}`)}
          {card("Liquidez", R$(t.liquidez), undefined, cor(t.liquidez))}
          {card("ROI", PCT(t.roi), "liquidez ÷ investimento", cor(t.roi ?? 0))}
          {card("Diretas × indiretas", `${R$(t.receitaDir)}`, `${R$(t.receitaInd)} indiretas`)}
        </div>
        <div className="flex flex-wrap gap-2 mt-5" data-acoes-ml>
          <button type="button" onClick={() => { setAcao("todas"); setPag(1); }} className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${acao === "todas" ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400"}`}>Todos ({analise.anuncios.length})</button>
          {ORDEM_ACOES.filter((a) => analise.porAcao[a].n > 0).map((a) => (
            <button key={a} type="button" data-filtro-acao={a} onClick={() => { setAcao(a); setPag(1); }} title={ROTULO_ACAO[a].dica} className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${acao === a ? "bg-purple-600 border-purple-400 text-white" : ROTULO_ACAO[a].cor}`}>
              {ROTULO_ACAO[a].rotulo} ({analise.porAcao[a].n}) · {R$(analise.porAcao[a].liquidez)}
            </button>
          ))}
        </div>
        {(t.semCusto > 0 || t.semCadastro > 0) && <p className="text-[11px] text-amber-300 mt-3">⚠ {t.semCadastro > 0 ? `${t.semCadastro} anúncio(s) com MLB fora do cadastro de anúncios do ML (comissão 14% e frete padrão). ` : ""}{t.semCusto > 0 ? `${t.semCusto} com SKU sem custo cadastrado: a liquidez deles aparece maior que a real.` : ""}</p>}
      </div>

      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input data-busca-ml value={busca} onChange={(e) => { setBusca(e.target.value); setPag(1); }} placeholder="Buscar título, MLB ou SKU…" className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-purple-500 w-64" />
          <select data-ordem-ml value={ordem} onChange={(e) => { setOrdem(e.target.value as any); setPag(1); }} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
            <option value="liquidez">Ordenar: maior liquidez</option><option value="roi">Ordenar: maior ROI</option><option value="roas">Ordenar: maior ROAS</option>
            <option value="investimento">Ordenar: maior investimento</option><option value="receita">Ordenar: maior retorno</option><option value="indireta">Ordenar: mais vendas indiretas</option>
          </select>
        </div>
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap" data-tabela-ml>
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold text-[10px]">
              <tr>
                <th className="p-3 min-w-[260px]">Anúncio patrocinado</th><th className="p-3">Status</th><th className="p-3 text-right">Investimento</th><th className="p-3 text-right">Retorno</th>
                <th className="p-3 text-right">ROAS</th><th className="p-3 text-right">Un.</th><th className="p-3 text-right">Liquidez</th><th className="p-3 text-right">ROI</th><th className="p-3">Recomendação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {lista.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500">Nenhum anúncio com esse filtro.</td></tr>}
              {lista.slice(inicio, inicio + porPagina).map((a) => (
                <React.Fragment key={a.mlb}>
                  <tr data-anuncio-ml={a.mlb} onClick={() => setAberto(aberto === a.mlb ? null : a.mlb)} className="hover:bg-slate-800/40 cursor-pointer">
                    <td className="p-3"><div className="font-bold text-slate-100 whitespace-normal max-w-[340px] line-clamp-2">{a.titulo}</div><div className="text-[10px] text-slate-500">{a.mlb}{a.campanha && ` · campanha ${a.campanha}`}{a.semCusto && <span className="ml-2 text-amber-400 font-bold">custo em falta</span>}</div></td>
                    <td className="p-3 text-slate-400">{a.status}</td>
                    <td className="p-3 text-right">{R$(a.investimento)}</td>
                    <td className="p-3 text-right">{R$(a.receitaTotal)}</td>
                    <td className="p-3 text-right">{ROAS(a.roas)}</td>
                    <td className="p-3 text-right">{NUM(a.unidades)}</td>
                    <td className={`p-3 text-right font-bold ${cor(a.liquidez)}`}>{R$(a.liquidez)}</td>
                    <td className={`p-3 text-right font-bold ${cor(a.roi ?? 0)}`}>{PCT(a.roi)}</td>
                    <td className="p-3"><Selo acao={a.acao} /></td>
                  </tr>
                  {aberto === a.mlb && (
                    <tr data-anuncio-detalhe={a.mlb} className="bg-slate-950/60">
                      <td colSpan={9} className="p-4 whitespace-normal">
                        <p className="text-[11px] text-slate-300 mb-3"><strong>{ROTULO_ACAO[a.acao].rotulo}:</strong> {a.motivo}</p>
                        {a.itens.length === 0 ? <p className="text-[11px] text-slate-500">Nenhuma venda atribuída a este anúncio no período.</p> : (
                          <div className="overflow-x-auto border border-slate-800 rounded-lg">
                            <table className="w-full text-left text-[11px] whitespace-nowrap">
                              <thead className="text-slate-500 border-b border-slate-800"><tr><th className="p-2">Produto vendido</th><th className="p-2">Origem</th><th className="p-2">SKU</th><th className="p-2 text-right">Un.</th><th className="p-2 text-right">Receita</th><th className="p-2 text-right">Custo</th><th className="p-2 text-right">Imposto + tarifa</th><th className="p-2 text-right">Frete + embal.</th><th className="p-2 text-right">Lucro antes do anúncio</th></tr></thead>
                              <tbody className="divide-y divide-slate-800/60">
                                {a.itens.map((i) => (
                                  <tr key={i.mlb}>
                                    <td className="p-2 whitespace-normal max-w-[300px]">{i.titulo || i.mlb}<div className="text-[10px] text-slate-500">{i.mlb}</div></td>
                                    <td className="p-2">{i.direta ? <span className="text-sky-300">direta</span> : i.patrocinado ? <span className="text-violet-300">indireta (também patrocinado)</span> : <span className="text-violet-300">indireta (sem patrocínio)</span>}</td>
                                    <td className="p-2 font-mono">{i.sku || "—"}{i.semCadastro && <span className="ml-1 text-amber-400">fora do cadastro</span>}{!i.semCadastro && i.semCusto && <span className="ml-1 text-amber-400">sem custo</span>}</td>
                                    <td className="p-2 text-right">{NUM(i.un)}</td><td className="p-2 text-right">{R$(i.rec)}</td><td className="p-2 text-right">{R$(i.conta.custo)}</td>
                                    <td className="p-2 text-right">{R$(i.conta.imposto + i.conta.tarifa)}</td><td className="p-2 text-right">{R$(i.conta.frete + i.conta.embalagem)}</td>
                                    <td className={`p-2 text-right font-bold ${cor(i.conta.lucroAntesAds)}`}>{R$(i.conta.lucroAntesAds)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-500 mt-2">Liquidez direta (própria venda − investimento): <strong className={cor(a.liquidezDireta)}>{R$(a.liquidezDireta)}</strong> · liquidez das vendas indiretas: <strong className={cor(a.liquidezIndireta)}>{R$(a.liquidezIndireta)}</strong></p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacao total={lista.length} pag={pag} porPagina={porPagina} setPag={setPag} setPorPagina={setPorPagina} rotulo="anúncio(s)" />
      </div>
    </div>
  );
}
