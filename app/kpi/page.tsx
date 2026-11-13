"use client";
// KPIs e variável dos analistas (a planilha "KPI E-C - Equipe Nova" dentro do app, alimentada pelos números do próprio app).
// O admin vê a equipe toda e configura metas, regras e SKUs fora do cálculo; um analista liberado vê só o painel dos seus canais.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import { TABELAS_RESUMO, isoDoMesRef, parseCurrency } from "../../lib/resumoCanais";
import { chaveCanal } from "../../lib/ranking";
import { nomeDeExibicao, useNomes } from "../../lib/nomes";
import { normalizarSkuVenda } from "../../lib/vendasCanaisLogica";
import { rotuloMes } from "../../lib/ranking";
import {
  calcularKpiAnalista, mesesDoCiclo, separarSkus, somarMeses, variavelBaseSugerida,
  type DadosMes, type KpiConfig, type LinhaKpi, type ResultadoKpi, type SkuExcluido,
} from "../../lib/kpi";
import { CAMPO_CONFIG, CAMPO_SKUS, campoMargemDoMes, dadosDoMes, lerConfiguracoes, margemDoMes } from "../../lib/kpiCalculo";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const fmt = (f: LinhaKpi["formato"], v: number) => (f === "moeda" ? brl(v) : f === "pct" ? pct1(v) : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "x");
const mesAtual = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const horaSP = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const MESES_EXT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesExtenso = (iso: string) => { const [a, m] = iso.split("-"); return `${MESES_EXT[Number(m) - 1]} de ${a}`; };
const ACUM = "acum";

type Mapeamento = { email: string; canal: string };
type Aba = "metas" | "skus" | "regras" | "analistas";

const campo = "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500";
const cartao = "bg-slate-900/90 border border-slate-800 rounded-2xl";

function Selo({ l }: { l: LinhaKpi }) {
  if (l.semMeta) return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-950/40 text-amber-300 border border-amber-800/40">Defina a meta</span>;
  if (l.semDados) return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-800 text-slate-300">Sem dados</span>;
  if (l.fator >= 1) return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-800/40">Meta batida</span>;
  if (l.fator > 0) return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-950/40 text-amber-300 border border-amber-800/40">Faixa {Math.round(l.fator * 100)}%</span>;
  return <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-950/40 text-rose-300 border border-rose-800/40">Abaixo da faixa</span>;
}

export default function KpiPage() {
  useNomes();
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [usuario, setUsuario] = useState<{ email: string; admin: boolean }>({ email: "", admin: false });
  const [db, setDb] = useState<Record<string, any[]>>({});
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [visao, setVisao] = useState<string>("");
  const [analista, setAnalista] = useState<string>("equipe");
  const [painel, setPainel] = useState<Aba | null>(null);
  const ultimaBusca = useRef(0);

  // ------------------------------------------------------------ dados (atualiza sozinho)
  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true); else setAtualizando(true);
    try {
      const [tabelas, ads, map] = await Promise.all([
        Promise.all(TABELAS_RESUMO.map(async (t) => [t, await buscarTudo(t, "*")] as const)),
        buscarTudo("ads_campanhas_lancamentos", "*").catch(() => []),
        supabase.from("home_responsaveis_canais").select("*"),
      ]);
      const r: Record<string, any[]> = {}; tabelas.forEach(([t, l]) => { r[t] = l; }); r.ads_campanhas_lancamentos = ads;
      setDb(r);
      setMapeamentos(((map.data as any[]) || []).map((m) => ({ email: String(m.email || "").trim().toLowerCase(), canal: String(m.canal || "") })));
      setAtualizadoEm(new Date()); ultimaBusca.current = Date.now(); setErro("");
    } catch (e: any) { setErro(e?.message || String(e)); }
    setCarregando(false); setAtualizando(false);
  }, []);

  useEffect(() => {
    let u: any = null;
    try { u = JSON.parse(localStorage.getItem("usuario_logado") || "null"); } catch { u = null; }
    if (!u?.email) { router.push("/login"); return; }
    const admin = u.perfil === "admin";
    if (!admin && !(u.paginas_permitidas || []).includes("/kpi")) { router.push("/inicio"); return; }   // analista só entra quando o admin libera
    setUsuario({ email: String(u.email).trim().toLowerCase(), admin });
    setPronto(true);
    carregar();
    // tempo real: atualiza a cada 2 minutos com a aba aberta, ao voltar para ela e quando o banco avisar de mudança
    const timer = setInterval(() => { if (document.visibilityState === "visible") carregar(true); }, 120000);
    const aoVoltar = () => { if (document.visibilityState === "visible" && Date.now() - ultimaBusca.current > 30000) carregar(true); };
    document.addEventListener("visibilitychange", aoVoltar);
    let debounce: any = null;
    const canal = supabase.channel("kpi-tempo-real");
    ["vendas_canais", "faturados", "devolucoes", "cancelados", "ads_campanhas_lancamentos", "tb_metas", "config_regras_tiny"].forEach((tabela) =>
      canal.on("postgres_changes" as any, { event: "*", schema: "public", table: tabela }, () => { clearTimeout(debounce); debounce = setTimeout(() => carregar(true), 4000); }));
    try { canal.subscribe(); } catch { /* sem tempo real: fica a atualização por tempo */ }
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", aoVoltar); clearTimeout(debounce); try { supabase.removeChannel(canal); } catch { /* ignora */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ configuração e cálculo
  const { config, skus, margens } = useMemo(() => lerConfiguracoes(db.config_regras_tiny || []), [db.config_regras_tiny]);
  const meses = useMemo(() => mesesDoCiclo(config.periodo), [config.periodo]);
  const hoje = mesAtual();
  const mesesAteHoje = useMemo(() => { const l = meses.filter((m) => m <= hoje); return l.length ? l : meses.slice(0, 1); }, [meses, hoje]);

  useEffect(() => { if (!visao && meses.length) setVisao(meses.includes(hoje) ? hoje : mesesAteHoje[mesesAteHoje.length - 1]); }, [meses, hoje, mesesAteHoje, visao]);

  const [dadosMeses, setDadosMeses] = useState<DadosMes[] | null>(null);
  useEffect(() => {
    if (!db.vendas_canais) return;
    const t = setTimeout(() => {
      try { setDadosMeses(meses.map((m) => dadosDoMes(db, m, config, skus, margens))); } catch (e: any) { console.error(e); setErro(e?.message || String(e)); }
    }, 30);
    return () => clearTimeout(t);
  }, [db, meses, config, skus, margens]);

  const periodoVisto = useMemo(() => {
    if (!dadosMeses) return null;
    if (visao === ACUM) return somarMeses(dadosMeses.filter((d) => mesesAteHoje.includes(d.mes)));
    const d = dadosMeses.find((x) => x.mes === visao);
    return d ? somarMeses([d]) : null;
  }, [dadosMeses, visao, mesesAteHoje]);

  const analistas = useMemo(() => {
    const por = new Map<string, Set<string>>();
    mapeamentos.forEach((m) => { if (m.email) (por.get(m.email) || por.set(m.email, new Set()).get(m.email)!).add(chaveCanal(m.canal)); });
    return Array.from(por.entries()).map(([email, chaves]) => ({ email, chaves: Array.from(chaves) })).sort((a, b) => nomeDeExibicao(a.email).localeCompare(nomeDeExibicao(b.email)));
  }, [mapeamentos]);
  const baseDe = (email: string) => config.analistas[email]?.variavelBase ?? variavelBaseSugerida(nomeDeExibicao(email));
  const resultados = useMemo(() => {
    const m = new Map<string, ResultadoKpi>();
    if (periodoVisto) analistas.forEach((a) => m.set(a.email, calcularKpiAnalista(periodoVisto, a.chaves, baseDe(a.email), config)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoVisto, analistas, config]);

  const visiveis = usuario.admin ? analistas : analistas.filter((a) => a.email === usuario.email);
  const selecionado = usuario.admin ? (analista === "equipe" ? null : analistas.find((a) => a.email === analista) || null) : visiveis[0] || null;

  // ------------------------------------------------------------ gravação
  const gravar = async (campoDb: string, valor: string | null): Promise<string | null> => {
    const { error } = valor === null
      ? await supabase.from("config_regras_tiny").delete().eq("campo", campoDb)
      : await supabase.from("config_regras_tiny").upsert({ campo: campoDb, coluna: valor }, { onConflict: "campo" });
    return error ? error.message : null;
  };

  if (!pronto) return null;
  const rotuloVisao = visao === ACUM ? `Acumulado até ${rotuloMes(mesesAteHoje[mesesAteHoje.length - 1])}` : visao ? rotuloMes(visao) : "";

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">KPIs e variável</h1>
            <p className="text-sm text-slate-400 mt-1">{usuario.admin ? "Resultado de cada analista contra as metas do ciclo, calculado com os números do app." : "Seu resultado contra as metas dos seus canais, calculado com os números do app."}</p>
          </div>
          <Navbar />
        </div>

        {/* barra de período e atualização */}
        <div className={`${cartao} p-4 flex flex-wrap items-center gap-3`} data-barra-periodo>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Período">
            {meses.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={visao === m} data-mes-kpi={m} onClick={() => setVisao(m)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold cursor-pointer border ${visao === m ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:text-white"}`}>
                {rotuloMes(m).split("/")[0].replace(/^./, (c) => c.toUpperCase())}
              </button>
            ))}
            <button type="button" role="tab" aria-selected={visao === ACUM} data-mes-kpi={ACUM} onClick={() => setVisao(ACUM)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold cursor-pointer border ${visao === ACUM ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:text-white"}`}>
              Acumulado
            </button>
          </div>
          <span className="text-xs text-slate-500">Ciclo {rotuloMes(meses[0] || hoje)} a {rotuloMes(meses[meses.length - 1] || hoje)}</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-400" data-atualizacao>
            <span>{atualizando ? "Atualizando…" : atualizadoEm ? `Atualizado às ${horaSP(atualizadoEm)} · atualiza sozinho` : ""}</span>
            <button type="button" onClick={() => carregar(true)} data-atualizar className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:text-white cursor-pointer font-semibold">Atualizar agora</button>
            {usuario.admin && <button type="button" onClick={() => setPainel(painel ? null : "metas")} data-abrir-config className={`px-3 py-1.5 rounded-lg border cursor-pointer font-semibold ${painel ? "bg-indigo-600 border-indigo-500 text-white" : "border-slate-700 bg-slate-950 text-slate-200 hover:text-white"}`}>Metas e regras</button>}
          </div>
        </div>

        {erro && <p className="text-sm text-rose-400">Não consegui carregar tudo: {erro}</p>}
        {carregando || !periodoVisto ? <p className="text-sm text-slate-400 p-10 text-center">Calculando os KPIs…</p> : (
          <>
            {usuario.admin && painel && <PainelConfig aba={painel} setAba={setPainel} db={db} config={config} skus={skus} margens={margens} meses={meses} mesInicial={visao && visao !== ACUM ? visao : mesesAteHoje[mesesAteHoje.length - 1]}
              analistas={analistas} baseDe={baseDe} gravar={gravar} recarregar={() => carregar(true)} />}

            {usuario.admin && (
              <div className="flex flex-wrap gap-2" data-seletor-analista>
                <button type="button" data-analista="equipe" onClick={() => setAnalista("equipe")} className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer border ${analista === "equipe" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"}`}>Equipe</button>
                {analistas.map((a) => (
                  <button key={a.email} type="button" data-analista={a.email} onClick={() => setAnalista(a.email)} className={`pl-2 pr-4 py-1.5 rounded-xl text-sm font-semibold cursor-pointer border flex items-center gap-2 ${analista === a.email ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"}`}>
                    <Avatar email={a.email} tamanho={24} />{nomeDeExibicao(a.email)}
                  </button>
                ))}
              </div>
            )}

            {visiveis.length === 0 && <p className="text-sm text-amber-300">Nenhum canal está vinculado a você ainda. Peça ao admin para vincular seus canais na tela Início.</p>}

            {usuario.admin && !selecionado && analistas.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-resumo-equipe>
                {analistas.map((a) => {
                  const r = resultados.get(a.email); if (!r) return null;
                  const p = r.maximo > 0 ? (r.total / r.maximo) * 100 : 0;
                  return (
                    <button key={a.email} type="button" onClick={() => setAnalista(a.email)} data-cartao-analista={a.email} className={`${cartao} p-5 text-left cursor-pointer hover:border-indigo-500/60`}>
                      <div className="flex items-center gap-3"><Avatar email={a.email} tamanho={40} /><div className="min-w-0"><p className="text-base font-bold text-white truncate">{nomeDeExibicao(a.email)}</p><p className="text-xs text-slate-400">{a.chaves.length} canal(is) · base {brl(baseDe(a.email))}</p></div></div>
                      <p className="mt-4 text-xs text-slate-400">A receber · {rotuloVisao}</p>
                      <p className="text-2xl font-black text-white" data-a-receber>{brl(r.total)}</p>
                      <div className="h-1.5 rounded bg-slate-800 mt-2"><div className="h-1.5 rounded bg-indigo-500" style={{ width: `${Math.min(100, Math.max(1, p))}%` }} /></div>
                      <p className="mt-2 text-xs text-slate-400">{pct1(p)} do máximo de {brl(r.maximo)}{r.cancelamento.reducao > 0 ? ` · ${r.cancelamento.faixa.toLowerCase()}` : ""}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {selecionado && resultados.get(selecionado.email) && periodoVisto && (
              <PainelAnalista email={selecionado.email} r={resultados.get(selecionado.email)!} periodo={periodoVisto} chaves={selecionado.chaves} config={config} rotulo={rotuloVisao} temSkus={skus.length > 0} margens={margens} visao={visao} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ================================================================ painel de um analista
function PainelAnalista({ email, r, periodo, chaves, config, rotulo, temSkus, margens, visao }: {
  email: string; r: ResultadoKpi; periodo: ReturnType<typeof somarMeses>; chaves: string[]; config: KpiConfig; rotulo: string; temSkus: boolean; margens: Record<string, number>; visao: string;
}) {
  const meus = periodo.canais.filter((c) => chaves.includes(c.chave));
  const p = r.maximo > 0 ? (r.total / r.maximo) * 100 : 0;
  const canc = r.cancelamento;
  const metaMargem = visao && visao !== ACUM ? margemDoMes(margens, visao, config.margemPadrao) : null;
  return (
    <div className="space-y-6" data-painel-analista={email}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${cartao} p-5 md:col-span-1`}>
          <div className="flex items-center gap-3"><Avatar email={email} tamanho={44} /><div><p className="text-base font-bold text-white">{nomeDeExibicao(email)}</p><p className="text-xs text-slate-400">{meus.map((c) => c.canal).join(", ") || "sem canais"}</p></div></div>
          <p className="mt-5 text-xs text-slate-400">Variável a receber · {rotulo}</p>
          <p className="text-3xl font-black text-white" data-total-receber>{brl(r.total)}</p>
          <div className="h-2 rounded bg-slate-800 mt-3"><div className="h-2 rounded bg-indigo-500" style={{ width: `${Math.min(100, Math.max(1, p))}%` }} /></div>
          <p className="mt-2 text-xs text-slate-400">{pct1(p)} do máximo de {brl(r.maximo)} (base {brl(r.base)})</p>
        </div>
        <div className={`${cartao} p-5`}>
          <p className="text-sm font-semibold text-slate-200">Redutor por cancelamento</p>
          <p className="mt-3 text-3xl font-black text-white" data-taxa-cancelamento>{pct1(canc.taxa)}</p>
          <p className="text-xs text-slate-400 mt-1">{canc.cancelados.toLocaleString("pt-BR")} cancelados em {canc.total.toLocaleString("pt-BR")} pedidos</p>
          <p className={`mt-3 text-sm font-semibold ${canc.reducao > 0 ? "text-rose-300" : "text-emerald-300"}`} data-faixa-redutor>{canc.faixa}{canc.reducao > 0 ? ` (−${brl(r.reducaoValor)})` : ""}</p>
          <p className="text-[11px] text-slate-500 mt-2">Canais fora da taxa: {config.canaisForaCancelamento.length ? config.canaisForaCancelamento.join(", ") : "nenhum"}. Cancelamentos por arrependimento ou não entrega não têm marcação própria no app, então entram na taxa.</p>
        </div>
        <div className={`${cartao} p-5`}>
          <p className="text-sm font-semibold text-slate-200">Faixas do redutor</p>
          <table className="w-full text-xs mt-3">
            <tbody>
              {[...config.redutor].sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity)).map((f, i, arr) => {
                const antes = i === 0 ? null : arr[i - 1].ate;
                const ativa = canc.reducao === f.reducao && (f.ate === null ? canc.taxa > (antes ?? 0) : canc.taxa <= f.ate && (antes === null || canc.taxa > antes));
                return (
                  <tr key={i} className={`border-b border-slate-800/70 ${ativa ? "bg-indigo-950/30" : ""}`}>
                    <td className="py-2 pr-2 text-slate-300">{f.ate === null ? `Acima de ${pct1(antes ?? 0)}` : i === 0 ? `Até ${pct1(f.ate)}` : `${pct1(antes!)} a ${pct1(f.ate)}`}</td>
                    <td className={`py-2 text-right font-semibold ${f.reducao > 0 ? "text-rose-300" : "text-emerald-300"}`}>{f.reducao > 0 ? `−${Math.round(f.reducao * 100)}% no total` : "Sem redutor"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${cartao} p-5 overflow-x-auto`} data-tabela-kpi>
        <h2 className="text-base font-bold text-white">Indicadores · {rotulo}</h2>
        {metaMargem && <p className="text-xs text-slate-400 mt-1">Meta de margem líquida do mês: {pct1(metaMargem.valor)}{metaMargem.definida ? "" : " (herdada de um mês anterior; defina em Metas e regras)"}.</p>}
        <table className="w-full text-sm mt-4 min-w-[860px]">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
              <th className="py-2 pr-3 font-semibold">Indicador</th><th className="py-2 px-2 text-right font-semibold">Peso</th><th className="py-2 px-2 text-right font-semibold">Meta</th>
              <th className="py-2 px-2 text-right font-semibold">Atingido</th><th className="py-2 px-2 text-right font-semibold">% da meta</th><th className="py-2 px-2 font-semibold">Resultado</th>
              <th className="py-2 px-2 text-right font-semibold">Máximo</th><th className="py-2 pl-2 text-right font-semibold">A receber</th>
            </tr>
          </thead>
          <tbody>
            {r.linhas.map((l) => (
              <tr key={l.id} data-linha-kpi={l.id} className="border-b border-slate-800/60">
                <td className="py-3 pr-3"><p className="font-semibold text-slate-100">{l.rotulo}</p>{l.detalhe && <p className="text-[11px] text-slate-500">{l.detalhe}</p>}</td>
                <td className="py-3 px-2 text-right text-slate-300">{pct1(l.peso * 100)}</td>
                <td className="py-3 px-2 text-right text-slate-300" data-meta>{l.semMeta ? "—" : fmt(l.formato, l.meta)}</td>
                <td className="py-3 px-2 text-right font-semibold text-white" data-atingido>
                  {fmt(l.formato, l.atingido)}
                  {l.tipo === "margem" && temSkus && l.atingidoSemAjuste !== undefined && Math.abs(l.atingidoSemAjuste - l.atingido) > 0.05 && <span className="block text-[11px] font-normal text-slate-500" title="Margem se os SKUs fora do cálculo contassem">sem ajuste: {pct1(l.atingidoSemAjuste)}</span>}
                </td>
                <td className="py-3 px-2 text-right text-slate-300">{l.semMeta ? "—" : pct1(l.pct * 100)}</td>
                <td className="py-3 px-2"><Selo l={l} /></td>
                <td className="py-3 px-2 text-right text-slate-400">{brl(l.maximo)}</td>
                <td className="py-3 pl-2 text-right font-bold text-white" data-a-receber-linha>{brl(l.aReceber)}</td>
              </tr>
            ))}
            <tr className="border-b border-slate-800/60"><td className="py-3 pr-3 text-slate-300" colSpan={6}>Soma dos indicadores</td><td className="py-3 px-2 text-right text-slate-400">{brl(r.maximo)}</td><td className="py-3 pl-2 text-right font-semibold text-slate-100">{brl(r.subtotal)}</td></tr>
            <tr className="border-b border-slate-800/60"><td className="py-3 pr-3 text-slate-300" colSpan={7}>Redutor por cancelamento ({canc.faixa.toLowerCase()})</td><td className="py-3 pl-2 text-right font-semibold text-rose-300">{r.reducaoValor > 0 ? `−${brl(r.reducaoValor)}` : brl(0)}</td></tr>
            <tr><td className="py-3 pr-3 font-bold text-white" colSpan={7}>Variável a receber</td><td className="py-3 pl-2 text-right text-lg font-black text-white">{brl(r.total)}</td></tr>
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500 mt-3">Como lê: bateu a meta, o indicador paga o máximo; ficando na faixa de 95% ou 90% da meta (na margem, 98% ou 95%), paga o mesmo percentual do máximo; abaixo disso, zero.</p>
      </div>

      <div className={`${cartao} p-5 overflow-x-auto`} data-tabela-canais-kpi>
        <h2 className="text-base font-bold text-white">Seus canais · {rotulo}</h2>
        <table className="w-full text-sm mt-4 min-w-[860px]">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
              <th className="py-2 pr-3 font-semibold">Canal</th><th className="py-2 px-2 text-right font-semibold">Meta de receita</th><th className="py-2 px-2 text-right font-semibold">Faturado</th>
              <th className="py-2 px-2 text-right font-semibold">% da meta</th><th className="py-2 px-2 text-right font-semibold">Margem líquida</th><th className="py-2 px-2 text-right font-semibold">ROAS</th><th className="py-2 pl-2 text-right font-semibold">Cancelamento</th>
            </tr>
          </thead>
          <tbody>
            {meus.map((c) => {
              const m = c.brutoMargem > 0 ? (c.lucroMargem / c.brutoMargem) * 100 : 0;
              return (
                <tr key={c.chave} data-linha-canal-kpi={c.chave} className="border-b border-slate-800/60">
                  <td className="py-3 pr-3 font-semibold text-slate-100">{c.canal}</td>
                  <td className="py-3 px-2 text-right text-slate-300">{c.metaReceita > 0 ? brl(c.metaReceita) : "—"}</td>
                  <td className="py-3 px-2 text-right font-semibold text-white">{brl(c.faturado)}</td>
                  <td className="py-3 px-2 text-right text-slate-300">{c.metaReceita > 0 ? pct1((c.faturado / c.metaReceita) * 100) : "—"}</td>
                  <td className="py-3 px-2 text-right text-slate-200">{c.brutoMargem > 0 ? pct1(m) : "—"}</td>
                  <td className="py-3 px-2 text-right text-slate-200">{c.adsInvest > 0 ? (c.adsRetorno / c.adsInvest).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "x" : "—"}</td>
                  <td className="py-3 pl-2 text-right text-slate-200">{c.pedidosTotais > 0 ? pct1((c.pedidosCancelados / c.pedidosTotais) * 100) : "—"}{config.canaisForaCancelamento.includes(c.chave) && <span className="block text-[11px] text-slate-500">fora da taxa</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ================================================================ metas e regras (só admin)
function PainelConfig({ aba, setAba, db, config, skus, margens, meses, mesInicial, analistas, baseDe, gravar, recarregar }: {
  aba: Aba; setAba: (a: Aba | null) => void; db: Record<string, any[]>; config: KpiConfig; skus: SkuExcluido[]; margens: Record<string, number>; meses: string[]; mesInicial: string;
  analistas: { email: string; chaves: string[] }[]; baseDe: (email: string) => number; gravar: (campo: string, valor: string | null) => Promise<string | null>; recarregar: () => void;
}) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const abas: { id: Aba; nome: string }[] = [{ id: "metas", nome: "Metas do mês" }, { id: "skus", nome: "SKUs fora do cálculo" }, { id: "regras", nome: "Regras e pesos" }, { id: "analistas", nome: "Analistas" }];
  const salvar = async (fn: () => Promise<string | null>, ok: string) => {
    setSalvando(true); setAviso(null);
    const e = await fn();
    setAviso(e ? { ok: false, texto: "Não consegui salvar: " + e } : { ok: true, texto: ok });
    setSalvando(false);
    if (!e) recarregar();
  };
  const salvarConfig = (nova: KpiConfig, ok: string) => salvar(() => gravar(CAMPO_CONFIG, JSON.stringify(nova)), ok);

  return (
    <div className={`${cartao} p-5`} data-painel-config>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {abas.map((a) => <button key={a.id} type="button" data-aba-config={a.id} onClick={() => { setAba(a.id); setAviso(null); }} className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold cursor-pointer border ${aba === a.id ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:text-white"}`}>{a.nome}</button>)}
        <button type="button" onClick={() => setAba(null)} className="ml-auto text-sm text-slate-400 hover:text-white cursor-pointer">Fechar</button>
      </div>
      {aviso && <p role="status" data-aviso-config className={`text-sm mb-4 ${aviso.ok ? "text-emerald-300" : "text-rose-300"}`}>{aviso.texto}</p>}
      {aba === "metas" && <AbaMetas db={db} config={config} margens={margens} meses={meses} mesInicial={mesInicial} gravar={gravar} salvar={salvar} salvando={salvando} />}
      {aba === "skus" && <AbaSkus db={db} skus={skus} meses={meses} mesInicial={mesInicial} gravar={gravar} salvar={salvar} salvando={salvando} />}
      {aba === "regras" && <AbaRegras config={config} salvarConfig={salvarConfig} salvando={salvando} />}
      {aba === "analistas" && <AbaAnalistas config={config} analistas={analistas} baseDe={baseDe} salvarConfig={salvarConfig} salvando={salvando} />}
    </div>
  );
}

type Salvar = (fn: () => Promise<string | null>, ok: string) => Promise<void>;

function AbaMetas({ db, config, margens, meses, mesInicial, gravar, salvar, salvando }: { db: Record<string, any[]>; config: KpiConfig; margens: Record<string, number>; meses: string[]; mesInicial: string; gravar: (c: string, v: string | null) => Promise<string | null>; salvar: Salvar; salvando: boolean }) {
  const [mes, setMes] = useState(mesInicial);
  const canais = useMemo(() => {
    const vistos = new Set<string>(); const lista: string[] = [];
    (db.config_regras_canais || []).forEach((c: any) => { const n = String(c.canal || "").trim(); const k = chaveCanal(n); if (n && !vistos.has(k)) { vistos.add(k); lista.push(n); } });
    return lista;
  }, [db.config_regras_canais]);
  const metasAtuais = useMemo(() => {
    const m = new Map<string, { valor: number; linha: any }>();
    (db.tb_metas || []).forEach((g: any) => { if (isoDoMesRef(g.mes_referencia) === mes) m.set(chaveCanal(g.canal), { valor: parseCurrency(g.meta_valor), linha: g }); });
    return m;
  }, [db.tb_metas, mes]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [margem, setMargem] = useState("");
  useEffect(() => {
    const v: Record<string, string> = {};
    canais.forEach((c) => { const a = metasAtuais.get(chaveCanal(c)); v[chaveCanal(c)] = a ? String(a.valor).replace(".", ",") : ""; });
    setValores(v);
    const m = margemDoMes(margens, mes, config.margemPadrao);
    setMargem(String(m.valor).replace(".", ","));
  }, [canais, metasAtuais, mes, margens, config.margemPadrao]);
  const m = margemDoMes(margens, mes, config.margemPadrao);
  const numero = (s: string) => { const n = parseFloat(String(s).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : NaN; };

  const salvarTudo = () => salvar(async () => {
    const mg = parseFloat(String(margem).replace(",", "."));
    if (!isFinite(mg) || mg < 0 || mg > 100) return "A meta de margem precisa ser um número entre 0 e 100.";
    let e = await gravar(campoMargemDoMes(mes), String(mg));
    if (e) return e;
    for (const c of canais) {
      const k = chaveCanal(c); const txt = valores[k] ?? ""; const novo = txt.trim() === "" ? NaN : numero(txt); const atual = metasAtuais.get(k);
      if (isNaN(novo)) continue;
      if (atual && Math.abs(atual.valor - novo) < 0.005) continue;
      // mantém o texto de canal e de mês que já estão gravados, para não duplicar a meta
      const { error } = await supabase.from("tb_metas").upsert([{ canal: atual?.linha.canal ?? c, mes_referencia: atual?.linha.mes_referencia ?? mesExtenso(mes), meta_valor: novo }], { onConflict: "canal, mes_referencia" });
      if (error) return `Meta de ${c}: ${error.message}`;
    }
    return null;
  }, `Metas de ${rotuloMes(mes)} salvas. Valem também no Início, no Dashboard e no Ranking.`);

  const total = canais.reduce((s, c) => { const n = numero(valores[chaveCanal(c)] ?? ""); return s + (isNaN(n) ? 0 : n); }, 0);
  return (
    <div className="space-y-5" data-aba-metas>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs font-semibold text-slate-400 block">Mês
          <select value={mes} onChange={(e) => setMes(e.target.value)} data-metas-mes className={campo + " block mt-1"}>{meses.map((x) => <option key={x} value={x}>{rotuloMes(x)}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-slate-400 block">Meta de margem líquida do mês (%)
          <input value={margem} onChange={(e) => setMargem(e.target.value)} inputMode="decimal" data-meta-margem className={campo + " block mt-1 w-40"} />
        </label>
        <p className="text-xs text-slate-500 pb-2 max-w-md">{m.definida ? `Definida para ${rotuloMes(mes)}.` : `Ainda não definida para ${rotuloMes(mes)}: está valendo ${pct1(m.valor)}, herdada do último mês definido (ou do padrão). Salvar fixa o valor para este mês.`} Cada mês usa a sua meta, então o que já foi apurado não muda quando você altera outro mês.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-800"><th className="py-2 pr-3 font-semibold">Canal</th><th className="py-2 px-2 font-semibold w-56">Meta de receita em {rotuloMes(mes)} (R$)</th></tr></thead>
          <tbody>
            {canais.map((c) => (
              <tr key={c} className="border-b border-slate-800/60">
                <td className="py-2 pr-3 text-slate-100">{c}</td>
                <td className="py-2 px-2"><input value={valores[chaveCanal(c)] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [chaveCanal(c)]: e.target.value }))} inputMode="decimal" data-meta-receita={chaveCanal(c)} placeholder="sem meta" className={campo + " w-full text-right"} /></td>
              </tr>
            ))}
            <tr><td className="py-3 pr-3 font-semibold text-slate-300">Total da empresa</td><td className="py-3 px-2 text-right font-bold text-white" data-meta-total>{brl(total)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={salvando} onClick={salvarTudo} data-salvar-metas className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-60">{salvando ? "Salvando…" : "Salvar metas do mês"}</button>
        <span className="text-xs text-slate-500">As metas de receita são as mesmas da tela Regras (uma por canal e mês).</span>
      </div>
    </div>
  );
}

function AbaSkus({ db, skus, meses, mesInicial, gravar, salvar, salvando }: { db: Record<string, any[]>; skus: SkuExcluido[]; meses: string[]; mesInicial: string; gravar: (c: string, v: string | null) => Promise<string | null>; salvar: Salvar; salvando: boolean }) {
  const [texto, setTexto] = useState("");
  const [de, setDe] = useState(mesInicial);
  const [ate, setAte] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busca, setBusca] = useState("");
  const nomes = useMemo(() => { const m = new Map<string, string>(); (db.tabela_custos_skus || []).forEach((r: any) => m.set(normalizarSkuVenda(r.sku), String(r.produto || ""))); return m; }, [db.tabela_custos_skus]);
  const lista = useMemo(() => [...skus].sort((a, b) => a.sku.localeCompare(b.sku)).filter((s) => !busca.trim() || s.sku.toLowerCase().includes(busca.trim().toLowerCase()) || (nomes.get(normalizarSkuVenda(s.sku)) || "").toLowerCase().includes(busca.trim().toLowerCase())), [skus, busca, nomes]);
  const gravarLista = (nova: SkuExcluido[], ok: string) => salvar(() => gravar(CAMPO_SKUS, JSON.stringify(nova)), ok);
  const adicionar = () => {
    const novos = separarSkus(texto);
    if (!novos.length) return;
    const chave = (s: { sku: string; de: string }) => normalizarSkuVenda(s.sku) + "|" + s.de;
    const mapa = new Map(skus.map((s) => [chave(s), s] as const));
    novos.forEach((sku) => mapa.set(chave({ sku, de }), { sku, de, ate: ate || undefined, motivo: motivo.trim() || undefined }));
    gravarLista(Array.from(mapa.values()), `${novos.length} SKU(s) fora do cálculo a partir de ${rotuloMes(de)}.`);
    setTexto(""); setMotivo("");
  };
  return (
    <div className="space-y-5" data-aba-skus>
      <p className="text-sm text-slate-300 max-w-3xl">SKUs obsoletos ou de desova, trabalhados com margem baixa de propósito, saem do cálculo de <strong>margem líquida</strong> dos analistas (vendas, devoluções e cancelamentos deles). Para não penalizar o analista, a receita desses SKUs continua contando na meta de faturamento; isso pode ser trocado em Regras e pesos.</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <label className="text-xs font-semibold text-slate-400 block lg:col-span-2">Lista de SKUs (um por linha, ou separados por vírgula)
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} data-skus-texto placeholder={"20345042233\n20345042234"} className={campo + " block mt-1 w-full font-mono"} />
        </label>
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-400 block">Vale a partir de
            <select value={de} onChange={(e) => setDe(e.target.value)} data-skus-de className={campo + " block mt-1 w-full"}>{meses.map((x) => <option key={x} value={x}>{rotuloMes(x)}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-slate-400 block">Até (opcional)
            <select value={ate} onChange={(e) => setAte(e.target.value)} className={campo + " block mt-1 w-full"}><option value="">Sem data final</option>{meses.filter((x) => x >= de).map((x) => <option key={x} value={x}>{rotuloMes(x)}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-slate-400 block">Motivo (opcional)
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Desova, obsoleto…" className={campo + " block mt-1 w-full"} />
          </label>
        </div>
      </div>
      <button type="button" disabled={salvando || !separarSkus(texto).length} onClick={adicionar} data-skus-adicionar className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-50">Adicionar à lista</button>

      <div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h3 className="text-sm font-bold text-white">{skus.length} SKU(s) na lista</h3>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar SKU ou produto" className={campo + " w-64"} />
        </div>
        {skus.length === 0 ? <p className="text-sm text-slate-500">Nenhum SKU fora do cálculo.</p> : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm min-w-[640px]" data-skus-lista>
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-800"><th className="py-2 pr-3 font-semibold">SKU</th><th className="py-2 px-2 font-semibold">Produto</th><th className="py-2 px-2 font-semibold">Vigência</th><th className="py-2 px-2 font-semibold">Motivo</th><th className="py-2 pl-2" /></tr></thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.sku + s.de} className="border-b border-slate-800/60" data-sku-linha={s.sku}>
                    <td className="py-2 pr-3 font-mono text-slate-100">{s.sku}</td>
                    <td className="py-2 px-2 text-slate-300">{nomes.get(normalizarSkuVenda(s.sku)) || <span className="text-slate-500">não está na base de custos</span>}</td>
                    <td className="py-2 px-2 text-slate-300">{rotuloMes(s.de)}{s.ate ? ` a ${rotuloMes(s.ate)}` : " em diante"}</td>
                    <td className="py-2 px-2 text-slate-400">{s.motivo || "—"}</td>
                    <td className="py-2 pl-2 text-right"><button type="button" data-sku-remover={s.sku} disabled={salvando} onClick={() => gravarLista(skus.filter((x) => !(x.sku === s.sku && x.de === s.de)), `${s.sku} saiu da lista.`)} className="text-xs text-rose-300 hover:text-rose-200 cursor-pointer font-semibold">Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AbaRegras({ config, salvarConfig, salvando }: { config: KpiConfig; salvarConfig: (c: KpiConfig, ok: string) => Promise<void>; salvando: boolean }) {
  const [f, setF] = useState({
    inicio: config.periodo.inicio, fim: config.periodo.fim, roas: String(config.metaRoas).replace(".", ","), margem: String(config.margemPadrao).replace(".", ","),
    p1: String(config.pesos.receitaTotal), p2: String(config.pesos.roas), p3: String(config.pesos.margem), p4: String(config.pesos.faturadoCanais),
    fora: config.canaisForaCancelamento.join(", "), contar: config.contarReceitaSkusExcluidos,
  });
  const n = (s: string) => { const v = parseFloat(String(s).replace(",", ".")); return isFinite(v) ? v : 0; };
  const soma = n(f.p1) + n(f.p2) + n(f.p3) + n(f.p4);
  const invalido = Math.abs(soma - 100) > 0.001 || f.fim < f.inicio || !f.inicio || !f.fim;
  const salvar = () => salvarConfig({
    ...config, periodo: { inicio: f.inicio, fim: f.fim }, metaRoas: n(f.roas), margemPadrao: n(f.margem),
    pesos: { receitaTotal: n(f.p1), roas: n(f.p2), margem: n(f.p3), faturadoCanais: n(f.p4) },
    canaisForaCancelamento: f.fora.split(",").map((s) => chaveCanal(s)).filter(Boolean), contarReceitaSkusExcluidos: f.contar,
  }, "Regras salvas.");
  const rot = "text-xs font-semibold text-slate-400 block";
  return (
    <div className="space-y-5" data-aba-regras>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className={rot}>Ciclo: primeiro mês<input type="month" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className={campo + " block mt-1 w-full"} /></label>
        <label className={rot}>Ciclo: último mês<input type="month" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} className={campo + " block mt-1 w-full"} /></label>
        <label className={rot}>Meta de ROAS<input value={f.roas} onChange={(e) => setF({ ...f, roas: e.target.value })} inputMode="decimal" className={campo + " block mt-1 w-full"} /></label>
        <label className={rot}>Meta de margem padrão (%)<input value={f.margem} onChange={(e) => setF({ ...f, margem: e.target.value })} inputMode="decimal" className={campo + " block mt-1 w-full"} /></label>
      </div>
      <div>
        <p className={rot}>Peso de cada indicador (%) — precisa somar 100</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-1">
          {([["p1", "Receita total da empresa"], ["p2", "ROAS"], ["p3", "Margem líquida (dividido entre os canais)"], ["p4", "Faturamento dos canais"]] as const).map(([k, nome]) => (
            <label key={k} className={rot}>{nome}<input value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode="decimal" className={campo + " block mt-1 w-full"} /></label>
          ))}
        </div>
        <p className={`text-xs mt-2 ${Math.abs(soma - 100) > 0.001 ? "text-rose-300" : "text-slate-500"}`}>Soma atual: {soma.toLocaleString("pt-BR")}%</p>
      </div>
      <label className={rot + " max-w-xl"}>Canais fora da taxa de cancelamento (separados por vírgula)
        <input value={f.fora} onChange={(e) => setF({ ...f, fora: e.target.value })} placeholder="magalu" className={campo + " block mt-1 w-full"} />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer"><input type="checkbox" checked={f.contar} onChange={(e) => setF({ ...f, contar: e.target.checked })} />Manter a receita dos SKUs fora do cálculo na meta de faturamento (só a margem os ignora)</label>
      <div className="text-xs text-slate-500 space-y-1">
        <p>Faixas de pagamento: receita, ROAS e faturamento pagam 100%, 95% e 90% do peso; a margem paga 100%, 98% e 95%. Redutor: até 3,5% de cancelamento, sem redutor; até 4,5%, −20%; até 5,5%, −50%; acima, −100%.</p>
      </div>
      <button type="button" disabled={salvando || invalido} onClick={salvar} data-salvar-regras className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-50">Salvar regras</button>
    </div>
  );
}

function AbaAnalistas({ config, analistas, baseDe, salvarConfig, salvando }: { config: KpiConfig; analistas: { email: string; chaves: string[] }[]; baseDe: (e: string) => number; salvarConfig: (c: KpiConfig, ok: string) => Promise<void>; salvando: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => { const v: Record<string, string> = {}; analistas.forEach((a) => { v[a.email] = String(baseDe(a.email)).replace(".", ","); }); setVals(v); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [analistas, config.analistas]);
  const salvar = () => {
    const novo = { ...config.analistas };
    analistas.forEach((a) => { const n = parseFloat(String(vals[a.email] ?? "").replace(/\./g, "").replace(",", ".")); if (isFinite(n) && n >= 0) novo[a.email] = { ...novo[a.email], variavelBase: n }; });
    salvarConfig({ ...config, analistas: novo }, "Variável-base dos analistas salva.");
  };
  return (
    <div className="space-y-5" data-aba-analistas>
      <p className="text-sm text-slate-300 max-w-3xl">Variável-base é o valor máximo que o analista recebe quando bate tudo. Os canais de cada um vêm da tela Início (vínculo analista–canal). Para o analista ver esta aba, libere "KPIs e variável" em Painel Admin, no ✏️ do usuário; ele verá só o painel dele.</p>
      <table className="w-full text-sm max-w-2xl">
        <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-800"><th className="py-2 pr-3 font-semibold">Analista</th><th className="py-2 px-2 font-semibold">Canais</th><th className="py-2 px-2 font-semibold w-44">Variável-base (R$)</th></tr></thead>
        <tbody>
          {analistas.map((a) => (
            <tr key={a.email} className="border-b border-slate-800/60">
              <td className="py-2 pr-3"><span className="flex items-center gap-2"><Avatar email={a.email} tamanho={24} />{nomeDeExibicao(a.email)}</span></td>
              <td className="py-2 px-2 text-slate-400">{a.chaves.length}</td>
              <td className="py-2 px-2"><input value={vals[a.email] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [a.email]: e.target.value }))} inputMode="decimal" data-base-analista={a.email} className={campo + " w-full text-right"} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" disabled={salvando} onClick={salvar} data-salvar-analistas className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-60">Salvar</button>
    </div>
  );
}
