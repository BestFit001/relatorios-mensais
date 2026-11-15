"use client";
// Relatórios > Afiliados: vendas por afiliados x próprias, comissão paga e método de venda de cada canal (começa pelo TikTok).
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import AfiliadosAds from "../ads/AfiliadosAds";
import { ehCanalTikTok } from "../../lib/afiliados";

const mesAtualBR = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const MESES = [2026, 2027].flatMap((a) => Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${a}`));

export default function AfiliadosPagina() {
  const router = useRouter();
  const [canais, setCanais] = useState<string[]>([]);
  const [canal, setCanal] = useState<string>("");
  const [mes, setMes] = useState<string>(mesAtualBR());

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    (async () => {
      const { data } = await supabase.from("config_regras_canais").select("canal").order("id");
      const lista = Array.from(new Set((data || []).map((c: any) => String(c.canal || "").trim()).filter(Boolean)));
      setCanais(lista);
      setCanal(lista.find(ehCanalTikTok) || lista[0] || "");
    })();
  }, [router]);

  const meses = useMemo(() => MESES, []);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Afiliados</h1>
            <p className="text-sm font-medium text-slate-400">Vendas por afiliados, comissão paga e como cada um vende</p>
          </div>
          <Navbar />
        </div>

        {canais.length > 1 && (
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl mb-6 flex flex-wrap items-center gap-3" data-afil-canais>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Canal</span>
            {canais.map((c) => (
              <button key={c} type="button" data-afil-canal={c} onClick={() => setCanal(c)}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border ${canal === c ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{c}</button>
            ))}
          </div>
        )}

        {canal ? <AfiliadosAds key={canal} canal={canal} mes={mes} setMes={setMes} meses={meses} /> : <p className="p-8 text-center text-slate-400">Carregando canais…</p>}
      </div>
    </div>
  );
}
