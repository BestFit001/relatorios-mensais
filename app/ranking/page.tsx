"use client";
// Ranking de analistas: progressão, cadastros, liquidez, ticket médio, mais vendidos por canal e ads, por mês fechado, últimos 7/15/30 dias ou período personalizado, com comparação.
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import { calcularResumoCanais, TABELAS_RESUMO, type ResumoCanal } from "../../lib/resumoCanais";
import {
  METRICAS, MENOR_E_MELHOR, agruparPorAnalista, chaveCanal, classificar, contarNoPeriodo, datasDeCadastro, formatar, mesesTerminandoEm, totalizar, valorDa, variacao,
  type AnalistaRanking, type Formato, type MetricaId,
} from "../../lib/ranking";
import {
  OPCOES_PERIODO, descreverPeriodo, hojeSP, janelasDeEvolucao, resolverComparacao, resolverPeriodo, unidadeEvolucao,
  type PeriodoResolvido, type PeriodoSel, type TipoPeriodo,
} from "../../lib/periodoRanking";

async function buscarTudo(tabela: string): Promise<any[]> {
  const todas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from(tabela).select("*").range(de, de + 999);
    if (error || !data) break;
    todas.push(...data);
    if (data.length < 1000) break;
  }
  return todas;
}

const mesAtual = () => hojeSP().slice(0, 7);
const CORES = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];
const MEDALHAS = ["🥇", "🥈", "🥉"];

function Delta({ atual, anterior, metrica }: { atual: number; anterior: number | null | undefined; metrica: MetricaId }) {
  const m = METRICAS.find((x) => x.id === metrica)!;
  const v = variacao(atual, anterior, m.formato);
  if (!v) return null;
  if (v.subiu === null) return <span className="block text-[10px] text-slate-500">= igual</span>;
  const bom = MENOR_E_MELHOR.includes(metrica) ? !v.subiu : v.subiu;
  const sinal = v.subiu ? "+" : "−";
  const texto = v.pct !== null ? `${sinal}${Math.abs(v.pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
    : m.formato === "pct" ? `${sinal}${Math.abs(v.delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`
    : `${sinal}${formatar(Math.abs(v.delta), m.formato)}`;   // mês de comparação estava zerado: mostra a diferença em valor
  return <span data-delta className={`block text-[10px] font-bold ${bom ? "text-emerald-400" : "text-rose-400"}`}>{v.subiu ? "▲" : "▼"} {texto}</span>;
}

type LinhaGrafico = { id: string; rotulo: string; cor: string; email?: string | null; valores: number[] };
/** Um ponto do eixo: um mês ou uma janela de dias. */
type Ponto = { chave: string; rotulo: string; curto: string };

/** Gráfico de linhas (um ponto por mês ou por janela de dias). */
function GraficoLinhas({ pontos, linhas, formato, destaque, titulo }: { pontos: Ponto[]; linhas: LinhaGrafico[]; formato: Formato; destaque: string; titulo: string }) {
  const valores = linhas.flatMap((l) => l.valores);
  const max = Math.max(...valores, 1), min = Math.min(0, ...valores);
  const W = 720, H = 250, PL = 70, PR = 16, PT = 14, PB = 30;
  const x = (i: number) => PL + (i * (W - PL - PR)) / Math.max(1, pontos.length - 1);
  const y = (v: number) => PT + (1 - (v - min) / (max - min || 1)) * (H - PT - PB);
  return (
    <div data-evolucao>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={titulo}>
        {[0, 1, 2, 3].map((i) => { const v = min + ((max - min) * i) / 3; return (
          <g key={i}><line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="#1e293b" strokeWidth="1" /><text x={PL - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#64748b">{formatar(v, formato)}</text></g>
        ); })}
        {pontos.map((p, i) => <text key={p.chave} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={p.chave === destaque ? "#e2e8f0" : "#64748b"}>{p.curto}</text>)}
        {linhas.map((l) => {
          const pts = l.valores.map((v, i) => [x(i), y(v)] as const);
          return (
            <g key={l.id} data-linha={l.id}>
              <polyline points={pts.map(([a, b]) => `${a},${b}`).join(" ")} fill="none" stroke={l.cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([a, b], i) => <circle key={i} cx={a} cy={b} r="3.5" fill="#0f172a" stroke={l.cor} strokeWidth="2"><title>{`${l.rotulo} · ${pontos[i].rotulo}: ${formatar(l.valores[i], formato)}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2">
        {linhas.map((l) => <span key={l.id} className="flex items-center gap-1.5 text-[11px] text-slate-300"><span className="w-3 h-1.5 rounded" style={{ background: l.cor }} />{l.email ? <Avatar email={l.email} tamanho={18} /> : null}{l.rotulo}</span>)}
      </div>
    </div>
  );
}

/** Mini gráfico de um canal (cabe dentro do cartão). */
function Sparkline({ pontos, valores, formato, cor }: { pontos: Ponto[]; valores: number[]; formato: Formato; cor: string }) {
  const max = Math.max(...valores, 1), min = Math.min(0, ...valores);
  const W = 220, H = 56, P = 6;
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, valores.length - 1);
  const y = (v: number) => P + (1 - (v - min) / (max - min || 1)) * (H - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" data-sparkline>
      <polyline points={valores.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {valores.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === valores.length - 1 ? 3.5 : 2.2} fill={i === valores.length - 1 ? cor : "#0f172a"} stroke={cor} strokeWidth="1.5"><title>{`${pontos[i].rotulo}: ${formatar(v, formato)}`}</title></circle>)}
    </svg>
  );
}

/** Barras horizontais: uma por canal escolhido, para uma métrica. */
function Barras({ titulo, itens, formato }: { titulo: string; itens: { id: string; rotulo: string; cor: string; valor: number }[]; formato: Formato }) {
  const max = Math.max(...itens.map((i) => Math.abs(i.valor)), 1e-9);
  return (
    <div data-barras={titulo}>
      <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">{titulo}</p>
      <div className="space-y-2">
        {itens.map((i) => (
          <div key={i.id}>
            <div className="flex justify-between text-[11px] text-slate-300"><span className="truncate pr-2">{i.rotulo}</span><span className="font-bold text-slate-100">{formatar(i.valor, formato)}</span></div>
            <div className="h-2 rounded bg-slate-800"><div className="h-2 rounded" style={{ width: `${Math.max(2, (Math.abs(i.valor) / max) * 100)}%`, background: i.cor }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Escolha do período: mês fechado, últimos 7/15/30 dias ou datas livres (na comparação, também "período anterior equivalente"). */
function SeletorPeriodo({ rotulo, valor, onChange, prefixo, opcoesMes, comAnterior, resolvido }: {
  rotulo: string; valor: PeriodoSel; onChange: (v: PeriodoSel) => void; prefixo: "a" | "b"; opcoesMes: string[]; comAnterior?: boolean; resolvido: PeriodoResolvido;
}) {
  const campo = "bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer block normal-case";
  const mudar = (p: Partial<PeriodoSel>) => onChange({ ...valor, ...p });
  const hoje = hojeSP();
  return (
    <div className="flex flex-wrap items-end gap-3" data-periodo={prefixo}>
      <label className="text-[10px] font-bold uppercase text-slate-500 space-y-1 block">{rotulo}
        <select value={valor.tipo} onChange={(e) => {
          const tipo = e.target.value as TipoPeriodo;
          // ao abrir "personalizado", já começa preenchido com o período que estava na tela
          mudar(tipo === "custom" ? { tipo, inicio: valor.inicio || resolvido.inicio, fim: valor.fim || resolvido.fim } : { tipo });
        }} data-tipo-periodo={prefixo} className={campo}>
          {comAnterior && <option value="anterior">Período anterior equivalente</option>}
          {OPCOES_PERIODO.map((o) => <option key={o.tipo} value={o.tipo}>{o.rotulo}</option>)}
        </select>
      </label>
      {valor.tipo === "mes" && (
        <label className="text-[10px] font-bold uppercase text-slate-500 space-y-1 block">Mês
          <select value={valor.mes} onChange={(e) => mudar({ mes: e.target.value })} data-mes={prefixo} {...(prefixo === "a" ? { "data-mes-a": true } : { "data-mes-b": true })} className={campo}>
            {opcoesMes.map((m) => <option key={m} value={m}>{rotuloMesDoPeriodo(m)}</option>)}
          </select>
        </label>
      )}
      {valor.tipo === "custom" && (
        <>
          <label className="text-[10px] font-bold uppercase text-slate-500 space-y-1 block">De
            <input type="date" value={valor.inicio} max={hoje} onChange={(e) => mudar({ inicio: e.target.value })} data-data-inicio={prefixo} className={campo} />
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500 space-y-1 block">Até
            <input type="date" value={valor.fim} max={hoje} onChange={(e) => mudar({ fim: e.target.value })} data-data-fim={prefixo} className={campo} />
          </label>
        </>
      )}
      <span className="text-[11px] text-slate-400 pb-2" data-periodo-texto={prefixo}>{descreverPeriodo(resolvido)}</span>
    </div>
  );
}
const rotuloMesDoPeriodo = (m: string) => resolverPeriodo({ tipo: "mes", mes: m, inicio: "", fim: "" }).rotulo;

export default function RankingPage() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [db, setDb] = useState<Record<string, any[]>>({});
  const [mapeamentos, setMapeamentos] = useState<{ email: string; canal: string }[]>([]);
  const [cadCanal, setCadCanal] = useState<Map<string, number>>(new Map());
  const [catalogo, setCatalogo] = useState(0);
  const [datasNovos, setDatasNovos] = useState<string[]>([]);
  const [selA, setSelA] = useState<PeriodoSel>(() => ({ tipo: "mes", mes: mesAtual(), inicio: "", fim: "" }));
  const [comparar, setComparar] = useState(false);
  const [selB, setSelB] = useState<PeriodoSel>(() => ({ tipo: "anterior", mes: mesesTerminandoEm(mesAtual(), 2)[0], inicio: "", fim: "" }));
  const [metrica, setMetrica] = useState<MetricaId>("faturado");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [serie, setSerie] = useState<{ chave: string; rotulo: string; curto: string; canais: ResumoCanal[] }[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);                 // canais escolhidos para comparar: "<e-mail>|<canal>"
  const [metSel, setMetSel] = useState<MetricaId>("faturado");   // métrica do gráfico de evolução dos canais escolhidos
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    setPronto(true);
    (async () => {
      try {
        const [tabelas, map] = await Promise.all([
          Promise.all(TABELAS_RESUMO.map(async (t) => [t, await buscarTudo(t)] as const)),
          supabase.from("home_responsaveis_canais").select("*"),
        ]);
        const r: Record<string, any[]> = {}; tabelas.forEach(([t, l]) => { r[t] = l; });
        setDb(r);
        setMapeamentos(((map.data as any[]) || []).map((m) => ({ email: String(m.email || "").trim().toLowerCase(), canal: String(m.canal || "") })));
        // cadastros: SKUs marcados como cadastrados em cada canal (posição de hoje) e o tamanho do catálogo
        const canais = Array.from(new Set((r.config_regras_canais || []).map((c: any) => String(c.canal || "").trim()).filter(Boolean)));
        const [contagens, cat, novos] = await Promise.all([
          Promise.all(canais.map(async (c) => {
            const { count } = await supabase.from("mapeamento_canais_skus").select("sku", { count: "exact", head: true }).eq("canal", c).eq("presente", true);
            return [c, count || 0] as const;
          })),
          supabase.from("cadastros_base_tiny").select("sku", { count: "exact", head: true }),
          buscarTudo("produtos_novos_cadastrados"),
        ]);
        const m = new Map<string, number>();
        contagens.forEach(([c, n]) => m.set(chaveCanal(c), (m.get(chaveCanal(c)) || 0) + n));
        setCadCanal(m); setCatalogo(cat.count || 0); setDatasNovos(datasDeCadastro(novos));
      } catch (e: any) { setErro(e?.message || String(e)); }
      setCarregando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("ranking_canais_sel") || "[]"); if (Array.isArray(v)) setSel(v.filter((x) => typeof x === "string").slice(0, 8)); } catch { /* sem preferência */ } }, []);
  const guardarSel = (l: string[]) => { setSel(l); try { localStorage.setItem("ranking_canais_sel", JSON.stringify(l)); } catch { /* ignora */ } };

  const cadastrosDe = (canal: string) => cadCanal.get(chaveCanal(canal)) || 0;
  const calcular = (p: PeriodoResolvido): ResumoCanal[] => { try { return db.vendas_canais ? calcularResumoCanais(db, p.mesIso, new Date(), p.datas) : []; } catch (e) { console.error(e); return []; } };

  // períodos escolhidos (A e, se ligado, B). A chave muda só quando as datas mudam, para não recalcular à toa
  const hoje = hojeSP();
  const pA = useMemo(() => resolverPeriodo(selA, hoje), [selA, hoje]);
  const pB = useMemo(() => resolverComparacao(selB, pA, hoje), [selB, pA, hoje]);
  const resumoA = useMemo(() => calcular(pA), [db, pA.chave]);                                  // eslint-disable-line react-hooks/exhaustive-deps
  const resumoB = useMemo(() => (comparar ? calcular(pB) : []), [db, pB.chave, comparar]);       // eslint-disable-line react-hooks/exhaustive-deps
  const listaA = useMemo(() => agruparPorAnalista(resumoA, mapeamentos, cadastrosDe), [resumoA, mapeamentos, cadCanal]);  // eslint-disable-line react-hooks/exhaustive-deps
  const listaB = useMemo(() => agruparPorAnalista(resumoB, mapeamentos, cadastrosDe), [resumoB, mapeamentos, cadCanal]);  // eslint-disable-line react-hooks/exhaustive-deps
  const ranking = useMemo(() => classificar(listaA, metrica), [listaA, metrica]);
  const semAnalista = listaA.find((a) => !a.email) || null;
  const totalEmpresa = useMemo(() => totalizar(resumoA, cadastrosDe), [resumoA, cadCanal]);          // eslint-disable-line react-hooks/exhaustive-deps
  const totalEmpresaB = useMemo(() => (comparar ? totalizar(resumoB, cadastrosDe) : null), [resumoB, comparar, cadCanal]);  // eslint-disable-line react-hooks/exhaustive-deps
  const deB = (email: string | null) => (comparar ? listaB.find((a) => a.email === email)?.total ?? null : null);
  const canalB = (canal: string) => (comparar ? resumoB.find((c) => chaveCanal(c.canal) === chaveCanal(canal)) || null : null);

  // evolução: 6 meses (ou 6 períodos do mesmo tamanho) terminando no período escolhido, calculada depois da tela principal para não travar
  useEffect(() => {
    if (!db.vendas_canais) return;
    setSerie(null);
    const t = setTimeout(() => {
      setSerie(janelasDeEvolucao(pA, 6).map((p) => ({ chave: p.chave, rotulo: p.rotulo, curto: p.curto, canais: p.chave === pA.chave ? resumoA : calcular(p) })));
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, pA.chave]);

  const opcoesMes = useMemo(() => mesesTerminandoEm(mesAtual(), 18).reverse(), []);
  const metricaInfo = METRICAS.find((m) => m.id === metrica)!;
  const melhorValor = ranking.length ? Math.max(...ranking.map((a) => Math.abs(valorDa(a.total, metrica)))) || 1 : 1;
  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  if (!pronto) return null;
  const fmt = (v: number, id: MetricaId) => formatar(v, METRICAS.find((m) => m.id === id)!.formato);
  const colunas: MetricaId[] = ["faturado", "lucro", "margemBruta", "liquidez", "ticket", "pedidos", "ads", "roas", "progressoMeta", "cadastros"];
  const seletor = "bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer";

  // ---- evolução dos analistas e dos canais (6 meses)
  const pontosSerie: Ponto[] = serie ? serie.map(({ chave, rotulo, curto }) => ({ chave, rotulo, curto })) : [];
  const unidade = unidadeEvolucao(pA);
  const totaisDoMes = (p: { canais: ResumoCanal[] }, email: string) => agruparPorAnalista(p.canais, mapeamentos, cadastrosDe).find((a) => a.email === email)?.total;
  const valorCanalNoMes = (p: { canais: ResumoCanal[] }, canal: string, m: MetricaId) => { const c = p.canais.find((x) => chaveCanal(x.canal) === chaveCanal(canal)); return c ? valorDa(totalizar([c], cadastrosDe), m) : 0; };
  const grafico = () => {
    if (!serie) return <p className="text-xs text-slate-500 py-10 text-center">Calculando a evolução…</p>;
    const linhas: LinhaGrafico[] = ranking.map((a, k) => ({ id: a.email!, rotulo: a.nome, email: a.email, cor: CORES[k % CORES.length], valores: serie.map((p) => { const t = totaisDoMes(p, a.email!); return t ? valorDa(t, metrica) : 0; }) }));
    return <GraficoLinhas pontos={pontosSerie} linhas={linhas} formato={metricaInfo.formato} destaque={pA.chave} titulo={`Evolução de ${metricaInfo.rotulo} por analista`} />;
  };

  // ---- canais escolhidos para comparar
  const chaveSel = (email: string | null, canal: string) => `${email || "sem"}|${chaveCanal(canal)}`;
  const opcoesCanais = [...ranking, ...(semAnalista ? [semAnalista] : [])].flatMap((a) => a.canais.map((c) => ({ chave: chaveSel(a.email, c.canal), email: a.email, nome: a.nome, canal: c.canal, resumo: c })));
  const escolhidos = sel.map((k, i) => { const o = opcoesCanais.find((x) => x.chave === k); return o ? { ...o, cor: CORES[i % CORES.length] } : null; }).filter(Boolean) as (typeof opcoesCanais[number] & { cor: string })[];
  const alternarCanal = (chave: string) => guardarSel(sel.includes(chave) ? sel.filter((k) => k !== chave) : sel.length >= 8 ? sel : [...sel, chave]);
  const colsComparacao: MetricaId[] = ["faturado", "margemBruta", "liquidez", "lucro", "ticket", "pedidos", "ads", "roas", "progressoMeta"];
  const linhasComp = escolhidos.map((o) => ({ o, t: totalizar([o.resumo], cadastrosDe), tb: canalB(o.canal) ? totalizar([canalB(o.canal)!], cadastrosDe) : null }));
  const melhorDaColuna = (m: MetricaId) => {
    if (linhasComp.length < 2) return null;
    const vs = linhasComp.map((l) => valorDa(l.t, m));
    return MENOR_E_MELHOR.includes(m) ? Math.min(...vs) : Math.max(...vs);
  };
  const graficoCanais = () => {
    if (!serie) return <p className="text-xs text-slate-500 py-10 text-center">Calculando a evolução…</p>;
    const mi = METRICAS.find((m) => m.id === metSel)!;
    const linhas: LinhaGrafico[] = escolhidos.map((o) => ({ id: o.chave, rotulo: `${o.canal} · ${o.nome.split(" ")[0]}`, email: o.email, cor: o.cor, valores: serie.map((p) => valorCanalNoMes(p, o.canal, metSel)) }));
    return <GraficoLinhas pontos={pontosSerie} linhas={linhas} formato={mi.formato} destaque={pA.chave} titulo={`Evolução de ${mi.rotulo} dos canais escolhidos`} />;
  };

  const blocoCanais = (a: AnalistaRanking, chave: string) => (
    <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4" data-canais-de={chave}>
      {a.canais.map((c) => {
        const cb = canalB(c.canal);
        const t = totalizar([c], cadastrosDe);
        const tb = cb ? totalizar([cb], cadastrosDe) : null;
        return (
          <div key={c.canal} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4" data-canal-card={c.canal}>
            <div className="flex items-center gap-2 mb-3">
              {c.logoUrl ? <img src={c.logoUrl} alt="" className="w-7 h-7 rounded-lg object-cover bg-white" /> : <span className="w-7 h-7 rounded-lg bg-slate-800 text-[10px] font-black flex items-center justify-center">{c.canal.slice(0, 2).toUpperCase()}</span>}
              <h4 className="text-sm font-black text-white">{c.canal}</h4>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
              {(["faturado", "lucro", "margemBruta", "liquidez", "ticket", "pedidos", "ads", "roas", "progressoMeta", "cadastros"] as MetricaId[]).map((m) => (
                <div key={m} title={METRICAS.find((x) => x.id === m)!.dica}>
                  <p className="text-[9px] font-bold uppercase text-slate-500">{METRICAS.find((x) => x.id === m)!.rotulo}</p>
                  <p className="text-xs font-black text-slate-100">{fmt(valorDa(t, m), m)}</p>
                  {m !== "cadastros" && tb && <Delta atual={valorDa(t, m)} anterior={valorDa(tb, m)} metrica={m} />}
                </div>
              ))}
            </div>
            {metrica !== "cadastros" && (
              <div className="mt-3" data-evolucao-canal={c.canal}>
                <p className="text-[10px] font-bold uppercase text-slate-500">📈 Evolução · {metricaInfo.rotulo} · {unidade}</p>
                {serie ? <Sparkline pontos={pontosSerie} valores={serie.map((p) => valorCanalNoMes(p, c.canal, metrica))} formato={metricaInfo.formato} cor="#818cf8" /> : <p className="text-[11px] text-slate-600 py-3">Calculando…</p>}
              </div>
            )}
            <div className={`mt-4 grid gap-4 ${cb ? "grid-cols-2" : "grid-cols-1"}`}>
              {[{ rotulo: pA.rotulo, lista: c.topProdutos }, ...(cb ? [{ rotulo: pB.rotulo, lista: cb.topProdutos }] : [])].map((col, i) => (
                <div key={i} data-top-produtos>
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">🔥 Mais vendidos · {col.rotulo}</p>
                  {col.lista.length === 0 ? <p className="text-[11px] text-slate-600">Sem vendas no período.</p> : (
                    <ol className="space-y-1">
                      {col.lista.slice(0, 5).map((p, k) => (
                        <li key={p.sku + k} className="flex items-start gap-2 text-[11px]">
                          <span className="w-4 text-slate-500 font-bold">{k + 1}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-slate-200" title={p.produto || p.sku}>{p.produto || p.sku}</span><span className="block text-[10px] text-slate-500 font-mono">{p.sku}</span></span>
                          <span className="text-right shrink-0"><span className="block font-bold text-slate-200">{p.qtd.toLocaleString("pt-BR")} un.</span><span className="block text-[10px] text-slate-500">{formatar(p.faturamento, "moeda")}</span></span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const kpi = (id: MetricaId) => (
    <div key={id} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4" title={METRICAS.find((m) => m.id === id)!.dica}>
      <p className="text-[10px] font-bold uppercase text-slate-500">{METRICAS.find((m) => m.id === id)!.rotulo}</p>
      <p className="text-lg font-black text-white">{fmt(valorDa(totalEmpresa, id), id)}</p>
      {totalEmpresaB && <Delta atual={valorDa(totalEmpresa, id)} anterior={valorDa(totalEmpresaB, id)} metrica={id} />}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">🏆 Ranking de analistas</h1>
            <p className="text-sm text-slate-400">Resultado de cada analista nos seus canais, por mês fechado ou por período. No mês fechado os valores são os mesmos do Dashboard.</p>
          </div>
          <Navbar />
        </div>

        {/* controles */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-end gap-4" data-controles>
          <SeletorPeriodo rotulo="Período" valor={selA} onChange={setSelA} prefixo="a" opcoesMes={opcoesMes} resolvido={pA} />
          <button type="button" onClick={() => setComparar((v) => !v)} data-comparar className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border ${comparar ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:text-white"}`}>⚖️ {comparar ? "Comparando com…" : "Comparar com outro período"}</button>
          {comparar && <SeletorPeriodo rotulo="Comparar com" valor={selB} onChange={setSelB} prefixo="b" opcoesMes={opcoesMes} comAnterior resolvido={pB} />}
          <label className="text-[10px] font-bold uppercase text-slate-500 space-y-1 block">Classificar por
            <select value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaId)} data-metrica className={seletor + " block normal-case"}>{METRICAS.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}</select>
          </label>
          <p className="text-[11px] text-slate-500 flex-1 min-w-[220px]">{metricaInfo.dica}.</p>
        </div>

        {(pA.tipo !== "mes" || (comparar && pB.tipo !== "mes")) && (
          <p className="text-[11px] text-slate-400 -mt-3 px-1" data-aviso-periodo>
            Em períodos que não são mês fechado: vendas, devoluções e frete Flex entram pela data de cada um; Ads e metas (lançados por mês) entram proporcionais aos dias do período; lojas físicas só entram quando o mês inteiro está dentro do período. Os números podem diferir um pouco do Dashboard, que fecha por mês.
          </p>
        )}
        {erro && <p className="text-xs text-rose-400">Erro ao carregar: {erro}</p>}
        {carregando ? <p className="text-sm text-slate-400 p-10 text-center">Carregando os números dos canais…</p> : (
          <>
            {/* visão da empresa */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" data-kpis>
              {(["faturado", "lucro", "liquidez", "ticket", "pedidos", "ads"] as MetricaId[]).map(kpi)}
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4" title="Produtos novos cadastrados na aba Novos Cadastros, pela data do cadastro">
                <p className="text-[10px] font-bold uppercase text-slate-500">Novos produtos cadastrados</p>
                <p className="text-lg font-black text-white" data-novos-cadastros>{contarNoPeriodo(datasNovos, pA.inicio, pA.fim).toLocaleString("pt-BR")}</p>
                {comparar && <Delta atual={contarNoPeriodo(datasNovos, pA.inicio, pA.fim)} anterior={contarNoPeriodo(datasNovos, pB.inicio, pB.fim)} metrica="pedidos" />}
              </div>
            </div>

            {/* pódio */}
            {ranking.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-podio>
                {ranking.slice(0, 3).map((a, i) => (
                  <div key={a.email} className={`rounded-2xl border p-5 flex items-center gap-4 ${i === 0 ? "border-amber-500/50 bg-gradient-to-br from-amber-950/40 to-slate-900" : "border-slate-800 bg-slate-900/80"}`}>
                    <span className="text-4xl">{MEDALHAS[i]}</span>
                    <Avatar email={a.email!} tamanho={52} />
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white truncate">{a.nome}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-500">{metricaInfo.rotulo}</p>
                      <p className="text-lg font-black text-amber-300">{fmt(valorDa(a.total, metrica), metrica)}</p>
                      <Delta atual={valorDa(a.total, metrica)} anterior={deB(a.email) ? valorDa(deB(a.email)!, metrica) : null} metrica={metrica} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* tabela de classificação */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 overflow-x-auto" data-tabela-ranking>
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-1">Classificação · {pA.rotulo}{comparar ? ` × ${pB.rotulo}` : ""}</h2>
              <p className="text-[11px] text-slate-500 mb-4">Clique no título de uma coluna para classificar por ela. Cada analista soma os canais pelos quais é responsável (definido nos cartões do Início).</p>
              {ranking.length === 0 ? (
                <p className="text-xs text-amber-300">Nenhum analista tem canais vinculados ainda. Vincule os canais aos analistas na tela Início.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800">
                      <th className="py-2 pr-2 w-10">#</th><th className="py-2 pr-4">Analista</th>
                      {colunas.map((m) => <th key={m} className="py-2 px-2 text-right"><button type="button" data-ordenar={m} onClick={() => setMetrica(m)} title={METRICAS.find((x) => x.id === m)!.dica} className={`uppercase font-bold cursor-pointer hover:text-white ${metrica === m ? "text-amber-300" : ""}`}>{METRICAS.find((x) => x.id === m)!.rotulo}{metrica === m ? " ↓" : ""}</button></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((a, i) => {
                      const b = deB(a.email);
                      return (
                        <tr key={a.email} data-linha-analista={a.email} className="border-b border-slate-800/60">
                          <td className="py-3 pr-2 font-black text-slate-300">{MEDALHAS[i] || i + 1}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5"><Avatar email={a.email!} tamanho={32} />
                              <div className="min-w-[110px]"><p className="font-black text-white">{a.nome}</p><p className="text-[10px] text-slate-500">{a.canais.length} canal(is)</p>
                                <div className="h-1 rounded bg-slate-800 mt-1"><div className="h-1 rounded bg-indigo-500" style={{ width: `${Math.max(2, (Math.abs(valorDa(a.total, metrica)) / melhorValor) * 100)}%` }} /></div></div>
                            </div>
                          </td>
                          {colunas.map((m) => (
                            <td key={m} className={`py-3 px-2 text-right ${metrica === m ? "bg-amber-950/10" : ""}`}>
                              <span className="font-bold text-slate-100" data-celula={m}>{fmt(valorDa(a.total, m), m)}</span>
                              {m !== "cadastros" && b && <Delta atual={valorDa(a.total, m)} anterior={valorDa(b, m)} metrica={m} />}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <p className="text-[10px] text-slate-500 mt-3">Cadastros = SKUs marcados como cadastrados nos canais do analista, na posição de hoje (o Mapa de Cadastros não guarda histórico, por isso esta coluna não muda de mês para mês). Catálogo atual: {catalogo.toLocaleString("pt-BR")} SKUs.</p>
            </div>

            {/* evolução */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-1">📈 Progressão · {metricaInfo.rotulo}</h2>
              <p className="text-[11px] text-slate-500 mb-3">{unidade.charAt(0).toUpperCase() + unidade.slice(1)} até {pA.rotulo.split(" a ").pop()}. Troque a métrica em “Classificar por”.</p>
              {metrica === "cadastros" ? <p className="text-xs text-slate-500 py-8 text-center">Cadastros não têm histórico. Escolha outra métrica para ver a progressão.</p> : grafico()}
            </div>

            {/* comparar canais */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5" data-comparar-canais>
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-1">🔀 Evolução e comparação de canais</h2>
              <p className="text-[11px] text-slate-500 mb-4">Escolha canais de qualquer analista (até 8) para ver a evolução de cada um e comparar lado a lado, por exemplo a Amazon de uma analista com o TikTok de outro. Com um canal só, você vê a evolução individual dele.</p>
              <div className="space-y-2.5" data-seletor-canais>
                {[...ranking, ...(semAnalista ? [semAnalista] : [])].map((a) => (
                  <div key={a.email || "sem"} className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-2 w-40 shrink-0 text-xs font-bold text-slate-300">{a.email ? <Avatar email={a.email} tamanho={22} /> : <span className="w-[22px] text-center">❔</span>}<span className="truncate">{a.nome}</span></span>
                    {a.canais.map((c) => {
                      const k = chaveSel(a.email, c.canal); const i = sel.indexOf(k); const ativo = i >= 0;
                      return <button key={k} type="button" data-canal-sel={k} onClick={() => alternarCanal(k)} aria-pressed={ativo} style={ativo ? { background: CORES[i % CORES.length], borderColor: CORES[i % CORES.length] } : undefined}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer transition ${ativo ? "text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"}`}>{ativo ? "✓ " : ""}{c.canal}</button>;
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3">
                {sel.length > 0 && <button type="button" onClick={() => guardarSel([])} data-limpar-canais className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer">Limpar seleção</button>}
                {sel.length >= 8 && <span className="text-[11px] text-amber-300">Limite de 8 canais.</span>}
              </div>

              {escolhidos.length === 0 ? (
                <p className="text-xs text-slate-500 mt-6 text-center py-6 border border-dashed border-slate-800 rounded-xl">Escolha um ou mais canais acima.</p>
              ) : (
                <div className="mt-6 space-y-6">
                  <div className="overflow-x-auto" data-tabela-canais>
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800">
                        <th className="py-2 pr-4">Canal · analista</th>
                        {colsComparacao.map((m) => <th key={m} className="py-2 px-2 text-right" title={METRICAS.find((x) => x.id === m)!.dica}>{METRICAS.find((x) => x.id === m)!.rotulo}</th>)}
                      </tr></thead>
                      <tbody>
                        {linhasComp.map(({ o, t, tb }) => (
                          <tr key={o.chave} data-linha-canal={o.chave} className="border-b border-slate-800/60">
                            <td className="py-3 pr-4"><div className="flex items-center gap-2"><span className="w-2.5 h-8 rounded" style={{ background: o.cor }} />{o.email ? <Avatar email={o.email} tamanho={26} /> : null}<div><p className="font-black text-white">{o.canal}</p><p className="text-[10px] text-slate-500">{o.nome}</p></div></div></td>
                            {colsComparacao.map((m) => {
                              const melhor = melhorDaColuna(m); const v = valorDa(t, m);
                              return <td key={m} className={`py-3 px-2 text-right ${melhor !== null && Math.abs(v - melhor) < 1e-9 ? "bg-emerald-950/30" : ""}`}>
                                <span className={`font-bold ${melhor !== null && Math.abs(v - melhor) < 1e-9 ? "text-emerald-300" : "text-slate-100"}`} data-celula-canal={m}>{fmt(v, m)}</span>
                                {tb && <Delta atual={v} anterior={valorDa(tb, m)} metrica={m} />}
                              </td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {linhasComp.length > 1 && <p className="text-[10px] text-slate-500 mt-2">Em verde, o melhor valor de cada coluna entre os canais escolhidos (em Ads, o menor investimento).</p>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-barras-canais>
                    {(["faturado", "margemBruta", "liquidez"] as MetricaId[]).map((m) => <Barras key={m} titulo={METRICAS.find((x) => x.id === m)!.rotulo} formato={METRICAS.find((x) => x.id === m)!.formato}
                      itens={linhasComp.map(({ o, t }) => ({ id: o.chave, rotulo: `${o.canal} · ${o.nome.split(" ")[0]}`, cor: o.cor, valor: valorDa(t, m) }))} />)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider">📈 Evolução dos canais escolhidos</h3>
                      <select value={metSel} onChange={(e) => setMetSel(e.target.value as MetricaId)} data-metrica-canais className={seletor}>{METRICAS.filter((m) => m.id !== "cadastros").map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}</select>
                      <span className="text-[11px] text-slate-500">{unidade.charAt(0).toUpperCase() + unidade.slice(1)} até {pA.rotulo.split(" a ").pop()}</span>
                    </div>
                    {graficoCanais()}
                  </div>
                </div>
              )}
            </div>

            {/* detalhe por analista e canal */}
            <div className="space-y-3" data-detalhes>
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider">Canais, mais vendidos e ads por analista</h2>
              {[...ranking, ...(semAnalista ? [semAnalista] : [])].map((a) => {
                const chave = a.email || "sem";
                const aberto = abertos.has(chave);
                return (
                  <div key={chave} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                    <button type="button" onClick={() => alternar(chave)} data-abrir-analista={chave} className="w-full flex items-center gap-3 text-left cursor-pointer">
                      {a.email ? <Avatar email={a.email} tamanho={36} /> : <span className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center">❔</span>}
                      <span className="flex-1 min-w-0"><span className="block text-sm font-black text-white">{a.nome}</span><span className="block text-[11px] text-slate-500 truncate">{a.canais.map((c) => c.canal).join(" · ")}</span></span>
                      <span className="text-right text-[11px] text-slate-400 hidden sm:block">{fmt(a.total.faturado, "faturado")} · liquidez {fmt(a.total.liquidez, "liquidez")} · ads {fmt(a.total.ads, "ads")}</span>
                      <span className="text-slate-500">{aberto ? "▲" : "▼"}</span>
                    </button>
                    {aberto && (a.email ? blocoCanais(a, chave) : <>
                      <p className="text-[11px] text-amber-300 mt-3">Estes canais ainda não têm analista. Vincule na tela Início para eles entrarem na classificação.</p>
                      {blocoCanais(a, chave)}
                    </>)}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
