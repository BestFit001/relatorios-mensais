"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { buscarTudo } from "../../lib/buscarTudo";
import { CANAIS, nomeDoCanal } from "../../lib/concorrentes/canais";
import { rankingPalavrasChave } from "../../lib/concorrentes/palavrasChave";
import { favoritoHref } from "../../lib/concorrentes/favorito";
import { hojeSP } from "../../lib/concorrentes/calculos";
import { diasAtras, mediaVendasPorDia, mudancasDePreco, type Ponto } from "../../lib/concorrentes/historico";
import { diaDaMudanca, juntarMudancas, type EventoPreco } from "../../lib/concorrentes/precos";
import Paginacao from "./Paginacao";
import {
  JANELA_HISTORICO_DIAS, COLUNAS_ANUNCIO, botao, brl, campo, caixa, chamar, dataBR, lerAnuncio, lerComparativo, lerEventos, lerHistorico, num, pct, totalVendido,
  type AcoesAnuncio, type Anuncio, type Categoria, type Comparativo,
} from "./concorrentes/comum";
import Estrela from "./concorrentes/Estrela";
import TagRanking from "./concorrentes/TagRanking";
import MudancasPreco from "./concorrentes/MudancasPreco";
import { HistoricoPrecoModal, PrecoDePor, SeloMudanca } from "./concorrentes/PrecoDePor";
import Favoritos from "./concorrentes/Favoritos";
import ComparativoForm from "./concorrentes/ComparativoForm";
import ComparativoLista, { type ComparativoComAnuncio } from "./concorrentes/ComparativoLista";
import AtualizarPeloNavegador, { resumoAtualizacao } from "./concorrentes/AtualizarPeloNavegador";
import Prioritarios from "./concorrentes/Prioritarios";
import { ehCategoriaPrioritaria } from "../../lib/concorrentes/prioritarios";

type Ordem = "vendas_dia" | "total" | "mes" | "preco" | "titulo" | "ranking";
type Vista = "anuncios" | "mudancas" | "favoritos" | "comparativo" | "prioritario";

/** Painel de UM canal (Mercado Livre, Shopee ou Amazon): categorias importadas pelo favorito, anúncios, favoritos, mudanças de preço e comparativo. */
export default function ConcorrentesPainel({ canal = "mercadolivre" }: { canal?: string }) {
  const info = CANAIS.find((c) => c.id === canal) || CANAIS[0];
  const ehML = canal === "mercadolivre", ehAmazon = canal === "amazon";
  const temRanking = canal !== "shopee";
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  // a categoria escondida dos prioritários não é uma aba de categoria, mas os anúncios dela contam como do canal
  const [idsEscondidas, setIdsEscondidas] = useState<string[]>([]);
  const [prioritariosTodos, setPrioritariosTodos] = useState<Anuncio[]>([]);
  const [carregandoPrio, setCarregandoPrio] = useState(true);
  const [atualizarAberto, setAtualizarAberto] = useState(false);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [vista, setVista] = useState<Vista>("anuncios");
  const [historico, setHistorico] = useState<Record<string, Ponto[]>>({});
  const [eventos, setEventos] = useState<Record<string, EventoPreco[]>>({});
  const [historicoPrecoDe, setHistoricoPrecoDe] = useState<Anuncio | null>(null);
  const [carregandoHist, setCarregandoHist] = useState(false);
  const [favoritosTodos, setFavoritosTodos] = useState<Anuncio[]>([]);
  const [carregandoFav, setCarregandoFav] = useState(true);
  const [comparativosTodos, setComparativosTodos] = useState<ComparativoComAnuncio[]>([]);
  const [carregandoComp, setCarregandoComp] = useState(true);
  const [formComp, setFormComp] = useState<{ anuncio: Anuncio; existente: Comparativo | null } | null>(null);
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [soRanking, setSoRanking] = useState(false);
  const hoje = hojeSP();
  const [carregando, setCarregando] = useState(true);
  const [carregandoAnuncios, setCarregandoAnuncios] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [urlCategoria, setUrlCategoria] = useState("");
  const [nomeCategoria, setNomeCategoria] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [urlAvulso, setUrlAvulso] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<{ ok: boolean; estrategia: string; detalhe: string; ms: number }[] | null>(null);

  const [textoImport, setTextoImport] = useState("");
  const [nomeImport, setNomeImport] = useState("");
  const [importando, setImportando] = useState(false);
  // aberto só na 1ª visita sem categorias; depois não fecha sozinho quando a primeira categoria é importada
  const [importarAberto, setImportarAberto] = useState(false);
  const favoritoRef = useRef<HTMLAnchorElement>(null);
  // o React bloqueia "javascript:" em href vindo do JSX; o favorito precisa dele, então o endereço é posto direto no elemento
  useEffect(() => { favoritoRef.current?.setAttribute("href", favoritoHref()); }, []);

  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>(canal === "amazon" ? "mes" : "vendas_dia");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(25);

  // um aviso antigo não pode apagar um aviso novo: o relógio anterior é cancelado a cada aviso
  const relogioAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = (tipo: "ok" | "erro", texto: string) => {
    if (relogioAviso.current) clearTimeout(relogioAviso.current);
    setAviso({ tipo, texto });
    relogioAviso.current = tipo === "ok" ? setTimeout(() => setAviso(null), 6000) : null;
  };

  const carregarCategorias = useCallback(async (escolher?: string) => {
    const { data, error } = await supabase.from("categorias").select("*").eq("canal", canal).order("criado_em", { ascending: true });
    if (error) { setErro(`Não consegui ler as categorias: ${error.message}`); setCarregando(false); return; }
    const todas = (data || []) as Categoria[];
    const lista = todas.filter((c) => !ehCategoriaPrioritaria(c.url_origem));
    setIdsEscondidas(todas.filter((c) => ehCategoriaPrioritaria(c.url_origem)).map((c) => c.id));
    setCategorias(lista);
    setImportarAberto((aberto) => aberto || lista.length === 0);
    setCategoriaId((atual) => escolher || (atual && lista.some((c) => c.id === atual) ? atual : lista[0]?.id ?? null));
    setCarregando(false);
  }, [canal]);

  /** Lê o histórico (90 dias) desses anúncios e junta ao que já está na tela. */
  const carregarHistorico = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    setCarregandoHist(true);
    try {
      const desde = diasAtras(hojeSP(), JANELA_HISTORICO_DIAS);
      const [novo, ev] = await Promise.all([lerHistorico(ids, desde), lerEventos(ids, `${desde}T00:00:00-03:00`)]);
      setHistorico((h) => { const f = { ...h }; for (const id of ids) f[id] = novo[id] || []; return f; });
      setEventos((h) => { const f = { ...h }; for (const id of ids) f[id] = ev[id] || []; return f; });
    } catch (e: any) { setErro(`Não consegui ler o histórico: ${e.message}`); }
    finally { setCarregandoHist(false); }
  }, []);

  const carregarAnuncios = useCallback(async (id: string) => {
    setCarregandoAnuncios(true);
    try {
      const lista = (await buscarTudo("anuncios", COLUNAS_ANUNCIO, (q) => q.eq("categoria_id", id))).map(lerAnuncio);
      setAnuncios(lista); setErro(null);
      carregarHistorico(lista.map((a) => a.id));
    } catch (e: any) { setErro(`Não consegui ler os anúncios: ${e.message}`); }
    finally { setCarregandoAnuncios(false); }
  }, [carregarHistorico]);

  const carregarFavoritos = useCallback(async () => {
    try {
      const lista = (await buscarTudo("anuncios", COLUNAS_ANUNCIO, (q) => q.eq("favorito", true))).map(lerAnuncio);
      setFavoritosTodos(lista);
      carregarHistorico(lista.map((a) => a.id));
    } catch (e: any) { setErro(`Não consegui ler os favoritos: ${e.message}`); }
    finally { setCarregandoFav(false); }
  }, [carregarHistorico]);

  const carregarPrioritarios = useCallback(async () => {
    try {
      const lista = (await buscarTudo("anuncios", COLUNAS_ANUNCIO, (q) => q.eq("prioritario", true))).map(lerAnuncio);
      setPrioritariosTodos(lista);
      carregarHistorico(lista.map((a) => a.id));
    } catch (e: any) { setErro(`Não consegui ler os anúncios prioritários: ${e.message}`); }
    finally { setCarregandoPrio(false); }
  }, [carregarHistorico]);

  const carregarComparativos = useCallback(async () => {
    try {
      const linhas = (await buscarTudo("comparativos", "*")).map(lerComparativo);
      const ids = Array.from(new Set(linhas.map((c) => c.anuncio_id)));
      const porId = new Map<string, Anuncio>();
      for (let i = 0; i < ids.length; i += 80) {
        const { data, error } = await supabase.from("anuncios").select(COLUNAS_ANUNCIO).in("id", ids.slice(i, i + 80));
        if (error) throw new Error(error.message);
        for (const r of data || []) porId.set(r.id, lerAnuncio(r));
      }
      setComparativosTodos(linhas.map((c) => ({ ...c, anuncio: porId.get(c.anuncio_id) || null })).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))));
    } catch (e: any) { setErro(`Não consegui ler os comparativos: ${e.message}`); }
    finally { setCarregandoComp(false); }
  }, []);

  useEffect(() => { carregarCategorias(); carregarFavoritos(); carregarComparativos(); if (ehML) carregarPrioritarios(); else setCarregandoPrio(false); }, [carregarCategorias, carregarFavoritos, carregarComparativos, carregarPrioritarios, ehML]);
  useEffect(() => { setAnuncios([]); setPagina(1); setBusca(""); if (categoriaId) carregarAnuncios(categoriaId); }, [categoriaId, carregarAnuncios]);
  useEffect(() => { setPagina(1); }, [busca, ordem, mostrarInativos, tamanho, soFavoritos, soRanking]);

  // favoritos e comparativos são de todos os canais no banco; cada aba mostra só os do seu canal
  const idsDoCanal = useMemo(() => new Set([...categorias.map((c) => c.id), ...idsEscondidas]), [categorias, idsEscondidas]);
  const prioritarios = useMemo(() => prioritariosTodos.filter((a) => idsDoCanal.has(a.categoria_id)), [prioritariosTodos, idsDoCanal]);
  const favoritos = useMemo(() => favoritosTodos.filter((a) => idsDoCanal.has(a.categoria_id)), [favoritosTodos, idsDoCanal]);
  const comparativos = useMemo(() => comparativosTodos.filter((c) => c.anuncio && idsDoCanal.has(c.anuncio.categoria_id)), [comparativosTodos, idsDoCanal]);
  const categoria = categorias.find((c) => c.id === categoriaId) || null;
  const ativos = useMemo(() => anuncios.filter((a) => a.ativo), [anuncios]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = anuncios.filter((a) => (mostrarInativos || a.ativo) && (!soFavoritos || a.favorito) && (!soRanking || a.ranking_posicao != null) && (!t || a.titulo.toLowerCase().includes(t) || (a.vendedor || "").toLowerCase().includes(t) || (a.marca || "").toLowerCase().includes(t) || a.mlb_id.toLowerCase().includes(t)));
    const chave = (a: Anuncio) => ordem === "vendas_dia" ? a.ultimas_vendas_dia : ordem === "total" ? a.ultimo_total_vendas : ordem === "mes" ? a.ultimo_vendas_mes : a.ultimo_preco;
    return [...lista].sort((a, b) => {
      if (ordem === "titulo") return a.titulo.localeCompare(b.titulo, "pt-BR");
      if (ordem === "ranking") return (a.ranking_posicao ?? 1e9) - (b.ranking_posicao ?? 1e9) || (b.ultimo_total_vendas ?? -1) - (a.ultimo_total_vendas ?? -1);
      return (chave(b) ?? -1) - (chave(a) ?? -1);
    });
  }, [anuncios, busca, ordem, mostrarInativos, soFavoritos, soRanking]);

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
      mes: ativos.reduce((s, a) => s + (a.ultimo_vendas_mes || 0), 0),
      comMes: ativos.filter((a) => a.ultimo_vendas_mes != null).length,
      precoMedio: comPreco.length ? comPreco.reduce((s, a) => s + (a.ultimo_preco || 0), 0) / comPreco.length : null,
      ultima: datas.sort().pop() ?? null,
      semBase: ativos.filter((a) => a.ultimas_vendas_dia == null).length,
      faixas: ativos.filter((a) => a.ultimo_aproximado).length,
    };
  }, [ativos]);

  const cadastrar = async () => {
    setCadastrando(true); setAviso(null);
    try {
      const r = await chamar("categorias", "POST", { url: urlCategoria, canal: "mercadolivre", nome: nomeCategoria || undefined });
      setUrlCategoria(""); setNomeCategoria("");
      await carregarCategorias(r.categoria.id);
      if (r.categoria.id === categoriaId) await carregarAnuncios(r.categoria.id);
      avisar("ok", `“${r.categoria.nome}”: ${r.encontrados} anúncio(s) lidos, ${r.novos} novo(s) (fonte: ${r.fonte}).${r.avisos?.length ? " " + r.avisos.join(" ") : ""}`);
    } catch (e: any) { avisar("erro", e.message); }
    finally { setCadastrando(false); }
  };

  const importar = async () => {
    setImportando(true); setAviso(null);
    try {
      const r = await chamar("importar", "POST", { texto: textoImport, canal, categoria_id: categoriaId, nome: nomeImport || undefined });
      setTextoImport(""); setNomeImport("");
      if (r.tipo === "atualizacao") { await recarregarTudo(); avisar("ok", `Atualização: ${resumoAtualizacao(r)}`); return; }
      await carregarCategorias(r.categoria.id);
      await carregarAnuncios(r.categoria.id);
      carregarFavoritos(); carregarComparativos();
      const partes = [`${r.novos} novo(s)`, `${r.atualizados} atualizado(s) com a captura de hoje`];
      if (r.mudancasPreco) partes.push(`${r.mudancasPreco} mudança(s) de preço registrada(s)`);
      if (r.precosMeusAtualizados) partes.push(`${r.precosMeusAtualizados} preço(s) de anúncio meu atualizado(s) nos comparativos`);
      if (r.ranking?.lidos) {
        const k = r.ranking, mov = [k.subiram && `${k.subiram} subiram`, k.cairam && `${k.cairam} caíram`, k.entraram && `${k.entraram} novo(s) no ranking`, k.sairam && `${k.sairam} saíram do ranking`].filter(Boolean);
        partes.push(`Mais vendidos: ${k.lidos} com posição${mov.length ? ` (${mov.join(", ")})` : ""}`);
      }
      if (r.desativadosIgnorados) partes.push(`${r.desativadosIgnorados} desativado(s) mantido(s) assim`);
      if (r.descartados) partes.push(`${r.descartados} descartado(s) por dado inválido`);
      avisar("ok", `${r.tipo === "anuncio" ? "Anúncio importado" : r.tipo === "ranking" ? `Mais vendidos em “${r.categoria.nome}”` : `Categoria “${r.categoria.nome}”`}: ${partes.join(", ")}.`);
    } catch (e: any) { avisar("erro", e.message); }
    finally { setImportando(false); }
  };

  /** Depois de uma atualização pelo navegador: relê categoria atual, prioritários e favoritos (o histórico vem junto). */
  const recarregarTudo = async () => {
    await carregarCategorias(categoriaId || undefined);
    await Promise.all([categoriaId ? carregarAnuncios(categoriaId) : Promise.resolve(), carregarFavoritos(), carregarComparativos(), ehML ? carregarPrioritarios() : Promise.resolve()]);
  };

  const copiarFavorito = async () => {
    try { await navigator.clipboard.writeText(favoritoHref()); avisar("ok", "Código do favorito copiado. Crie um favorito novo e cole no campo de endereço (URL)."); }
    catch { avisar("erro", "Não consegui copiar. Arraste o botão para a barra de favoritos."); }
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

  const alternarFavorito = async (a: Anuncio) => {
    const favorito = !a.favorito;
    const troca = (l: Anuncio[]) => l.map((x) => (x.id === a.id ? { ...x, favorito } : x));
    setAnuncios(troca); // otimista
    setPrioritariosTodos(troca);
    if (!favorito) setFavoritosTodos((l) => l.filter((x) => x.id !== a.id)); else setFavoritosTodos((l) => (l.some((x) => x.id === a.id) ? troca(l) : [...l, { ...a, favorito }]));
    try { await chamar("anuncios", "PATCH", { id: a.id, favorito }); carregarFavoritos(); }
    catch (e: any) { setAnuncios((l) => l.map((x) => (x.id === a.id ? { ...x, favorito: a.favorito } : x))); carregarFavoritos(); avisar("erro", e.message); }
  };

  const acoes: AcoesAnuncio = {
    alternarFavorito,
    abrirComparativo: (a) => setFormComp({ anuncio: a, existente: comparativos.find((c) => c.anuncio_id === a.id) || null }),
    temComparativo: (id) => comparativos.some((c) => c.anuncio_id === id),
    abrirHistoricoPreco: (a) => setHistoricoPrecoDe(a),
  };
  /** Mudanças do preço "Por" do anúncio: registro por leitura (com hora, várias no mesmo dia) + dias antigos. */
  const mudancasDe = (id: string) => juntarMudancas(eventos[id] || [], mudancasDePreco(historico[id] || []));

  const removerComparativo = async (c: ComparativoComAnuncio) => {
    if (!window.confirm("Remover este comparativo? O anúncio do concorrente continua sendo monitorado.")) return;
    try { await chamar("comparativos", "DELETE", { id: c.id }); setComparativosTodos((l) => l.filter((x) => x.id !== c.id)); avisar("ok", "Comparativo removido."); }
    catch (e: any) { avisar("erro", e.message); }
  };

  const atualizarPrecoMeu = async (c: ComparativoComAnuncio, dados: { meu_preco?: string; texto?: string }): Promise<boolean> => {
    try {
      const r = await chamar<{ comparativo: Comparativo }>("comparativos", "PATCH", { id: c.id, ...dados });
      const novo = lerComparativo(r.comparativo);
      setComparativosTodos((l) => l.map((x) => (x.id === c.id ? { ...x, ...novo } : x)));
      avisar("ok", `Meu preço atualizado: ${brl(novo.meu_preco)}.`);
      return true;
    } catch (e: any) { avisar("erro", e.message); return false; }
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
      let ok = 0, falhas = 0, mudancas = 0, ultimoErro = "";
      for (let rodada = 0; rodada < 12; rodada++) { // a rota trabalha em lotes dentro do limite de tempo; repete até acabar
        const r = await chamar("capturar", "POST", { categoria_id: categoriaId });
        if (r.manual) { avisar("erro", 'O servidor está em modo manual (não lê o Mercado Livre): use “Atualizar pelo navegador”.'); setAtualizarAberto(true); setAtualizando(null); return; }
        ok += r.ok; falhas += r.falhas; mudancas += r.mudancasPreco || 0; if (r.erros?.[0]) ultimoErro = r.erros[0].motivo;
        if (r.pendentes === 0 || r.processados === 0) break; // acabou, ou a rodada não avançou
        setAtualizando(`Capturando… ${ok + falhas} anúncio(s) processados`);
      }
      await carregarAnuncios(categoriaId);
      if (falhas) setAtualizarAberto(true);
      avisar(falhas && !ok ? "erro" : "ok", `${ok} anúncio(s) atualizados${mudancas ? `, ${mudancas} mudança(s) de preço registrada(s)` : ""}${falhas ? `, ${falhas} com falha` : ""}.${ultimoErro ? ` Motivo: ${ultimoErro}` : ""}${falhas ? " O servidor não consegue ler o Mercado Livre: use “Atualizar pelo navegador” (abaixo), que lê os mesmos anúncios pelo seu navegador." : ""}`);
    } catch (e: any) { avisar("erro", e.message); }
    finally { setAtualizando(null); }
  };

  const testarConexao = async () => {
    setAtualizando("Testando a conexão com o Mercado Livre…"); setDiagnostico(null);
    try { setDiagnostico((await chamar("diagnostico", "POST", {})).itens); }
    catch (e: any) { avisar("erro", e.message); }
    finally { setAtualizando(null); }
  };

  
  return (
    <div className="space-y-5" data-painel-concorrentes>
      {erro && <div data-erro className="p-4 rounded-xl border border-amber-800/60 bg-amber-950/30 text-amber-200 text-xs font-semibold">⚠️ {erro}</div>}
      {aviso && (
        <div data-aviso={aviso.tipo} className={`p-3 rounded-xl border text-xs font-semibold flex items-start justify-between gap-3 ${aviso.tipo === "ok" ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200" : "border-rose-800/60 bg-rose-950/30 text-rose-200"}`}>
          <span>{aviso.tipo === "ok" ? "✅" : "⚠️"} {aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 cursor-pointer" aria-label="Fechar">✕</button>
        </div>
      )}

      {/* Importar do navegador */}
      <details open={importarAberto} className={`${caixa} group`} data-importar>
        <summary className="cursor-pointer select-none px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>📋 Importar do navegador</span>
          <span className="text-[10px] font-semibold normal-case text-slate-500 tracking-normal">sem proxy, sem API e sem senha: o seu navegador lê {ehML ? "o Mercado Livre" : ehAmazon ? "a Amazon" : "a Shopee"}</span>
        </summary>
        <div className="px-5 pb-5 space-y-4">
          <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
            <li>
              Arraste este botão para a sua barra de favoritos:{" "}
              <a ref={favoritoRef} data-favorito onClick={(e) => e.preventDefault()} draggable className="inline-block align-middle px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider cursor-grab">📋 Capturar anúncios</a>{" "}
              <button data-acao="copiar-favorito" onClick={copiarFavorito} className="text-[11px] underline text-slate-300 hover:text-white cursor-pointer">não consegui arrastar</button>
              <span className="text-slate-500"> (barra escondida? Ctrl+Shift+B no Chrome)</span>
            </li>
            {ehML && <li>Abra no Mercado Livre a categoria ou busca (ou a página de um anúncio) e clique no favorito. Em uma lista ele lê as 2 primeiras páginas; numa página de anúncio, só aquele anúncio; na página “Mais vendidos” da categoria, a posição (1º, 2º…) de cada anúncio. Anúncio e Mais vendidos entram na categoria selecionada aqui.</li>}
            {ehAmazon && <li>Abra na Amazon uma busca, categoria (ou a página de um produto) e clique no favorito. Em uma lista ele lê as 2 primeiras páginas; numa página de produto, só aquele produto; na página “Mais vendidos”, a posição (#1, #2…) de cada produto. Produto e Mais vendidos entram na categoria selecionada aqui.</li>}
            {canal === "shopee" && <li>Abra na Shopee uma busca, categoria ou loja (ou a página de um produto), espere os produtos carregarem e clique no favorito: ele rola a página sozinho e lê o que apareceu (a Shopee carrega a lista aos poucos, então vem só a página em que você está; para ler a seguinte, vá para ela e clique de novo). Produto avulso entra na categoria selecionada aqui.</li>}
            <li>Volte aqui, cole o texto copiado e clique em Importar. Repita uma vez por dia, na mesma categoria: o histórico e {ehAmazon ? "as compras do mês" : "as vendas do dia"} são {ehAmazon ? "atualizados" : "calculados"} a cada importação.</li>
          </ol>
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] items-end">
            <label className="grid gap-1 text-[11px] font-bold text-slate-400">Texto copiado pelo favorito
              <textarea data-campo="importar-texto" value={textoImport} onChange={(e) => setTextoImport(e.target.value)} rows={3} placeholder={`{"v":1,"canal":"${canal}","tipo":"categoria",…}`} className={`${campo} w-full font-mono text-xs`} />
            </label>
            <label className="grid gap-1 text-[11px] font-bold text-slate-400">Nome da categoria (opcional)
              <input data-campo="importar-nome" value={nomeImport} onChange={(e) => setNomeImport(e.target.value)} placeholder="Ex.: Pochetes" className={`${campo} w-full`} />
            </label>
            <button data-acao="importar" onClick={importar} disabled={importando || !textoImport.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>{importando ? "Importando…" : "Importar"}</button>
          </div>
        </div>
      </details>

      {carregando ? <p className="text-xs text-slate-500">Carregando…</p> : categorias.length === 0 && !ehML ? (
        <div className={`${caixa} p-10 text-center text-sm text-slate-400`}>Nenhuma categoria cadastrada ainda. Abra uma busca ou categoria {ehAmazon ? "da Amazon" : "da Shopee"}, clique no favorito e cole acima o texto que ele copiar.</div>
      ) : (
        <>
          {/* Sub-abas */}
          <nav className="flex flex-wrap gap-1 border-b border-slate-800" role="tablist" data-vistas>
            {([
              ["anuncios", "📋 Anúncios", null],
              ["mudancas", "📉 Mudanças de preço", null],
              ["favoritos", "★ Favoritos", favoritos.length],
              ["comparativo", "⚖️ Comparativo", comparativos.length],
              ...(ehML ? [["prioritario", "⭐ Monitoramento prioritário", prioritarios.filter((a) => a.ativo).length] as [Vista, string, number | null]] : []),
            ] as [Vista, string, number | null][]).map(([id, rotulo, n]) => (
              <button key={id} role="tab" aria-selected={vista === id} data-vista={id} onClick={() => setVista(id)}
                className={`px-4 py-2 text-xs font-black tracking-wide cursor-pointer border-b-2 -mb-px transition-colors ${vista === id ? "border-indigo-500 text-white" : "border-transparent text-slate-500 hover:text-slate-200"}`}>
                {rotulo}{n ? <span className="ml-1.5 text-[10px] font-bold text-slate-400">({n})</span> : null}
              </button>
            ))}
          </nav>

          {/* Filtro por categoria (abas): vale para Anúncios e Mudanças de preço */}
          {(vista === "anuncios" || vista === "mudancas") && (
            <div className="flex flex-wrap items-center gap-2" role="tablist" data-categorias>
              {categorias.map((c) => (
                <button key={c.id} role="tab" aria-selected={c.id === categoriaId} data-categoria-tab={c.nome} onClick={() => setCategoriaId(c.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide cursor-pointer transition-colors ${c.id === categoriaId ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"} ${c.ativo ? "" : "opacity-50"}`}>
                  {c.nome}
                  <span className="ml-2 text-[9px] font-bold opacity-70 uppercase">{nomeDoCanal(c.canal)}{c.ativo ? "" : " · pausada"}</span>
                </button>
              ))}
            </div>
          )}

          {vista === "prioritario" && ehML && (
            <Prioritarios canal={canal} anuncios={prioritarios} historico={historico} eventos={eventos} hoje={hoje} carregando={carregandoPrio || carregandoHist} acoes={acoes} avisar={avisar} onRecarregar={recarregarTudo} />
          )}

          {(vista === "anuncios" || vista === "mudancas") && !categoria && (
            <div className={`${caixa} p-10 text-center text-sm text-slate-400`} data-sem-categoria>Nenhuma categoria cadastrada ainda. Abra uma busca ou categoria do Mercado Livre, clique no favorito e cole acima o texto que ele copiar. Para acompanhar anúncios específicos, use a aba “Monitoramento prioritário”.</div>
          )}

          {vista === "mudancas" && categoria && (
            <MudancasPreco anuncios={anuncios} historico={historico} eventos={eventos} hoje={hoje} carregando={carregandoAnuncios || carregandoHist} acoes={acoes} />
          )}

          {vista === "favoritos" && (
            <Favoritos favoritos={favoritos} categorias={categorias} historico={historico} eventos={eventos} carregando={carregandoFav} acoes={acoes} onAbrirCategoria={(id) => { setCategoriaId(id); setVista("anuncios"); }} />
          )}

          {vista === "comparativo" && (
            <ComparativoLista comparativos={comparativos} carregando={carregandoComp}
              onEditar={(c) => { if (c.anuncio) setFormComp({ anuncio: c.anuncio, existente: c }); }} onRemover={removerComparativo} onPreco={atualizarPrecoMeu} />
          )}

          {vista === "anuncios" && categoria && (
            <>
              {/* Indicadores */}
              <div className={`${caixa} grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-800`} data-resumo>
                {[
                  ["Anúncios ativos", num(resumo.anuncios), `${anuncios.length - ativos.length} desativado(s)`],
                  ...(ehAmazon ? [
                    ["Compras no mês", num(resumo.mes), `soma das faixas de ${resumo.comMes} de ${resumo.anuncios} produtos (mínimo, não exato)`],
                    ["Compras por dia (est.)", resumo.mes ? `≈ ${(resumo.mes / 30).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : "—", "compras do mês ÷ 30"],
                  ] : [
                    ["Vendas do dia", num(resumo.vendasDia), resumo.semBase ? `${resumo.semBase} ainda sem base de ontem` : resumo.faixas ? `${resumo.faixas} de ${resumo.anuncios} só informam faixa (+N)` : "soma de todos os anúncios"],
                    ["Total vendido", num(resumo.total), "acumulado informado pelo canal"],
                  ]),
                  ["Preço médio", brl(resumo.precoMedio), "preço atual dos anúncios"],
                  ["Última captura", dataBR(resumo.ultima), !categoria.ativo ? "categoria pausada" : ehML ? "captura automática diária" : "atualize pelo favorito"],
                ].map(([t, v, d]) => (
                  <div key={t} className="px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{t}</p>
                    <p className="text-xl font-black text-white leading-tight">{v}</p>
                    <p className="text-[10px] text-slate-500">{d}</p>
                  </div>
                ))}
              </div>

              {ehML && <AtualizarPeloNavegador canal={canal} anuncios={ativos} aberto={atualizarAberto} onAbrir={setAtualizarAberto} onAviso={avisar} onImportado={recarregarTudo} />}

              <div className="grid gap-5 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_340px] items-start">
                {/* Tabela de anúncios */}
                <section className={`${caixa} p-4 space-y-3`} data-tabela-anuncios>
                  <div className="flex flex-wrap items-center gap-2">
                    <input data-campo="busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Filtrar por título, marca, vendedor ou ${ehML ? "MLB" : ehAmazon ? "ASIN" : "código"}…`} className={`${campo} w-64`} />
                    <select data-campo="ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={campo}>
                      {ehAmazon ? <option value="mes">Mais compras no mês</option> : <><option value="vendas_dia">Mais vendidos hoje</option><option value="total">Maior total vendido</option></>}
                      <option value="preco">Maior preço</option>
                      {temRanking && <option value="ranking">Posição no Mais vendidos</option>}
                      <option value="titulo">Título (A–Z)</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                      <input data-campo="so-favoritos" type="checkbox" checked={soFavoritos} onChange={(e) => setSoFavoritos(e.target.checked)} /> só favoritos ★
                    </label>
                    {temRanking && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                        <input data-campo="so-ranking" type="checkbox" checked={soRanking} onChange={(e) => setSoRanking(e.target.checked)} /> só no Mais vendidos 🏆
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                      <input data-campo="inativos" type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> mostrar desativados
                    </label>
                    <div className="ml-auto flex flex-wrap gap-2">
                      {ehML && <button data-acao="atualizar" onClick={atualizarAgora} disabled={!!atualizando} className={`${botao} bg-emerald-700 text-white hover:bg-emerald-600`}>↻ Atualizar agora</button>}
                      {ehML && <button data-acao="atualizar-navegador" onClick={() => setAtualizarAberto((v) => !v)} className={`${botao} bg-slate-800 text-emerald-300 hover:bg-slate-700`}>🔄 Atualizar pelo navegador</button>}
                      <button data-acao="pausar" onClick={pausarCategoria} className={`${botao} bg-slate-800 text-slate-300 hover:bg-slate-700`}>{categoria.ativo ? "Pausar categoria" : "Retomar categoria"}</button>
                    </div>
                  </div>

                  {ehML ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input data-campo="avulso" value={urlAvulso} onChange={(e) => setUrlAvulso(e.target.value)} placeholder="Adicionar anúncio avulso nesta categoria: cole o link do anúncio…" className={`${campo} flex-1 min-w-64`} />
                      <button data-acao="adicionar-avulso" onClick={adicionarAvulso} disabled={adicionando || !urlAvulso.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>{adicionando ? "Adicionando…" : "Adicionar"}</button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500" data-aviso-atualizacao>O servidor não lê {nomeDoCanal(canal)}: para atualizar ou incluir um {ehAmazon ? "produto" : "anúncio"}, abra a página no navegador, clique no favorito e importe aqui (acima). Faça isso todo dia na mesma busca para formar o histórico de preços.</p>
                  )}

                  {atualizando && <p className="text-xs text-slate-400" data-status>{atualizando}</p>}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
                          <th className="py-2 pr-2 w-8" /><th className="py-2 pr-3 w-16">Imagem</th><th className="py-2 pr-3">Título</th><th className="py-2 pr-3">Marca</th><th className="py-2 pr-3">Vendedor</th>
                          <th className="py-2 pr-3 text-right">Preço atual</th>
                          {ehAmazon
                            ? <th className="py-2 pr-3 text-right" title="A Amazon informa as compras dos últimos 30 dias em faixas (+50, +100, +1 mil…)">Compras no mês</th>
                            : <><th className="py-2 pr-3 text-right">Vendas do dia</th><th className="py-2 pr-3 text-right">Total vendido</th><th className="py-2 pr-3 text-right" title="Estimativa pelo histórico: precisa de pelo menos 7 dias">Média/dia (est.)</th></>}
                          <th className="py-2 w-28" />
                        </tr>
                      </thead>
                      <tbody>
                        {carregandoAnuncios && <tr><td colSpan={ehAmazon ? 8 : 10} className="py-8 text-center text-xs text-slate-500">Carregando anúncios…</td></tr>}
                        {!carregandoAnuncios && pag.length === 0 && <tr><td colSpan={ehAmazon ? 8 : 10} className="py-8 text-center text-xs text-slate-500">Nenhum anúncio para mostrar.</td></tr>}
                        {pag.map((a) => {
                          const h = historico[a.id] || [];
                          const mud = mudancasDe(a.id).filter((m) => diaDaMudanca(m) >= diasAtras(hoje, 30)).pop();
                          const media = mediaVendasPorDia(h);
                          return (
                            <tr key={a.id} data-anuncio-linha={a.mlb_id} className={`border-b border-slate-800/60 ${a.ativo ? "" : "opacity-40"}`}>
                              <td className="py-2 pr-2"><Estrela ativo={a.favorito} onClick={() => alternarFavorito(a)} /></td>
                              <td className="py-2 pr-3">
                                {a.url_imagem
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={a.url_imagem} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-12 h-12 object-contain rounded-md bg-white" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                                  : <div className="w-12 h-12 rounded-md bg-slate-800 grid place-items-center text-slate-600">🖼️</div>}
                              </td>
                              <td className="py-2 pr-3 max-w-[420px]">
                                <a href={a.url_anuncio} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-100 hover:text-indigo-300 line-clamp-2">{a.titulo}</a>
                                <span className="block text-[10px] text-slate-500">{a.mlb_id}{a.manual ? " · avulso" : ""}{a.ativo ? "" : " · desativado"}</span>
                                <TagRanking a={a} />
                              </td>
                              <td data-marca className="py-2 pr-3 text-slate-300 whitespace-nowrap">{a.marca || "—"}</td>
                              <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{a.vendedor || "—"}</td>
                              <td className="py-2 pr-3 text-right font-bold text-white whitespace-nowrap">
                                <PrecoDePor a={a} />
                                {mud && <SeloMudanca m={mud} onClick={() => setHistoricoPrecoDe(a)} />}
                              </td>
                              {ehAmazon ? (
                                <td data-mes className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap" title="Faixa informada pela Amazon: as compras dos últimos 30 dias são iguais ou maiores">{a.ultimo_vendas_mes != null ? `+${num(a.ultimo_vendas_mes)}` : "—"}</td>
                              ) : (
                                <>
                                  <td data-vendas-dia className={`py-2 pr-3 text-right font-bold whitespace-nowrap ${(a.ultimas_vendas_dia || 0) > 0 ? "text-emerald-400" : "text-slate-400"}`}
                                    title={a.ultimo_aproximado ? "O canal só informa faixas (+N vendidos): o dia só muda quando a faixa muda" : undefined}>{num(a.ultimas_vendas_dia)}</td>
                                  <td data-total className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap" title={a.ultimo_aproximado ? "Faixa informada pelo canal: o total real é igual ou maior" : undefined}>{totalVendido(a)}</td>
                                  <td data-media className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap" title={media ? `Média dos últimos ${media.dias} dias${media.aproximado ? " (o canal informa faixas: é uma estimativa)" : ""}` : "Precisa de pelo menos 7 dias de histórico"}>
                                    {media ? `${media.aproximado ? "≈ " : ""}${media.porDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : "—"}
                                  </td>
                                </>
                              )}
                              <td className="py-2 text-right whitespace-nowrap">
                                <button data-acao="comparar" onClick={() => acoes.abrirComparativo(a)} title="Marcar como igual a um anúncio meu" className="mr-2 cursor-pointer text-base opacity-70 hover:opacity-100">{acoes.temComparativo(a.id) ? "⚖️✓" : "⚖️"}</button>
                                {a.ativo
                                  ? <button data-acao="desativar" onClick={() => mudarAtivo(a, false)} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">Desativar</button>
                                  : <button data-acao="reativar" onClick={() => mudarAtivo(a, true)} className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer">Reativar</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <Paginacao total={visiveis.length} pagina={pagina} tamanho={tamanho} onPagina={setPagina} onTamanho={setTamanho} rotulo="anúncios" opcoes={[25, 50, 100]} />
                  <details className="text-[11px] text-slate-500" data-sobre-vendas>
                    <summary className="cursor-pointer select-none font-bold text-slate-400">Como as vendas são medidas (e o que dá para confiar)</summary>
                    {ehAmazon ? (
                      <ul className="mt-2 space-y-1.5 list-disc list-inside">
                        <li>A Amazon não mostra vendas por dia nem o total acumulado: só <b>“N compras no mês passado”</b>, em faixas (+50, +100, +200, +1 mil…) e apenas em parte dos produtos. A coluna Compras no mês mostra essa faixa; o valor real é igual ou maior.</li>
                        <li>Por isso não existe “vendas do dia” na Amazon: dividir a faixa por 30 dá só uma ordem de grandeza (“Compras por dia (est.)” no topo).</li>
                        <li>O que é confiável aqui: <b>preço</b> (a cada importação entra no histórico e alimenta a aba Mudanças de preço), <b>posição no Mais vendidos</b> e a faixa de compras para ordenar quem vende mais.</li>
                      </ul>
                    ) : (
                      <ul className="mt-2 space-y-1.5 list-disc list-inside">
                        <li>{ehML ? "O Mercado Livre não divulga" : "A Shopee não divulga"} a venda diária de anúncios de terceiros. Só aparece o <b>total acumulado</b> e, a partir de certo volume, em <b>faixas</b> ({ehML ? "“+100”, “+500”, “+1 mil”, “+5 mil”…" : "“1,2mil vendidos”"}). O sinal “+” na coluna Total vendido marca esses casos.</li>
                        <li><b>Vendas do dia</b> = total de hoje − total da captura anterior. Com faixas, fica em 0 até o anúncio mudar de faixa, e aí o salto é de uma faixa inteira (não é a venda de um dia). Só é exato nos anúncios que mostram o número certo (os pequenos).</li>
                        <li><b>Média/dia (est.)</b> = quanto o total andou entre a primeira e a última captura ÷ dias entre elas (a partir de 7 dias de histórico, últimos 90). Quanto mais dias, mais confiável: com faixas o erro máximo é uma faixa dividida pelo número de dias. O “≈” indica essa estimativa.</li>
                        <li>Para o ranking, use “Maior total vendido” e “Média/dia”; a variação do dia serve como alerta de que algo mudou.</li>
                      </ul>
                    )}
                  </details>
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

      {formComp && (
        <ComparativoForm anuncio={formComp.anuncio} existente={formComp.existente} canal={canal} onFechar={() => setFormComp(null)}
          onSalvo={async () => { setFormComp(null); await carregarComparativos(); setVista("comparativo"); avisar("ok", "Comparativo salvo."); }} />
      )}

      {/* Avançado: só serve se o servidor conseguir ler o Mercado Livre (proxy pago ou API); Shopee e Amazon só entram pelo favorito */}
      {ehML && <details className={`${caixa}`} data-avancado>
        <summary className="cursor-pointer select-none px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span>⚙️ Avançado: leitura pelo servidor</span>
          <span className="text-[10px] font-semibold normal-case text-slate-500 tracking-normal">não precisa para o dia a dia — só funciona com proxy pago ou API do Mercado Livre</span>
        </summary>
        <div className="px-5 pb-5 space-y-4">
      <details className={`${caixa} group`} data-cadastro-categoria>
        <summary className="cursor-pointer select-none px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>➕ Cadastrar categoria pelo servidor</span>
          <span className="text-[10px] font-semibold normal-case text-slate-500 tracking-normal">só funciona se o servidor conseguir ler o Mercado Livre (veja “Testar conexão”)</span>
        </summary>
        <div className="px-5 pb-5 grid gap-3 md:grid-cols-[1fr_220px_auto] items-end">
          <label className="grid gap-1 text-[11px] font-bold text-slate-400">Link da categoria ou busca
            <input data-campo="url" value={urlCategoria} onChange={(e) => setUrlCategoria(e.target.value)} placeholder={info.exemploUrl} className={`${campo} w-full`} />
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-slate-400">Nome (opcional)
            <input data-campo="nome" value={nomeCategoria} onChange={(e) => setNomeCategoria(e.target.value)} placeholder="Ex.: Organizadores" className={`${campo} w-full`} />
          </label>
          <button data-acao="cadastrar" onClick={cadastrar} disabled={cadastrando || !urlCategoria.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>
            {cadastrando ? "Lendo anúncios…" : "Cadastrar e raspar"}
          </button>
        </div>
        {cadastrando && <p className="px-5 pb-4 -mt-2 text-xs text-slate-400">Isso pode levar até um minuto: a página é lida e cada anúncio é aberto para pegar vendedor e vendas.</p>}
      </details>

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
      </details>}
      {historicoPrecoDe && <HistoricoPrecoModal anuncio={historicoPrecoDe} mudancas={mudancasDe(historicoPrecoDe.id)} onFechar={() => setHistoricoPrecoDe(null)} />}
    </div>
  );
}
