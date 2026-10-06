"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  // Nomes e rotas atualizados centralmente
  const abas = [
    { nome: "Dash - Curva ABC", href: "/" },
    { nome: "Mapeamento - Cadastros", href: "/mapeamento" },
    { nome: "Painel ADS - Adsense", href: "/ads" },
    { nome: "Regras", href: "/regras" },
    { nome: "Uploads", href: "/upload" },
    { nome: "Admin", href: "/admin" },
  ];

  const handleSair = () => {
    localStorage.removeItem("usuario_logado");
    router.push("/login");
  };

  return (
    <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 flex-wrap">
      {abas.map((aba) => {
        const ativo = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
              ativo
                ? "bg-indigo-600 text-white shadow-sm"
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