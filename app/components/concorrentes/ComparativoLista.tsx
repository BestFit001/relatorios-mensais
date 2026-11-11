"use client";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { normalizarSkuCadastro } from "../../../lib/cadastros";
import type { AnuncioML } from "../../../lib/analiseMercado";
import { compararAnuncios, type LadoComparativo } from "../../../lib/concorrentes/comparativo";
import type { RegraTarifacao } from "../../../lib/tarifacao";
import { botao, brl, campo, caixa, dataBR, pct, type Anuncio, type Comparativo } from "./comum";

export type ComparativoComAnuncio = Comparativo & { anuncio: Anuncio | null };

interface RegraML extends AnuncioML { mlb: string; sku: string; canal: string }
const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const paraML = (r: any): RegraML => ({ mlb: String(r.mlb || ""), sku: String(r.sku || ""), canal: String(r.canal || ""), comissao: Number(r.comissao) || 0, peso_real: Number(r.peso_real) || 0, altura: Number(r.altura) || 0, largura: Number(r.largura) || 0, comprimento: Number(r.comprimento) || 0 });
const conta = (canal: string) => (canal.includes("2") ? "2" : "1");
const neg = (v: number) => `−${brl(Math.abs(v))}`;
const dinheiro = (v: number | null) => (v == null ? "—" : v < 0 ? neg(v) : brl(v));

interface Dados { custos: Map<string, number>; porMlb: Map<string, RegraML>; porSku: Map<string, RegraML[]>; regras: RegraTarifacao[] }

/** Sub-aba "Comparativo": preço, tarifas aproximadas e lucro líquido do anúncio do concorrente e do meu, com o meu custo. */
export default function ComparativoLista({ comparativos, carregando, onEditar, onRemover, onPreco }: {
  comparativos: ComparativoComAnuncio[]; carregando: boolean;
  onEditar: (c: ComparativoComAnuncio) => void; onRemover: (c: ComparativoComAnuncio) => void;
  onPreco: (c: ComparativoComAnuncio, dados: { meu_preco?: string; texto?: string }) => Promise<boolean>;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const chave = useMemo(() => comparativos.map((c) => `${c.sku}|${c.meu_mlb_id}`).sort().join(","), [comparativos]);

  useEffect(() => {
    if (!comparativos.length) { setDados({ custos: new Map(), porMlb: new Map(), porSku: new Map(), regras: [] }); return; }
    let vivo = true;
    (async () => {
      try {
        const skus = Array.from(new Set(comparativos.map((c) => c.sku)));
        const mlbs = Array.from(new Set(comparativos.map((c) => c.meu_mlb_id).filter(Boolean) as string[]));
        const colunas = "mlb,sku,comissao,peso_real,altura,largura,comprimento,canal";
        const [regrasRes, custosRes, porMlbRes, porSkuRes] = await Promise.all([
          supabase.from("config_regras_tarifacao").select("*"),
          Promise.all(skus.map((s) => supabase.from("tabela_custos_skus").select("sku,custo_unitario").ilike("sku", escLike(s)).limit(1))),
          mlbs.length ? supabase.from("ml_anuncios_regras").select(colunas).in("mlb", mlbs) : Promise.resolve({ data: [], error: null }),
          supabase.from("ml_anuncios_regras").select(colunas).in("sku", skus),
        ]);
        for (const r of [regrasRes, ...custosRes, porMlbRes, porSkuRes]) if ((r as any).error) throw new Error((r as any).error.message);
        const custos = new Map<string, number>();
        for (const r of custosRes) { const l = (r.data || [])[0]; if (l && l.custo_unitario != null) custos.set(normalizarSkuCadastro(l.sku), Number(l.custo_unitario)); }
        const porMlb = new Map<string, RegraML>();
        for (const r of porMlbRes.data || []) porMlb.set(String(r.mlb), paraML(r));
        const porSku = new Map<string, RegraML[]>();
        for (const r of porSkuRes.data || []) { const k = normalizarSkuCadastro(r.sku); porSku.set(k, [...(porSku.get(k) || []), paraML(r)]); }
        if (vivo) { setDados({ custos, porMlb, porSku, regras: (regrasRes.data as RegraTarifacao[]) || [] }); setErro(null); }
      } catch (e: any) { if (vivo) setErro(`Não consegui ler custos e tarifas: ${e.message}`); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return (
    <div className="space-y-4" data-comparativos>
      {erro && <div className="p-3 rounded-xl border border-amber-800/60 bg-amber-950/30 text-amber-200 text-xs font-semibold">⚠️ {erro}</div>}
      {carregando && <p className="text-xs text-slate-500">Carregando…</p>}
      {!carregando && comparativos.length === 0 && (
        <div className={`${caixa} p-10 text-center text-sm text-slate-400`} data-cmp-vazio>
          Nenhum comparativo ainda. Na aba Anúncios (ou Favoritos), clique em ⚖️ no anúncio do concorrente e informe o link e o SKU do seu anúncio igual.
        </div>
      )}
      {dados && comparativos.map((c) => <Cartao key={c.id} c={c} dados={dados} onEditar={onEditar} onRemover={onRemover} onPreco={onPreco} />)}
      {comparativos.length > 0 && (
        <p className="text-[10px] text-slate-500">
          Tarifas aproximadas: no Mercado Livre, comissão pela modalidade, tarifa fixa de R$ 6,50 abaixo de R$ 79 e frete pela tabela do canal com o peso e as medidas do seu SKU (as mesmas nos dois lados); nos demais canais (Amazon, Shopee…), as regras cadastradas na Análise de mercado; imposto de 9% sobre o preço; o custo é o do seu SKU nos dois lados.
          Não entram frete grátis negociado, reputação, anúncios pagos, parcelamento nem promoções.
        </p>
      )}
    </div>
  );
}

function Cartao({ c, dados, onEditar, onRemover, onPreco }: { c: ComparativoComAnuncio; dados: Dados; onEditar: (c: ComparativoComAnuncio) => void; onRemover: (c: ComparativoComAnuncio) => void; onPreco: (c: ComparativoComAnuncio, d: { meu_preco?: string; texto?: string }) => Promise<boolean> }) {
  const [novoPreco, setNovoPreco] = useState("");
  const [texto, setTexto] = useState("");
  const [lendo, setLendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const skuNorm = normalizarSkuCadastro(c.sku);
  const tabela = dados.custos.get(skuNorm);
  const custo = tabela ?? c.custo_manual ?? null;
  const regraMeu = c.meu_mlb_id ? dados.porMlb.get(c.meu_mlb_id) : undefined;
  const doSku = (dados.porSku.get(skuNorm) || []).filter((r) => conta(r.canal) === conta(c.canal_meu));
  const anunciosMeu = regraMeu ? [regraMeu] : doSku;
  const anunciosConcorrente = doSku.length ? doSku : regraMeu ? [regraMeu] : [];
  const mercadoLivre = (canal: string) => canal.toLowerCase().includes("mercado livre");
  const semMedidas = (mercadoLivre(c.canal_meu) || mercadoLivre(c.canal_concorrente)) && anunciosMeu.length === 0 && anunciosConcorrente.length === 0;

  const r = compararAnuncios({
    precoConcorrente: c.anuncio?.ultimo_preco ?? null, precoMeu: c.meu_preco, canalConcorrente: c.canal_concorrente, canalMeu: c.canal_meu,
    custo, regras: dados.regras, anunciosMeu, anunciosConcorrente,
  });

  const idadePreco = c.meu_preco_em ? Math.floor((Date.now() - Date.parse(c.meu_preco_em)) / 86_400_000) : null;
  const atualizar = async (d: { meu_preco?: string; texto?: string }) => {
    setOcupado(true);
    try { if (await onPreco(c, d)) { setNovoPreco(""); setTexto(""); setLendo(false); } } finally { setOcupado(false); }
  };

  const linhas: { rotulo: string; valor: (l: LadoComparativo) => React.ReactNode; forte?: boolean }[] = [
    { rotulo: "Modalidade", valor: (l) => l.canal.replace("Mercado Livre ", "ML ") },
    { rotulo: "Preço de venda", valor: (l) => brl(l.preco), forte: true },
    { rotulo: "Comissão", valor: (l) => l.analise ? `${l.analise.comissaoPct.toLocaleString("pt-BR")}% · ${neg(l.analise.comissaoValor)}` : "—" },
    { rotulo: "Tarifa fixa", valor: (l) => l.analise ? (l.analise.tarifaFixa ? neg(l.analise.tarifaFixa) : "—") : "—" },
    { rotulo: "Frete (estimado)", valor: (l) => l.analise ? (l.analise.frete ? neg(l.analise.frete) : "—") : "—" },
    { rotulo: "Repasse do canal", valor: (l) => l.analise ? brl(l.analise.liquido) : "—" },
    { rotulo: "Imposto (9%)", valor: (l) => l.analise ? neg(l.analise.imposto) : "—" },
    { rotulo: "Meu custo (SKU)", valor: (l) => l.custo != null ? neg(l.custo) : "sem custo" },
    { rotulo: "Lucro líquido", valor: (l) => <span className={l.lucro == null ? "" : l.lucro >= 0 ? "text-emerald-400" : "text-rose-400"}>{l.lucro == null ? "—" : l.lucro < 0 ? neg(l.lucro) : brl(l.lucro)}</span>, forte: true },
    { rotulo: "Margem", valor: (l) => l.margemPct == null ? "—" : `${l.margemPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` },
  ];

  return (
    <article className={`${caixa} p-4 space-y-3`} data-comparativo={c.anuncio?.mlb_id || c.id}>
      <header className="flex flex-wrap items-start gap-3">
        {c.anuncio?.url_imagem
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.anuncio.url_imagem} alt="" referrerPolicy="no-referrer" className="w-12 h-12 object-contain rounded-md bg-white" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
          : <div className="w-12 h-12 rounded-md bg-slate-800" />}
        <div className="min-w-0 flex-1">
          {c.anuncio
            ? <a href={c.anuncio.url_anuncio} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-100 hover:text-indigo-300 line-clamp-2">{c.anuncio.titulo}</a>
            : <span className="text-slate-400">Anúncio do concorrente não encontrado</span>}
          <p className="text-[11px] text-slate-500">
            Concorrente{c.anuncio?.marca ? ` (${c.anuncio.marca})` : ""} × meu anúncio{" "}
            {c.meu_url ? <a href={c.meu_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">{c.meu_mlb_id || "link"}</a> : c.meu_mlb_id} · SKU <b className="text-slate-300">{c.sku}</b>
          </p>
        </div>
        <div className="flex gap-3 text-[11px] font-bold">
          <button data-acao="cmp-editar" onClick={() => onEditar(c)} className="text-slate-300 hover:text-white cursor-pointer">Editar</button>
          <button data-acao="cmp-remover" onClick={() => onRemover(c)} className="text-rose-400 hover:text-rose-300 cursor-pointer">Remover</button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-cmp-tabela>
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
              <th className="py-2 pr-3 text-left" /><th className="py-2 pr-3 text-right">Concorrente</th><th className="py-2 text-right">Meu anúncio</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} data-linha={l.rotulo} className="border-b border-slate-800/50">
                <td className="py-1.5 pr-3 text-slate-400">{l.rotulo}</td>
                <td className={`py-1.5 pr-3 text-right whitespace-nowrap ${l.forte ? "font-black text-white" : "text-slate-300"}`} data-lado="concorrente">{l.valor(r.concorrente)}</td>
                <td className={`py-1.5 text-right whitespace-nowrap ${l.forte ? "font-black text-white" : "text-slate-300"}`} data-lado="meu">{l.valor(r.meu)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-300 space-y-1" data-cmp-resumo>
        {r.difPreco != null && <p>{r.difPreco === 0 ? "Os preços são iguais." : `Seu preço está ${brl(Math.abs(r.difPreco))} (${pct(Math.abs(r.difPrecoPct || 0))}) ${r.difPreco > 0 ? "acima" : "abaixo"} do concorrente.`}</p>}
        {r.difLucro != null && <p>Seu lucro por unidade é {dinheiro(r.meu.lucro)}; vendendo ao preço dele seria {dinheiro(r.concorrente.lucro)} ({r.difLucro === 0 ? "igual" : `${dinheiro(Math.abs(r.difLucro))} ${r.difLucro > 0 ? "a mais no seu preço" : "a mais no preço dele"}`}).</p>}
        {c.meu_preco == null && <p className="text-amber-300" data-cmp-aviso>Informe o seu preço para ver o seu lucro.</p>}
        {custo == null && <p className="text-amber-300" data-cmp-aviso>O SKU {c.sku} não tem custo cadastrado: edite o comparativo e informe o custo.</p>}
        {semMedidas && <p className="text-amber-300" data-cmp-aviso>Não achei peso e medidas desse SKU no cadastro de anúncios: o frete foi estimado com valores padrão (2 kg, 10×10×10 cm).</p>}
        {c.anuncio && c.anuncio.ultimo_preco == null && <p className="text-amber-300" data-cmp-aviso>O concorrente está sem preço capturado.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/70">
        <span className="text-[11px] text-slate-500">Meu preço {c.meu_preco_em ? `atualizado em ${dataBR(c.meu_preco_em)}` : "não informado"}{idadePreco != null && idadePreco > 7 ? " — desatualizado?" : ""}</span>
        <input data-campo="novo-preco" value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} inputMode="decimal" placeholder="Novo preço (R$)" className={`${campo} w-36`} />
        <button data-acao="atualizar-preco" onClick={() => atualizar({ meu_preco: novoPreco })} disabled={ocupado || !novoPreco.trim()} className={`${botao} bg-slate-800 text-slate-200 hover:bg-slate-700`}>Atualizar</button>
        <button onClick={() => setLendo((v) => !v)} className="text-[11px] underline text-slate-400 hover:text-white cursor-pointer">ler pelo favorito</button>
      </div>
      {lendo && (
        <div className="grid gap-2 md:grid-cols-[1fr_auto] items-end">
          <textarea data-campo="texto-preco" value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Cole o texto que o favorito copiou na página do seu anúncio" className={`${campo} w-full font-mono text-xs`} />
          <button data-acao="atualizar-preco-texto" onClick={() => atualizar({ texto })} disabled={ocupado || !texto.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>Ler preço</button>
        </div>
      )}
    </article>
  );
}
