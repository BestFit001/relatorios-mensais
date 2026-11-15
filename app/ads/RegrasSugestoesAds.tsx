"use client";
// Regras das Sugestões de Ads (automáticas), por canal. Usada nas Configurações de todos os canais.
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugCanal } from "../../lib/adsImportDb";
import { carregarCfgSug, salvarCfgSug } from "../../lib/adsMlDb";
import { CFG_SUG_PADRAO } from "../../lib/adsMlSugestoes";

export default function RegrasSugestoesAds({ canal, separador = false }: { canal: string; separador?: boolean }) {
  const slug = slugCanal(canal);
  const [sug, setSug] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(CFG_SUG_PADRAO).map(([k, v]) => [k, String(v)])));
  const [msgSug, setMsgSug] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    let ativo = true;
    carregarCfgSug(supabase, slug).then((c) => { if (ativo) setSug(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v).replace(".", ",")]))); });
    return () => { ativo = false; };
  }, [slug]);
  const salvarSug = async () => {
    const n = (k: string) => Number((sug[k] ?? "").replace(",", "."));
    const cfg = { vendasMin: n("vendasMin"), margemMinPct: n("margemMinPct"), taxaDevMaxPct: n("taxaDevMaxPct"), devMaxQtd: n("devMaxQtd"), impostoPct: n("impostoPct") };
    if (!(cfg.vendasMin >= 1) || [cfg.margemMinPct, cfg.taxaDevMaxPct, cfg.devMaxQtd, cfg.impostoPct].some((v) => !(v >= 0))) { setMsgSug({ ok: false, texto: "Informe números válidos (vendas mínimas ≥ 1 e os demais ≥ 0)." }); return; }
    const erro = await salvarCfgSug(supabase, slug, cfg);
    setMsgSug(erro ? { ok: false, texto: erro } : { ok: true, texto: "Regras das sugestões salvas." });
  };
  const campo = "bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white outline-none focus:border-purple-500 w-40";
  return (
  <div className={separador ? "mt-10 pt-8 border-t border-slate-800" : ""} data-config-sug-ml>
    <h2 className="text-lg font-bold text-white mb-1">💡 Regras das Sugestões de Ads — {canal}</h2>
    <p className="text-xs text-slate-400 mb-6">Um produto é indicado para o Ads quando passa em todas as regras abaixo e ainda não está no Ads.</p>
    <div className="flex flex-wrap gap-6 mb-6">
      {([["vendasMin", "Vendas mínimas no mês (un.)", "Poucas vendas = pouco dado."], ["margemMinPct", "Margem líquida mínima (%)", "Líquido ÷ receita, depois de custo e imposto."], ["taxaDevMaxPct", "Devoluções: taxa máxima (%)", "Devoluções ÷ unidades vendidas."], ["devMaxQtd", "Devoluções: máximo no mês (qtd.)", "Evita produtos que voltam com frequência."], ["impostoPct", "Imposto sobre a venda (%)", "Usado no cálculo do líquido."]] as const).map(([k, rotulo, dica]) => (
        <div key={k}>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{rotulo}</label>
          <input data-cfg-sug={k} inputMode="decimal" value={sug[k] ?? ""} onChange={(e) => setSug({ ...sug, [k]: e.target.value })} className={campo} />
          <p className="text-[10px] text-slate-500 mt-1 max-w-[220px]">{dica}</p>
        </div>
      ))}
    </div>
    <button type="button" data-salvar-cfg-sug onClick={salvarSug} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">Salvar regras</button>
    {msgSug && <span data-msg-cfg-sug className={`ml-4 text-xs font-bold ${msgSug.ok ? "text-emerald-400" : "text-rose-400"}`}>{msgSug.texto}</span>}
    <p className="text-[11px] text-slate-500 mt-4">As vendas vêm do upload do dashboard (repasse do canal), o custo da tabela de custos e as devoluções da aba Devoluções. Líquido = repasse − custo × unidades − imposto sobre a venda.</p>
  </div>
  );
}
