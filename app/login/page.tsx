"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro("");

    // Valida se o utilizador existe na nossa tabela de permissões
    const { data: usuario, error } = await supabase
      .from('usuarios_permissoes')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !usuario) {
      setErro("Não encontramos esse e-mail entre os usuários com acesso. Confira o endereço ou peça a liberação ao administrador.");
      setLoading(false);
      return;
    }

    // Grava a sessão localmente para o sistema saber quem está logado
    localStorage.setItem("usuario_logado", JSON.stringify(usuario));

    setLoading(false);
    router.push("/inicio");
  };

  return (
    <div className="login-raiz">
      <aside className="login-lado" aria-hidden="true">
        <div className="login-marca"><span className="login-logo">BF</span><span>Hub Best Fit</span></div>
        <div>
          <p className="login-titulo">Os números de cada canal, num só lugar.</p>
          <ul className="login-lista">
            <li><strong>Faturamento e margem</strong><span>por canal, analista e período</span></li>
            <li><strong>Operação</strong><span>fulfillment, devoluções, PLPs e dimensões</span></li>
            <li><strong>Time</strong><span>tarefas, avisos e chat interno</span></li>
          </ul>
        </div>
        <p className="login-rodape">Uso interno da equipe Best Fit</p>
      </aside>

      <main className="login-form-lado">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight text-white">Entrar</h1>
          <p className="text-sm text-slate-400 mt-1.5">Use o e-mail cadastrado no painel para acessar.</p>

          <form onSubmit={handleLogin} className="space-y-4 mt-8" noValidate={false}>
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300 mb-1.5">E-mail</label>
              <input id="login-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErro(""); }} required autoComplete="username" autoFocus
                placeholder="nome@usebestfit.com.br"
                className="w-full border border-slate-700 rounded-lg px-3.5 py-2.5 bg-slate-950 text-white text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label htmlFor="login-senha" className="block text-xs font-semibold text-slate-300 mb-1.5">Senha</label>
              <input id="login-senha" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setErro(""); }} required autoComplete="current-password"
                placeholder="Sua senha"
                className="w-full border border-slate-700 rounded-lg px-3.5 py-2.5 bg-slate-950 text-white text-sm outline-none focus:border-indigo-500" />
            </div>

            {erro && <p role="alert" className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/50 rounded-lg px-3 py-2" data-erro-login>{erro}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm cursor-pointer shadow-sm">
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
