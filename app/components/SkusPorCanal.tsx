"use client";
// Sub-aba "SKUs por canal" do Mapa de Cadastros: lista os SKUs com filtro por canal (cadastrado / NÃO cadastrado), status (obsoleto),
// estoque e quantidade de canais em que o SKU está cadastrado (0, 1, 2… até o total de canais exibidos).
import React, { useMemo, useState, useDeferredValue } from "react";
import Paginacao from "./Paginacao";
import { paginar } from "../../lib/cadastroCanais";

export interface SkuDoMapa { sku: string; skuNorm: string; estoque: number; status: string; pres: boolean[] }
interface Props {
  itens: SkuDoMapa[]; visiveis: { canal: string; i: number }[]; loading: boolean;
  /** Grava o SKU como cadastrado no canal (devolve a mensagem de erro, ou null se deu certo). */
  onCadastrar: (sku: string, canal: string) => Promise<string | null>;
}

type Marca = 0 | 1 | 2;   // 0 = sem filtro, 1 = cadastrado neste canal, 2 = NÃO cadastrado neste canal
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const normBusca = (v: string) => v.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

export default function SkusPorCanal({ itens, visiveis, loading, onCadastrar }: Props) {
  const [marcas, setMarcas] = useState<Record<string, Marca>>({});
  const [status, setStatus] = useState<"TODOS" | "Normal" | "Obsoleto">("TODOS");
  const [estoque, setEstoque] = useState<"TODOS" | "COM" | "SEM">("TODOS");
  const [qtds, setQtds] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(50);
  const [perguntando, setPerguntando] = useState<{ sku: string; canal: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erroCadastro, setErroCadastro] = useState("");
  const buscaAdiada = useDeferredValue(busca);
  const totalCanais = visiveis.length;

  const termos = useMemo(() => buscaAdiada.split(",").map(normBusca).filter(Boolean), [buscaAdiada]);
  const marcasAtivas = useMemo(
    () => visiveis.map((v) => ({ ...v, marca: (marcas[v.canal] || 0) as Marca })).filter((v) => v.marca !== 0),
    [visiveis, marcas]
  );

  // 1ª passada: tudo menos o filtro de quantidade (assim os botões 0, 1, 2… mostram quantos SKUs cada um traria)
  const { base, histograma } = useMemo(() => {
    const lista: (SkuDoMapa & { cad: number })[] = [];
    const hist = new Array(totalCanais + 1).fill(0);
    for (const it of itens) {
      if (status !== "TODOS" && it.status !== status) continue;
      if (estoque === "COM" && !(it.estoque > 0)) continue;
      if (estoque === "SEM" && it.estoque > 0) continue;
      if (termos.length > 0 && !termos.some((t) => it.skuNorm.includes(t))) continue;
      let ok = true;
      for (const m of marcasAtivas) { if ((m.marca === 1) !== !!it.pres[m.i]) { ok = false; break; } }
      if (!ok) continue;
      let cad = 0;
      for (const v of visiveis) if (it.pres[v.i]) cad++;
      hist[cad]++;
      lista.push({ ...it, cad });
    }
    return { base: lista, histograma: hist };
  }, [itens, visiveis, totalCanais, status, estoque, termos, marcasAtivas]);

  const filtrados = useMemo(() => (qtds.size === 0 ? base : base.filter((it) => qtds.has(it.cad))), [base, qtds]);
  const maxHist = Math.max(1, ...histograma);
  const pg = paginar(filtrados.length, pagina, tamanho);

  const alternarMarca = (canal: string) => setMarcas((m) => ({ ...m, [canal]: (((m[canal] || 0) + 1) % 3) as Marca }));
  const alternarQtd = (n: number) => setQtds((s) => { const novo = new Set(s); if (novo.has(n)) novo.delete(n); else novo.add(n); return novo; });
  const limpar = () => { setMarcas({}); setStatus("TODOS"); setEstoque("TODOS"); setQtds(new Set()); setBusca(""); setPagina(1); };
  const haFiltro = marcasAtivas.length > 0 || status !== "TODOS" || estoque !== "TODOS" || qtds.size > 0 || busca.trim() !== "";

  const confirmarCadastro = async () => {
    if (!perguntando) return;
    setGravando(true); setErroCadastro("");
    const erro = await onCadastrar(perguntando.sku, perguntando.canal);
    setGravando(false);
    if (erro) setErroCadastro(erro); else setPerguntando(null);
  };

  const baixarCsv = () => {
    const esc = (v: any) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const cab = ["SKU", "Status", "Estoque", "Canais cadastrados", "Total de canais", ...visiveis.map((v) => v.canal)];
    const linhas = filtrados.map((it) => [it.sku, it.status, it.estoque, it.cad, totalCanais, ...visiveis.map((v) => (it.pres[v.i] ? "Sim" : "Não"))]);
    const csv = "﻿" + [cab, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "skus_por_canal.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const campo = "border border-slate-700 rounded-xl p-2.5 text-xs font-semibold bg-slate-950 text-white outline-none cursor-pointer";
  const rotulo = "block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider";

  if (loading) return <p className="p-10 text-center text-slate-400 font-medium bg-slate-900/90 rounded-2xl border border-slate-800">Carregando dados completos...</p>;
  if (totalCanais === 0) return <p className="p-10 text-center text-slate-500 bg-slate-900/90 rounded-2xl border border-slate-800">Nenhum canal visível. Mostre algum na faixa “Canais exibidos”.</p>;

  return (
    <div data-painel-skus-canal className="space-y-6">
      {/* FILTROS */}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[260px]">
            <label className={rotulo}>Pesquisar SKU(s):</label>
            <input type="text" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Ex: SKU001, SKU002..." className="border border-slate-700 rounded-xl p-2.5 w-full text-xs font-semibold bg-slate-950 text-white outline-none" />
          </div>
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

      {/* RESULTADO */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">SKUs por canal</h2>
            <p className="text-xs text-slate-400 mt-1">Universo: <strong data-total-skus className="text-white">{fmtInt(filtrados.length)}</strong> de {fmtInt(itens.length)} SKUs da base</p>
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
                    <th className="p-3.5">SKU</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Estoque</th>
                    <th className="p-3.5 text-center">Cadastros</th>
                    {visiveis.map(({ canal }) => <th key={canal} className="p-3.5 text-center">{canal}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtrados.slice(pg.inicio, pg.fim).map((it) => (
                    <tr key={it.sku} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-slate-200">{it.sku}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${it.status === "Obsoleto" ? "bg-rose-950/60 text-rose-400 border border-rose-900/50" : "bg-emerald-950/60 text-emerald-400 border border-emerald-900/50"}`}>{it.status}</span>
                      </td>
                      <td className={`p-3.5 text-right font-bold ${it.estoque > 0 ? "text-indigo-400" : "text-slate-500"}`}>{it.estoque}</td>
                      <td className={`p-3.5 text-center font-mono font-bold ${it.cad === 0 ? "text-rose-400" : it.cad === totalCanais ? "text-emerald-400" : "text-slate-300"}`}>{it.cad}/{totalCanais}</td>
                      {visiveis.map(({ canal, i }) => (
                        <td key={canal} className="p-3.5 text-center text-sm">
                          {it.pres[i] ? <span className="text-emerald-400 font-bold">✅</span> : (
                            <button type="button" data-x={`${it.sku}|${canal}`} title="Clique se você já fez este cadastro" onClick={() => { setErroCadastro(""); setPerguntando({ sku: it.sku, canal }); }} className="text-rose-500/60 hover:text-rose-400 hover:scale-125 transition cursor-pointer">❌</button>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-800">
              <Paginacao total={filtrados.length} pagina={pg.pagina} tamanho={tamanho} onPagina={setPagina} onTamanho={(t) => { setTamanho(t); setPagina(1); }} rotulo="SKUs" opcoes={[25, 50, 100, 200]} />
            </div>
          </>
        )}
      </div>

      {perguntando && (
        <div role="dialog" aria-modal="true" data-confirma-cadastro className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-7 text-center">
            <h3 className="text-base font-black text-white mb-2">Você efetuou esse cadastro?</h3>
            <p className="text-xs text-slate-400 mb-5">
              SKU <strong className="text-slate-200 font-mono">{perguntando.sku}</strong> no canal <strong className="text-slate-200">{perguntando.canal}</strong>.
              Se sim, ele passa a constar como cadastrado na base.
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
