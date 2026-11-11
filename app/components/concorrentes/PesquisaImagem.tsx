"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { buscarTudo } from "../../../lib/buscarTudo";
import { normalizarSkuCadastro } from "../../../lib/cadastros";
import type { RegraTarifacao } from "../../../lib/tarifacao";
import { favoritoHref } from "../../../lib/concorrentes/favorito";
import { GOOGLE_LENS_URL, calcularOfertas, googleShoppingUrl, menorPrecoPorCanal, ofertaManualComoTexto, resumirOfertas, type Oferta } from "../../../lib/concorrentes/pesquisaCalculo";
import { botao, brl, caixa, campo, chamar, dataBR, pct } from "./comum";

interface Pesquisa { id: string; sku: string; meu_pdv: number | null; termo: string | null; criado_em: string; atualizado_em: string | null }
const nm = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const lerPesquisa = (r: any): Pesquisa => ({ ...r, meu_pdv: nm(r.meu_pdv) });
const lerOferta = (r: any): Oferta => ({ ...r, preco: Number(r.preco) });
const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const neg = (v: number) => `−${brl(Math.abs(v))}`;
const dinheiro = (v: number | null) => (v == null ? "—" : v < 0 ? neg(v) : brl(v));
const rotulo = "grid gap-1 text-[11px] font-bold text-slate-400";

async function paraPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("Não consegui converter a imagem."))), "image/png"));
}

/** Aba "Pesquisa por imagem": SKU + meu PDV + imagem -> ofertas lidas no Google (pelo favorito) -> preço do item em cada canal meu. */
export default function PesquisaImagem() {
  const [pesquisas, setPesquisas] = useState<Pesquisa[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoOfertas, setCarregandoOfertas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = (tipo: "ok" | "erro", texto: string) => {
    if (relogio.current) clearTimeout(relogio.current);
    setAviso({ tipo, texto });
    relogio.current = tipo === "ok" ? setTimeout(() => setAviso(null), 6000) : null;
  };

  // nova pesquisa
  const [sku, setSku] = useState("");
  const [pdv, setPdv] = useState("");
  const [termo, setTermo] = useState("");
  const [termoMexido, setTermoMexido] = useState(false);
  const [criando, setCriando] = useState(false);
  const [custoDoSku, setCustoDoSku] = useState<{ achou: boolean; valor?: number; produto?: string } | null>(null);

  // imagem: só na memória deste navegador (não vai para o servidor)
  const [imagem, setImagem] = useState<{ url: string; blob: Blob } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const definirImagem = useCallback((blob: Blob) => {
    setImagem((atual) => { if (atual) URL.revokeObjectURL(atual.url); return { url: URL.createObjectURL(blob), blob }; });
  }, []);
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA)$/.test(alvo.tagName)) return; // colando texto em um campo: não é imagem
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); definirImagem(f); }
    };
    window.addEventListener("paste", colar);
    return () => window.removeEventListener("paste", colar);
  }, [definirImagem]);
  useEffect(() => () => { setImagem((a) => { if (a) URL.revokeObjectURL(a.url); return null; }); }, []);

  // dados para taxas e lucro
  const [regras, setRegras] = useState<RegraTarifacao[]>([]);
  const [custoSelecionada, setCustoSelecionada] = useState<number | null>(null);
  const [anunciosMl, setAnunciosMl] = useState<any[]>([]);

  const [textoImport, setTextoImport] = useState("");
  const [importando, setImportando] = useState(false);
  const [manual, setManual] = useState({ titulo: "", loja: "", preco: "", url: "" });
  const favoritoRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { favoritoRef.current?.setAttribute("href", favoritoHref()); }, [selecionada]);

  const carregarPesquisas = useCallback(async (escolher?: string) => {
    try {
      const { data, error } = await supabase.from("pesquisas_imagem").select("*").order("criado_em", { ascending: false });
      if (error) throw new Error(error.message);
      const lista = (data || []).map(lerPesquisa);
      setPesquisas(lista);
      setSelecionada((atual) => escolher || (atual && lista.some((p) => p.id === atual) ? atual : lista[0]?.id ?? null));
      setErro(null);
    } catch (e: any) { setErro(`Não consegui ler as pesquisas: ${e.message}`); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregarPesquisas(); }, [carregarPesquisas]);
  useEffect(() => { supabase.from("config_regras_tarifacao").select("*").then(({ data }) => setRegras((data as RegraTarifacao[]) || [])); }, []);

  const pesquisa = pesquisas.find((p) => p.id === selecionada) || null;

  const carregarOfertas = useCallback(async (id: string) => {
    setCarregandoOfertas(true);
    try { setOfertas((await buscarTudo("pesquisa_resultados", "*", (q) => q.eq("pesquisa_id", id))).map(lerOferta)); setErro(null); }
    catch (e: any) { setErro(`Não consegui ler as ofertas: ${e.message}`); }
    finally { setCarregandoOfertas(false); }
  }, []);
  useEffect(() => { setOfertas([]); if (selecionada) carregarOfertas(selecionada); }, [selecionada, carregarOfertas]);

  // custo e medidas do SKU da pesquisa selecionada
  useEffect(() => {
    setCustoSelecionada(null); setAnunciosMl([]);
    if (!pesquisa) return;
    let vivo = true;
    (async () => {
      const [c, ml] = await Promise.all([
        supabase.from("tabela_custos_skus").select("sku,custo_unitario").ilike("sku", escLike(pesquisa.sku)).limit(1),
        supabase.from("ml_anuncios_regras").select("sku,comissao,peso_real,altura,largura,comprimento,canal").eq("sku", pesquisa.sku),
      ]);
      if (!vivo) return;
      const l = (c.data || [])[0];
      setCustoSelecionada(l && l.custo_unitario != null ? Number(l.custo_unitario) : null);
      const k = normalizarSkuCadastro(pesquisa.sku);
      setAnunciosMl((ml.data || []).filter((r: any) => normalizarSkuCadastro(r.sku) === k).map((m: any) => ({ comissao: Number(m.comissao) || 0, peso_real: Number(m.peso_real) || 0, altura: Number(m.altura) || 0, largura: Number(m.largura) || 0, comprimento: Number(m.comprimento) || 0, canal: String(m.canal || "") })));
    })();
    return () => { vivo = false; };
  }, [pesquisa?.id, pesquisa?.sku]); // eslint-disable-line react-hooks/exhaustive-deps

  // SKU digitado: mostra o custo e sugere o nome do produto como termo de busca
  useEffect(() => {
    const s = sku.trim();
    if (!s) { setCustoDoSku(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from("tabela_custos_skus").select("sku,produto,custo_unitario").ilike("sku", escLike(s)).limit(1);
      if (!vivo) return;
      const r = data?.[0];
      setCustoDoSku(r && r.custo_unitario != null ? { achou: true, valor: Number(r.custo_unitario), produto: r.produto } : { achou: false });
      if (r?.produto && !termoMexido) setTermo(String(r.produto));
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [sku, termoMexido]);

  const criar = async () => {
    setCriando(true); setAviso(null);
    try {
      const r = await chamar<{ pesquisa: Pesquisa }>("pesquisas", "POST", { sku, meu_pdv: pdv || undefined, termo: termo || undefined });
      setSku(""); setPdv(""); setTermo(""); setTermoMexido(false);
      await carregarPesquisas(r.pesquisa.id);
      avisar("ok", "Pesquisa criada. Agora faça a busca no Google e importe os resultados (passos abaixo).");
    } catch (e: any) { avisar("erro", e.message); }
    finally { setCriando(false); }
  };

  const importar = async (texto: string, limpar: () => void) => {
    if (!pesquisa) return;
    setImportando(true); setAviso(null);
    try {
      const r = await chamar("pesquisas", "PATCH", { id: pesquisa.id, texto });
      limpar();
      await Promise.all([carregarOfertas(pesquisa.id), carregarPesquisas(pesquisa.id)]);
      avisar("ok", `${r.recebidos} oferta(s) lidas (${r.nosMeusCanais} em lojas dos seus canais)${r.descartados ? `, ${r.descartados} descartada(s) por falta de dado ou repetição` : ""}.`);
    } catch (e: any) { avisar("erro", e.message); }
    finally { setImportando(false); }
  };

  const mudarPdv = async (valor: string) => {
    if (!pesquisa) return;
    try { await chamar("pesquisas", "PATCH", { id: pesquisa.id, meu_pdv: valor }); await carregarPesquisas(pesquisa.id); avisar("ok", "Meu PDV atualizado."); }
    catch (e: any) { avisar("erro", e.message); }
  };

  const remover = async () => {
    if (!pesquisa || !window.confirm(`Remover a pesquisa do SKU ${pesquisa.sku} e as ofertas dela?`)) return;
    try { await chamar("pesquisas", "DELETE", { id: pesquisa.id }); setSelecionada(null); await carregarPesquisas(); avisar("ok", "Pesquisa removida."); }
    catch (e: any) { avisar("erro", e.message); }
  };

  const copiarImagem = async () => {
    if (!imagem) return;
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": await paraPng(imagem.blob) })]); avisar("ok", "Imagem copiada. No Google Lens, clique na caixa de busca e aperte Ctrl+V."); }
    catch { avisar("erro", "Não consegui copiar a imagem automaticamente. No Google Lens, use “enviar arquivo” ou arraste a imagem."); }
  };
  const copiarFavorito = async () => {
    try { await navigator.clipboard.writeText(favoritoHref()); avisar("ok", "Código do favorito copiado. Crie um favorito novo e cole no campo de endereço (URL)."); }
    catch { avisar("erro", "Não consegui copiar. Arraste o botão para a barra de favoritos."); }
  };

  const linhas = useMemo(() => calcularOfertas(ofertas, { meuPdv: pesquisa?.meu_pdv ?? null, custo: custoSelecionada, regras, anunciosMl }), [ofertas, pesquisa?.meu_pdv, custoSelecionada, regras, anunciosMl]);
  const porCanal = useMemo(() => menorPrecoPorCanal(ofertas), [ofertas]);
  const resumo = useMemo(() => resumirOfertas(ofertas, pesquisa?.meu_pdv ?? null), [ofertas, pesquisa?.meu_pdv]);
  const nosCanais = linhas.filter((l) => l.canal), fora = linhas.filter((l) => !l.canal);
  const termoBusca = (pesquisa?.termo || "").trim();

  return (
    <div className="space-y-5" data-pesquisa-imagem>
      {erro && <div data-erro className="p-4 rounded-xl border border-amber-800/60 bg-amber-950/30 text-amber-200 text-xs font-semibold">⚠️ {erro}</div>}
      {aviso && (
        <div data-aviso={aviso.tipo} className={`p-3 rounded-xl border text-xs font-semibold flex items-start justify-between gap-3 ${aviso.tipo === "ok" ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200" : "border-rose-800/60 bg-rose-950/30 text-rose-200"}`}>
          <span>{aviso.tipo === "ok" ? "✅" : "⚠️"} {aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 cursor-pointer" aria-label="Fechar">✕</button>
        </div>
      )}

      <section className={`${caixa} p-5 space-y-4`} data-nova-pesquisa>
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">🔎 Nova pesquisa</h2>
          <p className="text-[11px] text-slate-500 mt-1">Informe o SKU, o seu PDV e a foto do produto. O Google (Shopping/Lens) mostra onde o item é vendido e por quanto; o favorito lê essa página no seu navegador e traz as ofertas para cá, já comparadas com os seus canais.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_160px_1.4fr]">
          <label className={rotulo}>SKU do meu produto
            <input data-campo="ps-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex.: 17385002086" className={`${campo} w-full`} />
          </label>
          <label className={rotulo}>Meu PDV (R$)
            <input data-campo="ps-pdv" value={pdv} onChange={(e) => setPdv(e.target.value)} inputMode="decimal" placeholder="Ex.: 59,90" className={`${campo} w-full`} />
          </label>
          <label className={rotulo}>Palavras para buscar (opcional)
            <input data-campo="ps-termo" value={termo} onChange={(e) => { setTermo(e.target.value); setTermoMexido(true); }} placeholder="Nome do produto como o cliente procura" className={`${campo} w-full`} />
          </label>
        </div>
        {sku.trim() && custoDoSku && (custoDoSku.achou
          ? <p className="text-[11px] text-slate-400" data-ps-custo>Custo do SKU na tabela de custos: <b className="text-white">{brl(custoDoSku.valor)}</b>{custoDoSku.produto ? ` (${custoDoSku.produto})` : ""}.</p>
          : <p className="text-[11px] text-amber-300" data-ps-custo>Esse SKU não está na tabela de custos: o lucro não poderá ser calculado (só preços, taxas e frete).</p>)}

        <div className="grid gap-3 md:grid-cols-[220px_1fr] items-start">
          <div
            data-imagem-zona tabIndex={0}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/")); if (f) definirImagem(f); }}
            onClick={() => arquivoRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/60 min-h-[140px] grid place-items-center text-center p-3 cursor-pointer">
            {imagem
              // eslint-disable-next-line @next/next/no-img-element
              ? <img data-imagem-previa src={imagem.url} alt="Imagem do produto" className="max-h-40 object-contain rounded-md bg-white" />
              : <span className="text-[11px] text-slate-500">Cole a imagem aqui (Ctrl+V), arraste um arquivo ou clique para escolher</span>}
            <input ref={arquivoRef} data-campo="ps-arquivo" type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) definirImagem(f); e.target.value = ""; }} />
          </div>
          <div className="text-[11px] text-slate-500 space-y-1">
            <p>A imagem fica só neste navegador (não é enviada nem guardada); ela serve para você colar no Google Lens. Se você recarregar a página, cole de novo.</p>
            <p>Dica: foto limpa, só o produto, com fundo simples, acha mais lojas.</p>
          </div>
        </div>
        <button data-acao="ps-criar" onClick={criar} disabled={criando || !sku.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>{criando ? "Criando…" : "Criar pesquisa"}</button>
      </section>

      {carregando ? <p className="text-xs text-slate-500">Carregando…</p> : pesquisas.length === 0 ? (
        <div className={`${caixa} p-10 text-center text-sm text-slate-400`} data-ps-vazio>Nenhuma pesquisa ainda. Preencha o SKU e o PDV acima e clique em “Criar pesquisa”.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" role="tablist" data-pesquisas>
            {pesquisas.map((p) => (
              <button key={p.id} role="tab" aria-selected={p.id === selecionada} data-pesquisa-tab={p.sku} onClick={() => setSelecionada(p.id)}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide cursor-pointer transition-colors ${p.id === selecionada ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>
                {p.sku}{p.meu_pdv != null && <span className="ml-2 text-[9px] font-bold opacity-70">PDV {brl(p.meu_pdv)}</span>}
              </button>
            ))}
          </div>

          {pesquisa && (
            <>
              <section className={`${caixa} p-5 space-y-4`} data-passos>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">Buscar no Google — SKU {pesquisa.sku}</h2>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-400 ml-auto">Meu PDV (R$)
                    <input data-campo="ps-pdv-edit" key={pesquisa.id + String(pesquisa.meu_pdv)} defaultValue={pesquisa.meu_pdv != null ? String(pesquisa.meu_pdv).replace(".", ",") : ""} inputMode="decimal"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (pesquisa.meu_pdv != null ? String(pesquisa.meu_pdv).replace(".", ",") : "")) mudarPdv(v); }} className={`${campo} w-28`} />
                  </label>
                  <button data-acao="ps-remover" onClick={remover} className="text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">Remover pesquisa</button>
                </div>
                <ol className="text-xs text-slate-400 space-y-2.5 list-decimal list-inside">
                  <li>
                    Pela <b className="text-slate-200">imagem</b>:{" "}
                    <button data-acao="ps-copiar-imagem" onClick={copiarImagem} disabled={!imagem} className={`${botao} !py-1 bg-slate-800 text-slate-200 hover:bg-slate-700`}>Copiar imagem</button>{" "}
                    <a data-acao="ps-abrir-lens" href={GOOGLE_LENS_URL} target="_blank" rel="noopener noreferrer" className={`${botao} !py-1 inline-block bg-slate-800 text-slate-200 hover:bg-slate-700`}>Abrir Google Lens ↗</a>{" "}
                    e cole a imagem (Ctrl+V). Nos resultados, abra os produtos/lojas (guia “Produtos” ou “Compras”).
                    {!imagem && <span className="text-slate-500"> (cole a imagem acima para habilitar o botão)</span>}
                  </li>
                  <li>
                    Ou pelo <b className="text-slate-200">texto</b>:{" "}
                    <a data-acao="ps-abrir-shopping" aria-disabled={!termoBusca} href={termoBusca ? googleShoppingUrl(termoBusca) : undefined} target="_blank" rel="noopener noreferrer" className={`${botao} !py-1 inline-block bg-slate-800 text-slate-200 hover:bg-slate-700 ${termoBusca ? "" : "opacity-40 pointer-events-none"}`}>Abrir Google Shopping ↗</a>{" "}
                    {termoBusca ? <>com “{termoBusca}”.</> : <span className="text-slate-500">(preencha as palavras da busca ao criar a pesquisa)</span>}
                  </li>
                  <li>
                    Na página de resultados do Google, clique no favorito{" "}
                    <a ref={favoritoRef} data-favorito onClick={(e) => e.preventDefault()} draggable className="inline-block align-middle px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider cursor-grab">📋 Capturar anúncios</a>{" "}
                    <button data-acao="copiar-favorito" onClick={copiarFavorito} className="text-[11px] underline text-slate-300 hover:text-white cursor-pointer">não consegui arrastar</button>
                    <span className="text-slate-500"> (é o mesmo favorito das outras abas; ele rola a página, lê preço, loja e link de cada resultado e copia)</span>
                  </li>
                  <li>Cole o texto aqui e importe. Pode repetir com outra busca ou outra imagem: as ofertas se somam e o preço das já lidas é atualizado.</li>
                </ol>
                <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                  <textarea data-campo="ps-texto" value={textoImport} onChange={(e) => setTextoImport(e.target.value)} rows={3} placeholder='{"v":1,"canal":"google","tipo":"pesquisa",…}' className={`${campo} w-full font-mono text-xs`} />
                  <button data-acao="ps-importar" onClick={() => importar(textoImport, () => setTextoImport(""))} disabled={importando || !textoImport.trim()} className={`${botao} bg-indigo-600 text-white hover:bg-indigo-500`}>{importando ? "Importando…" : "Importar resultados"}</button>
                </div>
                <details className="text-[11px] text-slate-500" data-oferta-manual>
                  <summary className="cursor-pointer select-none font-bold text-slate-400">Adicionar uma oferta à mão (quando o Google não mostra o preço ou o favorito não leu)</summary>
                  <div className="grid gap-2 mt-2 md:grid-cols-[1.4fr_1fr_110px_1.2fr_auto] items-end">
                    <input data-campo="of-titulo" value={manual.titulo} onChange={(e) => setManual({ ...manual, titulo: e.target.value })} placeholder="Título do anúncio" className={campo} />
                    <input data-campo="of-loja" value={manual.loja} onChange={(e) => setManual({ ...manual, loja: e.target.value })} placeholder="Loja (ex.: Magalu)" className={campo} />
                    <input data-campo="of-preco" value={manual.preco} onChange={(e) => setManual({ ...manual, preco: e.target.value })} inputMode="decimal" placeholder="Preço" className={campo} />
                    <input data-campo="of-url" value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} placeholder="Link (opcional)" className={campo} />
                    <button data-acao="of-adicionar" disabled={importando || !manual.titulo.trim() || !manual.loja.trim() || !manual.preco.trim()}
                      onClick={() => importar(ofertaManualComoTexto(manual), () => setManual({ titulo: "", loja: "", preco: "", url: "" }))} className={`${botao} bg-slate-800 text-slate-200 hover:bg-slate-700`}>Adicionar</button>
                  </div>
                </details>
              </section>

              {carregandoOfertas && <p className="text-xs text-slate-500">Carregando ofertas…</p>}
              {!carregandoOfertas && ofertas.length === 0 && <div className={`${caixa} p-8 text-center text-sm text-slate-400`} data-ps-sem-ofertas>Ainda não há ofertas para este SKU. Siga os passos acima.</div>}

              {ofertas.length > 0 && (
                <>
                  <div className={`${caixa} grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-800`} data-ps-resumo>
                    {[
                      ["Ofertas lidas", String(resumo.total), `${resumo.nosMeusCanais} em lojas dos meus canais`],
                      ["Menor preço", brl(resumo.menor), resumo.mediana != null ? `mediana ${brl(resumo.mediana)}` : ""],
                      ["Meu PDV", brl(pesquisa.meu_pdv), pesquisa.meu_pdv == null ? "informe acima para comparar" : resumo.maisBaratas === 0 ? "ninguém está abaixo de você" : `${resumo.maisBaratas} oferta(s) abaixo de você`],
                      ["Minha posição", resumo.posicao != null ? `${resumo.posicao}º mais barato` : "—", `de ${resumo.total + (resumo.posicao != null ? 1 : 0)} contando comigo`],
                      ["Meu custo", brl(custoSelecionada), custoSelecionada == null ? "SKU sem custo cadastrado" : "tabela de custos"],
                    ].map(([t, v, d]) => (
                      <div key={t} className="px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{t}</p>
                        <p className="text-xl font-black text-white leading-tight">{v}</p>
                        <p className="text-[10px] text-slate-500">{d}</p>
                      </div>
                    ))}
                  </div>

                  <section className={`${caixa} p-4 space-y-2`} data-por-canal>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">Menor preço do item em cada um dos meus canais</h3>
                    {porCanal.length === 0 ? <p className="text-xs text-slate-500">Nenhuma oferta é de uma loja dos seus canais (Mercado Livre, Amazon, Shopee, Magalu, Netshoes, Shein, TikTok Shop, Centauro).</p> : (
                      <div className="flex flex-wrap gap-2">
                        {porCanal.map((c) => {
                          const dif = pesquisa.meu_pdv ? c.preco - pesquisa.meu_pdv : null;
                          return (
                            <div key={c.canal} data-canal-card={c.canal} className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2 min-w-[170px]">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{c.canal}</p>
                              <p className="text-lg font-black text-white leading-tight">{brl(c.preco)}</p>
                              <p className="text-[10px] text-slate-500 truncate">{c.loja || "—"} · {c.ofertas} oferta(s)</p>
                              {dif != null && <p className={`text-[10px] font-bold ${dif < 0 ? "text-rose-400" : "text-emerald-400"}`}>{dif === 0 ? "igual ao meu PDV" : `${dif < 0 ? "▼" : "▲"} ${brl(Math.abs(dif))} ${dif < 0 ? "abaixo" : "acima"} do meu PDV`}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className={`${caixa} p-4 space-y-3`} data-ps-tabela>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">Ofertas nos meus canais — quanto eu lucraria vendendo a esse preço</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800">
                            <th className="py-2 pr-3">Canal / loja</th><th className="py-2 pr-3">Título</th><th className="py-2 pr-3 text-right">Preço</th><th className="py-2 pr-3 text-right">Contra o meu PDV</th>
                            <th className="py-2 pr-3 text-right" title="Comissão + tarifa fixa + frete estimados">Taxas e frete</th><th className="py-2 pr-3 text-right" title="Depois das taxas, do frete e do imposto de 9%, antes do custo">Líquido</th><th className="py-2 pr-3 text-right">Lucro (meu custo)</th><th className="py-2 text-right">Margem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nosCanais.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-xs text-slate-500">Nenhuma oferta de loja dos seus canais.</td></tr>}
                          {nosCanais.map(({ oferta: o, lado, difPreco, difPct }) => {
                            const taxas = lado?.analise ? lado.analise.comissaoValor + lado.analise.tarifaFixa + lado.analise.frete : null;
                            return (
                              <tr key={o.id} data-oferta-linha={o.loja || ""} className="border-b border-slate-800/60">
                                <td className="py-2 pr-3 whitespace-nowrap"><span className="font-bold text-slate-200">{o.canal}</span><span className="block text-[10px] text-slate-500">{o.loja}</span></td>
                                <td className="py-2 pr-3 max-w-[380px]">
                                  {o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-100 hover:text-indigo-300 line-clamp-2">{o.titulo}</a> : <span className="font-semibold text-slate-100 line-clamp-2">{o.titulo}</span>}
                                  <span className="block text-[10px] text-slate-500">lido em {dataBR(o.capturado_em)}</span>
                                </td>
                                <td data-oferta-preco className="py-2 pr-3 text-right font-black text-white whitespace-nowrap">{brl(o.preco)}</td>
                                <td className={`py-2 pr-3 text-right whitespace-nowrap text-xs font-bold ${difPreco == null ? "text-slate-500" : difPreco < 0 ? "text-rose-400" : "text-emerald-400"}`}>{difPreco == null ? "—" : `${difPreco < 0 ? "▼" : "▲"} ${brl(Math.abs(difPreco))} (${pct(difPct)})`}</td>
                                <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{taxas != null ? neg(taxas) : "—"}</td>
                                <td className="py-2 pr-3 text-right text-slate-300 whitespace-nowrap">{lado?.analise ? brl(lado.analise.liquidoPosImposto) : "—"}</td>
                                <td data-oferta-lucro className={`py-2 pr-3 text-right font-black whitespace-nowrap ${lado?.lucro == null ? "text-slate-500" : lado.lucro >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{dinheiro(lado?.lucro ?? null)}</td>
                                <td className="py-2 text-right text-slate-300 whitespace-nowrap">{lado?.margemPct == null ? "—" : `${lado.margemPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-slate-500">Estimativa: comissão, tarifa fixa e frete do canal (regras da Análise de mercado; no Mercado Livre, pelo cadastro dos seus anúncios do SKU, sempre na modalidade Clássico), imposto de 9% e o seu custo do SKU. Não entram frete grátis negociado, anúncios pagos nem promoções. A loja do Google pode ser um vendedor de terceiros, não o canal oficial.</p>
                  </section>

                  {fora.length > 0 && (
                    <details className={`${caixa}`} data-ps-fora>
                      <summary className="cursor-pointer select-none px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400">Outras lojas, fora dos meus canais ({fora.length})</summary>
                      <div className="px-4 pb-4 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-800"><th className="py-2 pr-3">Loja</th><th className="py-2 pr-3">Título</th><th className="py-2 pr-3 text-right">Preço</th><th className="py-2 text-right">Contra o meu PDV</th></tr></thead>
                          <tbody>
                            {fora.map(({ oferta: o, difPreco, difPct }) => (
                              <tr key={o.id} className="border-b border-slate-800/60">
                                <td className="py-2 pr-3 whitespace-nowrap text-slate-300">{o.loja || "—"}</td>
                                <td className="py-2 pr-3 max-w-[420px]">{o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-slate-100 hover:text-indigo-300 line-clamp-2">{o.titulo}</a> : <span className="text-slate-100 line-clamp-2">{o.titulo}</span>}</td>
                                <td className="py-2 pr-3 text-right font-bold text-white whitespace-nowrap">{brl(o.preco)}</td>
                                <td className={`py-2 text-right whitespace-nowrap text-xs font-bold ${difPreco == null ? "text-slate-500" : difPreco < 0 ? "text-rose-400" : "text-emerald-400"}`}>{difPreco == null ? "—" : `${difPreco < 0 ? "▼" : "▲"} ${brl(Math.abs(difPreco))} (${pct(difPct)})`}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                  <p className="text-[10px] text-slate-500">O Google mostra produtos parecidos, não necessariamente idênticos: confira a foto e o título antes de decidir. Os resultados variam com a sua localização e o seu histórico de buscas.</p>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
