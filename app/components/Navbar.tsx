"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [paginasPermitidas, setPaginasPermitidas] = useState<string[]>([]);
  const [perfilUsuario, setPerfilUsuario] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");
  const [menuExpandido, setMenuExpandido] = useState<string | null>("relatorios");

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (usuarioLogado) {
      try {
        const user = JSON.parse(usuarioLogado);
        setEmailUsuario(user.email || "");
        setPerfilUsuario(user.perfil || "compras");
        if (user.perfil === "admin") {
          setPaginasPermitidas([
            "/",
            "/mapeamento",
            "/ads",
            "/devolucoes",
            "/full",
            "/plp",
            "/agenda",
            "/regras",
            "/upload",
            "/admin",
            "/calculadora",
            "/promocoes",
            "/produtos",
            "/padronizacao"
          ]);
        } else {
          setPaginasPermitidas(user.paginas_permitidas || ["/"]);
        }
      } catch (e) {
        setPaginasPermitidas(["/"]);
      }
    }
  }, []);

  const temPermissao = (rota: string) => {
    return paginasPermitidas.includes(rota);
  };

  const handleSair = () => {
    localStorage.removeItem("usuario_logado");
    router.push("/login");
  };

  const toggleSecao = (secao: string) => {
    setMenuExpandido(menuExpandido === secao ? null : secao);
  };

  return (
    <>
      {/* SIDEBAR LATERAL FIXA (ESTILO TINY / OLIST) */}
      <aside className="fixed top-0 left-0 h-full w-64 bg-[#0b0e14] border-r border-slate-800 flex flex-col justify-between z-50 select-none print:hidden shadow-2xl font-sans">
        
        {/* TOPO DA SIDEBAR: LOGO E IDENTIFICAÇÃO */}
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3 bg-slate-950/40">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-purple-900/40">
            BF
          </div>
          <div className="overflow-hidden">
            <h2 className="text-sm font-black text-white tracking-tight truncate">Hub Best Fit</h2>
            <p className="text-[10px] text-slate-400 truncate">Performance & E-commerce</p>
          </div>
        </div>

        {/* MENU DE NAVEGAÇÃO LATERAL */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 text-xs font-semibold">
          
          {/* SEÇÃO: DASHBOARD / INÍCIO */}
          {temPermissao("/") && (
            <Link
              href="/"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                pathname === "/" ? "bg-purple-600 text-white shadow-md shadow-purple-900/30 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <span className="text-base">📊</span> Curva ABC (Início)
            </Link>
          )}

          {/* SEÇÃO: RELATÓRIOS */}
          {(temPermissao("/mapeamento") || temPermissao("/ads") || temPermissao("/devolucoes") || temPermissao("/full")) && (
            <div>
              <button
                onClick={() => toggleSecao("relatorios")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-3"><span className="text-base">📈</span> Relatórios</span>
                <span className={`transform transition-transform text-[10px] ${menuExpandido === "relatorios" ? "rotate-180" : ""}`}>▼</span>
              </button>

              {menuExpandido === "relatorios" && (
                <div className="pl-9 space-y-1 mt-1 border-l border-slate-800 ml-4 py-1">
                  {temPermissao("/mapeamento") && (
                    <Link href="/mapeamento" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/mapeamento") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Cadastros
                    </Link>
                  )}
                  {temPermissao("/ads") && (
                    <Link href="/ads" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/ads") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Adsense / Ads
                    </Link>
                  )}
                  {temPermissao("/devolucoes") && (
                    <Link href="/devolucoes" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/devolucoes") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Devoluções
                    </Link>
                  )}
                  {temPermissao("/full") && (
                    <Link href="/full" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/full") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Full / FBA
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SEÇÃO: FERRAMENTAS */}
          {(temPermissao("/calculadora") || temPermissao("/promocoes") || temPermissao("/produtos") || temPermissao("/padronizacao") || temPermissao("/plp")) && (
            <div>
              <button
                onClick={() => toggleSecao("ferramentas")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-3"><span className="text-base">🛠️</span> Ferramentas</span>
                <span className={`transform transition-transform text-[10px] ${menuExpandido === "ferramentas" ? "rotate-180" : ""}`}>▼</span>
              </button>

              {menuExpandido === "ferramentas" && (
                <div className="pl-9 space-y-1 mt-1 border-l border-slate-800 ml-4 py-1">
                  {temPermissao("/calculadora") && (
                    <Link href="/calculadora" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/calculadora") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Calculadora
                    </Link>
                  )}
                  {temPermissao("/promocoes") && (
                    <Link href="/promocoes" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/promocoes") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Promoções
                    </Link>
                  )}
                  {temPermissao("/produtos") && (
                    <Link href="/produtos" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/produtos") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Produtos & Vídeos
                    </Link>
                  )}
                  {temPermissao("/padronizacao") && (
                    <Link href="/padronizacao" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/padronizacao") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Padronização IA
                    </Link>
                  )}
                  {temPermissao("/plp") && (
                    <Link href="/plp" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/plp") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      PLPs (Expedição)
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SEÇÃO: CONFIGURAÇÕES */}
          {(temPermissao("/regras") || temPermissao("/upload") || temPermissao("/admin")) && (
            <div>
              <button
                onClick={() => toggleSecao("config")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-3"><span className="text-base">⚙️</span> Configurações</span>
                <span className={`transform transition-transform text-[10px] ${menuExpandido === "config" ? "rotate-180" : ""}`}>▼</span>
              </button>

              {menuExpandido === "config" && (
                <div className="pl-9 space-y-1 mt-1 border-l border-slate-800 ml-4 py-1">
                  {temPermissao("/regras") && (
                    <Link href="/regras" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/regras") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Regras Gerais
                    </Link>
                  )}
                  {temPermissao("/upload") && (
                    <Link href="/upload" className="block px-3 py-2 rounded-lg transition-all text-slate-400 hover:text-white">
                      Uploads Base
                    </Link>
                  )}
                  {temPermissao("/admin") && (
                    <Link href="/admin" className={`block px-3 py-2 rounded-lg transition-all ${pathname?.includes("/admin") ? "text-purple-400 font-bold bg-purple-950/30" : "text-slate-400 hover:text-white"}`}>
                      Painel Admin
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AGENDA */}
          {temPermissao("/agenda") && (
            <Link
              href="/agenda"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                pathname?.includes("/agenda") ? "bg-purple-600 text-white shadow-md shadow-purple-900/30 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <span className="text-base">📅</span> Agenda
            </Link>
          )}

        </div>

        {/* RODAPÉ DA SIDEBAR: PERFIL E SAIR */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 space-y-3">
          <div className="overflow-hidden">
            <p className="text-[11px] font-bold text-white truncate">{emailUsuario || "Utilizador"}</p>
            <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-950 text-purple-300 border border-purple-800/50">
              {perfilUsuario}
            </span>
          </div>

          <button
            onClick={handleSair}
            className="w-full bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-900/50 font-bold py-2 px-3 rounded-xl text-[11px] uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <span>🚪</span> Sair da Conta
          </button>
        </div>

      </aside>

      {/* ESPAÇAMENTO PARA COMPENSAR A SIDEBAR FIXA NAS PÁGINAS */}
      <style jsx global>{`
        body {
          background-color: #0d0f18 !important;
        }
        /* Ajusta o container principal de todas as páginas para abrir ao lado da sidebar */
        .min-h-screen {
          padding-left: 17rem !important;
        }
        @media (max-width: 768px) {
          aside {
            display: none !important;
          }
          .min-h-screen {
            padding-left: 1rem !important;
          }
        }
      `}</style>
    </>
  );
}