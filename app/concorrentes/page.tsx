"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import ConcorrentesPainel from "../components/ConcorrentesPainel";

export default function ConcorrentesPage() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    setPronto(true);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Monitor de concorrentes</h1>
            <p className="text-sm font-medium text-slate-400">Acompanhe todo dia o preço e as vendas dos anúncios de uma categoria e veja as palavras-chave que os concorrentes mais usam.</p>
          </div>
          <Navbar />
        </div>
        {pronto && <ConcorrentesPainel />}
      </div>
    </div>
  );
}
