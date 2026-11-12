"use client";
import React, { useMemo, useState } from "react";
import { tituloPendente } from "../../../lib/concorrentes/prioritarios";
import { mudancasDePreco, type Ponto } from "../../../lib/concorrentes/historico";
import { emPromocao, juntarMudancas, quandoBR, type EventoPreco } from "../../../lib/concorrentes/precos";
import { botao, brl, campo, caixa, chamar, type AcoesAnuncio, type Anuncio } from "./comum";
import AtualizarPeloNavegador from "./AtualizarPeloNavegador";
import MudancasPreco from "./MudancasPreco";
import { PrecoDePor, SeloMudanca } from "./PrecoDePor";

/** Sub-aba "Monitoramento prioritário": links diretos de anúncios acompanhados de perto (preço Por/De e cada mudança de preço). */
export default function Prioritarios({ canal, anuncios, historico, eventos, hoje, carregando, acoes, avisar, onRecarregar }: {
  canal: string; anuncios: Anuncio[]; historico: Record<string, Ponto[]>; eventos: Record<string, EventoPreco[]>; hoje: string; carregando: boolean;
  acoes: AcoesAnuncio; avisar: (tipo: "ok" | "erro", texto: string) => void; onRecarregar: () => void | Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [atualizarAberto, setAtualizarAberto] = useState(false);
  const ativos = useMemo(() => anuncios.filter((a) => a.ativo), [anuncios]);
  const resumo = useMemo(() => {
    const lidos = ativos.map((a) => a.lido_em).filter(Boolean) as string[];
    return {
      total: ativos.length,
      pendentes: ativos.filter((a) => tituloPendente(a.titulo)).length,
      promocao: ativos.filter((a) => emPromocao(a.ultimo_preco, a.ultimo_preco_original)).length,
      ultima: lidos.sort().pop() ?? null,
    };
  }, [ativos]);
  const ordenados = useMemo(() => [...ativos].sort((a, b) => (b.preco_mudou_em ?? "").localeCompare(a.preco_mudou_em ?? "") || a.titulo.localeCompare(b.titulo, "pt-BR")), [ativos]);
  const mudancasDe = (id: string) => juntarMudancas(eventos[id] || [], mudancasDePreco(historico[id] || []));

  const adicionar = async () => {
    setAdicionando(true);
    try {
      const r = await chamar("prioritarios", "POST", { texto, canal });
      setTexto("");
      await onRecarregar();
      const partes = [];
      if (r.adicionados) partes.push(`${r.adicionados} novo(s)`);
      if (r.marcados) partes.push(`${r.marcados} que já estavam no painel agora são prioritários`);
      if (r.reativados) partes.push(`${r.reativados} reativado(s)`);
      if (r.jaEram) partes.push(`${r.jaEram} já era(m) prioritário(s)`);
      if (r.invalidos?.length) partes.push(`${r.invalidos.length} link(s) inválido(s): ${r.invalidos[0].motivo}`);
      avisar(r.invalidos?.length && !r.adicionados && !r.marcados && !r.reativados ? "erro" : "ok", `${partes.join(", ")}.${r.adicionados ? " Os novos entram com o título provisório até a primeira leitura: use “Atualizar pelo navegador” abaixo." : ""}`);
      if (r.adicionados) setAtualizarAberto(true);
    } catch (e: any) { avisar("erro", e.message); }
    finally { setAdicionando(false); }
  };
  const remover = async (a: Anuncio) => {
    if (!window.confirm("Tirar este anúncio do Monitoramento prioritário? O histórico é mantido.")) return;
    try { await chamar("anuncios", "PATCH", { id: a.id, prioritario: false }); await onRecarregar(); avisar("ok", "Anúncio removido do Monitoramento prioritário."); }
    catch (e: any) { avisar("erro", e.message); }
  };

  return (
    <div className="space-y-5" data-prioritarios>
      <section className={`${caixa} p-4 space-y-3`}>
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">⭐ Adicionar anúncios para monitorar</h2>
          <p className="text-[11px] text-slate-500">Cole o link direto de cada anúncio (um por linha). O painel guarda o preço “Por” e o “De” a cada leitura e registra toda mudança de preço, com a hora. Anúncios que já estão em uma categoria só são marcados como prioritários.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <textarea data-campo="prioritarios-links" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder={"https://produto.mercadolivre.com.br/MLB-1234567890-nome-do-anuncio-_JM\nhttps://www.mercadolivre.com.br/nome/p/MLB12345678?wid=MLB1234567890"} className={`${campo} w-full font-mono text-xs`} />
          <button data-acao="adicionar-prioritarios" onClick={adicionar} disabled={adicionando || !texto.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>{adicionando ? "Adicionando…" : "Adicionar à lista"}</button>
        </div>
      </section>

      <div className={`${caixa} grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-800`} data-prio-resumo>
        {[
          ["Monitorados", String(resumo.total), "anúncios na lista"],
          ["Aguardando 1ª leitura", String(resumo.pendentes), resumo.pendentes ? "use Atualizar pelo navegador" : "tudo lido"],
          ["Em promoção", String(resumo.promocao), "com preço De riscado"],
          ["Última leitura", resumo.ultima ? quandoBR(resumo.ultima) : "—", "pelo navegador ou pelo servidor"],
        ].map(([t, v, d]) => (
          <div key={t} className="px-4 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{t}</p><p className="text-xl font-black text-white leading-tight">{v}</p><p className="text-[10px] text-slate-500">{d}</p></div>
        ))}
      </div>

      <AtualizarPeloNavegador canal={canal} anuncios={ativos} aberto={atualizarAberto} onAbrir={setAtualizarAberto} onAviso={avisar} onImportado={onRecarregar} titulo="🔄 Atualizar preços dos prioritários" />

      <section className={`${caixa} p-4 space-y-3`} data-tabela-prioritarios>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3 w-16">Imagem</th><th className="py-2 pr-3">Anúncio</th><th className="py-2 pr-3">Vendedor</th>
                <th className="py-2 pr-3 text-right">Preço atual</th><th className="py-2 pr-3 text-right">Preço anterior</th><th className="py-2 pr-3 text-right">Última leitura</th><th className="py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500">Carregando…</td></tr>}
              {!carregando && ordenados.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500" data-prio-vazio>Nenhum anúncio prioritário ainda. Cole os links acima.</td></tr>}
              {ordenados.map((a) => {
                const mud = mudancasDe(a.id).pop();
                const pendente = tituloPendente(a.titulo);
                return (
                  <tr key={a.id} data-prioritario-linha={a.mlb_id} className="border-b border-slate-800/60">
                    <td className="py-2 pr-3">
                      {a.url_imagem
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={a.url_imagem} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-12 h-12 object-contain rounded-md bg-white" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                        : <div className="w-12 h-12 rounded-md bg-slate-800 grid place-items-center text-slate-600">🖼️</div>}
                    </td>
                    <td className="py-2 pr-3 max-w-[420px]">
                      <a href={a.url_anuncio} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-100 hover:text-indigo-300 line-clamp-2">{a.titulo}</a>
                      <span className="block text-[10px] text-slate-500">{[a.marca, a.mlb_id].filter(Boolean).join(" · ")}</span>
                      {pendente && <span data-pendente className="text-[10px] font-bold text-amber-400">⏳ ainda não lido — use “Atualizar preços”</span>}
                    </td>
                    <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{a.vendedor || "—"}</td>
                    <td className="py-2 pr-3 text-right font-bold text-white whitespace-nowrap">
                      {a.ultimo_preco == null ? <span className="text-slate-500">—</span> : <PrecoDePor a={a} />}
                      {mud && <SeloMudanca m={mud} onClick={() => acoes.abrirHistoricoPreco(a)} />}
                    </td>
                    <td data-preco-anterior className="py-2 pr-3 text-right text-slate-400 whitespace-nowrap">{brl(a.preco_anterior)}</td>
                    <td className="py-2 pr-3 text-right text-slate-400 whitespace-nowrap text-xs">{a.lido_em ? quandoBR(a.lido_em) : "—"}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button data-acao="remover-prioritario" onClick={() => remover(a)} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">Remover</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-2">📉 Mudanças de preço dos prioritários</h2>
        <MudancasPreco anuncios={ativos} historico={historico} eventos={eventos} hoje={hoje} carregando={carregando} acoes={acoes} />
      </div>
    </div>
  );
}
