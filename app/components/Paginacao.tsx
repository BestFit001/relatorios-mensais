"use client";
import React from "react";
import { numerosDePagina, paginar } from "../../lib/cadastroCanais";

/** Barra de paginação: "Mostrando 1–10 de 52 grupos", itens por página e números de página. */
export default function Paginacao({
  total, pagina, tamanho, onPagina, onTamanho, rotulo = "grupos", opcoes = [10, 20, 50], inicio,
}: {
  total: number;
  pagina: number;
  tamanho: number;
  onPagina: (p: number) => void;
  onTamanho: (t: number) => void;
  rotulo?: string;
  opcoes?: number[];
  /** conteúdo opcional à esquerda (ex.: "selecionar todos") */
  inicio?: React.ReactNode;
}) {
  const p = paginar(total, pagina, tamanho);
  const base = "h-7 min-w-7 px-2 rounded-md text-[11px] font-bold border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed";
  if (total === 0) return inicio ? <div className="flex items-center gap-4" data-paginacao>{inicio}</div> : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-paginacao>
      <div className="flex flex-wrap items-center gap-4">
        {inicio}
        <p className="text-xs text-slate-400" data-paginacao-info>
          Mostrando <b className="text-slate-200">{p.inicio + 1}–{p.fim}</b> de <b className="text-slate-200">{total}</b> {rotulo}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          Por página
          <select
            value={tamanho}
            data-paginacao-tamanho
            onChange={(e) => onTamanho(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded-md px-1.5 py-0.5 text-xs text-white outline-none cursor-pointer"
          >
            {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <nav className="flex items-center gap-1" aria-label="Páginas">
          <button data-pagina-ant disabled={p.pagina <= 1} onClick={() => onPagina(p.pagina - 1)} className={`${base} border-slate-700 text-slate-300 hover:bg-slate-800`}>‹ Anterior</button>
          {numerosDePagina(p.pagina, p.totalPaginas).map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1 text-slate-500 text-xs">…</span>
            ) : (
              <button
                key={n}
                data-pagina-num={n}
                aria-current={n === p.pagina ? "page" : undefined}
                onClick={() => onPagina(n)}
                className={`${base} ${n === p.pagina ? "bg-purple-600 border-purple-500 text-white" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
              >
                {n}
              </button>
            )
          )}
          <button data-pagina-prox disabled={p.pagina >= p.totalPaginas} onClick={() => onPagina(p.pagina + 1)} className={`${base} border-slate-700 text-slate-300 hover:bg-slate-800`}>Próxima ›</button>
        </nav>
      </div>
    </div>
  );
}
