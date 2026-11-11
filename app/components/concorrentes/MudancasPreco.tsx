"use client";
import React, { useMemo, useState } from "react";
import { diasAtras, mudancasDePreco, type Ponto } from "../../../lib/concorrentes/historico";
import { diaDaMudanca, juntarMudancas, type EventoPreco, type MudancaVista } from "../../../lib/concorrentes/precos";
import { brl, campo, caixa, dataBR, pct, type AcoesAnuncio, type Anuncio } from "./comum";
import Estrela from "./Estrela";
import { quandoDaMudanca } from "./PrecoDePor";

interface Evento extends MudancaVista { anuncio: Anuncio }

/** Sub-aba "Mudanças de preço": toda vez que o preço (PDV) de um anúncio monitorado foi diferente da captura anterior. */
export default function MudancasPreco({ anuncios, historico, eventos: registros, hoje, carregando, acoes }: {
  anuncios: Anuncio[]; historico: Record<string, Ponto[]>; eventos: Record<string, EventoPreco[]>; hoje: string; carregando: boolean; acoes: AcoesAnuncio;
}) {
  const [dias, setDias] = useState(30);
  const [tipo, setTipo] = useState<"todas" | "quedas" | "altas">("todas");
  const [soFavoritos, setSoFavoritos] = useState(false);

  const desde = diasAtras(hoje, dias);
  const eventos = useMemo(() => {
    const lista: Evento[] = [];
    for (const a of anuncios) {
      if (!a.ativo || (soFavoritos && !a.favorito)) continue;
      for (const m of juntarMudancas(registros[a.id] || [], mudancasDePreco(historico[a.id] || []))) {
        if (diaDaMudanca(m) < desde) continue;
        if (tipo === "quedas" && m.pct >= 0) continue;
        if (tipo === "altas" && m.pct <= 0) continue;
        lista.push({ ...m, anuncio: a });
      }
    }
    return lista.sort((x, y) => (y.comHora ? y.quando : `${y.quando}T00:00:00`).localeCompare(x.comHora ? x.quando : `${x.quando}T00:00:00`) || Math.abs(y.pct) - Math.abs(x.pct));
  }, [anuncios, historico, registros, desde, tipo, soFavoritos]);

  const resumo = useMemo(() => {
    const comMudanca = new Set(eventos.map((e) => e.anuncio.id));
    return { anuncios: comMudanca.size, quedas: eventos.filter((e) => e.pct < 0).length, altas: eventos.filter((e) => e.pct > 0).length, maiorQueda: eventos.reduce((m, e) => Math.min(m, e.pct), 0) };
  }, [eventos]);

  const capturasDistintas = useMemo(() => {
    const d = new Set<string>();
    for (const a of anuncios) for (const p of historico[a.id] || []) d.add(p.data);
    return d.size;
  }, [anuncios, historico]);

  return (
    <section className={`${caixa} p-4 space-y-3`} data-mudancas>
      <div className="flex flex-wrap items-center gap-2">
        <select data-campo="mud-periodo" value={dias} onChange={(e) => setDias(Number(e.target.value))} className={campo}>
          <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
        </select>
        <select data-campo="mud-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as any)} className={campo}>
          <option value="todas">Quedas e altas</option><option value="quedas">Só quedas de preço</option><option value="altas">Só altas de preço</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input data-campo="mud-favoritos" type="checkbox" checked={soFavoritos} onChange={(e) => setSoFavoritos(e.target.checked)} /> só favoritos
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-800 rounded-xl border border-slate-800" data-mud-resumo>
        {[["Anúncios com mudança", String(resumo.anuncios)], ["Quedas de preço", String(resumo.quedas)], ["Altas de preço", String(resumo.altas)], ["Maior queda", resumo.quedas ? pct(resumo.maiorQueda) : "—"]].map(([t, v]) => (
          <div key={t} className="px-4 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{t}</p><p className="text-lg font-black text-white">{v}</p></div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="py-2 pr-3 w-8" /><th className="py-2 pr-3">Quando</th><th className="py-2 pr-3">Anúncio</th><th className="py-2 pr-3 text-right">Era</th><th className="py-2 pr-3 text-right">Ficou</th><th className="py-2 pr-3 text-right">Variação</th><th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500">Carregando histórico…</td></tr>}
            {!carregando && eventos.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500" data-mud-vazio>
                {capturasDistintas < 2
                  ? "Ainda não há duas capturas em dias diferentes: o preço de hoje já está salvo e a comparação começa na próxima captura (importe ou atualize de novo amanhã)."
                  : "Nenhuma mudança de preço nesse período."}
              </td></tr>
            )}
            {eventos.map((e, i) => (
              <tr key={`${e.anuncio.id}-${e.quando}-${i}`} data-mudanca={e.anuncio.mlb_id} className="border-b border-slate-800/60">
                <td className="py-2 pr-3"><Estrela ativo={e.anuncio.favorito} onClick={() => acoes.alternarFavorito(e.anuncio)} /></td>
                <td data-quando className="py-2 pr-3 whitespace-nowrap text-slate-300">{quandoDaMudanca(e)}<span className="block text-[10px] text-slate-600">{e.comHora ? "hora da leitura" : `vs ${dataBR(e.anteriorEm)}`}</span></td>
                <td className="py-2 pr-3 max-w-[420px]">
                  <a href={e.anuncio.url_anuncio} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-100 hover:text-indigo-300 line-clamp-2">{e.anuncio.titulo}</a>
                  <span className="text-[10px] text-slate-500">{[e.anuncio.marca, e.anuncio.vendedor, e.anuncio.mlb_id].filter(Boolean).join(" · ")}</span>
                </td>
                <td className="py-2 pr-3 text-right text-slate-400 whitespace-nowrap">{brl(e.de)}</td>
                <td className="py-2 pr-3 text-right font-bold text-white whitespace-nowrap">{brl(e.para)}</td>
                <td data-variacao className={`py-2 pr-3 text-right font-black whitespace-nowrap ${e.pct < 0 ? "text-emerald-400" : "text-rose-400"}`}>{e.pct < 0 ? "▼" : "▲"} {pct(e.pct)}</td>
                <td className="py-2 text-right"><button data-acao="comparar" onClick={() => acoes.abrirComparativo(e.anuncio)} title="Marcar como igual a um anúncio meu" className="cursor-pointer text-base opacity-70 hover:opacity-100">{acoes.temComparativo(e.anuncio.id) ? "⚖️✓" : "⚖️"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">Cada linha é uma mudança do preço “Por” (o preço atual) entre duas leituras do mesmo anúncio. Desde que o registro por leitura foi ligado, várias mudanças no mesmo dia aparecem, com a hora em que o painel leu o preço (não a hora exata em que o concorrente mudou). Antes disso só havia a comparação entre dias. Se o preço subir e voltar entre duas leituras, não aparece.</p>
    </section>
  );
}
