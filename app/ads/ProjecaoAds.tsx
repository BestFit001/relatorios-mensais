"use client";
// Análise global > Projeção mensal: quanto cada canal já gastou em Ads no mês, o saldo atual (informado à mão e descontado a cada planilha nova),
// recargas e a projeção do valor a colocar no Adsense para manter o ritmo de vendas até o fim do mês.
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { numeroBR } from "../../lib/adsImport";
import { carregarSaldoAds, definirSaldoAds, gastoTotalPorCanal, projetarMes, registrarRecargaAds, saldoAtualAds, type SaldoAds } from "../../lib/adsSaldo";

export type CanalProjecao = { canal: string; invAtual: number; totFatAtual: number };

const R$ = (v: number) => (v < 0 ? "-R$ " : "R$ ") + Math.abs(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM1 = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dataCurta = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const quando = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : `${dataCurta(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function ProjecaoAds({ mes, canais, solo = false }: { mes: string; canais: CanalProjecao[]; solo?: boolean }) {
  const [saldos, setSaldos] = useState<Record<string, SaldoAds | null>>({});
  const [gastos, setGastos] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [dias, setDias] = useState("");
  const [campoSaldo, setCampoSaldo] = useState<Record<string, string>>({});
  const [campoRecarga, setCampoRecarga] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { tipo: "ok" | "erro"; texto: string }>>({});
  const chaveCanais = canais.map((c) => `${c.canal}|${c.invAtual}`).join(";");

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [g, lista] = await Promise.all([gastoTotalPorCanal(supabase), Promise.all(canais.map(async (c) => [c.canal, await carregarSaldoAds(supabase, c.canal)] as const))]);
      if (!ativo) return;
      setGastos(g); setSaldos(Object.fromEntries(lista)); setCarregando(false);
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveCanais]);

  const hoje = useMemo(() => new Date(), []);
  const diasNum = dias.trim() === "" ? null : Math.round(numeroBR(dias));
  const gastoTotal = (canal: string) => gastos[canal.toLowerCase().trim()] || 0;

  const linhas = canais.map((c) => {
    const saldo = saldoAtualAds(saldos[c.canal] || null, gastoTotal(c.canal));
    const proj = projetarMes({ gasto: c.invAtual, faturamento: c.totFatAtual, mes, hoje, diasOverride: diasNum, saldo });
    return { ...c, saldo, proj };
  });
  const tot = linhas.reduce((t, l) => ({ gasto: t.gasto + l.invAtual, previsto: t.previsto + l.proj.adsProjetadoMes, recarga: t.recarga + (l.proj.recargaSugerida || 0), saldo: t.saldo + (l.saldo || 0), semSaldo: t.semSaldo + (l.saldo === null ? 1 : 0) }), { gasto: 0, previsto: 0, recarga: 0, saldo: 0, semSaldo: 0 });

  const salvarSaldo = async (canal: string) => {
    const t = (campoSaldo[canal] ?? "").trim();
    if (t === "") { setMsg((m) => ({ ...m, [canal]: { tipo: "erro", texto: "Digite o saldo atual do Adsense." } })); return; }
    const { saldo, erro } = await definirSaldoAds(supabase, canal, numeroBR(t), gastoTotal(canal), saldos[canal] || null);
    if (!erro) { setSaldos((s) => ({ ...s, [canal]: saldo })); setCampoSaldo((c) => ({ ...c, [canal]: "" })); }
    setMsg((m) => ({ ...m, [canal]: erro ? { tipo: "erro", texto: erro } : { tipo: "ok", texto: `Saldo definido em ${R$(numeroBR(t))}. Cada planilha nova de Ads vai descontando daqui.` } }));
  };
  const recarregar = async (canal: string) => {
    const v = numeroBR((campoRecarga[canal] ?? "").trim());
    if (!(v > 0)) { setMsg((m) => ({ ...m, [canal]: { tipo: "erro", texto: "Digite o valor da recarga." } })); return; }
    const { saldo, erro } = await registrarRecargaAds(supabase, canal, v, gastoTotal(canal), saldos[canal] || null);
    if (!erro) { setSaldos((s) => ({ ...s, [canal]: saldo })); setCampoRecarga((c) => ({ ...c, [canal]: "" })); }
    setMsg((m) => ({ ...m, [canal]: erro ? { tipo: "erro", texto: erro } : { tipo: "ok", texto: `Recarga de ${R$(v)} somada ao saldo.` } }));
  };

  const card = (rotulo: string, valor: string, extra: string, cor = "text-white", attr?: string) => (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4" {...(attr ? { [attr]: "" } : {})}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{rotulo}</p>
      <p className={`text-xl font-black mt-1 ${cor}`}>{valor}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{extra}</p>
    </div>
  );
  const linha = (rotulo: string, valor: React.ReactNode, attr?: string, cor = "text-slate-200") => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-800/60 text-xs" {...(attr ? { [attr]: "" } : {})}>
      <span className="text-slate-400">{rotulo}</span><span className={`font-mono font-bold text-right ${cor}`}>{valor}</span>
    </div>
  );

  return (
    <div className={`${solo ? "" : "mt-8 "}bg-slate-950/50 p-5 rounded-xl border border-slate-800`} data-projecao>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-black text-white">📈 Projeção mensal · {mes}</h3>
          <p className="text-[11px] text-slate-400 mt-1 max-w-3xl">Mantém o ritmo do mês: o que cada canal gastou e faturou por dia até agora segue até o fim do mês. O saldo é o que você informa; cada planilha nova de Ads desconta o gasto novo dele, e a recarga soma.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <label htmlFor="proj-dias">Dias considerados</label>
          <input id="proj-dias" data-proj-dias value={dias} onChange={(e) => setDias(e.target.value)} placeholder={`hoje (${hoje.getDate()})`} className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-right text-white outline-none focus:border-purple-500" />
        </div>
      </div>

      {carregando ? <p className="text-sm text-slate-400 p-4">Calculando…</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-proj-resumo>
            {card("Ads gasto até agora", R$(tot.gasto), "todos os canais, neste mês", "text-white", "data-proj-total-gasto")}
            {card("Saldo atual", R$(tot.saldo), tot.semSaldo > 0 ? `${tot.semSaldo} canal(is) sem saldo informado` : "soma dos canais", "text-emerald-300", "data-proj-total-saldo")}
            {card("Ads previsto no mês", R$(tot.previsto), "no ritmo de agora", "text-indigo-300", "data-proj-total-previsto")}
            {card("Recarga sugerida", R$(tot.recarga), "para chegar ao fim do mês no mesmo ritmo", tot.recarga > 0 ? "text-amber-300" : "text-emerald-300", "data-proj-total-recarga")}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {linhas.map((l) => {
              const sa = saldos[l.canal] || null;
              const m = msg[l.canal];
              const acabaEm = l.saldo !== null && l.proj.saldoSuficienteAte !== null && !l.proj.encerrado ? new Date(hoje.getTime() + (l.proj.saldoSuficienteAte - 0) * 86400000) : null;
              const status = l.saldo === null ? { t: "Informe o saldo", c: "text-slate-300 bg-slate-800 border-slate-700" }
                : l.proj.encerrado ? { t: "Mês encerrado", c: "text-slate-300 bg-slate-800 border-slate-700" }
                : l.saldo <= 0 ? { t: "Saldo esgotado", c: "text-rose-300 bg-rose-950/40 border-rose-900/60" }
                : (l.proj.recargaSugerida || 0) > 0 ? { t: "Recarregar", c: "text-amber-300 bg-amber-950/30 border-amber-900/50" }
                : { t: "Saldo suficiente", c: "text-emerald-300 bg-emerald-950/30 border-emerald-900/50" };
              return (
                <div key={l.canal} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5" data-proj-canal={l.canal}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h4 className="font-black text-white text-sm">{l.canal}</h4>
                    <span data-proj-status className={`text-[10px] font-black px-2 py-1 rounded-full border ${status.c}`}>{status.t}</span>
                  </div>
                  {linha("Faturamento até agora", R$(l.totFatAtual))}
                  {linha("Ads gasto até agora", R$(l.invAtual), "data-proj-gasto")}
                  {linha("TACOS (ads ÷ faturamento)", l.proj.tacos === null ? "—" : `${NUM1(l.proj.tacos)}%`)}
                  {linha(`Ritmo de gasto (${l.proj.diasDecorridos} dia(s))`, `${R$(l.proj.ritmoDia)}/dia`, "data-proj-ritmo")}
                  {linha("Faturamento previsto no mês", R$(l.proj.fatProjetadoMes), "data-proj-fat-prev")}
                  {linha("Ads previsto no mês", R$(l.proj.adsProjetadoMes), "data-proj-previsto", "text-indigo-300")}
                  {linha(l.proj.encerrado ? "Falta gastar" : `Falta gastar (${l.proj.diasRestantes} dia(s))`, R$(l.proj.faltaGastar), "data-proj-falta")}
                  {linha("Saldo atual", l.saldo === null ? "não informado" : R$(l.saldo), "data-proj-saldo", l.saldo === null ? "text-slate-500" : l.saldo <= 0 ? "text-rose-400" : "text-emerald-300")}
                  {linha("Saldo dura", l.saldo === null ? "—" : l.proj.saldoSuficienteAte === null ? "sem gasto no mês" : l.saldo <= 0 ? "acabou" : `${NUM1(l.proj.saldoSuficienteAte)} dia(s)${acabaEm && !l.proj.encerrado && l.proj.saldoSuficienteAte < l.proj.diasRestantes ? ` · até ${dataCurta(acabaEm)}` : ""}`, "data-proj-dura")}
                  {linha("Recarga sugerida", l.proj.recargaSugerida === null ? "informe o saldo" : R$(l.proj.recargaSugerida), "data-proj-recarga", l.proj.recargaSugerida ? "text-amber-300" : "text-slate-200")}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Saldo atual do Adsense</label>
                      <div className="flex gap-2">
                        <input data-proj-campo-saldo={l.canal} value={campoSaldo[l.canal] ?? ""} onChange={(e) => setCampoSaldo((c) => ({ ...c, [l.canal]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") salvarSaldo(l.canal); }} placeholder="Ex.: 5.000,00" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500" />
                        <button type="button" data-proj-salvar-saldo={l.canal} onClick={() => salvarSaldo(l.canal)} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-3 rounded-lg text-xs cursor-pointer whitespace-nowrap">Salvar saldo</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Valor da recarga</label>
                      <div className="flex gap-2">
                        <input data-proj-campo-recarga={l.canal} value={campoRecarga[l.canal] ?? ""} onChange={(e) => setCampoRecarga((c) => ({ ...c, [l.canal]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") recarregar(l.canal); }} placeholder="Ex.: 2.000,00" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500" />
                        <button type="button" data-proj-recarga-btn={l.canal} onClick={() => recarregar(l.canal)} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 rounded-lg text-xs cursor-pointer">Recarga</button>
                      </div>
                    </div>
                  </div>
                  {m && <p data-proj-msg={l.canal} className={`text-[11px] font-bold mt-2 ${m.tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{m.texto}</p>}
                  {sa && sa.historico.length > 0 && (
                    <details className="mt-3 text-[11px] text-slate-400">
                      <summary className="cursor-pointer font-bold text-slate-300">Histórico do saldo</summary>
                      <ul className="mt-2 space-y-1" data-proj-historico={l.canal}>
                        {sa.historico.slice(0, 10).map((e, i) => <li key={i}>{quando(e.em)} · {e.tipo === "recarga" ? "Recarga" : "Saldo definido"} {R$(e.valor)}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-4" data-proj-legenda>Ads previsto = gasto até agora ÷ dias considerados × dias do mês. Recarga sugerida = o que ainda falta gastar no mês − saldo atual (zero se o saldo já cobre). Saldo atual = saldo informado + recargas − o que as planilhas novas de Ads gastaram depois dele.</p>
        </>
      )}
    </div>
  );
}
