"use client";
// Configurações do Acompanhamento de estoque: quais canais ficam à vista na tela.
import React from "react";
import { supabase } from "../../../lib/supabase";
import { CANAIS_ESTOQUE } from "../../../lib/estoqueConcorrencia/links";
import { CAMPO_CANAIS_ESTOQUE } from "../../../lib/estoqueConcorrencia/config";
import { caixa } from "../concorrentes/comum";

export default function EstoqueConfig({ visiveis, onSalvar }: { visiveis: string[]; onSalvar: (ids: string[]) => void }) {
  const [msg, setMsg] = React.useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const alternar = async (id: string) => {
    const novos = visiveis.includes(id) ? visiveis.filter((x) => x !== id) : [...visiveis, id];
    const { error } = await supabase.from("config_regras_tiny").upsert({ campo: CAMPO_CANAIS_ESTOQUE, coluna: novos.join(",") }, { onConflict: "campo" });
    if (error) { setMsg({ tipo: "erro", texto: "Não consegui salvar: " + error.message }); return; }
    onSalvar(novos); setMsg({ tipo: "ok", texto: "Salvo." });
  };
  return (
    <section className={`${caixa} p-5 space-y-4 max-w-2xl`} data-estoque-config>
      <div>
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">Canais à vista</h2>
        <p className="text-xs text-slate-400 mt-1">Escolha em quais canais o acompanhamento de estoque aparece. Desligar um canal só esconde a aba: os anúncios e o histórico continuam guardados e voltam quando ligar de novo.</p>
      </div>
      <ul className="space-y-2">
        {CANAIS_ESTOQUE.map((c) => {
          const ligado = c.disponivel && visiveis.includes(c.id);
          return (
            <li key={c.id}>
              <label className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${c.disponivel ? "border-slate-700 bg-slate-950 cursor-pointer" : "border-slate-800 bg-slate-950/50 opacity-60"}`}>
                <input type="checkbox" data-canal-estoque={c.id} checked={ligado} disabled={!c.disponivel} onChange={() => alternar(c.id)} className="w-4 h-4 accent-indigo-500" />
                <span className="text-sm font-bold text-slate-100">{c.nome}</span>
                {!c.disponivel && <span className="text-[11px] text-slate-500">em breve: o servidor e o favorito ainda não sabem ler o estoque deste site</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {msg && <p data-msg-config className={`text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{msg.texto}</p>}
    </section>
  );
}
