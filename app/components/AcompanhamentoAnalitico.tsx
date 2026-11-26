"use client";
// Análises do Acompanhamento (tela inicial): canais (devolução e vendas no prejuízo), margem líquida, dashboard de vendas e estoque parado.
// Os números vêm de lib/acompanhamento.ts, que parte das mesmas linhas de venda da Curva ABC (lib/vendasLinhas).
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import { carregarPaiManual } from "../../lib/skuPaiDb";
import { campoCarrinho, lerCarrinho, PREFIXO_CARRINHO, serializarCarrinho, type MarcaCarrinho } from "../../lib/prejuizoCarrinho";
import { montarCustosMap, montarLinhasBase, normalizarSkuLinha, normalizarTextoLinha } from "../../lib/vendasLinhas";
import {
  AMOSTRA_MIN_DEV, DIAS_ESTOQUE_PARADO, LIMITE_DEV_ATENCAO, LIMITE_DEV_CRITICO, PRESETS_PERIODO, SEM_MODALIDADE,
  analisarCanais, analisarDashboard, analisarEstoqueParado, analisarMargens, listarVendasNoPrejuizo, mapaEstoque, periodoDoPreset,
  type PresetPeriodo, type ResumoCanalAnalise, type SkuParado,
} from "../../lib/acompanhamento";

export type SubAnalitica = "canais" | "prejuizo" | "margem" | "vendas" | "estoque";

const moedaBR = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moedaCurta = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pctBR = (v: number | null | undefined, casas = 1) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%");
const inteiro = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const dataBR = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const caixa = "bg-slate-900/90 rounded-2xl border border-slate-800";
const rotulo = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const botaoPill = (ativo: boolean) => `px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${ativo ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`;
const campoSelect = "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none cursor-pointer";

function corMargem(m: number | null) {
  if (m === null) return "text-slate-500";
  return m < 0 ? "text-rose-400" : m < 10 ? "text-amber-300" : "text-emerald-400";
}

function Barra({ valor, max, cor = "bg-indigo-500", altura = "h-2" }: { valor: number; max: number; cor?: string; altura?: string }) {
  const w = max > 0 ? Math.max(valor > 0 ? 2 : 0, Math.min(100, (valor / max) * 100)) : 0;
  return <div className={`${altura} rounded-full bg-slate-800 overflow-hidden`}><div className={`h-full rounded-full ${cor}`} style={{ width: `${w}%` }} /></div>;
}

function Kpi({ titulo, valor, detalhe, cor = "text-white" }: { titulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className={`${caixa} p-4`}>
      <div className={rotulo}>{titulo}</div>
      <div className={`text-xl font-black mt-1 ${cor}`}>{valor}</div>
      {detalhe && <div className="text-[10px] text-slate-500 mt-1 leading-snug">{detalhe}</div>}
    </div>
  );
}

export default function AcompanhamentoAnalitico({ sub, canaisPermitidos, ocultar, usuarioEmail = "" }: { sub: SubAnalitica; canaisPermitidos: string[] | null; ocultar: boolean; usuarioEmail?: string }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState<{ vendas: any[]; faturados: any[]; custos: any[]; devolucoes: any[]; cancelados: any[]; plp: any[]; tarifas: any[]; regras: any[]; estoque: any[]; status: any[]; impostoPct: number } | null>(null);
  const [paiManual, setPaiManual] = useState<Map<string, string>>(new Map());
  const [carrinho, setCarrinho] = useState<Map<string, MarcaCarrinho>>(new Map());

  const [preset, setPreset] = useState<PresetPeriodo>("30d");
  const [canal, setCanal] = useState("TODOS");
  const [descontarImposto, setDescontarImposto] = useState(false);

  // dinheiro escondido quando o usuário usa "Ocultar informações"
  const $ = (v: number) => (ocultar ? "R$ ••••" : moedaBR(v));
  const $c = (v: number) => (ocultar ? "R$ ••••" : moedaCurta(v));

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true); setErro("");
      try {
        const [vendas, faturados, custos, devolucoes, cancelados, plp, tarifas, regras, estoque, status, cfg, pai, marcas] = await Promise.all([
          buscarTudo("vendas_canais", "id, id_pedido, sku, canal, produto, preco_venda, repasse_liquido, quantidade"),
          buscarTudo("faturados", "id, id_pedido, data_faturamento"),
          buscarTudo("tabela_custos_skus", "id, sku, marca, produto, custo_unitario"),
          buscarTudo("devolucoes", "id, pedido, canal, sku, produto, pdv, quantidade, data_retorno, custo_frete, motivo"),
          buscarTudo("cancelados", "id, canal, id_pedido, sku, quantidade, valor"),
          buscarTudo("plp_pedidos", "id, numero_pedido, canal, modalidade, valor_frete"),
          buscarTudo("tarifas_site", "id, id_pedido, valor_tarifa"),
          buscarTudo("config_regras_canais", "id, canal, col_pdv, col_quantidade, formula_excel"),
          buscarTudo("cadastros_base_tiny", "id, sku, estoque"),
          buscarTudo("status_skus_catalogo", "id, sku, status"),
          supabase.from("config_regras_tiny").select("campo, coluna").eq("campo", "imposto_global").maybeSingle(),
          carregarPaiManual(),
          supabase.from("config_regras_tiny").select("campo, coluna").like("campo", `${PREFIXO_CARRINHO}%`),
        ]);
        if (!vivo) return;
        const imp = parseFloat(String(cfg?.data?.coluna ?? "").replace(",", "."));
        setDados({ vendas, faturados, custos, devolucoes, cancelados, plp, tarifas, regras, estoque, status, impostoPct: Number.isFinite(imp) ? imp : 6 });
        setPaiManual(pai);
        setCarrinho(lerCarrinho(marcas?.data));
      } catch (e: any) {
        if (vivo) setErro(String(e?.message || e));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const custosMap = useMemo(() => montarCustosMap(dados?.custos || []), [dados]);
  const { linhasBase } = useMemo(
    () => (dados ? montarLinhasBase({ vendas: dados.vendas, faturados: dados.faturados, plp: dados.plp, tarifasSite: dados.tarifas, cancelados: dados.cancelados, regrasCanais: dados.regras, custosMap }) : { linhasBase: [] }),
    [dados, custosMap]
  );

  const hoje = hojeSP();
  const periodo = useMemo(() => periodoDoPreset(preset, hoje), [preset, hoje]);

  // canais que a pessoa pode escolher: os que aparecem nas vendas e que ela enxerga
  const canaisDisponiveis = useMemo(() => {
    const vistos = new Map<string, string>();
    linhasBase.forEach((l) => { const k = normalizarTextoLinha(l.canal); if (!vistos.has(k)) vistos.set(k, l.canal); });
    const permitidos = canaisPermitidos ? new Set(canaisPermitidos.map(normalizarTextoLinha)) : null;
    return Array.from(vistos.entries()).filter(([k]) => !permitidos || permitidos.has(k)).map(([, v]) => v).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhasBase, canaisPermitidos]);
  useEffect(() => { if (canal !== "TODOS" && !canaisDisponiveis.includes(canal)) setCanal("TODOS"); }, [canaisDisponiveis, canal]);

  const base = useMemo(() => ({
    linhas: linhasBase, custosMap, devolucoes: dados?.devolucoes || [], periodo, canaisPermitidos, canal,
    impostoPct: dados?.impostoPct ?? 6, descontarImposto,
  }), [linhasBase, custosMap, dados, periodo, canaisPermitidos, canal, descontarImposto]);

  const historico = useMemo(() => {
    const datas = linhasBase.map((l) => l.data).sort();
    return datas.length ? { inicio: datas[0], fim: datas[datas.length - 1] } : null;
  }, [linhasBase]);

  // Marca/desmarca o pedido inteiro como "em carrinho" (vale para todos os analistas). Atualiza na tela já e desfaz se o banco recusar.
  const alternarCarrinho = async (chave: string, marcar: boolean) => {
    const antes = carrinho;
    const marca: MarcaCarrinho = { por: usuarioEmail, em: new Date().toISOString() };
    setCarrinho((prev) => { const m = new Map(prev); if (marcar) m.set(chave, marca); else m.delete(chave); return m; });
    const { error } = marcar
      ? await supabase.from("config_regras_tiny").upsert({ campo: campoCarrinho(chave), coluna: serializarCarrinho(marca) }, { onConflict: "campo" })
      : await supabase.from("config_regras_tiny").delete().eq("campo", campoCarrinho(chave));
    if (error) { setCarrinho(antes); alert("Não consegui salvar a marcação: " + error.message); }
  };

  if (carregando) return <div data-analitico-carregando className={`${caixa} p-8 text-xs text-slate-400 text-center`}>Calculando as análises com as vendas, devoluções e custos…</div>;
  if (erro) return <div data-analitico-erro className="p-4 rounded-xl border border-amber-800/60 bg-amber-950/30 text-amber-200 text-xs font-semibold">⚠️ Não consegui carregar os dados: {erro}</div>;
  if (!dados) return null;

  const semPermissao = canaisPermitidos !== null && canaisPermitidos.length === 0;

  return (
    <div className="space-y-5" data-analitico={sub}>
      {/* Filtros comuns */}
      {sub !== "estoque" && (
        <div className={`${caixa} p-4 flex flex-wrap items-center gap-3`} data-filtros-analitico>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS_PERIODO.map((p) => <button key={p.id} type="button" data-periodo={p.id} onClick={() => setPreset(p.id)} className={botaoPill(preset === p.id)}>{p.nome}</button>)}
          </div>
          <select data-filtro-canal value={canal} onChange={(e) => setCanal(e.target.value)} className={campoSelect}>
            <option value="TODOS">{canaisPermitidos ? "Todos os meus canais" : "Todos os canais"}</option>
            {canaisDisponiveis.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {(sub === "canais" || sub === "prejuizo" || sub === "margem") && (
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300 cursor-pointer" title="Desconta do lucro o imposto global configurado na aba Regras">
              <input type="checkbox" data-descontar-imposto checked={descontarImposto} onChange={(e) => setDescontarImposto(e.target.checked)} className="accent-indigo-500" />
              Descontar imposto ({pctBR(dados.impostoPct, 1)})
            </label>
          )}
          <span className="text-[10px] text-slate-500 ml-auto">
            {dataBR(periodo.inicio === "0000-01-01" ? historico?.inicio : periodo.inicio)} a {dataBR(periodo.fim)}
            {historico ? ` · histórico de vendas a partir de ${dataBR(historico.inicio)}` : ""}
          </span>
        </div>
      )}

      {semPermissao && <div className="p-4 rounded-xl border border-dashed border-slate-700 text-xs text-slate-400">Você ainda não tem canais atribuídos. Peça ao administrador para marcar os seus canais.</div>}

      {!semPermissao && sub === "canais" && <PainelCanais base={base} $={$} $c={$c} />}
      {!semPermissao && sub === "prejuizo" && <PainelPrejuizo base={base} carrinho={carrinho} alternar={alternarCarrinho} $={$} $c={$c} />}
      {!semPermissao && sub === "margem" && <PainelMargem base={base} $={$} $c={$c} />}
      {!semPermissao && sub === "vendas" && <PainelVendas base={{ ...base, plp: dados.plp, paiManual }} $={$} $c={$c} />}
      {!semPermissao && sub === "estoque" && (
        <PainelEstoque linhas={linhasBase} custosMap={custosMap} estoqueBruto={dados.estoque} status={dados.status} canaisPermitidos={canaisPermitidos} canaisDisponiveis={canaisDisponiveis} hoje={hoje} $={$} $c={$c} />
      )}
    </div>
  );
}

type Moeda = (v: number) => string;

// =====================================================================================================================
// CANAIS
// =====================================================================================================================
function CartaoCanal({ r, $ }: { r: ResumoCanalAnalise; $: Moeda }) {
  const escala = 20;   // a barra enche em 20% de devolução; as marcas ficam em 5% e 10%
  const cor = r.nivelDev === "critico" ? "bg-rose-500" : r.nivelDev === "atencao" ? "bg-amber-400" : "bg-emerald-500";
  const etiqueta = r.nivelDev === "critico" ? ["Crítico", "text-rose-300 border-rose-700 bg-rose-950/40"] : r.nivelDev === "atencao" ? ["Atenção", "text-amber-200 border-amber-700 bg-amber-950/40"]
    : r.nivelDev === "ok" ? ["Saudável", "text-emerald-300 border-emerald-700 bg-emerald-950/40"] : ["Poucas vendas", "text-slate-400 border-slate-700 bg-slate-950"];
  return (
    <div data-card-canal={r.canal} className={`${caixa} p-5 space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-black text-white truncate">{r.canal}</div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${etiqueta[1]}`}>{etiqueta[0]}</span>
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-black ${r.nivelDev === "critico" ? "text-rose-400" : r.nivelDev === "atencao" ? "text-amber-300" : "text-white"}`}>{pctBR(r.taxaDevUnidades)}</span>
          <span className="text-[11px] text-slate-400">de devolução</span>
        </div>
        <div className="relative mt-2">
          <Barra valor={Math.min(r.taxaDevUnidades, escala)} max={escala} cor={cor} altura="h-2.5" />
          <span className="absolute top-0 h-2.5 w-px bg-slate-500" style={{ left: `${(LIMITE_DEV_ATENCAO / escala) * 100}%` }} title={`${LIMITE_DEV_ATENCAO}%: atenção`} />
          <span className="absolute top-0 h-2.5 w-px bg-slate-300" style={{ left: `${(LIMITE_DEV_CRITICO / escala) * 100}%` }} title={`${LIMITE_DEV_CRITICO}%: crítico`} />
        </div>
        <p className="text-[11px] text-slate-300 mt-2 leading-snug">
          {r.unidades === 0 ? "Sem vendas faturadas no período."
            : <>De cada 100 produtos vendidos, <strong className="text-white">{(r.taxaDevUnidades).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong> voltaram ({inteiro(r.devQtd)} de {inteiro(r.unidades)} unidades).</>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div><div className={rotulo}>Valor devolvido</div><div data-dev-valor className="font-black text-rose-300">{$(r.devValor)}</div><div className="text-[10px] text-slate-500">{pctBR(r.taxaDevValor)} do faturamento</div></div>
        <div><div className={rotulo}>Frete das devoluções</div><div className="font-black text-white">{$(r.devFrete)}</div><div className="text-[10px] text-slate-500">custo a mais além do produto</div></div>
        <div><div className={rotulo}>Faturamento</div><div className="font-black text-white">{$(r.faturamento)}</div><div className="text-[10px] text-slate-500">{inteiro(r.pedidos)} pedido(s)</div></div>
        <div><div className={rotulo}>Afetam a reputação</div><div className={`font-black ${r.devAfetaQtd > 0 ? "text-amber-300" : "text-emerald-400"}`}>{inteiro(r.devAfetaQtd)} un.</div><div className="text-[10px] text-slate-500">motivo diferente de arrependimento</div></div>
      </div>

      {r.motivos.length > 0 && (
        <div>
          <div className={`${rotulo} mb-1`}>Principais motivos</div>
          <ul className="space-y-1">
            {r.motivos.slice(0, 3).map((m) => (
              <li key={m.motivo} className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.afeta ? "bg-rose-400" : "bg-emerald-400"}`} />
                <span className="truncate flex-1" title={m.motivo}>{m.motivo}</span>
                <span className="font-bold text-white">{m.qtd}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.topDevolvidos.length > 0 && (
        <div>
          <div className={`${rotulo} mb-1`}>Mais devolvidos</div>
          <ul className="space-y-1">
            {r.topDevolvidos.slice(0, 3).map((t) => (
              <li key={t.sku} className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className="font-mono text-indigo-300 flex-shrink-0">{t.sku}</span>
                <span className="truncate flex-1" title={t.titulo}>{t.titulo}</span>
                <span className="font-bold text-white flex-shrink-0">{t.qtd} un. · {$(t.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PainelCanais({ base, $, $c }: { base: any; $: Moeda; $c: Moeda }) {
  const canais = useMemo(() => analisarCanais(base), [base]);

  const tot = useMemo(() => {
    const fat = canais.reduce((a, c) => a + c.faturamento, 0), un = canais.reduce((a, c) => a + c.unidades, 0);
    const devQ = canais.reduce((a, c) => a + c.devQtd, 0), devV = canais.reduce((a, c) => a + c.devValor, 0);
    const pL = canais.reduce((a, c) => a + c.prejuizoLinhas, 0), pV = canais.reduce((a, c) => a + c.prejuizoValor, 0);
    const lucro = canais.reduce((a, c) => a + c.lucro, 0);
    const fatCusto = canais.reduce((a, c) => a + c.faturamentoComCusto, 0);
    return { fat, un, devQ, devV, pL, pV, lucro, margem: fatCusto > 0 ? (lucro / fatCusto) * 100 : null };
  }, [canais]);

  if (canais.length === 0) return <div className={`${caixa} p-6 text-xs text-slate-400 text-center`}>Nenhuma venda faturada neste período e nos canais escolhidos.</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4" data-kpis-canais>
        <Kpi titulo="Faturamento do período" valor={$c(tot.fat)} detalhe={`${inteiro(tot.un)} unidades vendidas`} />
        <Kpi titulo="Devolvido" valor={$c(tot.devV)} cor="text-rose-300" detalhe={`${inteiro(tot.devQ)} unidade(s) · ${pctBR(tot.fat > 0 ? (tot.devV / tot.fat) * 100 : 0)} do faturamento`} />
        <Kpi titulo="Vendas no prejuízo" valor={inteiro(tot.pL)} cor={tot.pL > 0 ? "text-amber-300" : "text-emerald-400"} detalhe={`${$c(tot.pV)} de prejuízo somado · detalhes na sub-aba “Vendas no prejuízo”`} />
        <Kpi titulo="Lucro líquido (depois das devoluções)" valor={$c(tot.lucro)} cor={corMargem(tot.margem)} detalhe={tot.margem === null ? "sem custo cadastrado" : `${pctBR(tot.margem)} de margem sobre as vendas com custo`} />
      </div>

      <div className={`${caixa} p-5`}>
        <h3 className="text-sm font-black text-white">↩️ Devolução em cada canal</h3>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          O índice é <strong className="text-slate-200">unidades devolvidas ÷ unidades vendidas</strong> no período (a devolução entra pela data em que o produto voltou). Verde: abaixo de {LIMITE_DEV_ATENCAO}%. Amarelo: de {LIMITE_DEV_ATENCAO}% a {LIMITE_DEV_CRITICO}%. Vermelho: a partir de {LIMITE_DEV_CRITICO}%.
          Canais com menos de {AMOSTRA_MIN_DEV} unidades vendidas aparecem como “poucas vendas”, porque um único retorno distorce o percentual.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4" data-cards-canais>
        {canais.map((r) => <CartaoCanal key={r.canal} r={r} $={$} />)}
      </div>
    </div>
  );
}

// =====================================================================================================================
// VENDAS NO PREJUÍZO (com "Pedido em carrinho")
// =====================================================================================================================
function PainelPrejuizo({ base, carrinho, alternar, $, $c }: { base: any; carrinho: Map<string, MarcaCarrinho>; alternar: (chave: string, marcar: boolean) => void; $: Moeda; $c: Moeda }) {
  const [verTodos, setVerTodos] = useState(false);
  const [esconderCarrinho, setEsconderCarrinho] = useState(false);

  // todas as vendas no prejuízo (inclusive as marcadas), para a pessoa poder desmarcar
  const todas = useMemo(() => listarVendasNoPrejuizo(base), [base]);
  // o cálculo desta aba ignora os pedidos em carrinho
  const canais = useMemo(() => analisarCanais({ ...base, linhas: base.linhas.filter((l: any) => !carrinho.has(l.chave)) }), [base, carrinho]);
  const ativas = useMemo(() => todas.filter((v) => !carrinho.has(v.chave)), [todas, carrinho]);
  const marcadas = useMemo(() => todas.filter((v) => carrinho.has(v.chave)), [todas, carrinho]);
  const pedidosMarcados = useMemo(() => new Set(marcadas.map((v) => v.chave)).size, [marcadas]);

  const tot = useMemo(() => ({
    linhas: canais.reduce((a, c) => a + c.prejuizoLinhas, 0),
    valor: canais.reduce((a, c) => a + c.prejuizoValor, 0),
    estimadas: canais.reduce((a, c) => a + c.prejuizoEstimadoLinhas, 0),
    semCusto: canais.reduce((a, c) => a + c.semCustoLinhas, 0),
  }), [canais]);
  const valorMarcadas = marcadas.reduce((a, v) => a - v.resultado, 0);
  const maxPrej = Math.max(...canais.map((c) => c.prejuizoValor), 0);

  // as ativas primeiro (da pior para a menos pior); as marcadas vão para o fim
  const ordenadas = esconderCarrinho ? ativas : [...ativas, ...marcadas];
  const lista = verTodos ? ordenadas : ordenadas.slice(0, 15);

  return (
    <div className="space-y-5" data-painel-prejuizo>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4" data-kpis-prejuizo>
        <Kpi titulo="Vendas no prejuízo" valor={inteiro(tot.linhas)} cor={tot.linhas > 0 ? "text-amber-300" : "text-emerald-400"} detalhe="itens de pedido, fora os pedidos em carrinho" />
        <Kpi titulo="Prejuízo somado" valor={$c(tot.valor)} cor={tot.valor > 0 ? "text-rose-300" : "text-emerald-400"} detalhe="antes das devoluções" />
        <Kpi titulo="Pedidos em carrinho" valor={inteiro(pedidosMarcados)} detalhe={`${$c(valorMarcadas)} que deixaram de contar como prejuízo`} />
        <Kpi titulo="Repasse estimado" valor={inteiro(tot.estimadas)} cor={tot.estimadas > 0 ? "text-amber-300" : "text-white"} detalhe="vendas no prejuízo em que a planilha veio sem o repasse (usamos 16%)" />
      </div>

      <div className={`${caixa} p-5 space-y-4`} data-prejuizo>
        <div>
          <h3 className="text-sm font-black text-white">⚠️ Possíveis vendas no prejuízo</h3>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            São os itens de pedido em que <strong className="text-slate-200">repasse − custo do produto − frete Flex/tarifa</strong> deu negativo: a mesma conta que alimenta o Dashboard, antes de devoluções.
            “Possíveis” porque o repasse pode ser uma estimativa (quando a planilha veio sem o valor, usamos 16% de taxa) e porque o custo cadastrado pode estar defasado. Vendas de SKU sem custo cadastrado ficam de fora, pois o lucro delas não dá para calcular.
          </p>
          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
            Marque <strong className="text-slate-200">Pedido em carrinho</strong> nos pedidos que não são prejuízo de verdade: o pedido inteiro sai do cálculo desta aba, para todos os analistas, e dá para desmarcar quando quiser.
          </p>
        </div>

        {canais.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" data-tabela-prejuizo-canais>
              <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3">Canal</th><th className="py-2 pr-3 text-right">Vendas no prejuízo</th><th className="py-2 pr-3 text-right">% das vendas</th><th className="py-2 pr-3 text-right">Prejuízo somado</th><th className="py-2 pr-3 w-40"></th><th className="py-2 text-right">Sem custo cadastrado</th>
              </tr></thead>
              <tbody>
                {canais.map((c) => (
                  <tr key={c.canal} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3 font-bold text-white">{c.canal}</td>
                    <td className={`py-2 pr-3 text-right font-bold ${c.prejuizoLinhas > 0 ? "text-amber-300" : "text-slate-400"}`}>{inteiro(c.prejuizoLinhas)}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{pctBR(c.prejuizoPct)}</td>
                    <td className={`py-2 pr-3 text-right font-bold ${c.prejuizoValor > 0 ? "text-rose-300" : "text-slate-400"}`}>{$(c.prejuizoValor)}</td>
                    <td className="py-2 pr-3"><Barra valor={c.prejuizoValor} max={maxPrej} cor="bg-rose-500" /></td>
                    <td className="py-2 text-right text-slate-500">{inteiro(c.semCustoLinhas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {todas.length === 0 ? (
          <p className="text-xs text-emerald-400 font-bold">✅ Nenhuma venda no prejuízo neste período.</p>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <div className={rotulo}>{verTodos ? `Todas as ${ordenadas.length} vendas` : `As ${lista.length} piores de ${ordenadas.length}`}</div>
              {marcadas.length > 0 && (
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-300 cursor-pointer ml-auto">
                  <input type="checkbox" data-esconder-carrinho checked={esconderCarrinho} onChange={(e) => setEsconderCarrinho(e.target.checked)} className="accent-indigo-500" />
                  Esconder pedidos em carrinho
                </label>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left whitespace-nowrap" data-tabela-prejuizo>
                <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Pedido em carrinho</th><th className="py-2 pr-3">Pedido</th><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Canal</th><th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3 text-right">Preço</th><th className="py-2 pr-3 text-right">Repasse</th><th className="py-2 pr-3 text-right">Custo</th><th className="py-2 pr-3 text-right">Frete/tarifa</th><th className="py-2 text-right">Resultado</th>
                </tr></thead>
                <tbody>
                  {lista.map((v, i) => {
                    const marca = carrinho.get(v.chave);
                    return (
                      <tr key={`${v.chave}-${v.sku}-${i}`} data-linha-prejuizo data-em-carrinho={marca ? "1" : "0"} className={`border-b border-slate-800/60 ${marca ? "opacity-50" : ""}`}>
                        <td className="py-2 pr-3 text-center">
                          <input type="checkbox" data-carrinho-check checked={!!marca} onChange={(e) => alternar(v.chave, e.target.checked)} className="accent-indigo-500 cursor-pointer"
                            title={marca ? `Marcado${marca.por ? " por " + marca.por : ""}${marca.em ? " em " + dataBR(marca.em) : ""}` : "Marcar este pedido como pedido em carrinho"} aria-label={`Pedido ${v.pedido} em carrinho`} />
                        </td>
                        <td className="py-2 pr-3 font-mono text-slate-300">{v.pedido}</td>
                        <td className="py-2 pr-3 text-slate-400">{dataBR(v.data)}</td>
                        <td className="py-2 pr-3 text-slate-300">{v.canal}</td>
                        <td className="py-2 pr-3 max-w-[22rem] truncate" title={v.titulo}><span className="font-mono text-indigo-300 mr-2">{v.sku}</span><span className="text-slate-200">{v.titulo}</span>{v.repasseEstimado && <span className="ml-2 text-[9px] font-bold text-amber-300 border border-amber-700 rounded px-1">repasse estimado</span>}</td>
                        <td className="py-2 pr-3 text-right text-slate-200">{$(v.preco)}</td>
                        <td className="py-2 pr-3 text-right text-slate-200">{$(v.repasse)}</td>
                        <td className="py-2 pr-3 text-right text-slate-200">{$(v.cmv)}</td>
                        <td className="py-2 pr-3 text-right text-slate-200">{$(v.extra)}</td>
                        <td className={`py-2 text-right font-black ${marca ? "text-slate-400 line-through" : "text-rose-400"}`}>{$(v.resultado)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {ordenadas.length > 15 && <button type="button" onClick={() => setVerTodos((v) => !v)} className="mt-3 text-[11px] text-slate-400 underline hover:text-white cursor-pointer">{verTodos ? "mostrar só as piores" : `ver todas as ${ordenadas.length}`}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================================================================
// MARGEM LÍQUIDA
// =====================================================================================================================
function PainelMargem({ base, $, $c }: { base: any; $: Moeda; $c: Moeda }) {
  const { produtos, marcas } = useMemo(() => analisarMargens(base), [base]);
  const [visao, setVisao] = useState<"produto" | "marca">("produto");
  const [marca, setMarca] = useState("TODAS");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"faturamento" | "lucro" | "margem_desc" | "margem_asc" | "qtd">("faturamento");
  const [limite, setLimite] = useState(50);

  const nomesMarcas = useMemo(() => marcas.map((m) => m.marca).sort((a, b) => a.localeCompare(b, "pt-BR")), [marcas]);
  const termo = normalizarTextoLinha(busca);
  const filtrados = useMemo(() => {
    const lista = produtos.filter((p) => (marca === "TODAS" || p.marca === marca) && (!termo || normalizarTextoLinha(p.titulo).includes(termo) || normalizarSkuLinha(p.sku).includes(normalizarSkuLinha(termo) || "§")));
    const chave: Record<string, (p: any) => number> = {
      faturamento: (p) => p.faturamento, lucro: (p) => p.lucro, qtd: (p) => p.qtd,
      margem_desc: (p) => (p.margem === null ? -Infinity : p.margem), margem_asc: (p) => (p.margem === null ? Infinity : -p.margem),
    };
    return lista.slice().sort((a, b) => chave[ordem](b) - chave[ordem](a));
  }, [produtos, marca, termo, ordem]);
  const marcasFiltradas = useMemo(() => marcas.filter((m) => !termo || normalizarTextoLinha(m.marca).includes(termo)).sort((a, b) => (ordem === "lucro" ? b.lucro - a.lucro : ordem === "qtd" ? b.qtd - a.qtd : ordem === "margem_desc" ? (b.margem ?? -Infinity) - (a.margem ?? -Infinity) : ordem === "margem_asc" ? (a.margem ?? Infinity) - (b.margem ?? Infinity) : b.faturamento - a.faturamento)), [marcas, termo, ordem]);
  useEffect(() => { setLimite(50); }, [visao, marca, termo, ordem]);

  const resumo = useMemo(() => {
    const comCusto = produtos.filter((p) => !p.semCusto);
    const fat = comCusto.reduce((s, p) => s + p.faturamento, 0), luc = comCusto.reduce((s, p) => s + p.lucro, 0);
    return {
      fat: produtos.reduce((s, p) => s + p.faturamento, 0), lucro: luc, margem: fat > 0 ? (luc / fat) * 100 : null,
      semCusto: produtos.filter((p) => p.semCusto).length, negativos: comCusto.filter((p) => p.lucro < 0).length,
    };
  }, [produtos]);

  if (produtos.length === 0) return <div className={`${caixa} p-6 text-xs text-slate-400 text-center`}>Nenhuma venda faturada neste período e nos canais escolhidos.</div>;

  const cab = (id: typeof ordem, texto: string) => <th className="py-2 pr-3 text-right"><button type="button" onClick={() => setOrdem(id)} className={`uppercase cursor-pointer ${ordem === id ? "text-indigo-300" : "hover:text-white"}`}>{texto}{ordem === id ? " ↓" : ""}</button></th>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi titulo="Margem líquida do período" valor={pctBR(resumo.margem)} cor={corMargem(resumo.margem)} detalhe={`lucro de ${$c(resumo.lucro)} sobre as vendas com custo cadastrado`} />
        <Kpi titulo="Faturamento" valor={$c(resumo.fat)} detalhe={`${inteiro(produtos.length)} produto(s) (SKU) vendidos`} />
        <Kpi titulo="Produtos com prejuízo" valor={inteiro(resumo.negativos)} cor={resumo.negativos > 0 ? "text-rose-400" : "text-emerald-400"} detalhe="lucro total do SKU negativo no período" />
        <Kpi titulo="Sem custo cadastrado" valor={inteiro(resumo.semCusto)} cor={resumo.semCusto > 0 ? "text-amber-300" : "text-emerald-400"} detalhe="a margem deles não é calculada (ficaria inflada)" />
      </div>

      <div className={`${caixa} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            <button type="button" data-visao-margem="produto" onClick={() => setVisao("produto")} className={botaoPill(visao === "produto")}>Por produto (SKU)</button>
            <button type="button" data-visao-margem="marca" onClick={() => setVisao("marca")} className={botaoPill(visao === "marca")}>Por marca</button>
          </div>
          {visao === "produto" && (
            <select value={marca} onChange={(e) => setMarca(e.target.value)} className={campoSelect} data-filtro-marca>
              <option value="TODAS">Todas as marcas</option>
              {nomesMarcas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={visao === "produto" ? "Buscar SKU ou nome…" : "Buscar marca…"} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none w-56" />
          <span className="text-[10px] text-slate-500 ml-auto">{visao === "produto" ? `${inteiro(filtrados.length)} produto(s)` : `${inteiro(marcasFiltradas.length)} marca(s)`}</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-slate-200">Lucro líquido = repasse do canal − custo do produto − frete Flex/tarifa − valor devolvido</strong> (a mesma conta da Curva ABC){base.descontarImposto ? <>, menos o imposto de {pctBR(base.impostoPct, 1)} sobre a venda</> : <>. Não inclui imposto nem Ads; marque “Descontar imposto” acima para incluir o imposto</>}.
          Margem = lucro ÷ faturamento.
        </p>

        <div className="overflow-x-auto">
          {visao === "produto" ? (
            <table className="w-full text-xs text-left whitespace-nowrap" data-tabela-margem-produto>
              <thead><tr className="text-[10px] text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3 uppercase">Produto</th><th className="py-2 pr-3 uppercase">Marca</th>{cab("qtd", "Un.")}{cab("faturamento", "Faturamento")}
                <th className="py-2 pr-3 text-right uppercase">Custo (CMV)</th><th className="py-2 pr-3 text-right uppercase">Frete/tarifa</th><th className="py-2 pr-3 text-right uppercase">Devolvido</th>
                {cab("lucro", "Lucro líquido")}{cab("margem_desc", "Margem")}
              </tr></thead>
              <tbody>
                {filtrados.slice(0, limite).map((p) => (
                  <tr key={p.skuNorm} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 max-w-[24rem] truncate" title={p.titulo}><span className="font-mono text-indigo-300 mr-2">{p.sku}</span><span className="text-slate-200">{p.titulo}</span></td>
                    <td className="py-2 pr-3 text-slate-400">{p.marca}</td>
                    <td className="py-2 pr-3 text-right text-slate-200">{inteiro(p.qtd)}</td>
                    <td className="py-2 pr-3 text-right text-slate-200">{$(p.faturamento)}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{p.semCusto ? <span className="text-amber-300 text-[10px] font-bold">sem custo</span> : $(p.cmv)}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{$(p.extra)}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{p.devValor > 0 ? $(p.devValor) : "—"}</td>
                    <td className={`py-2 pr-3 text-right font-bold ${p.semCusto ? "text-slate-500" : p.lucro < 0 ? "text-rose-400" : "text-white"}`}>{p.semCusto ? "—" : $(p.lucro)}</td>
                    <td className={`py-2 text-right font-black ${corMargem(p.margem)}`}>{pctBR(p.margem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs text-left whitespace-nowrap" data-tabela-margem-marca>
              <thead><tr className="text-[10px] text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3 uppercase">Marca</th><th className="py-2 pr-3 text-right uppercase">SKUs</th>{cab("qtd", "Un.")}{cab("faturamento", "Faturamento")}
                <th className="py-2 pr-3 text-right uppercase">Custo (CMV)</th><th className="py-2 pr-3 text-right uppercase">Devolvido</th>{cab("lucro", "Lucro líquido")}{cab("margem_desc", "Margem")}
              </tr></thead>
              <tbody>
                {marcasFiltradas.map((m) => (
                  <tr key={m.marca} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-2 pr-3 font-bold text-white">{m.marca}{m.semCustoSkus > 0 && <span className="ml-2 text-[9px] font-bold text-amber-300 border border-amber-700 rounded px-1" title="A margem considera só os SKUs com custo">{m.semCustoSkus} sem custo</span>}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{inteiro(m.skus)}</td>
                    <td className="py-2 pr-3 text-right text-slate-200">{inteiro(m.qtd)}</td>
                    <td className="py-2 pr-3 text-right text-slate-200">{$(m.faturamento)}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{$(m.cmv)}</td>
                    <td className="py-2 pr-3 text-right text-slate-300">{m.devValor > 0 ? $(m.devValor) : "—"}</td>
                    <td className={`py-2 pr-3 text-right font-bold ${m.lucro < 0 ? "text-rose-400" : "text-white"}`}>{$(m.lucro)}</td>
                    <td className={`py-2 text-right font-black ${corMargem(m.margem)}`}>{pctBR(m.margem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {visao === "produto" && filtrados.length > limite && (
          <button type="button" onClick={() => setLimite((l) => l + 50)} className="text-[11px] text-slate-400 underline hover:text-white cursor-pointer">mostrar mais 50 ({filtrados.length - limite} restantes)</button>
        )}
      </div>
    </div>
  );
}

// =====================================================================================================================
// DASHBOARD DE VENDAS
// =====================================================================================================================
function PainelVendas({ base, $, $c }: { base: any; $: Moeda; $c: Moeda }) {
  const d = useMemo(() => analisarDashboard(base, 10), [base]);
  const [rank, setRank] = useState<"produto" | "sku">("produto");
  const [metrica, setMetrica] = useState<"qtd" | "faturamento">("qtd");
  const [serie, setSerie] = useState<"unidades" | "faturamento">("unidades");

  if (d.pedidosTotal === 0) return <div className={`${caixa} p-6 text-xs text-slate-400 text-center`}>Nenhuma venda faturada neste período e nos canais escolhidos.</div>;

  const itens = (rank === "produto" ? d.produtos : d.skus).slice().sort((a, b) => (metrica === "qtd" ? b.qtd - a.qtd : b.faturamento - a.faturamento));
  const maxItem = Math.max(...itens.map((i) => (metrica === "qtd" ? i.qtd : i.faturamento)), 1);
  const maxDia = Math.max(...d.porDia.map((x) => (serie === "unidades" ? x.unidades : x.faturamento)), 1);
  const maxMod = Math.max(...d.modalidades.map((m) => m.pedidos), 1);
  const maxPal = Math.max(...d.palavras.map((p) => p.unidades), 1);
  const maxCanal = Math.max(...d.canais.map((c) => c.faturamento), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4" data-kpis-vendas>
        <Kpi titulo="Faturamento" valor={$c(d.faturamentoTotal)} />
        <Kpi titulo="Unidades vendidas" valor={inteiro(d.unidadesTotal)} />
        <Kpi titulo="Pedidos" valor={inteiro(d.pedidosTotal)} />
        <Kpi titulo="Ticket médio" valor={$(d.pedidosTotal > 0 ? d.faturamentoTotal / d.pedidosTotal : 0)} detalhe="faturamento ÷ pedidos" />
      </div>

      <div className={`${caixa} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-black text-white">📈 Vendas por dia</h3>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setSerie("unidades")} className={botaoPill(serie === "unidades")}>Unidades</button>
            <button type="button" onClick={() => setSerie("faturamento")} className={botaoPill(serie === "faturamento")}>Faturamento</button>
          </div>
        </div>
        <div className="flex items-end gap-[3px] h-40" data-grafico-dias>
          {d.porDia.map((x) => {
            const v = serie === "unidades" ? x.unidades : x.faturamento;
            return <div key={x.data} className="flex-1 min-w-[3px] bg-indigo-500/80 hover:bg-indigo-400 rounded-t" style={{ height: `${Math.max(2, (v / maxDia) * 100)}%` }}
              title={`${dataBR(x.data)}: ${inteiro(x.unidades)} un. · ${$(x.faturamento)} · ${x.pedidos} pedido(s)`} />;
          })}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>{dataBR(d.porDia[0]?.data)}</span><span>{dataBR(d.porDia[d.porDia.length - 1]?.data)}</span></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className={`${caixa} p-5`} data-mais-vendidos>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h3 className="text-sm font-black text-white">🏆 Produtos mais vendidos</h3>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setRank("produto")} className={botaoPill(rank === "produto")}>Produto (SKU pai)</button>
              <button type="button" onClick={() => setRank("sku")} className={botaoPill(rank === "sku")}>SKU</button>
              <button type="button" onClick={() => setMetrica(metrica === "qtd" ? "faturamento" : "qtd")} className={botaoPill(false)}>{metrica === "qtd" ? "por unidades" : "por faturamento"} ⇄</button>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mb-3">{rank === "produto" ? "Agrupa as variações (cor, tamanho) de um mesmo produto pelo SKU pai." : "Cada variação separada."} Top 10 de {inteiro(rank === "produto" ? d.totalProdutos : d.totalSkus)}.</p>
          <ol className="space-y-2.5">
            {itens.map((i, n) => (
              <li key={i.chave}>
                <div className="flex items-baseline gap-2 text-[11px]">
                  <span className="text-slate-500 w-5 text-right">{n + 1}</span>
                  <span className="text-slate-200 truncate flex-1" title={i.nome}>{i.nome}</span>
                  <span className="font-black text-white flex-shrink-0">{metrica === "qtd" ? `${inteiro(i.qtd)} un.` : $(i.faturamento)}</span>
                </div>
                <div className="pl-7"><Barra valor={metrica === "qtd" ? i.qtd : i.faturamento} max={maxItem} /></div>
                <div className="pl-7 text-[10px] text-slate-500">{i.marca}{rank === "produto" && i.variacoes > 1 ? ` · ${i.variacoes} variações` : ""} · {metrica === "qtd" ? $(i.faturamento) : `${inteiro(i.qtd)} un.`}</div>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-5">
          <div className={`${caixa} p-5`} data-modalidades>
            <h3 className="text-sm font-black text-white mb-1">🚚 Modalidade mais vendida</h3>
            <p className="text-[10px] text-slate-500 mb-3">Como o pedido foi enviado (Agência, Flex, Correios), conforme a aba PLP. {d.semModalidadePct > 0 ? `${pctBR(d.semModalidadePct, 0)} dos pedidos não têm modalidade informada.` : ""}</p>
            <ul className="space-y-3">
              {d.modalidades.map((m) => (
                <li key={m.modalidade}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className={m.modalidade === SEM_MODALIDADE ? "text-slate-500" : "text-slate-200 font-bold"}>{m.modalidade}</span>
                    <span className="text-slate-300"><strong className="text-white">{inteiro(m.pedidos)}</strong> pedidos ({pctBR(m.pctPedidos, 0)}) · {$(m.faturamento)}</span>
                  </div>
                  <Barra valor={m.pedidos} max={maxMod} cor={m.modalidade === SEM_MODALIDADE ? "bg-slate-600" : "bg-cyan-500"} />
                </li>
              ))}
            </ul>
          </div>
          <div className={`${caixa} p-5`} data-por-canal>
            <h3 className="text-sm font-black text-white mb-3">🛒 Faturamento por canal</h3>
            <ul className="space-y-3">
              {d.canais.map((c) => (
                <li key={c.canal}>
                  <div className="flex items-baseline justify-between text-[11px]"><span className="text-slate-200 font-bold">{c.canal}</span><span className="text-slate-300">{$(c.faturamento)} · {inteiro(c.unidades)} un.</span></div>
                  <Barra valor={c.faturamento} max={maxCanal} cor="bg-emerald-500" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className={`${caixa} p-5`} data-palavras-chave>
        <h3 className="text-sm font-black text-white mb-1">🔑 Palavras-chave dos títulos que mais vendem</h3>
        <p className="text-[10px] text-slate-500 mb-4">Conta as unidades vendidas de todos os produtos cujo título tem a palavra (cada palavra conta uma vez por venda; sem artigos, números, “kit”, “original” etc.). Mostra o que o cliente está comprando, como “bolsa”, “farm” ou “pochete”.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
          {d.palavras.map((p, n) => (
            <div key={p.palavra}>
              <div className="flex items-baseline gap-2 text-[11px]">
                <span className="text-slate-500 w-5 text-right">{n + 1}</span>
                <span className="text-slate-100 font-bold flex-1">{p.palavra}</span>
                <span className="text-slate-300"><strong className="text-white">{inteiro(p.unidades)}</strong> un. · {pctBR(p.pctUnidades, 0)} · {inteiro(p.produtos)} produto(s)</span>
              </div>
              <div className="pl-7"><Barra valor={p.unidades} max={maxPal} cor="bg-violet-500" altura="h-1.5" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =====================================================================================================================
// ESTOQUE PARADO
// =====================================================================================================================
function csvDoEstoque(linhas: SkuParado[]): string {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cab = ["SKU", "Produto", "Marca", "Estoque", "Custo unitário", "Capital parado", "Última venda", "Dias sem vender", "Status no catálogo", "Prioridade", "Ação sugerida"];
  const f = (n: number) => n.toFixed(2).replace(".", ",");
  return "﻿" + [cab.map(esc).join(";"), ...linhas.map((s) => [s.sku, s.titulo, s.marca, s.estoque, f(s.custo), f(s.capitalParado), s.ultimaVenda ? dataBR(s.ultimaVenda) : "nunca (no histórico)", s.diasSemVender ?? "", s.statusCatalogo, s.prioridade, s.acao].map(esc).join(";"))].join("\r\n");
}

function PainelEstoque({ linhas, custosMap, estoqueBruto, status, canaisPermitidos, canaisDisponiveis, hoje, $, $c }: {
  linhas: any[]; custosMap: any; estoqueBruto: any[]; status: any[]; canaisPermitidos: string[] | null; canaisDisponiveis: string[]; hoje: string; $: Moeda; $c: Moeda;
}) {
  const [canal, setCanal] = useState("TODOS");
  const [dias, setDias] = useState(DIAS_ESTOQUE_PARADO);
  const [marca, setMarca] = useState("TODAS");
  const [busca, setBusca] = useState("");
  const [prioridade, setPrioridade] = useState<"todas" | "alta" | "media" | "baixa">("todas");
  const [limite, setLimite] = useState(50);

  const estoque = useMemo(() => mapaEstoque(estoqueBruto), [estoqueBruto]);
  const statusMap = useMemo(() => { const m = new Map<string, string>(); status.forEach((s) => { const k = normalizarSkuLinha(s.sku); if (k) m.set(k, String(s.status ?? "")); }); return m; }, [status]);
  const r = useMemo(() => analisarEstoqueParado({ linhas, custosMap, estoque, statusCatalogo: statusMap, canaisPermitidos, canal, hoje, dias }), [linhas, custosMap, estoque, statusMap, canaisPermitidos, canal, hoje, dias]);

  const marcas = useMemo(() => Array.from(new Set(r.skus.map((s) => s.marca))).sort((a, b) => a.localeCompare(b, "pt-BR")), [r]);
  const termo = normalizarTextoLinha(busca);
  const filtrados = useMemo(() => r.skus.filter((s) => (marca === "TODAS" || s.marca === marca) && (prioridade === "todas" || s.prioridade === prioridade)
    && (!termo || normalizarTextoLinha(s.titulo).includes(termo) || normalizarSkuLinha(s.sku).includes(normalizarSkuLinha(termo) || "§"))), [r, marca, prioridade, termo]);
  useEffect(() => { setLimite(50); }, [canal, dias, marca, prioridade, termo]);

  const capital = filtrados.reduce((a, s) => a + s.capitalParado, 0);
  const unidades = filtrados.reduce((a, s) => a + s.estoque, 0);
  const semCustoCount = filtrados.filter((s) => !(s.custo > 0)).length;
  const corPrio = { alta: "text-rose-300 border-rose-700 bg-rose-950/40", media: "text-amber-200 border-amber-700 bg-amber-950/40", baixa: "text-slate-300 border-slate-700 bg-slate-950" } as const;
  const nomePrio = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

  const baixar = () => {
    const url = URL.createObjectURL(new Blob([csvDoEstoque(filtrados)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `estoque-parado-${hoje}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className={`${caixa} p-4 flex flex-wrap items-center gap-3`} data-filtros-estoque>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className={campoSelect} data-filtro-dias>
          {[30, 45, 60, 90].map((n) => <option key={n} value={n}>Sem vender há mais de {n} dias</option>)}
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className={campoSelect}>
          <option value="TODOS">{canaisPermitidos ? "Nos meus canais" : "Em todos os canais"}</option>
          {canaisDisponiveis.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={marca} onChange={(e) => setMarca(e.target.value)} className={campoSelect}>
          <option value="TODAS">Todas as marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as any)} className={campoSelect}>
          <option value="todas">Todas as prioridades</option><option value="alta">Prioridade alta</option><option value="media">Prioridade média</option><option value="baixa">Prioridade baixa</option>
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar SKU ou nome…" className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none w-52" />
        <button type="button" onClick={baixar} disabled={filtrados.length === 0} className="ml-auto px-3 py-2 rounded-lg text-[11px] font-bold border border-slate-700 bg-slate-950 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer">⬇ Baixar planilha (CSV)</button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4" data-kpis-estoque>
        <Kpi titulo="SKUs parados" valor={inteiro(filtrados.length)} cor={filtrados.length > 0 ? "text-amber-300" : "text-emerald-400"} detalhe={`de ${inteiro(r.totalComEstoque)} SKUs com estoque`} />
        <Kpi titulo="Dinheiro parado" valor={$c(capital)} cor="text-rose-300" detalhe="estoque × custo unitário" />
        <Kpi titulo="Unidades paradas" valor={inteiro(unidades)} />
        <Kpi titulo="Nunca venderam no histórico" valor={inteiro(filtrados.filter((s) => s.ultimaVenda === null).length)} detalhe={r.inicioHistorico ? `histórico de vendas desde ${dataBR(r.inicioHistorico)}` : undefined} />
      </div>

      <div className={`${caixa} p-5 space-y-4`}>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          SKUs que <strong className="text-slate-200">têm estoque no Tiny</strong> e <strong className="text-slate-200">não tiveram nenhuma venda faturada</strong> {canal === "TODOS" ? (canaisPermitidos ? "nos seus canais" : "em nenhum canal") : `no canal ${canal}`} nos últimos {dias} dias.
          A venda considera a data de faturamento e ignora pedidos cancelados. O histórico de vendas do sistema começa em {dataBR(r.inicioHistorico)}, então “nunca vendeu” quer dizer “nenhuma venda desde essa data”.
          {semCustoCount > 0 && <> {semCustoCount} SKU(s) estão sem custo cadastrado e aparecem com R$ 0 de dinheiro parado.</>}
        </p>
        {filtrados.length === 0 ? (
          <p className="text-xs text-emerald-400 font-bold">✅ Nenhum SKU com estoque parado há mais de {dias} dias com esses filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left" data-tabela-estoque>
              <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3">Produto</th><th className="py-2 pr-3">Marca</th><th className="py-2 pr-3 text-right">Estoque</th><th className="py-2 pr-3 text-right">Dinheiro parado</th>
                <th className="py-2 pr-3">Última venda</th><th className="py-2 pr-3 text-right">Dias parado</th><th className="py-2 pr-3">Prioridade</th><th className="py-2">O que fazer</th>
              </tr></thead>
              <tbody>
                {filtrados.slice(0, limite).map((s) => (
                  <tr key={s.skuNorm} className="border-b border-slate-800/60 align-top hover:bg-slate-800/30">
                    <td className="py-2 pr-3 max-w-[20rem]"><span className="font-mono text-indigo-300 mr-2">{s.sku}</span><span className="text-slate-200">{s.titulo}</span>
                      {normalizarTextoLinha(s.statusCatalogo) === "obsoleto" && <span className="ml-2 text-[9px] font-bold text-rose-300 border border-rose-700 rounded px-1">obsoleto</span>}</td>
                    <td className="py-2 pr-3 text-slate-400 whitespace-nowrap">{s.marca}</td>
                    <td className="py-2 pr-3 text-right font-bold text-white">{inteiro(s.estoque)}</td>
                    <td className="py-2 pr-3 text-right text-rose-300 font-bold whitespace-nowrap">{s.custo > 0 ? $(s.capitalParado) : <span className="text-slate-500 font-normal">sem custo</span>}</td>
                    <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{s.ultimaVenda ? dataBR(s.ultimaVenda) : <span className="text-slate-500">nunca</span>}</td>
                    <td className="py-2 pr-3 text-right text-slate-200 whitespace-nowrap">{s.diasSemVender ?? `+${r.inicioHistorico ? Math.max(0, Math.round((Date.parse(hoje) - Date.parse(r.inicioHistorico)) / 86_400_000)) : "—"}`}</td>
                    <td className="py-2 pr-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${corPrio[s.prioridade]}`}>{nomePrio[s.prioridade]}</span></td>
                    <td className="py-2 text-slate-300 min-w-[18rem]">{s.acao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtrados.length > limite && <button type="button" onClick={() => setLimite((l) => l + 50)} className="text-[11px] text-slate-400 underline hover:text-white cursor-pointer">mostrar mais 50 ({filtrados.length - limite} restantes)</button>}
      </div>
    </div>
  );
}
