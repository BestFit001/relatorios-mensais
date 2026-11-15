"use client";
// Relatórios > Afiliados > (canal): painel de vendas por afiliados, comissão e método de venda do canal.
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import Navbar from "../../components/Navbar";
import AfiliadosAds from "../../ads/AfiliadosAds";
import { slugCanal } from "../../../lib/adsImportDb";

const mesAtualBR = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const MESES = [2026, 2027].flatMap((a) => Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${a}`));

export default function AfiliadosCanal() {
  const router = useRouter();
  const slug = String(useParams<{ canal: string }>()?.canal || "");
  const [canal, setCanal] = useState<string | null>(null);
  const [naoAchou, setNaoAchou] = useState(false);
  const [mes, setMes] = useState<string>(mesAtualBR());
  const meses = useMemo(() => MESES, []);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    setCanal(null); setNaoAchou(false);
    (async () => {
      const { data } = await supabase.from("config_regras_canais").select("canal").order("id");
      const achado = (data || []).map((c: any) => String(c.canal || "").trim()).find((c: string) => slugCanal(c) === slug);
      if (achado) setCanal(achado); else setNaoAchou(true);
    })();
  }, [router, slug]);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex gap-4">
              <Link href="/afiliados" data-voltar-afiliados className="text-[11px] font-bold text-purple-400 hover:text-purple-300">← Afiliados · Configurações</Link>
              <Link href={`/afiliados?canal=${slug}`} data-afil-config-link className="text-[11px] font-bold text-purple-400 hover:text-purple-300">⚙️ Definir comissões e colunas</Link>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Afiliados · {canal || "…"}</h1>
            <p className="text-sm font-medium text-slate-400">Vendas por afiliados, comissão paga, como cada um vende e produtos mais vendidos</p>
          </div>
          <Navbar />
        </div>
        {naoAchou && (
          <div className="bg-rose-950/30 border border-rose-900/50 text-rose-300 text-sm rounded-2xl p-6">
            Não encontrei esse canal. Escolha um canal no menu Relatórios &gt; Afiliados (ou veja quais canais aparecem em Afiliados &gt; Configurações).
          </div>
        )}
        {canal && <AfiliadosAds key={canal} canal={canal} mes={mes} setMes={setMes} meses={meses} />}
      </div>
    </div>
  );
}
