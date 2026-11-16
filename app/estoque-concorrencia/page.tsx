"use client";
// Acompanhamento de estoque da concorrência (menu Ferramentas): sub-abas Acompanhamento e Configurações.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import EstoquePainel from "../components/estoque/EstoquePainel";
import EstoqueConfig from "../components/estoque/EstoqueConfig";
import { supabase } from "../../lib/supabase";
import { CANAIS_ESTOQUE } from "../../lib/estoqueConcorrencia/links";
import { CAMPO_CANAIS_ESTOQUE, canaisVisiveis } from "../../lib/estoqueConcorrencia/config";

type Aba = "acompanhamento" | "configuracoes";

export default function EstoqueConcorrenciaPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("acompanhamento");
  const [visiveis, setVisiveis] = useState<string[] | null>(null);
  const [canal, setCanal] = useState<string>("");

  useEffect(() => {
    const salvo = localStorage.getItem("usuario_logado");
    if (!salvo) { router.push("/login"); return; }
    try { setUsuario(String(JSON.parse(salvo).email || "")); } catch { router.push("/login"); return; }
    if (new URLSearchParams(window.location.search).get("aba") === "configuracoes") setAba("configuracoes");
    (async () => {
      const { data } = await supabase.from("config_regras_tiny").select("coluna").eq("campo", CAMPO_CANAIS_ESTOQUE).maybeSingle();
      setVisiveis(canaisVisiveis(data ? String((data as any).coluna ?? "") : null));
    })();
  }, [router]);
  useEffect(() => { if (visiveis && !visiveis.includes(canal)) setCanal(visiveis[0] || ""); }, [visiveis, canal]);

  const escolher = (a: Aba) => {
    setAba(a);
    try { window.history.replaceState(null, "", a === "acompanhamento" ? "/estoque-concorrencia" : "/estoque-concorrencia?aba=configuracoes"); } catch { /* sem histórico */ }
  };
  const nomeDoCanal = (id: string) => CANAIS_ESTOQUE.find((c) => c.id === id)?.nome ?? id;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Acompanhamento de estoque</h1>
            <p className="text-sm font-medium text-slate-400" data-descricao-aba>Cole o link do anúncio da concorrência: o painel lê o estoque todo dia e avisa quando acabar.</p>
          </div>
          <Navbar />
        </div>

        <nav className="flex flex-wrap items-center gap-2 mb-6" role="tablist" data-abas-estoque>
          {([["acompanhamento", "📦 Acompanhamento"], ["configuracoes", "⚙️ Configurações"]] as [Aba, string][]).map(([id, rotulo]) => (
            <button key={id} role="tab" aria-selected={aba === id} data-aba-estoque={id} onClick={() => escolher(id)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-colors ${aba === id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>{rotulo}</button>
          ))}
        </nav>

        {usuario !== null && visiveis !== null && (aba === "configuracoes"
          ? <EstoqueConfig visiveis={visiveis} onSalvar={setVisiveis} />
          : visiveis.length === 0
            ? <p data-sem-canais className="text-sm text-slate-400 border border-dashed border-slate-700 rounded-xl p-8 text-center">Nenhum canal está à vista. Ligue um canal na sub-aba <b>Configurações</b>.</p>
            : (
              <div className="space-y-5">
                {visiveis.length > 1 && (
                  <nav className="flex flex-wrap gap-2" data-canais-estoque>
                    {visiveis.map((id) => (
                      <button key={id} data-canal-aba={id} onClick={() => setCanal(id)} className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer border ${canal === id ? "bg-slate-100 text-slate-900 border-slate-100" : "bg-slate-900 text-slate-300 border-slate-700 hover:text-white"}`}>{nomeDoCanal(id)}</button>
                    ))}
                  </nav>
                )}
                {canal && <EstoquePainel key={canal} canal={canal} nomeCanal={nomeDoCanal(canal)} usuario={usuario} />}
              </div>
            ))}
      </div>
    </div>
  );
}
