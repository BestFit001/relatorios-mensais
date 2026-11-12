"use client";
import { useState, useEffect, useMemo, useDeferredValue, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import { buscarTudo } from "../../lib/buscarTudo";
import ConfigMapaCadastros from "../components/ConfigMapaCadastros";
import CanaisDoMapa from "../components/CanaisDoMapa";
import SkusPorCanal from "../components/SkusPorCanal";
import { carregarPaiManual, salvarPaiManual } from "../../lib/skuPaiDb";
import { normalizarSkuPai, paiPadrao } from "../../lib/skuPai";
import { carregarParaExclusao } from "../../lib/skusExclusao";
import { canaisSemRepeticao, canalTemCadastro, normalizarNomeCanal, normalizarSkuVenda, pendentesDeRegistro } from "../../lib/vendasCanaisLogica";

// ───────────────────────── utilidades ─────────────────────────

/** Mesmo padrão dos uploads: sem aspas/".0", só letras e números, minúsculo. */
const normalizarSku = (valor: any) => {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

// Grupos do painel de gráficos (mutuamente exclusivos): Obsoleto > Com estoque > Sem estoque
type Grupo = 0 | 1 | 2;
const G_COM_ESTOQUE: Grupo = 0;
const G_SEM_ESTOQUE: Grupo = 1;
const G_OBSOLETO: Grupo = 2;

const GRUPOS = [
  { id: G_COM_ESTOQUE, nome: "Cadastrados com estoque", curto: "Com estoque", cor: "#10b981", classe: "text-emerald-400", dica: "Status normal e estoque no Tiny > 0" },
  { id: G_SEM_ESTOQUE, nome: "Cadastrados sem estoque", curto: "Sem estoque", cor: "#f59e0b", classe: "text-amber-400", dica: "Status normal e estoque no Tiny ≤ 0" },
  { id: G_OBSOLETO, nome: "Obsoletos cadastrados", curto: "Obsoletos", cor: "#f43f5e", classe: "text-rose-400", dica: "Status Obsoleto (com ou sem estoque)" },
] as const;

interface ItemCadastro {
  sku: string;
  skuNorm: string;
  estoque: number;
  status: string;
  grupo: Grupo;
  pres: boolean[]; // presença por canal (mesma ordem de `canais`)
}

const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtPct = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const LIMITE_TABELA = 300;

// ───────────────────────── gráficos (SVG/CSS, sem biblioteca) ─────────────────────────

function Rosca({ valores, total }: { valores: number[]; total: number }) {
  const R = 70;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 200 200" className="w-52 h-52 shrink-0" role="img" aria-label="Distribuição dos SKUs cadastrados">
      <circle cx="100" cy="100" r={R} fill="none" stroke="#1e293b" strokeWidth="26" />
      {total > 0 &&
        valores.map((v, i) => {
          if (v <= 0) return null;
          const comprimento = (v / total) * C;
          const el = (
            <circle
              key={i}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={GRUPOS[i].cor}
              strokeWidth="26"
              strokeDasharray={`${comprimento} ${C - comprimento}`}
              strokeDashoffset={-acumulado}
              transform="rotate(-90 100 100)"
            />
          );
          acumulado += comprimento;
          return el;
        })}
      <text x="100" y="95" textAnchor="middle" className="fill-white" style={{ fontSize: 26, fontWeight: 800 }}>
        {fmtInt(total)}
      </text>
      <text x="100" y="116" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>
        SKUs CADASTRADOS
      </text>
    </svg>
  );
}

function Barra({ pct, cor }: { pct: number; cor: string }) {
  return (
    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: cor }} />
    </div>
  );
}

// ───────────────────────── página ─────────────────────────

const CAMPO_OCULTOS = "mapa_canais_ocultos";   // config_regras_tiny: nomes (normalizados) dos canais ocultos, separados por vírgula

export default function MapeamentoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [canais, setCanais] = useState<string[]>([]);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());   // canais ocultos no painel (nome normalizado)
  const [itens, setItens] = useState<ItemCadastro[]>([]);
  const [paiManual, setPaiManual] = useState<Map<string, string>>(new Map());   // ajustes do SKU pai (sku normalizado -> pai)
  const [paraExclusao, setParaExclusao] = useState<Set<string>>(new Set());     // SKUs marcados "Para exclusão" (normalizados)

  const [subAba, setSubAba] = useState<"progresso" | "skus" | "graficos" | "config">("progresso");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [filtroEstoque, setFiltroEstoque] = useState("ComEstoque");
  const [pesquisaSku, setPesquisaSku] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [avisoSync, setAvisoSync] = useState<{ tipo: "ok" | "info" | "erro"; texto: string } | null>(null);
  const pesquisaAdiada = useDeferredValue(pesquisaSku);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      // tudo em paralelo; só as colunas necessárias; só o que está presente (presente = true)
      const [regras, tiny, status, mapas, cfgOcultos] = await Promise.all([
        supabase.from("config_regras_canais").select("canal").order("id"),
        buscarTudo("cadastros_base_tiny", "sku, estoque"),
        buscarTudo("status_skus_catalogo", "sku, status"),
        buscarTudo("mapeamento_canais_skus", "canal, sku", (q) => q.eq("presente", true)),
        supabase.from("config_regras_tiny").select("coluna").eq("campo", CAMPO_OCULTOS).maybeSingle(),
      ]);
      if (regras.error) throw new Error(regras.error.message);
      setOcultos(new Set(String(cfgOcultos.data?.coluna ?? "").split(",").map((x) => x.trim()).filter(Boolean)));

      // canais sem catálogo (Clube Hebraica, Clube Paineiras…) não entram no Mapa
      const listaCanais: string[] = canaisSemRepeticao((regras.data || []).map((r: any) => r.canal)).filter(canalTemCadastro);
      // compara o nome do canal sem maiúsculas/acento ("Tiktok" = "TikTok")
      const idxCanal = new Map<string, number>(listaCanais.map((c, i) => [normalizarNomeCanal(c), i]));

      const mapaStatus = new Map<string, string>();
      for (const s of status) mapaStatus.set(normalizarSku(s.sku), s.status);

      // sku -> presença por canal, montado uma única vez
      const presencaPorSku = new Map<string, boolean[]>();
      for (const m of mapas) {
        const i = idxCanal.get(normalizarNomeCanal(m.canal));
        if (i === undefined) continue;
        const k = normalizarSku(m.sku);
        let arr = presencaPorSku.get(k);
        if (!arr) {
          arr = new Array(listaCanais.length).fill(false);
          presencaPorSku.set(k, arr);
        }
        arr[i] = true;
      }

      const vazio = new Array(listaCanais.length).fill(false);
      const resultado: ItemCadastro[] = tiny.map((t: any) => {
        const skuNorm = normalizarSku(t.sku);
        const estoque = Number(t.estoque || 0);
        const st = mapaStatus.get(skuNorm) || "Normal";
        const grupo: Grupo = st === "Obsoleto" ? G_OBSOLETO : estoque > 0 ? G_COM_ESTOQUE : G_SEM_ESTOQUE;
        return { sku: t.sku, skuNorm, estoque, status: st, grupo, pres: presencaPorSku.get(skuNorm) || vazio };
      });

      setCanais(listaCanais);
      setItens(resultado);
      setPaiManual(await carregarPaiManual());
      setParaExclusao(await carregarParaExclusao());
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar os cadastros.");
    } finally {
      setLoading(false);
    }
  }, []);

  // SKU que vendeu em um canal conta como cadastrado nele: registra o que faltar em mapeamento_canais_skus
  const sincronizarVendas = useCallback(async () => {
    setSincronizando(true);
    try {
      const [regras, tiny, mapas, vendas] = await Promise.all([
        supabase.from("config_regras_canais").select("canal").order("id"),
        buscarTudo("cadastros_base_tiny", "sku"),
        buscarTudo("mapeamento_canais_skus", "canal, sku", (q) => q.eq("presente", true)),
        buscarTudo("vendas_canais", "canal, sku"),
      ]);
      if (regras.error) throw new Error(regras.error.message);
      const listaCanais = canaisSemRepeticao((regras.data || []).map((r: any) => r.canal)).filter(canalTemCadastro);
      const skusBase = new Set<string>(tiny.map((t: any) => normalizarSkuVenda(t.sku)));
      const r = pendentesDeRegistro({ vendas, canais: listaCanais, presentes: mapas, skusBase });

      // grava o SKU como está na base do Tiny (mesmo formato dos uploads de canal)
      const original = new Map<string, string>();
      for (const t of tiny) original.set(normalizarSkuVenda(t.sku), String(t.sku));
      const linhas = r.novos.map((n) => ({ canal: n.canal, sku: original.get(n.sku) || n.sku, presente: true }));
      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await supabase.from("mapeamento_canais_skus").upsert(linhas.slice(i, i + 500), { onConflict: "canal,sku" });
        if (error) throw new Error(error.message);
      }

      const porCanal = new Map<string, number>();
      for (const n of r.novos) porCanal.set(n.canal, (porCanal.get(n.canal) || 0) + 1);
      const detalhe = Array.from(porCanal.entries()).map(([c, q]) => `${c}: ${q}`).join(" · ");
      const extras: string[] = [];
      if (r.foraDaBase.length) extras.push(`${r.foraDaBase.length} SKU(s) vendido(s) não estão na base do Tiny e não foram registrados`);
      const semLista = r.canaisSemCadastro.filter(canalTemCadastro);
      if (semLista.length) extras.push(`vendas em canal(is) sem cadastro na lista: ${semLista.join(", ")}`);
      const base = linhas.length
        ? `✅ ${linhas.length} SKU(s) com venda foram registrados como cadastrados (${detalhe}).`
        : "Vendas conferidas: nenhum SKU vendido estava faltando como cadastrado.";
      setAvisoSync({ tipo: linhas.length ? "ok" : "info", texto: base + (extras.length ? " ⚠️ " + extras.join("; ") + "." : "") });
      if (linhas.length) await carregar();
    } catch (e: any) {
      setAvisoSync({ tipo: "erro", texto: "Não consegui sincronizar com as vendas: " + (e?.message || e) });
    } finally {
      setSincronizando(false);
    }
  }, [carregar]);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) {
      router.push("/login");
      return;
    }
    carregar().then(sincronizarVendas);
  }, [carregar, sincronizarVendas, router]);

  // ── universo filtrado + presença por canal: uma única passada ──
  // posições (no vetor completo `canais`) dos canais que aparecem no painel
  const visiveis = useMemo(
    () => canais.map((canal, i) => ({ canal, i })).filter((x) => !ocultos.has(normalizarNomeCanal(x.canal))),
    [canais, ocultos]
  );

  const alternarCanal = useCallback(async (canal: string) => {
    const k = normalizarNomeCanal(canal);
    const novo = new Set(ocultos);
    if (novo.has(k)) novo.delete(k); else novo.add(k);
    setOcultos(novo);   // otimista; volta se não salvar
    const { error } = await supabase.from("config_regras_tiny").upsert({ campo: CAMPO_OCULTOS, coluna: Array.from(novo).join(",") }, { onConflict: "campo" });
    if (error) { setOcultos(ocultos); setAvisoSync({ tipo: "erro", texto: "Não consegui salvar os canais ocultos: " + error.message }); }
  }, [ocultos]);

  const adicionarCanalManual = useCallback(async (nomeDigitado: string): Promise<string | null> => {
    const nome = nomeDigitado.trim().replace(/\s+/g, " ");
    if (!nome) return "Digite o nome do canal.";
    if (nome.length > 40) return "Nome muito longo (máximo 40 caracteres).";
    if (canais.some((c) => normalizarNomeCanal(c) === normalizarNomeCanal(nome))) return `O canal “${nome}” já existe (a comparação ignora maiúsculas e acentos).`;
    const { error } = await supabase.from("config_regras_canais").insert({ canal: nome, coluna_sku: "A" });
    if (error) return "Não consegui criar o canal: " + error.message;
    await carregar();
    setAvisoSync({ tipo: "ok", texto: `✅ Canal “${nome}” criado. Suba a planilha dele em Configurações para o painel mostrar o progresso. Para usar nos uploads de vendas e no Dashboard, configure também em Regras Gerais.` });
    return null;
  }, [canais, carregar]);

  // Marca um SKU como cadastrado em um canal (clique no ❌ da sub-aba "SKUs por canal"): grava na base e atualiza a tela sem recarregar
  // Grava um ou vários SKUs como cadastrados no canal (o X do pai grava todas as variações de uma vez)
  const registrarCadastros = useCallback(async (skus: string[], canal: string): Promise<string | null> => {
    for (let i = 0; i < skus.length; i += 500) {
      const lote = skus.slice(i, i + 500).map((sku) => ({ canal, sku, presente: true }));
      const { error } = await supabase.from("mapeamento_canais_skus").upsert(lote, { onConflict: "canal,sku" });
      if (error) return "Não consegui gravar o cadastro: " + error.message;
    }
    const idx = canais.findIndex((c) => c === canal);
    if (idx >= 0) {
      const set = new Set(skus);
      setItens((prev) => prev.map((it) => {
        if (!set.has(it.sku)) return it;
        const pres = it.pres.slice(); pres[idx] = true;   // cópia: o vetor "vazio" é compartilhado entre SKUs sem cadastro
        return { ...it, pres };
      }));
    }
    return null;
  }, [canais]);
  const registrarCadastro = useCallback((sku: string, canal: string) => registrarCadastros([sku], canal), [registrarCadastros]);

  // Ajuste do SKU pai (botão "editar pai" da sub-aba SKUs por canal): grava na base e atualiza a tela
  const editarPai = useCallback(async (skus: string[], pai: string): Promise<string | null> => {
    const erro = await salvarPaiManual(skus, pai);
    if (erro) return erro;
    const novo = normalizarSkuPai(pai);
    setPaiManual((m) => {
      const n = new Map(m);
      for (const sku of skus) { const k = normalizarSkuPai(sku); if (paiPadrao(k) === novo) n.delete(k); else n.set(k, novo); }
      return n;
    });
    return null;
  }, []);

  const { filtrados, progresso } = useMemo(() => {
    const lista: ItemCadastro[] = [];
    const contagem = new Array(canais.length).fill(0);
    for (const it of itens) {
      if (filtroStatus !== "TODOS" && it.status !== filtroStatus) continue;
      if (filtroEstoque === "ComEstoque" && !(it.estoque > 0)) continue;
      if (filtroEstoque === "SemEstoque" && it.estoque > 0) continue;
      lista.push(it);
      for (let c = 0; c < canais.length; c++) if (it.pres[c]) contagem[c]++;
    }
    const total = lista.length;
    return {
      filtrados: lista,
      progresso: visiveis.map(({ canal, i: c }) => ({
        canal,
        cadastrados: contagem[c],
        total,
        percentual: total > 0 ? (contagem[c] / total) * 100 : 0,
      })),
    };
  }, [itens, canais, visiveis, filtroStatus, filtroEstoque]);

  // ── painel de gráficos: independe dos filtros (mostra os três grupos de uma vez) ──
  const resumoGrupos = useMemo(() => {
    const totais = [0, 0, 0];
    const porCanal = GRUPOS.map(() => new Array(canais.length).fill(0));
    let obsoletosComEstoque = 0;
    for (const it of itens) {
      totais[it.grupo]++;
      if (it.grupo === G_OBSOLETO && it.estoque > 0) obsoletosComEstoque++;
      for (let c = 0; c < canais.length; c++) if (it.pres[c]) porCanal[it.grupo][c]++;
    }
    return { totais, porCanal, obsoletosComEstoque, geral: itens.length };
  }, [itens, canais]);

  // ── auditoria por SKU ──
  const termos = useMemo(
    () => pesquisaAdiada.split(",").map((s) => normalizarSku(s)).filter(Boolean),
    [pesquisaAdiada]
  );
  const tabela = useMemo(() => {
    if (termos.length === 0) return { linhas: [] as ItemCadastro[], total: 0 };
    const achados = filtrados.filter((it) => termos.some((t) => it.skuNorm.includes(t)));
    return { linhas: achados.slice(0, LIMITE_TABELA), total: achados.length };
  }, [filtrados, termos]);

  const abrirGrupo = (g: Grupo) => {
    setFiltroStatus(g === G_OBSOLETO ? "Obsoleto" : "Normal");
    setFiltroEstoque(g === G_OBSOLETO ? "TODOS" : g === G_COM_ESTOQUE ? "ComEstoque" : "SemEstoque");
    setSubAba("progresso");
  };

  const classeAba = (ativa: boolean) =>
    `px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${
      ativa ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
    }`;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[96%] mx-auto">
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Mapa de Cadastros</h1>
            <p className="text-sm font-medium text-slate-400">Monitore a presença do catálogo por canal com filtros avançados</p>
          </div>
          <Navbar />
        </div>

        {/* SUB-ABAS */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button data-subaba="progresso" onClick={() => setSubAba("progresso")} className={classeAba(subAba === "progresso")}>
            Progresso por canal
          </button>
          <button data-subaba="skus" onClick={() => setSubAba("skus")} className={classeAba(subAba === "skus")}>
            SKUs por canal
          </button>
          <button data-subaba="graficos" onClick={() => setSubAba("graficos")} className={classeAba(subAba === "graficos")}>
            Gráficos
          </button>
          <button data-subaba="config" onClick={() => setSubAba("config")} className={classeAba(subAba === "config")}>
            ⚙️ Configurações
          </button>
          <button
            onClick={carregar}
            disabled={loading}
            className="ml-auto px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-50"
          >
            {loading ? "Carregando..." : "↻ Recarregar"}
          </button>
        </div>

        {erro && (
          <div data-erro className="mb-6 p-4 rounded-xl border border-rose-900/60 bg-rose-950/40 text-rose-300 text-sm font-semibold">
            ⚠️ {erro}
          </div>
        )}

        {avisoSync && (
          <div data-aviso-sync className={`mb-6 p-4 rounded-xl border text-sm font-semibold flex items-start justify-between gap-3 ${
            avisoSync.tipo === "erro" ? "border-rose-900/60 bg-rose-950/40 text-rose-300"
            : avisoSync.tipo === "ok" ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300"
            : "border-slate-800 bg-slate-900/60 text-slate-300"}`}>
            <span>{avisoSync.texto}</span>
            <button type="button" onClick={() => setAvisoSync(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">✕</button>
          </div>
        )}

        {/* ═════════════ SUB-ABA: CONFIGURAÇÕES (uploads que alimentam o painel) ═════════════ */}
        {subAba === "config" && (
          <ConfigMapaCadastros
            resumo={{
              total: itens.length,
              normais: itens.filter((i) => i.grupo !== G_OBSOLETO).length,
              obsoletos: itens.filter((i) => i.grupo === G_OBSOLETO).length,
            }}
            onAtualizado={carregar}
            onSincronizar={sincronizarVendas}
            sincronizando={sincronizando}
          />
        )}

        {subAba !== "config" && !loading && (
          <CanaisDoMapa canais={canais} ocultos={ocultos} normalizar={normalizarNomeCanal} onAlternar={alternarCanal} onAdicionar={adicionarCanalManual} />
        )}

        {/* ═════════════ SUB-ABA: SKUs POR CANAL ═════════════ */}
        {subAba === "skus" && <SkusPorCanal itens={itens} visiveis={visiveis} loading={loading} onCadastrar={registrarCadastro} onCadastrarVarios={registrarCadastros} paraExclusao={paraExclusao} paiManual={paiManual} onEditarPai={editarPai} />}

        {/* ═════════════ SUB-ABA: GRÁFICOS ═════════════ */}
        {subAba === "graficos" && (
          <div data-painel-graficos className="space-y-8">
            {loading ? (
              <p className="p-10 text-center text-slate-400 font-medium bg-slate-900/90 rounded-2xl border border-slate-800">Carregando dados completos...</p>
            ) : (
              <>
                {/* Visão geral */}
                <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
                  <h2 className="text-lg font-bold text-white mb-1">Visão geral do catálogo</h2>
                  <p className="text-xs text-slate-400 mb-6">
                    Todos os SKUs da base de cadastrados, separados em três grupos que não se sobrepõem (obsoleto tem prioridade sobre estoque).
                  </p>
                  <div className="flex flex-col lg:flex-row items-center gap-10">
                    <Rosca valores={resumoGrupos.totais} total={resumoGrupos.geral} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 w-full">
                      {GRUPOS.map((g) => {
                        const n = resumoGrupos.totais[g.id];
                        const pct = resumoGrupos.geral > 0 ? (n / resumoGrupos.geral) * 100 : 0;
                        return (
                          <button
                            key={g.id}
                            data-grupo={g.id}
                            onClick={() => abrirGrupo(g.id)}
                            title="Ver este grupo na aba de progresso"
                            className="text-left bg-slate-950 p-5 rounded-xl border border-slate-800 hover:border-slate-600 transition-colors"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-3 h-3 rounded-sm" style={{ background: g.cor }} />
                              <span className="text-xs font-bold text-slate-300">{g.nome}</span>
                            </div>
                            <div className={`text-3xl font-black ${g.classe}`}>{fmtInt(n)}</div>
                            <div className="text-[11px] text-slate-400 mt-1">{fmtPct(pct)}% do catálogo</div>
                            <div className="text-[10px] text-slate-500 mt-2">{g.dica}</div>
                            {g.id === G_OBSOLETO && n > 0 && (
                              <div className="text-[10px] text-rose-300/80 mt-1">{fmtInt(resumoGrupos.obsoletosComEstoque)} deles ainda com estoque</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {resumoGrupos.totais[G_OBSOLETO] === 0 && (
                    <p className="mt-6 text-[11px] text-slate-500">
                      Nenhum SKU está marcado como obsoleto: o status vem da planilha de Status na tela de Uploads (Passo de cadastros Tiny).
                    </p>
                  )}
                </div>

                {/* Cobertura por canal e grupo */}
                <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
                  <h2 className="text-lg font-bold text-white mb-1">Cobertura por canal em cada grupo</h2>
                  <p className="text-xs text-slate-400 mb-4">Em cada canal, quantos SKUs de cada grupo já estão presentes.</p>
                  <div className="flex flex-wrap gap-5 mb-6">
                    {GRUPOS.map((g) => (
                      <span key={g.id} className="flex items-center gap-2 text-[11px] font-bold text-slate-300">
                        <span className="w-3 h-3 rounded-sm" style={{ background: g.cor }} />
                        {g.curto}
                      </span>
                    ))}
                  </div>
                  {visiveis.length === 0 ? (
                    <p className="text-sm text-slate-500">{canais.length === 0 ? "Nenhum canal configurado." : "Todos os canais estão ocultos. Mostre algum na faixa “Canais exibidos”."}</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {visiveis.map(({ canal, i: c }) => (
                        <div key={canal} data-canal-grafico={canal} className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3.5">
                          <span className="font-bold text-white text-sm">{canal}</span>
                          {GRUPOS.map((g) => {
                            const total = resumoGrupos.totais[g.id];
                            const presentes = resumoGrupos.porCanal[g.id][c];
                            const pct = total > 0 ? (presentes / total) * 100 : 0;
                            return (
                              <div key={g.id} className="space-y-1">
                                <div className="flex justify-between items-baseline text-[11px]">
                                  <span className="font-semibold text-slate-400">{g.curto}</span>
                                  <span className="font-mono font-bold text-slate-200">
                                    {fmtInt(presentes)} / {fmtInt(total)} <span className={g.classe}>({fmtPct(pct)}%)</span>
                                  </span>
                                </div>
                                <Barra pct={pct} cor={g.cor} />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═════════════ SUB-ABA: PROGRESSO ═════════════ */}
        {subAba === "progresso" && (
          <>
            {/* FILTROS E PESQUISA */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 flex-1">
                <div className="flex-1 min-w-[280px]">
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Pesquisar SKU(s) para auditoria:</label>
                  <input
                    type="text"
                    value={pesquisaSku}
                    onChange={(e) => setPesquisaSku(e.target.value)}
                    placeholder="Ex: SKU001, SKU002..."
                    className="border border-slate-700 rounded-xl p-2.5 w-full text-xs font-semibold bg-slate-950 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Filtro de Estoque:</label>
                  <select
                    value={filtroEstoque}
                    onChange={(e) => setFiltroEstoque(e.target.value)}
                    className="border border-slate-700 rounded-xl p-2.5 text-xs font-semibold bg-slate-950 text-white outline-none cursor-pointer"
                  >
                    <option value="ComEstoque">Com estoque no Tiny (&gt; 0)</option>
                    <option value="SemEstoque">Sem estoque no Tiny (≤ 0)</option>
                    <option value="TODOS">Todos os produtos</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Status:</label>
                  <select
                    value={filtroStatus}
                    onChange={(e) => setFiltroStatus(e.target.value)}
                    className="border border-slate-700 rounded-xl p-2.5 text-xs font-semibold bg-slate-950 text-white outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todos os Status</option>
                    <option value="Normal">Normais</option>
                    <option value="Obsoleto">Obsoletos</option>
                  </select>
                </div>
              </div>

              <div className="text-xs font-bold text-slate-400">
                Universo filtrado: <strong data-universo className="text-white">{fmtInt(filtrados.length)}</strong> SKUs
              </div>
            </div>

            {/* PROGRESSO POR CANAL */}
            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
              <h2 className="text-lg font-bold mb-2 text-white">Progresso de Cadastros por Canal</h2>
              <p className="text-xs text-slate-400 mb-6">Cobertura dos canais considerando o universo filtrado.</p>

              {loading ? (
                <p className="p-6 text-center text-slate-400 font-medium">Carregando dados completos...</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {progresso.map((p) => (
                    <div key={p.canal} className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white text-sm">{p.canal}</span>
                        <span className="text-xs font-mono font-bold text-indigo-400">{fmtPct(p.percentual)}%</span>
                      </div>
                      <Barra pct={p.percentual} cor="#4f46e5" />
                      <p className="text-[11px] text-slate-400">
                        <strong>{fmtInt(p.cadastrados)}</strong> de <strong>{fmtInt(p.total)}</strong> SKUs presentes
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AUDITORIA */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-800">
                <h2 className="text-lg font-bold text-white">Auditoria Detalhada de SKUs por Canal</h2>
                <p className="text-xs text-slate-400 mt-1">Utilize o campo de pesquisa para auditar itens específicos dentro do filtro selecionado.</p>
              </div>

              {loading ? (
                <p className="p-8 text-center text-slate-400 font-medium">Carregando auditoria...</p>
              ) : termos.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-medium">
                  <p className="text-sm mb-1">🔍 Digite um ou mais SKUs na barra de pesquisa acima para visualizar os dados na tabela.</p>
                </div>
              ) : tabela.total === 0 ? (
                <p className="p-8 text-center text-slate-400 font-medium">Nenhum SKU encontrado com os termos pesquisados.</p>
              ) : (
                <>
                  {tabela.total > LIMITE_TABELA && (
                    <p data-limite className="px-6 py-2.5 text-[11px] font-semibold text-amber-300 bg-amber-950/30 border-b border-slate-800">
                      Mostrando os primeiros {LIMITE_TABELA} de {fmtInt(tabela.total)} SKUs encontrados. Refine a pesquisa para ver os demais.
                    </p>
                  )}
                  <div className="overflow-x-auto max-h-[600px]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                        <tr>
                          <th className="p-3.5">SKU</th>
                          <th className="p-3.5 text-center">Status</th>
                          <th className="p-3.5 text-right">Estoque</th>
                          {visiveis.map(({ canal: c }) => (
                            <th key={c} className="p-3.5 text-center">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {tabela.linhas.map((item) => (
                          <tr key={item.sku} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3.5 font-mono font-bold text-slate-200">{item.sku}</td>
                            <td className="p-3.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.status === "Obsoleto"
                                    ? "bg-rose-950/60 text-rose-400 border border-rose-900/50"
                                    : "bg-emerald-950/60 text-emerald-400 border border-emerald-900/50"
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className={`p-3.5 text-right font-bold ${item.estoque > 0 ? "text-indigo-400" : "text-slate-500"}`}>{item.estoque}</td>
                            {visiveis.map(({ canal: c, i }) => (
                              <td key={c} className="p-3.5 text-center text-sm">
                                {item.pres[i] ? <span className="text-emerald-400 font-bold">✅</span> : <span className="text-rose-500/60">❌</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
