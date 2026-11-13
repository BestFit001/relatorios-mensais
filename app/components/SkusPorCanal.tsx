"use client";
// Sub-aba "SKUs por canal" do Mapa de Cadastros: lista os SKUs com filtro por canal (cadastrado / NÃO cadastrado), status (obsoleto),
// estoque e quantidade de canais em que o SKU está cadastrado (0, 1, 2… até o total de canais exibidos).
// Pode agrupar os filhos dentro do SKU pai (5 primeiros dígitos; ajuste manual para os pais de 4 dígitos).
import React, { useMemo, useState, useDeferredValue } from "react";
import Paginacao from "./Paginacao";
import { paginar } from "../../lib/cadastroCanais";
import { agruparPorPai, paiDoSku, paiProvavelDe4, validarPai, normalizarSkuPai } from "../../lib/skuPai";

export interface SkuDoMapa { sku: string; skuNorm: string; estoque: number; status: string; pres: boolean[]; nome?: string; marca?: string }
interface Props {
  itens: SkuDoMapa[]; visiveis: { canal: string; i: number }[]; loading: boolean;
  /** Grava o SKU como cadastrado no canal (devolve a mensagem de erro, ou null se deu certo). */
  onCadastrar: (sku: string, canal: string) => Promise<string | null>;
  /** Grava vários SKUs (os filhos de um pai) como cadastrados no canal. */
  onCadastrarVarios: (skus: string[], canal: string) => Promise<string | null>;
  /** SKUs (normalizados) marcados "Para exclusão" pelo upload em Configurações. */
  paraExclusao: Set<string>;
  /** Ajuste manual do SKU pai (vale para todo o app). Devolve a mensagem de erro, ou null. */
  paiManual: Map<string, string>;
  onEditarPai: (skus: string[], pai: string) => Promise<string | null>;
}

type Marca = 0 | 1 | 2;   // 0 = sem filtro, 1 = cadastrado neste canal, 2 = NÃO cadastrado neste canal
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const normBusca = (v: string) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const SEM_MARCA = "__sem__";
const rotuloMarca = (m: string) => (m ? m : "(sem marca)");

export default function SkusPorCanal({ itens, visiveis, loading, onCadastrar, onCadastrarVarios, paraExclusao, paiManual, onEditarPai }: Props) {
  const [marcas, setMarcas] = useState<Record<string, Marca>>({});
  const [status, setStatus] = useState<"TODOS" | "Normal" | "Obsoleto">("TODOS");
  const [estoque, setEstoque] = useState<"TODOS" | "COM" | "SEM">("TODOS");
  const [qtds, setQtds] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [marcaSel, setMarcaSel] = useState("");   // "" = todas as marcas; SEM_MARCA = SKUs sem marca informada
  const [exclusao, setExclusao] = useState<"TODOS" | "EXCLUIR" | "MANTIDOS">("TODOS");
  const paraExcluir = (sku: string) => paraExclusao.has(normalizarSkuPai(sku));
  const [visao, setVisao] = useState<"ambos" | "pais" | "filhos">("ambos");   // pais e filhos | só pais | só filhos
  const agrupar = visao !== "filhos";
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(50);          // SKUs por página (lista simples)
  const [tamanhoPais, setTamanhoPais] = useState(20);  // pais por página (agrupado)
  const [perguntando, setPerguntando] = useState<{ sku: string; canal: string; pai?: string; skus: string[] } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erroCadastro, setErroCadastro] = useState("");
  const [editandoPai, setEditandoPai] = useState<string | null>(null);   // pai (do grupo) em edição
  const [textoPai, setTextoPai] = useState("");
  const [erroPai, setErroPai] = useState("");
  const [salvandoPai, setSalvandoPai] = useState(false);
  const buscaAdiada = useDeferredValue(busca);
  const totalCanais = visiveis.length;

  const termos = useMemo(() => buscaAdiada.split(",").map(normBusca).filter(Boolean), [buscaAdiada]);
  const marcasAtivas = useMemo(
    () => visiveis.map((v) => ({ ...v, marca: (marcas[v.canal] || 0) as Marca })).filter((v) => v.marca !== 0),
    [visiveis, marcas]
  );

  // texto de busca de cada SKU (nome + marca, sem acento) e lista de marcas com quantidade de SKUs
  const textoBusca = useMemo(() => new Map(itens.map((it) => [it.skuNorm, normBusca(`${it.nome || ""} ${it.marca || ""}`)])), [itens]);
  const marcasDisponiveis = useMemo(() => {
    const c = new Map<string, number>();
    for (const it of itens) { const m = it.marca || ""; c.set(m, (c.get(m) || 0) + 1); }
    return Array.from(c.entries()).sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0], "pt-BR")));
  }, [itens]);
  const temMarca = marcasDisponiveis.some(([m]) => m !== "");

  // Todos os SKUs de cada pai (sem filtro): serve para o total de filhos e para o botão "editar pai"
  const filhosPorPai = useMemo(() => {
    const m = new Map<string, SkuDoMapa[]>();
    for (const it of itens) { const p = paiDoSku(it.sku, paiManual); const a = m.get(p); if (a) a.push(it); else m.set(p, [it]); }
    return m;
  }, [itens, paiManual]);

  // 1ª passada: tudo menos o filtro de quantidade (assim os botões 0, 1, 2… mostram quantos SKUs cada um traria)
  const { base, histograma, matriz } = useMemo(() => {
    const lista: (SkuDoMapa & { cad: number })[] = [];
    const hist = new Array(totalCanais + 1).fill(0);
    const porMarca = new Map<string, { total: number; pres: number[] }>();   // marca -> SKUs e SKUs cadastrados por canal (com todos os filtros, menos o de marca)
    for (const it of itens) {
      if (status !== "TODOS" && it.status !== status) continue;
      if (estoque === "COM" && !(it.estoque > 0)) continue;
      if (estoque === "SEM" && it.estoque > 0) continue;
      if (exclusao !== "TODOS" && paraExclusao.has(normalizarSkuPai(it.sku)) !== (exclusao === "EXCLUIR")) continue;
      if (termos.length > 0 && !termos.some((t) => it.skuNorm.includes(t) || paiDoSku(it.sku, paiManual).includes(t) || (textoBusca.get(it.skuNorm) || "").includes(t))) continue;
      let ok = true;
      for (const m of marcasAtivas) { if ((m.marca === 1) !== !!it.pres[m.i]) { ok = false; break; } }
      if (!ok) continue;
      const mk = it.marca || "";
      let reg = porMarca.get(mk); if (!reg) { reg = { total: 0, pres: new Array(visiveis.length).fill(0) }; porMarca.set(mk, reg); }
      reg.total++; visiveis.forEach((v, k) => { if (it.pres[v.i]) reg!.pres[k]++; });
      if (marcaSel && (marcaSel === SEM_MARCA ? mk !== "" : mk !== marcaSel)) continue;
      let cad = 0;
      for (const v of visiveis) if (it.pres[v.i]) cad++;
      hist[cad]++;
      lista.push({ ...it, cad });
    }
    return { base: lista, histograma: hist, matriz: Array.from(porMarca.entries()).sort((a, b) => b[1].total - a[1].total) };
  }, [itens, visiveis, totalCanais, status, estoque, exclusao, paraExclusao, termos, marcasAtivas, paiManual, textoBusca, marcaSel]);

  const filtrados = useMemo(() => (qtds.size === 0 ? base : base.filter((it) => qtds.has(it.cad))), [base, qtds]);
  const grupos = useMemo(() => agruparPorPai(filtrados, (it) => it.sku, paiManual), [filtrados, paiManual]);
  const filhosOrdenados = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);   // lista só de filhos, já na ordem do pai
  const maxHist = Math.max(1, ...histograma);
  const paginasDePai = visao === "ambos";   // "ambos": a página tem N pais com todos os filhos; "pais" e "filhos": N linhas
  const pg = paginar(agrupar ? grupos.length : filtrados.length, pagina, paginasDePai ? tamanhoPais : tamanho);

  const alternarMarca = (canal: string) => setMarcas((m) => ({ ...m, [canal]: (((m[canal] || 0) + 1) % 3) as Marca }));
  const alternarQtd = (n: number) => setQtds((s) => { const novo = new Set(s); if (novo.has(n)) novo.delete(n); else novo.add(n); return novo; });
  const limpar = () => { setMarcas({}); setStatus("TODOS"); setEstoque("TODOS"); setExclusao("TODOS"); setQtds(new Set()); setBusca(""); setMarcaSel(""); setPagina(1); };
  const haFiltro = marcasAtivas.length > 0 || status !== "TODOS" || estoque !== "TODOS" || exclusao !== "TODOS" || qtds.size > 0 || busca.trim() !== "" || marcaSel !== "";

  const confirmarCadastro = async () => {
    if (!perguntando) return;
    setGravando(true); setErroCadastro("");
    const erro = perguntando.pai ? await onCadastrarVarios(perguntando.skus, perguntando.canal) : await onCadastrar(perguntando.sku, perguntando.canal);
    setGravando(false);
    if (erro) setErroCadastro(erro); else setPerguntando(null);
  };

  // ── edição do SKU pai de um grupo ──
  // Sugestão: SKUs de 10 dígitos sem ajuste normalmente têm pai de 4 dígitos (os 5 primeiros dígitos pegam um dígito do filho)
  const sugestaoDe4 = (pai: string): string | null => {
    for (const it of filhosPorPai.get(pai) || []) { const s = paiProvavelDe4(it.sku, paiManual); if (s) return s; }
    return null;
  };
  const abrirEdicaoPai = (pai: string) => { setErroPai(""); setEditandoPai(pai); setTextoPai((sugestaoDe4(pai) || pai).toUpperCase()); };
  // Quando o grupo mistura SKUs de 10 e de 11 dígitos e o pai novo tem 4 dígitos, só os de 10 dígitos mudam
  const alvosDaEdicao = (pai: string, novo: string): SkuDoMapa[] => {
    const todos = filhosPorPai.get(pai) || [];
    const dez = todos.filter((it) => normalizarSkuPai(it.sku).length === 10);
    return novo.length === 4 && dez.length > 0 && dez.length < todos.length ? dez : todos;
  };
  const salvarPai = async () => {
    if (!editandoPai) return;
    const novo = validarPai(textoPai);
    if (!novo) { setErroPai("Digite o SKU pai (letras e números, até 12 caracteres)."); return; }
    setSalvandoPai(true); setErroPai("");
    const erro = await onEditarPai(alvosDaEdicao(editandoPai, novo).map((it) => it.sku), novo);
    setSalvandoPai(false);
    if (erro) setErroPai(erro); else setEditandoPai(null);
  };

  // "Está correto": mantém o pai atual (ex.: 5 dígitos) em todos os filhos do grupo e tira o aviso de que ele poderia ter 4 dígitos
  const confirmarPai = async (pai: string) => {
    setSalvandoPai(true); setErroPai("");
    const erro = await onEditarPai((filhosPorPai.get(pai) || []).map((it) => it.sku), pai);
    setSalvandoPai(false);
    if (erro) setErroPai(erro); else setEditandoPai(null);
  };

  const baixarCsv = () => {
    const esc = (v: any) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const cab = ["SKU pai", "SKU", "Produto", "Marca", "Status", "Exclusão", "Estoque", "Canais cadastrados", "Total de canais", ...visiveis.map((v) => v.canal)];
    const ordenados = filhosOrdenados;
    const linhas = ordenados.map((it) => [paiDoSku(it.sku, paiManual).toUpperCase(), it.sku, it.nome || "", it.marca || "", it.status, paraExcluir(it.sku) ? "Para exclusão" : "Mantido", it.estoque, it.cad, totalCanais, ...visiveis.map((v) => (it.pres[v.i] ? "Sim" : "Não"))]);
    const csv = "﻿" + [cab, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "skus_por_canal.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const campo = "border border-slate-700 rounded-xl p-2.5 text-xs font-semibold bg-slate-950 text-white outline-none cursor-pointer";
  const rotulo = "block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider";

  if (loading) return <p className="p-10 text-center text-slate-400 font-medium bg-slate-900/90 rounded-2xl border border-slate-800">Carregando dados completos...</p>;
  if (totalCanais === 0) return <p className="p-10 text-center text-slate-500 bg-slate-900/90 rounded-2xl border border-slate-800">Nenhum canal visível. Mostre algum na faixa “Canais exibidos”.</p>;

  const botaoX = (sku: string, canal: string) => (
    <button type="button" data-x={`${sku}|${canal}`} title="Clique se você já fez este cadastro" onClick={() => { setErroCadastro(""); setPerguntando({ sku, canal, skus: [sku] }); }} className="text-rose-500/60 hover:text-rose-400 hover:scale-125 transition cursor-pointer">❌</button>
  );

  // X do pai: subir uma variação sobe todas, então o cadastro vale para todos os filhos do pai que ainda não estão no canal
  const perguntarPai = (pai: string, canal: string, i: number) => {
    const faltam = (filhosPorPai.get(pai) || []).filter((it) => !it.pres[i]).map((it) => it.sku);
    if (faltam.length === 0) return;
    setErroCadastro(""); setPerguntando({ sku: pai, pai, canal, skus: faltam });
  };

  const linhaSku = (it: SkuDoMapa & { cad: number }, recuo: boolean) => (
    <tr key={it.sku} className="hover:bg-slate-800/40 transition-colors">
      <td className={`p-3.5 ${recuo ? "pl-10" : ""}`}>
        <span className="block font-mono font-bold text-slate-200">{it.sku}</span>
        {it.nome && <span data-nome-produto className="block text-[11px] font-medium text-slate-300 max-w-[360px] truncate" title={it.nome}>{it.nome}</span>}
        {it.marca && <span data-marca-produto className="block text-[10px] font-bold text-indigo-300">{it.marca}</span>}
      </td>
      {!agrupar && <td className="p-3.5 font-mono text-slate-400">{paiDoSku(it.sku, paiManual).toUpperCase()}</td>}
      <td className="p-3.5 text-center">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${it.status === "Obsoleto" ? "bg-rose-950/60 text-rose-400 border border-rose-900/50" : "bg-emerald-950/60 text-emerald-400 border border-emerald-900/50"}`}>{it.status}</span>
        {paraExcluir(it.sku) && <span data-tag-exclusao className="block mt-1 mx-auto w-fit px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/60">Para exclusão</span>}
      </td>
      <td className={`p-3.5 text-right font-bold ${it.estoque > 0 ? "text-indigo-400" : "text-slate-500"}`}>{it.estoque}</td>
      <td className={`p-3.5 text-center font-mono font-bold ${it.cad === 0 ? "text-rose-400" : it.cad === totalCanais ? "text-emerald-400" : "text-slate-300"}`}>{it.cad}/{totalCanais}</td>
      {visiveis.map(({ canal, i }) => (
        <td key={canal} className="p-3.5 text-center text-sm">{it.pres[i] ? <span className="text-emerald-400 font-bold">✅</span> : botaoX(it.sku, canal)}</td>
      ))}
    </tr>
  );

  return (
    <div data-painel-skus-canal className="space-y-6">
      {/* FILTROS */}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[260px]">
            <label className={rotulo}>Pesquisar SKU, SKU pai ou nome do produto:</label>
            <input type="text" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Ex: 20872, garrafa, farm..." className="border border-slate-700 rounded-xl p-2.5 w-full text-xs font-semibold bg-slate-950 text-white outline-none" />
          </div>
          {temMarca && (
            <div>
              <label className={rotulo}>Marca:</label>
              <select data-f="marca" value={marcaSel} onChange={(e) => { setMarcaSel(e.target.value); setPagina(1); }} className={campo + " max-w-[220px]"}>
                <option value="">Todas as marcas</option>
                {marcasDisponiveis.map(([m, n]) => <option key={m || SEM_MARCA} value={m || SEM_MARCA}>{rotuloMarca(m)} ({fmtInt(n)})</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={rotulo}>Status:</label>
            <select data-f="status" value={status} onChange={(e) => { setStatus(e.target.value as any); setPagina(1); }} className={campo}>
              <option value="TODOS">Todos</option><option value="Normal">Normais</option><option value="Obsoleto">Obsoletos</option>
            </select>
          </div>
          <div>
            <label className={rotulo}>Estoque no Tiny:</label>
            <select data-f="estoque" value={estoque} onChange={(e) => { setEstoque(e.target.value as any); setPagina(1); }} className={campo}>
              <option value="TODOS">Todos</option><option value="COM">Com estoque (&gt; 0)</option><option value="SEM">Sem estoque (≤ 0)</option>
            </select>
          </div>
          <div>
            <label className={rotulo}>Exclusão:</label>
            <select data-f="exclusao" value={exclusao} onChange={(e) => { setExclusao(e.target.value as any); setPagina(1); }} className={campo}>
              <option value="TODOS">Todos</option><option value="EXCLUIR">Para exclusão</option><option value="MANTIDOS">Mantidos</option>
            </select>
          </div>
          <div>
            <label className={rotulo}>Mostrar:</label>
            <div className="flex rounded-xl overflow-hidden border border-slate-700" data-visao-grupo>
              {([["ambos", "Pais e filhos"], ["pais", "Só pais"], ["filhos", "Só filhos"]] as const).map(([k, t]) => (
                <button key={k} type="button" data-visao={k} onClick={() => { setVisao(k); setPagina(1); }}
                  className={`px-3.5 py-2.5 text-xs font-bold cursor-pointer ${visao === k ? "bg-indigo-600 text-white" : "bg-slate-950 text-slate-300 hover:text-white"}`}>{t}</button>
              ))}
            </div>
          </div>
          {haFiltro && <button type="button" onClick={limpar} className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700 hover:text-white cursor-pointer">Limpar filtros</button>}
        </div>

        <div>
          <label className={rotulo}>Canais — clique para alternar: <span className="text-slate-500 normal-case font-medium">neutro → cadastrado → NÃO cadastrado</span></label>
          <div className="flex flex-wrap gap-2">
            {visiveis.map(({ canal }) => {
              const m = (marcas[canal] || 0) as Marca;
              const cls = m === 1 ? "bg-emerald-950/60 border-emerald-700 text-emerald-300" : m === 2 ? "bg-rose-950/60 border-rose-700 text-rose-300" : "bg-slate-950 border-slate-700 text-slate-300 hover:text-white";
              return (
                <button key={canal} type="button" data-canal-marca={canal} data-marca={m} onClick={() => { alternarMarca(canal); setPagina(1); }} className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${cls}`}>
                  {m === 1 ? "✅ " : m === 2 ? "❌ " : ""}{canal}{m === 1 ? " · cadastrado" : m === 2 ? " · não cadastrado" : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={rotulo}>Em quantos canais o SKU está cadastrado (de {totalCanais}):</label>
          <div className="flex flex-wrap gap-2">
            {histograma.map((n, q) => {
              const ativo = qtds.has(q);
              return (
                <button key={q} type="button" data-qtd={q} onClick={() => { alternarQtd(q); setPagina(1); }}
                  className={`min-w-[88px] text-left px-3 py-2 rounded-lg border cursor-pointer ${ativo ? "bg-indigo-600/90 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"}`}>
                  <div className="text-xs font-black">{q} {q === 1 ? "canal" : "canais"}{q === totalCanais ? " (todos)" : ""}</div>
                  <div className="text-[11px] font-mono">{fmtInt(n)} SKUs</div>
                  <div className="mt-1 h-1 rounded bg-slate-800 overflow-hidden"><div className={`h-full ${ativo ? "bg-white" : "bg-indigo-500"}`} style={{ width: `${(n / maxHist) * 100}%` }} /></div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MARCAS POR CANAL */}
      {temMarca && matriz.length > 0 && (
        <details data-marcas-canal className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl group">
          <summary className="p-5 cursor-pointer list-none flex flex-wrap items-center justify-between gap-2">
            <span><span className="text-base font-bold text-white">Marcas por canal</span> <span className="text-xs text-slate-400">· quantos SKUs de cada marca estão cadastrados em cada canal (respeita os filtros acima, menos o de marca)</span></span>
            <span className="text-xs font-bold text-indigo-300 group-open:hidden">Mostrar</span><span className="text-xs font-bold text-indigo-300 hidden group-open:inline">Ocultar</span>
          </summary>
          <div className="overflow-x-auto max-h-[60vh] border-t border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                <tr><th className="p-3">Marca</th><th className="p-3 text-right">SKUs</th>{visiveis.map(({ canal }) => <th key={canal} className="p-3 text-center">{canal}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {matriz.map(([m, r]) => (
                  <tr key={m || SEM_MARCA} data-marca-linha={m || SEM_MARCA} className={marcaSel === (m || SEM_MARCA) ? "bg-indigo-950/30" : "hover:bg-slate-800/40"}>
                    <td className="p-3"><button type="button" onClick={() => { setMarcaSel(marcaSel === (m || SEM_MARCA) ? "" : (m || SEM_MARCA)); setPagina(1); }} title="Clique para filtrar só esta marca" className="font-bold text-slate-100 hover:text-indigo-300 cursor-pointer text-left">{rotuloMarca(m)}</button></td>
                    <td className="p-3 text-right font-mono text-slate-300">{fmtInt(r.total)}</td>
                    {r.pres.map((n, k) => {
                      const pct = r.total > 0 ? (n / r.total) * 100 : 0;
                      return (
                        <td key={k} data-celula-marca={`${m || SEM_MARCA}|${visiveis[k].canal}`} className="p-3 text-center font-mono" style={{ background: n === 0 ? "rgba(244,63,94,.10)" : `rgba(16,185,129,${0.08 + (pct / 100) * 0.32})` }}>
                          <span className={n === 0 ? "text-rose-300 font-bold" : "text-emerald-200 font-bold"}>{fmtInt(n)}</span>
                          <span className="block text-[10px] text-slate-400">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* RESULTADO */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">SKUs por canal</h2>
            <p className="text-xs text-slate-400 mt-1">
              Universo: <strong data-total-skus className="text-white">{fmtInt(filtrados.length)}</strong> de {fmtInt(itens.length)} SKUs da base
              {agrupar && <> · <strong data-total-pais className="text-white">{fmtInt(grupos.length)}</strong> SKUs pai</>}
            </p>
          </div>
          <button type="button" onClick={baixarCsv} disabled={filtrados.length === 0} className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700 hover:text-white disabled:opacity-40 cursor-pointer">⬇ Baixar CSV</button>
        </div>
        {filtrados.length === 0 ? (
          <p className="p-10 text-center text-slate-400 font-medium">Nenhum SKU com esses filtros.</p>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="p-3.5">{visao === "ambos" ? "SKU pai / SKU filho" : visao === "pais" ? "SKU pai" : "SKU"}</th>
                    {!agrupar && <th className="p-3.5">SKU pai</th>}
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Estoque</th>
                    <th className="p-3.5 text-center">Cadastros</th>
                    {visiveis.map(({ canal }) => <th key={canal} className="p-3.5 text-center">{canal}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {agrupar
                    ? grupos.slice(pg.inicio, pg.fim).map((g) => {
                        const total = (filhosPorPai.get(g.pai) || []).length;
                        const sug = sugestaoDe4(g.pai);
                        const emEdicao = editandoPai === g.pai;
                        return (
                          <React.Fragment key={g.pai}>
                            <tr data-pai={g.pai} className="bg-slate-950/80">
                              <td className="p-3.5" colSpan={4}>
                                {emEdicao ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase text-slate-400">SKU pai:</span>
                                    <input data-editar-pai-input autoFocus value={textoPai} onChange={(e) => setTextoPai(e.target.value.toUpperCase())}
                                      onKeyDown={(e) => { if (e.key === "Enter") salvarPai(); if (e.key === "Escape") setEditandoPai(null); }}
                                      className="w-32 bg-slate-900 border border-indigo-500 rounded-lg px-2 py-1 text-xs font-mono font-black text-white outline-none" />
                                    <button type="button" data-salvar-pai disabled={salvandoPai} onClick={salvarPai} className="px-3 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 cursor-pointer">{salvandoPai ? "Salvando…" : "Salvar"}</button>
                                    <button type="button" data-confirmar-pai disabled={salvandoPai} onClick={() => confirmarPai(g.pai)} title={`Manter ${g.pai.toUpperCase()} como pai de todos os filhos e parar de sugerir 4 dígitos`} className="px-3 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 cursor-pointer">✔ Está correto ({g.pai.toUpperCase()})</button>
                                    <button type="button" disabled={salvandoPai} onClick={() => setEditandoPai(null)} className="px-3 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer">Cancelar</button>
                                    {erroPai && <span className="text-[11px] text-rose-300">{erroPai}</span>}
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-3">
                                    <span className="font-mono font-black text-indigo-300 text-sm">{g.pai.toUpperCase()}</span>
                                    {(() => {
                                      const todos = filhosPorPai.get(g.pai) || [];
                                      const nome = todos.find((x) => x.nome)?.nome;
                                      const marcasPai = Array.from(new Set(todos.map((x) => x.marca).filter(Boolean)));
                                      return (<>
                                        {nome && <span data-nome-pai className="text-xs font-semibold text-slate-200 max-w-[340px] truncate" title={nome}>{nome}</span>}
                                        {marcasPai.map((m) => <span key={m} className="text-[10px] font-bold text-indigo-300 bg-indigo-950/50 border border-indigo-900/60 rounded px-2 py-0.5">{m}</span>)}
                                      </>);
                                    })()}
                                    <span className="text-[11px] text-slate-400">{g.itens.length === total ? `${total} ${total === 1 ? "filho" : "filhos"}` : `${g.itens.length} de ${total} filhos`}</span>
                                    {(() => { const n = (filhosPorPai.get(g.pai) || []).filter((it) => paraExcluir(it.sku)).length; return n > 0 ? <span data-tag-exclusao-pai className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-800/60 rounded px-2 py-0.5">Para exclusão: {n === total ? "todos" : `${n} de ${total}`}</span> : null; })()}
                                    {sug && <span className="text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-900/50 rounded px-2 py-0.5" title="SKUs de 10 dígitos costumam ter pai de 4 dígitos">⚠ pai pode ter 4 dígitos ({sug.toUpperCase()})</span>}
                                    <button type="button" data-editar-pai={g.pai} onClick={() => abrirEdicaoPai(g.pai)} className="text-[11px] font-bold text-slate-300 hover:text-white bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 cursor-pointer">✏️ Editar pai</button>
                                  </div>
                                )}
                              </td>
                              {visiveis.map(({ canal, i }) => {
                                const doPai = filhosPorPai.get(g.pai) || [];
                                const okTodos = doPai.filter((it) => it.pres[i]).length;   // contagem sobre todos os filhos do pai (não só os filtrados)
                                return (
                                  <td key={canal} className="p-3.5 text-center text-[11px] font-mono font-bold">
                                    {okTodos === doPai.length
                                      ? <span className="text-emerald-400 text-sm">✅</span>
                                      : <button type="button" data-x-pai={`${g.pai}|${canal}`} onClick={() => perguntarPai(g.pai, canal, i)}
                                          title={okTodos === 0 ? "Clique se você já cadastrou este pai (todas as variações)" : `Faltam ${doPai.length - okTodos} variações. Clique se você já cadastrou`}
                                          className={`cursor-pointer hover:scale-125 transition ${okTodos === 0 ? "text-rose-500/60 hover:text-rose-400 text-sm" : "text-amber-300 hover:text-amber-200"}`}>
                                          {okTodos === 0 ? "❌" : `${okTodos}/${doPai.length}`}
                                        </button>}
                                  </td>
                                );
                              })}
                            </tr>
                            {visao === "ambos" && g.itens.map((it) => linhaSku(it as any, true))}
                          </React.Fragment>
                        );
                      })
                    : filhosOrdenados.slice(pg.inicio, pg.fim).map((it) => linhaSku(it, false))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-800">
              {visao === "ambos"
                ? <Paginacao total={grupos.length} pagina={pg.pagina} tamanho={tamanhoPais} onPagina={setPagina} onTamanho={(t) => { setTamanhoPais(t); setPagina(1); }} rotulo="SKUs pai" opcoes={[10, 20, 50, 100]} />
                : visao === "pais"
                ? <Paginacao total={grupos.length} pagina={pg.pagina} tamanho={tamanho} onPagina={setPagina} onTamanho={(t) => { setTamanho(t); setPagina(1); }} rotulo="SKUs pai" opcoes={[25, 50, 100, 200]} />
                : <Paginacao total={filtrados.length} pagina={pg.pagina} tamanho={tamanho} onPagina={setPagina} onTamanho={(t) => { setTamanho(t); setPagina(1); }} rotulo="SKUs" opcoes={[25, 50, 100, 200]} />}
            </div>
          </>
        )}
      </div>

      {perguntando && (
        <div role="dialog" aria-modal="true" data-confirma-cadastro className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-7 text-center">
            <h3 className="text-base font-black text-white mb-2">Você efetuou esse cadastro?</h3>
            <p className="text-xs text-slate-400 mb-5">
              {perguntando.pai
                ? <>SKU pai <strong className="text-slate-200 font-mono">{perguntando.pai.toUpperCase()}</strong> no canal <strong className="text-slate-200">{perguntando.canal}</strong>.
                    Se sim, as <strong className="text-slate-200">{perguntando.skus.length}</strong> variações que ainda faltavam passam a constar como cadastradas na base (subir uma variação sobe todas).</>
                : <>SKU <strong className="text-slate-200 font-mono">{perguntando.sku}</strong> no canal <strong className="text-slate-200">{perguntando.canal}</strong>.
                    Se sim, ele passa a constar como cadastrado na base.</>}
            </p>
            {erroCadastro && <p className="text-xs text-rose-300 mb-4">{erroCadastro}</p>}
            <div className="flex gap-3">
              <button type="button" autoFocus disabled={gravando} onClick={confirmarCadastro} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm cursor-pointer">{gravando ? "Salvando…" : "Sim"}</button>
              <button type="button" disabled={gravando} onClick={() => setPerguntando(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-sm border border-slate-700 cursor-pointer">Não</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
