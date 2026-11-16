"use client";
// Acompanhamento de estoque de um canal: o time cola links de anúncios da concorrência, o painel lê o estoque todo dia
// (servidor quando o marketplace deixa; senão o favorito no navegador) e avisa "acabou na concorrência".
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { favoritoEstoqueHref, montarListaEstoque } from "../../../lib/estoqueConcorrencia/favorito";
import { avisoPendente, type Monitorado } from "../../../lib/estoqueConcorrencia/regras";
import { botao, campo, caixa } from "../concorrentes/comum";
import { canalEstoque } from "../../../lib/estoqueConcorrencia/links";

async function api<T = any>(rota: string, metodo: "POST" | "PATCH" | "DELETE", corpo: unknown): Promise<T> {
  const r = await fetch(`/api/estoque-concorrencia/${rota}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return j as T;
}

const FUSO = "America/Sao_Paulo";
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const dia = (iso: string) => iso.split("-").reverse().join("/");
type Filtro = "todos" | "acabou" | "em_estoque" | "sem_leitura" | "pausados";
type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

function SeloEstoque({ m }: { m: Monitorado }) {
  if (!m.ativo) return <span data-selo="pausado" className="inline-block px-2 py-1 rounded-md text-[11px] font-black bg-slate-800 text-slate-400">Pausado</span>;
  if (m.status === "esgotado") return <span data-selo="acabou" title={m.detalhe || ""} className="inline-block px-2 py-1 rounded-md text-[11px] font-black bg-rose-950 text-rose-300 border border-rose-800">🚨 Acabou</span>;
  if (m.status === "em_estoque") {
    const n = m.estoque === null ? "" : ` · ${m.estoque_aproximado ? "+" : ""}${m.estoque.toLocaleString("pt-BR")}`;
    return <span data-selo="em_estoque" title={m.detalhe || ""} className="inline-block px-2 py-1 rounded-md text-[11px] font-black bg-emerald-950 text-emerald-300 border border-emerald-800">Em estoque{n}</span>;
  }
  return <span data-selo="desconhecido" title={m.detalhe || "Ainda não foi lido"} className="inline-block px-2 py-1 rounded-md text-[11px] font-black bg-slate-800 text-slate-300">Ainda não lido</span>;
}

export default function EstoquePainel({ canal, nomeCanal, usuario }: { canal: string; nomeCanal: string; usuario: string }) {
  const [itens, setItens] = useState<Monitorado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [links, setLinks] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const infoCanal = canalEstoque(canal);
  const [historico, setHistorico] = useState<{ m: Monitorado; linhas: { data_captura: string; status: string; estoque: number | null }[] } | null>(null);
  const favoritoRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { favoritoRef.current?.setAttribute("href", favoritoEstoqueHref()); }, []);

  const carregar = useCallback(async () => {
    const todas: Monitorado[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("estoque_monitorados").select("*").eq("canal", canal).order("criado_em", { ascending: false }).range(de, de + 999);
      if (error) { setAviso({ tipo: "erro", texto: "Não consegui carregar os anúncios: " + error.message }); break; }
      todas.push(...((data as Monitorado[]) || []));
      if (!data || data.length < 1000) break;
    }
    setItens(todas); setCarregando(false);
  }, [canal]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const voltou = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", voltou);
    return () => document.removeEventListener("visibilitychange", voltou);
  }, [carregar]);

  const pendentes = useMemo(() => itens.filter(avisoPendente), [itens]);
  const contagem = useMemo(() => ({
    todos: itens.length, acabou: itens.filter((m) => m.ativo && m.status === "esgotado").length, em_estoque: itens.filter((m) => m.ativo && m.status === "em_estoque").length,
    sem_leitura: itens.filter((m) => m.ativo && m.status === "desconhecido").length, pausados: itens.filter((m) => !m.ativo).length,
  }), [itens]);
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter((m) => {
      if (filtro === "acabou" && !(m.ativo && m.status === "esgotado")) return false;
      if (filtro === "em_estoque" && !(m.ativo && m.status === "em_estoque")) return false;
      if (filtro === "sem_leitura" && !(m.ativo && m.status === "desconhecido")) return false;
      if (filtro === "pausados" && m.ativo) return false;
      return !t || [m.titulo, m.item_id, m.vendedor].some((v) => String(v ?? "").toLowerCase().includes(t));
    });
  }, [itens, filtro, busca]);
  const ativos = useMemo(() => itens.filter((m) => m.ativo), [itens]);

  const adicionar = async () => {
    setAdicionando(true); setAviso(null);
    try {
      const r = await api("itens", "POST", { canal, texto: links, por: usuario });
      const p: string[] = [];
      if (r.adicionados) p.push(`${r.adicionados} anúncio(s) adicionado(s)`);
      if (r.reativados) p.push(`${r.reativados} reativado(s)`);
      if (r.jaMonitorados) p.push(`${r.jaMonitorados} já estava(m) na lista`);
      if (r.invalidos?.length) p.push(`${r.invalidos.length} link(s) não aceito(s): ${r.invalidos.slice(0, 2).map((i: any) => `“${i.texto}” (${i.motivo})`).join("; ")}`);
      if (r.leitura?.bloqueado) p.push(`o ${nomeCanal} bloqueou a leitura pelo servidor: use o favorito abaixo para ler o estoque`);
      else if (r.leitura?.ok) p.push(`${r.leitura.ok} lido(s) agora`);
      setAviso({ tipo: r.invalidos?.length && !r.adicionados && !r.reativados ? "erro" : "ok", texto: p.join(" · ") + "." });
      if (!r.invalidos?.length) setLinks("");
      await carregar();
    } catch (e: any) { setAviso({ tipo: "erro", texto: e.message }); }
    finally { setAdicionando(false); }
  };

  const lerAgora = async () => {
    setLendo(true); setAviso(null);
    try {
      const r = await api("capturar", "POST", { canal });
      if (r.manual) setAviso({ tipo: "erro", texto: "O servidor está em modo manual (ML_ESTRATEGIA=manual): use o favorito para ler o estoque." });
      else if (r.bloqueado) setAviso({ tipo: "erro", texto: `O ${nomeCanal} bloqueou a leitura pelo servidor. Use “Ler pelo navegador” (favorito) logo abaixo: o seu navegador não é bloqueado.` });
      else setAviso({ tipo: r.falhas ? "erro" : "ok", texto: `${r.ok} anúncio(s) lido(s)${r.acabaram.length ? `, ${r.acabaram.length} acabou(aram)` : ""}${r.falhas ? `, ${r.falhas} com erro (${r.erros[0]?.motivo})` : ""}${r.pendentes ? `. Faltam ${r.pendentes}: clique de novo.` : "."}` });
      await carregar();
    } catch (e: any) { setAviso({ tipo: "erro", texto: e.message }); }
    finally { setLendo(false); }
  };

  const copiarLista = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(montarListaEstoque(ativos, canal))); setAviso({ tipo: "ok", texto: `Lista de ${ativos.length} anúncio(s) copiada. Abra uma página do ${nomeCanal} e clique no favorito “Ler estoque”.` }); }
    catch { setAviso({ tipo: "erro", texto: "Não consegui copiar a lista. Libere o acesso à área de transferência no navegador e tente de novo." }); }
  };
  const copiarFavorito = async () => {
    try { await navigator.clipboard.writeText(favoritoEstoqueHref()); setAviso({ tipo: "ok", texto: "Código do favorito copiado. Crie um favorito novo e cole no campo de endereço (URL)." }); }
    catch { setAviso({ tipo: "erro", texto: "Não consegui copiar. Arraste o botão para a barra de favoritos." }); }
  };
  const importar = async () => {
    setImportando(true); setAviso(null);
    try {
      const r = await api("importar", "POST", { texto });
      setTexto("");
      const p = [`${r.atualizados} anúncio(s) atualizado(s)`];
      if (r.acabaram.length) p.push(`🚨 acabou: ${r.acabaram.slice(0, 3).join(", ")}${r.acabaram.length > 3 ? "…" : ""}`);
      if (r.desconhecidos) p.push(`${r.desconhecidos} sem informação de estoque na página`);
      if (r.falhas) p.push(`${r.falhas} com erro`);
      if (r.ignorados) p.push(`${r.ignorados} não estão na lista (ignorado[s])`);
      setAviso({ tipo: "ok", texto: p.join(" · ") + "." });
      await carregar();
    } catch (e: any) { setAviso({ tipo: "erro", texto: e.message }); }
    finally { setImportando(false); }
  };

  const visto = async (ids: string[]) => {
    try { await api("itens", "PATCH", { ids, visto: true }); await carregar(); } catch (e: any) { setAviso({ tipo: "erro", texto: e.message }); }
  };
  const alternar = async (m: Monitorado) => {
    try { await api("itens", "PATCH", { id: m.id, ativo: !m.ativo }); await carregar(); } catch (e: any) { setAviso({ tipo: "erro", texto: e.message }); }
  };
  const remover = async (m: Monitorado) => {
    if (!confirm(`Parar de acompanhar “${m.titulo || m.item_id}” e apagar o histórico dele?`)) return;
    try { await api("itens", "DELETE", { id: m.id }); await carregar(); } catch (e: any) { setAviso({ tipo: "erro", texto: e.message }); }
  };
  const abrirHistorico = async (m: Monitorado) => {
    const { data } = await supabase.from("estoque_historico").select("data_captura,status,estoque").eq("monitorado_id", m.id).order("data_captura", { ascending: false }).limit(60);
    setHistorico({ m, linhas: (data as any[]) || [] });
  };

  const FILTROS: [Filtro, string][] = [["todos", "Todos"], ["acabou", "🚨 Acabou"], ["em_estoque", "Em estoque"], ["sem_leitura", "Ainda não lidos"], ["pausados", "Pausados"]];

  return (
    <div className="space-y-5" data-estoque-painel={canal}>
      {aviso && <div data-aviso-estoque role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${aviso.tipo === "ok" ? "border-emerald-800 bg-emerald-950/40 text-emerald-200" : "border-rose-800 bg-rose-950/40 text-rose-200"}`}>{aviso.texto}</div>}

      {pendentes.length > 0 && (
        <section data-alerta-acabou className="rounded-2xl border-2 border-rose-500/70 bg-rose-950/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-rose-200">🚨 Acabou na concorrência ({pendentes.length})</h2>
            <button type="button" data-visto-todos onClick={() => visto(pendentes.map((m) => m.id))} className={`${botao} bg-rose-900/60 text-rose-100 hover:bg-rose-800 !py-1.5`}>Marcar todos como vistos</button>
          </div>
          <ul className="space-y-2">
            {pendentes.map((m) => (
              <li key={m.id} data-acabou={m.item_id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-950/60 border border-rose-900/60 p-3">
                {m.url_imagem ? <img src={m.url_imagem} alt="" className="w-10 h-10 rounded-lg object-cover bg-white" /> : <span className="w-10 h-10 rounded-lg bg-slate-800" />}
                <div className="min-w-0 flex-1">
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="block text-sm font-bold text-white hover:underline truncate">{m.titulo || m.item_id}</a>
                  <p className="text-[11px] text-rose-200/80">Acabou o estoque{m.vendedor ? ` de ${m.vendedor}` : ""} · visto pelo painel em {dataHora(m.esgotou_em)}</p>
                </div>
                <button type="button" data-visto={m.item_id} onClick={() => visto([m.id])} className={`${botao} bg-slate-800 text-slate-200 hover:bg-slate-700 !py-1.5`}>Marcar como visto</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {infoCanal?.leitura === "generica" && (
        <div data-aviso-leitura-generica className="rounded-xl border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-xs text-amber-100/90">
          A leitura do {nomeCanal} ainda está sendo calibrada: o painel lê os dados da página e mostra o que encontrou (passe o mouse no selo de estoque). Se ficar “Ainda não lido”, o motivo aparece ali e a gente ajusta com o seu link real. Nada vira “Acabou” sem um sinal claro na página.
        </div>
      )}
      <section className={`${caixa} p-5 space-y-3`} data-adicionar-links>
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">Adicionar anúncios para acompanhar</h2>
        <textarea data-campo="links" value={links} onChange={(e) => setLinks(e.target.value)} rows={3} placeholder={`Cole um ou mais links de anúncios do ${nomeCanal} (um por linha)`} className={`${campo} w-full font-mono text-xs`} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" data-acao="adicionar" onClick={adicionar} disabled={adicionando || !links.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>{adicionando ? "Adicionando…" : "Adicionar e ler estoque"}</button>
          <span className="text-[11px] text-slate-500">{infoCanal?.dica || "Aceita o link copiado do site do jeito que vem."}{canal === "mercadolivre" && " Inclusive os de “catálogo” com …/up/MLBU…?pdp_filters=item_id:MLB…."}</span>
        </div>
      </section>

      <section className={`${caixa} p-5 space-y-3`} data-leitura>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" data-acao="ler-agora" onClick={lerAgora} disabled={lendo || !ativos.length} className={`${botao} bg-slate-800 text-slate-100 hover:bg-slate-700`}>{lendo ? "Lendo…" : "🔄 Ler agora pelo servidor"}</button>
          <p className="text-[11px] text-slate-500 flex-1 min-w-[240px]">Todo dia, por volta das 6h (Brasília), o servidor lê o estoque de todos os anúncios ativos. Se o {nomeCanal} bloquear o servidor, leia pelo navegador (abaixo): ele não é bloqueado.</p>
        </div>
        <details open={aberto} onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)} data-ler-navegador>
          <summary className="cursor-pointer select-none text-xs font-black uppercase tracking-wider text-slate-300">🧭 Ler pelo navegador (favorito “Ler estoque”)</summary>
          <div className="pt-3 space-y-3">
            <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
              <li>
                Arraste este botão para a barra de favoritos (uma vez só):{" "}
                <a ref={favoritoRef} data-estoque-favorito onClick={(e) => e.preventDefault()} draggable className="inline-block align-middle px-3 py-1.5 rounded-lg bg-rose-700 text-white text-[11px] font-black uppercase tracking-wider cursor-grab">Ler estoque</a>{" "}
                <button type="button" onClick={copiarFavorito} className="text-[11px] underline text-slate-300 hover:text-white cursor-pointer">não consegui arrastar</button>
              </li>
              <li><button type="button" data-acao="copiar-lista" onClick={copiarLista} disabled={!ativos.length} className={`${botao} bg-slate-800 text-slate-200 hover:bg-slate-700 !py-1.5`}>📋 Copiar lista ({ativos.length} anúncio{ativos.length === 1 ? "" : "s"})</button></li>
              <li>Abra uma página do {nomeCanal} (no mesmo endereço dos links, ex.: {(() => { try { return new URL(ativos[0]?.url || "").hostname; } catch { return "o site do canal"; } })()}) e clique em <b>Ler estoque</b>: ele abre cada anúncio, lê o estoque e copia o resultado.</li>
              <li>Volte aqui, cole o resultado abaixo e clique em Importar.</li>
            </ol>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
              <label className="grid gap-1 text-[11px] font-bold text-slate-400">Resultado da leitura
                <textarea data-campo="estoque-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={`{"v":1,"canal":"${canal}","tipo":"estoque",…}`} className={`${campo} w-full font-mono text-[11px]`} />
              </label>
              <button type="button" data-acao="importar-estoque" onClick={importar} disabled={importando || !texto.trim()} className={`${botao} bg-rose-700 text-white hover:bg-rose-600`}>{importando ? "Importando…" : "Importar leitura"}</button>
            </div>
          </div>
        </details>
      </section>

      <section className={`${caixa} p-5`} data-lista-estoque>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FILTROS.map(([id, nome]) => (
            <button key={id} type="button" data-filtro={id} onClick={() => setFiltro(id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${filtro === id ? "bg-indigo-600 border-indigo-400 text-white" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white"}`}>{nome} ({contagem[id]})</button>
          ))}
          <input data-campo="busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, vendedor ou código" className={`${campo} ml-auto w-full md:w-72 !py-1.5 text-xs`} />
        </div>
        {carregando ? <p className="text-sm text-slate-400 py-8 text-center">Carregando…</p>
          : itens.length === 0 ? <p data-vazio className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-800 rounded-xl">Nenhum anúncio acompanhado ainda. Cole os links acima.</p>
          : visiveis.length === 0 ? <p className="text-sm text-slate-500 py-8 text-center">Nada neste filtro.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800"><th className="py-2 pr-3">Anúncio</th><th className="py-2 px-3">Estoque</th><th className="py-2 px-3">Situação</th><th className="py-2 px-3">Última leitura</th><th className="py-2 pl-3 text-right">Ações</th></tr></thead>
                <tbody>
                  {visiveis.map((m) => (
                    <tr key={m.id} data-linha-estoque={m.item_id} className={`border-b border-slate-800/60 ${m.ativo ? "" : "opacity-60"}`}>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          {m.url_imagem ? <img src={m.url_imagem} alt="" className="w-10 h-10 rounded-lg object-cover bg-white shrink-0" /> : <span className="w-10 h-10 rounded-lg bg-slate-800 shrink-0" />}
                          <div className="min-w-0">
                            <a href={m.url} target="_blank" rel="noopener noreferrer" className="block font-bold text-slate-100 hover:underline max-w-[420px] truncate" title={m.titulo || m.item_id}>{m.titulo || "Anúncio ainda não lido"}</a>
                            <span className="block text-[10px] text-slate-500 font-mono">{m.item_id}{m.vendedor ? ` · ${m.vendedor}` : ""}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3"><SeloEstoque m={m} /></td>
                      <td className="py-3 px-3 text-slate-400">
                        {m.status === "esgotado" && m.esgotou_em ? <>acabou em {dataHora(m.esgotou_em)}</> : m.voltou_em ? <>voltou em {dataHora(m.voltou_em)}</> : "—"}
                        {avisoPendente(m) && <span className="ml-1 text-rose-300 font-bold">· aviso aberto</span>}
                        {m.status === "desconhecido" && m.detalhe && <span data-detalhe-leitura title={m.detalhe} className="block text-[10px] text-amber-300/90 max-w-[260px] line-clamp-3 mt-0.5">{m.detalhe}</span>}
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        {dataHora(m.lido_em)}
                        {m.erro && <span data-erro-leitura title={m.erro} className="block text-[10px] text-amber-300 max-w-[220px] truncate">⚠ {m.erro}</span>}
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        <button type="button" data-historico={m.item_id} onClick={() => abrirHistorico(m)} title="Histórico de leituras" className="px-2 py-1 text-slate-400 hover:text-white cursor-pointer">📈</button>
                        <button type="button" data-pausar={m.item_id} onClick={() => alternar(m)} title={m.ativo ? "Pausar o acompanhamento" : "Retomar o acompanhamento"} className="px-2 py-1 text-slate-400 hover:text-white cursor-pointer">{m.ativo ? "⏸" : "▶"}</button>
                        <button type="button" data-remover={m.item_id} onClick={() => remover(m)} title="Remover da lista" className="px-2 py-1 text-slate-400 hover:text-rose-300 cursor-pointer">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      {historico && (
        <div className="fixed inset-0 z-[9500] bg-black/70 flex items-center justify-center p-4" data-modal-historico onClick={() => setHistorico(null)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div><h3 className="text-sm font-black text-white">Histórico de leituras</h3><p className="text-[11px] text-slate-400 line-clamp-2">{historico.m.titulo || historico.m.item_id}</p></div>
              <button type="button" onClick={() => setHistorico(null)} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar">✕</button>
            </div>
            {historico.linhas.length === 0 ? <p className="text-xs text-slate-500">Ainda não há leituras.</p> : (
              <table className="w-full text-xs"><thead><tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800"><th className="py-1.5">Dia</th><th>Situação</th><th className="text-right">Estoque</th></tr></thead>
                <tbody>{historico.linhas.map((h) => (
                  <tr key={h.data_captura} className="border-b border-slate-800/60"><td className="py-1.5 text-slate-300">{dia(h.data_captura)}</td><td className={h.status === "esgotado" ? "text-rose-300 font-bold" : "text-emerald-300"}>{h.status === "esgotado" ? "Acabou" : "Em estoque"}</td><td className="text-right text-slate-300">{h.estoque ?? "—"}</td></tr>
                ))}</tbody></table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
