"use client";
// Relatórios > Afiliados > Configurações: escolhe quais canais aparecem no menu Afiliados (nem todo canal tem afiliados).
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import ConfigCanalAfiliados from "./ConfigCanal";
import { slugCanal } from "../../lib/adsImportDb";
import { carregarCanaisAfiliados, salvarCanaisAfiliados } from "../../lib/afiliadosDb";

export default function AfiliadosConfiguracoes() {
  const router = useRouter();
  const [todos, setTodos] = useState<string[]>([]);
  const [visiveis, setVisiveis] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [canalCfg, setCanalCfg] = useState<string>("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    (async () => {
      const { data } = await supabase.from("config_regras_canais").select("canal").order("id");
      const lista = Array.from(new Set((data || []).map((c: any) => String(c.canal || "").trim()).filter(Boolean)));
      setTodos(lista);
      const vis = await carregarCanaisAfiliados(supabase, lista);
      setVisiveis(vis);
      const pedido = new URLSearchParams(window.location.search).get("canal") || "";
      setCanalCfg(vis.find((c) => slugCanal(c) === pedido) || vis[0] || "");
      setCarregando(false);
    })();
  }, [router]);

  const alternar = async (canal: string) => {
    const aparece = visiveis.includes(canal);
    const novo = todos.filter((c) => (c === canal ? !aparece : visiveis.includes(c)));
    setVisiveis(novo);
    setCanalCfg((atual) => (novo.includes(atual) ? atual : novo[0] || ""));
    const erro = await salvarCanaisAfiliados(supabase, novo);
    setMsg(erro ? { tipo: "erro", texto: erro } : { tipo: "ok", texto: aparece ? `${canal} saiu do menu Afiliados.` : `${canal} agora aparece no menu Afiliados.` });
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Afiliados · Configurações</h1>
            <p className="text-sm font-medium text-slate-400">Canais do menu, colunas da planilha, perfis da loja e comissões dos afiliados</p>
          </div>
          <Navbar />
        </div>

        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl max-w-4xl" data-afil-config-canais>
          <h2 className="text-lg font-bold text-white">Canais do menu Afiliados</h2>
          <p className="text-xs text-slate-400 mt-1 mb-5">Nem todo canal tem afiliados: deixe visíveis só os que têm. Cada canal visível ganha a sua própria página em Relatórios &gt; Afiliados, só com o painel de dados; as colunas, os perfis da loja e as comissões ficam logo abaixo, nesta página. Ocultar um canal não apaga nada, só tira do menu.</p>
          {carregando ? <p className="text-sm text-slate-400">Carregando canais…</p> : (
            <ul className="divide-y divide-slate-800/70 border border-slate-800 rounded-xl overflow-hidden">
              {todos.map((c) => {
                const aparece = visiveis.includes(c);
                return (
                  <li key={c} data-afil-canal-linha={c} className="flex items-center gap-4 px-4 py-3 bg-slate-950/40">
                    <span className="font-bold text-sm text-slate-100 flex-1">{c}</span>
                    {aparece && <Link href={`/afiliados/${slugCanal(c)}`} className="text-[11px] font-bold text-purple-400 hover:text-purple-300">Abrir</Link>}
                    <button type="button" data-afil-alternar={c} onClick={() => alternar(c)} aria-pressed={aparece}
                      className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border cursor-pointer ${aparece ? "bg-emerald-950/60 border-emerald-700 text-emerald-300" : "bg-slate-900 border-slate-700 text-slate-500"}`}>
                      {aparece ? "Visível" : "Oculto"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {msg && <p data-afil-msg-canais className={`mt-4 text-xs font-bold ${msg.tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{msg.texto}</p>}
        </div>

        <div className="mt-8 max-w-5xl" data-afil-config-comissoes>
          <h2 className="text-lg font-bold text-white mb-1">Colunas e comissões por canal</h2>
          <p className="text-xs text-slate-400 mb-4">Escolha o canal para definir de onde ler o afiliado e o método de venda, quais perfis são da loja e quanto cada afiliado recebe de comissão.</p>
          {carregando ? null : visiveis.length === 0 ? (
            <p data-afil-sem-canais className="text-sm text-slate-400 bg-slate-900/90 border border-slate-800 rounded-2xl p-6">Deixe pelo menos um canal visível acima para configurar as comissões dele.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-5">
                {visiveis.map((c) => (
                  <button key={c} type="button" data-afil-config-canal-sel={c} onClick={() => setCanalCfg(c)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border ${canalCfg === c ? "bg-purple-600 border-purple-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{c}</button>
                ))}
              </div>
              {canalCfg && <ConfigCanalAfiliados key={canalCfg} canal={canalCfg} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
