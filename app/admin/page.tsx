"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";

const rotasDisponiveis = [
  { id: "/", nome: "Dashboard (Curva ABC)" },
  { id: "/mapeamento", nome: "Cadastros" },
  { id: "/ads", nome: "Adsense" },
  { id: "/devolucoes", nome: "Devoluções" },
  { id: "/regras", nome: "Regras" },
  { id: "/upload", nome: "Uploads" },
  { id: "/admin", nome: "Admin" }
];

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("compras");
  const [paginasSelecionadas, setPaginasSelecionadas] = useState<string[]>(["/"]);
  
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoPerfil, setNovoPerfil] = useState("");
  const [editandoPaginas, setEditandoPaginas] = useState<string[]>([]);

  const carregarUsuarios = async () => {
    const { data, error } = await supabase.from('usuarios_permissoes').select('*');
    if (data) setUsuarios(data);
    if (error) console.error("Erro ao carregar utilizadores:", error.message);
  };

  useEffect(() => {
    carregarUsuarios();
  }, []);

  // Quando o dropdown do perfil muda na criação, seleciona automaticamente as abas como atalho
  const handlePerfilChange = (valor: string) => {
    setPerfil(valor);
    if (valor === "admin") {
      setPaginasSelecionadas(rotasDisponiveis.map(r => r.id));
    } else {
      setPaginasSelecionadas(["/"]);
    }
  };

  const togglePagina = (id: string) => {
    setPaginasSelecionadas(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleEditandoPagina = (id: string) => {
    setEditandoPaginas(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const cadastrarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paginasSelecionadas.length === 0) return alert("Selecione pelo menos uma página de acesso.");
    
    setLoading(true);
    const idUnico = crypto.randomUUID();

    const { error: dbError } = await supabase.from('usuarios_permissoes').insert({
      id: idUnico,
      email: email,
      perfil: perfil,
      paginas_permitidas: paginasSelecionadas
    });

    if (dbError) {
      alert("Erro ao cadastrar utilizador: " + dbError.message);
    } else {
      alert("✅ Utilizador cadastrado com sucesso!");
      setEmail("");
      setSenha("");
      setPaginasSelecionadas(["/"]);
      setPerfil("compras");
      carregarUsuarios();
    }
    setLoading(false);
  };

  const excluirUsuario = async (id: string, emailUser: string) => {
    if (!confirm(`Tem certeza que deseja excluir o utilizador ${emailUser}?`)) return;

    const { error } = await supabase.from('usuarios_permissoes').delete().eq('id', id);
    if (error) alert("Erro ao excluir: " + error.message);
    else {
      alert("🗑️ Utilizador removido com sucesso!");
      carregarUsuarios();
    }
  };

  const iniciarEdicao = (u: any) => {
    setEditandoId(u.id);
    setNovoPerfil(u.perfil || "compras");
    setEditandoPaginas(u.paginas_permitidas || []);
  };

  const salvarEdicao = async (id: string) => {
    if (editandoPaginas.length === 0) return alert("O utilizador precisa de acesso a pelo menos uma página.");

    const { error } = await supabase
      .from('usuarios_permissoes')
      .update({ perfil: novoPerfil, paginas_permitidas: editandoPaginas })
      .eq('id', id);

    if (error) alert("Erro ao atualizar: " + error.message);
    else {
      alert("✅ Permissões atualizadas com sucesso!");
      
      // Se o admin editou a si próprio, atualiza o localStorage para refletir logo a mudança no menu
      const logado = JSON.parse(localStorage.getItem("usuario_logado") || "{}");
      if (logado.id === id) {
        logado.paginas_permitidas = editandoPaginas;
        logado.perfil = novoPerfil;
        localStorage.setItem("usuario_logado", JSON.stringify(logado));
        window.location.reload(); // Recarrega para o Navbar reagir
      }

      setEditandoId(null);
      carregarUsuarios();
    }
  };

  // Função para traduzir os caminhos ("/") nos nomes bonitos ("Dashboard") na tabela
  const formatarPaginasPermitidas = (paginasArray: string[]) => {
    if (!paginasArray || !Array.isArray(paginasArray)) return "-";
    const nomes = paginasArray.map(path => {
      const rotaEncontrada = rotasDisponiveis.find(r => r.id === path);
      return rotaEncontrada ? rotaEncontrada.nome : path;
    });
    return nomes.join(", ");
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Administrativo</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Utilizadores e Permissões de Acesso</p>
          </div>
          <Navbar />
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
              onChange={(e) => handlePerfilChange(e.target.value)}
              className="border border-slate-700 rounded-xl p-3 bg-slate-950 text-white text-xs outline-none cursor-pointer focus:border-indigo-500"
            >
              <option value="compras">Comprador(a) / Operacional</option>
              <option value="admin">Administrador (Total Acesso)</option>
            </select>

            <div className="md:col-span-3 bg-slate-950 p-5 rounded-xl border border-slate-800">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Marque as Abas Permitidas para este utilizador:</label>
              <div className="flex flex-wrap gap-4">
                {rotasDisponiveis.map(rota => (
                  <label key={rota.id} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={paginasSelecionadas.includes(rota.id)} 
                      onChange={() => togglePagina(rota.id)} 
                      className="accent-indigo-600 w-4 h-4 cursor-pointer" 
                    />
                    {rota.nome}
                  </label>
                ))}
              </div>
            </div>

            <div className="md:col-span-3 flex justify-end mt-2">
              <button 
                type="submit" 
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md"
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
                  <th className="p-4 w-32">Perfil</th>
                  <th className="p-4">Abas Permitidas</th>
                  <th className="p-4 text-center w-36">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500 italic">Nenhum utilizador registado.</td>
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
                              className="border border-slate-600 rounded-lg p-1.5 bg-slate-950 text-white text-xs outline-none focus:border-indigo-500 w-full"
                            >
                              <option value="compras">Operacional</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] uppercase ${u.perfil === 'admin' ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-900/50' : 'bg-slate-800 text-slate-300'}`}>
                              {u.perfil}
                            </span>
                          )}
                        </td>

                        <td className="p-4 text-slate-300">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-2">
                              {rotasDisponiveis.map(rota => (
                                <label key={rota.id} className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold bg-slate-950 px-2 py-1 rounded border border-slate-700">
                                  <input 
                                    type="checkbox" 
                                    checked={editandoPaginas.includes(rota.id)} 
                                    onChange={() => toggleEditandoPagina(rota.id)} 
                                    className="accent-indigo-600" 
                                  />
                                  {rota.nome}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="leading-relaxed">
                              {formatarPaginasPermitidas(u.paginas_permitidas)}
                            </div>
                          )}
                        </td>

                        <td className="p-4 text-center">
                          {isEditing ? (
                            <div className="flex flex-col gap-1.5 items-center justify-center">
                              <button onClick={() => salvarEdicao(u.id)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase cursor-pointer transition-all shadow-sm">
                                Salvar
                              </button>
                              <button onClick={() => setEditandoId(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase cursor-pointer transition-all">
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => iniciarEdicao(u)} title="Editar Permissões" className="bg-slate-800 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-400 border border-slate-700 hover:border-indigo-900/50 p-2 rounded-lg cursor-pointer transition-all">
                                ✏️
                              </button>
                              <button onClick={() => excluirUsuario(u.id, u.email)} title="Excluir Utilizador" className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 p-2 rounded-lg cursor-pointer transition-all">
                                🗑️
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