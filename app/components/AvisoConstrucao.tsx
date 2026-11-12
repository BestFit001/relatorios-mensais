"use client";
// Aviso "Aba em construção, deseja continuar?" em qualquer página marcada no Painel Admin > Configurações.
// A tela carrega com o fundo embaçado e uma única mensagem no meio: "Sim" libera a página, "Não" volta para o Início.
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const semBarraFinal = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

export default function AvisoConstrucao() {
  const pathname = usePathname();
  const router = useRouter();
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    let vivo = true;
    setMostrar(false);
    const rota = semBarraFinal(pathname || "/");
    if (rota === "/login" || rota === "/admin" || rota === "/inicio") return;   // nunca bloqueia o login, o admin (onde se desliga o aviso) nem o Início
    (async () => {
      try {
        const { data, error } = await supabase.from("abas_em_construcao").select("rota").eq("ativo", true).eq("rota", rota);
        if (!vivo || error) return;
        setMostrar(!!data && data.length > 0);
      } catch { /* sem a tabela ou sem rede: a página abre normalmente */ }
    })();
    return () => { vivo = false; };
  }, [pathname]);

  if (!mostrar) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="aviso-construcao-titulo" data-aviso-construcao
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 text-center">
        <div className="text-4xl mb-3" aria-hidden>🚧</div>
        <h2 id="aviso-construcao-titulo" className="text-lg font-black text-white mb-6">Aba em construção, deseja continuar?</h2>
        <div className="flex gap-3 justify-center">
          <button type="button" autoFocus onClick={() => setMostrar(false)}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-sm cursor-pointer">Sim</button>
          <button type="button" onClick={() => router.push("/inicio")}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-sm border border-slate-700 cursor-pointer">Não</button>
        </div>
      </div>
    </div>
  );
}
