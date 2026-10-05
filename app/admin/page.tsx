"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("compras");
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const carregarUsuarios = async () => {
    const { data } = await supabase.from('usuarios_permissoes').select('*');
    if (data) setUsuarios(data);
  };

  useEffect(() => {
    carregarUsuarios();
  }, []);

  const cadastrarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
    });

    if (error) {
      alert("Erro ao criar utilizador: " + error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from('usuarios_permissoes').insert({
        id: data.user.id,
        email: email,
        perfil: perfil,
        paginas_permitidas: perfil === 'admin' ? ['/', '/upload', '/admin'] : ['/']
      });
    }

    setLoading(false);
    alert("Utilizador cadastrado com sucesso!");
    setEmail("");
    setSenha("");
    carregarUsuarios();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Administrativo</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Utilizadores e Permissões</p>
          </div>
          <Link className="px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all" href="/">
            ← Voltar ao Dashboard
          </Link>
        </div>

        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold mb-4 text-white">Cadastrar Novo Utilizador</h2>
          <form onSubmit={cadastrarUsuario} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input 
              type="email" 
              placeholder="E-mail" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
              className="border border-slate-700 rounded-xl p-3 bg-slate-950 text-white text-xs outline-none focus:border-indigo-500"
            />
            <input 
              type="password" 
              placeholder="Palavra-passe temporária" 
              value={senha} 
              onChange={(e) => setSenha(e.target.value)} 
              required
              className="border border-slate-700 rounded-xl p-3 bg-slate-950 text-white text-xs outline-none focus:border-indigo-500"
            />
            <select 
              value={perfil} 
              onChange={(e) => setPerfil(e.target.value)}
              className="border border-slate-700 rounded-xl p-3 bg-slate-950 text-white text-xs outline-none cursor-pointer focus:border-indigo-500"
            >
              <option value="compras">Comprador(a) / Consulta</option>
              <option value="admin">Administrador Total</option>
            </select>
            <div className="md:col-span-3 flex justify-end">
              <button 
                type="submit" 
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md"
              >
                {loading ? "A cadastrar..." : "+ Criar Utilizador"}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <h2 className="text-lg font-bold mb-4 text-white">Utilizadores Registados</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 uppercase">
                <tr>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Perfil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {usuarios.map((u, i) => (
                  <tr key={i} className="hover:bg-slate-800/40">
                    <td className="p-3 font-medium text-slate-200">{u.email}</td>
                    <td className="p-3 uppercase font-bold text-indigo-400">{u.perfil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}