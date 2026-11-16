"use client";
// Análise global > Projeção mensal: quanto cada canal já gastou em Ads no mês, o saldo atual (informado à mão e descontado a cada planilha nova),
// recargas e a projeção do valor a colocar no Adsense para manter o ritmo de vendas até o fim do mês.
//  - TikTok Lives entra como um item à parte, mas gasta do MESMO saldo do TikTok Shop: a recarga sugerida soma o que falta gastar nos dois.
//  - Mercado Livre (1 e 2) não tem recarga: o limite é o budget do mês informado à mão; mostra quanto ultrapassou e quanto o ritmo atual vai gastar.
//  - Dá para escolher quais canais entram na análise (a escolha fica guardada neste navegador).
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { numeroBR } from "../../lib/adsImport";
import { carregarBudgetCanal, carregarSaldoAds, definirSaldoAds, fixarReferenciaLives, gastoTotalPorCanal, projetarCompartilhado, projetarMes, registrarRecargaAds, salvarBudgetCanal, saldoAtualAds, situacaoBudget, type Projecao, type SaldoAds, type SituacaoBudget } from "../../lib/adsSaldo";
import { ehMercadoLivre } from "../../lib/adsMlDb";

export type CanalProjecao = { canal: string; invAtual: number; totFatAtual: number; budgetSugerido?: number };
/** Lives do TikTok: custo do Adsense das lives (planilha enviada na aba Lives) e faturamento das vendas de lives no mês. */
export type LivesProjecao = { gasto: number; faturamento: number };
export const NOME_LIVES = "TikTok Lives";
const CHAVE_EXCLUIDOS = "ads_proj_canais_excluidos";

type Linha = {
  tipo: "ads" | "ml" | "lives"; canal: string; invAtual: number; totFatAtual: number; proj: Projecao;
  saldo: number | null;                       // saldo do canal (no TikTok, já descontando as Lives)
  recarga: number | null; dura: number | null; // recarga/duração (no TikTok: Shop + Lives juntos)
  parteLives?: number | null;                 // só na linha das Lives: quanto da recarga é delas
  budget?: number | null; sit?: SituacaoBudget | null; budgetSugerido?: number;
  contaSaldo: boolean;                        // o saldo compartilhado entra uma vez só nos totais
};

const R$ = (v: number) => (v < 0 ? "-R$ " : "R$ ") + Math.abs(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM1 = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dataCurta = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
/** Valor em reais digitado à mão: "2.000" é dois mil (e não dois), "2.000,50" e "2000,5" também valem. */
const dinheiroBR = (t: string): number => (/^\d{1,3}(\.\d{3})+$/.test(t.trim()) ? Number(t.trim().replace(/\./g, "")) : numeroBR(t));
const quando = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : `${dataCurta(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function ProjecaoAds({ mes, canais, lives = null, solo = false }: { mes: string; canais: CanalProjecao[]; lives?: LivesProjecao | null; solo?: boolean }) {
  const [saldos, setSaldos] = useState<Record<string, SaldoAds | null>>({});
  const [budgets, setBudgets] = useState<Record<string, number | null>>({});
  const [gastos, setGastos] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [dias, setDias] = useState("");
  const [campoSaldo, setCampoSaldo] = useState<Record<string, string>>({});
  const [campoRecarga, setCampoRecarga] = useState<Record<string, string>>({});
  const [campoBudget, setCampoBudget] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { tipo: "ok" | "erro"; texto: string }>>({});
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const canalTT = canais.find((c) => /tiktok/i.test(c.canal))?.canal || "TikTok Shop";   // o saldo das Lives é o do TikTok
  const gastoLives = lives?.gasto || 0;
  const chaveCanais = canais.map((c) => `${c.canal}|${c.invAtual}`).join(";") + `|${mes}|${gastoLives}`;

  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(CHAVE_EXCLUIDOS) || "[]"); if (Array.isArray(v)) setExcluidos(v.map(String)); } catch { /* sem storage: todos entram */ } }, []);
  const alternarCanal = (nome: string) => setExcluidos((atual) => {
    const novo = atual.includes(nome) ? atual.filter((x) => x !== nome) : [...atual, nome];
    try { localStorage.setItem(CHAVE_EXCLUIDOS, JSON.stringify(novo)); } catch { /* ok */ }
    return novo;
  });
  const definirExcluidos = (novo: string[]) => { setExcluidos(novo); try { localStorage.setItem(CHAVE_EXCLUIDOS, JSON.stringify(novo)); } catch { /* ok */ } };

  useEffect(() => {
    let ativo = true;
    (async () => {
      const comSaldo = Array.from(new Set([...canais.filter((c) => !ehMercadoLivre(c.canal)).map((c) => c.canal), canalTT]));
      const [g, lista, listaB] = await Promise.all([
        gastoTotalPorCanal(supabase),
        Promise.all(comSaldo.map(async (c) => [c, await carregarSaldoAds(supabase, c)] as const)),
        Promise.all(canais.filter((c) => ehMercadoLivre(c.canal)).map(async (c) => [c.canal, (await carregarBudgetCanal(supabase, c.canal, mes))?.valor ?? null] as const)),
      ]);
      if (!ativo) return;
      const mapa: Record<string, SaldoAds | null> = Object.fromEntries(lista);
      // saldo anterior às Lives: passa a descontar só o que as Lives gastarem a partir de agora
      const antigo = mapa[canalTT];
      if (antigo && antigo.gastoRefLives === undefined && lives) mapa[canalTT] = await fixarReferenciaLives(supabase, canalTT, antigo, gastoLives);
      setGastos(g); setSaldos(mapa); setBudgets(Object.fromEntries(listaB)); setCarregando(false);
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveCanais]);

  const hoje = useMemo(() => new Date(), []);
  const diasNum = dias.trim() === "" ? null : Math.round(numeroBR(dias));
  const gastoTotal = (canal: string) => gastos[canal.toLowerCase().trim()] || 0;

  const todas: Linha[] = useMemo(() => {
    const lista: Linha[] = [];
    const saldoTT = saldoAtualAds(saldos[canalTT] || null, gastoTotal(canalTT), gastoLives);
    const projLives = lives ? projetarMes({ gasto: gastoLives, faturamento: lives.faturamento, mes, hoje, diasOverride: diasNum, saldo: null }) : null;
    const cTT = canais.find((c) => c.canal === canalTT);
    const projShop = cTT ? projetarMes({ gasto: cTT.invAtual, faturamento: cTT.totFatAtual, mes, hoje, diasOverride: diasNum, saldo: saldoTT }) : null;
    const shopNaLista = !!cTT;
    const shopSelecionado = shopNaLista && !excluidos.includes(canalTT);
    for (const c of canais) {
      if (ehMercadoLivre(c.canal)) {
        const proj = projetarMes({ gasto: c.invAtual, faturamento: c.totFatAtual, mes, hoje, diasOverride: diasNum, saldo: null });
        const b = budgets[c.canal] ?? null;
        lista.push({ tipo: "ml", canal: c.canal, invAtual: c.invAtual, totFatAtual: c.totFatAtual, proj, saldo: null, recarga: null, dura: null, budget: b, sit: b !== null ? situacaoBudget({ budget: b, gasto: c.invAtual, proj }) : null, budgetSugerido: c.budgetSugerido, contaSaldo: false });
        continue;
      }
      const ehTT = c.canal === canalTT && !!lives;
      const saldo = c.canal === canalTT ? saldoTT : saldoAtualAds(saldos[c.canal] || null, gastoTotal(c.canal));
      const proj = projetarMes({ gasto: c.invAtual, faturamento: c.totFatAtual, mes, hoje, diasOverride: diasNum, saldo });
      if (ehTT && projLives) {
        const comp = projetarCompartilhado([proj, projLives], saldo);
        lista.push({ tipo: "ads", canal: c.canal, invAtual: c.invAtual, totFatAtual: c.totFatAtual, proj, saldo, recarga: comp.recargaSugerida, dura: comp.saldoSuficienteAte, contaSaldo: true });
      } else lista.push({ tipo: "ads", canal: c.canal, invAtual: c.invAtual, totFatAtual: c.totFatAtual, proj, saldo, recarga: proj.recargaSugerida, dura: proj.saldoSuficienteAte, contaSaldo: true });
    }
    if (lives && projLives) {
      const comp = projetarCompartilhado(projShop ? [projShop, projLives] : [projLives], saldoTT);
      const parte = comp.recargaSugerida !== null && comp.falta > 0 ? comp.recargaSugerida * (projLives.faltaGastar / comp.falta) : comp.recargaSugerida === null ? null : 0;
      lista.push({ tipo: "lives", canal: NOME_LIVES, invAtual: gastoLives, totFatAtual: lives.faturamento, proj: projLives, saldo: saldoTT, recarga: comp.recargaSugerida, dura: comp.saldoSuficienteAte, parteLives: parte, contaSaldo: !shopSelecionado });
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canais, lives, saldos, budgets, gastos, mes, diasNum, hoje, excluidos, canalTT]);

  const linhas = todas.filter((l) => !excluidos.includes(l.canal));
  const mls = linhas.filter((l) => l.tipo === "ml");
  const tot = linhas.reduce((t, l) => ({
    gasto: t.gasto + l.invAtual, previsto: t.previsto + l.proj.adsProjetadoMes,
    recarga: t.recarga + (l.contaSaldo ? l.recarga || 0 : 0), saldo: t.saldo + (l.contaSaldo ? l.saldo || 0 : 0), semSaldo: t.semSaldo + (l.contaSaldo && l.tipo !== "ml" && l.saldo === null ? 1 : 0),
  }), { gasto: 0, previsto: 0, recarga: 0, saldo: 0, semSaldo: 0 });
  const totML = mls.reduce((t, l) => ({ budget: t.budget + (l.budget || 0), ultrapassou: t.ultrapassou + (l.sit?.ultrapassou || 0), vaiPassar: t.vaiPassar + (l.sit?.previstoUltrapassa || 0), sem: t.sem + (l.budget === null ? 1 : 0) }), { budget: 0, ultrapassou: 0, vaiPassar: 0, sem: 0 });

  const falha = (canal: string, texto: string) => setMsg((m) => ({ ...m, [canal]: { tipo: "erro", texto } }));
  const sucesso = (canal: string, texto: string) => setMsg((m) => ({ ...m, [canal]: { tipo: "ok", texto } }));
  const salvarSaldo = async (canal: string) => {
    const t = (campoSaldo[canal] ?? "").trim();
    if (t === "") { falha(canal, "Digite o saldo atual do Adsense."); return; }
    const { saldo, erro } = await definirSaldoAds(supabase, canal, dinheiroBR(t), gastoTotal(canal), saldos[canal] || null, canal === canalTT ? gastoLives : undefined);
    if (!erro) { setSaldos((s) => ({ ...s, [canal]: saldo })); setCampoSaldo((c) => ({ ...c, [canal]: "" })); }
    erro ? falha(canal, erro) : sucesso(canal, `Saldo definido em ${R$(dinheiroBR(t))}. Cada planilha nova de Ads${canal === canalTT && lives ? " e de Lives" : ""} vai descontando daqui.`);
  };
  const recarregar = async (canal: string) => {
    const v = dinheiroBR((campoRecarga[canal] ?? "").trim());
    if (!(v > 0)) { falha(canal, "Digite o valor da recarga."); return; }
    const { saldo, erro } = await registrarRecargaAds(supabase, canal, v, gastoTotal(canal), saldos[canal] || null, canal === canalTT ? gastoLives : undefined);
    if (!erro) { setSaldos((s) => ({ ...s, [canal]: saldo })); setCampoRecarga((c) => ({ ...c, [canal]: "" })); }
    erro ? falha(canal, erro) : sucesso(canal, `Recarga de ${R$(v)} somada ao saldo.`);
  };
  const salvarBudget = async (canal: string, valor?: number) => {
    const v = valor ?? dinheiroBR((campoBudget[canal] ?? "").trim());
    if (!(v >= 0) || (valor === undefined && (campoBudget[canal] ?? "").trim() === "")) { falha(canal, "Digite o budget do mês para este canal."); return; }
    const erro = await salvarBudgetCanal(supabase, canal, mes, v);
    if (!erro) { setBudgets((b) => ({ ...b, [canal]: v })); setCampoBudget((c) => ({ ...c, [canal]: "" })); }
    erro ? falha(canal, erro) : sucesso(canal, `Budget de ${mes} definido em ${R$(v)}.`);
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
  const campo = "w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500";
  const rotuloCampo = "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1";

  const cabecalhoCard = (l: Linha, status: { t: string; c: string }) => (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h4 className="font-black text-white text-sm">{l.canal}{l.tipo === "lives" && <span className="ml-2 text-[10px] font-semibold text-slate-400">usa o saldo do {canalTT}</span>}</h4>
      <span data-proj-status className={`text-[10px] font-black px-2 py-1 rounded-full border ${status.c}`}>{status.t}</span>
    </div>
  );
  const blocoRitmo = (l: Linha) => (
    <>
      {linha(l.tipo === "lives" ? "Faturamento das lives até agora" : "Faturamento até agora", R$(l.totFatAtual))}
      {linha(l.tipo === "lives" ? "Ads das lives gasto até agora" : "Ads gasto até agora", R$(l.invAtual), "data-proj-gasto")}
      {linha("TACOS (ads ÷ faturamento)", l.proj.tacos === null ? "—" : `${NUM1(l.proj.tacos)}%`)}
      {linha(`Ritmo de gasto (${l.proj.diasDecorridos} dia(s))`, `${R$(l.proj.ritmoDia)}/dia`, "data-proj-ritmo")}
      {linha("Faturamento previsto no mês", R$(l.proj.fatProjetadoMes), "data-proj-fat-prev")}
      {linha("Ads previsto no mês", R$(l.proj.adsProjetadoMes), "data-proj-previsto", "text-indigo-300")}
    </>
  );
  const msgCanal = (canal: string) => msg[canal] && <p data-proj-msg={canal} className={`text-[11px] font-bold mt-2 ${msg[canal].tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{msg[canal].texto}</p>;

  return (
    <div className={`${solo ? "" : "mt-8 "}bg-slate-950/50 p-5 rounded-xl border border-slate-800`} data-projecao>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-black text-white">📈 Projeção mensal · {mes}</h3>
          <p className="text-[11px] text-slate-400 mt-1 max-w-3xl">Mantém o ritmo do mês: o que cada canal gastou e faturou por dia até agora segue até o fim do mês. O saldo é o que você informa; cada planilha nova de Ads desconta o gasto novo dele, e a recarga soma. As Lives gastam do mesmo saldo do TikTok. Mercado Livre não tem recarga: o limite é o budget que você informa.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <label htmlFor="proj-dias">Dias considerados</label>
          <input id="proj-dias" data-proj-dias value={dias} onChange={(e) => setDias(e.target.value)} placeholder={`hoje (${hoje.getDate()})`} className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-right text-white outline-none focus:border-purple-500" />
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 mb-5" data-proj-seletor>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Canais na análise</span>
          {todas.map((l) => {
            const on = !excluidos.includes(l.canal);
            return (
              <button key={l.canal} type="button" data-proj-canal-chip={l.canal} aria-pressed={on} onClick={() => alternarCanal(l.canal)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${on ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-500 line-through hover:text-slate-300"}`}>
                {on ? "✓ " : ""}{l.canal}
              </button>
            );
          })}
          <span className="ml-auto flex gap-3">
            <button type="button" data-proj-todos onClick={() => definirExcluidos([])} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase cursor-pointer">Todos</button>
            <button type="button" data-proj-nenhum onClick={() => definirExcluidos(todas.map((l) => l.canal))} className="text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase cursor-pointer">Nenhum</button>
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5">Os totais e os quadros abaixo consideram só os canais marcados.</p>
      </div>

      {carregando ? <p className="text-sm text-slate-400 p-4">Calculando…</p> : linhas.length === 0 ? (
        <p className="text-sm text-slate-400 p-6 text-center" data-proj-vazio>Nenhum canal marcado. Marque ao menos um acima para ver a projeção.</p>
      ) : (
        <>
          <div className={`grid grid-cols-2 ${mls.length > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-3 mb-5`} data-proj-resumo>
            {card("Ads gasto até agora", R$(tot.gasto), "canais marcados, neste mês", "text-white", "data-proj-total-gasto")}
            {card("Saldo atual", R$(tot.saldo), tot.semSaldo > 0 ? `${tot.semSaldo} canal(is) sem saldo informado` : "soma dos canais com recarga", "text-emerald-300", "data-proj-total-saldo")}
            {card("Ads previsto no mês", R$(tot.previsto), "no ritmo de agora", "text-indigo-300", "data-proj-total-previsto")}
            {card("Recarga sugerida", R$(tot.recarga), "para chegar ao fim do mês no mesmo ritmo", tot.recarga > 0 ? "text-amber-300" : "text-emerald-300", "data-proj-total-recarga")}
            {mls.length > 0 && card("Mercado Livre acima do budget", R$(totML.ultrapassou), totML.sem > 0 ? `${totML.sem} canal(is) sem budget informado` : totML.vaiPassar > 0 ? `+ ${R$(totML.vaiPassar)} previstos até o fim do mês` : "dentro do budget no ritmo atual", totML.ultrapassou > 0 ? "text-rose-300" : "text-emerald-300", "data-proj-total-ml-excesso")}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {linhas.map((l) => {
              if (l.tipo === "ml") {
                const sit = l.sit;
                const status = l.budget === null || !sit ? { t: "Informe o budget", c: "text-slate-300 bg-slate-800 border-slate-700" }
                  : sit.ultrapassou > 0 ? { t: "Ultrapassou o budget", c: "text-rose-300 bg-rose-950/40 border-rose-900/60" }
                  : sit.previstoUltrapassa > 0 && !l.proj.encerrado ? { t: "Vai ultrapassar", c: "text-amber-300 bg-amber-950/30 border-amber-900/50" }
                  : { t: "Dentro do budget", c: "text-emerald-300 bg-emerald-950/30 border-emerald-900/50" };
                return (
                  <div key={l.canal} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5" data-proj-canal={l.canal} data-proj-tipo="ml">
                    {cabecalhoCard(l, status)}
                    {linha("Budget do mês (valor para usar no canal)", l.budget == null ? "não informado" : R$(l.budget), "data-proj-budget", l.budget == null ? "text-slate-500" : "text-emerald-300")}
                    {linha("Faturamento até agora", R$(l.totFatAtual))}
                    {linha("Ads gasto até agora", R$(l.invAtual), "data-proj-gasto")}
                    {linha("Budget usado", sit?.usadoPct == null ? "—" : `${NUM1(sit.usadoPct)}%`, "data-proj-usado")}
                    {linha(sit && sit.ultrapassou > 0 ? "Ultrapassou em" : "Ainda cabe no budget", !sit ? "—" : sit.ultrapassou > 0 ? R$(sit.ultrapassou) : R$(sit.restante), "data-proj-ultrapassou", sit && sit.ultrapassou > 0 ? "text-rose-400" : "text-emerald-300")}
                    {linha("TACOS (ads ÷ faturamento)", l.proj.tacos === null ? "—" : `${NUM1(l.proj.tacos)}%`)}
                    {linha(`Ritmo de gasto (${l.proj.diasDecorridos} dia(s))`, `${R$(l.proj.ritmoDia)}/dia`, "data-proj-ritmo")}
                    {linha("Faturamento previsto no mês", R$(l.proj.fatProjetadoMes), "data-proj-fat-prev")}
                    {linha("Ads previsto no mês (manter o crescimento)", R$(l.proj.adsProjetadoMes), "data-proj-previsto", "text-indigo-300")}
                    {linha("Previsto acima do budget", !sit ? "—" : R$(sit.previstoUltrapassa), "data-proj-prev-acima", sit && sit.previstoUltrapassa > 0 ? "text-amber-300" : "text-slate-200")}
                    {linha(l.proj.encerrado ? "Falta gastar" : `Dá para gastar por dia (${l.proj.diasRestantes} dia(s))`, !sit ? "—" : l.proj.encerrado ? R$(l.proj.faltaGastar) : sit.cabePorDia === null ? "—" : `${R$(sit.cabePorDia)}/dia`, "data-proj-cabe-dia")}
                    <div className="mt-4">
                      <label className={rotuloCampo}>Budget do mês</label>
                      <div className="flex flex-wrap gap-2">
                        <input data-proj-campo-budget={l.canal} value={campoBudget[l.canal] ?? ""} onChange={(e) => setCampoBudget((c) => ({ ...c, [l.canal]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") salvarBudget(l.canal); }} placeholder="Ex.: 8.000,00" className={campo + " flex-1 min-w-[140px]"} />
                        <button type="button" data-proj-salvar-budget={l.canal} onClick={() => salvarBudget(l.canal)} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-3 rounded-lg text-xs cursor-pointer whitespace-nowrap">Salvar budget</button>
                        {l.budgetSugerido !== undefined && l.budgetSugerido > 0 && (
                          <button type="button" data-proj-usar-sugerido={l.canal} onClick={() => salvarBudget(l.canal, Math.round((l.budgetSugerido || 0) * 100) / 100)} className="text-[11px] font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer whitespace-nowrap" title="Faturamento do mês anterior × meta de TACOS (aba Disponibilizado x Usado)">Usar o sugerido ({R$(l.budgetSugerido)})</button>
                        )}
                      </div>
                    </div>
                    {msgCanal(l.canal)}
                  </div>
                );
              }

              const sa = saldos[l.canal] || null;
              const acabaEm = l.saldo !== null && l.dura !== null && !l.proj.encerrado ? new Date(hoje.getTime() + l.dura * 86400000) : null;
              const status = l.saldo === null ? { t: "Informe o saldo", c: "text-slate-300 bg-slate-800 border-slate-700" }
                : l.proj.encerrado ? { t: "Mês encerrado", c: "text-slate-300 bg-slate-800 border-slate-700" }
                : l.saldo <= 0 ? { t: "Saldo esgotado", c: "text-rose-300 bg-rose-950/40 border-rose-900/60" }
                : (l.recarga || 0) > 0 ? { t: "Recarregar", c: "text-amber-300 bg-amber-950/30 border-amber-900/50" }
                : { t: "Saldo suficiente", c: "text-emerald-300 bg-emerald-950/30 border-emerald-900/50" };
              const compartilhado = !!lives && (l.tipo === "lives" || l.canal === canalTT);
              return (
                <div key={l.canal} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5" data-proj-canal={l.canal} data-proj-tipo={l.tipo}>
                  {cabecalhoCard(l, status)}
                  {blocoRitmo(l)}
                  {linha(l.proj.encerrado ? "Falta gastar" : `Falta gastar (${l.proj.diasRestantes} dia(s))`, R$(l.proj.faltaGastar), "data-proj-falta")}
                  {linha(compartilhado ? `Saldo atual (${canalTT} + Lives)` : "Saldo atual", l.saldo === null ? "não informado" : R$(l.saldo), "data-proj-saldo", l.saldo === null ? "text-slate-500" : l.saldo <= 0 ? "text-rose-400" : "text-emerald-300")}
                  {linha(compartilhado ? "Saldo dura (os dois juntos)" : "Saldo dura", l.saldo === null ? "—" : l.dura === null ? "sem gasto no mês" : l.saldo <= 0 ? "acabou" : `${NUM1(l.dura)} dia(s)${acabaEm && !l.proj.encerrado && l.dura < l.proj.diasRestantes ? ` · até ${dataCurta(acabaEm)}` : ""}`, "data-proj-dura")}
                  {linha(compartilhado ? "Recarga sugerida (TikTok Shop + Lives)" : "Recarga sugerida", l.recarga === null ? "informe o saldo" : R$(l.recarga), "data-proj-recarga", l.recarga ? "text-amber-300" : "text-slate-200")}
                  {l.tipo === "lives" && linha("Parte das Lives nesta recarga", l.parteLives == null ? "—" : R$(l.parteLives), "data-proj-parte-lives", l.parteLives ? "text-amber-300" : "text-slate-200")}

                  {l.tipo === "ads" ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        <div>
                          <label className={rotuloCampo}>Saldo atual do Adsense</label>
                          <div className="flex gap-2">
                            <input data-proj-campo-saldo={l.canal} value={campoSaldo[l.canal] ?? ""} onChange={(e) => setCampoSaldo((c) => ({ ...c, [l.canal]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") salvarSaldo(l.canal); }} placeholder="Ex.: 5.000,00" className={campo} />
                            <button type="button" data-proj-salvar-saldo={l.canal} onClick={() => salvarSaldo(l.canal)} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-3 rounded-lg text-xs cursor-pointer whitespace-nowrap">Salvar saldo</button>
                          </div>
                        </div>
                        <div>
                          <label className={rotuloCampo}>Valor da recarga</label>
                          <div className="flex gap-2">
                            <input data-proj-campo-recarga={l.canal} value={campoRecarga[l.canal] ?? ""} onChange={(e) => setCampoRecarga((c) => ({ ...c, [l.canal]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") recarregar(l.canal); }} placeholder="Ex.: 2.000,00" className={campo} />
                            <button type="button" data-proj-recarga-btn={l.canal} onClick={() => recarregar(l.canal)} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 rounded-lg text-xs cursor-pointer">Recarga</button>
                          </div>
                        </div>
                      </div>
                      {msgCanal(l.canal)}
                      {sa && sa.historico.length > 0 && (
                        <details className="mt-3 text-[11px] text-slate-400">
                          <summary className="cursor-pointer font-bold text-slate-300">Histórico do saldo</summary>
                          <ul className="mt-2 space-y-1" data-proj-historico={l.canal}>
                            {sa.historico.slice(0, 10).map((e, i) => <li key={i}>{quando(e.em)} · {e.tipo === "recarga" ? "Recarga" : "Saldo definido"} {R$(e.valor)}</li>)}
                          </ul>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-500 mt-3" data-proj-lives-nota>O saldo e as recargas das Lives são os do {canalTT}: informe o saldo e lance as recargas lá. O custo das lives vem da planilha de Adsense enviada na aba Lives.</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-4" data-proj-legenda>Ads previsto = gasto até agora ÷ dias considerados × dias do mês. Recarga sugerida = o que ainda falta gastar no mês − saldo atual (zero se o saldo já cobre); no TikTok soma o que falta no Shop e nas Lives, que usam o mesmo saldo. Saldo atual = saldo informado + recargas − o que as planilhas novas gastaram depois dele. Mercado Livre: ultrapassou = gasto − budget do mês; previsto acima do budget = gasto projetado no ritmo atual − budget.</p>
        </>
      )}
    </div>
  );
}
