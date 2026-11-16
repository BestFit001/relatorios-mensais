"use client";
// Seletor de campanha do Mercado Livre: "Geral" (todas somadas) + uma opção por campanha. Usado em Campanhas, Análise e Atual vs anterior.
import React from "react";

export type OpcaoCampanha = { chave: string; nome: string; nota?: string };

export default function SeletorCampanhaML({ opcoes, valor, onChange, geral = "Geral (soma das campanhas)", attr }: { opcoes: OpcaoCampanha[]; valor: string; onChange: (v: string) => void; geral?: string; attr?: Record<string, string> }) {
  if (opcoes.length < 2) return null;
  const chip = (v: string, rotulo: string, nota?: string) => (
    <button key={v} type="button" data-camp-chip={v} aria-pressed={valor === v} onClick={() => onChange(v)}
      className={`px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${valor === v ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"}`}>
      {rotulo}{nota && <span className={`ml-1.5 font-normal ${valor === v ? "text-purple-200" : "text-slate-500"}`}>{nota}</span>}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2" {...attr}>
      {chip("todas", geral)}
      {opcoes.map((o) => chip(o.chave, o.nome, o.nota))}
    </div>
  );
}
