"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { calcularResumoCanais, TABELAS_RESUMO, type ResumoCanal } from "../../lib/resumoCanais";

// ---------------------------------------------------------------------------------------------
// Tela inicial: canais de cada analista (números do Dashboard), notificações e tarefas do administrador
// ---------------------------------------------------------------------------------------------

const POR_PAGINA = 10;
const DEV_ATENCAO = 5;     // % de devolução que gera aviso (mesmo padrão da aba Full)
const DEV_CRITICO = 10;    // % a partir da qual o envio ao Full não é recomendado
const DEV_AMOSTRA_MIN = 5; // vendas mínimas para a taxa ser considerada

const norm = (v: any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const moeda = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dataBR = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const nomeDoEmail = (email: string) =>
  String(email || "").split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

async function buscarTudo(tabela: string): Promise<any[]> {
  const todas: any[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase.from(tabela).select("*").range(de, de + passo - 1);
    if (error || !data) break;
    todas.push(...data);
    if (data.length < passo) break;
  }
  return todas;
}

type Notificacao = { id: string; tipo: "full" | "devolucao" | "tarefa"; nivel: "critico" | "atencao" | "info"; titulo: string; detalhe: string; canal?: string };

export default function InicioPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<{ email: string; perfil: string } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [db, setDb] = useState<Record<string, any[]>>({});
  const [mapeamentos, setMapeamentos] = useState<any[]>([]);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [usuariosLista, setUsuariosLista] = useState<any[]>([]);
  const [saldoFull, setSaldoFull] = useState<any[]>([]);
  const [lancFull, setLancFull] = useState<any[]>([]);
  const [lancPropria, setLancPropria] = useState<any[]>([]);
  const [faltaMigration, setFaltaMigration] = useState(false);

  const [mesModo, setMesModo] = useState<"atual" | "anterior">("atual");
  const [analistaFiltro, setAnalistaFiltro] = useState("TODOS");
  const [painelAdmin, setPainelAdmin] = useState(false);

  // Tarefas
  const [aba, setAba] = useState<"andamento" | "concluidas" | "todos">("andamento");
  const [pagina, setPagina] = useState(1);
  const [filtroResp, setFiltroResp] = useState("TODOS");
  const [filtroNotif, setFiltroNotif] = useState<"todas" | "full" | "devolucao" | "tarefa">("todas");
  const [novaTarefa, setNovaTarefa] = useState({ titulo: "", descricao: "", prioridade: "Média", data_entrega: "", responsavel: "TODOS" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const salvo = localStorage.getItem("usuario_logado");
    if (!salvo) { router.push("/login"); return; }
    try {
      const u = JSON.parse(salvo);
      setUsuario({ email: String(u.email || "").trim().toLowerCase(), perfil: String(u.perfil || "") });
    } catch { router.push("/login"); return; }
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarTudo = async () => {
    setCarregando(true);
    const [tabelas, usuarios] = await Promise.all([
      Promise.all(TABELAS_RESUMO.map(async (t) => [t, await buscarTudo(t)] as const)),
      buscarTudo("usuarios_permissoes"),
    ]);
    const resultado: Record<string, any[]> = {};
    tabelas.forEach(([t, linhas]) => { resultado[t] = linhas; });
    setDb(resultado);
    setUsuariosLista(usuarios);
    await carregarHome();

    const [saldo, lf, lp] = await Promise.all([
      supabase.from("vw_fulfillment_saldo_sku").select("*"),
      supabase.from("full_lancamentos").select("canal, mes_referencia, sku, produto, qtd_vendida, taxa_devolucao, qtd_devolucoes"),
      supabase.from("vendas_padrao_lancamentos").select("canal, mes_referencia, sku, produto, qtd_vendida, taxa_devolucao, qtd_devolucoes"),
    ]);
    setSaldoFull(saldo.data || []);
    setLancFull(lf.data || []);
    setLancPropria(lp.data || []);
    setCarregando(false);
  };

  const carregarHome = async () => {
    const [m, t] = await Promise.all([
      supabase.from("home_responsaveis_canais").select("*"),
      supabase.from("home_tarefas").select("*").order("id", { ascending: false }),
    ]);
    if (m.error || t.error) { setFaltaMigration(true); return; }
    setFaltaMigration(false);
    setMapeamentos(m.data || []);
    setTarefas(t.data || []);
  };

  const isAdmin = usuario?.perfil === "admin";
  const hoje = hojeSP();

  // ---- Mês (mesma regra do Dashboard)
  const mesIso = useMemo(() => {
    if (mesModo === "atual") return new Date().toISOString().slice(0, 7);
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, [mesModo]);
  const mesBarra = `${mesIso.slice(5, 7)}/${mesIso.slice(0, 4)}`;

  // ---- Resumo por canal (mesmos números do Dashboard)
  const resumo: ResumoCanal[] = useMemo(() => {
    if (!db.vendas_canais) return [];
    try { return calcularResumoCanais(db, mesIso); } catch (e) { console.error("Erro no resumo dos canais:", e); return []; }
  }, [db, mesIso]);

  // ---- Analistas disponíveis (e-mails únicos)
  const analistas = useMemo(() => {
    const mapa = new Map<string, { email: string; perfil: string }>();
    usuariosLista.forEach((u: any) => {
      const email = String(u.email || "").trim().toLowerCase();
      if (!email) return;
      const atual = mapa.get(email);
      if (!atual || (u.perfil === "admin" && atual.perfil !== "admin")) mapa.set(email, { email, perfil: String(u.perfil || "") });
    });
    return Array.from(mapa.values()).sort((a, b) => nomeDoEmail(a.email).localeCompare(nomeDoEmail(b.email)));
  }, [usuariosLista]);
  const analistasNaoAdmin = analistas.filter((a) => a.perfil !== "admin");

  const canaisDoEmail = (email: string) => new Set(mapeamentos.filter((m: any) => String(m.email).trim().toLowerCase() === email).map((m: any) => norm(m.canal)));

  const emailAlvo = isAdmin ? (analistaFiltro === "TODOS" ? "" : analistaFiltro) : (usuario?.email || "");
  const canaisVisiveis: ResumoCanal[] = useMemo(() => {
    if (!usuario) return [];
    if (isAdmin && analistaFiltro === "TODOS") return resumo;
    const meus = canaisDoEmail(emailAlvo);
    return resumo.filter((c) => meus.has(norm(c.canal)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo, mapeamentos, usuario, isAdmin, analistaFiltro, emailAlvo]);
  const nomesVisiveis = useMemo(() => new Set(canaisVisiveis.map((c) => norm(c.canal))), [canaisVisiveis]);

  const totais = useMemo(() => {
    const fat = canaisVisiveis.reduce((a, c) => a + c.faturadoComRedutor, 0);
    const meta = canaisVisiveis.reduce((a, c) => a + c.metaValor, 0);
    const lucro = canaisVisiveis.reduce((a, c) => a + c.lucroLiquidoReal, 0);
    const bruto = canaisVisiveis.reduce((a, c) => a + c.faturadoBruto, 0);
    return { fat, meta, lucro, margem: bruto > 0 ? (lucro / bruto) * 100 : 0, progresso: meta > 0 ? (fat / meta) * 100 : 0 };
  }, [canaisVisiveis]);

  const analistasDoCanal = (canal: string) =>
    mapeamentos.filter((m: any) => norm(m.canal) === norm(canal)).map((m: any) => nomeDoEmail(m.email).split(" ")[0]);

  // ---- Tarefas
  const minhasTarefas = useMemo(() => {
    const lista = isAdmin ? tarefas : tarefas.filter((t: any) => String(t.responsavel_email).trim().toLowerCase() === usuario?.email);
    return isAdmin && filtroResp !== "TODOS" ? lista.filter((t: any) => String(t.responsavel_email).trim().toLowerCase() === filtroResp) : lista;
  }, [tarefas, isAdmin, usuario, filtroResp]);

  const qtdAndamento = minhasTarefas.filter((t: any) => !t.concluida).length;
  const qtdConcluidas = minhasTarefas.filter((t: any) => t.concluida).length;
  const tarefasFiltradas = useMemo(() => {
    const base = minhasTarefas.filter((t: any) => (aba === "andamento" ? !t.concluida : aba === "concluidas" ? !!t.concluida : true));
    return base.slice().sort((a: any, b: any) => {
      if (!!a.concluida !== !!b.concluida) return a.concluida ? 1 : -1;
      if (a.concluida) return String(b.concluida_em || "").localeCompare(String(a.concluida_em || ""));
      const da = a.data_entrega || "9999-12-31", dbb = b.data_entrega || "9999-12-31";
      return da.localeCompare(dbb) || Number(a.id) - Number(b.id);
    });
  }, [minhasTarefas, aba]);
  const totalPaginas = Math.max(1, Math.ceil(tarefasFiltradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const tarefasPagina = tarefasFiltradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const alternarConclusao = async (t: any) => {
    const concluir = !t.concluida;
    const { error } = await supabase.from("home_tarefas").update({
      concluida: concluir, concluida_em: concluir ? new Date().toISOString() : null, concluida_por: concluir ? usuario?.email : null,
    }).eq("id", t.id);
    if (error) return alert("Erro ao atualizar a tarefa: " + error.message);
    setTarefas((prev) => prev.map((x) => (x.id === t.id ? { ...x, concluida: concluir, concluida_em: concluir ? new Date().toISOString() : null, concluida_por: concluir ? usuario?.email : null } : x)));
  };

  const excluirTarefa = async (t: any) => {
    if (!confirm(`Excluir a tarefa "${t.titulo}" de ${nomeDoEmail(t.responsavel_email)}?`)) return;
    const { error } = await supabase.from("home_tarefas").delete().eq("id", t.id);
    if (error) return alert("Erro ao excluir: " + error.message);
    setTarefas((prev) => prev.filter((x) => x.id !== t.id));
  };

  const criarTarefa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const titulo = novaTarefa.titulo.trim();
    if (!titulo) return;
    let destinos: string[] = [];
    if (novaTarefa.responsavel === "TODOS") {
      const comCanais = new Set(mapeamentos.map((m: any) => String(m.email).trim().toLowerCase()));
      const alvo = analistasNaoAdmin.filter((a) => comCanais.has(a.email));
      destinos = (alvo.length ? alvo : analistasNaoAdmin).map((a) => a.email);
    } else destinos = [novaTarefa.responsavel];
    if (destinos.length === 0) return alert("Nenhum analista encontrado para receber a tarefa.");

    setSalvando(true);
    const grupo = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : null;
    const linhas = destinos.map((email) => ({
      titulo, descricao: novaTarefa.descricao.trim(), prioridade: novaTarefa.prioridade,
      data_entrega: novaTarefa.data_entrega || null, responsavel_email: email, criado_por: usuario?.email, concluida: false, grupo_id: grupo,
    }));
    const { error } = await supabase.from("home_tarefas").insert(linhas);
    setSalvando(false);
    if (error) return alert("Erro ao criar a tarefa (o SQL da tela inicial já foi executado?): " + error.message);
    setNovaTarefa({ titulo: "", descricao: "", prioridade: "Média", data_entrega: "", responsavel: novaTarefa.responsavel });
    await carregarHome();
    setAba("andamento"); setPagina(1);
  };

  const alternarCanalDoAnalista = async (email: string, canal: string, ativo: boolean) => {
    if (!isAdmin) return;
    if (ativo) {
      const { error } = await supabase.from("home_responsaveis_canais").delete().eq("email", email).eq("canal", canal);
      if (error) return alert("Erro: " + error.message);
    } else {
      const { error } = await supabase.from("home_responsaveis_canais").insert({ email, canal });
      if (error) return alert("Erro: " + error.message);
    }
    await carregarHome();
  };

  // ---- Notificações
  const notificacoes: Notificacao[] = useMemo(() => {
    const lista: Notificacao[] = [];

    // Estoque no Full (armazenagem): do mais urgente para o menos
    saldoFull
      .filter((s: any) => (s.nivel === "ALERTA" || s.nivel === "COBRANDO") && nomesVisiveis.has(norm(s.canal)))
      .sort((a: any, b: any) => (a.nivel === b.nivel ? Number(a.dias_para_cobranca) - Number(b.dias_para_cobranca) : a.nivel === "COBRANDO" ? -1 : 1))
      .forEach((s: any) => {
        const qtd = Number(s.nivel === "COBRANDO" ? s.qtd_cobrando : s.qtd_em_alerta) || Number(s.saldo_lotes) || 0;
        const dias = Number(s.dias_para_cobranca);
        lista.push(s.nivel === "COBRANDO"
          ? { id: `full-${s.canal}-${s.sku}`, tipo: "full", nivel: "critico", canal: s.canal, titulo: `${s.sku} — armazenagem em cobrança`, detalhe: `${s.canal}: ${qtd} un. no Full passaram do prazo (lote mais antigo com ${s.lote_mais_antigo_dias} dias).` }
          : { id: `full-${s.canal}-${s.sku}`, tipo: "full", nivel: "atencao", canal: s.canal, titulo: `${s.sku} — ${dias <= 1 ? "falta 1 dia" : `faltam ${dias} dias`} para cobrar armazenagem`, detalhe: `${s.canal}: ${qtd} un. com ${s.lote_mais_antigo_dias} dias no Full.` });
      });

    // Devoluções altas (análises salvas da aba Full e da Logística Própria, no mês selecionado)
    const melhor = new Map<string, any>();
    [...lancFull, ...lancPropria].forEach((l: any) => {
      if (String(l.mes_referencia) !== mesBarra || !nomesVisiveis.has(norm(l.canal))) return;
      const taxa = Number(l.taxa_devolucao) || 0, dev = Number(l.qtd_devolucoes) || 0, vend = Number(l.qtd_vendida) || 0;
      if (dev <= 0 || taxa < DEV_ATENCAO || vend < DEV_AMOSTRA_MIN) return;
      const k = `${norm(l.canal)}|${l.sku}`;
      if (!melhor.has(k) || taxa > Number(melhor.get(k).taxa_devolucao)) melhor.set(k, l);
    });
    Array.from(melhor.values()).sort((a, b) => Number(b.taxa_devolucao) - Number(a.taxa_devolucao)).forEach((l: any) => {
      const taxa = Number(l.taxa_devolucao);
      lista.push({
        id: `dev-${l.canal}-${l.sku}`, tipo: "devolucao", nivel: taxa >= DEV_CRITICO ? "critico" : "atencao", canal: l.canal,
        titulo: `${l.sku}${l.produto && l.produto !== "Produto Desconhecido" ? " · " + l.produto : ""} — ${pct(taxa)} de devolução`,
        detalhe: `${l.canal}: ${l.qtd_devolucoes} devolvida(s) em ${l.qtd_vendida} vendida(s) em ${mesBarra}.${taxa >= DEV_CRITICO ? " Envio ao Full não recomendado." : ""}`,
      });
    });

    // Tarefas atrasadas ou para os próximos 2 dias
    minhasTarefas.filter((t: any) => !t.concluida && t.data_entrega).forEach((t: any) => {
      const d = String(t.data_entrega).slice(0, 10);
      const dias = Math.round((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))) / 86400000);
      if (dias > 2) return;
      lista.push({
        id: `tarefa-${t.id}`, tipo: "tarefa", nivel: dias < 0 ? "critico" : "atencao",
        titulo: `${t.titulo} — ${dias < 0 ? `atrasada há ${-dias} dia(s)` : dias === 0 ? "vence hoje" : `vence em ${dias} dia(s)`}`,
        detalhe: `Prazo ${dataBR(t.data_entrega)}${isAdmin ? ` · ${nomeDoEmail(t.responsavel_email)}` : ""}`,
      });
    });
    return lista;
  }, [saldoFull, lancFull, lancPropria, nomesVisiveis, mesBarra, minhasTarefas, hoje, isAdmin]);

  const notifFiltradas = notificacoes.filter((n) => filtroNotif === "todas" || n.tipo === filtroNotif);
  const contar = (tipo: string) => notificacoes.filter((n) => n.tipo === tipo).length;

  // ---------------------------------------------------------------------------------------------
  const corNivel = (nivel: string) => (nivel === "critico" ? "border-rose-800/60 bg-rose-950/30 text-rose-200" : nivel === "atencao" ? "border-amber-800/60 bg-amber-950/20 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-200");
  const iconeTipo = (tipo: string) => (tipo === "full" ? "📦" : tipo === "devolucao" ? "↩️" : "📝");
  const corPrioridade = (p: string) => (p === "Alta" ? "bg-rose-950/60 text-rose-300 border-rose-800/50" : p === "Baixa" ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-amber-950/50 text-amber-300 border-amber-800/50");

  if (!usuario) return null;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Olá, {nomeDoEmail(usuario.email).split(" ")[0] || "bem-vindo"} 👋</h1>
            <p className="text-sm font-medium text-slate-400">
              {isAdmin ? "Visão do administrador — todos os canais, notificações e tarefas." : "Seus canais, avisos e tarefas."}
            </p>
          </div>
          <Navbar />
        </div>

        {faltaMigration && (
          <div className="mb-6 bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs rounded-xl p-4">
            ⚠️ As tabelas da tela inicial ainda não existem no banco. Execute o SQL <strong>20261104150000_tela_inicial.sql</strong> no Supabase para liberar tarefas e a divisão de canais por analista.
          </div>
        )}

        {/* FILTROS */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
            {(["atual", "anterior"] as const).map((m) => (
              <button key={m} onClick={() => setMesModo(m)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all ${mesModo === m ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}>
                {m === "atual" ? "Mês atual" : "Mês anterior"}
              </button>
            ))}
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Competência {mesBarra}</span>
          {isAdmin && (
            <>
              <select value={analistaFiltro} onChange={(e) => { setAnalistaFiltro(e.target.value); setFiltroNotif("todas"); }} className="bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none cursor-pointer">
                <option value="TODOS">Canais de: todos os analistas</option>
                {analistas.map((a) => <option key={a.email} value={a.email}>Canais de: {nomeDoEmail(a.email)}</option>)}
              </select>
              <button onClick={() => setPainelAdmin((v) => !v)} className={`ml-auto px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer border transition-all ${painelAdmin ? "bg-cyan-600 border-cyan-400 text-white" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"}`}>
                ⚙️ Configuração do administrador
              </button>
            </>
          )}
        </div>

        {/* PAINEL DO ADMINISTRADOR */}
        {isAdmin && painelAdmin && (
          <div className="mb-8 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <form onSubmit={criarTarefa} className="bg-slate-900/90 p-6 rounded-2xl border border-cyan-900/40 shadow-xl space-y-3">
              <h2 className="text-sm font-black text-cyan-300 uppercase tracking-wider">➕ Nova tarefa</h2>
              <input value={novaTarefa.titulo} onChange={(e) => setNovaTarefa({ ...novaTarefa, titulo: e.target.value })} placeholder="Título da tarefa" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-cyan-500" />
              <textarea value={novaTarefa.descricao} onChange={(e) => setNovaTarefa({ ...novaTarefa, descricao: e.target.value })} placeholder="Descrição / instruções (opcional)" rows={3} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-cyan-500" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Responsável</label>
                  <select value={novaTarefa.responsavel} onChange={(e) => setNovaTarefa({ ...novaTarefa, responsavel: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer">
                    <option value="TODOS">Todos os analistas</option>
                    {analistas.map((a) => <option key={a.email} value={a.email}>{nomeDoEmail(a.email)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Prioridade</label>
                  <select value={novaTarefa.prioridade} onChange={(e) => setNovaTarefa({ ...novaTarefa, prioridade: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer">
                    <option>Alta</option><option>Média</option><option>Baixa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Entrega (opcional)</label>
                  <input type="date" value={novaTarefa.data_entrega} onChange={(e) => setNovaTarefa({ ...novaTarefa, data_entrega: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none" />
                </div>
              </div>
              <button type="submit" disabled={salvando || faltaMigration} className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold py-2.5 px-6 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-lg">
                {salvando ? "Salvando..." : "Adicionar tarefa"}
              </button>
              <p className="text-[10px] text-slate-500">“Todos os analistas” cria uma tarefa para cada analista que tem canais atribuídos, e cada um conclui a sua.</p>
            </form>

            <div className="bg-slate-900/90 p-6 rounded-2xl border border-cyan-900/40 shadow-xl">
              <h2 className="text-sm font-black text-cyan-300 uppercase tracking-wider mb-1">🧭 Canais de cada analista</h2>
              <p className="text-[10px] text-slate-500 mb-4">Marque os canais pelos quais cada pessoa é responsável. Cada analista vê só os próprios canais na tela inicial.</p>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {analistasNaoAdmin.length === 0 && <p className="text-xs text-slate-500">Nenhum analista cadastrado em Admin.</p>}
                {analistasNaoAdmin.map((a) => {
                  const meus = canaisDoEmail(a.email);
                  return (
                    <div key={a.email}>
                      <div className="text-xs font-bold text-white mb-1.5">{nomeDoEmail(a.email)} <span className="text-slate-500 font-normal">{a.email}</span></div>
                      <div className="flex flex-wrap gap-1.5">
                        {resumo.map((c) => {
                          const ativo = meus.has(norm(c.canal));
                          return (
                            <button key={c.canal} type="button" onClick={() => alternarCanalDoAnalista(a.email, c.canal, ativo)} disabled={faltaMigration}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${ativo ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>
                              {ativo ? "✓ " : ""}{c.canal}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* RESUMO */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturamento total</div>
            <div className="text-xl font-black text-white mt-1">{carregando ? "…" : moeda(totais.fat)}</div>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Meta (objetivo)</div>
            <div className="text-xl font-black text-indigo-300 mt-1">{carregando ? "…" : moeda(totais.meta)}</div>
            <div className="text-[10px] text-slate-500 mt-1">{carregando ? "" : `${pct(totais.progresso)} atingido`}</div>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">% Líquido</div>
            <div className={`text-xl font-black mt-1 ${totais.margem < 0 ? "text-rose-400" : "text-emerald-400"}`}>{carregando ? "…" : pct(totais.margem)}</div>
            <div className="text-[10px] text-slate-500 mt-1">{carregando ? "" : `Lucro ${moeda(totais.lucro)}`}</div>
          </div>
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avisos ativos</div>
            <div className={`text-xl font-black mt-1 ${notificacoes.length ? "text-amber-300" : "text-emerald-400"}`}>{carregando ? "…" : notificacoes.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">{qtdAndamento} tarefa(s) em andamento</div>
          </div>
        </div>

        {/* CANAIS */}
        <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider mb-3">📊 {isAdmin && analistaFiltro === "TODOS" ? "Todos os canais" : isAdmin ? `Canais de ${nomeDoEmail(analistaFiltro)}` : "Meus canais"}</h2>
        {carregando ? (
          <div className="text-xs text-slate-500 mb-8">Calculando os números do Dashboard…</div>
        ) : canaisVisiveis.length === 0 ? (
          <div className="mb-8 bg-slate-900/60 border border-dashed border-slate-700 rounded-2xl p-6 text-xs text-slate-400">
            {isAdmin ? "Esse analista ainda não tem canais atribuídos. Use “Configuração do administrador” para marcar os canais dele." : "Você ainda não tem canais atribuídos. Peça ao administrador para marcar os seus canais."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {canaisVisiveis.map((c) => {
              const prog = Math.min(100, Math.max(0, c.progressoMetaPct));
              return (
                <div key={c.canal} className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-lg" data-canal={c.canal}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 overflow-hidden flex items-center justify-center text-xs font-black text-white border border-slate-700 flex-shrink-0">
                      {c.logoUrl ? <img src={c.logoUrl} alt="" className="w-full h-full object-cover" /> : c.canal.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white truncate">{c.canal}</div>
                      {isAdmin && analistaFiltro === "TODOS" && <div className="text-[10px] text-slate-500 truncate">{analistasDoCanal(c.canal).join(", ") || "sem analista"}</div>}
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-baseline"><span className="text-[10px] font-bold text-slate-400 uppercase">Faturamento</span><span className="text-sm font-black text-white">{moeda(c.faturadoComRedutor)}</span></div>
                    <div className="flex justify-between items-baseline"><span className="text-[10px] font-bold text-slate-400 uppercase">Meta</span><span className="text-sm font-bold text-indigo-300">{moeda(c.metaValor)}</span></div>
                    <div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${c.progressoMetaPct >= 100 ? "bg-emerald-500" : c.progressoMetaPct >= 60 ? "bg-indigo-500" : "bg-amber-500"}`} style={{ width: `${prog}%` }} /></div>
                      <div className="text-[10px] text-slate-500 mt-1">{pct(c.progressoMetaPct)} da meta</div>
                    </div>
                    <div className="flex justify-between items-baseline pt-1 border-t border-slate-800"><span className="text-[10px] font-bold text-slate-400 uppercase">% Líquido</span><span className={`text-sm font-black ${c.margemLiquidaPct < 0 ? "text-rose-400" : "text-emerald-400"}`}>{pct(c.margemLiquidaPct)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* NOTIFICAÇÕES */}
          <div className="xl:col-span-2 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider mb-3">🔔 Notificações</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {([["todas", "Todas", notificacoes.length], ["full", "📦 Full", contar("full")], ["devolucao", "↩️ Devoluções", contar("devolucao")], ["tarefa", "📝 Tarefas", contar("tarefa")]] as const).map(([k, nome, n]) => (
                <button key={k} onClick={() => setFiltroNotif(k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${filtroNotif === k ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{nome} ({n})</button>
              ))}
            </div>
            <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
              {carregando ? <p className="text-xs text-slate-500">Carregando…</p> : notifFiltradas.length === 0 ? (
                <p className="text-xs text-emerald-400 font-bold">✅ Nada pendente por aqui.</p>
              ) : notifFiltradas.map((n) => (
                <div key={n.id} className={`border rounded-xl p-3 ${corNivel(n.nivel)}`}>
                  <div className="text-xs font-bold">{iconeTipo(n.tipo)} {n.titulo}</div>
                  <div className="text-[11px] opacity-80 mt-0.5">{n.detalhe}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-3">Devolução: avisa a partir de {DEV_ATENCAO}% (crítico a partir de {DEV_CRITICO}%), com no mínimo {DEV_AMOSTRA_MIN} vendas, usando as análises salvas na aba Fulfillment. Full: prazos configurados por canal na aba Regras.</p>
          </div>

          {/* TAREFAS */}
          <div className="xl:col-span-3 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider">📝 Tarefas</h2>
              {isAdmin && (
                <select value={filtroResp} onChange={(e) => { setFiltroResp(e.target.value); setPagina(1); }} className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer">
                  <option value="TODOS">Todos os responsáveis</option>
                  {analistas.map((a) => <option key={a.email} value={a.email}>{nomeDoEmail(a.email)}</option>)}
                </select>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {([["andamento", "Em andamento", qtdAndamento], ["concluidas", "Concluído", qtdConcluidas], ["todos", "Todos", minhasTarefas.length]] as const).map(([k, nome, n]) => (
                <button key={k} onClick={() => { setAba(k); setPagina(1); }} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer transition-all ${aba === k ? (k === "concluidas" ? "bg-emerald-600 border-emerald-400 text-white" : "bg-indigo-600 border-indigo-400 text-white") : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{nome} ({n})</button>
              ))}
            </div>

            <div className="space-y-2">
              {tarefasPagina.length === 0 && <p className="text-xs text-slate-500 py-6 text-center">{aba === "andamento" ? "Nenhuma tarefa em andamento." : aba === "concluidas" ? "Nenhuma tarefa concluída." : "Nenhuma tarefa."}</p>}
              {tarefasPagina.map((t: any) => {
                const atrasada = !t.concluida && t.data_entrega && String(t.data_entrega).slice(0, 10) < hoje;
                return (
                  <div key={t.id} className={`flex items-start gap-3 border rounded-xl p-3 ${t.concluida ? "border-emerald-900/40 bg-emerald-950/10" : atrasada ? "border-rose-800/60 bg-rose-950/20" : "border-slate-800 bg-slate-950/60"}`}>
                    <input type="checkbox" checked={!!t.concluida} onChange={() => alternarConclusao(t)} title={t.concluida ? "Reabrir" : "Marcar como concluída"} className="mt-1 w-4 h-4 accent-emerald-500 cursor-pointer flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-bold ${t.concluida ? "text-slate-500 line-through" : "text-white"}`}>{t.titulo}</div>
                      {t.descricao && <div className="text-[11px] text-slate-400 mt-0.5 whitespace-pre-line">{t.descricao}</div>}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px]">
                        <span className={`px-2 py-0.5 rounded border font-bold ${corPrioridade(t.prioridade)}`}>{t.prioridade}</span>
                        <span className={atrasada ? "text-rose-300 font-bold" : "text-slate-400"}>Entrega: {t.data_entrega ? dataBR(t.data_entrega) : "sem prazo"}{atrasada ? " (atrasada)" : ""}</span>
                        {isAdmin && <span className="text-slate-400">· {nomeDoEmail(t.responsavel_email)}</span>}
                        {t.concluida && <span className="text-emerald-400">· concluída em {dataBR(t.concluida_em)}</span>}
                      </div>
                    </div>
                    {isAdmin && <button onClick={() => excluirTarefa(t)} title="Excluir tarefa" className="text-slate-500 hover:text-rose-400 text-sm cursor-pointer flex-shrink-0">🗑️</button>}
                  </div>
                );
              })}
            </div>

            {tarefasFiltradas.length > POR_PAGINA && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-500">{(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, tarefasFiltradas.length)} de {tarefasFiltradas.length}</span>
                <div className="flex items-center gap-1">
                  <button disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">‹ Anterior</button>
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                    <button key={n} onClick={() => setPagina(n)} className={`w-8 h-8 rounded-lg text-xs font-bold border cursor-pointer ${n === paginaAtual ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400"}`}>{n}</button>
                  ))}
                  <button disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 bg-slate-950 text-slate-300 disabled:opacity-30 cursor-pointer">Próxima ›</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
