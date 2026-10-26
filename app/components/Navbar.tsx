"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [paginasPermitidas, setPaginasPermitidas] = useState<string[]>([]);
  const [perfilUsuario, setPerfilUsuario] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");
  const [menuExpandido, setMenuExpandido] = useState<string | null>("relatorios");
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [modoEscuro, setModoEscuro] = useState(true);
  
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    const prefSidebar = localStorage.getItem("hub_bestfit_sidebar_aberta");
    if (prefSidebar !== null) {
      setSidebarAberta(prefSidebar === "true");
    }

    const temaSalvo = localStorage.getItem("hub_bestfit_tema");
    if (temaSalvo === "light") {
      setModoEscuro(false);
      document.documentElement.classList.add("light");
    } else {
      setModoEscuro(true);
      document.documentElement.classList.add("dark");
    }

    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (usuarioLogado) {
      try {
        const user = JSON.parse(usuarioLogado);
        setEmailUsuario(user.email || "");
        setPerfilUsuario(user.perfil || "compras");
        if (user.perfil === "admin") {
          setPaginasPermitidas([
            "/",
            "/marketing",
            "/mapeamento",
            "/ads",
            "/devolucoes",
            "/full",
            "/lives",
            "/plp",
            "/agenda",
            "/regras",
            "/upload",
            "/admin",
            "/calculadora",
            "/promocoes/ml",
            "/promocoes/shopee",
            "/promocoes/magalu",
            "/promocoes/tiktok",
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

    carregarLogoGlobal();
  }, []);

  const toggleSidebar = () => {
    const novoEstado = !sidebarAberta;
    setSidebarAberta(novoEstado);
    localStorage.setItem("hub_bestfit_sidebar_aberta", String(novoEstado));
  };

  const alternarTema = () => {
    const novoEstado = !modoEscuro;
    setModoEscuro(novoEstado);
    if (novoEstado) {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      localStorage.setItem("hub_bestfit_tema", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      localStorage.setItem("hub_bestfit_tema", "light");
    }
  };

  const carregarLogoGlobal = async () => {
    try {
      const { data } = await supabase
        .from("config_regras_tiny")
        .select("coluna")
        .eq("campo", "hub_logo_url")
        .maybeSingle();

      if (data?.coluna) {
        setLogoUrl(data.coluna);
      }
    } catch (err) {
      console.error("Erro ao carregar logo:", err);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `logo_hub_${Date.now()}.${fileExt}`;
      const filePath = `evidencias/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("anexos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("anexos").getPublicUrl(filePath);
      const urlPublica = publicUrlData.publicUrl;

      await supabase.from("config_regras_tiny").upsert(
        { campo: "hub_logo_url", coluna: urlPublica },
        { onConflict: "campo" }
      );

      setLogoUrl(urlPublica);
      alert("✅ Logotipo atualizado e salvo no Supabase para todo o sistema!");
    } catch (err: any) {
      alert("Erro ao fazer upload do logotipo: " + err.message);
    }
    setUploadingLogo(false);
  };

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
      <aside className={`fixed top-0 left-0 h-full bg-[#07090e] border-r border-slate-800/80 flex flex-col justify-between z-50 select-none print:hidden shadow-2xl font-sans transition-all duration-300 ${sidebarAberta ? 'w-60' : 'w-16'}`}>
        
        <div className="p-3 border-b border-slate-800/60 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <label className="relative group cursor-pointer flex-shrink-0" title="Clique para alterar a imagem de perfil/logo no Supabase">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 overflow-hidden flex items-center justify-center font-black text-white text-xs shadow-lg shadow-indigo-950/50 border border-indigo-400/30">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span>BF</span>
                )}
              </div>
              <div className="absolute inset-0 bg-black/70 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[8px] text-white font-bold">
                {uploadingLogo ? "..." : "Trocar"}
              </div>
              <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
            </label>

            {sidebarAberta && (
              <div className="overflow-hidden">
                <h2 className="text-xs font-extrabold text-white tracking-tight truncate">Hub Best Fit</h2>
                <p className="text-[9px] text-slate-400 truncate">Performance</p>
              </div>
            )}
          </div>

          <button
            onClick={toggleSidebar}
            className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-[10px] cursor-pointer transition-all flex-shrink-0"
            title={sidebarAberta ? "Recolher menu" : "Expandir menu"}
          >
            {sidebarAberta ? "◀" : "▶"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1.5 text-xs font-semibold">
          
          {temPermissao("/marketing") && (
            <Link
              href="/marketing"
              title="Marketing"
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all ${
                pathname?.includes("/marketing") ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <span className="text-sm flex-shrink-0">📣</span>
              {sidebarAberta && <span className="truncate">Marketing</span>}
            </Link>
          )}

          {/* RELATÓRIOS (INCLUINDO RELATÓRIO DE LIVE) */}
          {(temPermissao("/") || temPermissao("/mapeamento") || temPermissao("/ads") || temPermissao("/devolucoes") || temPermissao("/full") || temPermissao("/lives")) && (
            <div>
              <button
                onClick={() => sidebarAberta && toggleSecao("relatorios")}
                title="Relatórios"
                className="w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900/60 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-3"><span className="text-sm flex-shrink-0">📈</span> {sidebarAberta && <span className="truncate">Relatórios</span>}</span>
                {sidebarAberta && <span className={`transform transition-transform text-[9px] ${menuExpandido === "relatorios" ? "rotate-180" : ""}`}>▼</span>}
              </button>

              {sidebarAberta && menuExpandido === "relatorios" && (
                <div className="pl-7 space-y-1 mt-1 border-l border-slate-800/80 ml-3 py-1">
                  {temPermissao("/") && (
                    <Link href="/" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname === "/" ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Curva ABC
                    </Link>
                  )}
                  {temPermissao("/mapeamento") && (
                    <Link href="/mapeamento" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/mapeamento") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Cadastros
                    </Link>
                  )}
                  {temPermissao("/ads") && (
                    <Link href="/ads" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/ads") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Adsense / Ads
                    </Link>
                  )}
                  {temPermissao("/devolucoes") && (
                    <Link href="/devolucoes" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/devolucoes") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Devoluções
                    </Link>
                  )}
                  {temPermissao("/full") && (
                    <Link href="/full" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/full") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Full / FBA
                    </Link>
                  )}
                  {temPermissao("/lives") && (
                    <Link href="/lives" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/lives") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      🔴 Relatório de Live
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PROMOÇÕES POR CANAL */}
          {(temPermissao("/promocoes/ml") || temPermissao("/promocoes/shopee") || temPermissao("/promocoes/magalu") || temPermissao("/promocoes/tiktok")) && (
            <div>
              <button
                onClick={() => sidebarAberta && toggleSecao("promocoes")}
                title="Promoções"
                className="w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900/60 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-3"><span className="text-sm flex-shrink-0">🏷️</span> {sidebarAberta && <span className="truncate">Promoções</span>}</span>
                {sidebarAberta && <span className={`transform transition-transform text-[9px] ${menuExpandido === "promocoes" ? "rotate-180" : ""}`}>▼</span>}
              </button>

              {sidebarAberta && menuExpandido === "promocoes" && (
                <div className="pl-7 space-y-1 mt-1 border-l border-slate-800/80 ml-3 py-1">
                  {temPermissao("/promocoes/ml") && (
                    <Link href="/promocoes/ml" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/promocoes/ml") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      🟡 Mercado Livre
                    </Link>
                  )}
                  {temPermissao("/promocoes/magalu") && (
                    <Link href="/promocoes/magalu" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/promocoes/magalu") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      🔵 Magazine Luiza
                    </Link>
                  )}
                  {temPermissao("/promocoes/shopee") && (
                    <Link href="/promocoes/shopee" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/promocoes/shopee") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      🟠 Shopee
                    </Link>
                  )}
                  {temPermissao("/promocoes/tiktok") && (
                    <Link href="/promocoes/tiktok" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/promocoes/tiktok") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      ⚫ TikTok Shop
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* FERRAMENTAS */}
          {(temPermissao("/calculadora") || temPermissao("/produtos") || temPermissao("/padronizacao") || temPermissao("/plp")) && (
            <div>
              <button
                onClick={() => sidebarAberta && toggleSecao("ferramentas")}
                title="Ferramentas"
                className="w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900/60 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-3"><span className="text-sm flex-shrink-0">🛠️</span> {sidebarAberta && <span className="truncate">Ferramentas</span>}</span>
                {sidebarAberta && <span className={`transform transition-transform text-[9px] ${menuExpandido === "ferramentas" ? "rotate-180" : ""}`}>▼</span>}
              </button>

              {sidebarAberta && menuExpandido === "ferramentas" && (
                <div className="pl-7 space-y-1 mt-1 border-l border-slate-800/80 ml-3 py-1">
                  {temPermissao("/calculadora") && (
                    <Link href="/calculadora" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/calculadora") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Calculadora
                    </Link>
                  )}
                  {temPermissao("/produtos") && (
                    <Link href="/produtos" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/produtos") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Produtos & Vídeos
                    </Link>
                  )}
                  {temPermissao("/padronizacao") && (
                    <Link href="/padronizacao" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/padronizacao") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Padronização IA
                    </Link>
                  )}
                  {temPermissao("/plp") && (
                    <Link href="/plp" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/plp") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      PLPs (Expedição)
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CONFIGURAÇÕES */}
          {(temPermissao("/regras") || temPermissao("/upload") || temPermissao("/admin")) && (
            <div>
              <button
                onClick={() => sidebarAberta && toggleSecao("config")}
                title="Configurações"
                className="w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900/60 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-3"><span className="text-sm flex-shrink-0">⚙️</span> {sidebarAberta && <span className="truncate">Configurações</span>}</span>
                {sidebarAberta && <span className={`transform transition-transform text-[9px] ${menuExpandido === "config" ? "rotate-180" : ""}`}>▼</span>}
              </button>

              {sidebarAberta && menuExpandido === "config" && (
                <div className="pl-7 space-y-1 mt-1 border-l border-slate-800/80 ml-3 py-1">
                  {temPermissao("/regras") && (
                    <Link href="/regras" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/regras") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
                      Regras Gerais
                    </Link>
                  )}
                  {temPermissao("/upload") && (
                    <Link href="/upload" className="block px-2.5 py-1.5 rounded-lg transition-all text-slate-400 hover:text-white">
                      Uploads Base
                    </Link>
                  )}
                  {temPermissao("/admin") && (
                    <Link href="/admin" className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname?.includes("/admin") ? "text-indigo-400 font-bold bg-indigo-950/40" : "text-slate-400 hover:text-white"}`}>
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
              title="Agenda"
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all ${
                pathname?.includes("/agenda") ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <span className="text-sm flex-shrink-0">📅</span>
              {sidebarAberta && <span className="truncate">Agenda</span>}
            </Link>
          )}

        </div>

        <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 space-y-2">
          <button
            onClick={alternarTema}
            title="Alternar Tema Claro / Escuro"
            className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-bold py-2 px-2 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <span>{modoEscuro ? "☀️" : "🌙"}</span> {sidebarAberta && <span>{modoEscuro ? "Modo Claro" : "Modo Escuro"}</span>}
          </button>

          {sidebarAberta ? (
            <div className="overflow-hidden px-1">
              <p className="text-[10px] font-bold text-white truncate">{emailUsuario || "Utilizador"}</p>
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                {perfilUsuario}
              </span>
            </div>
          ) : (
            <div className="text-center">
              <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                {perfilUsuario.substring(0, 3)}
              </span>
            </div>
          )}

          <button
            onClick={handleSair}
            title="Sair da Conta"
            className="w-full bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-900/40 font-bold py-2 px-2 rounded-xl text-[10px] uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <span>🚪</span> {sidebarAberta && <span>Sair</span>}
          </button>
        </div>

      </aside>

      <style jsx global>{`
        body {
          background-color: #07090e !important;
        }
        .min-h-screen {
          padding-left: ${sidebarAberta ? '15rem' : '4.5rem'} !important;
          transition: padding-left 0.3s ease !important;
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