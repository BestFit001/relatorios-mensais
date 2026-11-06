"use client";
// Relatórios > Vídeos: controle de clipes/vídeos por SKU Pai e canal.
// Antes era a sub-aba "Vídeos / Clipes" de Produtos & Vídeos (hoje "Novos Cadastros"); a lógica é a mesma.
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";

const CHAVE_CONFIG_CLIPES = "bestfit_canais_clipes_config";   // mesma chave de antes: a escolha de canais já feita continua valendo
// "Pasta" = o vídeo já foi salvo na pasta de vídeos. Fica junto dos clipes (mesma coluna clipes_enviados), com uma chave que não é de canal.
const PASTA = "__pasta";
const paiDe = (item: any) => item.sku_pai || (String(item.sku || "").length > 5 ? String(item.sku).substring(0, 5) : item.sku);

export default function VideosPage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"videos" | "periodo" | "config">("videos");
  const [loading, setLoading] = useState(false);

  const [cadastrosRealizados, setCadastrosRealizados] = useState<any[]>([]);
  const [produtosVideosManual, setProdutosVideosManual] = useState<any[]>([]);
  const [canaisLista, setCanaisLista] = useState<string[]>([]);
  const [canaisComClipesConfig, setCanaisComClipesConfig] = useState<{ [canal: string]: boolean }>({});

  const [pesquisa, setPesquisa] = useState("");
  const [filtroStatusVideo, setFiltroStatusVideo] = useState<"pendentes" | "finalizados" | "todos">("pendentes");
  const [paginaAtualVideos, setPaginaAtualVideos] = useState(1);
  const [itensPorPaginaVideos, setItensPorPaginaVideos] = useState(10);

  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [modalVideoAberto, setModalVideoAberto] = useState(false);
  const [skuBuscaManual, setSkuBuscaManual] = useState("");
  const [produtoEncontradoManual, setProdutoEncontradoManual] = useState<any>(null);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    carregarDadosIniciais();
  }, []);

  const carregarDadosIniciais = async () => {
    setLoading(true);
    const { data: regrasCanais } = await supabase.from("config_regras_canais").select("canal").order("id");
    let listaCanais = ["Site", "Mercado Livre 1", "Mercado Livre 2", "Mercado Livre 3", "Shopee", "Magazine Luiza", "Netshoes", "Centauro", "Amazon", "Shein", "TikTok"];
    if (regrasCanais && regrasCanais.length > 0) listaCanais = regrasCanais.map((r: any) => r.canal);
    setCanaisLista(listaCanais);

    const configSalva = localStorage.getItem(CHAVE_CONFIG_CLIPES);
    if (configSalva) {
      try { setCanaisComClipesConfig(JSON.parse(configSalva)); } catch { inicializarConfigPadrao(listaCanais); }
    } else inicializarConfigPadrao(listaCanais);

    await carregarRealizadosDoBanco();
    await carregarVideosManuaisDoBanco();
    setLoading(false);
  };

  const inicializarConfigPadrao = (listaCanais: string[]) => {
    const configIniciada: { [c: string]: boolean } = {};
    listaCanais.forEach((c) => { configIniciada[c] = ["Shopee", "TikTok", "Mercado Livre 1", "Shein"].includes(c); });
    setCanaisComClipesConfig(configIniciada);
    localStorage.setItem(CHAVE_CONFIG_CLIPES, JSON.stringify(configIniciada));
  };

  const atualizarConfigCanal = (canal: string, checked: boolean) => {
    const novaConfig = { ...canaisComClipesConfig, [canal]: checked };
    setCanaisComClipesConfig(novaConfig);
    localStorage.setItem(CHAVE_CONFIG_CLIPES, JSON.stringify(novaConfig));
  };

  const carregarRealizadosDoBanco = async () => {
    const { data } = await supabase.from("produtos_novos_cadastrados").select("*").order("id", { ascending: false });
    if (data) setCadastrosRealizados(data);
  };

  const carregarVideosManuaisDoBanco = async () => {
    const { data } = await supabase.from("produtos_videos_manuais").select("*").order("id", { ascending: false });
    if (data) setProdutosVideosManual(data);
  };

  const buscarProdutoBaseCusto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuBuscaManual.trim()) return;
    setLoading(true);
    const skuNorm = skuBuscaManual.trim();

    const { data: custoMatch } = await supabase.from("tabela_custos_skus").select("*").ilike("sku", skuNorm).maybeSingle();
    if (custoMatch) {
      setProdutoEncontradoManual({
        sku: custoMatch.sku,
        sku_pai: custoMatch.sku.length > 5 ? custoMatch.sku.substring(0, 5) : custoMatch.sku,
        produto: custoMatch.produto || "Produto sem nome",
        marca: custoMatch.marca || "BEST FIT",
        custo: custoMatch.custo_unitario || 0,
        clipes_enviados: {},
      });
    } else {
      const { data: tinyMatch } = await supabase.from("cadastros_base_tiny").select("*").ilike("sku", skuNorm).maybeSingle();
      if (tinyMatch) {
        setProdutoEncontradoManual({
          sku: tinyMatch.sku,
          sku_pai: tinyMatch.sku.length > 5 ? tinyMatch.sku.substring(0, 5) : tinyMatch.sku,
          produto: tinyMatch.produto || "Produto sem nome",
          marca: "BEST FIT",
          custo: 0,
          clipes_enviados: {},
        });
      } else {
        alert("SKU não encontrado na base de custos ou Tiny. Verifique o código.");
        setProdutoEncontradoManual(null);
      }
    }
    setLoading(false);
  };

  const salvarProdutoVideoManual = async () => {
    if (!produtoEncontradoManual) return;
    const paiNovo = produtoEncontradoManual.sku_pai || (produtoEncontradoManual.sku.length > 5 ? produtoEncontradoManual.sku.substring(0, 5) : produtoEncontradoManual.sku);

    // Verifica duplicidade por SKU Pai
    const jaExisteRealizado = cadastrosRealizados.some((item) => paiDe(item) === paiNovo);
    const jaExisteManual = produtosVideosManual.some((item) => paiDe(item) === paiNovo);
    if (jaExisteRealizado || jaExisteManual) {
      if (!confirm("Produto duplicado, será inserido novamente?")) return;
    }

    setLoading(true);
    const { error } = await supabase.from("produtos_videos_manuais").upsert([produtoEncontradoManual], { onConflict: "sku" });
    if (error) {
      alert("Erro ao salvar: " + error.message);
    } else {
      alert(`✅ Produto ${produtoEncontradoManual.sku} adicionado à aba de Vídeos!`);
      setModalVideoAberto(false);
      setSkuBuscaManual("");
      setProdutoEncontradoManual(null);
      await carregarVideosManuaisDoBanco();
    }
    setLoading(false);
  };

  const excluirVideoManual = async (sku: string) => {
    if (!confirm(`Remover o SKU ${sku} da aba de Vídeos?`)) return;
    await supabase.from("produtos_videos_manuais").delete().eq("sku", sku);
    await carregarVideosManuaisDoBanco();
  };

  const toggleClipeVideoManual = async (sku: string, canal: string, checked: boolean) => {
    try {
      const atualizados = [...produtosVideosManual];
      const alvo = atualizados.find((i) => i.sku === sku);
      if (!alvo) return;
      const clipes = alvo.clipes_enviados || {};
      clipes[canal] = checked;
      alvo.clipes_enviados = clipes;
      await supabase.from("produtos_videos_manuais").update({ clipes_enviados: clipes }).eq("sku", sku);
      setProdutosVideosManual(atualizados);
    } catch (err) { console.error(err); }
  };

  // ---- lista unificada (cadastrados agrupados por SKU Pai + incluídos manualmente) ----
  const termo = pesquisa.trim().toLowerCase();
  const bate = (item: any) =>
    !termo || [item.sku, item.produto, item.sku_pai].some((v) => String(v || "").toLowerCase().includes(termo));

  const gruposRealizados: { [pai: string]: any[] } = {};
  cadastrosRealizados.filter(bate).forEach((item) => {
    const pai = paiDe(item);
    if (!gruposRealizados[pai]) gruposRealizados[pai] = [];
    gruposRealizados[pai].push(item);
  });
  const chavesGrupos = Object.keys(gruposRealizados);
  const videosManuaisFiltrados = produtosVideosManual.filter(bate);

  const canaisAtivosClipes = canaisLista.filter((c) => canaisComClipesConfig[c]);

  const itensUnificadosVideos = [
    ...chavesGrupos.map((paiKey) => {
      const itens = gruposRealizados[paiKey];
      const titulo = String(itens[0].produto || "").split("-")[0].trim();
      const finalizado = canaisAtivosClipes.length > 0 && canaisAtivosClipes.every((canal) => itens.every((it) => Boolean((it.clipes_enviados || {})[canal])));
      return { tipo: "realizado", chave: paiKey, sku: paiKey, produto: titulo, itensGrupo: itens, finalizado } as any;
    }),
    ...videosManuaisFiltrados.map((item) => {
      const titulo = String(item.produto || "").split("-")[0].trim();
      const finalizado = canaisAtivosClipes.length > 0 && canaisAtivosClipes.every((canal) => Boolean((item.clipes_enviados || {})[canal]));
      return { tipo: "manual", chave: item.sku, sku: paiDe(item), produto: titulo, itemManual: item, finalizado } as any;
    }),
  ].filter((item) => {
    if (filtroStatusVideo === "pendentes") return !item.finalizado;
    if (filtroStatusVideo === "finalizados") return item.finalizado;
    return true;
  });

  const totalPaginasVideos = Math.ceil(itensUnificadosVideos.length / itensPorPaginaVideos) || 1;
  const paginaSegura = Math.min(paginaAtualVideos, totalPaginasVideos);
  const itensAtuaisVideos = itensUnificadosVideos.slice((paginaSegura - 1) * itensPorPaginaVideos, paginaSegura * itensPorPaginaVideos);

  // ---- período ----
  // Unidade = a mesma da aba Vídeos/Clipes: um SKU Pai (cadastrados) ou um produto incluído manualmente.
  //  - Cadastros no período: unidades cadastradas/incluídas dentro das datas (manuais entram pela data de inclusão)
  //  - Produtos com vídeo: unidades com TODOS os canais ativos (Configurações) marcados
  //  - Total de vídeos postados: quantidade de caixas marcadas (unidade x canal ativo)
  const noPeriodo = (data: any) => {
    if (!dataInicio && !dataFim) return true;
    const d = new Date(data || Date.now());
    if (dataInicio && d < new Date(dataInicio)) return false;
    if (dataFim && d > new Date(dataFim + "T23:59:59")) return false;
    return true;
  };
  const unidadesPeriodoMap: { [pai: string]: any[] } = {};
  cadastrosRealizados.filter((it) => noPeriodo(it.data_cadastro)).forEach((it) => {
    const pai = paiDe(it);
    (unidadesPeriodoMap[pai] = unidadesPeriodoMap[pai] || []).push(it);
  });
  const unidadesPeriodo: { tipo: "realizado" | "manual"; itens: any[] }[] = [
    ...Object.values(unidadesPeriodoMap).map((itens) => ({ tipo: "realizado" as const, itens })),
    ...produtosVideosManual.filter((it) => noPeriodo(it.created_at)).map((it) => ({ tipo: "manual" as const, itens: [it] })),
  ];
  const marcado = (itens: any[], canal: string) => itens.every((it) => Boolean((it.clipes_enviados || {})[canal]));
  const totalCadastros = unidadesPeriodo.length;
  const produtosComVideo = canaisAtivosClipes.length === 0 ? 0 : unidadesPeriodo.filter((u) => canaisAtivosClipes.every((c) => marcado(u.itens, c))).length;
  // Vídeo feito = a unidade tem QUALQUER caixa marcada (algum canal ativo ou a Pasta)
  const caixasDeVideo = [...canaisAtivosClipes, PASTA];
  const videosFeitos = unidadesPeriodo.filter((u) => u.itens.some((it) => caixasDeVideo.some((c) => Boolean((it.clipes_enviados || {})[c])))).length;
  const totalVideosPostados = unidadesPeriodo.reduce((soma, u) => soma + canaisAtivosClipes.filter((c) => marcado(u.itens, c)).length, 0);

  const abaCls = (ativa: boolean) => `px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${ativa ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"}`;

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      <div className="max-w-[98%] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Vídeos</h1>
            <p className="text-sm font-medium text-slate-400">Controle de clipes/vídeos padronizados por SKU Pai e por canal</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900 p-3 rounded-2xl border border-slate-800">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 flex-wrap gap-1" data-subabas-videos>
            <button data-subaba="videos" onClick={() => setSubAba("videos")} className={abaCls(subAba === "videos")}>📹 Vídeos / Clipes ({itensUnificadosVideos.length})</button>
            <button data-subaba="periodo" onClick={() => setSubAba("periodo")} className={abaCls(subAba === "periodo")}>Período & Gráficos</button>
            <button data-subaba="config" onClick={() => setSubAba("config")} className={abaCls(subAba === "config")}>⚙️ Configurações</button>
          </div>
          {subAba === "videos" && (
            <input
              type="text" value={pesquisa} data-pesquisa-videos
              onChange={(e) => { setPesquisa(e.target.value); setPaginaAtualVideos(1); }}
              placeholder="🔍 Pesquisar SKU, Pai, Nome..."
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white outline-none w-80"
            />
          )}
        </div>

        {/* ===================== VÍDEOS / CLIPES ===================== */}
        {subAba === "videos" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-800 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase">Status:</span>
                <select value={filtroStatusVideo} onChange={(e) => { setFiltroStatusVideo(e.target.value as any); setPaginaAtualVideos(1); }} data-filtro-status-video
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer font-bold">
                  <option value="pendentes">Vídeos pendentes</option>
                  <option value="finalizados">Vídeos finalizados</option>
                  <option value="todos">Todos os vídeos</option>
                </select>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Mostrar por página:</span>
                  <select value={itensPorPaginaVideos} onChange={(e) => { setItensPorPaginaVideos(Number(e.target.value)); setPaginaAtualVideos(1); }}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-white outline-none cursor-pointer font-bold">
                    <option value={10}>10</option><option value={20}>20</option><option value={30}>30</option>
                  </select>
                </div>
                <button onClick={() => setModalVideoAberto(true)} data-incluir-video
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-lg">
                  + Incluir Produto p/ Vídeos
                </button>
              </div>
            </div>

            {canaisAtivosClipes.length === 0 && (
              <p className="text-xs text-amber-300 font-bold" data-sem-canais>
                Nenhum canal com clipe marcado. <button type="button" onClick={() => setSubAba("config")} className="underline cursor-pointer">Escolha em Configurações</button>.
              </p>
            )}

            <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap" data-tabela-videos>
                  <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] z-10">
                    <tr>
                      <th className="p-3">SKU Pai / Título do Produto</th>
                      <th className="p-3 text-center">Pasta</th>
                      {canaisAtivosClipes.map((canal, cIdx) => <th key={cIdx} className="p-3 text-center">{canal}</th>)}
                      <th className="p-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {itensAtuaisVideos.map((item: any, idx: number) => {
                      if (item.tipo === "realizado") {
                        return (
                          <tr key={`realizado-${idx}`} data-linha-video={item.sku} className="hover:bg-slate-800/40">
                            <td className="p-3 font-mono">
                              <span className="text-purple-400 font-bold">Pai: {item.sku}</span> — <span className="text-white font-semibold">{item.produto}</span>
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="checkbox" checked={item.itensGrupo.every((it: any) => Boolean((it.clipes_enviados || {})[PASTA]))} data-pasta
                                onChange={async (e) => {
                                  const checked = e.target.checked;
                                  for (const alvo of item.itensGrupo) {
                                    const clipes = alvo.clipes_enviados || {};
                                    clipes[PASTA] = checked;
                                    await supabase.from("produtos_novos_cadastrados").update({ clipes_enviados: clipes }).eq("sku", alvo.sku);
                                  }
                                  carregarRealizadosDoBanco();
                                }}
                                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                              />
                            </td>
                            {canaisAtivosClipes.map((canal, cIdx) => {
                              const todosMarcadosGrupo = item.itensGrupo.every((it: any) => Boolean((it.clipes_enviados || {})[canal]));
                              return (
                                <td key={cIdx} className="p-3 text-center">
                                  <input
                                    type="checkbox" checked={todosMarcadosGrupo} data-clipe={canal}
                                    onChange={async (e) => {
                                      const checked = e.target.checked;
                                      for (const alvo of item.itensGrupo) {
                                        const clipes = alvo.clipes_enviados || {};
                                        clipes[canal] = checked;
                                        await supabase.from("produtos_novos_cadastrados").update({ clipes_enviados: clipes }).eq("sku", alvo.sku);
                                      }
                                      carregarRealizadosDoBanco();
                                    }}
                                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                                  />
                                </td>
                              );
                            })}
                            <td className="p-3 text-center text-slate-500 text-[10px]">Cadastrado</td>
                          </tr>
                        );
                      }
                      const itemManual = item.itemManual;
                      return (
                        <tr key={`manual-${idx}`} data-linha-video={item.sku} className="hover:bg-slate-800/40 bg-amber-950/10">
                          <td className="p-3 font-mono">
                            <span className="text-amber-400 font-bold">Pai: {item.sku}</span> — <span className="text-white font-semibold">{item.produto}</span> <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded ml-2">Manual</span>
                          </td>
                          <td className="p-3 text-center">
                            <input type="checkbox" checked={Boolean((itemManual.clipes_enviados || {})[PASTA])} data-pasta
                              onChange={(e) => toggleClipeVideoManual(itemManual.sku, PASTA, e.target.checked)}
                              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer" />
                          </td>
                          {canaisAtivosClipes.map((canal, cIdx) => (
                            <td key={cIdx} className="p-3 text-center">
                              <input type="checkbox" checked={Boolean((itemManual.clipes_enviados || {})[canal])} data-clipe={canal}
                                onChange={(e) => toggleClipeVideoManual(itemManual.sku, canal, e.target.checked)}
                                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer" />
                            </td>
                          ))}
                          <td className="p-3 text-center">
                            <button onClick={() => excluirVideoManual(itemManual.sku)} className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer">Excluir</button>
                          </td>
                        </tr>
                      );
                    })}
                    {itensAtuaisVideos.length === 0 && (
                      <tr><td colSpan={canaisAtivosClipes.length + 3} className="p-8 text-center text-slate-500">Nenhum vídeo encontrado para o filtro selecionado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-5 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
                <span>Página {paginaSegura} de {totalPaginasVideos} (Total: {itensUnificadosVideos.length} itens)</span>
                <div className="flex gap-2">
                  <button onClick={() => setPaginaAtualVideos(Math.max(paginaSegura - 1, 1))} disabled={paginaSegura === 1} className="px-4 py-2 bg-slate-900 rounded-xl font-bold text-slate-300 disabled:opacity-40 cursor-pointer">Anterior</button>
                  <button onClick={() => setPaginaAtualVideos(Math.min(paginaSegura + 1, totalPaginasVideos))} disabled={paginaSegura === totalPaginasVideos} className="px-4 py-2 bg-slate-900 rounded-xl font-bold text-slate-300 disabled:opacity-40 cursor-pointer">Próxima</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== PERÍODO & GRÁFICOS ===================== */}
        {subAba === "periodo" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Comparador de Períodos — Vídeos</h3>
                <p className="text-xs text-slate-400 mt-1">Filtre por período (data do cadastro) para comparar os vídeos produzidos.</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div><span className="text-slate-400 mr-2">De:</span>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none" /></div>
                <div><span className="text-slate-400 mr-2">Até:</span>
                  <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white outline-none" /></div>
                {(dataInicio || dataFim) && (
                  <button onClick={() => { setDataInicio(""); setDataFim(""); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-xl font-bold cursor-pointer">Limpar</button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Cadastros no Período</span>
                <p className="text-3xl font-black text-emerald-400 mt-2" data-total-cadastros>{totalCadastros}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Cadastrados + incluídos manualmente</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Vídeo feito</span>
                <p className="text-3xl font-black text-amber-400 mt-2" data-videos-feitos>{videosFeitos}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Qualquer produto com alguma caixa marcada (canal ou Pasta)</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Produtos com Vídeo</span>
                <p className="text-3xl font-black text-purple-400 mt-2" data-produtos-com-video>{produtosComVideo}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Com todos os canais ativos marcados</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow">
                <span className="text-xs font-bold text-slate-400 uppercase">Total Vídeos Postados</span>
                <p className="text-3xl font-black text-indigo-400 mt-2" data-total-videos>{totalVideosPostados}</p>
                <span className="text-[10px] text-slate-500 mt-1 block">Itens marcados nos canais ativos</span>
              </div>
            </div>
          </div>
        )}

        {/* ===================== CONFIGURAÇÕES ===================== */}
        {subAba === "config" && (
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Configuração de Canais com Clipes</h3>
              <p className="text-xs text-slate-400 mt-1">Marque abaixo quais canais devem exibir a opção de controle de clipes (vídeos). Suas escolhas são salvas automaticamente.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {canaisLista.map((canal, cIdx) => (
                <label key={cIdx} className="flex items-center gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 cursor-pointer hover:border-purple-600 transition-all">
                  <input type="checkbox" checked={Boolean(canaisComClipesConfig[canal])} data-config-canal={canal}
                    onChange={(e) => atualizarConfigCanal(canal, e.target.checked)} className="w-4 h-4 accent-purple-600 rounded cursor-pointer" />
                  <span className="text-xs font-bold text-white">{canal}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* MODAL INCLUIR PRODUTO MANUALMENTE */}
        {modalVideoAberto && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">Incluir Produto p/ Vídeos (Base de Custos)</h3>
                <button onClick={() => { setModalVideoAberto(false); setProdutoEncontradoManual(null); setSkuBuscaManual(""); }} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
              </div>
              <form onSubmit={buscarProdutoBaseCusto} className="flex gap-2">
                <input type="text" value={skuBuscaManual} onChange={(e) => setSkuBuscaManual(e.target.value)} placeholder="Digite o SKU exato..." required
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white outline-none font-mono" />
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl text-xs font-bold cursor-pointer">Pesquisar</button>
              </form>
              {produtoEncontradoManual && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <p className="text-xs text-slate-300"><strong>SKU:</strong> <span className="font-mono text-purple-400">{produtoEncontradoManual.sku}</span></p>
                  <p className="text-xs text-slate-300"><strong>Produto:</strong> {produtoEncontradoManual.produto}</p>
                  <p className="text-xs text-slate-300"><strong>Marca:</strong> {produtoEncontradoManual.marca}</p>
                  <div className="flex justify-end pt-2">
                    <button type="button" onClick={salvarProdutoVideoManual} disabled={loading}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs uppercase cursor-pointer shadow-lg">
                      {loading ? "Salvando..." : "✅ Confirmar e Adicionar à Aba Vídeos"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
