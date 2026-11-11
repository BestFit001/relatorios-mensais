"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import { CANAIS, nomeDoCanal } from "../../lib/concorrentes/canais";
import { rankingPalavrasChave } from "../../lib/concorrentes/palavrasChave";
import Paginacao from "./Paginacao";

interface Categoria { id: string; nome: string; canal: string; url_origem: string; ativo: boolean; criado_em: string; ultima_raspagem: string | null }
interface Anuncio {
  id: string; categoria_id: string; mlb_id: string; titulo: string; vendedor: string | null; url_anuncio: string; url_imagem: string | null;
  ativo: boolean; manual: boolean; ultimo_preco: number | null; ultimo_total_vendas: number | null; ultimas_vendas_dia: number | null; ultima_captura: string | null;
}
type Ordem = "vendas_dia" | "total" | "preco" | "titulo";

const COLUNAS = "id,categoria_id,mlb_id,titulo,vendedor,url_anuncio,url_imagem,ativo,manual,ultimo_preco,ultimo_total_vendas,ultimas_vendas_dia,ultima_captura";
const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const num = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR"));
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Chama as rotas /api/concorrentes/*; devolve o JSON ou lança Error com a mensagem do servidor. */
async function chamar<T = any>(rota: string, metodo: "POST" | "PATCH", corpo: unknown): Promise<T> {
  const r = await fetch(`/api/concorrentes/${rota}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return j as T;
}

const caixa = "rounded-2xl border border-slate-800 bg-slate-900/60";
const campo = "bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600";
const botao = "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

export default function ConcorrentesPainel() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoAnuncios, setCarregandoAnuncios] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [canal, setCanal] = useState("mercadolivre");
  const [urlCategoria, setUrlCategoria] = useState("");
  const [nomeCategoria, setNomeCategoria] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [urlAvulso, setUrlAvulso] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<{ ok: boolean; estrategia: string; detalhe: string; ms: number }[] | null>(null);

  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("vendas_dia");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(25);

  const avisar = (tipo: "ok" | "erro", texto: string) => { setAviso({ tipo, texto }); if (tipo === "ok") setTimeout(() => setAviso(null), 6000); };

  const carregarCategorias = useCallback(async (escolher?: string) => {
    const { data, error } = await supabase.from("categorias").select("*").order("criado_em", { ascending: true });
    if (error) { setErro(`Não consegui ler as categorias: ${error.message}`); setCarregando(false); return; }
    const lista = (data || []) as Categoria[];
    setCategorias(lista);
    setCategoriaId((atual) => escolher || (atual && lista.some((c) => c.id === atual) ? atual : lista[0]?.id ?? null));
    setCarregando(false);
  }, []);

  const carregarAnuncios = useCallback(async (id: string) => {
    setCarregandoAnuncios(true);
    try { setAnuncios((await buscarTudo("anuncios", COLUNAS, (q) => q.eq("categoria_id", id))) as Anuncio[]); setErro(null); }
    catch (e: any) { setErro(`Não consegui ler os anúncios: ${e.message}`); }
    finally { setCarregandoAnuncios(false); }
  }, []);

  useEffect(() => { carregarCategorias(); }, [carregarCategorias]);
  useEffect(() => { setAnuncios([]); setPagina(1); setBusca(""); if (categoriaId) carregarAnuncios(categoriaId); }, [categoriaId, carregarAnuncios]);
  useEffect(() => { setPagina(1); }, [busca, ordem, mostrarInativos, tamanho]);

  const categoria = categorias.find((c) => c.id === categoriaId) || null;
  const ativos = useMemo(() => anuncios.filter((a) => a.ativo), [anuncios]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = anuncios.filter((a) => (mostrarInativos || a.ativo) && (!t || a.titulo.toLowerCase().includes(t) || (a.vendedor || "").toLowerCase().includes(t) || a.mlb_id.toLowerCase().includes(t)));
    const chave = (a: Anuncio) => ordem === "vendas_dia" ? a.ultimas_vendas_dia : ordem === "total" ? a.ultimo_total_vendas : a.ultimo_preco;
    return [...lista].sort((a, b) => {
      if (ordem === "titulo") return a.titulo.localeCompare(b.titulo, "pt-BR");
      return (chave(b) ?? -1) - (chave(a) ?? -1);
    });
  }, [anuncios, busca, ordem, mostrarInativos]);

  const pag = useMemo(() => {
    const ini = (Math.min(pagina, Math.max(1, Math.ceil(visiveis.length / tamanho))) - 1) * tamanho;
    return visiveis.slice(ini, ini + tamanho);
  }, [visiveis, pagina, tamanho]);

  // palavras-chave: títulos dos anúncios ativos da categoria (a lista inteira, não só a página da tabela)
  const palavras = useMemo(() => rankingPalavrasChave(ativos.map((a) => a.titulo), { topo: 20 }), [ativos]);
  const maxPalavra = palavras[0]?.anuncios || 1;

  const resumo = useMemo(() => {
    const comPreco = ativos.filter((a) => a.ultimo_preco != null);
    const datas = ativos.map((a) => a.ultima_captura).filter(Boolean) as string[];
    return {
      anuncios: ativos.length,
      vendasDia: ativos.reduce((s, a) => s + (a.ultimas_vendas_dia || 0), 0),
      total: ativos.reduce((s, a) => s + (a.ultimo_total_vendas || 0), 0),
      precoMedio: comPreco.length ? comPreco.reduce((s, a) => s + (a.ultimo_preco || 0), 0) / comPreco.length : null,
      ultima: datas.sort().pop() ?? null,
      semBase: ativos.filter((a) => a.ultimas_vendas_dia == null).length,
    };
  }, [ativos]);

  const cadastrar = async () => {
    setCadastrando(true); setAviso(null);
    try {
      const r = await chamar("categorias", "POST", { url: urlCategoria, canal, nome: nomeCategoria || undefined });
      setUrlCategoria(""); setNomeCategoria("");
      await carregarCategorias(r.categoria.id);
      if (r.categoria.id === categoriaId) await carregarAnuncios(r.categoria.id);
      avisar("ok", `“${r.categoria.nome}”: ${r.encontrados} anúncio(s) lidos, ${r.novos} novo(s) (fonte: ${r.fonte}).${r.avisos?.length ? " " + r.avisos.join(" ") : ""}`);
    } catch (e: any) { avisar("erro", e.message); }
    finally { setCadastrando(false); }
  };

  const adicionarAvulso = async () => {
    if (!categoriaId) return;
    setAdicionando(true); setAviso(null);
    try {
      const r = await chamar("anuncios", "POST", { categoria_id: categoriaId, url: urlAvulso });
      setUrlAvulso(""); await carregarAnuncios(categoriaId);
      avisar("ok", r.reativado ? "Anúncio reativado." : `Anúncio adicionado: ${r.titulo}`);
    } catch (e: any) { avisar("erro", e.message); }
    finally { setAdicionando(false); }
  };

  const mudarAtivo = async (a: Anuncio, ativo: boolean) => {
    setAnuncios((l) => l.map((x) => (x.id === a.id ? { ...x, ativo } : x))); // otimista
    try { await chamar("anuncios", "PATCH", { id: a.id, ativo }); }
    catch (e: any) { setAnuncios((l) => l.map((x) => (x.id === a.id ? { ...x, ativo: a.ativo } : x))); avisar("erro", e.message); }
  };

  const pausarCategoria = async () => {
    if (!categoria) return;
    try { await chamar("categorias", "PATCH", { id: categoria.id, ativo: !categoria.ativo }); await carregarCategorias(); }
    catch (e: any) { avisar("erro", e.message); }
  };

  const atualizarAgora = async () => {
    if (!categoriaId) return;
    setAtualizando("Capturando preços e vendas…"); setAviso(null);
    try {
      let ok = 0, falhas = 0, ultimoErro = "";
      for (let rodada = 0; rodada < 12; rodada++) { // a rota trabalha em lotes dentro do limite de tempo; repete até acabar
        const r = await chamar("capturar", "POST", { categoria_id: categoriaId });
        ok += r.ok; falhas += r.falhas; if (r.erros?.[0]) ultimoErro = r.erros[0].motivo;
        if (r.pendentes === 0) break;
        setAtualizando(`Capturando… ${ok + falhas} anúncio(s) processados`);
      }
      await carregarAnuncios(categoriaId);
      avisar(falhas && !ok ? "erro" : "ok", `${ok} anúncio(s) atualizados${falhas ? `, ${falhas} com falha` : ""}.${ultimoErro ? ` Motivo: ${ultimoErro}` : ""}`);
    } catch (e: any) { avisar("erro", e.message); }
    finally { setAtualizando(null); }
  };

  const testarConexao = async () => {
    setAtualizando("Testando a conexão com o Mercado Livre…"); setDiagnostico(null);
    try { setDiagnostico((await chamar("diagnostico", "POST", {})).itens); }
    catch (e: any) { avisar("erro", e.message); }
    finally { setAtualizando(null); }
  };

  const canalDisponivel = CANAIS.find((c) => c.id === canal);

  return (
    <div className="space-y-5" data-painel-concorrentes>
      {erro && <div data-erro className="p-4 rounded-xl border border-amber-800/60 bg-amber-950/30 text-amber-200 text-xs font-semibold">⚠️ {erro}</div>}
      {aviso && (
        <div data-aviso={aviso.tipo} className={`p-3 rounded-xl border text-xs font-semibold flex items-start justify-between gap-3 ${aviso.tipo === "ok" ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200" : "border-rose-800/60 bg-rose-950/30 text-rose-200"}`}>
          <span>{aviso.tipo === "ok" ? "✅" : "⚠️"} {aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 cursor-pointer" aria-label="Fechar">✕</button>
        </div>
      )}

      {/* Cadastro de categoria */}
      <details open={!carregando && categorias.length === 0} className={`${caixa} group`} data-cadastro-categoria>
        <summary className="cursor-pointer select-none px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>➕ Cadastrar categoria para monitorar</span>
          <span className="text-[10px] font-semibold normal-case text-slate-500 tracking-normal">lê as 2 primeiras páginas (cerca de 100 anúncios)</span>
        </summary>
        <div className="px-5 pb-5 grid gap-3 md:grid-cols-[180px_1fr_220px_auto] items-end">
          <label className="grid gap-1 text-[11px] font-bold text-slate-400">Canal
            <select data-campo="canal" value={canal} onChange={(e) => setCanal(e.target.value)} className={campo}>
              {CANAIS.map((c) => <option key={c.id} value={c.id} disabled={!c.disponivel}>{c.nome}{c.disponivel ? "" : " (em breve)"}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-slate-400">Link da categoria ou busca
            <input data-campo="url" value={urlCategoria} onChange={(e) => setUrlCategoria(e.target.value)} placeholder={canalDisponivel?.exemploUrl} className={campo} />
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-slate-400">Nome (opcional)
            <input data-campo="nome" value={nomeCategoria} onChange={(e) => setNomeCategoria(e.target.value)} placeholder="Ex.: Organizadores" className={campo} />
          </label>
          <button data-acao="cadastrar" onClick={cadastrar} disabled={cadastrando || !urlCategoria.trim() || !canalDisponivel?.disponivel} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>
            {cadastrando ? "Lendo anúncios…" : "Cadastrar e raspar"}
          </button>
        </div>
        {cadastrando && <p className="px-5 pb-4 -mt-2 text-xs text-slate-400">Isso pode levar até um minuto: a página é lida e cada anúncio é aberto para pegar vendedor e vendas.</p>}
      </details>

      {carregando ? <p className="text-xs text-slate-500">Carregando…</p> : categorias.length === 0 ? (
        <div className={`${caixa} p-10 text-center text-sm text-slate-400`}>Nenhuma categoria cadastrada ainda. Cole acima o link de uma categoria ou busca do Mercado Livre.</div>
      ) : (
        <>
          {/* Filtro por categoria (abas) */}
          <div className="flex flex-wrap items-center gap-2" role="tablist" data-categorias>
            {categorias.map((c) => (
              <button key={c.id} role="tab" aria-selected={c.id === categoriaId} data-categoria-tab={c.nome} onClick={() => setCategoriaId(c.id)}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide cursor-pointer transition-colors ${c.id === categoriaId ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"} ${c.ativo ? "" : "opacity-50"}`}>
                {c.nome}
                <span className="ml-2 text-[9px] font-bold opacity-70 uppercase">{nomeDoCanal(c.canal)}{c.ativo ? "" : " · pausada"}</span>
              </button>
            ))}
          </div>

          {categoria && (
            <>
              {/* Indicadores */}
              <div className={`${caixa} grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-800`} data-resumo>
                {[
                  ["Anúncios ativos", num(resumo.anuncios), `${anuncios.length - ativos.length} desativado(s)`],
                  ["Vendas do dia", num(resumo.vendasDia), resumo.semBase ? `${resumo.semBase} ainda sem base de ontem` : "soma de todos os anúncios"],
                  ["Total vendido", num(resumo.total), "acumulado informado pelo canal"],
                  ["Preço médio", brl(resumo.precoMedio), "preço atual dos anúncios"],
                  ["Última captura", dataBR(resumo.ultima), categoria.ativo ? "captura automática diária" : "categoria pausada"],
                ].map(([t, v, d]) => (
                  <div key={t} className="px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{t}</p>
                    <p className="text-xl font-black text-white leading-tight">{v}</p>
                    <p className="text-[10px] text-slate-500">{d}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
                {/* Tabela de anúncios */}
                <section className={`${caixa} p-4 space-y-3`} data-tabela-anuncios>
                  <div className="flex flex-wrap items-center gap-2">
                    <input data-campo="busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por título, vendedor ou MLB…" className={`${campo} w-64`} />
                    <select data-campo="ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={campo}>
                      <option value="vendas_dia">Mais vendidos hoje</option>
                      <option value="total">Maior total vendido</option>
                      <option value="preco">Maior preço</option>
                      <option value="titulo">Título (A–Z)</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                      <input data-campo="inativos" type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> mostrar desativados
                    </label>
                    <div className="ml-auto flex flex-wrap gap-2">
                      <button data-acao="atualizar" onClick={atualizarAgora} disabled={!!atualizando} className={`${botao} bg-emerald-700 text-white hover:bg-emerald-600`}>↻ Atualizar agora</button>
                      <button data-acao="pausar" onClick={pausarCategoria} className={`${botao} bg-slate-800 text-slate-300 hover:bg-slate-700`}>{categoria.ativo ? "Pausar categoria" : "Retomar categoria"}</button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input data-campo="avulso" value={urlAvulso} onChange={(e) => setUrlAvulso(e.target.value)} placeholder="Adicionar anúncio avulso nesta categoria: cole o link do anúncio…" className={`${campo} flex-1 min-w-64`} />
                    <button data-acao="adicionar-avulso" onClick={adicionarAvulso} disabled={adicionando || !urlAvulso.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>{adicionando ? "Adicionando…" : "Adicionar"}</button>
                  </div>

                  {atualizando && <p className="text-xs text-slate-400" data-status>{atualizando}</p>}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
                          <th className="py-2 pr-3 w-16">Imagem</th><th className="py-2 pr-3">Título</th><th className="py-2 pr-3">Vendedor</th>
                          <th className="py-2 pr-3 text-right">Preço atual</th><th className="py-2 pr-3 text-right">Vendas do dia</th><th className="py-2 pr-3 text-right">Total vendido</th><th className="py-2 w-24" />
                        </tr>
                      </thead>
                      <tbody>
                        {carregandoAnuncios && <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500">Carregando anúncios…</td></tr>}
                        {!carregandoAnuncios && pag.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500">Nenhum anúncio para mostrar.</td></tr>}
                        {pag.map((a) => (
                          <tr key={a.id} data-anuncio-linha={a.mlb_id} className={`border-b border-slate-800/60 ${a.ativo ? "" : "opacity-40"}`}>
                            <td className="py-2 pr-3">
                              {a.url_imagem
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={a.url_imagem} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-12 h-12 object-contain rounded-md bg-white" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                                : <div className="w-12 h-12 rounded-md bg-slate-800 grid place-items-center text-slate-600">🖼️</div>}
                            </td>
                            <td className="py-2 pr-3 max-w-[420px]">
                              <a href={a.url_anuncio} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-100 hover:text-indigo-300 line-clamp-2">{a.titulo}</a>
                              <span className="text-[10px] text-slate-500">{a.mlb_id}{a.manual ? " · avulso" : ""}{a.ativo ? "" : " · desativado"}</span>
                            </td>
                            <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{a.vendedor || "—"}</td>
                            <td className="py-2 pr-3 text-right font-bold text-white whitespace-nowrap">{brl(a.ultimo_preco)}</td>
                            <td data-vendas-dia className={`py-2 pr-3 text-right font-bold whitespace-nowrap ${(a.ultimas_vendas_dia || 0) > 0 ? "text-emerald-400" : "text-slate-400"}`}>{num(a.ultimas_vendas_dia)}</td>
                            <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{num(a.ultimo_total_vendas)}</td>
                            <td className="py-2 text-right">
                              {a.ativo
                                ? <button data-acao="desativar" onClick={() => mudarAtivo(a, false)} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">Desativar</button>
                                : <button data-acao="reativar" onClick={() => mudarAtivo(a, true)} className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer">Reativar</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Paginacao total={visiveis.length} pagina={pagina} tamanho={tamanho} onPagina={setPagina} onTamanho={setTamanho} rotulo="anúncios" opcoes={[25, 50, 100]} />
                  <p className="text-[10px] text-slate-500">“Vendas do dia” = total de hoje − total da captura anterior (aparece “—” até existir uma captura anterior). Se o canal só informa faixas (“+500 vendidos”), o dia fica em 0 até a faixa mudar.</p>
                </section>

                {/* Palavras-chave */}
                <aside className={`${caixa} p-4`} data-palavras>
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">🔑 Top 20 palavras-chave</h2>
                  <p className="text-[10px] text-slate-500 mb-3">Em quantos títulos de anúncios ativos cada palavra aparece (sem preposições, números e “kit”).</p>
                  {palavras.length === 0 ? <p className="text-xs text-slate-500">Sem títulos para analisar.</p> : (
                    <ol className="space-y-1.5">
                      {palavras.map((p, i) => (
                        <li key={p.palavra}>
                          <button data-palavra={p.palavra} onClick={() => setBusca(p.palavra)} title="Filtrar a tabela por essa palavra" className="w-full text-left cursor-pointer group">
                            <div className="flex items-baseline justify-between gap-2 text-xs">
                              <span className="font-semibold text-slate-200 group-hover:text-indigo-300"><span className="text-slate-600 tabular-nums mr-1.5">{i + 1}.</span>{p.palavra}</span>
                              <span className="text-slate-400 tabular-nums">{p.anuncios} <span className="text-slate-600">· {p.percentual.toLocaleString("pt-BR")}%</span></span>
                            </div>
                            <div className="h-1 rounded bg-slate-800 mt-1"><div className="h-1 rounded bg-indigo-500" style={{ width: `${(p.anuncios / maxPalavra) * 100}%` }} /></div>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </aside>
              </div>
            </>
          )}
        </>
      )}

      {/* Diagnóstico */}
      <div className="flex flex-wrap items-center gap-3">
        <button data-acao="diagnostico" onClick={testarConexao} disabled={!!atualizando} className={`${botao} bg-slate-800 text-slate-300 hover:bg-slate-700`}>🔌 Testar conexão com o Mercado Livre</button>
        <span className="text-[10px] text-slate-500">Mostra o que o servidor consegue ler hoje (API oficial e páginas públicas).</span>
      </div>
      {diagnostico && (
        <ul className={`${caixa} divide-y divide-slate-800 text-xs`} data-diagnostico>
          {diagnostico.map((d) => (
            <li key={d.estrategia} className="px-4 py-2 flex flex-wrap items-center gap-x-3">
              <span>{d.ok ? "✅" : "❌"}</span><b className="text-slate-200">{d.estrategia}</b><span className="text-slate-400">{d.detalhe}</span><span className="ml-auto text-slate-600">{d.ms} ms</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
