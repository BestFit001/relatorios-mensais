"use client";
import React from "react";
import { descontoPct, diaDaMudanca, emPromocao, quandoBR, type MudancaVista } from "../../../lib/concorrentes/precos";
import { brl, dataBR, pct, type Anuncio } from "./comum";

/** Preço do anúncio: em promoção mostra "De:" riscado e "Por:" (o preço atual, o que vale nas análises); sem promoção, só o preço. */
export function PrecoDePor({ a }: { a: Pick<Anuncio, "ultimo_preco" | "ultimo_preco_original"> }) {
  const promo = emPromocao(a.ultimo_preco, a.ultimo_preco_original);
  if (!promo) return <b data-preco-por className="text-white">{brl(a.ultimo_preco)}</b>;
  const d = descontoPct(a.ultimo_preco, a.ultimo_preco_original);
  return (
    <span data-promocao className="inline-flex flex-col items-end leading-tight">
      <span data-preco-de className="text-[11px] font-semibold text-slate-500 line-through" title="Preço de lista (riscado no anúncio)">De: {brl(a.ultimo_preco_original)}</span>
      <b data-preco-por className="text-white" title="Preço atual: é o que vale nas análises">Por: {brl(a.ultimo_preco)}</b>
      {d != null && <span data-desconto className="mt-0.5 rounded bg-emerald-950 border border-emerald-800 px-1 text-[10px] font-black text-emerald-300">−{d.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span>}
    </span>
  );
}

/** Texto de quando: "11/11 14:32" (leitura com hora) ou só o dia (histórico antigo). */
export const quandoDaMudanca = (m: Pick<MudancaVista, "quando" | "comHora">) => (m.comHora ? quandoBR(m.quando) : dataBR(m.quando));

/** Selo da última mudança de preço; clicar abre o histórico do anúncio. */
export function SeloMudanca({ m, onClick }: { m: MudancaVista; onClick?: () => void }) {
  return (
    <button type="button" data-mudou onClick={onClick} title={`Era ${brl(m.de)}${m.comHora ? " — a hora é a da leitura pelo painel" : ""}. Clique para ver o histórico de preço.`}
      className={`block ml-auto text-[10px] font-bold cursor-pointer hover:underline ${m.pct < 0 ? "text-emerald-400" : "text-rose-400"}`}>
      {m.pct < 0 ? "▼" : "▲"} {pct(m.pct)} · {quandoDaMudanca(m)}
    </button>
  );
}

/** Janela com todas as mudanças de preço vistas do anúncio (mais recente primeiro). */
export function HistoricoPrecoModal({ anuncio, mudancas, onFechar }: { anuncio: Anuncio; mudancas: MudancaVista[]; onFechar: () => void }) {
  const lista = [...mudancas].reverse();
  return (
    <div data-historico-preco className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onFechar}>
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Histórico de preço</h3>
            <p className="text-xs text-slate-400 line-clamp-2">{anuncio.titulo}</p>
          </div>
          <button data-acao="fechar-historico-preco" onClick={onFechar} className="text-slate-400 hover:text-white cursor-pointer text-lg leading-none">✕</button>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300">Agora: <PrecoDePor a={anuncio} /></div>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800"><th className="py-1.5 pr-3">Quando</th><th className="py-1.5 pr-3 text-right">Era</th><th className="py-1.5 pr-3 text-right">Ficou (Por)</th><th className="py-1.5 text-right">Variação</th></tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={4} data-historico-vazio className="py-6 text-center text-slate-500">Nenhuma mudança de preço vista até agora. O painel registra cada vez que lê o anúncio e o preço está diferente.</td></tr>}
              {lista.map((m, i) => (
                <tr key={`${m.quando}-${i}`} data-historico-linha className="border-b border-slate-800/60">
                  <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{quandoDaMudanca(m)}<span className="block text-[10px] text-slate-600">{diaDaMudanca(m) === m.quando ? "só o dia é conhecido" : "hora da leitura"}</span></td>
                  <td className="py-1.5 pr-3 text-right text-slate-400 whitespace-nowrap">{brl(m.de)}</td>
                  <td className="py-1.5 pr-3 text-right font-bold text-white whitespace-nowrap">{brl(m.para)}{m.original ? <span className="block text-[10px] font-normal text-slate-500 line-through">De: {brl(m.original)}</span> : null}</td>
                  <td className={`py-1.5 text-right font-black whitespace-nowrap ${m.pct < 0 ? "text-emerald-400" : "text-rose-400"}`}>{m.pct < 0 ? "▼" : "▲"} {pct(m.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-500">O painel só vê o preço quando lê o anúncio (captura diária, “Atualizar agora” ou o favorito). A hora mostrada é a da leitura, não a do momento exato em que o concorrente mudou o preço.</p>
      </div>
    </div>
  );
}
