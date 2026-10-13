"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  senha?: string;
  cargo?: string;
  ativo?: boolean;
  paginas_permitidas: string[];
  created_at?: string;
}

const rotasDisponiveis = [
  { id: "/", nome: "Dashboard (Curva ABC)" },
  { id: "/mapeamento", nome: "Cadastros" },
  { id: "/ads", nome: "Adsense" },
  { id: "/devolucoes", nome: "Devoluções" },
  { id: "/full", nome: "Logística Integrada" },
  { id: "/plp", nome: "PLPs (Flex e Coleta)" },
  { id: "/agenda", nome: "Agenda" },
  { id: "/regras", nome: "Regras" },
  { id: "/upload", nome: "Uploads" },
  { id: "/admin", nome: "Admin" }
];

export default function AdminPage() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Modal / Formulário de Edição e Criação
  const [modalAberto, setModalAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);

  // Estados dos campos do formulário
  const [formNome, setFormNome] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formSenha, setFormSenha] = useState("");
  const [formCargo, setFormCargo] = useState("");
  const [formAtivo, setFormAtivo] = useState(true);
  const [formPaginas, setFormPaginas] = useState<string[]>([]);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");

  useEffect(() => {
    const usuarioLogadoStr = localStorage.getItem("usuario_logado");
    if (!usuarioLogadoStr) {
      router.push("/login");
      return;
    }

    try {
      const usuarioLogado = JSON.parse(usuarioLogadoStr);
      const permitidas = usuarioLogado.paginas_permitidas || [];
      if (permitidas.length > 0 && !permitidas.includes("/admin")) {
        alert("🔒 Acesso Restrito: A sua conta não tem permissão de acesso à aba de Administração.");
        router.push(permitidas[0] || "/");
        return;
      }
    } catch {
      router.push("/login");
      return;
    }

    carregarUsuarios();
  }, [router]);

  const carregarUsuarios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Erro ao carregar utilizadores:", error);
      alert("Erro ao carregar utilizadores: " + error.message);
    } else {
      setUsuarios(data || []);
    }
    setLoading(false);
  };

  const abrirModalNovo = () => {
    setUsuarioEditando(null);
    setFormNome("");
    setFormEmail("");
    setFormSenha("");
    setFormCargo("Analista");
    setFormAtivo(true);
    setFormPaginas(["/", "/mapeamento", "/ads", "/devolucoes", "/full", "/plp"]);
    setMostrarSenha(false);
    setModalAberto(true);
  };

  const abrirModalEditar = (u: Usuario) => {
    setUsuarioEditando(u);
    setFormNome(u.nome || "");
    setFormEmail(u.email || "");
    setFormSenha(""); // Mantém em branco caso não queira trocar
    setFormCargo(u.cargo || "");
    setFormAtivo(u.ativo !== false);
    setFormPaginas(Array.isArray(u.paginas_permitidas) ? u.paginas_permitidas : []);
    setMostrarSenha(false);
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setUsuarioEditando(null);
  };

  const togglePermissao = (rotaId: string) => {
    if (formPaginas.includes(rotaId)) {
      setFormPaginas(formPaginas.filter((r) => r !== rotaId));
    } else {
      setFormPaginas([...formPaginas, rotaId]);
    }
  };

  const selecionarTodasPermissoes = () => {
    setFormPaginas(rotasDisponiveis.map((r) => r.id));
  };

  const desmarcarTodasPermissoes = () => {
    setFormPaginas([]);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formNome.trim() || !formEmail.trim()) {
      return alert("Preencha o Nome e o E-mail.");
    }

    if (!usuarioEditando && !formSenha.trim()) {
      return alert("Defina uma senha para o novo utilizador.");
    }

    setSalvando(true);

    const payload: any = {
      nome: formNome.trim(),
      email: formEmail.trim().toLowerCase(),
      cargo: formCargo.trim(),
      ativo: formAtivo,
      paginas_permitidas: formPaginas,
    };

    if (formSenha.trim()) {
      payload.senha = formSenha.trim();
    }

    if (usuarioEditando) {
      const { error } = await supabase
        .from("usuarios")
        .update(payload)
        .eq("id", usuarioEditando.id);

      if (error) {
        alert("Erro ao atualizar utilizador: " + error.message);
      } else {
        alert("✅ Utilizador atualizado com sucesso!");

        // Se o utilizador logado atualizou o seu próprio perfil, sincroniza o localStorage imediatamente
        const logadoStr = localStorage.getItem("usuario_logado");
        if (logadoStr) {
          try {
            const logado = JSON.parse(logadoStr);
            if (logado.id === usuarioEditando.id || logado.email === usuarioEditando.email) {
              localStorage.setItem(
                "usuario_logado",
                JSON.stringify({ ...logado, ...payload })
              );
            }
          } catch (err) {
            console.error(err);
          }
        }

        fecharModal();
        carregarUsuarios();
      }
    } else {
      const { error } = await supabase.from("usuarios").insert([payload]);

      if (error) {
        alert("Erro ao cadastrar utilizador: " + error.message);
      } else {
        alert("✅ Novo utilizador cadastrado com sucesso!");
        fecharModal();
        carregarUsuarios();
      }
    }
    setSalvando(false);
  };

  const handleExcluir = async (u: Usuario) => {
    const logadoStr = localStorage.getItem("usuario_logado");
    if (logadoStr) {
      try {
        const logado = JSON.parse(logadoStr);
        if (logado.id === u.id || logado.email === u.email) {
          return alert("⚠️ Ação não permitida: Não pode excluir a sua própria conta atualmente conectada.");
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (!confirm(`Deseja realmente excluir permanentemente o utilizador "${u.nome}" (${u.email})?`)) {
      return;
    }

    const { error } = await supabase.from("usuarios").delete().eq("id", u.id);
    if (error) {
      alert("Erro ao excluir utilizador: " + error.message);
    } else {
      alert("🗑️ Utilizador excluído com sucesso!");
      carregarUsuarios();
    }
  };

  const usuariosFiltrados = usuarios.filter((u) => {
    const t = termoBusca.toLowerCase();
    return (
      (u.nome && u.nome.toLowerCase().includes(t)) ||
      (u.email && u.email.toLowerCase().includes(t)) ||
      (u.cargo && u.cargo.toLowerCase().includes(t))
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto relative space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Administração & Utilizadores</h1>
            <p className="text-sm font-medium text-slate-400">
              Gestão de acessos, permissões por aba e segurança da plataforma
            </p>
          </div>
          <Navbar />
        </div>

        {/* Barra de Ações & Filtro */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Buscar por nome, e-mail ou cargo..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-purple-500 transition-all"
            />
          </div>
          <button
            onClick={abrirModalNovo}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-900/40 transition-all flex items-center justify-center gap-2"
          >
            <span>➕ Novo Utilizador</span>
          </button>
        </div>

        {/* Tabela de Utilizadores */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Contas Cadastradas ({usuariosFiltrados.length})
            </h3>
            <span className="text-xs text-slate-400">Total no banco: {usuarios.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-4 text-center">#</th>
                  <th className="p-4">Nome</th>
                  <th className="p-4">E-mail (Login)</th>
                  <th className="p-4">Cargo / Função</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4">Páginas Permitidas</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                {usuariosFiltrados.map((u, idx) => {
                  const permitidas = Array.isArray(u.paginas_permitidas) ? u.paginas_permitidas : [];
                  const temTodas = permitidas.length >= rotasDisponiveis.length;

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-4 font-bold text-white">{u.nome}</td>
                      <td className="p-4 font-mono text-purple-300">{u.email}</td>
                      <td className="p-4 text-slate-300">
                        <span className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md text-[11px] font-semibold">
                          {u.cargo || "Não definido"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                            u.ativo !== false
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-900/50"
                              : "bg-rose-950/60 text-rose-400 border-rose-900/50"
                          }`}
                        >
                          {u.ativo !== false ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {temTodas ? (
                            <span className="bg-purple-950/80 text-purple-300 border border-purple-800 px-2 py-0.5 rounded text-[10px] font-black">
                              ⭐ ACESSO TOTAL ({permitidas.length} abas)
                            </span>
                          ) : permitidas.length === 0 ? (
                            <span className="text-slate-500 italic text-[11px]">Nenhuma permissão</span>
                          ) : (
                            permitidas.map((rotaId) => {
                              const rotaObj = rotasDisponiveis.find((r) => r.id === rotaId);
                              return (
                                <span
                                  key={rotaId}
                                  className="bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 rounded text-[10px] font-mono"
                                >
                                  {rotaObj ? rotaObj.nome : rotaId}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => abrirModalEditar(u)}
                            className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 font-bold py-1.5 px-3 rounded-lg text-xs uppercase tracking-wider cursor-pointer transition-all"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleExcluir(u)}
                            className="bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-900/40 font-bold py-1.5 px-3 rounded-lg text-xs uppercase tracking-wider cursor-pointer transition-all"
                            title="Excluir utilizador"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {usuariosFiltrados.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Nenhum utilizador encontrado para a busca.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      A carregar lista de utilizadores...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ================= MODAL DE CRIAÇÃO / EDIÇÃO ================= */}
        {modalAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>{usuarioEditando ? "✏️ Editar Utilizador" : "➕ Novo Utilizador"}</span>
                </h3>
                <button
                  onClick={fecharModal}
                  className="text-slate-400 hover:text-white p-1 text-base cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSalvar} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Nome Completo:
                    </label>
                    <input
                      type="text"
                      required
                      value={formNome}
                      onChange={(e) => setFormNome(e.target.value)}
                      placeholder="Ex: Henrique Teixeira"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-purple-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      E-mail (Login):
                    </label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="usuario@bestfit.com.br"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-purple-500 transition-all"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {usuarioEditando ? "Nova Senha (opcional):" : "Senha de Acesso:"}
                      </label>
                      <button
                        type="button"
                        onClick={() => setMostrarSenha(!mostrarSenha)}
                        className="text-[10px] text-purple-400 hover:underline cursor-pointer"
                      >
                        {mostrarSenha ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    <input
                      type={mostrarSenha ? "text" : "password"}
                      value={formSenha}
                      onChange={(e) => setFormSenha(e.target.value)}
                      placeholder={usuarioEditando ? "Deixe em branco para manter a atual" : "Digite a senha"}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-purple-500 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Cargo / Função:
                    </label>
                    <input
                      type="text"
                      value={formCargo}
                      onChange={(e) => setFormCargo(e.target.value)}
                      placeholder="Ex: Gestor de E-commerce"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="checkbox-ativo"
                    checked={formAtivo}
                    onChange={(e) => setFormAtivo(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                  <label htmlFor="checkbox-ativo" className="text-xs font-bold text-white cursor-pointer select-none">
                    Utilizador Ativo (pode fazer login no sistema)
                  </label>
                </div>

                {/* Seção de Permissões */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                      Abas Permitidas para este Utilizador:
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selecionarTodasPermissoes}
                        className="text-[10px] font-bold text-emerald-400 hover:underline cursor-pointer"
                      >
                        ✓ Marcar Todas
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={desmarcarTodasPermissoes}
                        className="text-[10px] font-bold text-rose-400 hover:underline cursor-pointer"
                      >
                        ✕ Desmarcar Todas
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 max-h-56 overflow-y-auto">
                    {rotasDisponiveis.map((rota) => {
                      const marcada = formPaginas.includes(rota.id);
                      return (
                        <label
                          key={rota.id}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                            marcada
                              ? "bg-purple-950/30 border-purple-800 text-white"
                              : "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={marcada}
                            onChange={() => togglePermissao(rota.id)}
                            className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">{rota.nome}</span>
                            <span className="text-[10px] font-mono text-slate-500">{rota.id}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={fecharModal}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvando}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-purple-900/40 transition-all"
                  >
                    {salvando ? "A Salvar..." : usuarioEditando ? "Atualizar Utilizador" : "Cadastrar Utilizador"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}