"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "../components/Navbar";

interface MetricaConfig {
  id: string;
  nome: string;
  tipo: "numero" | "percentual";
  meta: number;
  sentido: "menor_melhor" | "maior_melhor";
}

interface Canal {
  id: string;
  nome: string;
  metricas: MetricaConfig[];
}

interface RegistroDiario {
  id?: string;
  canal_id: string;
  data: string;
  valores: Record<string, number>;
  acao_corretiva?: string;
}

export default function ReputacaoPage() {
  const [abaAtiva, setAbaAtiva] = useState<"alimentacao" | "dashboard" | "config">("alimentacao");
  const [canais, setCanais] = useState<Canal[]>([]);
  const [canalSelecionadoId, setCanalSelecionadoId] = useState<string>("");
  const [dataSelecionada, setDataSelecionada] = useState<string>(new Date().toISOString().split("T")[0]);
  
  // Estados de formulário diário
  const [valoresForm, setValoresForm] = useState<Record<string, string>>({});
  const [acaoCorretiva, setAcaoCorretiva] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(false);

  // Estados de Configuração de Metricas
  const [novoCanalNome, setNovoCanalNome] = useState("");
  const [novaMetrica, setNovaMetrica] = useState<Partial<MetricaConfig>>({
    tipo: "percentual",
    sentido: "menor_melhor",
    meta: 0
  });

  // Histórico para o Dashboard
  const [historicoCanal, setHistoricoCanal] = useState<RegistroDiario[]>([]);

  // 1. Carrega os canais
  const carregarCanais = async () => {
    const { data, error } = await supabase.from("reputacao_canais").select("*").order("nome");
    if (!error && data) {
      setCanais(data);
      if (data.length > 0 && !canalSelecionadoId) {
        setCanalSelecionadoId(data[0].id);
      }
    }
  };

  useEffect(() => {
    carregarCanais();
  }, []);

  const canalAtual = useMemo(() => {
    return canais.find(c => c.id === canalSelecionadoId);
  }, [canais, canalSelecionadoId]);

  // 2. Carrega registro do dia selecionado
  const carregarRegistroDoDia = async () => {
    if (!canalSelecionadoId || !dataSelecionada) return;
    setCarregandoDados(true);

    const { data } = await supabase
      .from("reputacao_registros")
      .select("*")
      .eq("canal_id", canalSelecionadoId)
      .eq("data", dataSelecionada)
      .maybeSingle();

    if (data) {
      const vMap: Record<string, string> = {};
      Object.entries(data.valores || {}).forEach(([k, v]) => {
        vMap[k] = String(v);
      });
      setValoresForm(vMap);
      setAcaoCorretiva(data.acao_corretiva || "");
    } else {
      setValoresForm({});
      setAcaoCorretiva("");
    }
    setCarregandoDados(false);
  };

  // 3. Carrega histórico dos últimos 30 dias para o Dashboard
  const carregarHistoricoDashboard = async () => {
    if (!canalSelecionadoId) return;
    const { data } = await supabase
      .from("reputacao_registros")
      .select("*")
      .eq("canal_id", canalSelecionadoId)
      .order("data", { ascending: false })
      .limit(30);

    setHistoricoCanal(data || []);
  };

  useEffect(() => {
    if (abaAtiva === "alimentacao") {
      carregarRegistroDoDia();
    } else if (abaAtiva === "dashboard") {
      carregarHistoricoDashboard();
    }
  }, [canalSelecionadoId, dataSelecionada, abaAtiva]);

  // Salvar input diário
  const salvarRegistroDiario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canalSelecionadoId) return;
    setSalvando(true);

    const payloadValores: Record<string, number> = {};
    Object.entries(valoresForm).forEach(([k, val]) => {
      const parsed = parseFloat(val.replace(",", "."));
      if (!isNaN(parsed)) {
        payloadValores[k] = parsed;
      }
    });

    const { error } = await supabase.from("reputacao_registros").upsert(
      {
        canal_id: canalSelecionadoId,
        data: dataSelecionada,
        valores: payloadValores,
        acao_corretiva: acaoCorretiva.trim() || null
      },
      { onConflict: "canal_id,data" }
    );

    if (error) {
      alert("Erro ao gravar dados: " + error.message);
    } else {
      alert("Métricas salvas com sucesso!");
    }
    setSalvando(false);
  };

  // Cadastrar Novo Canal
  const adicionarCanal = async () => {
    if (!novoCanalNome.trim()) return;
    const { error } = await supabase.from("reputacao_canais").insert([
      { nome: novoCanalNome.trim(), metricas: [] }
    ]);
    if (error) {
      alert("Erro: " + error.message);
    } else {
      setNovoCanalNome("");
      carregarCanais();
    }
  };

  // Adicionar campo/métrica no canal atual
  const adicionarMetrica = async () => {
    if (!canalAtual || !novaMetrica.nome?.trim()) return;

    const idMetrica = novaMetrica.nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_");

    const novaConfig: MetricaConfig = {
      id: idMetrica,
      nome: novaMetrica.nome.trim(),
      tipo: novaMetrica.tipo || "percentual",
      meta: Number(novaMetrica.meta || 0),
      sentido: novaMetrica.sentido || "menor_melhor"
    };

    const metricasAtualizadas = [...canalAtual.metricas.filter(m => m.id !== idMetrica), novaConfig];

    const { error } = await supabase
      .from("reputacao_canais")
      .update({ metricas: metricasAtualizadas })
      .eq("id", canalAtual.id);

    if (error) {
      alert("Erro: " + error.message);
    } else {
      setNovaMetrica({ tipo: "percentual", sentido: "menor_melhor", meta: 0, nome: "" });
      carregarCanais();
    }
  };

  // Excluir métrica
  const removerMetrica = async (metricaId: string) => {
    if (!canalAtual) return;
    const metricasFiltradas = canalAtual.metricas.filter(m => m.id !== metricaId);
    await supabase.from("reputacao_canais").update({ metricas: metricasFiltradas }).eq("id", canalAtual.id);
    carregarCanais();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Reputação dos Canais</h1>
            <p className="text-sm font-medium text-slate-400">Controle diário de métricas e planos de ação</p>
          </div>
          <Navbar />
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-6">
          <div className="flex gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setAbaAtiva("alimentacao")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 cursor-pointer ${
                abaAtiva === "alimentacao" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>📋</span>
              Alimentar Dados
            </button>
            <button
              onClick={() => setAbaAtiva("dashboard")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 cursor-pointer ${
                abaAtiva === "dashboard" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>📊</span>
              Dashboard Analítico
            </button>
            <button
              onClick={() => setAbaAtiva("config")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 cursor-pointer ${
                abaAtiva === "config" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
              }`}
            >
              <span>⚙️</span>
              Configurar Campos
            </button>
          </div>

          {/* SELETOR GLOBAL DE CANAL */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400 uppercase">Canal:</span>
            <select
              value={canalSelecionadoId}
              onChange={(e) => setCanalSelecionadoId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white font-bold outline-none cursor-pointer"
            >
              {canais.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ABA 1: ALIMENTAÇÃO DIÁRIA */}
        {abaAtiva === "alimentacao" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 md:p-8 shadow-xl max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-6 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  Registro de Reputação — {canalAtual?.nome || "Selecione o Canal"}
                </h2>
                <p className="text-xs text-slate-400">Preencha as medições apuradas no painel do canal</p>
              </div>

              <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-700">
                <span className="text-xs">📅</span>
                <input
                  type="date"
                  value={dataSelecionada}
                  onChange={(e) => setDataSelecionada(e.target.value)}
                  className="bg-transparent text-xs text-white outline-none cursor-pointer"
                />
              </div>
            </div>

            {carregandoDados ? (
              <p className="text-center py-10 text-slate-500 text-xs">Carregando formulário...</p>
            ) : !canalAtual || canalAtual.metricas.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <p className="text-2xl mb-2">⚠️</p>
                <p className="text-sm font-bold text-slate-300">Nenhum campo cadastrado para este canal.</p>
                <p className="text-xs text-slate-500 mb-4">Vá até a aba "Configurar Campos" para incluir as métricas (ex: Cancelamentos, Atrasos).</p>
                <button
                  onClick={() => setAbaAtiva("config")}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1.5 px-4 rounded-lg text-xs uppercase cursor-pointer"
                >
                  Configurar Agora
                </button>
              </div>
            ) : (
              <form onSubmit={salvarRegistroDiario} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {canalAtual.metricas.map((metrica) => (
                    <div key={metrica.id} className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[11px] font-bold text-slate-300 uppercase truncate">
                          {metrica.nome}
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Meta: {metrica.meta}{metrica.tipo === "percentual" ? "%" : ""}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={valoresForm[metrica.id] || ""}
                          placeholder="0.00"
                          onChange={(e) => setValoresForm({ ...valoresForm, [metrica.id]: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-bold">
                          {metrica.tipo === "percentual" ? "%" : "#"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CAMPO DE AÇÃO CORRETIVA DIÁRIA */}
                <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                      <span>Plano de Ação Corretiva do Dia (Opcional)</span>
                    </label>
                    <span className="text-[10px] text-slate-500">Preencha caso tenha ocorrido desvios</span>
                  </div>
                  <textarea
                    rows={3}
                    value={acaoCorretiva}
                    onChange={(e) => setAcaoCorretiva(e.target.value)}
                    placeholder="Descreva as medidas tomadas hoje caso algum indicador tenha ficado fora da meta (ex: Aberto chamado no suporte sobre 3 envios contestados)..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={salvando}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
                >
                  <span>💾</span>
                  {salvando ? "Gravando no Supabase..." : "Salvar Medições do Dia"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ABA 2: DASHBOARD ANALÍTICO */}
        {abaAtiva === "dashboard" && (
          <div className="space-y-6">
            {/* CARDS COM ÚLTIMO REGISTRO DO CANAL */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {canalAtual?.metricas.map((metrica) => {
                const ultimoRegistro = historicoCanal[0];
                const valorAtual = ultimoRegistro?.valores?.[metrica.id];
                const temValor = valorAtual !== undefined;

                let dentroDaMeta = true;
                if (temValor) {
                  dentroDaMeta = metrica.sentido === "menor_melhor" 
                    ? valorAtual <= metrica.meta 
                    : valorAtual >= metrica.meta;
                }

                return (
                  <div key={metrica.id} className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      {metrica.nome}
                    </span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className={`text-2xl font-black ${!temValor ? 'text-slate-600' : dentroDaMeta ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {temValor ? `${valorAtual}${metrica.tipo === "percentual" ? "%" : ""}` : "--"}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Meta: {metrica.meta}{metrica.tipo === "percentual" ? "%" : ""}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                      {temValor && dentroDaMeta ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-bold">
                          ✅ Na meta
                        </span>
                      ) : temValor && !dentroDaMeta ? (
                        <span className="text-rose-400 flex items-center gap-1 font-bold">
                          ⚠️ Fora da meta
                        </span>
                      ) : (
                        <span className="text-slate-600">Sem dados recentes</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* TABELA DE HISTÓRICO COM LOG DE AÇÕES */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <span>📅</span>
                Histórico Diário & Tratativas — {canalAtual?.nome}
              </h3>

              {historicoCanal.length === 0 ? (
                <p className="text-center py-8 text-slate-500 text-xs">Nenhum registro histórico neste canal.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-bold uppercase text-slate-400">
                        <th className="p-3 w-28">Data</th>
                        {canalAtual?.metricas.map(m => (
                          <th key={m.id} className="p-3 text-center">{m.nome}</th>
                        ))}
                        <th className="p-3 min-w-[280px]">Plano de Ação Corretiva</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {historicoCanal.map((reg) => (
                        <tr key={reg.id} className="hover:bg-slate-800/30">
                          <td className="p-3 text-slate-300 font-bold whitespace-nowrap">
                            {reg.data.split("-").reverse().join("/")}
                          </td>
                          {canalAtual?.metricas.map(m => {
                            const val = reg.valores?.[m.id];
                            const ok = val !== undefined ? (m.sentido === "menor_melhor" ? val <= m.meta : val >= m.meta) : true;
                            return (
                              <td key={m.id} className="p-3 text-center">
                                {val !== undefined ? (
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${ok ? "text-emerald-400 bg-emerald-950/40" : "text-rose-400 bg-rose-950/40"}`}>
                                    {val}{m.tipo === "percentual" ? "%" : ""}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-3 font-sans text-xs">
                            {reg.acao_corretiva ? (
                              <span className="text-amber-300/90 italic bg-amber-950/20 px-2.5 py-1 rounded border border-amber-900/30 inline-block">
                                📌 {reg.acao_corretiva}
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA 3: CONFIGURAÇÃO DE CAMPOS E CANAIS */}
        {abaAtiva === "config" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bloco Criar Canal */}
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-white mb-4">Novo Canal</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: Shein, Amazon..."
                  value={novoCanalNome}
                  onChange={(e) => setNovoCanalNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500"
                />
                <button
                  onClick={adicionarCanal}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-lg text-xs font-bold cursor-pointer"
                >
                  ➕
                </button>
              </div>
            </div>

            {/* Bloco Configurar Campos do Canal Selecionado */}
            <div className="md:col-span-2 bg-slate-900/90 p-6 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-white mb-2">
                Adicionar Campo ao Canal: <span className="text-indigo-400">{canalAtual?.nome}</span>
              </h3>
              <p className="text-xs text-slate-400 mb-4">Adicione campos como Atrasos, Mediações, etc., definindo a régua de corte.</p>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end mb-6 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome do Campo</label>
                  <input
                    type="text"
                    placeholder="Ex: Cancelamentos"
                    value={novaMetrica.nome || ""}
                    onChange={(e) => setNovaMetrica({ ...novaMetrica, nome: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Formato</label>
                  <select
                    value={novaMetrica.tipo}
                    onChange={(e) => setNovaMetrica({ ...novaMetrica, tipo: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="percentual">Percentual (%)</option>
                    <option value="numero">Numérico (#)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Meta Limite</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={novaMetrica.meta}
                    onChange={(e) => setNovaMetrica({ ...novaMetrica, meta: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Critério de Sucesso</label>
                  <select
                    value={novaMetrica.sentido}
                    onChange={(e) => setNovaMetrica({ ...novaMetrica, sentido: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="menor_melhor">Menor ou igual à meta</option>
                    <option value="maior_melhor">Maior ou igual à meta</option>
                  </select>
                </div>
                <div className="sm:col-span-4 flex justify-end mt-2">
                  <button
                    onClick={adicionarMetrica}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Salvar Campo
                  </button>
                </div>
              </div>

              {/* LISTAGEM DE CAMPOS CADASTRADOS */}
              <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Campos Ativos no Canal</h4>
              <div className="divide-y divide-slate-800">
                {canalAtual?.metricas.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white mr-3">{m.nome}</span>
                      <span className="text-slate-500 font-mono text-[11px] mr-2">
                        Tipo: {m.tipo === "percentual" ? "%" : "#"} | Meta: {m.meta} ({m.sentido === "menor_melhor" ? "Menor melhor" : "Maior melhor"})
                      </span>
                    </div>
                    <button
                      onClick={() => removerMetrica(m.id)}
                      className="text-rose-400 hover:text-rose-300 p-1 rounded cursor-pointer"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}