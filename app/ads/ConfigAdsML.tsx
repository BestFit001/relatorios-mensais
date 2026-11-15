"use client";
// Regras das recomendações do Adsense do Mercado Livre.
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugCanal } from "../../lib/adsImportDb";
import { CFG_ML_PADRAO, IMPOSTO_ML, EMBALAGEM_ML_UN, type CfgRecomendacao } from "../../lib/adsMl";
import { carregarCfgML, salvarCfgML } from "../../lib/adsMlDb";
import RegrasSugestoesAds from "./RegrasSugestoesAds";

export default function ConfigAdsML({ canal }: { canal: string }) {
  const slug = slugCanal(canal);
  const [invMinimo, setInvMinimo] = useState(String(CFG_ML_PADRAO.invMinimo));
  const [roiEscalar, setRoiEscalar] = useState(String(CFG_ML_PADRAO.roiEscalar));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    let ativo = true;
    carregarCfgML(supabase, slug).then((c) => { if (ativo) { setInvMinimo(String(c.invMinimo).replace(".", ",")); setRoiEscalar(String(c.roiEscalar).replace(".", ",")); } });
    return () => { ativo = false; };
  }, [slug]);
  const salvar = async () => {
    const cfg: CfgRecomendacao = { invMinimo: Number(invMinimo.replace(",", ".")), roiEscalar: Number(roiEscalar.replace(",", ".")) };
    if (!(cfg.invMinimo >= 0) || !(cfg.roiEscalar > 0)) { setMsg({ ok: false, texto: "Informe números válidos (investimento mínimo ≥ 0 e ROI para escalar > 0)." }); return; }
    const erro = await salvarCfgML(supabase, slug, cfg);
    setMsg(erro ? { ok: false, texto: erro } : { ok: true, texto: "Configurações salvas." });
  };
  const campo = "bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white outline-none focus:border-purple-500 w-40";
  return (
    <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl max-w-3xl" data-config-ml>
      <h2 className="text-lg font-bold text-white mb-1">⚙️ Recomendações dos anúncios — {canal}</h2>
      <p className="text-xs text-slate-400 mb-6">Defina quando o app deve sugerir escalar, manter ou retirar um anúncio patrocinado.</p>
      <div className="flex flex-wrap gap-6 mb-6">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Investimento mínimo para julgar (R$)</label>
          <input data-cfg-inv-minimo inputMode="decimal" value={invMinimo} onChange={(e) => setInvMinimo(e.target.value)} className={campo} />
          <p className="text-[10px] text-slate-500 mt-1 max-w-[220px]">Abaixo disso o anúncio fica em “Aguardar”, por falta de dado.</p>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">ROI para escalar (%)</label>
          <input data-cfg-roi-escalar inputMode="decimal" value={roiEscalar} onChange={(e) => setRoiEscalar(e.target.value)} className={campo} />
          <p className="text-[10px] text-slate-500 mt-1 max-w-[220px]">A partir deste ROI o anúncio é sugerido para aumentar o investimento.</p>
        </div>
      </div>
      <button type="button" data-salvar-cfg-ml onClick={salvar} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider cursor-pointer">Salvar</button>
      {msg && <span data-msg-cfg-ml className={`ml-4 text-xs font-bold ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.texto}</span>}

      <RegrasSugestoesAds canal={canal} separador />

      <div className="mt-8 text-xs text-slate-400 space-y-2">
        <h3 className="text-sm font-bold text-white">Como o app decide</h3>
        <p><strong className="text-rose-300">Retirar do Ads:</strong> gastou e não vendeu, ou a liquidez é negativa com ROI de -50% ou pior.</p>
        <p><strong className="text-amber-300">Revisar:</strong> liquidez levemente negativa (ROI acima de -50%): ajuste lance, preço ou orçamento.</p>
        <p><strong className="text-emerald-300">Escalar / Manter:</strong> liquidez positiva; escalar quando o ROI passa do valor acima.</p>
        <p><strong className="text-violet-300">Reativar:</strong> deu lucro mas o anúncio está pausado ou desativado.</p>
        <p><strong className="text-slate-300">Aguardar:</strong> investimento abaixo do mínimo.</p>
        <p className="pt-2 text-slate-500">A liquidez usa o custo do SKU ligado ao MLB no cadastro de anúncios do ML, a comissão do MLB, o frete pela tabela do ML, {(IMPOSTO_ML * 100).toLocaleString("pt-BR")}% de imposto e R$ {EMBALAGEM_ML_UN.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de embalagem por unidade — a mesma conta dos lançamentos manuais do canal.</p>
      </div>
    </div>
  );
}
