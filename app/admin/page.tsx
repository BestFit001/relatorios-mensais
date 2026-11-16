"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { MAX_NOME, nomeDoEmailPadrao, nomePersonalizado, salvarNome, useNomes } from "../../lib/nomes";
import { ROTAS_DISPONIVEIS, SECOES_MENU, ROTA_INICIO, nomeDaRota } from "../../lib/rotasMenu";
import { NIVEIS, acessoTotal, nomeDoNivel } from "../../lib/perfis";
import { AGENDAS, agendasDoUsuario, nomeDaAgenda, redefinirSenha } from "../../lib/agendaAcesso";

const rotasDisponiveis = ROTAS_DISPONIVEIS;

/** Grade de permissões agrupada como o menu lateral (Início, Dashboard, Marketing, Relatórios...). */
function GradePermissoes({ selecionadas, onToggle, compacto = false, ocultas = [] }: { selecionadas: string[]; onToggle: (id: string) => void; compacto?: boolean; ocultas?: string[] }) {
  const soltas = SECOES_MENU.filter((s) => !s.submenu).flatMap((s) => s.rotas).filter((r) => !ocultas.includes(r.id));
  const grupos = [
    { titulo: "Geral", itens: soltas },
    ...SECOES_MENU.filter((s) => s.submenu).map((s) => ({ titulo: s.titulo, itens: s.rotas.filter((r) => !ocultas.includes(r.id)) })).filter((g) => g.itens.length > 0),
  ];
  const conhecidas = new Set<string>([ROTA_INICIO.id, ...ROTAS_DISPONIVEIS.map((r) => r.id)]);
  const antigas = selecionadas.filter((id) => !conhecidas.has(id) && !ocultas.includes(id));   // acessos gravados no passado que não existem mais
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
    <div data-config-construcao>
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

/** Seção do painel com botão Ocultar/Mostrar: fechada, sobra só o título. A escolha fica guardada neste navegador. */
function Secao({ id, titulo, descricao, iniciaAberta = true, children }: { id: string; titulo: string; descricao?: React.ReactNode; iniciaAberta?: boolean; children: React.ReactNode }) {
  const [aberta, setAberta] = useState(iniciaAberta);
  useEffect(() => {
    try { const v = localStorage.getItem("admin_secao_" + id); if (v === "1" || v === "0") setAberta(v === "1"); } catch { /* sem storage: usa o padrão */ }
  }, [id]);
  const alternar = () => {
    const n = !aberta; setAberta(n);
    try { localStorage.setItem("admin_secao_" + id, n ? "1" : "0"); } catch { /* ok */ }
  };
  return (
    <section className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl mb-6" data-secao={id} data-aberta={aberta ? "1" : "0"}>
      <div className="flex items-center justify-between gap-3 px-6 py-4">
        <h2 className="text-lg font-bold text-white">{titulo}</h2>
        <button type="button" data-secao-alternar={id} aria-expanded={aberta} onClick={alternar}
          className="shrink-0 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-bold py-1.5 px-3 rounded-lg cursor-pointer">
          {aberta ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {aberta && (
        <div className="px-6 pb-6">
          {descricao && <p className="text-xs text-slate-400 mb-4">{descricao}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

const COR_NIVEL: Record<string, string> = {
  admin: "bg-indigo-950/60 text-indigo-300 border border-indigo-900/50",
  admin_area: "bg-sky-950/60 text-sky-300 border border-sky-900/50",
  analista: "bg-emerald-950/50 text-emerald-300 border border-emerald-900/50",
  geral: "bg-slate-800 text-slate-300 border border-slate-700",
};

/** Nível + agendas + áreas: usado ao criar e ao editar (lápis) um usuário. */
function PainelNivel({ perfil, onPerfil, agendas, onAgendas, paginas, onPaginas }: { perfil: string; onPerfil: (v: string) => void; agendas: string[]; onAgendas: (v: string[]) => void; paginas: string[]; onPaginas: (v: string[]) => void }) {
  const total = acessoTotal(perfil);
  const geral = perfil === "admin";
  const nivel = NIVEIS.find((n) => n.valor === perfil);
  const alternarAgenda = (c: string) => onAgendas(agendas.includes(c) ? agendas.filter((x) => x !== c) : [...agendas, c]);
  const alternarPagina = (id: string) => onPaginas(paginas.includes(id) ? paginas.filter((x) => x !== id) : [...paginas, id]);
  return (
    <div className="space-y-4" data-painel-nivel>
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 items-start">
        <label className="block text-[11px] font-semibold text-slate-400">Nível de acesso
          <select data-nivel value={perfil} onChange={(e) => onPerfil(e.target.value)} className="mt-1 w-full border border-slate-600 rounded-lg p-2 bg-slate-950 text-white text-xs outline-none cursor-pointer focus:border-indigo-500">
            {perfil === "compras" && <option value="compras">Operacional (antigo)</option>}
            {NIVEIS.map((n) => <option key={n.valor} value={n.valor}>{n.nome}</option>)}
          </select>
        </label>
        <p className="text-[11px] text-slate-500 md:pt-6">{nivel?.descricao || "Nível antigo: acessa somente as áreas designadas."}</p>
      </div>

      <div data-agendas-usuario>
        <p className="text-[10px] font-black text-indigo-300 uppercase tracking-wider mb-1.5">Agendas que este usuário pode abrir</p>
        <div className="flex flex-wrap gap-2">
          {AGENDAS.map((a) => (
            <label key={a.chave} className={"flex items-center gap-2 text-xs font-semibold bg-slate-950 px-3 py-2 rounded-lg border border-slate-700 " + (geral ? "opacity-70 cursor-default" : "cursor-pointer hover:border-slate-500")}>
              <input type="checkbox" data-agenda={a.chave} checked={geral || agendas.includes(a.chave)} disabled={geral} onChange={() => alternarAgenda(a.chave)} className="accent-indigo-600" />
              {a.nome}
            </label>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5">{geral ? "O Admin Geral enxerga as 3 agendas." : "Cada agenda só abre para quem estiver marcado aqui (e com a senha da agenda, pedida a cada 30 dias)."}</p>
      </div>

      {total ? (
        <p className="text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2" data-todas-abas>
          {geral ? "Acesso a todas as abas, incluindo o Painel Admin." : "Acesso a todas as abas, exceto o Painel Admin."}
        </p>
      ) : (
        <div>
          <p className="text-[10px] font-black text-indigo-300 uppercase tracking-wider mb-1.5">Áreas permitidas</p>
          <GradePermissoes compacto selecionadas={paginas} onToggle={alternarPagina} ocultas={["/agenda", "/admin"]} />
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={() => onPaginas(["/", ...ROTAS_DISPONIVEIS.map((r) => r.id).filter((id) => id !== "/admin" && id !== "/agenda" && id !== "/")])} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase cursor-pointer">Marcar todas</button>
            <button type="button" onClick={() => onPaginas(["/"])} className="text-[10px] text-slate-500 hover:text-slate-400 font-bold uppercase cursor-pointer">Limpar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Abas gravadas conforme o nível: Admin Geral = todas; Admin de Área = todas menos /admin; demais = as marcadas (+ /agenda se tiver agenda). */
function paginasDoNivel(perfil: string, marcadas: string[], agendas: string[]): string[] {
  const todas = ROTAS_DISPONIVEIS.map((r) => r.id);
  if (perfil === "admin") return todas;
  if (perfil === "admin_area") return todas.filter((id) => id !== "/admin");
  const base = marcadas.filter((id) => id !== "/agenda" && id !== "/admin");
  return agendas.length > 0 ? [...base, "/agenda"] : base;
}

export default function AdminPage() {
  useNomes();
  const router = useRouter();
  const [liberado, setLiberado] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("geral");
  const [agendasNovo, setAgendasNovo] = useState<string[]>([]);
  const [paginasSelecionadas, setPaginasSelecionadas] = useState<string[]>(["/"]);

  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoPerfil, setNovoPerfil] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [editandoPaginas, setEditandoPaginas] = useState<string[]>([]);
  const [editandoAgendas, setEditandoAgendas] = useState<string[]>([]);
  const [avisoSenha, setAvisoSenha] = useState("");

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

  // Só o Admin Geral entra aqui (Admin de Área e os demais voltam para o Início)
  useEffect(() => {
    let u: any = null;
    try { u = JSON.parse(localStorage.getItem("usuario_logado") || "null"); } catch { u = null; }
    if (!u?.email) { router.push("/login"); return; }
    if (u.perfil !== "admin") { router.push("/inicio"); return; }
    setLiberado(true);
    carregarUsuariosEStatus();
  }, [router]);

  const handlePerfilChange = (valor: string) => {
    setPerfil(valor);
    if (!acessoTotal(valor)) setPaginasSelecionadas((p) => (p.length ? p : ["/"]));
  };

  const cadastrarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    const agendas = perfil === "admin" ? [] : agendasNovo;
    const paginas = paginasDoNivel(perfil, paginasSelecionadas, agendas);
    if (paginas.length === 0) return alert("Selecione pelo menos uma área de acesso.");

    setLoading(true);
    const idUnico = crypto.randomUUID();

    const { error: dbError } = await supabase.from('usuarios_permissoes').insert({
      id: idUnico,
      email: email.trim().toLowerCase(),
      perfil: perfil,
      senha: senha,
      paginas_permitidas: paginas,
      agendas,
    });

    if (dbError) {
      alert("Erro ao cadastrar utilizador: " + dbError.message);
    } else {
      alert("✅ Utilizador cadastrado com sucesso!");
      setEmail("");
      setSenha("");
      setPaginasSelecionadas(["/"]);
      setAgendasNovo([]);
      setPerfil("geral");
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
    setNovoPerfil(u.perfil || "geral");
    setEditandoPaginas(u.paginas_permitidas || []);
    setEditandoAgendas(Array.isArray(u.agendas) ? u.agendas : []);
    setAvisoSenha("");
  };

  const salvarEdicao = async (id: string) => {
    const agendas = novoPerfil === "admin" ? [] : editandoAgendas;
    const paginas = paginasDoNivel(novoPerfil, editandoPaginas, agendas);
    if (paginas.length === 0) return alert("O utilizador precisa de acesso a pelo menos uma área.");

    const { error } = await supabase
      .from('usuarios_permissoes')
      .update({ perfil: novoPerfil, paginas_permitidas: paginas, agendas })
      .eq('id', id);

    if (error) alert("Erro ao atualizar: " + error.message);
    else {
      const emailEditado = usuarios.find((u) => u.id === id)?.email || "";
      const erroNome = emailEditado ? await salvarNome(emailEditado, novoNome) : null;
      alert(erroNome ? "✅ Permissões atualizadas, mas não consegui salvar o nome: " + erroNome : "✅ Usuário atualizado com sucesso!");

      const logado = JSON.parse(localStorage.getItem("usuario_logado") || "{}");
      if (logado.id === id || logado.email === usuarios.find(u => u.id === id)?.email) {
        logado.paginas_permitidas = paginas;
        logado.perfil = novoPerfil;
        logado.agendas = agendas;
        localStorage.setItem("usuario_logado", JSON.stringify(logado));
      }

      setEditandoId(null);
      carregarUsuariosEStatus();
    }
  };

  const redefinirSenhaAgenda = async (emailUser: string) => {
    if (!confirm(`Redefinir a senha da agenda de ${emailUser}? Ele(a) cria uma nova no próximo acesso.`)) return;
    const falha = await redefinirSenha(emailUser.trim().toLowerCase());
    setAvisoSenha(falha || `✅ Senha da agenda de ${emailUser} redefinida: no próximo acesso será criada outra.`);
  };

  const resumoAgendas = (u: any) =>
    u.perfil === "admin" ? "Todas" : agendasDoUsuario(u.perfil, u.agendas).map(nomeDaAgenda).join(", ") || "—";

  if (!liberado) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Carregando…</div>;

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
        <Secao id="capacidade" titulo="☁️ Capacidade da Base de Dados" iniciaAberta={false}
          descricao={<>Limite alocado para o projeto Supabase: <strong className="text-slate-300">{limiteDbMb} MB</strong></>}>
          <div className="w-full md:max-w-md bg-slate-950 p-4 rounded-xl border border-slate-800">
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
        </Secao>

        {/* CONFIGURAÇÕES */}
        <Secao id="construcao" titulo="⚙️ Configurações — Aviso de aba em construção" iniciaAberta={false}
          descricao={<>As abas marcadas abrem com o fundo embaçado e a pergunta <strong className="text-slate-200">“Aba em construção, deseja continuar?”</strong> (Sim libera a página; Não volta ao Início). A mudança vale na hora, para todos os usuários.</>}>
          <ConfigAbasConstrucao />
        </Secao>

        {/* CADASTRO DE NOVO UTILIZADOR */}
        <Secao id="cadastro" titulo="Cadastrar Novo Utilizador" iniciaAberta={false}>
          <form onSubmit={cadastrarUsuario} className="grid grid-cols-1 md:grid-cols-2 gap-4" data-form-cadastro>
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

            <div className="md:col-span-2 bg-slate-950 p-5 rounded-xl border border-slate-800">
              <PainelNivel perfil={perfil} onPerfil={handlePerfilChange} agendas={agendasNovo} onAgendas={setAgendasNovo} paginas={paginasSelecionadas} onPaginas={setPaginasSelecionadas} />
            </div>

            <div className="md:col-span-2 flex justify-end mt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md"
              >
                {loading ? "A cadastrar..." : "+ Criar Utilizador"}
              </button>
            </div>
          </form>
        </Secao>

        {/* TABELA DE UTILIZADORES */}
        <Secao id="usuarios" titulo="Utilizadores Registados e Permissões">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" data-tabela-usuarios>
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-4">Usuário</th>
                  <th className="p-4 w-40">Nível</th>
                  <th className="p-4">Agendas</th>
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
                      <React.Fragment key={u.id}>
                        <tr data-usuario={u.email} className={"transition-colors " + (isEditing ? "bg-slate-800/40" : "hover:bg-slate-800/40")}>
                          <td className="p-4 align-top">
                            {nomePersonalizado(u.email) && <div className="font-semibold text-white" data-nome-usuario>{nomePersonalizado(u.email)}</div>}
                            <div className={nomePersonalizado(u.email) ? "text-[11px] text-slate-400" : "font-semibold text-slate-200"}>{u.email}</div>
                          </td>
                          <td className="p-4 align-top">
                            <span data-nivel-usuario className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${COR_NIVEL[u.perfil] || COR_NIVEL.geral}`}>
                              {nomeDoNivel(u.perfil)}
                            </span>
                          </td>
                          <td className="p-4 align-top text-slate-300" data-agendas-resumo>{resumoAgendas(u)}</td>
                          <td className="p-4 text-center align-top">
                            {isEditing ? (
                              <span className="text-[10px] text-slate-500">editando…</span>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button data-editar-usuario onClick={() => iniciarEdicao(u)} title="Editar nome e permissões" className="bg-slate-800 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-400 border border-slate-700 hover:border-indigo-900/50 p-2 rounded-lg cursor-pointer transition-all">
                                  ✏️
                                </button>
                                <button onClick={() => excluirUsuario(u.id, u.email)} title="Excluir Utilizador" className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 p-2 rounded-lg cursor-pointer transition-all">
                                  🗑️
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isEditing && (
                          <tr data-edicao-usuario>
                            <td colSpan={4} className="p-5 bg-slate-950/70 border-b border-slate-800">
                              <div className="space-y-4 max-w-4xl">
                                <label className="block text-[11px] font-semibold text-slate-400 max-w-sm">Nome do usuário
                                  <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={MAX_NOME} data-editar-nome
                                    placeholder={nomeDoEmailPadrao(u.email)}
                                    className="mt-1 w-full border border-slate-600 rounded-lg p-1.5 bg-slate-950 text-white text-xs font-normal outline-none focus:border-indigo-500" />
                                  <span className="block text-[10px] text-slate-500 font-normal mt-1">Aparece no chat, no Início, no Ranking e nas tarefas. Em branco, usa o nome do e-mail ({u.email}).</span>
                                </label>
                                <PainelNivel perfil={novoPerfil} onPerfil={setNovoPerfil} agendas={editandoAgendas} onAgendas={setEditandoAgendas} paginas={editandoPaginas} onPaginas={setEditandoPaginas} />
                                {novoPerfil !== "admin" && editandoAgendas.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                    <button type="button" data-redefinir-senha-agenda onClick={() => redefinirSenhaAgenda(u.email)} className="text-rose-400 hover:text-rose-300 font-bold cursor-pointer">Redefinir senha da agenda</button>
                                    <span className="text-slate-500">use se a pessoa esqueceu a senha: ela cria outra no próximo acesso</span>
                                  </div>
                                )}
                                {avisoSenha && <p data-aviso-senha className="text-[11px] font-bold text-emerald-300">{avisoSenha}</p>}
                                <div className="flex gap-2 pt-1">
                                  <button data-salvar-usuario onClick={() => salvarEdicao(u.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold text-[11px] uppercase cursor-pointer transition-all shadow-sm">Salvar</button>
                                  <button onClick={() => setEditandoId(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-bold text-[11px] uppercase cursor-pointer transition-all">Cancelar</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Secao>

      </div>
    </div>
  );
}
