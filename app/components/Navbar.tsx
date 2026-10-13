"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [paginasPermitidas, setPaginasPermitidas] = useState<string[]>([]);

  const abas = [
    { nome: "Curva ABC", href: "/" },
    { nome: "Cadastros", href: "/mapeamento" },
    { nome: "Adsense", href: "/ads" },
    { nome: "Devoluções", href: "/devolucoes" },
    { nome: "FULL / FBA", href: "/full" },
    { nome: "PLPs", href: "/plp" },
    { nome: "Agenda", href: "/agenda" }, 
    { nome: "Regras", href: "/regras" },
    { nome: "Uploads", href: "/upload" },
    { nome: "Admin", href: "/admin" },
  ];

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (usuarioLogado) {
      const usuario = JSON.parse(usuarioLogado);
      const permitidas = usuario.paginas_permitidas || [];
      setPaginasPermitidas(permitidas);

      if (permitidas.length > 0 && !permitidas.includes(pathname)) {
        alert("🔒 Acesso Negado: Não tem permissão para aceder a esta página.");
        router.push(permitidas[0] || "/");
      }
    } else {
      router.push("/login");
    }
  }, [pathname, router]);

  const handleSair = () => {
    localStorage.removeItem("usuario_logado");
    router.push("/login");
  };

  const abasFiltradas = abas.filter(aba => paginasPermitidas.includes(aba.href));

  return (
    <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 flex-wrap">
      {abasFiltradas.map((aba) => {
        const ativo = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
              ativo
                ? "bg-purple-600 text-white shadow-sm shadow-purple-900/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {aba.nome}
          </Link>
        );
      })}

      <button
        onClick={handleSair}
        className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider text-rose-400 hover:bg-rose-950/40 transition-all cursor-pointer ml-auto"
      >
        Sair
      </button>
    </div>
  );
}