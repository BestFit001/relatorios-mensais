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
              <button 
                type="submit" 
                disabled={salvando} 
                className={`w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-lg`}
              >
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

            <button 
              onClick={() => setVisaoSimplificada(!visaoSimplificada)} 
              className={`bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-2.5 px-5 rounded-xl text-[11px] uppercase tracking-wider cursor-pointer transition-all`}
            >
              {visaoSimplificada ? "👁️ Mostrar Todas as Colunas" : "👁️ Visão Simplificada"}
            </button>
          </div>

          {loading ? (
            <p className="p-8 text-center text-slate-400">A carregar agenda...</p>
          ) : dadosFiltrados.length === 0 ? (
            <p className="p-8 text-center text-slate-500">Nenhuma solicitação encontrada.</p>
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
                    <th className="p-3 min-w-[200px]">Tratativa</th>
                    {!visaoSimplificada && <th className="p-3 text-center">Concluído</th>}
                    {!visaoSimplificada && <th className="p-3">Status Entrega</th>}
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {dadosFiltrados.map((item) => {
                    const isEditing = editandoId === item.id;
                    const atrasado = !item.finalizado && item.data_entrega && hoje > item.data_entrega;

                    return (
                      <tr key={item.id} className={`hover:bg-slate-800/40 transition-colors ${item.finalizado ? 'opacity-50' : ''}`}>
                        <td className="p-3 text-center font-black text-indigo-400 text-sm">
                          {String(item.id).padStart(2, '0')}
                        </td>

                        <td className="p-3">
                          {isEditing ? (
                            <input type="text" value={dadosEdicao.atividade} onChange={e => setDadosEdicao({...dadosEdicao, atividade: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white" />
                          ) : (
                            <span className={`font-bold ${atrasado ? 'text-rose-400' : 'text-slate-200'} whitespace-normal line-clamp-2`}>{item.atividade}</span>
                          )}
                        </td>

                        {!visaoSimplificada && (
                          <td className="p-3">
                            {isEditing ? (
                              <input type="text" value={dadosEdicao.assunto} onChange={e => setDadosEdicao({...dadosEdicao, assunto: e.target.value})} className="w-24 bg-slate-900 border border-slate-700 rounded p-1.5 text-white uppercase" />
                            ) : (
                              <span className="text-slate-300 font-bold">{item.assunto}</span>
                            )}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3">
                            {isEditing ? (
                              <input type="text" value={dadosEdicao.responsavel} onChange={e => setDadosEdicao({...dadosEdicao, responsavel: e.target.value})} className="w-24 bg-slate-900 border border-slate-700 rounded p-1.5 text-white" />
                            ) : (
                              <span className="bg-amber-400/20 text-amber-400 px-2 py-1 rounded font-bold">{item.responsavel}</span>
                            )}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3 text-center font-mono text-slate-400">
                            {item.data_solicitacao.split('-').reverse().join('/')}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3 text-center">
                            {isEditing ? (
                              <select value={dadosEdicao.prioridade} onChange={e => setDadosEdicao({...dadosEdicao, prioridade: e.target.value})} className="w-20 bg-slate-900 border border-slate-700 rounded p-1.5 text-white cursor-pointer">
                                <option value="Alta">Alta</option><option value="Média">Média</option><option value="Baixa">Baixa</option>
                              </select>
                            ) : (
                              <span className={`font-bold ${item.prioridade === 'Alta' ? 'text-rose-400' : item.prioridade === 'Média' ? 'text-amber-400' : 'text-emerald-400'}`}>{item.prioridade}</span>
                            )}
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3 text-center font-mono">
                            {isEditing ? (
                              <input type="date" value={dadosEdicao.data_entrega} onChange={e => setDadosEdicao({...dadosEdicao, data_entrega: e.target.value})} className="w-28 bg-slate-900 border border-slate-700 rounded p-1.5 text-white" />
                            ) : (
                              <span className={`font-bold ${atrasado ? 'text-rose-500' : 'text-slate-300'}`}>
                                {item.data_entrega ? item.data_entrega.split('-').reverse().join('/') : '-'}
                              </span>
                            )}
                          </td>
                        )}

                        <td className="p-3">
                          {isEditing ? (
                            <input type="text" value={dadosEdicao.tratativa} onChange={e => setDadosEdicao({...dadosEdicao, tratativa: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white" />
                          ) : (
                            <span className="text-slate-400 italic whitespace-normal line-clamp-2">{item.tratativa || "-"}</span>
                          )}
                        </td>

                        {!visaoSimplificada && (
                          <td className="p-3 text-center">
                            <input 
                              type="checkbox" 
                              checked={item.finalizado} 
                              onChange={() => alternarFinalizado(item)}
                              className="w-5 h-5 accent-emerald-500 cursor-pointer"
                            />
                          </td>
                        )}

                        {!visaoSimplificada && (
                          <td className="p-3">
                            <span className={`font-bold text-[10px] uppercase ${item.status_entrega?.includes('antecedência') ? 'text-indigo-400' : item.status_entrega?.includes('atraso') ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {item.status_entrega}
                            </span>
                          </td>
                        )}

                        <td className="p-3 text-center">
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                              <button onClick={() => salvarEdicao(item.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[10px] font-bold">Salvar</button>
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