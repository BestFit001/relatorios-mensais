"use client";
// Compras: controle de estoque e vendas por grade e filial (lojas físicas pelo Shop9; e-commerce pelo Tiny).
// Duas sub-abas: Análise (tabela dinâmica, curva ABC, preço praticado) e Upload (rotina semanal de envio das planilhas).
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import AnaliseCompras from "./AnaliseCompras";
import UploadCompras from "./UploadCompras";

export default function ComprasPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"analise" | "upload">("analise");
  const [versao, setVersao] = useState(0);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    setPronto(true);
  }, [router]);

  const abaCls = (ativa: boolean) => `px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${ativa ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`;
  if (!pronto) return null;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Compras</h1>
            <p className="text-sm font-medium text-slate-400">Estoque, vendas, preço praticado e curva ABC por grade e filial — base para remanejamento e compra</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-3 rounded-2xl border border-slate-800">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1" data-subabas-compras>
            <button data-subaba="analise" onClick={() => setSubAba("analise")} className={abaCls(subAba === "analise")}>📊 Análise</button>
            <button data-subaba="upload" onClick={() => setSubAba("upload")} className={abaCls(subAba === "upload")}>📤 Upload</button>
          </div>
        </div>

        {/* as duas ficam montadas: trocar de aba não perde a prévia de um arquivo já lido nem a tabela montada */}
        <div style={{ display: subAba === "analise" ? "block" : "none" }}><AnaliseCompras versao={versao} /></div>
        <div style={{ display: subAba === "upload" ? "block" : "none" }}><UploadCompras aoGravar={() => setVersao((v) => v + 1)} /></div>
      </div>
    </div>
  );
}
