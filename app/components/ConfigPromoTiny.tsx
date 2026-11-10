"use client";
import React, { useEffect, useState } from "react";
import { lerArquivoComoLinhas } from "../../lib/lerArquivo";
import {
  carregarConfigPromoTiny, salvarConfigPromoTiny, PADRAO_PROMO_TINY,
  indiceColuna, letraDaColuna, saldoParaNumero, type ConfigPromoTiny,
} from "../../lib/promoTiny";

/**
 * Sub-aba "Configurações" das Promoções: em que coluna da planilha de estoque do Tiny estão o SKU e o saldo.
 * A mesma configuração vale para Mercado Livre, Magalu, Shopee e TikTok. `onSalvo` avisa a página para reler.
 */
export default function ConfigPromoTiny({ onSalvo, conta }: { onSalvo?: (cfg: ConfigPromoTiny) => void; conta?: { chave: string; rotulo: string } }) {
  const [sku, setSku] = useState(PADRAO_PROMO_TINY.sku);
  const [estoque, setEstoque] = useState(PADRAO_PROMO_TINY.estoque);
  const [salvo, setSalvo] = useState<ConfigPromoTiny>(PADRAO_PROMO_TINY);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [exemplo, setExemplo] = useState<{ nome: string; linhas: any[][]; colunas: number } | null>(null);

  const chaveConta = conta?.chave;
  useEffect(() => {
    setCarregando(true); setMsg(null); setExemplo(null);
    carregarConfigPromoTiny(chaveConta).then((c) => { setSku(c.sku); setEstoque(c.estoque); setSalvo(c); }).finally(() => setCarregando(false));
  }, [chaveConta]);

  const mudou = sku.trim().toUpperCase() !== salvo.sku || estoque.trim().toUpperCase() !== salvo.estoque;

  const salvar = async () => {
    setMsg(null);
    try {
      const nova = { sku: sku.trim().toUpperCase(), estoque: estoque.trim().toUpperCase() };
      await salvarConfigPromoTiny(nova, chaveConta);
      setSku(nova.sku); setEstoque(nova.estoque); setSalvo(nova);
      setMsg({ ok: true, texto: `Salvo: SKU na coluna ${nova.sku}, estoque na coluna ${nova.estoque}. ${conta ? `Vale para ${conta.rotulo}.` : "Vale para as quatro abas de promoção."}` });
      onSalvo?.(nova);
    } catch (e: any) {
      setMsg({ ok: false, texto: "Não salvei: " + e.message });
    }
  };

  const lerExemplo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    try {
      const linhas = await lerArquivoComoLinhas(arq);
      const colunas = linhas.reduce((m, l) => Math.max(m, l?.length || 0), 0);
      setExemplo({ nome: arq.name, linhas: linhas.slice(0, 8), colunas: Math.min(colunas, 26) });
    } catch (err: any) {
      setExemplo(null);
      setMsg({ ok: false, texto: "Não consegui ler a planilha: " + err.message });
    }
    try { e.target.value = ""; } catch { /* ignora */ }
  };

  const iSku = indiceColuna(sku), iEst = indiceColuna(estoque);
  const campo = "w-20 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-center font-mono font-bold text-white uppercase outline-none focus:border-purple-500";

  return (
    <div className="space-y-5 max-w-4xl" data-config-promo-tiny>
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-sm font-black text-purple-300 uppercase tracking-wider">Planilha de estoque do Tiny{conta ? ` — ${conta.rotulo}` : ""}</h2>
          <p className="text-xs text-slate-400 mt-1">
            Diga em que coluna da planilha de inventário do Tiny ficam o <b>SKU</b> e o <b>saldo em estoque</b>.{" "}
            {conta
              ? <>É a mesma planilha de estoque para todas as contas, então esta configuração vale para <b>{conta.rotulo}</b>. Só o que tem saldo maior que zero é precificado.</>
              : <>A mesma configuração vale para Mercado Livre, Magalu, Shopee e TikTok: só o que tem saldo maior que zero é precificado.</>}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna do SKU</label>
            <input data-cfg-sku value={sku} maxLength={3} onChange={(e) => setSku(e.target.value.toUpperCase())} className={campo} disabled={carregando} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Coluna do estoque (saldo)</label>
            <input data-cfg-estoque value={estoque} maxLength={3} onChange={(e) => setEstoque(e.target.value.toUpperCase())} className={campo} disabled={carregando} />
          </div>
          <button
            onClick={salvar}
            disabled={carregando || !mudou}
            className="px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wide shadow"
          >
            Salvar
          </button>
          <button
            onClick={() => { setSku(PADRAO_PROMO_TINY.sku); setEstoque(PADRAO_PROMO_TINY.estoque); }}
            className="px-3 py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-[11px] font-bold"
          >
            Voltar ao padrão (C e F)
          </button>
        </div>
        {msg && <p data-cfg-msg className={`text-xs font-bold ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.ok ? "✓ " : "⚠️ "}{msg.texto}</p>}
        {!msg && !mudou && !carregando && <p className="text-[11px] text-slate-500">Em uso: SKU na coluna <b className="text-slate-300">{salvo.sku}</b>, estoque na coluna <b className="text-slate-300">{salvo.estoque}</b>.</p>}
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3">
        <div>
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider">Conferir com a sua planilha</h3>
          <p className="text-[11px] text-slate-500 mt-1">Abra aqui o inventário do Tiny só para ver as colunas e conferir se as letras acima estão certas. Nada é gravado.</p>
        </div>
        <label className="inline-block cursor-pointer px-4 py-2 rounded-lg border border-dashed border-slate-600 hover:border-purple-500 text-xs font-bold text-slate-300">
          Escolher planilha de estoque
          <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={lerExemplo} className="hidden" data-cfg-exemplo />
        </label>
        {exemplo && (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400">{exemplo.nome} — primeiras linhas. Em destaque: <span className="text-purple-300 font-bold">SKU</span> e <span className="text-emerald-300 font-bold">estoque</span>.</p>
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="text-[11px] w-full">
                <thead>
                  <tr className="bg-slate-950">
                    <th className="px-2 py-1.5 text-slate-600 w-8">#</th>
                    {Array.from({ length: exemplo.colunas }, (_, c) => (
                      <th key={c} className={`px-2 py-1.5 font-mono ${c === iSku ? "bg-purple-600/30 text-purple-200" : c === iEst ? "bg-emerald-600/30 text-emerald-200" : "text-slate-500"}`}>
                        {letraDaColuna(c)}{c === iSku ? " · SKU" : c === iEst ? " · estoque" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exemplo.linhas.map((l, r) => (
                    <tr key={r} className="border-t border-slate-800">
                      <td className="px-2 py-1 text-slate-600 text-center">{r + 1}</td>
                      {Array.from({ length: exemplo.colunas }, (_, c) => (
                        <td key={c} className={`px-2 py-1 whitespace-nowrap max-w-[180px] truncate ${c === iSku ? "bg-purple-600/10 text-purple-100" : c === iEst ? "bg-emerald-600/10 text-emerald-100" : "text-slate-400"}`}>
                          {String(l?.[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const dados = exemplo.linhas.filter((l) => l && String(l[iSku] ?? "").trim() && saldoParaNumero(l[iEst]) !== null && String(l[iEst] ?? "").trim() !== "");
              return dados.length
                ? <p className="text-[11px] text-emerald-400 font-bold">✓ Coluna {sku}/{estoque}: {dados.length} das primeiras {exemplo.linhas.length} linhas têm SKU e um saldo numérico.</p>
                : <p className="text-[11px] text-amber-400 font-bold">⚠️ Nas primeiras linhas, a coluna {sku} (SKU) e a coluna {estoque} (saldo) não trazem um SKU com número. Confira as letras.</p>;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
