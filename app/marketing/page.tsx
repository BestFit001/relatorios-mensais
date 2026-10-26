"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

const diasSemana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export default function MarketingPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"calendario" | "gerencia">("calendario");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Estados do Calendário
  const [diaSelecionado, setDiaSelecionado] = useState("Segunda");
  const [semanaSelecionadaEnvio, setSemanaSelecionadaEnvio] = useState("atual");
  const [formatoSelecionado, setFormatoSelecionado] = useState("Feed");
  const [legenda, setLegenda] = useState("");
  const [arquivos, setArquivos] = useState<FileList | null>(null);
  const [postagens, setPostagens] = useState<any[]>([]);

  // Filtro de Semana para visualização (padrão "atual")
  const [filtroSemanaVisualizacao, setFiltroSemanaVisualizacao] = useState<"anterior" | "atual" | "proxima">("atual");

  // Índices do carrossel de posts para cada dia da semana (setinhas inferiores)
  const [indicesCarrosselPost, setIndicesCarrosselPost] = useState<{ [dia: string]: number }>({
    Segunda: 0, Terça: 0, Quarta: 0, Quinta: 0, Sexta: 0, Sábado: 0, Domingo: 0
  });

  // Índices internos de mídias/carrossel para cada post agrupado (quadradinhos superiores 1, 2, 3...)
  const [indicesMidiaPost, setIndicesMidiaPost] = useState<{ [postId: string]: number }>({});

  // Estados da Gerência e Armazenamento
  const [dataInicioLimpeza, setDataInicioLimpeza] = useState("");
  const [dataFimLimpeza, setDataFimLimpeza] = useState("");
  const [limpando, setLimpando] = useState(false);
  const [tamanhoStorageMb, setTamanhoStorageMb] = useState<number>(0);
  const [totalItensBase, setTotalItensBase] = useState<number>(0);

  const limiteStorageMb = 500;

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarPostagens();
    calcularUsoArmazenamento();
  }, []);

  const carregarPostagens = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketing_postagens")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPostagens(data);
      setTotalItensBase(data.length);
    }
    setLoading(false);
  };

  const calcularUsoArmazenamento = async () => {
    try {
      const { data, error } = await supabase.storage.from("anexos").list("evidencias", {
        limit: 1000,
        offset: 0,
      });

      if (!error && data) {
        let bytesTotais = 0;
        data.forEach((file: any) => {
          bytesTotais += file.metadata?.size || 0;
        });
        const mb = bytesTotais / (1024 * 1024);
        setTamanhoStorageMb(mb);
      }
    } catch (err) {
      console.error("Erro ao calcular armazenamento:", err);
    }
  };

  const handleSalvarPostagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivos || arquivos.length === 0) {
      alert("Selecione pelo menos um ficheiro de imagem ou vídeo.");
      return;
    }

    setSalvando(true);
    try {
      const timestampEnvio = new Date().toISOString();
      const novosRegistros: any[] = [];

      for (let i = 0; i < arquivos.length; i++) {
        const file = arquivos[i];
        const fileExt = file.name.split(".").pop();
        const fileName = `mkt_${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `evidencias/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("anexos")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from("anexos").getPublicUrl(filePath);
        const urlPublica = publicUrlData.publicUrl;

        const tipoMidia = file.type.startsWith("video") ? "video" : "imagem";

        novosRegistros.push({
          dia_semana: diaSelecionado,
          semana_tipo: semanaSelecionadaEnvio,
          formato: formatoSelecionado,
          tipo_midia: tipoMidia,
          url_arquivo: urlPublica,
          legenda: legenda.trim(),
          created_at: timestampEnvio, // Força a mesma data/hora exata para agrupar as mídias no carrossel
        });
      }

      const { error } = await supabase.from("marketing_postagens").insert(novosRegistros);
      if (error) throw error;

      alert(`✅ Postagem com ${novosRegistros.length} ficheiro(s) adicionada para ${diaSelecionado} (${semanaSelecionadaEnvio}) com sucesso!`);
      setLegenda("");
      setArquivos(null);
      carregarPostagens();
      calcularUsoArmazenamento();
    } catch (err: any) {
      alert("Erro ao salvar postagem: " + err.message);
    }
    setSalvando(false);
  };

  const excluirPostagemGrupo = async (itensGrupo: any[]) => {
    if (!confirm("Deseja apagar esta postagem completa (incluindo todos os ficheiros do carrossel)?")) return;
    
    try {
      for (const item of itensGrupo) {
        if (item.url_arquivo) {
          const partesUrl = item.url_arquivo.split("/anexos/");
          if (partesUrl.length > 1) {
            const caminhoRelativo = decodeURIComponent(partesUrl[1]);
            await supabase.storage.from("anexos").remove([caminhoRelativo]);
          }
        }
      }

      const ids = itensGrupo.map(i => i.id);
      const { error } = await supabase.from("marketing_postagens").delete().in("id", ids);
      if (error) throw error;

      carregarPostagens();
      calcularUsoArmazenamento();
    } catch (err: any) {
      alert("Erro ao excluir: " + err.message);
    }
  };

  const baixarFicheiro = async (url: string, formato: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const extensao = url.split(".").pop()?.split("?")[0] || "jpg";
      link.download = `post_${formato}_${Date.now()}.${extensao}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, "_blank");
    }
  };

  const proximoPost = (dia: string, total: number) => {
    setIndicesCarrosselPost(prev => ({
      ...prev,
      [dia]: (prev[dia] + 1) % total
    }));
  };

  const anteriorPost = (dia: string, total: number) => {
    setIndicesCarrosselPost(prev => ({
      ...prev,
      [dia]: (prev[dia] - 1 + total) % total
    }));
  };

  const mudarMidiaPost = (keyId: string, index: number) => {
    setIndicesMidiaPost(prev => ({
      ...prev,
      [keyId]: index
    }));
  };

  const limparDadosPorPeriodo = async () => {
    if (!dataInicioLimpeza || !dataFimLimpeza) {
      alert("Selecione a data inicial e a data final para a limpeza.");
      return;
    }

    if (!confirm(`Tem certeza que deseja apagar os registos entre ${dataInicioLimpeza} e ${dataFimLimpeza}?`)) return;

    setLimpando(true);
    try {
      const { data: itensParaApagar, error: errBusca } = await supabase
        .from("marketing_postagens")
        .select("*")
        .gte("created_at", `${dataInicioLimpeza}T00:00:00`)
        .lte("created_at", `${dataFimLimpeza}T23:59:59`);

      if (errBusca) throw errBusca;

      if (!itensParaApagar || itensParaApagar.length === 0) {
        alert("Nenhum registo encontrado neste período.");
        setLimpando(false);
        return;
      }

      const ids = itensParaApagar.map((i: any) => i.id);
      
      for (const item of itensParaApagar) {
        if (item.url_arquivo) {
          const partesUrl = item.url_arquivo.split("/anexos/");
          if (partesUrl.length > 1) {
            const caminhoRelativo = decodeURIComponent(partesUrl[1]);
            await supabase.storage.from("anexos").remove([caminhoRelativo]);
          }
        }
      }

      const { error: errDelete } = await supabase
        .from("marketing_postagens")
        .delete()
        .in("id", ids);

      if (errDelete) throw errDelete;

      alert(`🗑️ Limpeza concluída! ${ids.length} registos foram removidos.`);
      setDataInicioLimpeza("");
      setDataFimLimpeza("");
      carregarPostagens();
      calcularUsoArmazenamento();
    } catch (err: any) {
      alert("Erro ao limpar dados: " + err.message);
    }
    setLimpando(false);
  };

  const limparTudoDaBase = async () => {
    if (!confirm("⚠️ ATENÇÃO: Deseja apagar ABSOLUTAMENTE TODAS as postagens e ficheiros cadastrados na base de marketing?")) return;

    setLimpando(true);
    try {
      const { data: listaFicheiros } = await supabase.storage.from("anexos").list("evidencias", { limit: 1000 });
      if (listaFicheiros && listaFicheiros.length > 0) {
        const caminhos = listaFicheiros.map(f => `evidencias/${f.name}`);
        await supabase.storage.from("anexos").remove(caminhos);
      }

      const { error } = await supabase
        .from("marketing_postagens")
        .delete()
        .not("id", "is", null);

      if (error) throw error;

      alert("🗑️ Toda a base de marketing e ficheiros foram limpos com sucesso!");
      carregarPostagens();
      calcularUsoArmazenamento();
    } catch (err: any) {
      alert("Erro ao limpar base: " + err.message);
    }
    setLimpando(false);
  };

  const percentualUso = Math.min((tamanhoStorageMb / limiteStorageMb) * 100, 100);
  const mbDisponiveis = Math.max(limiteStorageMb - tamanhoStorageMb, 0);

  const obterSemanaRealPorData = (createdAtStr: string) => {
    if (!createdAtStr) return "atual";
    const dataPost = new Date(createdAtStr);
    if (isNaN(dataPost.getTime())) return "atual";

    const hoje = new Date();
    const diaSemanaHoje = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1;
    const inicioSemanaAtual = new Date(hoje);
    inicioSemanaAtual.setDate(hoje.getDate() - diaSemanaHoje);
    inicioSemanaAtual.setHours(0, 0, 0, 0);

    const fimSemanaAtual = new Date(inicioSemanaAtual);
    fimSemanaAtual.setDate(inicioSemanaAtual.getDate() + 6);
    fimSemanaAtual.setHours(23, 59, 59, 999);

    const inicioSemanaAnterior = new Date(inicioSemanaAtual);
    inicioSemanaAnterior.setDate(inicioSemanaAtual.getDate() - 7);
    const fimSemanaAnterior = new Date(fimSemanaAtual);
    fimSemanaAnterior.setDate(fimSemanaAtual.getDate() - 7);

    const inicioProximaSemana = new Date(inicioSemanaAtual);
    inicioProximaSemana.setDate(inicioSemanaAtual.getDate() + 7);
    const fimProximaSemana = new Date(fimSemanaAtual);
    fimProximaSemana.setDate(fimSemanaAtual.getDate() + 7);

    if (dataPost >= inicioSemanaAnterior && dataPost <= fimSemanaAnterior) {
      return "anterior";
    } else if (dataPost >= inicioProximaSemana && dataPost <= fimProximaSemana) {
      return "proxima";
    } else if (dataPost >= inicioSemanaAtual && dataPost <= fimSemanaAtual) {
      return "atual";
    }

    return dataPost < inicioSemanaAtual ? "anterior" : "proxima";
  };

  const postagensFiltradasPorSemana = postagens.filter(p => {
    const semanaReal = obterSemanaRealPorData(p.created_at);
    return semanaReal === filtroSemanaVisualizacao;
  });

  // Agrupa os posts por carimbo de data/hora exato de criação (created_at) para formar o carrossel sem precisar de alteração no SQL
  const agruparPostsDoDia = (dia: string) => {
    const itensDoDia = postagensFiltradasPorSemana.filter((p) => p.dia_semana === dia);
    const gruposMap: { [key: string]: any[] } = {};

    itensDoDia.forEach(item => {
      const chave = item.created_at || `single_${item.id}`;
      if (!gruposMap[chave]) {
        gruposMap[chave] = [];
      }
      gruposMap[chave].push(item);
    });

    return Object.values(gruposMap);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Marketing — Hub Best Fit</h1>
            <p className="text-sm font-medium text-slate-400">Calendário de postagens com suporte a carrossel de imagens e múltiplos formatos</p>
          </div>
          <Navbar />
        </div>

        <div className="flex justify-between items-center flex-wrap gap-4 bg-slate-900 p-3 rounded-2xl border border-slate-800">
          <div className="flex gap-3">
            <button
              onClick={() => setSubAba("calendario")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
                subAba === "calendario" ? "bg-purple-600 text-white" : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              📅 Postagens da Semana
            </button>
            <button
              onClick={() => setSubAba("gerencia")}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
                subAba === "gerencia" ? "bg-purple-600 text-white" : "bg-slate-950 text-slate-400 border border-slate-800"
              }`}
            >
              🧹 Gerência
            </button>
          </div>

          {subAba === "calendario" && (
            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase px-2">Visualizar:</span>
              <button
                onClick={() => setFiltroSemanaVisualizacao("anterior")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filtroSemanaVisualizacao === "anterior" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Semana Anterior
              </button>
              <button
                onClick={() => setFiltroSemanaVisualizacao("atual")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filtroSemanaVisualizacao === "atual" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Semana Atual
              </button>
              <button
                onClick={() => setFiltroSemanaVisualizacao("proxima")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filtroSemanaVisualizacao === "proxima" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Próxima Semana
              </button>
            </div>
          )}
        </div>

        {subAba === "calendario" && (
          <div className="space-y-8">
            <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4">➕ Adicionar Postagem (Carrossel, Formato & Semana)</h2>
              
              <form onSubmit={handleSalvarPostagem} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dia da Semana:</label>
                  <select
                    value={diaSelecionado}
                    onChange={(e) => setDiaSelecionado(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer"
                  >
                    {diasSemana.map((d, i) => (
                      <option key={i} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Período / Semana:</label>
                  <select
                    value={semanaSelecionadaEnvio}
                    onChange={(e) => setSemanaSelecionadaEnvio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer"
                  >
                    <option value="anterior">Semana Anterior</option>
                    <option value="atual">Semana Atual</option>
                    <option value="proxima">Próxima Semana</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Formato:</label>
                  <select
                    value={formatoSelecionado}
                    onChange={(e) => setFormatoSelecionado(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-bold text-white outline-none cursor-pointer"
                  >
                    <option value="Feed">🖼️ Feed</option>
                    <option value="Reels">🎬 Reels</option>
                    <option value="Story">📱 Story</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ficheiro(s) (Múltiplos para carrossel do post):</label>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => setArquivos(e.target.files)}
                    className="w-full bg-slate-950 border border-slate-700 file:border-0 file:bg-purple-600 file:text-white file:text-xs file:font-bold file:py-2 file:px-4 file:rounded-lg file:mr-3 file:cursor-pointer rounded-xl p-1.5 text-xs text-slate-300 cursor-pointer"
                    required
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Legenda da Publicação:</label>
                  <textarea
                    rows={2}
                    value={legenda}
                    onChange={(e) => setLegenda(e.target.value)}
                    placeholder="Digite a legenda da postagem..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none resize-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={salvando}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg transition-all"
                  >
                    {salvando ? "A enviar..." : "Salvar Postagem"}
                  </button>
                </div>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {diasSemana.map((dia, idx) => {
                const postsDoDia = agruparPostsDoDia(dia);
                const currentPostIndex = indicesCarrosselPost[dia] || 0;
                const postAtual = postsDoDia[currentPostIndex];

                const postIdKey = postAtual && postAtual.length > 0 ? (postAtual[0].created_at || `single_${postAtual[0].id}`) : "";
                const currentMidiaIndex = indicesMidiaPost[postIdKey] || 0;
                const midiaAtual = postAtual && postAtual.length > 0 ? postAtual[currentMidiaIndex] || postAtual[0] : null;

                return (
                  <div key={idx} className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col justify-between space-y-4">
                    <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                      <h3 className="text-sm font-black text-purple-400 uppercase">{dia}</h3>
                      <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-slate-400 font-mono">
                        {postsDoDia.length > 0 ? `Post ${currentPostIndex + 1} de ${postsDoDia.length}` : "0 post"}
                      </span>
                    </div>

                    <div className="relative flex items-center justify-center min-h-[200px]">
                      {postsDoDia.length > 0 && midiaAtual ? (
                        <div className="w-full bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 relative group">
                          {/* ETIQUETA DE FORMATO */}
                          <div className="absolute top-2 left-2 z-10">
                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase shadow-md ${
                              midiaAtual.formato === 'Story' ? 'bg-amber-600 text-white' :
                              midiaAtual.formato === 'Reels' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'
                            }`}>
                              {midiaAtual.formato === 'Story' ? '📱 Story' : midiaAtual.formato === 'Reels' ? '🎬 Reels' : '🖼️ Feed'}
                            </span>
                          </div>

                          {/* QUADRADINHOS NO CANTO SUPERIOR PARA CARROSSEL DE MÍDIAS (1, 2, 3...) */}
                          {postAtual.length > 1 && (
                            <div className="absolute top-2 right-16 z-10 flex gap-1">
                              {postAtual.map((_, mIdx) => (
                                <button
                                  key={mIdx}
                                  onClick={() => mudarMidiaPost(postIdKey, mIdx)}
                                  className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center cursor-pointer transition-all ${
                                    currentMidiaIndex === mIdx
                                      ? "bg-purple-600 text-white shadow-md scale-105"
                                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                  }`}
                                  title={`Ver mídia ${mIdx + 1}`}
                                >
                                  {mIdx + 1}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* BOTÃO DE DOWNLOAD RÁPIDO */}
                          <div className="absolute top-2 right-9 z-10">
                            <button
                              onClick={() => baixarFicheiro(midiaAtual.url_arquivo, midiaAtual.formato)}
                              className="bg-emerald-800 hover:bg-emerald-700 text-white w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shadow-md cursor-pointer transition-all"
                              title="Descarregar ficheiro atual"
                            >
                              ⬇️
                            </button>
                          </div>

                          {/* BOTÃO DE EXCLUIR POST COMPLETO */}
                          <button
                            onClick={() => excluirPostagemGrupo(postAtual)}
                            className="absolute top-2 right-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                            title="Apagar post completo"
                          >
                            ✕
                          </button>

                          {midiaAtual.tipo_midia === "video" ? (
                            <video src={midiaAtual.url_arquivo} controls className="w-full h-44 object-cover rounded-lg bg-black pt-5" />
                          ) : (
                            <img src={midiaAtual.url_arquivo} alt="Post" className="w-full h-44 object-cover rounded-lg bg-black pt-5" />
                          )}

                          {midiaAtual.legenda && (
                            <p className="text-[11px] text-slate-300 leading-relaxed font-mono bg-slate-900 p-2 rounded-lg max-h-20 overflow-y-auto">
                              {midiaAtual.legenda}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-center text-slate-600 italic text-xs py-10">Nenhuma postagem para este dia nesta semana.</p>
                      )}
                    </div>

                    {/* SETINHAS INFERIORES PARA ALTERNAR ENTRE POSTS DIFERENTES DO DIA */}
                    {postsDoDia.length > 1 && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-800/80">
                        <button
                          onClick={() => anteriorPost(dia, postsDoDia.length)}
                          className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          ◀ Anterior
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono">Post {currentPostIndex + 1}/{postsDoDia.length}</span>
                        <button
                          onClick={() => proximoPost(dia, postsDoDia.length)}
                          className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Próxima ▶
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subAba === "gerencia" && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>📊 Uso de Armazenamento</span>
                <span className="text-sm font-mono text-purple-400">{percentualUso.toFixed(1)}% utilizado</span>
              </h2>
              
              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs border-b border-slate-800 pb-3">
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-bold">Usado</span>
                    <span className="font-mono font-bold text-indigo-400">{tamanhoStorageMb.toFixed(2)} MB</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-bold">Disponível</span>
                    <span className="font-mono font-bold text-emerald-400">{mbDisponiveis.toFixed(2)} MB</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-bold">Total Limite</span>
                    <span className="font-mono font-bold text-slate-300">{limiteStorageMb} MB</span>
                  </div>
                </div>

                <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${percentualUso > 85 ? 'bg-rose-500' : percentualUso > 60 ? 'bg-amber-500' : 'bg-purple-600'}`} 
                    style={{ width: `${percentualUso}%` }}
                  ></div>
                </div>
                
                <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                  <span>{totalItensBase} ficheiro(s) guardado(s) na base</span>
                  <span className="font-mono">{percentualUso.toFixed(2)}% de {limiteStorageMb} MB</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">🧹 Gerência de Armazenamento</h2>
                <p className="text-xs text-slate-400 mt-1">Apague registos por período ou limpe toda a base de postagens de uma só vez.</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-6 rounded-xl border border-slate-800">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Inicial:</label>
                    <input
                      type="date"
                      value={dataInicioLimpeza}
                      onChange={(e) => setDataInicioLimpeza(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Final:</label>
                    <input
                      type="date"
                      value={dataFimLimpeza}
                      onChange={(e) => setDataFimLimpeza(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={limparDadosPorPeriodo}
                    disabled={limpando}
                    className="bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                  >
                    {limpando ? "A limpar..." : "🗑️ Apagar Período Selecionado"}
                  </button>

                  <button
                    type="button"
                    onClick={limparTudoDaBase}
                    disabled={limpando}
                    className="bg-rose-700 hover:bg-rose-600 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
                  >
                    {limpando ? "A limpar..." : "🚨 Apagar TUDO da Base"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}