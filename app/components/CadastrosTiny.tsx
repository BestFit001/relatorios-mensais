"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { agruparPorPai, paginar, emLotes } from "../../lib/cadastroCanais";
import Link from "next/link";
import Paginacao from "./Paginacao";

type Avisar = (tipo: "ok" | "erro", texto: string) => void;

interface Props {
  cadastros: any[];
  pesquisa: string;
  recarregar: () => Promise<void>;
  avisar: Avisar;
  ocupado: boolean;
  setOcupado: (b: boolean) => void;
}

export default function CadastrosTiny({ cadastros, pesquisa, recarregar, avisar, ocupado, setOcupado }: Props) {
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(10);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<string[]>([]);
  const topo = useRef<HTMLDivElement>(null);

  const grupos = useMemo(() => agruparPorPai(cadastros), [cadastros]);

  const q = pesquisa.trim().toLowerCase();
  const filtrados = useMemo(() => {
    const combina = (i: any) => !q || [i.sku, i.produto, i.sku_pai, i.marca, i.cor, i.tamanho, i.ncm, i.ean].some((v) => String(v ?? "").toLowerCase().includes(q));
    return Array.from(grupos.entries())
      .filter(([, itens]) => itens.some(combina))
      .map(([pai, itens]) => ({ pai, itens }));
  }, [grupos, q]);

  // ao trocar a busca ou o tamanho da página, volta para a primeira
  useEffect(() => { setPagina(1); }, [pesquisa, tamanho]);

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

  const excluirGrupo = async (pai: string, itens: any[]) => {
    if (!confirm(`Excluir o grupo ${pai} e todas as suas ${itens.length} variação(ões) da aba Tiny?`)) return;
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
    if (!confirm(`Excluir ${skus.length} SKU(s) da aba Tiny?\n\nEles somem daqui. (O custo e o cadastro-base do SKU não são apagados.)`)) return;
    setOcupado(true);
    try {
      for (const lote of emLotes(skus)) {
        const { error } = await supabase.from("produtos_novos_cadastrados").delete().in("sku", lote);
        if (error) throw new Error(error.message);
      }
      setSel((p) => p.filter((s) => !skus.includes(s)));
      await recarregar();
      avisar("ok", `🗑️ ${skus.length} SKU(s) excluído(s) da aba Tiny.`);
    } catch (e: any) {
      await recarregar();
      avisar("erro", "Erro ao excluir: " + e.message);
    }
    setOcupado(false);
  };

  // devolve os SKUs para os Pendentes (com todos os dados, para editar e cadastrar de novo) e tira da aba Tiny
  const recadastrarSelecionados = async () => {
    const skus = selecionados;
    if (!skus.length) return;
    if (!confirm(`Recadastrar ${skus.length} SKU(s)?\n\nEles voltam para a aba Pendentes (você pode editar e cadastrar de novo) e saem da aba Tiny.`)) return;
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
      // primeiro grava nos Pendentes; só depois tira da aba Tiny (se algo falhar, nada se perde)
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

  return (
    <div className="space-y-3" ref={topo} data-aba-tiny>
      <p className="text-[11px] text-slate-400 px-1" data-aviso-tiny>
        Registro dos produtos que já foram cadastrados no Tiny. O acompanhamento por canal fica no <Link href="/mapeamento" className="text-purple-300 hover:text-white underline">Mapa de Cadastros</Link>.
      </p>

      <Paginacao
        total={filtrados.length}
        pagina={pg.pagina}
        tamanho={tamanho}
        onPagina={irParaPagina}
        onTamanho={setTamanho}
        rotulo="produtos"
        inicio={
          <div className="flex flex-wrap items-center gap-3" data-barra-selecao-tiny>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                data-selecionar-todos-tiny
                checked={skusVisiveis.length > 0 && selecionados.length === skusVisiveis.length}
                onChange={(e) => toggleTodos(e.target.checked)}
                className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
              />
              Selecionar esta página
            </label>
            <span className="text-[11px] text-slate-400" data-qtd-selecionados-tiny>
              {selecionados.length > 0 ? `${selecionados.length} SKU(s) selecionado(s)` : "Marque itens para excluir ou recadastrar"}
            </span>
            <button
              onClick={recadastrarSelecionados}
              disabled={selecionados.length === 0 || ocupado}
              data-recadastrar-tiny
              title="Devolve os SKUs marcados para a aba Pendentes, para editar e cadastrar de novo"
              className="border border-amber-600/60 text-amber-300 hover:bg-amber-950/40 disabled:opacity-30 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
            >
              🔁 Recadastrar ({selecionados.length})
            </button>
            <button
              onClick={excluirSelecionados}
              disabled={selecionados.length === 0 || ocupado}
              data-excluir-tiny
              className="border border-rose-700/60 text-rose-300 hover:bg-rose-950/40 disabled:opacity-30 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
            >
              🗑️ Excluir ({selecionados.length})
            </button>
          </div>
        }
      />

      {/* lista: uma linha por produto */}
      {visiveis.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-10 text-center space-y-1" data-vazio-tiny>
          <p className="text-3xl">{q ? "🔎" : "📭"}</p>
          <p className="text-sm font-bold text-slate-200">
            {q ? "Nenhum produto com essa busca" : "Nenhum produto cadastrado no Tiny ainda"}
          </p>
          <p className="text-xs text-slate-500">
            {q ? "Ajuste a busca acima." : "Os produtos aparecem aqui assim que você cadastra na aba Pendentes."}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl divide-y divide-slate-800 overflow-hidden">
          {visiveis.map(({ pai, itens }) => {
            const expandido = Boolean(expandidos[pai]);
            const qtdSel = itens.filter((i: any) => sel.includes(i.sku)).length;
            const nome = itens[0]?.produto || "Produto sem nome";
            const data = new Date(itens[0]?.data_cadastro || Date.now()).toLocaleDateString("pt-BR");
            return (
              <article key={pai} data-grupo-tiny={pai} className="px-3 py-2.5 space-y-2">
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
                  <span data-no-tiny className="text-[11px] font-semibold text-emerald-400 whitespace-nowrap shrink-0">✓ No Tiny</span>
                  <button
                    onClick={() => setExpandidos((e) => ({ ...e, [pai]: !e[pai] }))}
                    data-detalhes-grupo={pai}
                    aria-expanded={expandido}
                    title={expandido ? "Ocultar variações" : "Ver as variações"}
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

                {expandido && (
                  <ul className="pt-1 pl-[1.65rem] grid sm:grid-cols-2 xl:grid-cols-3 gap-x-5" data-detalhes-aberto={pai}>
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
