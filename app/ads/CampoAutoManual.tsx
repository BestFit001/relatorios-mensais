"use client";
// Valor automático (em tempo real) com lápis para ajustar à mão. O ajuste vale só na Análise global do Adsense.
import React, { useEffect, useRef, useState } from "react";
import { numeroBR } from "../../lib/adsImport";

const fmt = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const emTexto = (v: number) => (v > 0 ? String(Number(v.toFixed(2))).replace(".", ",") : "");

type Props = { id: string; auto: number; manual: number | null; onSalvar: (valor: number | null) => void | Promise<void>; tituloAuto: string; cor?: string; alinhar?: "left" | "right"; carregando?: boolean };

export default function CampoAutoManual({ id, auto, manual, onSalvar, tituloAuto, cor = "text-emerald-400", alinhar = "left", carregando = false }: Props) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const salvou = useRef(false);
  const efetivo = manual !== null ? manual : auto;
  useEffect(() => { if (!editando) setTexto(emTexto(efetivo)); }, [efetivo, editando]);

  const abrir = () => { salvou.current = false; setTexto(emTexto(efetivo)); setEditando(true); };
  const confirmar = async () => {
    if (salvou.current) return; salvou.current = true;
    const t = texto.trim(); setEditando(false);
    if (t === "") { if (manual !== null) await onSalvar(null); return; }
    const n = numeroBR(t);
    if (!Number.isFinite(n) || n < 0) return;
    if (manual === null && Math.abs(n - auto) < 0.005) return;   // igual ao automático: nada a ajustar
    if (manual !== null && Math.abs(n - manual) < 0.005) return;
    await onSalvar(n);
  };
  const cancelar = () => { salvou.current = true; setEditando(false); };

  return (
    <div className={`flex items-center gap-2 ${alinhar === "right" ? "justify-end" : ""}`} data-campo-auto={id}>
      {carregando ? (
        <span className="font-mono text-xs text-slate-500" data-campo-auto-carregando={id}>carregando…</span>
      ) : editando ? (
        <input autoFocus data-campo-auto-input={id} inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
          onKeyDown={(e) => { if (e.key === "Enter") confirmar(); if (e.key === "Escape") cancelar(); }}
          placeholder="Vazio volta ao automático" className={`w-full min-w-[120px] bg-slate-900 border border-purple-500 rounded-lg p-2 text-xs font-mono ${cor} outline-none ${alinhar === "right" ? "text-right" : ""}`} />
      ) : (
        <>
          <span data-campo-auto-valor={id} title={manual !== null ? `Ajustado à mão (automático: ${fmt(auto)})` : tituloAuto} className={`font-mono font-bold text-xs ${manual !== null ? "text-amber-300" : cor}`}>{fmt(efetivo)}</span>
          <button type="button" data-campo-auto-lapis={id} onClick={abrir} title="Ajustar à mão (vale só nesta aba)" className="text-slate-500 hover:text-white cursor-pointer text-xs leading-none">✏️</button>
          {manual !== null && (
            <>
              <span className="text-[9px] font-black uppercase tracking-wider text-amber-300 bg-amber-950/40 border border-amber-900/50 rounded px-1.5 py-0.5">manual</span>
              <button type="button" data-campo-auto-voltar={id} onClick={() => onSalvar(null)} title={`Voltar ao automático (${fmt(auto)})`} className="text-[11px] text-slate-400 hover:text-white cursor-pointer leading-none">↺</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
