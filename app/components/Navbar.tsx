'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Navbar from "../components/Navbar";

interface MetricaReputacaoConfig {
  id: string;
  nome: string;
  tipo: "numero" | "percentual";
  meta: number;
  sentido: "menor_melhor" | "maior_melhor";
}

interface CanalReputacao {
  id: string;
  nome: string;
  metricas: MetricaReputacaoConfig[];
}

interface RegistroReputacao {
  id?: string;
  canal_id: string;
  data: string;
  valores: Record<string, number>;
  acao_corretiva?: string;
}

interface MetricaVendasConfig {
  id: string;
  nome: string;
  tipo: "numero" | "percentual" | "moeda";
  meta: number;
  sentido: "maior_melhor" | "menor_melhor";
}

interface RegistroVendas {
  id?: string;
  canal: string;
  data: string;
  valores: Record<string, number>;
  observacoes?: string;
}

export default function MonitoramentoPage() {
  const [moduloAtivo, setModuloAtivo] = useState<"metricas_canal" | "analise_vendas">("metricas_canal");
  const [subAba, setSubAba] = useState<"alimentacao" | "dashboard" | "config">("alimentacao");
  const [dataSelecionada, setDataSelecionada] = useState<string>(new Date().toISOString().split("T")[0]);

  // Estados - Métricas por Canal
  const [canaisReputacao, setCanaisReputacao] = useState<CanalReputacao[]>([]);
  const [canalReputacaoId, setCanalReputacaoId] = useState<string>("");
  const [valoresReputacaoForm, setValoresReputacaoForm] = useState<Record<string, string>>({});
  const [acaoCorretiva, setAcaoCorretiva] = useState<string>("");
  const [historicoReputacao, setHistoricoReputacao] = useState<RegistroReputacao[]>([]);
  const [novoCanalNome, setNovoCanalNome] = useState("");
  const [novaMetricaRep, setNovaMetricaRep] = useState<Partial<MetricaReputacaoConfig>>({
    tipo: "percentual",
    sentido: "menor_melhor",
    meta: 0
  });

  // Estados - Análise de Vendas
  const [canaisVendas, setCanaisVendas] = useState<string[]>([
    "Mercado Livre 1", "Mercado Livre 2", "Amazon", "Shopee", "Magalu", "TikTok", "Site", "Clube Hebraica", "Clube Paineiras"
  ]);
  const [canalVendasSelecionado, setCanalVendasSelecionado] = useState<string>("Mercado Livre 1");
  const [valoresVendasForm, setValoresVendasForm] = useState<Record<string, string>>({});
  const [obsVendas, setObsVendas] = useState("");
  const [metricasVendas, setMetricasVendas] = useState<MetricaVendasConfig[]>([]);
  const [historicoVendas, setHistoricoVendas] = useState<RegistroVendas[]>([]);
  const [novaMetricaVenda, setNovaMetricaVenda] = useState<Partial<MetricaVendasConfig>>({
    nome: "",
    tipo: "numero",
    meta: 0,
    sentido: "maior_melhor"
  });

  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(false);

  useEffect(() => {
    carregarCanaisReputacao();
    carregarCanaisVendas();
    carregarConfiguracoesVendas();
  }, []);

  const carregarCanaisReputacao = async () => {
    const { data } = await supabase.from("reputacao_canais").select("*").order("nome");
    if (data && data.length > 0) {
      setCanaisReputacao(data);
      if (!canalReputacaoId) setCanalReputacaoId(data[0].id);
    }
  };

  const canalReputacaoAtual = useMemo(() => {
    return canaisReputacao.find((c) => c.id === canalReputacaoId);
  }, [canaisReputacao, canalReputacaoId]);

  const carregarRegistroReputacaoDia = async () => {
    if (!canalReputacaoId || !dataSelecionada) return;
    setCarregandoDados(true);

    const { data } = await supabase
      .from("reputacao_registros")
      .select("*")
      .eq("canal_id", canalReputacaoId)
      .eq("data", dataSelecionada)
      .maybeSingle();

    if (data) {
      const vMap: Record<string, string> = {};
      Object.entries(data.valores || {}).forEach(([k, v]) => {
        vMap[k] = String(v);
      });
      setValoresReputacaoForm(vMap);
      setAcaoCorretiva(data.acao_corretiva || "");
    } else {
      setValoresReputacaoForm({});
      setAcaoCorretiva("");
    }
    setCarregandoDados(false);
  };

  const carregarHistoricoReputacao = async () => {
    if (!canalReputacaoId) return;
    const { data } = await supabase
      .from("reputacao_registros")
      .select("*")
      .eq("canal_id", canalReputacaoId)
      .order("data", { ascending: false })
      .limit(31);

    setHistoricoReputacao(data || []);
  };

  const carregarCanaisVendas = async () => {
    const { data } = await supabase.from("config_regras_canais").select("canal").order("id");
    if (data && data.length > 0) {
      const lista = Array.from(new Set([...data.map((c: any) => c.canal), "Clube Hebraica", "Clube Paineiras"]));
      setCanaisVendas(lista);
      if (!canalVendasSelecionado) setCanalVendasSelecionado(lista[0]);
    }
  };

  const carregarConfiguracoesVendas = async () => {
    const { data } = await supabase.from("analise_vendas_metricas").select("*").order("nome");
    if (data) setMetricasVendas(data);
  };

  const carregarRegistroVendasDia = async () => {
    if (!canalVendasSelecionado || !dataSelecionada) return;
    setCarregandoDados(true);

    const { data } = await supabase
      .from("analise_vendas_registros")
      .select("*")
      .eq("canal", canalVendasSelecionado)
      .eq("data", dataSelecionada)
      .maybeSingle();

    if (data) {
      const vMap: Record<string, string> = {};
      Object.entries(data.valores || {}).forEach(([k, v]) => {
        vMap[k] = String(v);
      });
      setValoresVendasForm(vMap);
      setObsVendas(data.observacoes || "");
    } else {
      setValoresVendasForm({});
      setObsVendas("");
    }
    setCarregandoDados(false);
  };

  const carregarHistoricoVendas = async () => {
    if (!canalVendasSelecionado) return;
    const { data } = await supabase
      .from("analise_vendas_registros")
      .select("*")
      .eq("canal", canalVendasSelecionado)
      .order("data", { ascending: false })
      .limit(31);

    setHistoricoVendas(data || []);
  };

  useEffect(() => {
    if (moduloAtivo === "metricas_canal") {
      if (subAba === "alimentacao") carregarRegistroReputacaoDia();
      else if (subAba === "dashboard") carregarHistoricoReputacao();
    } else {
      if (subAba === "alimentacao") carregarRegistroVendasDia();
      else if (subAba === "dashboard") carregarHistoricoVendas();
    }
  }, [moduloAtivo, subAba, canalReputacaoId, canalVendasSelecionado, dataSelecionada]);

  const salvarRegistroReputacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canalReputacaoId) return;
    setSalvando(true);

    const payloadValores: Record<string, number> = {};
    Object.entries(valoresReputacaoForm).forEach(([k, val]) => {
      const parsed = parseFloat(val.replace(",", "."));
      if (!isNaN(parsed)) payloadValores[k] = parsed;
    });

    const { error } = await supabase.from("reputacao_registros").upsert(
      {
        canal_id: canalReputacaoId,
        data: dataSelecionada,
        valores: payloadValores,
        acao_corretiva: acaoCorretiva.trim() || null
      },
      { onConflict: "canal_id,data" }
    );

    if (error) alert("Erro ao salvar: " + error.message);
    else alert("✅ Métricas de reputação salvas com sucesso!");
    setSalvando(false);
  };

  const adicionarCanalReputacao = async () => {
    if (!novoCanalNome.trim()) return;
    const { error } = await supabase.from("reputacao_canais").insert([{ nome: novoCanalNome.trim(), metricas: [] }]);
    if (error) alert("Erro: " + error.message);
    else {
      setNovoCanalNome("");
      carregarCanaisReputacao();
    }
  };

  const adicionarMetricaReputacao = async () => {
    if (!canalReputacaoAtual || !novaMetricaRep.nome?.trim()) return;

    const idMetrica = novaMetricaRep.nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_");

    const novaConfig: MetricaReputacaoConfig = {
      id: idMetrica,
      nome: novaMetricaRep.nome.trim(),
      tipo: novaMetricaRep.tipo || "percentual",
      meta: Number(novaMetricaRep.meta || 0),
      sentido: novaMetricaRep.sentido || "menor_melhor"
    };

    const metricasAtualizadas = [...canalReputacaoAtual.metricas.filter((m) => m.id !== idMetrica), novaConfig];

    const { error } = await supabase
      .from("reputacao_canais")
      .update({ metricas: metricasAtualizadas })
      .eq("id", canalReputacaoAtual.id);

    if (error) alert("Erro: " + error.message);
    else {
      setNovaMetricaRep({ tipo: "percentual", sentido: "menor_melhor", meta: 0, nome: "" });
      carregarCanaisReputacao();
    }
  };

  const removerMetricaReputacao = async (metricaId: string) => {
    if (!canalReputacaoAtual) return;
    const metricasFiltradas = canalReputacaoAtual.metricas.filter((m) => m.id !== metricaId);
    await supabase.from("reputacao_canais").update({ metricas: metricasFiltradas }).eq("id", canalReputacaoAtual.id);
    carregarCanaisReputacao();
  };

  const salvarRegistroVendas = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    const payloadValores: Record<string, number> = {};
    Object.entries(valoresVendasForm).forEach(([k, val]) => {
      const parsed = parseFloat(val.replace(",", "."));
      if (!isNaN(parsed)) payloadValores[k] = parsed;
    });

    const { error } = await supabase.from("analise_vendas_registros").upsert(
      {
        canal: canalVendasSelecionado,
        data: dataSelecionada,
        valores: payloadValores,
        observacoes: obsVendas.trim() || null
      },
      { onConflict: "canal,data" }
    );

    if (error) alert("Erro ao salvar: " + error.message);
    else alert("✅ Análise de vendas salva com sucesso!");
    setSalvando(false);
  };

  const adicionarCampoVendas = async () => {
    if (!novaMetricaVenda.nome?.trim()) return;

    const payload = {
      nome: novaMetricaVenda.nome.trim(),
      tipo: novaMetricaVenda.tipo || "numero",
      meta: Number(novaMetricaVenda.meta || 0),
      sentido: novaMetricaVenda.sentido || "maior_melhor"
    };

    const { error } = await supabase.from("analise_vendas_metricas").insert([payload]);

    if (error) alert("Erro ao adicionar: " + error.message);
    else {
      setNovaMetricaVenda({ nome: "", tipo: "numero", meta: 0, sentido: "maior_melhor" });
      carregarConfiguracoesVendas();
    }
  };

  const removerCampoVendas = async (id: string) => {
    if (!confirm("Remover esta métrica de vendas?")) return;
    await supabase.from("analise_vendas_metricas").delete().eq("id", id);
    carregarConfiguracoesVendas();
  };

  const formatarValorVendas = (valor: number, tipo: "numero" | "percentual" | "moeda") => {
    if (tipo === "percentual") return `${valor.toFixed(1)}%`;
    if (tipo === "moeda") return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return valor.toLocaleString("pt-BR");
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Monitoramento & Indicadores</h1>
            <p className="text-sm font-medium text-slate-400">Acompanhamento diário de métricas operacionais e comerciais</p>
          </div>
          <Navbar />
        </div>

        {/* NAVEGAÇÃO ENTRE MÓDULOS */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => { setModuloAtivo("metricas_canal"); setSubAba("alimentacao"); }}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              moduloAtivo === "metricas_canal"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/50"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            🛡️ Métricas por Canal
          </button>
          <button
            onClick={() => { setModuloAtivo("analise_vendas"); setSubAba("alimentacao"); }}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all ${
              moduloAtivo === "analise_vendas"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/50"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            📈 Análise de Vendas
          </button>
        </div>

        {/* SUB-MENU */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
          <div className="flex gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setSubAba("alimentacao")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                subAba === "alimentacao" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              📋 Alimentar Dados
            </button>
            <button
              onClick={() => setSubAba("dashboard")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                subAba === "dashboard" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              📊 Painel Comparativo
            </button>
            <button
              onClick={() => setSubAba("config")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                subAba === "config" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              ⚙️ Configurar Campos
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400 uppercase">Canal:</span>
            {moduloAtivo === "metricas_canal" ? (
              <select
                value={canalReputacaoId}
                onChange={(e) => setCanalReputacaoId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white font-bold outline-none cursor-pointer"
              >
                {canaisReputacao.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            ) : (
              <select
                value={canalVendasSelecionado}
                onChange={(e) => setCanalVendasSelecionado(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white font-bold outline-none cursor-pointer"
              >
                {canaisVendas.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* MÓDULO 1: MÉTRICAS POR CANAL */}
        {moduloAtivo === "metricas_canal" && (
          <>
            {subAba === "alimentacao" && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 md:p-8 shadow-xl max-w-4xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      Registro de Métricas — {canalReputacaoAtual?.nome || "Selecione o Canal"}
                    </h2>
                    <p className="text-xs text-slate-400">Preencha os indicadores de saúde do canal</p>
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
                  <p className="text-center py-10 text-slate-500 text-xs">Carregando...</p>
                ) : !canalReputacaoAtual || canalReputacaoAtual.metricas.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                    <p className="text-sm font-bold text-slate-300">Nenhum campo cadastrado para este canal.</p>
                    <button
                      onClick={() => setSubAba("config")}
                      className="mt-3 bg-indigo-600 text-white font-bold py-1.5 px-4 rounded-lg text-xs uppercase cursor-pointer"
                    >
                      Configurar Agora
                    </button>
                  </div>
                ) : (
                  <form onSubmit={salvarRegistroReputacao} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {canalReputacaoAtual.metricas.map((metrica) => (
                        <div key={metrica.id} className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-[11px] font-bold text-slate-300 uppercase truncate">{metrica.nome}</label>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Meta: {metrica.meta}{metrica.tipo === "percentual" ? "%" : ""}
                            </span>
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={valoresReputacaoForm[metrica.id] || ""}
                              placeholder="0.00"
                              onChange={(e) => setValoresReputacaoForm({ ...valoresReputacaoForm, [metrica.id]: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                            />
                            <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-bold">
                              {metrica.tipo === "percentual" ? "%" : "#"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800">
                      <label className="text-xs font-bold text-slate-300 uppercase block mb-2">Plano de Ação Corretiva do Dia (Opcional)</label>
                      <textarea
                        rows={3}
                        value={acaoCorretiva}
                        onChange={(e) => setAcaoCorretiva(e.target.value)}
                        placeholder="Descreva as medidas tomadas caso algum indicador tenha desrespeitado a meta..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={salvando}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider shadow cursor-pointer"
                    >
                      {salvando ? "Salvando..." : "💾 Salvar Medições"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {subAba === "dashboard" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {canalReputacaoAtual?.metricas.map((metrica) => {
                    const ultimo = historicoReputacao[0];
                    const valorAtual = ultimo?.valores?.[metrica.id];
                    const temValor = valorAtual !== undefined;
                    const dentroDaMeta = temValor ? (metrica.sentido === "menor_melhor" ? valorAtual <= metrica.meta : valorAtual >= metrica.meta) : true;

                    return (
                      <div key={metrica.id} className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{metrica.nome}</span>
                        <div className="flex items-baseline justify-between mt-2">
                          <span className={`text-2xl font-black ${!temValor ? "text-slate-600" : dentroDaMeta ? "text-emerald-400" : "text-rose-400"}`}>
                            {temValor ? `${valorAtual}${metrica.tipo === "percentual" ? "%" : ""}` : "--"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Meta: {metrica.meta}{metrica.tipo === "percentual" ? "%" : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Histórico — {canalReputacaoAtual?.nome}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-bold uppercase text-slate-400 font-sans">
                          <th className="p-3 w-28">Data</th>
                          {canalReputacaoAtual?.metricas.map((m) => (
                            <th key={m.id} className="p-3 text-center">{m.nome}</th>
                          ))}
                          <th className="p-3 min-w-[280px]">Plano de Ação Corretiva</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {historicoReputacao.map((reg) => (
                          <tr key={reg.id} className="hover:bg-slate-800/30">
                            <td className="p-3 text-slate-300 font-bold whitespace-nowrap">{reg.data.split("-").reverse().join("/")}</td>
                            {canalReputacaoAtual?.metricas.map((m) => {
                              const val = reg.valores?.[m.id];
                              const ok = val !== undefined ? (m.sentido === "menor_melhor" ? val <= m.meta : val >= m.meta) : true;
                              return (
                                <td key={m.id} className="p-3 text-center">
                                  {val !== undefined ? (
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${ok ? "text-emerald-400 bg-emerald-950/40" : "text-rose-400 bg-rose-950/40"}`}>
                                      {val}{m.tipo === "percentual" ? "%" : ""}
                                    </span>
                                  ) : "-"}
                                </td>
                              );
                            })}
                            <td className="p-3 font-sans text-xs">{reg.acao_corretiva || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {subAba === "config" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800">
                  <h3 className="text-sm font-bold text-white mb-4">Novo Canal</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ex: Dafiti..."
                      value={novoCanalNome}
                      onChange={(e) => setNovoCanalNome(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none"
                    />
                    <button onClick={adicionarCanalReputacao} className="bg-indigo-600 text-white p-2.5 rounded-lg text-xs font-bold cursor-pointer">➕</button>
                  </div>
                </div>

                <div className="md:col-span-2 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white">Adicionar Campo ao Canal: <span className="text-indigo-400">{canalReputacaoAtual?.nome}</span></h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 items-end">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome do Campo</label>
                      <input
                        type="text"
                        placeholder="Ex: Cancelamentos"
                        value={novaMetricaRep.nome || ""}
                        onChange={(e) => setNovaMetricaRep({ ...novaMetricaRep, nome: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo</label>
                      <select
                        value={novaMetricaRep.tipo}
                        onChange={(e) => setNovaMetricaRep({ ...novaMetricaRep, tipo: e.target.value as any })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer"
                      >
                        <option value="percentual">Percentual (%)</option>
                        <option value="numero">Numérico (#)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Meta</label>
                      <input
                        type="number"
                        step="0.01"
                        value={novaMetricaRep.meta}
                        onChange={(e) => setNovaMetricaRep({ ...novaMetricaRep, meta: parseFloat(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                      />
                    </div>
                    <div>
                      <button onClick={adicionarMetricaReputacao} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg text-xs uppercase cursor-pointer">Salvar</button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800">
                    {canalReputacaoAtual?.metricas.map((m) => (
                      <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                        <span>{m.nome} (Meta: {m.meta}{m.tipo === "percentual" ? "%" : ""})</span>
                        <button onClick={() => removerMetricaReputacao(m.id)} className="text-rose-400 cursor-pointer font-bold">🗑️</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* MÓDULO 2: ANÁLISE DE VENDAS */}
        {moduloAtivo === "analise_vendas" && (
          <>
            {subAba === "alimentacao" && (
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 md:p-8 shadow-xl max-w-4xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Análise Comercial — {canalVendasSelecionado}</h2>
                    <p className="text-xs text-slate-400">Preencha os indicadores diários de venda</p>
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
                  <p className="text-center py-10 text-slate-500 text-xs">Carregando...</p>
                ) : metricasVendas.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                    <p className="text-sm font-bold text-slate-300">Nenhuma métrica de vendas cadastrada.</p>
                    <button
                      onClick={() => setSubAba("config")}
                      className="mt-3 bg-indigo-600 text-white font-bold py-1.5 px-4 rounded-lg text-xs uppercase cursor-pointer"
                    >
                      Cadastrar Campos de Venda
                    </button>
                  </div>
                ) : (
                  <form onSubmit={salvarRegistroVendas} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {metricasVendas.map((metrica) => (
                        <div key={metrica.id} className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-[11px] font-bold text-slate-300 uppercase truncate">{metrica.nome}</label>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Meta: {formatarValorVendas(metrica.meta, metrica.tipo)}
                            </span>
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={valoresVendasForm[metrica.nome] || ""}
                              placeholder="0.00"
                              onChange={(e) => setValoresVendasForm({ ...valoresVendasForm, [metrica.nome]: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                            />
                            <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-bold">
                              {metrica.tipo === "percentual" ? "%" : metrica.tipo === "moeda" ? "R$" : "#"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800">
                      <label className="text-xs font-bold text-slate-300 uppercase block mb-2">Diagnósticos / Observações Comerciais</label>
                      <textarea
                        rows={3}
                        value={obsVendas}
                        onChange={(e) => setObsVendas(e.target.value)}
                        placeholder="Ex: Tráfego alto mas conversão baixa; ticket médio alavancado por kits de produto..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 outline-none focus:border-indigo-500 resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={salvando}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider shadow cursor-pointer"
                    >
                      {salvando ? "Salvando..." : "💾 Salvar Análise de Vendas"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {subAba === "dashboard" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {metricasVendas.map((metrica) => {
                    const ultimo = historicoVendas[0];
                    const valorAtual = ultimo?.valores?.[metrica.nome];
                    const temValor = valorAtual !== undefined;
                    const dentroDaMeta = temValor ? (metrica.sentido === "maior_melhor" ? valorAtual >= metrica.meta : valorAtual <= metrica.meta) : true;

                    return (
                      <div key={metrica.id} className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{metrica.nome}</span>
                        <div className="flex items-baseline justify-between mt-2">
                          <span className={`text-2xl font-black ${!temValor ? "text-slate-600" : dentroDaMeta ? "text-emerald-400" : "text-rose-400"}`}>
                            {temValor ? formatarValorVendas(valorAtual, metrica.tipo) : "--"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Meta: {formatarValorVendas(metrica.meta, metrica.tipo)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Histórico — {canalVendasSelecionado}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-bold uppercase text-slate-400 font-sans">
                          <th className="p-3 w-28">Data</th>
                          {metricasVendas.map((m) => (
                            <th key={m.id} className="p-3 text-center">{m.nome}</th>
                          ))}
                          <th className="p-3 min-w-[280px]">Observações Comerciais</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {historicoVendas.map((reg) => (
                          <tr key={reg.id} className="hover:bg-slate-800/30">
                            <td className="p-3 text-slate-300 font-bold whitespace-nowrap">{reg.data.split("-").reverse().join("/")}</td>
                            {metricasVendas.map((m) => {
                              const val = reg.valores?.[m.nome];
                              const ok = val !== undefined ? (m.sentido === "maior_melhor" ? val >= m.meta : val <= m.meta) : true;
                              return (
                                <td key={m.id} className="p-3 text-center">
                                  {val !== undefined ? (
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${ok ? "text-emerald-400 bg-emerald-950/40" : "text-rose-400 bg-rose-950/40"}`}>
                                      {formatarValorVendas(val, m.tipo)}
                                    </span>
                                  ) : "-"}
                                </td>
                              );
                            })}
                            <td className="p-3 font-sans text-xs">{reg.observacoes || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {subAba === "config" && (
              <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 max-w-4xl mx-auto space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Cadastrar Indicador de Vendas</h3>
                  <p className="text-xs text-slate-400">Defina os campos de desempenho comercial que deseja acompanhar</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 items-end">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nome</label>
                    <input
                      type="text"
                      placeholder="Ex: Conversão"
                      value={novaMetricaVenda.nome || ""}
                      onChange={(e) => setNovaMetricaVenda({ ...novaMetricaVenda, nome: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo</label>
                    <select
                      value={novaMetricaVenda.tipo}
                      onChange={(e) => setNovaMetricaVenda({ ...novaMetricaVenda, tipo: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none cursor-pointer"
                    >
                      <option value="numero">Numérico (#)</option>
                      <option value="percentual">Percentual (%)</option>
                      <option value="moeda">Moeda (R$)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Meta</label>
                    <input
                      type="number"
                      step="0.01"
                      value={novaMetricaVenda.meta}
                      onChange={(e) => setNovaMetricaVenda({ ...novaMetricaVenda, meta: parseFloat(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <button onClick={adicionarCampoVendas} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg text-xs uppercase cursor-pointer">Adicionar</button>
                  </div>
                </div>

                <div className="divide-y divide-slate-800">
                  {metricasVendas.map((m) => (
                    <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                      <span>{m.nome} ({m.tipo}) — Meta: {formatarValorVendas(m.meta, m.tipo)}</span>
                      <button onClick={() => removerCampoVendas(m.id)} className="text-rose-400 font-bold cursor-pointer">🗑️</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}