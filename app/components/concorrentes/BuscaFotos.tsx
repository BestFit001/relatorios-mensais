"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { favoritoHref } from "../../../lib/concorrentes/favorito";
import { eanValido, googleImagensEanUrl, googleShoppingEanUrl, limparEan } from "../../../lib/ean";
import { botao, campo, caixa } from "./comum";

interface Foto {
  url: string; largura: number; altura: number; pixels: number; tipo: "jpeg" | "png" | "gif" | "webp"; bytes: number | null;
  origem: "igual" | "parcial" | "parecida" | "busca"; pagina: string | null; titulo: string | null; dominio: string;
}
interface Resultado { fotos: Foto[]; palpite: string; entidades: string[]; candidatos: number; usados: number; limite: number; gratuito?: boolean }
interface Uso { usados: number; limite: number; configurado: boolean }

const ROTULO_ORIGEM = { igual: "Igual", parcial: "Parcial", parecida: "Parecida", busca: "Bing" } as const;
const COR_ORIGEM = { igual: "bg-emerald-950 text-emerald-300 border-emerald-800", parcial: "bg-amber-950 text-amber-300 border-amber-800", parecida: "bg-slate-800 text-slate-300 border-slate-700", busca: "bg-sky-950 text-sky-300 border-sky-800" } as const;
const kb = (b: number | null) => (b == null ? "" : b >= 1_048_576 ? `${(b / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.round(b / 1024)} KB`);
const ext = (t: Foto["tipo"]) => (t === "jpeg" ? "jpg" : t);
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";

/** Reduz a foto para no máximo 1600 px (JPEG): o Vision não precisa de mais e o envio fica leve. Devolve data URL. */
async function prepararImagem(arquivo: Blob): Promise<string> {
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * escala)); c.height = Math.max(1, Math.round(bmp.height * escala));
  const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

async function baixarBlob(f: Foto): Promise<Blob> {
  const r = await fetch("/api/fotos/baixar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: f.url }) });
  if (!r.ok) { let m = "falha ao baixar"; try { m = (await r.json()).erro || m; } catch { /* sem corpo */ } throw new Error(m); }
  return r.blob();
}
function salvar(blob: Blob, nome: string) {
  const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
}

const eanOk0 = (v: string) => eanValido(v);

/** Aba "Buscar fotos": foto de referência -> Google Cloud Vision acha as imagens iguais/parecidas na internet -> maior resolução primeiro, para baixar. */
export default function BuscaFotos({ usuario }: { usuario: string }) {
  const [modo, setModo] = useState<"gratis" | "vision">("gratis");
  const [termo, setTermo] = useState("");
  const [textoImport, setTextoImport] = useState("");
  const [importando, setImportando] = useState(false);
  const favoritoRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { favoritoRef.current?.setAttribute("href", favoritoHref()); }, [modo]);
  const [uso, setUso] = useState<Uso | null>(null);
  const [erroUso, setErroUso] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [previa, setPrevia] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [minimo, setMinimo] = useState(500);
  const [origem, setOrigem] = useState<"todas" | "iguais_parciais" | "iguais">("todas");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [quebradas, setQuebradas] = useState<Set<string>>(new Set());
  const [progresso, setProgresso] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const carregarUso = useCallback(async () => {
    try {
      const r = await fetch("/api/fotos/buscar", { cache: "no-store" }); const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "erro"); setUso(j); setErroUso("");
    } catch (e: any) { setErroUso(e?.message || "Não consegui ler o uso do mês."); }
  }, []);
  useEffect(() => { carregarUso(); }, [carregarUso]);

  const receber = useCallback(async (arquivo: Blob | null | undefined) => {
    if (!arquivo || !arquivo.type.startsWith("image/")) return;
    try { setPrevia(await prepararImagem(arquivo)); setRes(null); setAviso(null); }
    catch { setAviso({ tipo: "erro", texto: "Não consegui abrir essa imagem. Use JPG, PNG, WebP ou GIF." }); }
  }, []);

  // Ctrl+V com a imagem copiada
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      if (item) { e.preventDefault(); receber(item.getAsFile()); }
    };
    document.addEventListener("paste", colar); return () => document.removeEventListener("paste", colar);
  }, [receber]);

  const buscar = async () => {
    if (!previa) return;
    setBuscando(true); setAviso(null); setRes(null); setMarcadas(new Set()); setQuebradas(new Set());
    try {
      const r = await fetch("/api/fotos/buscar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imagem: previa, sku: (eanOk ? limparEan(ean) : sku.trim()), usuario }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro || "Erro na busca.");
      setRes(j); setUso((u) => (u ? { ...u, usados: j.usados, limite: j.limite } : u));
      if (!j.fotos.length) setAviso({ tipo: "erro", texto: j.candidatos ? `O Google achou ${j.candidatos} imagem(ns), mas nenhuma pôde ser aberta (sites bloqueiam ou removeram). Tente outra foto.` : "O Google não encontrou essa foto na internet. Tente uma foto mais nítida, só do produto." });
    } catch (e: any) { setAviso({ tipo: "erro", texto: e?.message || "Erro na busca." }); carregarUso(); }
    finally { setBuscando(false); }
  };

  const copiarFavorito = async () => {
    try { await navigator.clipboard.writeText(favoritoHref()); setAviso({ tipo: "ok", texto: "Código do favorito copiado. Crie um favorito novo e cole no campo de endereço (URL)." }); }
    catch { setAviso({ tipo: "erro", texto: "Não consegui copiar. Arraste o botão para a barra de favoritos." }); }
  };

  const importar = async () => {
    setImportando(true); setAviso(null); setRes(null); setMarcadas(new Set()); setQuebradas(new Set());
    try {
      const r = await fetch("/api/fotos/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: textoImport }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro || "Erro ao importar.");
      setRes(j); setTextoImport("");
      if (!j.fotos.length) setAviso({ tipo: "erro", texto: `O Bing listou ${j.candidatos} foto(s), mas nenhuma pôde ser aberta (os sites bloqueiam ou removeram). Tente outra busca.` });
    } catch (e: any) { setAviso({ tipo: "erro", texto: e?.message || "Erro ao importar." }); }
    finally { setImportando(false); }
  };

  const termoBing = eanOk0(ean) ? limparEan(ean) : termo.trim();

  const visiveis = useMemo(() => (res?.fotos || []).filter((f) =>
    Math.max(f.largura, f.altura) >= minimo && (origem === "todas" || (origem === "iguais" ? f.origem === "igual" : f.origem !== "parecida"))), [res, minimo, origem]);

  const eanOk = eanValido(ean);
  const base = () => slug((eanOk ? limparEan(ean) : "") || sku || res?.palpite || "foto");
  const nomeArquivo = (f: Foto, i: number) => `${base()}-${String(i + 1).padStart(2, "0")}-${f.largura}x${f.altura}.${ext(f.tipo)}`;
  const alternar = (url: string) => setMarcadas((s) => { const n = new Set(s); n.has(url) ? n.delete(url) : n.add(url); return n; });

  const baixarUma = async (f: Foto, i: number) => {
    setProgresso(`Baixando ${f.dominio}…`);
    try { salvar(await baixarBlob(f), nomeArquivo(f, i)); setAviso({ tipo: "ok", texto: "Foto baixada." }); }
    catch (e: any) { setAviso({ tipo: "erro", texto: `${f.dominio}: ${e?.message}` }); }
    finally { setProgresso(null); }
  };

  const baixarZip = async () => {
    const alvo = visiveis.map((f, i) => ({ f, i })).filter(({ f }) => marcadas.has(f.url));
    if (!alvo.length) return;
    const JSZip = (await import("jszip")).default; const zip = new JSZip(); let feitas = 0; const falhas: string[] = [];
    for (const { f, i } of alvo) {
      setProgresso(`Baixando ${feitas + falhas.length + 1}/${alvo.length}…`);
      try { zip.file(nomeArquivo(f, i), await baixarBlob(f)); feitas++; } catch { falhas.push(f.dominio); }
    }
    setProgresso(null);
    if (!feitas) return setAviso({ tipo: "erro", texto: "Nenhuma foto pôde ser baixada (os sites bloquearam)." });
    salvar(await zip.generateAsync({ type: "blob" }), `${base()}-fotos.zip`);
    setAviso({ tipo: falhas.length ? "erro" : "ok", texto: `ZIP com ${feitas} foto(s)${falhas.length ? `; não baixaram: ${falhas.join(", ")}` : ""}.` });
  };

  const restante = uso ? uso.limite - uso.usados : null;

  return (
    <div className="space-y-5" data-busca-fotos>
      <section className={`${caixa} p-5 space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">📷 Buscar fotos do produto</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">Ache as fotos do produto na internet e baixe as de <b className="text-slate-200">maior resolução</b>. O painel abre cada foto, mede e mostra da maior para a menor.</p>
          </div>
          <div className="flex rounded-xl overflow-hidden border border-slate-700" role="tablist" data-fotos-modos>
            <button role="tab" aria-selected={modo === "gratis"} data-fotos-modo="gratis" onClick={() => { setModo("gratis"); setAviso(null); }} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wider cursor-pointer ${modo === "gratis" ? "bg-emerald-700 text-white" : "bg-slate-900 text-slate-400 hover:text-white"}`}>🆓 Grátis (Bing, sem API)</button>
            <button role="tab" aria-selected={modo === "vision"} data-fotos-modo="vision" onClick={() => { setModo("vision"); setAviso(null); }} className={`px-4 py-2 text-[11px] font-black uppercase tracking-wider cursor-pointer ${modo === "vision" ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:text-white"}`}>🔎 Pela foto (Google Vision)</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-[11px] font-bold text-slate-400 w-56">EAN / código de barras {modo === "gratis" ? "(recomendado)" : "(opcional)"}
            <input data-campo="fotos-ean" inputMode="numeric" className={campo} value={ean} onChange={(e) => setEan(e.target.value)} placeholder="Ex.: 7891234567895" />
            {ean.trim() && <span data-fotos-ean-status className={eanOk ? "text-emerald-400" : "text-rose-400"}>{eanOk ? "✔ EAN válido" : "✕ EAN inválido (confira os dígitos)"}</span>}
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-slate-400 w-44">SKU (opcional)
            <input data-campo="fotos-sku" className={campo} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex.: 12345" />
          </label>
          {modo === "gratis" && (
            <label className="grid gap-1 text-[11px] font-bold text-slate-400 w-72">Palavras da busca (se não tiver EAN)
              <input data-campo="fotos-termo" className={campo} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex.: garrafa térmica floral 500ml" />
            </label>
          )}
        </div>

        {modo === "gratis" ? (
          <div className="space-y-3" data-fotos-gratis>
            <ol className="text-xs text-slate-400 space-y-3 list-decimal list-inside">
              <li>
                Abra o Bing Imagens com a busca:{" "}
                <a data-acao="fotos-abrir-bing" aria-disabled={!termoBing} href={termoBing ? `https://www.bing.com/images/search?q=${encodeURIComponent(termoBing)}` : undefined} target="_blank" rel="noopener noreferrer"
                  className={`${botao} !py-1 inline-block bg-slate-800 text-slate-200 hover:bg-slate-700 ${termoBing ? "" : "opacity-40 pointer-events-none"}`}>Abrir Bing Imagens ↗</a>{" "}
                {termoBing ? <>com “{termoBing}”.</> : <span className="text-slate-500">(informe o EAN ou as palavras da busca)</span>}
                {eanOk && <> <a data-acao="fotos-ean-imagens" href={googleImagensEanUrl(ean)} target="_blank" rel="noopener noreferrer" className="underline text-slate-300 hover:text-white">Google Imagens pelo EAN</a> · <a data-acao="fotos-ean-shopping" href={googleShoppingEanUrl(ean)} target="_blank" rel="noopener noreferrer" className="underline text-slate-300 hover:text-white">Google Shopping pelo EAN</a> (para conferir)</>}
              </li>
              <li>
                Espere as fotos aparecerem e clique no favorito <a ref={favoritoRef} data-favorito onClick={(e) => e.preventDefault()} draggable className="inline-block align-middle px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider cursor-grab">📋 Capturar</a>{" "}
                <button data-acao="copiar-favorito" onClick={copiarFavorito} className="text-[11px] underline text-slate-300 hover:text-white cursor-pointer">não consegui arrastar</button>
                <span className="text-slate-500"> (é o mesmo favorito das outras abas: arraste para a barra de favoritos; no Bing ele rola a página e copia o endereço de cada foto em tamanho original)</span>
              </li>
              <li>Cole o texto aqui e importe:</li>
            </ol>
            <textarea data-campo="fotos-texto" value={textoImport} onChange={(e) => setTextoImport(e.target.value)} placeholder="Cole aqui o texto que o favorito copiou no Bing Imagens" className={`${campo} w-full h-20 font-mono text-[11px]`} />
            <div className="flex flex-wrap items-center gap-3">
              <button data-acao="fotos-importar" disabled={!textoImport.trim() || importando} onClick={importar} className={`${botao} bg-emerald-700 hover:bg-emerald-600 text-white`}>{importando ? "Medindo as fotos… (até 1 min)" : "Importar fotos"}</button>
              <span className="text-[11px] text-slate-500">Sem API e sem custo. O EAN acha o produto certo; sem EAN o Bing mostra fotos parecidas.</span>
            </div>
            <p className="text-[11px] text-slate-500 max-w-3xl">Para buscar pela foto sem API: envie-a em <a href="https://www.bing.com/visualsearch" target="_blank" rel="noopener noreferrer" className="underline text-slate-300">bing.com/visualsearch</a> e clique no favorito na página de resultados (experimental: o Bing pode mudar essa página).</p>
          </div>
        ) : (
          <div className="space-y-4" data-fotos-vision>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-xs text-slate-400 max-w-3xl">Envie uma foto de referência: o Google Cloud Vision procura essa imagem na internet. Cada busca usa 1 da cota do mês e <b className="text-slate-300">exige cobrança ativa no projeto do Google</b> (a cota gratuita é de 1.000 por mês).</p>
              <div className="text-right" data-fotos-uso>
                {uso && <div className={`text-xs font-black ${restante != null && restante <= 50 ? "text-amber-400" : "text-slate-300"}`}>Buscas neste mês: {uso.usados} de {uso.limite}</div>}
                <div className="text-[10px] text-slate-500">cota gratuita do Google: 1.000 por mês</div>
                {erroUso && <div className="text-[10px] text-rose-400 max-w-xs">{erroUso}</div>}
              </div>
            </div>

            {uso && !uso.configurado && (
              <div className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-4 text-xs text-amber-200 space-y-1" data-fotos-config-falta>
                <b>Falta configurar a chave do Google Cloud Vision.</b>
                <ol className="list-decimal pl-5 space-y-0.5 text-amber-100/90">
                  <li>Em console.cloud.google.com, crie (ou escolha) um projeto, ative a <b>Cloud Vision API</b> e a <b>cobrança</b> do projeto.</li>
                  <li>Em “APIs e serviços › Credenciais”, crie uma <b>chave de API</b> e restrinja-a à Cloud Vision API.</li>
                  <li>Na Vercel (Settings › Environment Variables), crie <code className="font-mono">GOOGLE_VISION_API_KEY</code> com essa chave e faça um novo deploy.</li>
                </ol>
                <div className="text-amber-300/80">A chave fica só no servidor; nunca cole ela no código nem no chat.</div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-[260px_1fr] items-start">
              <div
                data-fotos-zona onClick={() => arquivoRef.current?.click()}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); receber(e.dataTransfer.files?.[0]); }}
                className="aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950 flex items-center justify-center text-center p-3 cursor-pointer overflow-hidden">
                {previa
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={previa} alt="Foto de referência" data-fotos-previa className="max-h-full max-w-full object-contain" />
                  : <span className="text-xs text-slate-500">Cole (Ctrl+V), arraste ou clique para escolher a foto de referência</span>}
                <input ref={arquivoRef} type="file" accept="image/*" hidden data-fotos-arquivo onChange={(e) => { receber(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button data-acao="fotos-buscar" disabled={!previa || buscando || (uso != null && !uso.configurado)} onClick={buscar} className={`${botao} bg-indigo-600 hover:bg-indigo-500 text-white`}>
                    {buscando ? "Procurando… (até 1 min)" : "🔎 Buscar fotos"}
                  </button>
                  {previa && !buscando && <button onClick={() => { setPrevia(null); setRes(null); setAviso(null); }} className={`${botao} bg-slate-800 hover:bg-slate-700 text-slate-300`}>Trocar foto</button>}
                  <span className="text-[11px] text-slate-500">Use uma foto nítida, só do produto, sem texto por cima.</span>
                </div>
                {eanOk && (
                  <div className="flex flex-wrap gap-2" data-fotos-ean-links>
                    <a data-acao="fotos-ean-imagens" href={googleImagensEanUrl(ean)} target="_blank" rel="noopener noreferrer" className={`${botao} !py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 inline-block`}>Google Imagens pelo EAN ↗</a>
                    <a data-acao="fotos-ean-shopping" href={googleShoppingEanUrl(ean)} target="_blank" rel="noopener noreferrer" className={`${botao} !py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 inline-block`}>Google Shopping pelo EAN ↗</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-500 max-w-3xl">As fotos pertencem a quem as publicou. Para uso comercial, prefira as do fabricante, do fornecedor ou da marca; os marketplaces não permitem copiar foto de anúncio de concorrente.</p>
        {aviso && <div data-aviso={aviso.tipo} className={`text-xs font-bold rounded-lg px-3 py-2 ${aviso.tipo === "ok" ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-rose-950 text-rose-300 border border-rose-800"}`}>{aviso.texto}</div>}
      </section>

      {res && res.fotos.length > 0 && (
        <section className={`${caixa} p-5 space-y-4`} data-fotos-resultado>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400" data-fotos-resumo>
              <b className="text-slate-200">{visiveis.length}</b> de {res.fotos.length} foto(s) abertas ({res.candidatos} achadas {res.gratuito ? "no Bing" : "pelo Google"})
              {res.palpite && <> · {res.gratuito ? "busca" : "o Google acha que é"}: <b className="text-slate-200">{res.palpite}</b></>}
              {res.entidades.length > 0 && <> · {res.entidades.slice(0, 4).join(", ")}</>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select data-fotos-min value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} className={campo}>
                <option value={0}>Qualquer tamanho</option><option value={500}>Lado maior ≥ 500 px</option><option value={800}>≥ 800 px</option><option value={1000}>≥ 1000 px</option><option value={1500}>≥ 1500 px</option>
              </select>
              {!res.gratuito && <select data-fotos-origem value={origem} onChange={(e) => setOrigem(e.target.value as any)} className={campo}>
                <option value="todas">Iguais, parciais e parecidas</option><option value="iguais_parciais">Só iguais e parciais</option><option value="iguais">Só iguais</option>
              </select>}
              <button data-acao="fotos-marcar-todas" onClick={() => setMarcadas(new Set(visiveis.map((f) => f.url)))} className={`${botao} bg-slate-800 hover:bg-slate-700 text-slate-200`}>Marcar todas</button>
              <button data-acao="fotos-zip" disabled={!marcadas.size || progresso != null} onClick={baixarZip} className={`${botao} bg-emerald-700 hover:bg-emerald-600 text-white`}>⬇ Baixar marcadas (ZIP){marcadas.size ? ` · ${marcadas.size}` : ""}</button>
            </div>
          </div>
          {progresso && <div className="text-xs text-indigo-300 font-bold" data-fotos-progresso>{progresso}</div>}
          {visiveis.length === 0 && <p className="text-xs text-slate-500">Nenhuma foto com esses filtros. Diminua o tamanho mínimo.</p>}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {visiveis.map((f, i) => (
              <div key={f.url} data-foto-card data-foto-largura={f.largura} className={`rounded-xl border bg-slate-950 overflow-hidden flex flex-col ${marcadas.has(f.url) ? "border-emerald-600" : "border-slate-800"}`}>
                <label className="relative block aspect-square bg-slate-900 cursor-pointer">
                  {quebradas.has(f.url)
                    ? <span className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-500 text-center p-3">Prévia bloqueada pelo site (dá para baixar)</span>
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={f.url} alt={f.titulo || f.dominio} loading="lazy" referrerPolicy="no-referrer" onError={() => setQuebradas((s) => new Set(s).add(f.url))} className="absolute inset-0 w-full h-full object-contain" />}
                  <input type="checkbox" data-foto-marcar checked={marcadas.has(f.url)} onChange={() => alternar(f.url)} className="absolute top-2 left-2 w-4 h-4 accent-emerald-500" />
                  <span className={`absolute top-2 right-2 text-[10px] font-black px-1.5 py-0.5 rounded border ${COR_ORIGEM[f.origem]}`}>{ROTULO_ORIGEM[f.origem]}</span>
                </label>
                <div className="p-2 space-y-1 text-[11px]">
                  <div className="font-black text-white" data-foto-dim>{f.largura}×{f.altura} <span className="text-slate-500 font-bold">{[ext(f.tipo).toUpperCase(), kb(f.bytes)].filter(Boolean).join(" · ")}</span></div>
                  <div className="text-slate-400 truncate" title={f.titulo || f.dominio}>{f.dominio}{f.titulo ? ` — ${f.titulo}` : ""}</div>
                  <div className="flex gap-2 pt-1">
                    <button data-acao="foto-baixar" disabled={progresso != null} onClick={() => baixarUma(f, i)} className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-black cursor-pointer disabled:opacity-40">Baixar</button>
                    {f.pagina && <a href={f.pagina} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold">Abrir página</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
