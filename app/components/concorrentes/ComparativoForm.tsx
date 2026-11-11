"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { CANAIS_ANALISE } from "../../../lib/analiseMercado";
import { CANAIS, nomeDoCanal } from "../../../lib/concorrentes/canais";
import { CANAIS_COMPARATIVO, canalDoCadastro, comModalidade } from "../../../lib/concorrentes/comparativo";
import { botao, brl, campo, chamar, type Anuncio, type Comparativo } from "./comum";

const mlbDoLink = (t: string) => { const m = /MLB-?(\d{6,})/i.exec(t); return m ? `MLB${m[1]}` : null; };
const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const modalidadeDe = (canal: string): "Clássico" | "Premium" => (canal.endsWith("Premium") ? "Premium" : "Clássico");

/** Janela "Marcar como igual a um anúncio meu": link + SKU (+ modalidade e preço) do meu anúncio. */
export default function ComparativoForm({ anuncio, existente, canal = "mercadolivre", onFechar, onSalvo }: {
  anuncio: Anuncio; existente: Comparativo | null; canal?: string; onFechar: () => void; onSalvo: (c: Comparativo) => void;
}) {
  const ehML = canal === "mercadolivre";
  // no ML o concorrente escolhe só Clássico/Premium; Shopee e Amazon têm um canal só, e o meu anúncio pode estar em qualquer canal da Análise de mercado
  const canalDoConcorrente = CANAIS.find((c) => c.id === canal)?.canalAnalise || "Mercado Livre 1 Clássico";
  const [link, setLink] = useState(existente?.meu_url || "");
  const [sku, setSku] = useState(existente?.sku || "");
  const [canalMeu, setCanalMeu] = useState<string>(existente?.canal_meu || canalDoConcorrente);
  const [modConc, setModConc] = useState<"Clássico" | "Premium">(modalidadeDe(existente?.canal_concorrente || existente?.canal_meu || "Clássico"));
  const [preco, setPreco] = useState(existente?.meu_preco != null ? String(existente.meu_preco).replace(".", ",") : "");
  const [texto, setTexto] = useState("");
  const [custoManual, setCustoManual] = useState(existente?.custo_manual != null ? String(existente.custo_manual).replace(".", ",") : "");
  const [achado, setAchado] = useState<string | null>(null);
  const [custo, setCusto] = useState<{ achou: boolean; valor?: number; produto?: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [skuMexido, setSkuMexido] = useState(Boolean(existente));

  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [onFechar]);

  // o link do meu anúncio já pode estar no cadastro de anúncios (ml_anuncios_regras): preenche SKU e modalidade
  useEffect(() => {
    const mlb = mlbDoLink(link);
    if (!mlb) { setAchado(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from("ml_anuncios_regras").select("sku,comissao,canal").eq("mlb", mlb).limit(1);
      if (!vivo) return;
      const r = data?.[0];
      if (!r) { setAchado(null); return; }
      const canalMl = canalDoCadastro(r);
      setAchado(`Achei esse anúncio no seu cadastro: SKU ${r.sku}, ${canalMl}.`);
      if (!skuMexido) setSku(String(r.sku || ""));
      if (!existente) { setCanalMeu(canalMl); setModConc(modalidadeDe(canalMl)); }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  // custo do SKU
  useEffect(() => {
    const s = sku.trim();
    if (!s) { setCusto(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from("tabela_custos_skus").select("sku,produto,custo_unitario").ilike("sku", escLike(s)).limit(1);
      if (!vivo) return;
      const r = data?.[0];
      setCusto(r && r.custo_unitario != null ? { achou: true, valor: Number(r.custo_unitario), produto: r.produto } : { achou: false });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [sku]);

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      const r = await chamar<{ comparativo: Comparativo }>("comparativos", "POST", {
        anuncio_id: anuncio.id, sku, meu_url: link || undefined, texto: texto || undefined, meu_preco: preco || undefined,
        canal_meu: canalMeu, canal_concorrente: ehML ? comModalidade(canalMeu, modConc) : canalDoConcorrente, custo_manual: custo?.achou ? undefined : custoManual || undefined,
      });
      onSalvo(r.comparativo);
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  };

  const rotulo = "grid gap-1 text-[11px] font-bold text-slate-400";
  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" data-comparativo-form onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4" role="dialog" aria-modal="true" aria-label="Marcar como igual a um anúncio meu">
        <div>
          <h2 className="text-sm font-black text-white">⚖️ Igual a um anúncio meu</h2>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">Concorrente: {anuncio.titulo} — {brl(anuncio.ultimo_preco)}</p>
        </div>

        <label className={rotulo}>Link do meu anúncio
          <input data-campo="cmp-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder={ehML ? "https://produto.mercadolivre.com.br/MLB-…" : "Link do seu anúncio (Mercado Livre, Shopee ou Amazon)"} className={`${campo} w-full`} />
        </label>
        {achado && <p className="text-[11px] text-emerald-400" data-cmp-achado>{achado}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={rotulo}>SKU do meu produto
            <input data-campo="cmp-sku" value={sku} onChange={(e) => { setSku(e.target.value); setSkuMexido(true); }} placeholder="Ex.: 17385002086" className={`${campo} w-full`} />
          </label>
          <label className={rotulo}>Meu preço atual (R$)
            <input data-campo="cmp-preco" value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="Ex.: 59,90" className={`${campo} w-full`} />
          </label>
          <label className={rotulo}>{ehML ? "Minha modalidade" : "Meu canal"}
            <select data-campo="cmp-canal" value={canalMeu} onChange={(e) => setCanalMeu(e.target.value)} className={`${campo} w-full`}>
              {(ehML ? [...CANAIS_COMPARATIVO] : CANAIS_ANALISE).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {ehML ? (
            <label className={rotulo}>Modalidade do concorrente
              <select data-campo="cmp-mod-conc" value={modConc} onChange={(e) => setModConc(e.target.value as any)} className={`${campo} w-full`}>
                <option value="Clássico">Clássico</option><option value="Premium">Premium</option>
              </select>
            </label>
          ) : (
            <p className="text-[11px] text-slate-400 self-end pb-2">Canal do concorrente: <b className="text-slate-200">{nomeDoCanal(canal)}</b></p>
          )}
        </div>

        {sku.trim() && custo && (custo.achou
          ? <p className="text-[11px] text-slate-400" data-cmp-custo>Custo do SKU na tabela de custos: <b className="text-white">{brl(custo.valor)}</b>{custo.produto ? ` (${custo.produto})` : ""}.</p>
          : (
            <label className={rotulo}>Esse SKU não está na tabela de custos. Informe o custo unitário (R$)
              <input data-campo="cmp-custo-manual" value={custoManual} onChange={(e) => setCustoManual(e.target.value)} inputMode="decimal" placeholder="Ex.: 21,50" className={`${campo} w-full`} />
            </label>
          ))}

        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer select-none font-bold">Ler o preço pelo favorito (opcional)</summary>
          <p className="mt-2">Abra a página do SEU anúncio, clique no favorito “Capturar anúncios” e cole aqui o texto copiado: o preço (e o título) vêm dele.</p>
          <textarea data-campo="cmp-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder='{"v":1,"tipo":"anuncio",…}' className={`${campo} w-full font-mono text-xs mt-2`} />
        </details>

        {erro && <p className="text-xs font-semibold text-rose-300" data-cmp-erro>⚠️ {erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onFechar} className={`${botao} bg-slate-800 text-slate-300 hover:bg-slate-700`}>Cancelar</button>
          <button data-acao="cmp-salvar" onClick={salvar} disabled={salvando || !sku.trim() || (!link.trim() && !texto.trim())} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
