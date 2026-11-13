"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { MAX_NOME, nomeDoEmailPadrao, nomePersonalizado, salvarNome, useNomes } from "../../lib/nomes";
import { ROTAS_DISPONIVEIS, SECOES_MENU, ROTA_INICIO, nomeDaRota } from "../../lib/rotasMenu";

const rotasDisponiveis = ROTAS_DISPONIVEIS;

/** Grade de permissões agrupada como o menu lateral (Início, Dashboard, Marketing, Relatórios...). */
function GradePermissoes({ selecionadas, onToggle, compacto = false }: { selecionadas: string[]; onToggle: (id: string) => void; compacto?: boolean }) {
  const soltas = SECOES_MENU.filter((s) => !s.submenu).flatMap((s) => s.rotas);
  const grupos = [
    { titulo: "Geral", itens: soltas },
    ...SECOES_MENU.filter((s) => s.submenu).map((s) => ({ titulo: s.titulo, itens: s.rotas })),
  ];
  const conhecidas = new Set<string>([ROTA_INICIO.id, ...ROTAS_DISPONIVEIS.map((r) => r.id)]);
  const antigas = selecionadas.filter((id) => !conhecidas.has(id));   // acessos gravados no passado que não existem mais
  const caixa = compacto
    ? "flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold bg-slate-950 px-2 py-1.5 rounded border border-slate-700"
    : "flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-200 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors";
  const tituloGrupo = "text-[10px] font-black text-indigo-300 uppercase tracking-wider mb-1.5";
  return (
    <div className="space-y-3" data-grade-permissoes>
      {grupos.map((g) => (
        <div key={g.titulo} data-grupo={g.titulo}>
          <p className={tituloGrupo}>{g.titulo}</p>
          <div className={compacto ? "flex flex-wrap gap-2" : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5"}>
            {g.titulo === "Geral" && (
              <label className={caixa + " opacity-70 cursor-default"} title="O Início aparece para todos os usuários logados">
                <input type="checkbox" checked disabled data-rota="/inicio" className="accent-indigo-600" />
                <span className="truncate">{ROTA_INICIO.nome} <span className="text-slate-500 font-normal">(todos)</span></span>
              </label>
            )}
            {g.itens.map((rota) => (
              <label key={rota.id} className={caixa}>
                <input type="checkbox" data-rota={rota.id} checked={selecionadas.includes(rota.id)} onChange={() => onToggle(rota.id)} className="accent-indigo-600" />
                <span className="truncate">{rota.nome}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {antigas.length > 0 && (
        <div data-grupo="antigos">
          <p className={tituloGrupo + " !text-amber-300"}>Acessos antigos (já não existem no menu)</p>
          <div className="flex flex-wrap gap-2">
            {antigas.map((id) => (
              <label key={id} className={caixa}>
                <input type="checkbox" data-rota={id} checked onChange={() => onToggle(id)} className="accent-amber-500" />
                <span className="truncate">{id}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Configurações do painel: liga/desliga o aviso "Aba em construção, deseja continuar?" por página (tabela abas_em_construcao). */
function ConfigAbasConstrucao() {
  const [ativas, setAtivas] = useState<Set<string>>(new Set());
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("abas_em_construcao").select("rota, ativo");
      if (error) setErro("Não consegui ler as configurações (a migration 20261112180000_abas_em_construcao.sql já foi executada no Supabase?): " + error.message);
      else setAtivas(new Set((data || []).filter((r: any) => r.ativo).map((r: any) => String(r.rota))));
      setCarregado(true);
    })();
  }, []);

  const alternar = async (rota: string) => {
    const novo = !ativas.has(rota);
    setSalvando(rota); setErro("");
    const { error } = await supabase.from("abas_em_construcao").upsert({ rota, ativo: novo, atualizado_em: new Date().toISOString() }, { onConflict: "rota" });
    if (error) setErro("Erro ao salvar: " + error.message);
    else setAtivas((a) => { const n = new Set(a); if (novo) n.add(rota); else n.delete(rota); return n; });
    setSalvando(null);
  };

  const grupos = SECOES_MENU.map((s) => ({ titulo: s.titulo, itens: s.rotas.filter((r) => r.id !== "/admin" && r.id !== "/analise-mercado") })).filter((g) => g.itens.length > 0);
  return (
    <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8" data-config-construcao>
      <h2 className="text-lg font-bold text-white mb-1">⚙️ Configurações — Aviso de aba em construção</h2>
      <p className="text-xs text-slate-400 mb-4">
        As abas marcadas abrem com o fundo embaçado e a pergunta <strong className="text-slate-200">“Aba em construção, deseja continuar?”</strong> (Sim libera a página; Não volta ao Início). A mudança vale na hora, para todos os usuários.
      </p>
      {erro && <p className="text-xs text-rose-300 mb-3">{erro}</p>}
      {!carregado ? <p className="text-xs text-slate-500">Carregando…</p> : (
        <div className="space-y-3">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <p className="text-[10px] font-black text-amber-300 uppercase tracking-wider mb-1.5">{g.titulo}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {g.itens.map((r) => (
                  <label key={r.id} className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-200 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
                    <input type="checkbox" data-construcao={r.id} checked={ativas.has(r.id)} disabled={salvando === r.id} onChange={() => alternar(r.id)} className="accent-amber-500" />
                    <span className="truncate">{r.nome}</span>
                    {ativas.has(r.id) && <span className="ml-auto text-[9px] text-amber-300 font-bold uppercase">🚧 em construção</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  useNomes();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("compras");
  const [paginasSelecionadas, setPaginasSelecionadas] = useState<string[]>(["/"]);
  
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoPerfil, setNovoPerfil] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [editandoPaginas, setEditandoPaginas] = useState<string[]>([]);

  const [tamanhoDb, setTamanhoDb] = useState({ mb: 0, percentual: 0 });
  const limiteDbMb = 500;

  const carregarUsuariosEStatus = async () => {
    const { data: usersData, error } = await supabase.from('usuarios_permissoes').select('*');
    if (usersData) setUsuarios(usersData);
    if (error) console.error("Erro ao carregar utilizadores:", error.message);

    const { data: dbSizeData, error: dbError } = await supabase.rpc('obter_tamanho_db');
    if (dbSizeData !== null && !dbError) {
      const mb = Number(dbSizeData);
      const percentual = (mb / limiteDbMb) * 100;
      setTamanhoDb({ mb, percentual });
    }
  };

  useEffect(() => {
    carregarUsuariosEStatus();
  }, []);

  const handlePerfilChange = (valor: string) => {
    setPerfil(valor);
    if (valor === "admin") {
      setPaginasSelecionadas(rotasDisponiveis.map(r => r.id));
    } else {
      setPaginasSelecionadas(["/"]);
    }
  };

  const selecionarTodas = () => {
    setPaginasSelecionadas(rotasDisponiveis.map(r => r.id));
  };

  const desmarcarTodas = () => {
    setPaginasSelecionadas(["/"]);
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
      email: email.trim().toLowerCase(),
      perfil: perfil,
      senha: senha,
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
      carregarUsuariosEStatus();
    }
    setLoading(false);
  };

  const excluirUsuario = async (id: string, emailUser: string) => {
    if (!confirm(`Tem certeza que deseja excluir o utilizador ${emailUser}?`)) return;

    const { error } = await supabase.from('usuarios_permissoes').delete().eq('id', id);
    if (error) alert("Erro ao excluir: " + error.message);
    else {
      alert("🗑️ Utilizador removido com sucesso!");
      carregarUsuariosEStatus();
    }
  };

  const iniciarEdicao = (u: any) => {
    setEditandoId(u.id);
    setNovoNome(nomePersonalizado(u.email) || "");
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
      const emailEditado = usuarios.find((u) => u.id === id)?.email || "";
      const erroNome = emailEditado ? await salvarNome(emailEditado, novoNome) : null;
      alert(erroNome ? "✅ Permissões atualizadas, mas não consegui salvar o nome: " + erroNome : "✅ Usuário atualizado com sucesso!");
      
      const logado = JSON.parse(localStorage.getItem("usuario_logado") || "{}");
      if (logado.id === id || logado.email === usuarios.find(u => u.id === id)?.email) {
        logado.paginas_permitidas = editandoPaginas;
        logado.perfil = novoPerfil;
        localStorage.setItem("usuario_logado", JSON.stringify(logado));
      }

      setEditandoId(null);
      carregarUsuariosEStatus();
    }
  };

  const formatarPaginasPermitidas = (paginasArray: string[]) => {
    if (!paginasArray || !Array.isArray(paginasArray)) return "-";
    // Início é de todos; os demais seguem a ordem do menu lateral
    const ordem = new Map(ROTAS_DISPONIVEIS.map((r, i) => [r.id, i]));
    const ordenadas = [...paginasArray].sort((x, y) => (ordem.get(x) ?? 999) - (ordem.get(y) ?? 999));
    return ["Início", ...ordenadas.filter((id) => id !== ROTA_INICIO.id).map(nomeDaRota)].join(", ");
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Painel Administrativo</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Utilizadores e Monitorização do Sistema</p>
          </div>
          <Navbar />
        </div>

        {/* MONITORIZAÇÃO DB */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              ☁️ Capacidade da Base de Dados
            </h2>
            <p className="text-xs text-slate-400 mt-1">Limite alocado para o projeto Supabase: <strong className="text-slate-300">{limiteDbMb} MB</strong></p>
          </div>
          <div className="flex-1 w-full md:max-w-md bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex justify-between text-xs font-bold mb-2">
              <span className={`${tamanhoDb.percentual > 80 ? 'text-rose-400' : 'text-indigo-400'}`}>
                {tamanhoDb.mb.toFixed(2)} MB Utilizados
              </span>
              <span className="text-slate-300">{tamanhoDb.percentual.toFixed(2)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${tamanhoDb.percentual > 85 ? 'bg-rose-500' : tamanhoDb.percentual > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                style={{ width: `${Math.min(tamanhoDb.percentual, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* CONFIGURAÇÕES */}
        <ConfigAbasConstrucao />

        {/* CADASTRO DE NOVO UTILIZADOR */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold mb-4 text-white">Cadastrar Novo Utilizador</h2>
          <form onSubmit={cadastrarUsuario} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input 
              type="email" 
              placeholder="utilizador@usebestfit.com.br" 
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
              <option value="compras">Operacional / Visualizador</option>
              <option value="admin">Administrador (Total Acesso)</option>
            </select>

            <div className="md:col-span-3 bg-slate-950 p-5 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Marque as Páginas Permitidas:
                </label>
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    onClick={selecionarTodas} 
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase cursor-pointer"
                  >
                    Marcar Todas
                  </button>
                  <span className="text-slate-600">|</span>
                  <button 
                    type="button" 
                    onClick={desmarcarTodas} 
                    className="text-[10px] text-slate-500 hover:text-slate-400 font-bold uppercase cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <GradePermissoes selecionadas={paginasSelecionadas} onToggle={togglePagina} />
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

        {/* TABELA DE UTILIZADORES */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl">
          <h2 className="text-lg font-bold mb-4 text-white">Utilizadores Registados e Permissões</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-4">Usuário</th>
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
                        <td className="p-4 align-top">
                          {isEditing ? (
                            <div className="space-y-2 min-w-[220px]">
                              <label className="block text-[11px] font-semibold text-slate-400">Nome do usuário
                                <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={MAX_NOME} data-editar-nome
                                  placeholder={nomeDoEmailPadrao(u.email)}
                                  className="mt-1 w-full border border-slate-600 rounded-lg p-1.5 bg-slate-950 text-white text-xs font-normal outline-none focus:border-indigo-500" />
                              </label>
                              <p className="text-[10px] text-slate-500">Aparece no chat, no Início, no Ranking e nas tarefas. Em branco, usa o nome do e-mail.</p>
                              <div className="text-[11px] text-slate-500 break-all">{u.email}</div>
                            </div>
                          ) : (
                            <>
                              {nomePersonalizado(u.email) && <div className="font-semibold text-white" data-nome-usuario>{nomePersonalizado(u.email)}</div>}
                              <div className={nomePersonalizado(u.email) ? "text-[11px] text-slate-400" : "font-semibold text-slate-200"}>{u.email}</div>
                            </>
                          )}
                        </td>
                        
                        <td className="p-4 font-bold align-top">
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

                        <td className="p-4 text-slate-300 align-top">
                          {isEditing ? (
                            <div className="max-w-2xl"><GradePermissoes compacto selecionadas={editandoPaginas} onToggle={toggleEditandoPagina} /></div>
                          ) : (
                            <div className="leading-relaxed">
                              {formatarPaginasPermitidas(u.paginas_permitidas)}
                            </div>
                          )}
                        </td>

                        <td className="p-4 text-center align-top">
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
                              <button onClick={() => iniciarEdicao(u)} title="Editar nome e permissões" className="bg-slate-800 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-400 border border-slate-700 hover:border-indigo-900/50 p-2 rounded-lg cursor-pointer transition-all">
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