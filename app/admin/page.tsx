"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("compras");
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoPerfil, setNovoPerfil] = useState("");

  const carregarUsuarios = async () => {
    const { data, error } = await supabase.from('usuarios_permissoes').select('*');
    if (data) setUsuarios(data);
    if (error) console.error("Erro ao carregar utilizadores:", error.message);
  };

  useEffect(() => {
    carregarUsuarios();
  }, []);

  const cadastrarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const paginas = perfil === 'admin' ? ['/', '/upload', '/admin'] : ['/'];
    const idUnico = crypto.randomUUID();

    // Grava diretamente na tabela de permissões, contornando qualquer limite de e-mail do Supabase Auth
    const { error: dbError } = await supabase.from('usuarios_permissoes').insert({
      id: idUnico,
      email: email,
      perfil: perfil,
      paginas_permitidas: paginas
    });

    if (dbError) {
      alert("Erro ao cadastrar utilizador: " + dbError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    alert("Utilizador cadastrado com sucesso!");
    setEmail("");
    setSenha("");
    carregarUsuarios();
  };

  const excluirUsuario = async (id: string, emailUser: string) => {
    if (!confirm(`Tem certeza que deseja excluir o utilizador ${emailUser}?`)) return;

    const { error } = await supabase.from('usuarios_permissoes').delete().eq('id', id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }

    alert("Utilizador removido com sucesso!");
    carregarUsuarios();
  };

  const salvarEdicao = async (id: string) => {
    const paginas = novoPerfil === 'admin' ? ['/', '/upload', '/admin'] : ['/'];
    
    const { error } = await supabase
      .from('usuarios_permissoes')
      .update({ perfil: novoPerfil, paginas_permitidas: paginas })
      .eq('id', id);

    if (error) {
      alert("Erro ao atualizar: " + error.message);
      return;
    }

    alert("Permissões atualizadas com sucesso!");
    setEditandoId(null);
    carregarUsuarios();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-5xl mx-auto">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Administrativo</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Utilizadores e Permissões de Acesso</p>
          </div>
          <Link className="px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all shadow-sm" href="/">
            ← Voltar ao Dashboard
          </Link>
        </div>

        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold mb-4 text-white">Cadastrar Novo Utilizador</h2>
          <form onSubmit={cadastrarUsuario} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input 
              type="email" 
              placeholder="E-mail do utilizador" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
              className="border border-slate-700 rounded-xl p-3 bg-slate-950 text-white text-xs outline-none focus:border-indigo-500"
            />
            <input 
              type="password" 
              placeholder="Palavra-passe (referência)" 
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
              <option value="compras">Comprador(a) / Consulta (Apenas Dashboard)</option>
              <option value="admin">Administrador Total (Todas as Abas)</option>
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
          <h2 className="text-lg font-bold mb-4 text-white">Utilizadores Registados e Permissões</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-4">E-mail</th>
                  <th className="p-4">Perfil / Acesso</th>
                  <th className="p-4">Páginas Permitidas</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500 italic">Nenhum utilizador registado na tabela de permissões.</td>
                  </tr>
                ) : (
                  usuarios.map((u) => {
                    const isEditing = editandoId === u.id;

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-semibold text-slate-200">{u.email}</td>
                        
                        <td className="p-4 font-bold">
                          {isEditing ? (
                            <select 
                              value={novoPerfil} 
                              onChange={(e) => setNovoPerfil(e.target.value)}
                              className="border border-slate-600 rounded-lg p-1.5 bg-slate-950 text-white text-xs outline-none focus:border-indigo-500"
                            >
                              <option value="compras">Comprador(a)</option>
                              <option value="admin">Administrador</option>
                            </select>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] uppercase ${
                              u.perfil === 'admin' ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-900/50' : 'bg-slate-800 text-slate-300'
                            }`}>
                              {u.perfil}
                            </span>
                          )}
                        </td>

                        <td className="p-4 text-slate-400">
                          {Array.isArray(u.paginas_permitidas) ? u.paginas_permitidas.join(", ") : u.paginas_permitidas}
                        </td>

                        <td className="p-4 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => salvarEdicao(u.id)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all shadow-sm"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => setEditandoId(null)}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg font-bold text-xs cursor-pointer transition-all"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setEditandoId(u.id);
                                  setNovoPerfil(u.perfil || "compras");
                                }}
                                title="Editar Permissões"
                                className="bg-slate-800 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-400 border border-slate-700 hover:border-indigo-900/50 p-2 rounded-lg cursor-pointer transition-all"
                              >
                                ✏ Editar
                              </button>
                              <button
                                onClick={() => excluirUsuario(u.id, u.email)}
                                title="Excluir Utilizador"
                                className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 p-2 rounded-lg cursor-pointer transition-all"
                              >
                                🗑️ Excluir
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}