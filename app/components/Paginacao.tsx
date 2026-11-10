"use client";
import React from "react";
import { numerosDePagina, paginar } from "../../lib/cadastroCanais";

/** Barra de paginação: "Mostrando 1–10 de 52 grupos", itens por página e números de página. */
export default function Paginacao({
  total, pagina, tamanho, onPagina, onTamanho, rotulo = "grupos", opcoes = [10, 20, 50],
}: {
  total: number;
  pagina: number;
  tamanho: number;
  onPagina: (p: number) => void;
  onTamanho: (t: number) => void;
  rotulo?: string;
  opcoes?: number[];
}) {
  if (total === 0) return null;
  const p = paginar(total, pagina, tamanho);
  const base = "h-8 min-w-8 px-2.5 rounded-lg text-xs font-bold border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-paginacao>
      <p className="text-xs text-slate-400" data-paginacao-info>
        Mostrando <b className="text-slate-200">{p.inicio + 1}–{p.fim}</b> de <b className="text-slate-200">{total}</b> {rotulo}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          Por página
          <select
            value={tamanho}
            data-paginacao-tamanho
            onChange={(e) => onTamanho(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none cursor-pointer"
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
