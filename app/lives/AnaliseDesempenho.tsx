"use client";
import React, { useMemo } from "react";
import {
  analisarLives, dataIsoParaBr, DIAS_SEMANA, ticket,
  type ItemAnalise,
} from "../../lib/analiseLives";

const moeda = (v: number) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const hh = (h: number | null) => (h === null ? "—" : `${String(h).padStart(2, "0")}h`);

function Card({ titulo, valor, sub, cor = "text-white" }: { titulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800/80 shadow-xl">
      <span className="block text-[10px] font-bold text-slate-400 uppercase">{titulo}</span>
      <span className={`text-sm font-black font-mono mt-1 block ${cor}`}>{valor}</span>
      {sub && <span className="block text-[10px] text-slate-500 mt-0.5 truncate" title={sub}>{sub}</span>}
    </div>
  );
}

function Barra({ valor, max, cor = "bg-indigo-500" }: { valor: number; max: number; cor?: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full ${cor} rounded-full`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Sub-aba "Análise de Desempenho": vendas das lives por dia, horário, dia da semana e produto. */
export default function AnaliseDesempenho({ itens, custoLives }: { itens: ItemAnalise[]; custoLives: number }) {
  const a = useMemo(() => analisarLives(itens), [itens]);

  if (itens.length === 0) {
    return (
      <div className="bg-slate-900/90 p-10 rounded-2xl border border-slate-800/80 text-center text-slate-400 text-sm">
        Nenhuma venda de live para analisar. Suba a planilha de vendas (1. Planilha Vendas) ou ajuste os filtros.
      </div>
    );
  }

  const maxHoraVenda = Math.max(...a.horas.map((h) => h.venda), 0);
  const maxDiaVenda = Math.max(...a.dias.map((d) => d.venda), 0);
  const maxSemana = Math.max(...a.semana.map((s) => (s.dias > 0 ? s.venda / s.dias : 0)), 0);
  const margem = a.total.venda > 0 ? (a.total.liquidez / a.total.venda) * 100 : 0;
  const liquidezAposLives = a.total.liquidez - custoLives;
  const temHorario = a.comHorario > 0;
  const th = "p-3 text-right";

  return (
    <div className="space-y-6" data-analise-desempenho>
      {/* Resumo em frases */}
      <div className="bg-indigo-950/30 border border-indigo-800/50 rounded-2xl p-4 space-y-1 text-xs text-slate-200">
        <p className="text-[10px] font-black text-indigo-300 uppercase tracking-wider mb-1">Destaques do período</p>
        {a.melhorDia && <p>📅 <b>Melhor dia:</b> {dataIsoParaBr(a.melhorDia.iso)} ({DIAS_SEMANA[a.melhorDia.semana]}) — {moeda(a.melhorDia.venda)} em {a.melhorDia.itens} item(ns), ticket médio {moeda(ticket(a.melhorDia))}.</p>}
        {temHorario && a.melhorHora && <p>⏰ <b>Horário que mais vendeu:</b> {hh(a.melhorHora.hora)} às {hh((a.melhorHora.hora + 1) % 24)} — {moeda(a.melhorHora.venda)} em {a.melhorHora.itens} item(ns).</p>}
        {a.melhorSemana && <p>🗓️ <b>Melhor dia da semana (média por dia):</b> {DIAS_SEMANA[a.melhorSemana.semana]} — {moeda(a.melhorSemana.venda / Math.max(1, a.melhorSemana.dias))} por dia.</p>}
        {a.maisVendido && <p>🏆 <b>Item que mais vendeu:</b> {a.maisVendido.nome} ({a.maisVendido.sku}) — {a.maisVendido.itens} un., {moeda(a.maisVendido.venda)}.</p>}
        {a.prejuizo.length > 0 && <p className="text-rose-300">⚠️ <b>{a.prejuizo.length} produto(s) com liquidez negativa</b> (veja a tabela de produtos).</p>}
      </div>

      {(a.semData > 0 || !temHorario) && (
        <div className="bg-amber-950/40 border border-amber-700/60 text-amber-300 text-xs font-bold rounded-xl p-3 space-y-1">
          {a.semData > 0 && <p>⚠️ {a.semData} venda(s) sem data reconhecida ficaram fora da análise por dia, horário e dia da semana (continuam nos totais e nos produtos).</p>}
          {!temHorario && <p>⏰ As vendas já gravadas só têm a data, sem o horário. Para ver as análises por horário, suba novamente a planilha de vendas das lives (a coluna de data precisa trazer a hora).</p>}
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card titulo="Itens vendidos" valor={String(a.total.itens)} sub={`${a.dias.length} dia(s) com venda · ${a.mediaItensPorDia.toFixed(1)} itens/dia`} />
        <Card titulo="Valor das vendas" valor={moeda(a.total.venda)} sub={`média ${moeda(a.mediaVendaPorDia)} por dia`} />
        <Card titulo="Ticket médio" valor={moeda(ticket(a.total))} sub="valor da venda ÷ itens" cor="text-cyan-400" />
        <Card titulo="Taxas e tarifas" valor={"- " + moeda(a.total.tarifas)} sub={pct(a.total.venda > 0 ? (a.total.tarifas / a.total.venda) * 100 : 0) + " da venda"} cor="text-rose-400" />
        <Card titulo="Repasse" valor={moeda(a.total.repasse)} />
        <Card titulo="Liquidez" valor={moeda(a.total.liquidez)} sub={`margem ${pct(margem)} sobre a venda`} cor="text-emerald-400" />
        <Card titulo="Liquidez após lives" valor={moeda(liquidezAposLives)} sub={`custo das lives ${moeda(custoLives)}`} cor={liquidezAposLives >= 0 ? "text-emerald-400" : "text-rose-400"} />
        <Card titulo="Item que mais vendeu" valor={a.maisVendido ? `${a.maisVendido.itens} un.` : "—"} sub={a.maisVendido ? `${a.maisVendido.sku} · ${a.maisVendido.nome}` : undefined} cor="text-indigo-300" />
        <Card titulo="Maior faturamento" valor={a.maiorFaturamento ? moeda(a.maiorFaturamento.venda) : "—"} sub={a.maiorFaturamento ? `${a.maiorFaturamento.sku} · ${a.maiorFaturamento.nome}` : undefined} cor="text-indigo-300" />
        <Card titulo="Maior liquidez" valor={a.maiorLiquidez ? moeda(a.maiorLiquidez.liquidez) : "—"} sub={a.maiorLiquidez ? `${a.maiorLiquidez.sku} · ${a.maiorLiquidez.nome}` : undefined} cor="text-emerald-300" />
      </div>

      {/* Por horário */}
      {temHorario && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">⏰ Desempenho por horário</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Hora em que a venda foi registrada na planilha ({a.comHorario} de {a.total.itens} itens têm horário).</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {a.faixas.map((f) => (
              <div key={f.nome} className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">{f.nome}</span>
                <span className="block text-sm font-black font-mono text-white mt-1">{moeda(f.venda)}</span>
                <span className="block text-[10px] text-slate-500">{f.itens} item(ns) · ticket {moeda(ticket(f))}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-2.5">HORA</th>
                  <th className="p-2.5 w-[40%]">VENDA</th>
                  <th className={th}>ITENS</th>
                  <th className={th}>VALOR</th>
                  <th className={th}>TICKET MÉDIO</th>
                  <th className={th}>LIQUIDEZ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {a.horas.filter((h) => h.itens > 0).map((h) => (
                  <tr key={h.hora} className={a.melhorHora?.hora === h.hora ? "bg-indigo-950/30" : "hover:bg-slate-800/40"}>
                    <td className="p-2.5 font-mono font-bold text-white whitespace-nowrap">{hh(h.hora)} – {hh((h.hora + 1) % 24)}{a.melhorHora?.hora === h.hora ? " 🏆" : ""}</td>
                    <td className="p-2.5"><Barra valor={h.venda} max={maxHoraVenda} /></td>
                    <td className="p-2.5 text-right font-mono text-slate-200">{h.itens}</td>
                    <td className="p-2.5 text-right font-mono text-white">{moeda(h.venda)}</td>
                    <td className="p-2.5 text-right font-mono text-cyan-400">{moeda(ticket(h))}</td>
                    <td className={`p-2.5 text-right font-mono ${h.liquidez >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{moeda(h.liquidez)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Por dia */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-xl p-5 space-y-3">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">📅 Desempenho por dia</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Do dia mais recente para o mais antigo.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-2.5">DATA</th>
                <th className="p-2.5">DIA</th>
                <th className="p-2.5 w-[18%]">VENDA</th>
                <th className={th}>ITENS</th>
                <th className={th}>VALOR</th>
                <th className={th}>TICKET MÉDIO</th>
                <th className={th}>HORA DE PICO</th>
                <th className="p-2.5">ITEM QUE MAIS VENDEU</th>
                <th className={th}>LIQUIDEZ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {[...a.dias].reverse().map((d) => (
                <tr key={d.iso} className={a.melhorDia?.iso === d.iso ? "bg-indigo-950/30" : "hover:bg-slate-800/40"}>
                  <td className="p-2.5 font-mono font-bold text-white whitespace-nowrap">{dataIsoParaBr(d.iso)}{a.melhorDia?.iso === d.iso ? " 🏆" : ""}</td>
                  <td className="p-2.5 text-slate-300 whitespace-nowrap">{DIAS_SEMANA[d.semana]}</td>
                  <td className="p-2.5"><Barra valor={d.venda} max={maxDiaVenda} cor="bg-cyan-500" /></td>
                  <td className="p-2.5 text-right font-mono text-slate-200">{d.itens}</td>
                  <td className="p-2.5 text-right font-mono text-white">{moeda(d.venda)}</td>
                  <td className="p-2.5 text-right font-mono text-cyan-400">{moeda(ticket(d))}</td>
                  <td className="p-2.5 text-right font-mono text-slate-300">{hh(d.horaPico)}</td>
                  <td className="p-2.5 text-slate-300"><span className="truncate block max-w-[260px]" title={d.topProduto}>{d.topProduto}</span><span className="text-[10px] text-slate-500">{d.topProdutoQtd} un.</span></td>
                  <td className={`p-2.5 text-right font-mono ${d.liquidez >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{moeda(d.liquidez)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por dia da semana */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-xl p-5 space-y-3">
        <h3 className="text-sm font-black text-white uppercase tracking-wider">🗓️ Desempenho por dia da semana</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-2.5">DIA</th>
                <th className="p-2.5 w-[30%]">MÉDIA POR DIA</th>
                <th className={th}>DIAS COM VENDA</th>
                <th className={th}>ITENS</th>
                <th className={th}>VALOR</th>
                <th className={th}>MÉDIA/DIA</th>
                <th className={th}>TICKET MÉDIO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {a.semana.filter((s) => s.dias > 0).map((s) => (
                <tr key={s.semana} className="hover:bg-slate-800/40">
                  <td className="p-2.5 font-bold text-white">{DIAS_SEMANA[s.semana]}</td>
                  <td className="p-2.5"><Barra valor={s.venda / s.dias} max={maxSemana} cor="bg-emerald-500" /></td>
                  <td className="p-2.5 text-right font-mono text-slate-300">{s.dias}</td>
                  <td className="p-2.5 text-right font-mono text-slate-200">{s.itens}</td>
                  <td className="p-2.5 text-right font-mono text-white">{moeda(s.venda)}</td>
                  <td className="p-2.5 text-right font-mono text-emerald-400">{moeda(s.venda / s.dias)}</td>
                  <td className="p-2.5 text-right font-mono text-cyan-400">{moeda(ticket(s))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Produtos */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800/80 shadow-xl p-5 space-y-3">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">🏆 Ranking de produtos</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Os 15 que mais venderam (por quantidade). Margem = liquidez ÷ valor da venda.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-2.5">#</th>
                <th className="p-2.5">SKU / PRODUTO</th>
                <th className={th}>QTD</th>
                <th className={th}>VALOR</th>
                <th className={th}>TICKET MÉDIO</th>
                <th className={th}>LIQUIDEZ</th>
                <th className={th}>MARGEM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {a.produtos.slice(0, 15).map((p, i) => (
                <tr key={p.sku + i} className="hover:bg-slate-800/40">
                  <td className="p-2.5 font-mono text-slate-500">{i + 1}</td>
                  <td className="p-2.5">
                    <span className="font-mono text-indigo-400 block">{p.sku}</span>
                    <span className="text-slate-300 truncate block max-w-[320px]" title={p.nome}>{p.nome}</span>
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-white">{p.itens}</td>
                  <td className="p-2.5 text-right font-mono text-white">{moeda(p.venda)}</td>
                  <td className="p-2.5 text-right font-mono text-cyan-400">{moeda(ticket(p))}</td>
                  <td className={`p-2.5 text-right font-mono ${p.liquidez >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{moeda(p.liquidez)}</td>
                  <td className={`p-2.5 text-right font-mono ${p.margem >= 0 ? "text-cyan-400" : "text-rose-400"}`}>{pct(p.margem)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {a.prejuizo.length > 0 && (
          <div className="pt-2">
            <p className="text-[11px] font-black text-rose-300 uppercase tracking-wider mb-1">Produtos com liquidez negativa</p>
            <ul className="text-xs text-slate-300 space-y-0.5">
              {a.prejuizo.slice(0, 10).map((p) => (
                <li key={p.sku}><span className="font-mono text-indigo-400">{p.sku}</span> {p.nome} — {p.itens} un., liquidez <b className="text-rose-400">{moeda(p.liquidez)}</b></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
