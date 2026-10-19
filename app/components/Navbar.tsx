"use client";
import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();

  const handleSair = () => {
    localStorage.removeItem("usuario_logado");
    router.push("/login");
  };

  return (
    <nav className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-3 flex items-center justify-between shadow-xl print:hidden">
      {/* Esquerda: Logo / Título */}
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-sm font-black text-white tracking-tight">Relatórios Mensais</h2>
          <p className="text-[10px] text-slate-400">Gestão de Performance e Compras — Best Fit</p>
        </div>
      </div>

      {/* Direita: Menus com Dropdown por Hover */}
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
        
        {/* Relatórios (Dropdown) */}
        <div className="relative group">
          <button className="px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-all flex items-center gap-1 cursor-pointer">
            Relatórios ▾
          </button>
          <div className="absolute top-full left-0 mt-1 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 hidden group-hover:block z-50">
            <Link
              href="/mapeamento"
              className={`block px-4 py-2 transition-all ${
                pathname?.includes("/mapeamento") ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              Cadastros
            </Link>
            <Link
              href="/"
              className={`block px-4 py-2 transition-all ${
                pathname === "/" ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              Curva ABC
            </Link>
            <Link
              href="/ads"
              className={`block px-4 py-2 transition-all ${
                pathname?.includes("/ads") ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              Adsense
            </Link>
            <Link
              href="/devolucoes"
              className={`block px-4 py-2 transition-all ${
                pathname?.includes("/devolucoes") ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              Devoluções
            </Link>
            <Link
              href="/full"
              className={`block px-4 py-2 transition-all ${
                pathname?.includes("/full") ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              Full / FBA
            </Link>
          </div>
        </div>

        {/* Ferramentas (Dropdown) */}
        <div className="relative group">
          <button className="px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-all flex items-center gap-1 cursor-pointer">
            Ferramentas ▾
          </button>
          <div className="absolute top-full left-0 mt-1 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 hidden group-hover:block z-50">
            <Link
              href="/plp"
              className={`block px-4 py-2 transition-all ${
                pathname?.includes("/plp") ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              PLPs
            </Link>
          </div>
        </div>

        {/* Configurações (Dropdown) */}
        <div className="relative group">
          <button className="px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-all flex items-center gap-1 cursor-pointer">
            Configurações ▾
          </button>
          <div className="absolute top-full left-0 mt-1 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 hidden group-hover:block z-50">
            <Link
              href="/regras"
              className={`block px-4 py-2 transition-all ${
                pathname?.includes("/regras") ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              Regras
            </Link>
            <Link
              href="/upload"
              className={`block px-4 py-2 transition-all ${
                pathname?.includes("/upload") ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              Uploads
            </Link>
            <Link
              href="/admin"
              className={`block px-4 py-2 transition-all ${
                pathname?.includes("/admin") ? "bg-purple-600 text-white" : "text-slate-300 hover:bg-purple-600 hover:text-white"
              }`}
            >
              Admin
            </Link>
          </div>
        </div>

        {/* Agenda */}
        <Link
          href="/agenda"
          className={`px-3 py-2 rounded-xl transition-all ${
            pathname?.includes("/agenda") ? "bg-purple-600 text-white shadow-md" : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          Agenda
        </Link>

        {/* Sair */}
        <button
          onClick={handleSair}
          className="ml-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
        >
          Sair
        </button>
      </div>
    </nav>
  );
}