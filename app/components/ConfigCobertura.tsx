"use client";
// Curva ABC > Configurações: escolhe quais colunas da "Cobertura de Estoque" somem quando se clica em "Ocultar informações".
import React from "react";
import { COLUNAS_COBERTURA } from "@/lib/cobertura";

export default function ConfigCobertura({
  colunasOcultas, onAlterar, salvando, erro,
}: {
  colunasOcultas: string[]; onAlterar: (novas: string[]) => void; salvando: boolean; erro: string;
}) {
  const alternar = (id: string) =>
    onAlterar(colunasOcultas.includes(id) ? colunasOcultas.filter((x) => x !== id) : [...colunasOcultas, id]);

  return (
    <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-4 max-w-3xl" data-config-cobertura>
      <div>
        <h3 className="font-black text-white text-sm">Colunas que somem em &quot;Ocultar informações&quot;</h3>
        <p className="text-[11px] text-slate-400">
          Marque as colunas da aba <strong className="text-slate-200">Cobertura de Estoque</strong> que devem desaparecer quando alguém clicar em
          &quot;Ocultar informações&quot;. A escolha vale para todos os usuários.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {COLUNAS_COBERTURA.map((c) => {
          const marcada = colunasOcultas.includes(c.id);
          return (
            <label key={c.id} data-config-coluna={c.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-bold cursor-pointer ${marcada ? "bg-amber-500/10 border-amber-500/50 text-amber-200" : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600"}`}>
              <input type="checkbox" checked={marcada} onChange={() => alternar(c.id)} disabled={salvando} className="accent-amber-500" />
              {c.nome}
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <button type="button" onClick={() => onAlterar([])} disabled={salvando || colunasOcultas.length === 0} className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 font-bold hover:bg-slate-800 disabled:opacity-40 cursor-pointer">Limpar seleção</button>
        <span className="text-slate-500" data-config-estado>{salvando ? "Salvando…" : `${colunasOcultas.length} coluna(s) selecionada(s) — salvo automaticamente`}</span>
      </div>
      {erro && <p className="text-xs font-bold text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-xl p-3">{erro}</p>}
    </div>
  );
}
