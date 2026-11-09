"use client";
import React, { useState } from "react";

/**
 * Faixa de canais do Mapa de Cadastros (Progresso e Gráficos): clique em um canal para ocultá-lo ou
 * mostrá-lo no painel, e adicione outros canais manualmente. Ocultar não apaga nada, só tira da tela.
 */
export default function CanaisDoMapa({
  canais, ocultos, normalizar, onAlternar, onAdicionar,
}: {
  canais: string[];
  ocultos: Set<string>;
  normalizar: (nome: string) => string;
  onAlternar: (canal: string) => void;
  /** devolve um texto de erro se não conseguir criar */
  onAdicionar: (nome: string) => Promise<string | null>;
}) {
  const [novo, setNovo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const qtdOcultos = canais.filter((c) => ocultos.has(normalizar(c))).length;

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novo.trim()) return;
    setSalvando(true); setMsg(null);
    const erro = await onAdicionar(novo);
    setSalvando(false);
    if (erro) setMsg(erro); else setNovo("");
  };

  return (
    <div data-canais-mapa className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl mb-6 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider">Canais exibidos</h3>
        <span className="text-[11px] text-slate-500">
          Clique para ocultar ou mostrar{qtdOcultos > 0 ? ` · ${qtdOcultos} oculto(s)` : ""}. A escolha vale para todos e fica salva.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {canais.map((c) => {
          const oculto = ocultos.has(normalizar(c));
          return (
            <button
              key={c} type="button" data-chip-canal={c} data-oculto={oculto ? "1" : "0"} onClick={() => onAlternar(c)}
              title={oculto ? "Oculto no painel. Clique para mostrar." : "Visível no painel. Clique para ocultar."}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer transition-colors ${
                oculto
                  ? "border-dashed border-slate-700 text-slate-500 line-through hover:text-slate-300"
                  : "border-indigo-500/60 bg-indigo-600/20 text-indigo-200 hover:bg-indigo-600/30"
              }`}
            >
              {oculto ? "🚫 " : "👁 "}{c}
            </button>
          );
        })}
        {canais.length === 0 && <span className="text-xs text-slate-500">Nenhum canal configurado.</span>}
      </div>
      <form onSubmit={adicionar} className="flex flex-wrap items-center gap-2" data-form-canal-mapa>
        <input
          type="text" value={novo} onChange={(e) => setNovo(e.target.value)} maxLength={40} placeholder="Adicionar outro canal (ex.: Kabum)" data-novo-canal-mapa
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 w-64"
        />
        <button
          type="submit" disabled={salvando || !novo.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer disabled:opacity-40"
        >
          {salvando ? "Adicionando…" : "+ Adicionar canal"}
        </button>
        {msg && <span data-msg-canal className="text-xs font-bold text-rose-300">{msg}</span>}
      </form>
    </div>
  );
}
