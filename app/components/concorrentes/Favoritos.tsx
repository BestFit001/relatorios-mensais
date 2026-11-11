"use client";
import React, { useMemo } from "react";
import { mediaVendasPorDia, mudancasDePreco, resumoDePreco, type Ponto } from "../../../lib/concorrentes/historico";
import { brl, caixa, dataBR, num, pct, totalVendido, type AcoesAnuncio, type Anuncio, type Categoria } from "./comum";
import Estrela from "./Estrela";
import Sparkline from "./Sparkline";
import TagRanking from "./TagRanking";

/** Sub-aba "Favoritos": os anúncios marcados com ★ em todas as categorias, lado a lado. */
export default function Favoritos({ favoritos, categorias, historico, carregando, acoes, onAbrirCategoria }: {
  favoritos: Anuncio[]; categorias: Categoria[]; historico: Record<string, Ponto[]>; carregando: boolean; acoes: AcoesAnuncio; onAbrirCategoria: (id: string) => void;
}) {
  const nomeDa = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);
  const linhas = useMemo(() => favoritos.map((a) => {
    const h = historico[a.id] || [];
    const m = mudancasDePreco(h);
    return { a, h, preco: resumoDePreco(h), media: mediaVendasPorDia(h), ultima: m[m.length - 1] || null };
  }), [favoritos, historico]);

  return (
    <section className={`${caixa} p-4 space-y-3`} data-favoritos>
      <p className="text-xs text-slate-400">Anúncios marcados com ★ em qualquer categoria. Preço mínimo, máximo e evolução vêm das capturas dos últimos 90 dias.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="py-2 pr-3 w-8" /><th className="py-2 pr-3">Anúncio</th><th className="py-2 pr-3 text-right">Preço atual</th><th className="py-2 pr-3 text-right">Mín. – máx.</th>
              <th className="py-2 pr-3">Evolução</th><th className="py-2 pr-3 text-right">Total vendido</th><th className="py-2 pr-3 text-right">Média/dia (est.)</th><th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={8} className="py-8 text-center text-xs text-slate-500">Carregando favoritos…</td></tr>}
            {!carregando && linhas.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-xs text-slate-500" data-fav-vazio>Nenhum favorito ainda. Clique na ☆ de um anúncio, na aba Anúncios, para acompanhá-lo aqui.</td></tr>}
            {linhas.map(({ a, h, preco, media, ultima }) => (
              <tr key={a.id} data-favorito-linha={a.mlb_id} className={`border-b border-slate-800/60 ${a.ativo ? "" : "opacity-50"}`}>
                <td className="py-2 pr-3"><Estrela ativo={a.favorito} onClick={() => acoes.alternarFavorito(a)} /></td>
                <td className="py-2 pr-3 max-w-[380px]">
                  <div className="flex items-center gap-3">
                    {a.url_imagem
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={a.url_imagem} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-10 h-10 object-contain rounded-md bg-white shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                      : <div className="w-10 h-10 rounded-md bg-slate-800 shrink-0" />}
                    <div className="min-w-0">
                      <a href={a.url_anuncio} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-100 hover:text-indigo-300 line-clamp-2">{a.titulo}</a>
                      <TagRanking a={a} />
                      <span className="block text-[10px] text-slate-500">
                        {[a.marca, a.vendedor].filter(Boolean).join(" · ")}{(a.marca || a.vendedor) ? " · " : ""}
                        <button onClick={() => onAbrirCategoria(a.categoria_id)} className="underline hover:text-slate-300 cursor-pointer">{nomeDa.get(a.categoria_id) || "categoria"}</button>
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  <b className="text-white">{brl(a.ultimo_preco)}</b>
                  {ultima && <span className={`block text-[10px] font-bold ${ultima.pct < 0 ? "text-emerald-400" : "text-rose-400"}`} title={`de ${brl(ultima.de)} em ${dataBR(ultima.dataAnterior)}`}>{ultima.pct < 0 ? "▼" : "▲"} {pct(ultima.pct)} em {dataBR(ultima.data)}</span>}
                </td>
                <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap text-xs">{preco.capturas > 1 ? `${brl(preco.minimo)} – ${brl(preco.maximo)}` : "—"}</td>
                <td className="py-2 pr-3"><Sparkline pontos={h} /></td>
                <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap" title={a.ultimo_aproximado ? "Faixa informada pelo canal (+N vendidos)" : undefined}>{totalVendido(a)}</td>
                <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap" title="Total de hoje − total da 1ª captura, dividido pelos dias entre elas">{media ? `${media.aproximado ? "≈ " : ""}${media.porDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : "—"}{media && <span className="block text-[10px] text-slate-600">em {num(media.dias)} dias</span>}</td>
                <td className="py-2 text-right"><button data-acao="comparar" onClick={() => acoes.abrirComparativo(a)} title="Marcar como igual a um anúncio meu" className="cursor-pointer text-base opacity-70 hover:opacity-100">{acoes.temComparativo(a.id) ? "⚖️✓" : "⚖️"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
