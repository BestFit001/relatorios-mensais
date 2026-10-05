"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Valida se o utilizador existe na nossa tabela de permissões
    const { data: usuario, error } = await supabase
      .from('usuarios_permissoes')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !usuario) {
      alert("Acesso negado: E-mail não encontrado ou sem permissão registada.");
      setLoading(false);
      return;
    }

    // Grava a sessão localmente para o sistema saber quem está logado
    localStorage.setItem("usuario_logado", JSON.stringify(usuario));

    setLoading(false);
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-xl font-black text-white tracking-tight">Acesso Restrito</h1>
          <p className="text-xs text-slate-400 mt-1">Entre com as suas credenciais para aceder ao painel Best Fit.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">E-mail</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
              placeholder="exemplo@usebestfit.com.br"
              className="w-full border border-slate-700 rounded-xl p-3 bg-slate-950 text-white text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Palavra-passe</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
              placeholder="••••••••"
              className="w-full border border-slate-700 rounded-xl p-3 bg-slate-950 text-white text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md mt-2"
          >
            {loading ? "A entrar..." : "Entrar no Sistema"}
          </button>
        </form>
      </div>
    </div>
  );
}