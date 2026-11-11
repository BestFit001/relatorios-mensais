"use client";
import React from "react";

/** Botão de favorito (estrela). */
export default function Estrela({ ativo, onClick, className = "" }: { ativo: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" data-acao="favorito" aria-pressed={ativo} onClick={onClick} title={ativo ? "Remover dos favoritos" : "Marcar como favorito para acompanhar"}
      className={`text-lg leading-none cursor-pointer transition-colors ${ativo ? "text-amber-400 hover:text-amber-300" : "text-slate-600 hover:text-amber-300"} ${className}`}>
      {ativo ? "★" : "☆"}
    </button>
  );
}
