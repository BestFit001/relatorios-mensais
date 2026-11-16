"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import PortaoSenhaAgenda from "./PortaoSenhaAgenda";
import { AGENDAS, agendaDaTarefa, agendasDoUsuario, liberadaAgora, limparLiberacao, nomeDaAgenda, type ChaveAgenda } from "../../lib/agendaAcesso";

const STATUS_ANDAMENTO = "Em andamento";

export default function AgendaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Acesso: o Admin Geral enxerga as 3 agendas (E-commerce, Compras, Financeiro); os demais só as que ele liberou na tela Admin.
  // Todos passam pela senha (criada no 1º acesso e pedida de novo a cada 30 dias).
  const [acesso, setAcesso] = useState<{ estado: "verificando" | "negado" | "senha" | "liberado"; email: string; gestora: boolean; geral: boolean; agendas: ChaveAgenda[]; dono: ChaveAgenda | null }>({ estado: "verificando", email: "", gestora: false, geral: false, agendas: [], dono: null });
  const [agendaSel, setAgendaSel] = useState<"todas" | ChaveAgenda | "outras">("todas");

  // Estados de Exibição e Filtros
  const [visaoSimplificada, setVisaoSimplificada] = useState(false);
  const [filtroAssunto, setFiltroAssunto] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [assuntosDisponiveis, setAssuntosDisponiveis] = useState<string[]>([]);
  
  // Abas de Status: "pendentes", "em_andamento" ou "concluidos"
  const [abaAtiva, setAbaAtiva] = useState<"pendentes" | "em_andamento" | "concluidos" | "todos">("pendentes");

  // Estado do Formulário de Inserção
  const hoje = new Date().toISOString().split('T')[0];
  const linhaVazia = { 
    atividade: "", assunto: "", responsavel: "", prioridade: "Média", 
    data_entrega: "", tratativa: "" 
  };
  const [novaTarefa, setNovaTarefa] = useState(linhaVazia);
  const [prazoIndeterminadoNovo, setPrazoIndeterminadoNovo] = useState(false);
  const [arquivoAnexo, setArquivoAnexo] = useState<File | null>(null);

  // Estado da Tabela e Edição
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<any>({});
  const [prazoIndeterminadoEdicao, setPrazoIndeterminadoEdicao] = useState(false);
  const [arquivoEdicao, setArquivoEdicao] = useState<File | null>(null);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    const user = JSON.parse(usuarioLogado);
    const email = String(user.email || "").trim().toLowerCase();
    (async () => {
      // perfil e agendas vêm do banco (o que o Admin Geral definiu agora), não do que ficou guardado no login
      const { data } = await supabase.from("usuarios_permissoes").select("perfil, agendas, paginas_permitidas").ilike("email", email).limit(1);
      const u: any = (data || [])[0];   // sem cadastro no banco = sem acesso (mesmo com login antigo guardado)
      const agendas = u ? agendasDoUsuario(u.perfil, u.agendas) : [];
      if (agendas.length === 0) { setAcesso({ estado: "negado", email, gestora: false, geral: false, agendas, dono: null }); return; }
      setAcesso({ estado: liberadaAgora(email) ? "liberado" : "senha", email, gestora: agendas.length > 1, geral: u.perfil === "admin", agendas, dono: agendas[0] });
    })();
  }, [router]);

  useEffect(() => { if (acesso.estado === "liberado") carregarTarefas(); }, [acesso.estado]);

  const carregarTarefas = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('agenda_tarefas').select('*').order('id', { ascending: false });
    
    if (error) {
      alert("Erro ao carregar agenda: " + error.message);
    } else {
      const lista = data || [];
      setTarefas(lista);
      
      const assuntos = Array.from(new Set(lista.map(t => t.assunto).filter(Boolean)));
      setAssuntosDisponiveis(assuntos as string[]);
    }
    setLoading(false);
  };

  const fazerUploadAnexo = async (ficheiro: File) => {
    const fileExt = ficheiro.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `evidencias/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('anexos')
      .upload(filePath, ficheiro);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('anexos').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  // Responsável da nova tarefa: o administrado só cria na própria agenda; a Gisele escolhe (padrão = a agenda aberta)
  // Agenda (área) da nova tarefa: quem tem uma só agenda cria nela; quem tem várias escolhe (padrão = a agenda aberta)
  const areaNova = (): string => acesso.gestora ? (novaTarefa.responsavel || (agendaSel !== "todas" && agendaSel !== "outras" ? agendaSel : "")) : (acesso.dono || "");
  const responsavelNovo = () => areaNova();

  const adicionarTarefa = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    let anexoUrl = null;

    try {
      if (arquivoAnexo) {
        anexoUrl = await fazerUploadAnexo(arquivoAnexo);
      }

      const insercao = {
        atividade: novaTarefa.atividade.trim(),
        assunto: novaTarefa.assunto.trim().toUpperCase(),
        responsavel: nomeAgenda(areaNova()),
        area: areaNova() || null,
        prioridade: novaTarefa.prioridade,
        data_solicitacao: hoje,
        data_entrega: prazoIndeterminadoNovo ? null : (novaTarefa.data_entrega || null),
        tratativa: novaTarefa.tratativa.trim(),
        anexo_url: anexoUrl,
        finalizado: false
      };

      const { error } = await supabase.from('agenda_tarefas').insert([insercao]);

      if (error) throw error;
      
      setNovaTarefa(linhaVazia);
      setPrazoIndeterminadoNovo(false);
      setArquivoAnexo(null);
      carregarTarefas();
      
    } catch (err: any) {
      alert("Erro ao criar tarefa: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const iniciarEdicao = (item: any) => {
    setEditandoId(item.id);
    setDadosEdicao(item);
    setPrazoIndeterminadoEdicao(!item.data_entrega);
    setArquivoEdicao(null);
  };

  const salvarEdicao = async (id: number) => {
    setSalvando(true);
    let anexoUrlUpdate = dadosEdicao.anexo_url;

    try {
      if (arquivoEdicao) {
        anexoUrlUpdate = await fazerUploadAnexo(arquivoEdicao);
      }

      const { error } = await supabase.from('agenda_tarefas').update({
        atividade: dadosEdicao.atividade,
        assunto: dadosEdicao.assunto.toUpperCase(),
        responsavel: dadosEdicao.area ? nomeAgenda(dadosEdicao.area) : dadosEdicao.responsavel,
        area: dadosEdicao.area || null,
        prioridade: dadosEdicao.prioridade,
        data_entrega: prazoIndeterminadoEdicao ? null : (dadosEdicao.data_entrega || null),
        tratativa: dadosEdicao.tratativa,
        anexo_url: anexoUrlUpdate
      }).eq('id', id);

      if (error) throw error;

      setEditandoId(null);
      carregarTarefas();
    } catch (err: any) {
      alert("Erro ao atualizar: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const excluirTarefa = async (id: number) => {
    if (!confirm("Excluir esta tarefa definitivamente?")) return;
    const { error } = await supabase.from('agenda_tarefas').delete().eq('id', id);
    if (error) alert("Erro: " + error.message);
    else carregarTarefas();
  };

  const alternarFinalizado = async (item: any) => {
    const novoStatusFinalizado = !item.finalizado;
    let statusTexto = "";

    if (novoStatusFinalizado) {
      if (!item.data_entrega) {
        statusTexto = "Concluído";
      } else if (hoje < item.data_entrega) {
        statusTexto = "Entregue c/ antecedência";
      } else if (hoje === item.data_entrega) {
        statusTexto = "Entregue na data";
      } else {
        statusTexto = "Entregue c/ atraso";
      }
    }

    const { error } = await supabase.from('agenda_tarefas').update({
      finalizado: novoStatusFinalizado,
      status_entrega: statusTexto
    }).eq('id', item.id);

    if (error) alert("Erro ao atualizar status: " + error.message);
    else carregarTarefas();
  };

  // Três situações, sem coluna nova: pendente (não iniciada), em andamento (status_entrega = "Em andamento", ainda não concluída) e concluída.
  const emAndamento = (t: any) => !t.finalizado && t.status_entrega === STATUS_ANDAMENTO;

  const alternarAndamento = async (item: any) => {
    const { error } = await supabase.from('agenda_tarefas').update({
      status_entrega: emAndamento(item) ? "" : STATUS_ANDAMENTO
    }).eq('id', item.id);
    if (error) alert("Erro ao atualizar status: " + error.message);
    else carregarTarefas();
  };

  // Agenda em exibição: o administrado só vê a dele; a Gisele escolhe (todas | uma | responsáveis fora das 3 agendas)
  const agendaAtiva = acesso.gestora ? agendaSel : (acesso.dono as ChaveAgenda);
  const nomeAgenda = nomeDaAgenda;
  // "Todas" = todas as agendas a que a pessoa tem acesso; "Outros responsáveis" (tarefas sem agenda) só para o Admin Geral
  const naMinhaAgenda = (t: any) => { const a = agendaDaTarefa(t); return a ? acesso.agendas.includes(a) : acesso.geral; };
  const tarefasDaAgenda = tarefas.filter(t => {
    if (agendaAtiva === "todas") return naMinhaAgenda(t);
    const a = agendaDaTarefa(t);
    return agendaAtiva === "outras" ? acesso.geral && a === null : a === agendaAtiva;
  });
  const qtdAgenda = (c: "todas" | ChaveAgenda | "outras") => tarefas.filter(t => !t.finalizado && (c === "todas" ? naMinhaAgenda(t) : c === "outras" ? agendaDaTarefa(t) === null : agendaDaTarefa(t) === c)).length;
  const temOutras = acesso.geral && tarefas.some(t => agendaDaTarefa(t) === null);

  // Filtragem: Abas de Pendentes / Em Andamento / Concluídos + Filtros de Topo
  const dadosFiltrados = tarefasDaAgenda.filter(t => {
    const matchAssunto = filtroAssunto === "" || t.assunto === filtroAssunto;
    const matchPrioridade = filtroPrioridade === "" || t.prioridade === filtroPrioridade;
    
    let matchAba = true;
    if (abaAtiva === "pendentes") {
      matchAba = !t.finalizado && !emAndamento(t);
    } else if (abaAtiva === "em_andamento") {
      matchAba = emAndamento(t);
    } else if (abaAtiva === "concluidos") {
      matchAba = !!t.finalizado;
    }

    return matchAssunto && matchPrioridade && matchAba;
  });

  const totalPendentes = tarefasDaAgenda.filter(t => !t.finalizado && !emAndamento(t)).length;
  const totalEmAndamento = tarefasDaAgenda.filter(t => emAndamento(t)).length;
  const totalConcluidos = tarefasDaAgenda.filter(t => !!t.finalizado).length;

  if (acesso.estado === "verificando") return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Carregando…</div>;
  if (acesso.estado === "negado") return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
      <div data-sem-agenda className="max-w-sm bg-slate-900/90 p-8 rounded-2xl border border-slate-800 text-center space-y-3">
        <h1 className="text-lg font-black text-white">Agenda de Ações</h1>
        <p className="text-sm text-slate-400">Seu e-mail ({acesso.email || "sem e-mail"}) não tem nenhuma agenda liberada. Peça ao Admin Geral para liberar a agenda na tela Admin (lápis ao lado do seu usuário).</p>
      </div>
    </div>
  );
  if (acesso.estado === "senha") return <PortaoSenhaAgenda email={acesso.email} onLiberado={() => setAcesso(a => ({ ...a, estado: "liberado" }))} />;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">{acesso.gestora ? "Agenda de Ações" : `Agenda · ${nomeAgenda(acesso.dono || "")}`}</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Tarefas e Prazos Administrativos</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" data-bloquear-agenda onClick={() => { limparLiberacao(acesso.email); setAcesso(a => ({ ...a, estado: "senha" })); }} className="bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-[11px] font-bold py-2 px-3 rounded-xl cursor-pointer" title="Pede a senha de novo">🔒 Bloquear</button>
            <Navbar />
          </div>
        </div>

        {acesso.gestora && (
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl mb-6" data-agendas-gestora>
            <div className="flex flex-wrap gap-2">
              {([["todas", "Todas"], ...AGENDAS.filter(a => acesso.agendas.includes(a.chave)).map(a => [a.chave, a.nome] as const), ...(temOutras ? [["outras", "Outros responsáveis"] as const] : [])] as const).map(([c, n]) => (
                <button key={c} type="button" data-agenda={c} onClick={() => setAgendaSel(c as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer ${agendaSel === c ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"}`}>
                  {n} <span className="opacity-70 font-normal">({qtdAgenda(c as any)} em aberto)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FORMULÁRIO DE INSERÇÃO */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold text-white mb-4">➕ Nova Solicitação</h2>
          <form onSubmit={adicionarTarefa} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Atividade (Descrição)</label>
              <input 
                type="text" 
                value={novaTarefa.atividade} 
                onChange={e => setNovaTarefa({...novaTarefa, atividade: e.target.value})} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500" 
                required 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Assunto</label>
              <input 
                type="text" 
                value={novaTarefa.assunto} 
                onChange={e => setNovaTarefa({...novaTarefa, assunto: e.target.value})} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 uppercase" 
                required 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Agenda</label>
              {acesso.gestora ? (
                <select data-responsavel-novo value={responsavelNovo()} onChange={e => setNovaTarefa({...novaTarefa, responsavel: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer" required>
                  <option value="" disabled>Escolha…</option>
                  {AGENDAS.filter(a => acesso.agendas.includes(a.chave)).map(a => <option key={a.chave} value={a.chave}>{a.nome}</option>)}
                </select>
              ) : (
                <input type="text" readOnly value={nomeAgenda(acesso.dono || "")} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 outline-none" />
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Prioridade</label>
              <select 
                value={novaTarefa.prioridade} 
                onChange={e => setNovaTarefa({...novaTarefa, prioridade: e.target.value})} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer"
              >
                <option value="Alta">Alta</option>
                <option value="Média">Média</option>
                <option value="Baixa">Baixa</option>
              </select>
            </div>

            {/* CAMPO DE DATA COM OPÇÃO DE PRAZO INDETERMINADO */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Data Entrega</label>
                <label className="flex items-center gap-1 text-[10px] text-amber-400 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={prazoIndeterminadoNovo} 
                    onChange={e => {
                      setPrazoIndeterminadoNovo(e.target.checked);
                      if (e.target.checked) setNovaTarefa({...novaTarefa, data_entrega: ""});
                    }} 
                    className="accent-amber-400 cursor-pointer w-3 h-3"
                  />
                  <span>Sem prazo</span>
                </label>
              </div>
              <input 
                type="date" 
                disabled={prazoIndeterminadoNovo}
                value={prazoIndeterminadoNovo ? "" : novaTarefa.data_entrega} 
                onChange={e => setNovaTarefa({...novaTarefa, data_entrega: e.target.value})} 
                className={`w-full bg-slate-950 border rounded-lg p-2.5 text-xs text-white outline-none ${
                  prazoIndeterminadoNovo ? "border-slate-800 opacity-40 cursor-not-allowed" : "border-slate-700 cursor-pointer"
                }`} 
                required={!prazoIndeterminadoNovo} 
              />
            </div>
            
            <div className="md:col-span-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tratativa Inicial (Opcional)</label>
              <input 
                type="text" 
                value={novaTarefa.tratativa} 
                onChange={e => setNovaTarefa({...novaTarefa, tratativa: e.target.value})} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500" 
                placeholder="Ações tomadas..." 
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Anexar Evidência</label>
              <input 
                type="file" 
                accept="image/*, application/pdf"
                onChange={e => setArquivoAnexo(e.target.files ? e.target.files[0] : null)} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[10px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-slate-800 file:text-white cursor-pointer outline-none" 
              />
            </div>
            <div className="md:col-span-1">
              <button 
                type="submit" 
                disabled={salvando} 
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-lg transition-all"
              >
                {salvando ? "A salvar..." : "Adicionar"}
              </button>
            </div>
          </form>
        </div>

        {/* LISTAGEM DE TAREFAS */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden mb-8">
          
          {/* ABAS E FILTROS */}
          <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            
            {/* Abas: Pendentes / Em Andamento / Concluídos */}
            <div className="flex gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <button
                data-aba="pendentes"
                onClick={() => setAbaAtiva("pendentes")}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  abaAtiva === "pendentes" 
                    ? "bg-amber-600 text-white shadow-md shadow-amber-950/50" 
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>⏳ Pendentes</span>
                <span className="text-[10px] bg-slate-900/80 px-1.5 py-0.5 rounded-full">{totalPendentes}</span>
              </button>

              <button
                data-aba="em_andamento"
                onClick={() => setAbaAtiva("em_andamento")}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  abaAtiva === "em_andamento" 
                    ? "bg-sky-600 text-white shadow-md shadow-sky-950/50" 
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🔧 Em Andamento</span>
                <span className="text-[10px] bg-slate-900/80 px-1.5 py-0.5 rounded-full">{totalEmAndamento}</span>
              </button>
              
              <button
                data-aba="concluidos"
                onClick={() => setAbaAtiva("concluidos")}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer flex items-center gap-2 ${
                  abaAtiva === "concluidos" 
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/50" 
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>✅ Concluídos</span>
                <span className="text-[10px] bg-slate-900/80 px-1.5 py-0.5 rounded-full">{totalConcluidos}</span>
              </button>

              <button
                onClick={() => setAbaAtiva("todos")}
                className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                  abaAtiva === "todos" 
                    ? "bg-slate-700 text-white" 
                    : "text-slate-500 hover:text-white"
                }`}
              >
                📁 Todos
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div>
                <select value={filtroAssunto} onChange={e => setFiltroAssunto(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
                  <option value="">Todos os Assuntos</option>
                  {assuntosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer">
                  <option value="">Todas as Prioridades</option>
                  <option value="Alta">Alta</option>
                  <option value="Média">Média</option>
                  <option value="Baixa">Baixa</option>
                </select>
              </div>

              <button 
                onClick={() => setVisaoSimplificada(!visaoSimplificada)} 
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-2.5 px-5 rounded-xl text-[11px] uppercase tracking-wider cursor-pointer transition-all"
              >
                {visaoSimplificada ? "👁️ Mostrar Todas as Colunas" : "👁️ Visão Simplificada"}
              </button>
            </div>

          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400">A carregar agenda...</p>
          ) : dadosFiltrados.length === 0 ? (
            <p className="p-8 text-center text-slate-500">
              {abaAtiva === "concluidos" 
                ? "Nenhum item marcado como concluído até o momento." 
                : abaAtiva === "em_andamento"
                  ? "Nenhuma tarefa em andamento no momento. Use \"▶ Iniciar\" na coluna Status Entrega para mover uma tarefa para cá."
                  : abaAtiva === "pendentes"
                    ? "Nenhuma tarefa pendente no momento."
                    : "Nenhuma tarefa cadastrada."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3 w-16 text-center">Nº</th>
                    <th className="p-3 min-w-[250px]">Atividade / Solicitação</th>
                    {!visaoSimplificada && <th className="p-3">Assunto</th>}
                    {!visaoSimplificada && <th className="p-3">Responsável</th>}
                    {!visaoSimplificada && <th className="p-3 text-center">Dt. Solicitação</th>}
                    {!visaoSimplificada && <th className="p-3 text-center">Prioridade</th>}
                    {!visaoSimplificada && <th className="p-3 text-center">Dt. Entrega</th>}
                    {!visaoSimplificada && <th className="p-3 text-center">Anexo</th>}
                    <th className="p-3 min-w-[200px]">Tratativa</th>
                    <th className="p-3 text-center">Concluído</th>
                    <th className="p-3">Status Entrega</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {dadosFiltrados.map((item) => {
                    const isEditing = editandoId === item.id;
                    const temPrazo = Boolean(item.data_entrega);
                    const atrasado = !item.finalizado && temPrazo && hoje > item.data_entrega;

                    return (
                      <tr key={item.id} className={`transition-colors ${item.finalizado ? 'bg-emerald-900/10 hover:bg-emerald-900/20' : 'hover:bg-slate-800/40'}`}>
                        <td className="p-3 text-center font-black text-indigo-400 text-sm">
                          {String(item.id).padStart(2, '0')}
                        </td>

                        <td className="p-3">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={dadosEdicao.atividade} 
                              onChange={e => setDadosEdicao({...dadosEdicao, atividade: e.target.value})} 
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white" 
                            />
                          ) : (
                            <span className={`font-bold ${item.finalizado ? 'line-through text-slate-500' : atrasado ? 'text-rose-400' : 'text-slate-200'} whitespace-normal line-clamp-2`}>
                              {item.atividade}
                            </span>
                          )}
                        </td>

                        {!visaoSimplificada && (
                          <td className="p-3">
                            {isEditing ? (
                              <input 
                                type="text" 
                                value={dadosEdicao.assunto} 
                                onChange={e => setDadosEdicao({...dadosEdicao, assunto: e.target.value})} 
                                className="w-24 bg-slate-900 border border-slate-700 rounded p-1.5 text-white uppercase" 
                              />
                            ) : (
                              <span className="text-slate-300 font-bold">{item.assunto}</span>
                            )}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3">
                            {isEditing ? (
                              acesso.gestora ? (
                                <select value={dadosEdicao.area || ""} onChange={e => setDadosEdicao({...dadosEdicao, area: e.target.value})} className="w-28 bg-slate-900 border border-slate-700 rounded p-1.5 text-white cursor-pointer">
                                  {!dadosEdicao.area && <option value="">{dadosEdicao.responsavel || "—"}</option>}
                                  {AGENDAS.filter(a => acesso.agendas.includes(a.chave)).map(a => <option key={a.chave} value={a.chave}>{a.nome}</option>)}
                                </select>
                              ) : <span className="text-slate-300 font-bold">{dadosEdicao.responsavel}</span>
                            ) : (
                              <span className="bg-amber-400/20 text-amber-400 px-2 py-1 rounded font-bold">{item.responsavel}</span>
                            )}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3 text-center font-mono text-slate-400">
                            {item.data_solicitacao ? item.data_solicitacao.split('-').reverse().join('/') : '-'}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3 text-center">
                            {isEditing ? (
                              <select 
                                value={dadosEdicao.prioridade} 
                                onChange={e => setDadosEdicao({...dadosEdicao, prioridade: e.target.value})} 
                                className="w-20 bg-slate-900 border border-slate-700 rounded p-1.5 text-white cursor-pointer"
                              >
                                <option value="Alta">Alta</option>
                                <option value="Média">Média</option>
                                <option value="Baixa">Baixa</option>
                              </select>
                            ) : (
                              <span className={`font-bold ${item.prioridade === 'Alta' ? 'text-rose-400' : item.prioridade === 'Média' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {item.prioridade}
                              </span>
                            )}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3 text-center font-mono">
                            {isEditing ? (
                              <div className="flex flex-col gap-1 items-center">
                                <label className="flex items-center gap-1 text-[9px] text-amber-400 cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    checked={prazoIndeterminadoEdicao} 
                                    onChange={e => {
                                      setPrazoIndeterminadoEdicao(e.target.checked);
                                      if (e.target.checked) setDadosEdicao({...dadosEdicao, data_entrega: ""});
                                    }} 
                                    className="accent-amber-400 w-3 h-3"
                                  />
                                  <span>Sem prazo</span>
                                </label>
                                {!prazoIndeterminadoEdicao && (
                                  <input 
                                    type="date" 
                                    value={dadosEdicao.data_entrega || ""} 
                                    onChange={e => setDadosEdicao({...dadosEdicao, data_entrega: e.target.value})} 
                                    className="w-28 bg-slate-900 border border-slate-700 rounded p-1 text-[10px] text-white" 
                                  />
                                )}
                              </div>
                            ) : item.data_entrega ? (
                              <span className={`font-bold ${atrasado ? 'text-rose-500' : 'text-slate-300'}`}>
                                {item.data_entrega.split('-').reverse().join('/')}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                Indeterminado
                              </span>
                            )}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3 text-center">
                            {isEditing ? (
                              <input 
                                type="file" 
                                onChange={e => setArquivoEdicao(e.target.files ? e.target.files[0] : null)} 
                                className="w-24 bg-slate-900 border border-slate-700 rounded p-1 text-[9px] text-slate-400 file:mr-1 file:py-0.5 file:px-1 file:rounded file:border-0 file:text-[9px] file:bg-slate-800 file:text-white cursor-pointer outline-none" 
                                title="Substituir anexo"
                              />
                            ) : item.anexo_url ? (
                              <a href={item.anexo_url} target="_blank" rel="noopener noreferrer" className="bg-indigo-950/60 text-indigo-400 border border-indigo-900/50 hover:bg-indigo-900/60 px-2 py-1 rounded text-[10px] font-bold transition-colors inline-block">
                                📸 Ver
                              </a>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        )}

                        <td className="p-3">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={dadosEdicao.tratativa} 
                              onChange={e => setDadosEdicao({...dadosEdicao, tratativa: e.target.value})} 
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white" 
                            />
                          ) : (
                            <span className={`italic whitespace-normal line-clamp-2 ${item.finalizado ? 'text-emerald-200/50' : 'text-slate-400'}`}>
                              {item.tratativa || "-"}
                            </span>
                          )}
                        </td>

                          <td className="p-3 text-center">
                            <input 
                              type="checkbox" 
                              checked={!!item.finalizado} 
                              onChange={() => alternarFinalizado(item)}
                              className="w-5 h-5 accent-emerald-500 cursor-pointer"
                              title={item.finalizado ? "Reabrir (volta para Pendentes)" : "Mover para Concluídos"}
                            />
                          </td>

                          <td className="p-3">
                            {item.finalizado ? (
                              <span className={`font-bold text-[10px] uppercase ${item.status_entrega?.includes('antecedência') ? 'text-indigo-400' : item.status_entrega?.includes('atraso') ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {item.status_entrega || "-"}
                              </span>
                            ) : (
                              <button type="button" data-andamento={emAndamento(item) ? "sim" : "nao"} onClick={() => alternarAndamento(item)}
                                title={emAndamento(item) ? "Voltar para Pendentes" : "Marcar como Em Andamento"}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border cursor-pointer transition-colors ${emAndamento(item) ? "bg-sky-950/60 border-sky-700 text-sky-300 hover:bg-sky-900" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white hover:border-sky-600"}`}>
                                {emAndamento(item) ? "🔧 Em andamento" : "▶ Iniciar"}
                              </button>
                            )}
                          </td>

                        <td className="p-3 text-center">
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                              <button onClick={() => salvarEdicao(item.id)} disabled={salvando} className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[10px] font-bold">{salvando ? "..." : "Salvar"}</button>
                              <button onClick={() => setEditandoId(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-bold">Cancelar</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => iniciarEdicao(item)} className="bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white px-2.5 py-1.5 rounded text-[11px] font-bold transition-colors">✏️</button>
                              <button onClick={() => excluirTarefa(item.id)} className="bg-rose-950/40 hover:bg-rose-900 text-rose-400 border border-rose-900/50 px-2.5 py-1.5 rounded text-[11px] font-bold transition-colors">🗑️</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}