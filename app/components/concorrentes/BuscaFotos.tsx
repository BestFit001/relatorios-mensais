"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { favoritoHref } from "../../../lib/concorrentes/favorito";
import { googleShoppingUrl } from "../../../lib/concorrentes/pesquisaCalculo";
import { eanValido, limparEan } from "../../../lib/ean";
import { botao, campo, caixa } from "./comum";

interface Foto {
  url: string; largura: number; altura: number; pixels: number; tipo: "jpeg" | "png" | "gif" | "webp"; bytes: number | null;
  origem: "busca"; pagina: string | null; titulo: string | null; dominio: string;
}
interface Resultado { fotos: Foto[]; termo: string; candidatos: number; paginasLidas: number; paginasTotal: number }

const kb = (b: number | null) => (b == null ? "" : b >= 1_048_576 ? `${(b / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.round(b / 1024)} KB`);
const ext = (t: Foto["tipo"]) => (t === "jpeg" ? "jpg" : t);
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";

async function baixarBlob(f: Foto): Promise<Blob> {
  const r = await fetch("/api/fotos/baixar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: f.url }) });
  if (!r.ok) { let m = "falha ao baixar"; try { m = (await r.json()).erro || m; } catch { /* sem corpo */ } throw new Error(m); }
  return r.blob();
}
function salvar(blob: Blob, nome: string) {
  const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
}

/** Aba "Buscar fotos": você pesquisa no Google (por EAN, palavras ou pela imagem), o favorito lê as lojas encontradas, o painel abre a página de cada loja,
 *  acha as fotos do produto, mede e mostra da maior para a menor resolução. Sem API. */
export default function BuscaFotos({ usuario: _usuario }: { usuario: string }) {
  const [termo, setTermo] = useState("");
  const [textoImport, setTextoImport] = useState("");
  const [importando, setImportando] = useState(false);
  const favoritoRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { favoritoRef.current?.setAttribute("href", favoritoHref()); }, []);
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [res, setRes] = useState<Resultado | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [minimo, setMinimo] = useState(500);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [quebradas, setQuebradas] = useState<Set<string>>(new Set());
  const [progresso, setProgresso] = useState<string | null>(null);

  const eanOk = eanValido(ean);
  const termoBusca = eanOk ? limparEan(ean) : termo.trim();

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
      if (!j.fotos.length) setAviso({ tipo: "erro", texto: !j.paginasLidas
        ? `Não consegui abrir nenhuma das ${j.paginasTotal} página(s) das lojas (muitas bloqueiam acesso automático). Tente de novo ou use outra busca.`
        : `Abri ${j.paginasLidas} página(s), mas não achei foto utilizável (${j.candidatos} candidata(s) sem resposta ou pequenas). Tente outra busca.` });
    } catch (e: any) { setAviso({ tipo: "erro", texto: e?.message || "Erro ao importar." }); }
    finally { setImportando(false); }
  };

  const visiveis = useMemo(() => (res?.fotos || []).filter((f) => Math.max(f.largura, f.altura) >= minimo), [res, minimo]);

  const base = () => slug((eanOk ? limparEan(ean) : "") || sku || res?.termo || "foto");
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

  return (
    <div className="space-y-5" data-busca-fotos>
      <section className={`${caixa} p-5 space-y-4`}>
        <div>
          <h2 className="text-sm font-black text-white uppercase tracking-wider">📷 Buscar fotos do produto</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">Pesquise o produto no Google Shopping (pelo EAN, por palavras ou <b className="text-slate-200">pela imagem</b>, como na Pesquisa de preços). O painel abre a página de cada loja encontrada, acha as fotos do produto e mostra da <b className="text-slate-200">maior para a menor resolução</b>. Sem API e sem custo.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-[11px] font-bold text-slate-400 w-56">EAN / código de barras (recomendado)
            <input data-campo="fotos-ean" inputMode="numeric" className={campo} value={ean} onChange={(e) => setEan(e.target.value)} placeholder="Ex.: 7891234567895" />
            {ean.trim() && <span data-fotos-ean-status className={eanOk ? "text-emerald-400" : "text-rose-400"}>{eanOk ? "✔ EAN válido" : "✕ EAN inválido (confira os dígitos)"}</span>}
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-slate-400 w-44">SKU (opcional, só para o nome dos arquivos)
            <input data-campo="fotos-sku" className={campo} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex.: 12345" />
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-slate-400 w-72">Palavras da busca (se não tiver EAN)
            <input data-campo="fotos-termo" className={campo} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex.: garrafa térmica floral 500ml" />
          </label>
        </div>

        <div className="space-y-3" data-fotos-passos>
          <ol className="text-xs text-slate-400 space-y-3 list-decimal list-inside">
            <li>
              Abra o Google Shopping:{" "}
              <a data-acao="fotos-abrir-shopping" aria-disabled={!termoBusca} href={termoBusca ? googleShoppingUrl(termoBusca) : undefined} target="_blank" rel="noopener noreferrer"
                className={`${botao} !py-1 inline-block bg-slate-800 text-slate-200 hover:bg-slate-700 ${termoBusca ? "" : "opacity-40 pointer-events-none"}`}>Abrir Google Shopping ↗</a>{" "}
              {termoBusca ? <>com “{termoBusca}”.</> : <span className="text-slate-500">(informe o EAN ou as palavras da busca)</span>}
              <span className="block text-slate-500 mt-1">Prefere pela foto? Abra o Google, clique no ícone da câmera (pesquisa por imagem), envie ou cole a foto e vá para a aba <b>Produtos</b>, como na Pesquisa de preços.</span>
            </li>
            <li>
              Com os resultados (com preço) na tela, clique no favorito <a ref={favoritoRef} data-favorito onClick={(e) => e.preventDefault()} draggable className="inline-block align-middle px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider cursor-grab">📋 Capturar</a>{" "}
              <button data-acao="copiar-favorito" onClick={copiarFavorito} className="text-[11px] underline text-slate-300 hover:text-white cursor-pointer">não consegui arrastar</button>
              <span className="text-slate-500"> (é o mesmo favorito da Pesquisa de preços: arraste para a barra de favoritos uma vez só)</span>
            </li>
            <li>Cole o texto aqui e importe:</li>
          </ol>
          <textarea data-campo="fotos-texto" value={textoImport} onChange={(e) => setTextoImport(e.target.value)} placeholder="Cole aqui o texto que o favorito copiou no Google" className={`${campo} w-full h-20 font-mono text-[11px]`} />
          <div className="flex flex-wrap items-center gap-3">
            <button data-acao="fotos-importar" disabled={!textoImport.trim() || importando} onClick={importar} className={`${botao} bg-emerald-700 hover:bg-emerald-600 text-white`}>{importando ? "Abrindo as lojas e medindo as fotos… (até 1 min)" : "Importar fotos"}</button>
            <span className="text-[11px] text-slate-500">O EAN acha o produto certo; sem EAN o Google mostra produtos parecidos. Só entram resultados com preço (aba Shopping/Produtos).</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 max-w-3xl">As fotos pertencem a quem as publicou. Para uso comercial, prefira as do fabricante, do fornecedor ou da marca; os marketplaces não permitem copiar foto de anúncio de concorrente. Algumas lojas bloqueiam o acesso automático: nesses casos a foto não aparece aqui.</p>
        {aviso && <div data-aviso={aviso.tipo} className={`text-xs font-bold rounded-lg px-3 py-2 ${aviso.tipo === "ok" ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-rose-950 text-rose-300 border border-rose-800"}`}>{aviso.texto}</div>}
      </section>

      {res && res.fotos.length > 0 && (
        <section className={`${caixa} p-5 space-y-4`} data-fotos-resultado>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400" data-fotos-resumo>
              <b className="text-slate-200">{visiveis.length}</b> de {res.fotos.length} foto(s) · {res.paginasLidas} de {res.paginasTotal} página(s) de loja abertas
              {res.termo && <> · busca: <b className="text-slate-200">{res.termo}</b></>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select data-fotos-min value={minimo} onChange={(e) => setMinimo(Number(e.target.value))} className={campo}>
                <option value={0}>Qualquer tamanho</option><option value={500}>Lado maior ≥ 500 px</option><option value={800}>≥ 800 px</option><option value={1000}>≥ 1000 px</option><option value={1500}>≥ 1500 px</option>
              </select>
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
                  <span className="absolute top-2 right-2 text-[10px] font-black px-1.5 py-0.5 rounded border bg-sky-950 text-sky-300 border-sky-800">Loja</span>
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
