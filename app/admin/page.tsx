"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";

// Lista atualizada com todas as rotas do sistema
const TODAS_PAGINAS = [
  { id: "/", label: "Dashboard (Curva ABC)" },
  { id: "/mapeamento", label: "Cadastros" },
  { id: "/ads", label: "Adsense" },
  { id: "/devolucoes", label: "Devoluções" },
  { id: "/full", label: "Full / FBA" }, // <--- NOVA ABA ADICIONADA AQUI
  { id: "/agenda", label: "Agenda (Restrito)" },
  { id: "/regras", label: "Regras" },
  { id: "/upload", label: "Uploads" },
  { id: "/admin", label: "Admin" }
];

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("compras");
  
  // Estado para armazenar as páginas que estão selecionadas nas checkboxes
  const [paginasSelecionadas, setPaginasSelecionadas] = useState<string[]>(["/"]); 
  
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoPerfil, setNovoPerfil] = useState("");
  const [novasPaginasSelecionadas, setNovasPaginasSelecionadas] = useState<string[]>([]);

  const carregarUsuarios = async () => {
    const { data, error } = await supabase.from('usuarios_permissoes').select('*').order('created_at', { ascending: false });
    if (data) setUsuarios(data);
    if (error) console.error("Erro ao carregar utilizadores:", error.message);
  };

  useEffect(() => {
    carregarUsuarios();
  }, []);

  // Lida com a alteração das checkboxes no cadastro
  const togglePagina = (idPagina: string) => {
    if (paginasSelecionadas.includes(idPagina)) {
      setPaginasSelecionadas(paginasSelecionadas.filter(p => p !== idPagina));
    } else {
      setPaginasSelecionadas([...paginasSelecionadas, idPagina]);
    }
  };

  // Lida com a alteração das checkboxes na edição
  const togglePaginaEdicao = (idPagina: string) => {
    if (novasPaginasSelecionadas.includes(idPagina)) {
      setNovasPaginasSelecionadas(novasPaginasSelecionadas.filter(p => p !== idPagina));
    } else {
      setNovasPaginasSelecionadas([...novasPaginasSelecionadas, idPagina]);
    }
  };

  const cadastrarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senha) return alert("Preencha email e senha.");
    if (paginasSelecionadas.length === 0) return alert("Selecione pelo menos uma página.");

    setLoading(true);
    const idUnico = crypto.randomUUID();

    const { error: dbError } = await supabase.from('usuarios_permissoes').insert({
      id: idUnico,
      email: email.trim().toLowerCase(),
      senha: senha, // Num ambiente real seria hasheada, aqui gravamos para fins de login simples no MVP
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

  const iniciarEdicao = (user: any) => {
    setEditandoId(user.id);
    setNovoPerfil(user.perfil);
    setNovasPaginasSelecionadas(user.paginas_permitidas || []);
  };

  const salvarEdicao = async (id: string) => {
    if (novasPaginasSelecionadas.length === 0) return alert("Selecione pelo menos uma página.");

    const { error } = await supabase
      .from('usuarios_permissoes')
      .update({ perfil: novoPerfil, paginas_permitidas: novasPaginasSelecionadas })
      .eq('id', id);

    if (error) alert("Erro ao atualizar: " + error.message);
    else {
      alert("✅ Permissões atualizadas com sucesso!");
      setEditandoId(null);
      carregarUsuarios();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Administrativo</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Utilizadores e Monitorização do Sistema</p>
          </div>
          <Navbar />
        </div>

        {/* CARD CAPACIDADE DO BANCO */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8 flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">☁️ Capacidade da Base de Dados</h2>
            <p className="text-xs text-slate-400 mt-1">Limite alocado para o projeto Supabase: <strong>500 MB</strong></p>
          </div>
          <div className="flex-1 max-w-md">
            <div className="flex justify-between text-xs font-bold text-slate-400 mb-2">
              <span className="text-indigo-400">21.54 MB Utilizados</span>
              <span>4.31%</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-800">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '4.31%' }}></div>
            </div>
          </div>
        </div>

        {/* CADASTRO DE NOVO UTILIZADOR */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold text-white mb-6">Cadastrar Novo Utilizador</h2>

          <form onSubmit={cadastrarUsuario}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <input 
                type="email" 
                placeholder="felipe.camargo@usebestfit.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-purple-500"
                required
              />
              <input 
                type="password" 
                placeholder="Senha de acesso..."
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-purple-500"
                required
              />
              <select 
                value={perfil} 
                onChange={(e) => setPerfil(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none cursor-pointer"
              >
                <option value="compras">Comprador(a) / Operacional</option>
                <option value="admin">Administrador (Acesso Total)</option>
              </select>
            </div>

            <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800 mb-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-4">MARQUE AS ABAS PERMITIDAS PARA ESTE UTILIZADOR:</p>
              <div className="flex flex-wrap gap-4">
                {TODAS_PAGINAS.map(pagina => (
                  <label key={pagina.id} className="flex items-center gap-2 cursor-pointer bg-slate-900 px-3 py-2 rounded-lg border border-slate-700 hover:border-purple-500 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={paginasSelecionadas.includes(pagina.id)}
                      onChange={() => togglePagina(pagina.id)}
                      className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                    />
                    <span className={`text-xs font-bold ${paginasSelecionadas.includes(pagina.id) ? 'text-white' : 'text-slate-400'}`}>
                      {pagina.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                type="submit" 
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg transition-all"
              >
                {loading ? "A Criar..." : "+ CRIAR UTILIZADOR"}
              </button>
            </div>
          </form>
        </div>

        {/* LISTAGEM DE UTILIZADORES */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-bold text-white">Utilizadores Registados e Permissões</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-4">Email</th>
                  <th className="p-4">Perfil</th>
                  <th className="p-4">Abas Permitidas</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {usuarios.map((u) => {
                  const isEditing = editandoId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40">
                      <td className="p-4 font-bold text-white">{u.email}</td>
                      
                      <td className="p-4">
                        {isEditing ? (
                          <select 
                            value={novoPerfil} 
                            onChange={(e) => setNovoPerfil(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white"
                          >
                            <option value="compras">Comprador(a)</option>
                            <option value="admin">Admin</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${u.perfil === 'admin' ? 'bg-purple-950/60 text-purple-400 border border-purple-900' : 'bg-slate-800 text-slate-300'}`}>
                            {u.perfil}
                          </span>
                        )}
                      </td>
                      
                      <td className="p-4">
                        {isEditing ? (
                          <div className="flex flex-wrap gap-2 max-w-lg">
                            {TODAS_PAGINAS.map(pagina => (
                              <label key={pagina.id} className="flex items-center gap-1.5 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={novasPaginasSelecionadas.includes(pagina.id)}
                                  onChange={() => togglePaginaEdicao(pagina.id)}
                                  className="accent-purple-600"
                                />
                                <span className="text-[11px] text-slate-300">{pagina.label}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-w-lg">
                            {Array.isArray(u.paginas_permitidas) && u.paginas_permitidas.map((path: string, i: number) => {
                              const match = TODAS_PAGINAS.find(p => p.id === path);
                              return (
                                <span key={i} className="bg-slate-950 border border-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px] font-bold">
                                  {match ? match.label : path}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      
                      <td className="p-4 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => salvarEdicao(u.id)} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold">Salvar</button>
                            <button onClick={() => setEditandoId(null)} className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs font-bold">Cancelar</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => iniciarEdicao(u)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors">Editar</button>
                            <button onClick={() => excluirUsuario(u.id, u.email)} className="bg-rose-950/60 hover:bg-rose-900 text-rose-400 px-3 py-1 rounded text-xs font-bold transition-colors">Remover</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">Nenhum utilizador registado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}