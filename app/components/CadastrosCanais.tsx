"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { normalizarNomeCanal } from "../../lib/vendasCanaisLogica";
import { agruparPorPai, statusDoGrupo, paginar, emLotes, type Presenca } from "../../lib/cadastroCanais";
import Paginacao from "./Paginacao";

type Avisar = (tipo: "ok" | "erro", texto: string) => void;

interface Props {
  cadastros: any[];
  setCadastros: React.Dispatch<React.SetStateAction<any[]>>;
  /** canais que contam (já sem os ocultos no Mapa de Cadastros) */
  canais: string[];
  presenca: Presenca;
  pesquisa: string;
  canaisOcultos: number;
  recarregar: () => Promise<void>;
  avisar: Avisar;
  ocupado: boolean;
  setOcupado: (b: boolean) => void;
}


/** Devolve o `canais_enviados` com o canal marcado/desmarcado (sem deixar duplicatas de maiúscula/acento). */
function comCanal(ce: Record<string, boolean> | null | undefined, canal: string, valor: boolean) {
  const k = normalizarNomeCanal(canal);
  const novo: Record<string, boolean> = {};
  for (const [c, v] of Object.entries(ce || {})) if (normalizarNomeCanal(c) !== k) novo[c] = v;
  novo[canal] = valor;
  return novo;
}

type Pill = "faltam" | "completos" | "todos";

export default function CadastrosCanais({ cadastros, setCadastros, canais, presenca, pesquisa, canaisOcultos, recarregar, avisar, ocupado, setOcupado }: Props) {
  const [filtroStatus, setFiltroStatus] = useState<Pill>("faltam");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(10);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<string[]>([]);
  // grupos que acabaram de ficar 100%: continuam na tela até trocar de filtro/página, para dar tempo de desfazer um clique errado
  const [recem, setRecem] = useState<Set<string>>(new Set());
  const topo = useRef<HTMLDivElement>(null);

  const grupos = useMemo(() => agruparPorPai(cadastros), [cadastros]);

  const q = pesquisa.trim().toLowerCase();
  const todos = useMemo(() => {
    const combina = (i: any) => !q || [i.sku, i.produto, i.sku_pai, i.marca, i.cor, i.tamanho, i.ncm, i.ean].some((v) => String(v ?? "").toLowerCase().includes(q));
    return Array.from(grupos.entries())
      .filter(([, itens]) => itens.some(combina))
      .map(([pai, itens]) => ({ pai, itens, st: statusDoGrupo(itens, canais, presenca) }));
  }, [grupos, canais, presenca, q]);

  const emAndamento = (g: { pai: string; st: { completo: boolean } }) => !g.st.completo || recem.has(g.pai);
  const nFaltam = todos.filter(emAndamento).length;
  const nCompletos = todos.length - nFaltam;

  const filtrados = useMemo(
    () => todos.filter((g) => {
      const and = !g.st.completo || recem.has(g.pai);
      if (filtroStatus === "faltam" && !and) return false;
      if (filtroStatus === "completos" && and) return false;
      if (filtroCanal !== "todos" && !g.st.faltam.some((c) => c.canal === filtroCanal)) return false;
      return true;
    }),
    [todos, filtroStatus, filtroCanal, recem]
  );

  // ao trocar filtro, busca, tamanho ou página, volta para a primeira página (quando for o caso) e libera os grupos "recém concluídos"
  useEffect(() => { setPagina(1); }, [filtroStatus, filtroCanal, pesquisa, tamanho]);
  useEffect(() => { setRecem(new Set()); }, [filtroStatus, filtroCanal, pesquisa, tamanho, pagina]);
  // canal que deixou de existir na lista (ex.: ocultado no Mapa) não pode ficar no filtro
  useEffect(() => { if (filtroCanal !== "todos" && !canais.includes(filtroCanal)) setFiltroCanal("todos"); }, [canais, filtroCanal]);

  const pg = paginar(filtrados.length, pagina, tamanho);
  const visiveis = filtrados.slice(pg.inicio, pg.fim);
  const irParaPagina = (p: number) => { setPagina(p); topo.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  // ações de Excluir / Recadastrar valem só para o que está na página (nunca para item escondido por filtro ou paginação)
  const skusVisiveis = visiveis.flatMap((g) => g.itens.map((i: any) => i.sku as string));
  const selecionados = sel.filter((s) => skusVisiveis.includes(s));

  const toggleSku = (sku: string) => setSel((p) => (p.includes(sku) ? p.filter((s) => s !== sku) : [...p, sku]));
  const toggleGrupo = (itens: any[], marcar: boolean) => {
    const skus = itens.map((i) => i.sku as string);
    setSel((p) => (marcar ? Array.from(new Set([...p, ...skus])) : p.filter((s) => !skus.includes(s))));
  };
  const toggleTodos = (marcar: boolean) => setSel((p) => (marcar ? Array.from(new Set([...p, ...skusVisiveis])) : p.filter((s) => !skusVisiveis.includes(s))));

  // marca / desmarca canais para TODAS as variações do pai
  const marcar = async (pai: string, lista: string[], valor: boolean) => {
    const itens = grupos.get(pai) || [];
    if (!itens.length || !lista.length) return;
    const originais = new Map(itens.map((i: any) => [i.sku as string, i.canais_enviados]));
    const novos = new Map<string, Record<string, boolean>>();
    for (const it of itens) {
      let ce: Record<string, boolean> = it.canais_enviados || {};
      for (const c of lista) ce = comCanal(ce, c, valor);
      novos.set(it.sku, ce);
    }
    setCadastros((l) => l.map((i) => (novos.has(i.sku) ? { ...i, canais_enviados: novos.get(i.sku) } : i)));
    const completou = valor && statusDoGrupo(itens.map((i: any) => ({ ...i, canais_enviados: novos.get(i.sku) })), canais, presenca).completo;
    if (completou) setRecem((p) => new Set(p).add(pai));
    try {
      const res = await Promise.all(itens.map((it: any) => supabase.from("produtos_novos_cadastrados").update({ canais_enviados: novos.get(it.sku) }).eq("sku", it.sku)));
      const erro = res.find((r) => r.error)?.error;
      if (erro) throw new Error(erro.message);
      if (completou) avisar("ok", `Pai ${pai}: cadastrado em todos os canais ✓`);
    } catch (e: any) {
      setCadastros((l) => l.map((i) => (originais.has(i.sku) ? { ...i, canais_enviados: originais.get(i.sku) } : i)));
      setRecem((p) => { const n = new Set(p); n.delete(pai); return n; });
      avisar("erro", "Não consegui salvar a marcação: " + e.message);
    }
  };

  const excluirGrupo = async (pai: string, itens: any[]) => {
    if (!confirm(`Excluir o grupo ${pai} e todas as suas ${itens.length} variação(ões) da aba de Canais?`)) return;
    setOcupado(true);
    try {
      const { error: e1 } = await supabase.from("produtos_novos_cadastrados").delete().eq("sku_pai", pai);
      if (e1) throw new Error(e1.message);
      for (const lote of emLotes(itens.map((i) => i.sku as string))) {
        const { error } = await supabase.from("produtos_novos_cadastrados").delete().in("sku", lote);
        if (error) throw new Error(error.message);
      }
      await recarregar();
      avisar("ok", `Grupo ${pai} excluído.`);
    } catch (e: any) {
      await recarregar();
      avisar("erro", "Erro ao excluir: " + e.message);
    }
    setOcupado(false);
  };

  const excluirSelecionados = async () => {
    const skus = selecionados;
    if (!skus.length) return;
    if (!confirm(`Excluir ${skus.length} SKU(s) da aba de Canais?\n\nEles somem daqui junto com as marcações de canais e de clipes. (O custo e o cadastro-base do SKU não são apagados.)`)) return;
    setOcupado(true);
    try {
      for (const lote of emLotes(skus)) {
        const { error } = await supabase.from("produtos_novos_cadastrados").delete().in("sku", lote);
        if (error) throw new Error(error.message);
      }
      setSel((p) => p.filter((s) => !skus.includes(s)));
      await recarregar();
      avisar("ok", `🗑️ ${skus.length} SKU(s) excluído(s) da aba de Canais.`);
    } catch (e: any) {
      await recarregar();
      avisar("erro", "Erro ao excluir: " + e.message);
    }
    setOcupado(false);
  };

  // devolve os SKUs para os Pendentes (com todos os dados, para editar e cadastrar de novo) e tira de Canais
  const recadastrarSelecionados = async () => {
    const skus = selecionados;
    if (!skus.length) return;
    if (!confirm(`Recadastrar ${skus.length} SKU(s)?\n\nEles voltam para a aba Pendentes (você pode editar e cadastrar de novo) e saem de Canais. As marcações de canais e de clipes deles são zeradas.`)) return;
    setOcupado(true);
    try {
      const itens = cadastros.filter((i) => skus.includes(i.sku));
      const registros = itens.map((i: any) => ({
        sku: i.sku,
        sku_pai: i.sku_pai || (i.sku.length > 5 ? i.sku.substring(0, 5) : i.sku),
        produto: i.produto, marca: i.marca, cor: i.cor, tamanho: i.tamanho,
        ncm: i.ncm ?? null, cest: i.cest ?? null, ean: i.ean ?? null,
        custo: i.custo, preco_venda: i.preco_venda, qtdd_ecom: i.qtdd_ecom ?? 0,
        altura: i.altura ?? null, largura: i.largura ?? null, comprimento: i.comprimento ?? null,
      }));
      // primeiro grava nos Pendentes; só depois tira de Canais (se algo falhar, nada se perde)
      for (const lote of emLotes(registros)) {
        const { error } = await supabase.from("produtos_pendentes").upsert(lote, { onConflict: "sku" });
        if (error) throw new Error(error.message);
      }
      for (const lote of emLotes(itens.map((i: any) => i.sku as string))) {
        const { error } = await supabase.from("produtos_novos_cadastrados").delete().in("sku", lote);
        if (error) throw new Error(error.message);
      }
      setSel((p) => p.filter((s) => !skus.includes(s)));
      await recarregar();
      avisar("ok", `🔁 ${registros.length} SKU(s) voltaram para Pendentes. É só editar (✏️) e cadastrar de novo.`);
    } catch (e: any) {
      await recarregar();
      avisar("erro", "Erro ao recadastrar: " + e.message);
    }
    setOcupado(false);
  };

  const pills: { id: Pill; rotulo: string; n: number }[] = [
    { id: "faltam", rotulo: "Faltam canais", n: nFaltam },
    { id: "completos", rotulo: "100% concluídos", n: nCompletos },
    { id: "todos", rotulo: "Todos", n: todos.length },
  ];

  return (
    <div className="space-y-3" ref={topo} data-aba-canais>
      {/* uma barra só: situação, canal e ações em lote */}
      <div className="bg-slate-900/80 rounded-xl border border-slate-800 px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 gap-0.5" role="tablist" aria-label="Situação do cadastro">
          {pills.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={filtroStatus === p.id}
              data-filtro-status={p.id}
              onClick={() => setFiltroStatus(p.id)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${filtroStatus === p.id ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {p.rotulo}
              <span className={`px-1.5 rounded-full text-[10px] ${filtroStatus === p.id ? "bg-white/25" : "bg-slate-800 text-slate-300"}`} data-contagem={p.id}>{p.n}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Falta em
          <select
            value={filtroCanal}
            data-filtro-canal
            onChange={(e) => setFiltroCanal(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
          >
            <option value="todos">Qualquer canal</option>
            {canais.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <span
          data-dica-canais
          className="text-xs text-slate-500 cursor-help"
          title={`Clique no canal assim que cadastrar o produto lá: ele sai da lista e só ficam os que faltam.\nCanais em que algum SKU filho já aparece no Mapa de Cadastros ou nas vendas são marcados sozinhos (selo "auto").${canaisOcultos > 0 ? `\n${canaisOcultos} canal(is) oculto(s) no Mapa de Cadastros não entram na conta.` : ""}`}
        >
          ⓘ Como funciona
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2" data-barra-selecao-canais>
          <span className="text-[11px] text-slate-400" data-qtd-selecionados-canais>
            {selecionados.length > 0 ? `${selecionados.length} SKU(s) selecionado(s)` : "Marque itens para excluir ou recadastrar"}
          </span>
          <button
            onClick={recadastrarSelecionados}
            disabled={selecionados.length === 0 || ocupado}
            data-recadastrar-canais
            title="Devolve os SKUs marcados para a aba Pendentes, para editar e cadastrar de novo"
            className="border border-amber-600/60 text-amber-300 hover:bg-amber-950/40 disabled:opacity-30 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
          >
            🔁 Recadastrar ({selecionados.length})
          </button>
          <button
            onClick={excluirSelecionados}
            disabled={selecionados.length === 0 || ocupado}
            data-excluir-canais
            className="border border-rose-700/60 text-rose-300 hover:bg-rose-950/40 disabled:opacity-30 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
          >
            🗑️ Excluir ({selecionados.length})
          </button>
        </div>
      </div>

      <Paginacao
        total={filtrados.length}
        pagina={pg.pagina}
        tamanho={tamanho}
        onPagina={irParaPagina}
        onTamanho={setTamanho}
        rotulo="produtos"
        inicio={
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              data-selecionar-todos-canais
              checked={skusVisiveis.length > 0 && selecionados.length === skusVisiveis.length}
              onChange={(e) => toggleTodos(e.target.checked)}
              className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
            />
            Selecionar esta página
          </label>
        }
      />

      {/* lista: uma linha por produto */}
      {visiveis.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-10 text-center space-y-1" data-vazio-canais>
          <p className="text-3xl">{filtroStatus === "faltam" && !q && filtroCanal === "todos" ? "🎉" : "🔎"}</p>
          <p className="text-sm font-bold text-slate-200">
            {filtroStatus === "faltam" && !q && filtroCanal === "todos" ? "Tudo cadastrado nos canais" : "Nenhum produto com esses filtros"}
          </p>
          <p className="text-xs text-slate-500">
            {filtroStatus === "faltam" && !q && filtroCanal === "todos" ? "Não há produto com canal faltando." : "Ajuste a busca ou os filtros acima."}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl divide-y divide-slate-800 overflow-hidden">
          {visiveis.map(({ pai, itens, st }) => {
            const expandido = Boolean(expandidos[pai]);
            const qtdSel = itens.filter((i: any) => sel.includes(i.sku)).length;
            const nome = itens[0]?.produto || "Produto sem nome";
            const data = new Date(itens[0]?.data_cadastro || Date.now()).toLocaleDateString("pt-BR");
            return (
              <article
                key={pai}
                data-grupo-canais={pai}
                data-grupo-completo={st.completo ? "1" : "0"}
                className={`px-3 py-2.5 space-y-2 ${st.completo ? "bg-emerald-950/10" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    data-selecionar-grupo={pai}
                    title="Marcar todas as variações deste pai"
                    checked={qtdSel === itens.length}
                    ref={(el) => { if (el) el.indeterminate = qtdSel > 0 && qtdSel < itens.length; }}
                    onChange={(e) => toggleGrupo(itens, e.target.checked)}
                    className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer shrink-0"
                  />
                  <span className="font-mono text-[11px] font-black text-purple-300 bg-purple-950/50 px-1.5 py-0.5 rounded shrink-0">{pai}</span>
                  <div className="min-w-0 flex-1 flex items-baseline gap-2">
                    <h3 className="text-[13px] font-semibold text-white truncate" title={nome}>{nome}</h3>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap hidden sm:inline">{itens.length} var. · {data}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" data-progresso-grupo={pai}>
                    <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden hidden md:block">
                      <div className={`h-full rounded-full transition-all duration-500 ${st.completo ? "bg-emerald-500" : "bg-purple-500"}`} style={{ width: `${st.pct}%` }} />
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-400 whitespace-nowrap">{st.feitos.length}/{st.total} canais · {st.pct}%</span>
                  </div>
                  <button
                    onClick={() => setExpandidos((e) => ({ ...e, [pai]: !e[pai] }))}
                    data-detalhes-grupo={pai}
                    aria-expanded={expandido}
                    title={expandido ? "Ocultar detalhes" : "Ver variações e onde já está cadastrado"}
                    className="px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 text-[11px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    {expandido ? "Detalhes ▴" : "Detalhes ▾"}
                  </button>
                  <button
                    onClick={() => excluirGrupo(pai, itens)}
                    title="Excluir o grupo inteiro"
                    aria-label={`Excluir o grupo ${pai}`}
                    className="px-1.5 py-1 rounded-md text-slate-500 hover:text-rose-300 hover:bg-rose-950/40 text-xs cursor-pointer"
                  >
                    🗑️
                  </button>
                </div>

                {/* o que falta */}
                <div className="flex flex-wrap items-center gap-1.5 pl-[1.65rem]">
                  {st.completo ? (
                    <p className="text-xs font-semibold text-emerald-400" data-concluido-grupo>✓ Cadastrado em todos os {st.total} canais</p>
                  ) : (
                    <>
                      <span className="text-[11px] text-slate-500 mr-1">Falta:</span>
                      {st.faltam.map((c) => (
                        <button
                          key={c.canal}
                          data-chip-falta={c.canal}
                          onClick={() => marcar(pai, [c.canal], true)}
                          title={`Clique quando cadastrar em ${c.canal}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-slate-600 text-slate-300 text-[11px] font-semibold hover:border-purple-400 hover:text-white hover:bg-purple-950/30 transition cursor-pointer"
                        >
                          <span className="w-3 h-3 rounded-[3px] border border-slate-500 inline-block" aria-hidden />
                          {c.canal}
                        </button>
                      ))}
                      {st.faltam.length > 1 && (
                        <button
                          data-marcar-todos-canais={pai}
                          onClick={() => { if (confirm(`Marcar ${st.faltam.length} canal(is) como cadastrados para o pai ${pai}?`)) marcar(pai, st.faltam.map((c) => c.canal), true); }}
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-slate-500 hover:text-white underline-offset-2 hover:underline cursor-pointer"
                        >
                          marcar todos
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* detalhes: variações + onde já está cadastrado */}
                {expandido && (
                  <div className="grid md:grid-cols-2 gap-5 pt-2 pl-[1.65rem]" data-detalhes-aberto={pai}>
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Variações ({itens.length})</h4>
                      <ul>
                        {itens.map((item: any) => (
                          <li key={item.sku}>
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-slate-800/60">
                              <input
                                type="checkbox"
                                data-selecionar-sku={item.sku}
                                checked={sel.includes(item.sku)}
                                onChange={() => toggleSku(item.sku)}
                                className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
                              />
                              <span className="font-mono font-bold text-indigo-300">{item.sku}</span>
                              <span className="text-slate-500">Cor: {item.cor || "—"} · Tam: {item.tamanho || "—"}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Já cadastrado em ({st.feitos.length})</h4>
                      {st.feitos.length === 0 ? (
                        <p className="text-xs text-slate-500">Ainda em nenhum canal.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {st.feitos.map((c) =>
                            c.origem === "auto" ? (
                              <span
                                key={c.canal}
                                data-chip-feito={c.canal}
                                data-origem="auto"
                                title={`Detectado automaticamente (Mapa de Cadastros ou vendas): ${c.skusAuto.join(", ")}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-700/50 bg-emerald-950/30 text-emerald-300 text-[11px] font-semibold"
                              >
                                ✓ {c.canal} <em className="not-italic text-[9px] uppercase tracking-wide bg-emerald-900/60 px-1.5 rounded">auto</em>
                              </span>
                            ) : (
                              <button
                                key={c.canal}
                                data-chip-feito={c.canal}
                                data-origem="manual"
                                onClick={() => marcar(pai, [c.canal], false)}
                                title="Clique para desfazer (voltar para 'falta')"
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-700/50 bg-emerald-950/30 text-emerald-300 text-[11px] font-semibold hover:border-rose-500 hover:text-rose-300 transition cursor-pointer"
                              >
                                ✓ {c.canal} <span aria-hidden className="text-[10px] opacity-60">✕</span>
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Paginacao total={filtrados.length} pagina={pg.pagina} tamanho={tamanho} onPagina={irParaPagina} onTamanho={setTamanho} rotulo="produtos" />
    </div>
  );
}
