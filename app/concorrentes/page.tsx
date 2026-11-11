"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import ConcorrentesPainel from "../components/ConcorrentesPainel";
import PesquisaImagem from "../components/concorrentes/PesquisaImagem";
import AnaliseMercadoPainel from "../components/AnaliseMercadoPainel";

type Aba = "mercadolivre" | "shopee" | "amazon" | "pesquisa-imagem" | "analise-mercado";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "mercadolivre", rotulo: "🛒 Mercado Livre" },
  { id: "shopee", rotulo: "🧡 Shopee" },
  { id: "amazon", rotulo: "📦 Amazon" },
  { id: "pesquisa-imagem", rotulo: "🔎 Pesquisa por imagem" },
  { id: "analise-mercado", rotulo: "📊 Análise de mercado" },
];
const DESCRICAO: Record<Aba, string> = {
  mercadolivre: "Acompanhe todo dia o preço e as vendas dos anúncios do Mercado Livre e veja as palavras-chave que os concorrentes mais usam.",
  shopee: "Acompanhe os preços e as vendas dos produtos da Shopee: o seu navegador lê a página e o painel guarda o histórico.",
  amazon: "Acompanhe os preços, as compras do mês e o Mais vendidos da Amazon: o seu navegador lê a página e o painel guarda o histórico.",
  "pesquisa-imagem": "Informe o SKU, o seu PDV e a foto do produto: veja o preço do item em cada canal que o Google encontrar e quanto você lucraria.",
  "analise-mercado": "Compare preços da concorrência e descubra o custo ideal ou o preço de venda indicado, com as regras de cada canal.",
};

export default function ConcorrentesPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("mercadolivre");

  useEffect(() => {
    const salvo = localStorage.getItem("usuario_logado");
    if (!salvo) { router.push("/login"); return; }
    try { setUsuario(String(JSON.parse(salvo).email || "")); } catch { router.push("/login"); return; }
    const pedida = new URLSearchParams(window.location.search).get("aba");
    if (ABAS.some((a) => a.id === pedida)) setAba(pedida as Aba);
  }, [router]);

  const escolher = (id: Aba) => {
    setAba(id);
    // guarda a aba no endereço: recarregar ou copiar o link volta para a mesma aba
    try { window.history.replaceState(null, "", id === "mercadolivre" ? "/concorrentes" : `/concorrentes?aba=${id}`); } catch { /* sem histórico: só não grava */ }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Análise da concorrência</h1>
            <p className="text-sm font-medium text-slate-400" data-descricao-aba>{DESCRICAO[aba]}</p>
          </div>
          <Navbar />
        </div>

        <nav className="flex flex-wrap items-center gap-2 mb-6" role="tablist" data-abas-principais>
          {ABAS.map((a) => (
            <button key={a.id} role="tab" aria-selected={aba === a.id} data-aba-principal={a.id} onClick={() => escolher(a.id)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-colors ${aba === a.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>
              {a.rotulo}
            </button>
          ))}
        </nav>

        {usuario !== null && (
          aba === "pesquisa-imagem" ? <PesquisaImagem />
            : aba === "analise-mercado" ? <AnaliseMercadoPainel usuario={usuario} />
              : <ConcorrentesPainel key={aba} canal={aba} />
        )}
      </div>
    </div>
  );
}
