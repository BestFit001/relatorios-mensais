"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ROTAS_DISPONIVEIS, SECOES_MENU, secaoDoCaminho } from "@/lib/rotasMenu";
import Avatar from "./Avatar";
import { abrirEscolhaDeAvatar } from "./EscolherAvatar";
import {
  BarChart3, CalendarDays, ChevronDown, Circle, Home, LayoutDashboard, LogOut, Megaphone, Moon, PanelLeftClose, PanelLeftOpen,
  Settings, ShoppingCart, Sun, Tag, Truck, Wallet, Wrench, type LucideIcon,
} from "lucide-react";

/** Ícone de cada seção do menu (o texto vem de lib/rotasMenu.ts). */
const ICONES_SECAO: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard, Relatórios: BarChart3, Promoções: Tag, Ferramentas: Wrench, Expedição: Truck,
  Marketing: Megaphone, Financeiro: Wallet, Compras: ShoppingCart, Gestão: CalendarDays, Configurações: Settings,
};

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
    } else if (window.innerWidth >= 1280) {
      setSidebarAberta(true);   // primeira visita em tela larga: menu aberto, com os nomes
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
      <aside className="hub-aside print:hidden" data-aberta={sidebarAberta ? "true" : "false"} aria-label="Menu principal">
        <div className="hub-topo">
          <div className="hub-marca">
            <label className="hub-logo" title="Alterar logo">
              {logoUrl ? <img src={logoUrl} alt="Logo" /> : <span>BF</span>}
              <span className="hub-logo-troca">{uploadingLogo ? "…" : "Trocar"}</span>
              <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
            </label>
            {sidebarAberta && (
              <div style={{ minWidth: 0 }}>
                <div className="hub-nome">Hub Best Fit</div>
                <div className="hub-sub-nome">Performance</div>
              </div>
            )}
          </div>
          {sidebarAberta && (
            <button onClick={toggleSidebar} className="hub-recolher" title="Recolher menu" aria-label="Recolher menu"><PanelLeftClose size={16} /></button>
          )}
        </div>

        <nav className="hub-nav">
          {!sidebarAberta && (
            <button onClick={toggleSidebar} className="hub-item" title="Expandir menu" aria-label="Expandir menu" style={{ marginBottom: 4 }}><PanelLeftOpen size={18} /></button>
          )}

          {/* INÍCIO (tela principal: canais, notificações e tarefas) — liberado para todos os usuários logados */}
          <Link href="/inicio" title="Início" className="hub-item" data-ativo={pathname === "/inicio"}>
            <Home size={18} />
            {sidebarAberta && <span className="hub-rotulo">Início</span>}
          </Link>

          {/* SEÇÕES (geradas a partir de lib/rotasMenu.ts: mesma lista do Painel Admin) */}
          {SECOES_MENU.map((secao) => {
            const visiveis = secao.rotas.filter((r) => !r.oculta && temPermissao(r.id));
            if (visiveis.length === 0) return null;
            const ativa = secao.rotas.some((r) => !r.oculta && (r.id === "/" ? pathname === "/" : pathname === r.id));
            const Icone = ICONES_SECAO[secao.titulo] || Circle;
            if (!secao.submenu) {
              const r = visiveis[0];
              return (
                <Link key={secao.titulo} href={r.id} title={r.nome} className="hub-item" data-ativo={pathname === r.id}>
                  <Icone size={18} />
                  {sidebarAberta && <span className="hub-rotulo">{r.nome}</span>}
                </Link>
              );
            }
            const aberta = menuExpandido === secao.titulo;
            return (
              <div key={secao.titulo} data-secao-menu={secao.titulo}>
                <button onClick={() => toggleSecao(secao.titulo)} title={secao.titulo} className="hub-item" data-secao-ativa={ativa} aria-expanded={aberta && sidebarAberta}>
                  <Icone size={18} />
                  {sidebarAberta && <span className="hub-rotulo">{secao.titulo}</span>}
                  {sidebarAberta && <ChevronDown size={14} className="hub-seta" data-aberta={aberta} />}
                </button>
                {sidebarAberta && aberta && (
                  <div className="hub-sub">
                    {visiveis.map((r) => (
                      <Link key={r.id} href={r.id} className="hub-subitem" data-ativo={pathname === r.id}>
                        {r.prefixo ? `${r.prefixo} ` : ""}{r.rotulo || r.nome}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="hub-pe">
          {sidebarAberta ? (
            <div className="hub-usuario">
              {emailUsuario && <button type="button" onClick={abrirEscolhaDeAvatar} data-meu-avatar title="Escolher meu avatar (personagem ou foto)" className="cursor-pointer rounded-full shrink-0" style={{ background: "none", border: 0, padding: 0 }}><Avatar email={emailUsuario} tamanho={34} /></button>}
              <div className="hub-usuario-info">
                <div className="hub-usuario-email">{emailUsuario || "Utilizador"}</div>
                <span className="hub-perfil">{perfilUsuario}</span>
              </div>
            </div>
          ) : (
            emailUsuario && <button type="button" onClick={abrirEscolhaDeAvatar} data-meu-avatar title="Escolher meu avatar" className="cursor-pointer mx-auto block" style={{ background: "none", border: 0, padding: 0 }}><Avatar email={emailUsuario} tamanho={30} /></button>
          )}
          <div className="hub-acoes">
            <button onClick={alternarTema} title="Alternar tema claro / escuro" aria-label="Alternar tema claro / escuro" className="hub-acao">
              {modoEscuro ? <Sun size={15} /> : <Moon size={15} />}
              {sidebarAberta && <span>{modoEscuro ? "Claro" : "Escuro"}</span>}
            </button>
            <button onClick={handleSair} title="Sair da conta" aria-label="Sair da conta" className="hub-acao" data-perigo="true">
              <LogOut size={15} />
              {sidebarAberta && <span>Sair</span>}
            </button>
          </div>
        </div>
      </aside>

      <style jsx global>{`
        .min-h-screen {
          padding-left: ${sidebarAberta ? '15rem' : '4rem'} !important;
          transition: padding-left 0.25s ease !important;
        }
        @media (max-width: 768px) {
          aside.hub-aside {
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
