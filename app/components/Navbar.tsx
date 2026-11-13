"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ROTAS_DISPONIVEIS, SECOES_MENU, secaoDoCaminho } from "@/lib/rotasMenu";
import Avatar from "./Avatar";
import { abrirEscolhaDeAvatar } from "./EscolherAvatar";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [paginasPermitidas, setPaginasPermitidas] = useState<string[]>([]);
  const [perfilUsuario, setPerfilUsuario] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");
  const [menuExpandido, setMenuExpandido] = useState<string | null>(null);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [modoEscuro, setModoEscuro] = useState(true);
  
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Mantém aberta, na barra lateral, a seção da página atual
  useEffect(() => {
    if (!pathname) return;
    const secao = secaoDoCaminho(pathname);
    if (secao) setMenuExpandido(secao);
  }, [pathname]);

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
          setPaginasPermitidas(ROTAS_DISPONIVEIS.map((r) => r.id));
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
      console.error("Erro ao carregar logótipo:", err);
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
      alert("✅ Logótipo atualizado e guardado com sucesso!");
    } catch (err: any) {
      alert("Erro ao enviar logótipo: " + err.message);
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
    if (!sidebarAberta) {
      setSidebarAberta(true);
      localStorage.setItem("hub_bestfit_sidebar_aberta", "true");
    }
    setMenuExpandido(menuExpandido === secao ? null : secao);
  };

  return (
    <>
      <aside className={`fixed top-0 left-0 h-full bg-[#07090e] border-r border-slate-800/80 flex flex-col justify-between z-50 select-none print:hidden shadow-2xl font-sans transition-all duration-300 ${sidebarAberta ? 'w-60' : 'w-16'}`}>
        
        <div className="p-3 border-b border-slate-800/60 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <label className="relative group cursor-pointer flex-shrink-0" title="Alterar logo">
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
          
          {/* INÍCIO (tela principal: canais, notificações e tarefas) — liberado para todos os usuários logados */}
          <Link
            href="/inicio"
            title="Início"
            className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all ${
              pathname === "/inicio"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 font-bold"
                : "text-slate-400 hover:text-white hover:bg-slate-900/60"
            }`}
          >
            <span className="text-sm flex-shrink-0">🏠</span>
            {sidebarAberta && <span className="truncate">Início</span>}
          </Link>

          {/* SEÇÕES (geradas a partir de lib/rotasMenu.ts: mesma lista do Painel Admin) */}
          {SECOES_MENU.map((secao) => {
            const visiveis = secao.rotas.filter((r) => !r.oculta && temPermissao(r.id));
            if (visiveis.length === 0) return null;
            const ativa = secao.rotas.some((r) => !r.oculta && (r.id === "/" ? pathname === "/" : pathname === r.id));
            if (!secao.submenu) {
              const r = visiveis[0];
              return (
                <Link key={secao.titulo} href={r.id} title={r.nome}
                  className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all ${pathname === r.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/50 font-bold" : "text-slate-400 hover:text-white hover:bg-slate-900/60"}`}>
                  <span className="text-sm flex-shrink-0">{secao.icone}</span>
                  {sidebarAberta && <span className="truncate">{r.nome}</span>}
                </Link>
              );
            }
            return (
              <div key={secao.titulo} data-secao-menu={secao.titulo}>
                <button onClick={() => toggleSecao(secao.titulo)} title={secao.titulo}
                  className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl transition-all cursor-pointer ${ativa ? "bg-indigo-950/40 text-indigo-400 font-bold border border-indigo-900/40" : "text-slate-400 hover:text-white hover:bg-slate-900/60"}`}>
                  <span className="flex items-center gap-3">
                    <span className="text-sm flex-shrink-0">{secao.icone}</span>
                    {sidebarAberta && <span className="truncate">{secao.titulo}</span>}
                  </span>
                  {sidebarAberta && <span className={`transform transition-transform text-[9px] ${menuExpandido === secao.titulo ? "rotate-180" : ""}`}>▼</span>}
                </button>
                {sidebarAberta && menuExpandido === secao.titulo && (
                  <div className="pl-7 space-y-1 mt-1 border-l border-slate-800/80 ml-3 py-1">
                    {visiveis.map((r) => (
                      <Link key={r.id} href={r.id} className={`block px-2.5 py-1.5 rounded-lg transition-all ${pathname === r.id ? "text-indigo-400 font-bold bg-indigo-950/60" : "text-slate-400 hover:text-white"}`}>
                        {r.prefixo ? `${r.prefixo} ` : ""}{r.rotulo || r.nome}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

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
            <div className="overflow-hidden px-1 flex items-center gap-2.5">
              {emailUsuario && <button type="button" onClick={abrirEscolhaDeAvatar} data-meu-avatar title="Escolher meu avatar (personagem ou foto)" className="cursor-pointer rounded-full ring-2 ring-transparent hover:ring-indigo-500 transition shrink-0"><Avatar email={emailUsuario} tamanho={36} /></button>}
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-white truncate">{emailUsuario || "Utilizador"}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                  {perfilUsuario}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-1">
              {emailUsuario && <button type="button" onClick={abrirEscolhaDeAvatar} data-meu-avatar title="Escolher meu avatar" className="cursor-pointer mx-auto block"><Avatar email={emailUsuario} tamanho={28} /></button>}
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