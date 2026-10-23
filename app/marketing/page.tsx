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
  const [legenda, setLegenda] = useState("");
  const [arquivos, setArquivos] = useState<FileList | null>(null);
  const [postagens, setPostagens] = useState<any[]>([]);

  // Estados da Gerência de Limpeza
  const [dataInicioLimpeza, setDataInicioLimpeza] = useState("");
  const [dataFimLimpeza, setDataFimLimpeza] = useState("");
  const [limpando, setLimpando] = useState(false);

  useEffect(() => {
    const usuarioLogado = localStorage.getItem("usuario_logado");
    if (!usuarioLogado) {
      router.push("/login");
      return;
    }
    carregarPostagens();
  }, []);

  const carregarPostagens = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketing_postagens")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPostagens(data);
    }
    setLoading(false);
  };

  const handleSalvarPostagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivos || arquivos.length === 0) {
      alert("Selecione pelo menos um arquivo de imagem ou vídeo.");
      return;
    }

    setSalvando(true);
    try {
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
          tipo_midia: tipoMidia,
          url_arquivo: urlPublica,
          legenda: legenda.trim(),
        });
      }

      const { error } = await supabase.from("marketing_postagens").insert(novosRegistros);
      if (error) throw error;

      alert(`✅ ${novosRegistros.length} item(ns) adicionado(s) para ${diaSelecionado} com sucesso!`);
      setLegenda("");
      setArquivos(null);
      carregarPostagens();
    } catch (err: any) {
      alert("Erro ao salvar postagem: " + err.message);
    }
    setSalvando(false);
  };

  const excluirPostagem = async (id: number) => {
    if (!confirm("Deseja apagar este item do calendário?")) return;
    const { error } = await supabase.from("marketing_postagens").delete().eq("id", id);
    if (error) alert("Erro ao excluir: " + error.message);
    else carregarPostagens();
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
      const { error: errDelete } = await supabase
        .from("marketing_postagens")
        .delete()
        .in("id", ids);

      if (errDelete) throw errDelete;

      alert(`🗑️ Limpeza concluída! ${ids.length} registos foram removidos.`);
      setDataInicioLimpeza("");
      setDataFimLimpeza("");
      carregarPostagens();
    } catch (err: any) {
      alert("Erro ao limpar dados: " + err.message);
    }
    setLimpando(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Marketing — Hub Best Fit</h1>
            <p className="text-sm font-medium text-slate-400">Calendário de postagens da semana e gerência de armazenamento</p>
          </div>
          <Navbar />
        </div>

        {/* NAVEGAÇÃO DE SUB-ABAS */}
        <div className="flex gap-3">
          <button
            onClick={() => setSubAba("calendario")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              subAba === "calendario" ? "bg-purple-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            📅 Postagens da Semana
          </button>
          <button
            onClick={() => setSubAba("gerencia")}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              subAba === "gerencia" ? "bg-purple-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            🧹 Gerência (Limpeza de Dados)
          </button>
        </div>

        {/* SUB-ABA: CALENDÁRIO DE POSTAGENS */}
        {subAba === "calendario" && (
          <div className="space-y-8">
            <div className="bg-slate-900/90 p-6 md:p-8 rounded-2xl border border-slate-800 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4">➕ Adicionar Postagem (Suporte a Carrossel / Múltiplos)</h2>
              
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

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Ficheiro(s) (Imagens / Vídeos - Selecione múltiplos para carrossel):</label>
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

            {/* VISUALIZAÇÃO EM GRID DOS DIAS DA SEMANA */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {diasSemana.map((dia, idx) => {
                const itensDoDia = postagens.filter((p) => p.dia_semana === dia);

                return (
                  <div key={idx} className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col justify-between space-y-4">
                    <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                      <h3 className="text-sm font-black text-purple-400 uppercase">{dia}</h3>
                      <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-slate-400 font-mono">
                        {itensDoDia.length} item(ns)
                      </span>
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                      {itensDoDia.map((post, pIdx) => (
                        <div key={pIdx} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 relative group">
                          <button
                            onClick={() => excluirPostagem(post.id)}
                            className="absolute top-2 right-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Apagar item"
                          >
                            ✕
                          </button>

                          {post.tipo_midia === "video" ? (
                            <video src={post.url_arquivo} controls className="w-full h-36 object-cover rounded-lg bg-black" />
                          ) : (
                            <img src={post.url_arquivo} alt="Post" className="w-full h-36 object-cover rounded-lg bg-black" />
                          )}

                          {post.legenda && (
                            <p className="text-[11px] text-slate-300 leading-relaxed font-mono bg-slate-900 p-2 rounded-lg max-h-20 overflow-y-auto">
                              {post.legenda}
                            </p>
                          )}
                        </div>
                      ))}

                      {itensDoDia.length === 0 && (
                        <p className="text-center text-slate-600 italic text-xs py-10">Nenhuma postagem para este dia.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUB-ABA: GERÊNCIA DE LIMPEZA */}
        {subAba === "gerencia" && (
          <div className="bg-slate-900/90 p-8 rounded-2xl border border-slate-800 shadow-xl max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white uppercase tracking-wider">🧹 Gerência de Armazenamento</h2>
              <p className="text-xs text-slate-400 mt-1">Selecione o intervalo de datas para limpar as postagens e descarregar espaço do Supabase.</p>
            </div>

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

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={limparDadosPorPeriodo}
                disabled={limpando}
                className="bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold py-3 px-8 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-lg"
              >
                {limpando ? "A limpar dados..." : "🗑️ Apagar Dados do Período Selecionado"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}