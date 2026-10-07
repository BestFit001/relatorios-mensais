"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

export default function AgendaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Estados de Exibição e Filtros
  const [visaoSimplificada, setVisaoSimplificada] = useState(false);
  const [filtroAssunto, setFiltroAssunto] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [assuntosDisponiveis, setAssuntosDisponiveis] = useState<string[]>([]);

  // Estado do Formulário de Inserção
  const hoje = new Date().toISOString().split('T')[0];
  const linhaVazia = { 
    atividade: "", assunto: "", responsavel: "", prioridade: "Média", 
    data_entrega: "", tratativa: "" 
  };
  const [novaTarefa, setNovaTarefa] = useState(linhaVazia);

  // Estado da Tabela
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<any>({});

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    const user = JSON.parse(usuarioLogado);
    if (user.perfil !== "admin" && !user.paginas_permitidas.includes("/agenda")) {
      alert("Acesso restrito a Administradores.");
      router.push("/");
      return;
    }
    carregarTarefas();
  }, [router]);

  const carregarTarefas = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('agenda_tarefas').select('*').order('id', { ascending: false });
    
    if (error) {
      alert("Erro ao carregar agenda: " + error.message);
    } else {
      const lista = data || [];
      setTarefas(lista);
      
      // Extrair assuntos únicos para o filtro
      const assuntos = Array.from(new Set(lista.map(t => t.assunto).filter(Boolean)));
      setAssuntosDisponiveis(assuntos as string[]);
    }
    setLoading(false);
  };

  const adicionarTarefa = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const insercao = {
      atividade: novaTarefa.atividade.trim(),
      assunto: novaTarefa.assunto.trim().toUpperCase(),
      responsavel: novaTarefa.responsavel.trim(),
      prioridade: novaTarefa.prioridade,
      data_solicitacao: hoje,
      data_entrega: novaTarefa.data_entrega || null,
      tratativa: novaTarefa.tratativa.trim()
    };

    const { error } = await supabase.from('agenda_tarefas').insert([insercao]);

    if (error) alert("Erro ao criar tarefa: " + error.message);
    else {
      setNovaTarefa(linhaVazia);
      carregarTarefas();
    }
    setSalvando(false);
  };

  const iniciarEdicao = (item: any) => {
    setEditandoId(item.id);
    setDadosEdicao(item);
  };

  const salvarEdicao = async (id: number) => {
    const { error } = await supabase.from('agenda_tarefas').update({
      atividade: dadosEdicao.atividade,
      assunto: dadosEdicao.assunto.toUpperCase(),
      responsavel: dadosEdicao.responsavel,
      prioridade: dadosEdicao.prioridade,
      data_entrega: dadosEdicao.data_entrega || null,
      tratativa: dadosEdicao.tratativa
    }).eq('id', id);

    if (error) alert("Erro ao atualizar: " + error.message);
    else {
      setEditandoId(null);
      carregarTarefas();
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

    if (novoStatusFinalizado && item.data_entrega) {
      if (hoje < item.data_entrega) statusTexto = "Entregue c/ antecedência";
      else if (hoje === item.data_entrega) statusTexto = "Entregue na data";
      else statusTexto = "Entregue c/ atraso";
    }

    const { error } = await supabase.from('agenda_tarefas').update({
      finalizado: novoStatusFinalizado,
      status_entrega: statusTexto
    }).eq('id', item.id);

    if (error) alert("Erro ao atualizar status: " + error.message);
    else carregarTarefas();
  };

  const dadosFiltrados = tarefas.filter(t => {
    const matchAssunto = filtroAssunto === "" || t.assunto === filtroAssunto;
    const matchPrioridade = filtroPrioridade === "" || t.prioridade === filtroPrioridade;
    return matchAssunto && matchPrioridade;
  });

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Agenda de Ações</h1>
            <p className="text-sm font-medium text-slate-400">Gestão de Tarefas e Prazos Administrativos</p>
          </div>
          <Navbar />
        </div>

        {/* FORMULÁRIO DE INSERÇÃO */}
        <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <h2 className="text-lg font-bold text-white mb-4">➕ Nova Solicitação</h2>
          <form onSubmit={adicionarTarefa} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Atividade (Descrição)</label>
              <input type="text" value={novaTarefa.atividade} onChange={e => setNovaTarefa({...novaTarefa, atividade: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500" required />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Assunto</label>
              <input type="text" value={novaTarefa.assunto} onChange={e => setNovaTarefa({...novaTarefa, assunto: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 uppercase" required />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Responsável</label>
              <input type="text" value={novaTarefa.responsavel} onChange={e => setNovaTarefa({...novaTarefa, responsavel: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500" required />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Prioridade</label>
              <select value={novaTarefa.prioridade} onChange={e => setNovaTarefa({...novaTarefa, prioridade: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer">
                <option value="Alta">Alta</option>
                <option value="Média">Média</option>
                <option value="Baixa">Baixa</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Entrega</label>
              <input type="date" value={novaTarefa.data_entrega} onChange={e => setNovaTarefa({...novaTarefa, data_entrega: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none cursor-pointer" required />
            </div>
            <div className="md:col-span-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tratativa Inicial (Opcional)</label>
              <input type="text" value={novaTarefa.tratativa} onChange={e => setNovaTarefa({...novaTarefa, tratativa: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500" placeholder="Ações tomadas..." />
            </div>
            <div>
              <button type="submit" disabled={salvando} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-lg">
                {salvando ? "A salvar..." : "Adicionar"}
              </button>
            </div>
          </form>
        </div>

        {/* LISTAGEM DE TAREFAS */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
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
            </div>

            <button onClick={() => setVisaoSimplificada(!visaoSimplificada)} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-2.5 px-5