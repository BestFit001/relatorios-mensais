"use client";
// Gerador de imagens do anúncio: sobe até 5 fotos do produto, escolhe a marca e o app monta até 5 imagens no padrão cadastrado para a marca
// (tabela padroes_imagens). As posições "cena de IA" ficam travadas até existir um serviço de geração de imagem configurado no servidor.

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import Navbar from "../components/Navbar";
import {
  MAX_FOTOS, MAX_POSICOES, ROTULO_LAYOUT, canvasParaBlob, carregarFoto, carregarImagem, fotosDaPosicao, montarImagem, nomeDoArquivoImagem, normalizarPadrao, padraoInicial,
  type CaixaFrac, type Foto, type FundoModo, type LayoutImagem, type LogoPosicao, type MedidasProduto, type PadraoImagem,
} from "../../lib/imagensAnuncio";
import { chavePaiDe } from "../../lib/dimensoesPeso";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

interface FotoEnviada extends Foto { url: string; nome: string }
interface GuiaUsado { foto: number; corpo: CaixaFrac; limpo: boolean }
interface Resultado { posicao: number; nome: string; arquivo: string; url?: string; blob?: Blob; largura: number; altura: number; travada?: string; erro?: string; guia?: GuiaUsado; aviso?: string }
interface AjusteMedidas { foto?: number; corpo?: CaixaFrac }
interface StatusIA { configurado: boolean; mensagem: string }

const ROTULO_LOGO: Record<LogoPosicao, string> = {
  superior_esquerdo: "Canto superior esquerdo", superior_direito: "Canto superior direito", inferior_esquerdo: "Canto inferior esquerdo",
  inferior_direito: "Canto inferior direito", centro_inferior: "Centro, embaixo",
};

const campo = "bg-[#0d0f18] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-full";
const botao = "px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

/** Foto reduzida (máx. 1024 px) em base64, para mandar de referência ao serviço de imagem. */
function fotoReduzida(f: Foto): { base64: string; mime: string } {
  const k = Math.min(1, 1024 / Math.max(f.largura, f.altura));
  const c = document.createElement("canvas"); c.width = Math.round(f.largura * k); c.height = Math.round(f.altura * k);
  c.getContext("2d")!.drawImage(f.img, 0, 0, c.width, c.height);
  return { base64: c.toDataURL("image/jpeg", 0.85).split(",")[1], mime: "image/jpeg" };
}

export default function GeradorImagensPage() {
  const [aba, setAba] = useState<"gerar" | "padrao">("gerar");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [marcas, setMarcas] = useState<string[]>([]);
  const [marca, setMarca] = useState("");
  const [novaMarca, setNovaMarca] = useState("");
  const [padroes, setPadroes] = useState<PadraoImagem[]>([]);
  const [statusIA, setStatusIA] = useState<StatusIA>({ configurado: false, mensagem: "Verificando o serviço de imagem…" });
  const [fotos, setFotos] = useState<FotoEnviada[]>([]);
  const [sku, setSku] = useState("");
  const [medidas, setMedidas] = useState<MedidasProduto>({});
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [ajustes, setAjustes] = useState<Record<number, AjusteMedidas>>({});
  const logosCache = useRef(new Map<string, Foto>());

  async function carregarMarcas(manter?: string) {
    const [a, b] = await Promise.all([supabase.from("padroes_anuncios").select("marca"), supabase.from("padroes_imagens").select("marca")]);
    const todas = new Map<string, string>();
    for (const l of [...(a.data || []), ...(b.data || [])]) { const m = String((l as any).marca || "").trim(); if (m && !todas.has(m.toLowerCase())) todas.set(m.toLowerCase(), m); }
    const lista = [...todas.values()].sort((x, y) => x.localeCompare(y, "pt-BR"));
    setMarcas(lista);
    if (manter && !lista.some((m) => m.toLowerCase() === manter.toLowerCase())) setMarcas([...lista, manter]);
  }
  async function carregarPadroes(m: string) {
    if (!m) { setPadroes([]); return; }
    const { data, error } = await supabase.from("padroes_imagens").select("*").ilike("marca", m).order("posicao");
    if (error) { setMsg("Não consegui ler o padrão da marca: " + error.message); return; }
    setPadroes((data || []).map(normalizarPadrao));
  }
  useEffect(() => {
    carregarMarcas();
    fetch("/api/gerar-cena-ia").then((r) => r.json()).then((s) => setStatusIA({ configurado: !!s.configurado, mensagem: String(s.mensagem || "") })).catch(() => setStatusIA({ configurado: false, mensagem: "Travado: não consegui consultar o serviço de imagem." }));
  }, []);
  useEffect(() => { setResultados([]); carregarPadroes(marca); }, [marca]);

  // ───────── fotos ─────────
  async function escolherFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files || []); e.target.value = "";
    if (!arquivos.length) return;
    setMsg("");
    const livres = MAX_FOTOS - fotos.length;
    if (livres <= 0) { setMsg(`Já são ${MAX_FOTOS} fotos. Remova alguma para trocar.`); return; }
    const aceitas = arquivos.filter((a) => /^image\/(jpeg|png|webp)$/.test(a.type)).slice(0, livres);
    if (aceitas.length < arquivos.length) setMsg(`Usei ${aceitas.length} de ${arquivos.length} arquivo(s): só entram fotos JPG, PNG ou WebP, até ${MAX_FOTOS} no total.`);
    try {
      const novas: FotoEnviada[] = [];
      for (const a of aceitas) { const f = await carregarFoto(a); novas.push({ ...f, nome: a.name }); }
      setFotos((atual) => [...atual, ...novas]); setResultados([]);
    } catch (err: any) { setMsg("Não consegui abrir uma das fotos: " + (err?.message || err)); }
  }
  function removerFoto(i: number) { setFotos((f) => { URL.revokeObjectURL(f[i].url); return f.filter((_, k) => k !== i); }); setResultados([]); }

  async function buscarMedidas() {
    const pai = chavePaiDe({ sku }); if (!pai) return;
    const { data } = await supabase.from("dimensoes_peso").select("*").ilike("sku_pai", pai).limit(1);
    const d: any = data?.[0];
    if (!d) { setMsg(`Não achei medidas do SKU pai ${pai} na aba Dimensões e Peso. Preencha à mão se quiser a imagem de medidas.`); return; }
    setMsg(""); setMedidas((m) => ({ ...m, altura: d.altura, largura: d.largura, comprimento: d.comprimento }));
  }

  // ───────── gerar ─────────
  async function carregarLogo(p: PadraoImagem): Promise<Foto | null> {
    if (!p.logo_url) return null;
    if (!logosCache.current.has(p.logo_url)) { try { const img = await carregarImagem(p.logo_url, true); logosCache.current.set(p.logo_url, { img, largura: img.naturalWidth, altura: img.naturalHeight }); } catch { return null; } }
    return logosCache.current.get(p.logo_url) || null;
  }
  /** Monta uma imagem do tipo "montagem"; na de medidas aceita foto e caixa do produto escolhidas à mão. */
  async function montarUma(p: PadraoImagem, ajuste?: AjusteMedidas): Promise<{ blob: Blob; guia?: GuiaUsado; semLogo: boolean; aviso?: string }> {
    const logo = await carregarLogo(p);
    const usado: PadraoImagem = p.layout === "medidas" && ajuste?.foto ? { ...p, fotos: [ajuste.foto] } : p;
    const ctxM = { fotos, logo, medidas, caixaProduto: ajuste?.corpo || null } as Parameters<typeof montarImagem>[1];
    const canvas = montarImagem(usado, ctxM);
    const blob = await canvasParaBlob(canvas, p.formato);
    const g = ctxM.layoutGuia;
    return { blob, guia: g ? { foto: (fotosDaPosicao(usado, fotos.length)[0] ?? 0) + 1, corpo: ajuste?.corpo || { x0: (g.corpo.x - g.foto.x) / g.foto.w, y0: (g.corpo.y - g.foto.y) / g.foto.h, x1: (g.corpo.x + g.corpo.w - g.foto.x) / g.foto.w, y1: (g.corpo.y + g.corpo.h - g.foto.y) / g.foto.h }, limpo: g.limpo } : undefined, semLogo: !!p.logo_url && !logo, aviso: ctxM.avisoFundo };
  }
  async function ajustarMedidas(posicao: number, mudanca: AjusteMedidas) {
    const p = padroes.find((x) => x.posicao === posicao); if (!p) return;
    const novo = { ...(ajustes[posicao] || {}), ...mudanca }; if (mudanca.foto) delete novo.corpo; // foto nova: volta à detecção automática
    setAjustes((a) => ({ ...a, [posicao]: novo }));
    try {
      const r = await montarUma(p, novo);
      setResultados((lista) => lista.map((x) => { if (x.posicao !== posicao) return x; if (x.url) URL.revokeObjectURL(x.url); return { ...x, blob: r.blob, url: URL.createObjectURL(r.blob), guia: r.guia, aviso: r.aviso }; }));
    } catch (e: any) { setMsg("Não consegui refazer a imagem de medidas: " + (e?.message || e)); }
  }
  async function gerar() {
    setMsg(""); setResultados([]); setAjustes({});
    const ativos = padroes.filter((p) => p.ativo).sort((a, b) => a.posicao - b.posicao).slice(0, MAX_POSICOES);
    if (!marca) { setMsg("Escolha a marca."); return; }
    if (!ativos.length) { setMsg("Essa marca ainda não tem padrão de imagens. Cadastre na aba “Padrão da marca”."); return; }
    if (!fotos.length) { setMsg("Suba pelo menos uma foto do produto."); return; }
    setOcupado("Montando as imagens…");
    const saida: Resultado[] = [];
    try {
      for (const p of ativos) {
        const base = { posicao: p.posicao, nome: p.nome || `Imagem ${p.posicao}`, arquivo: nomeDoArquivoImagem(sku, p), largura: p.largura, altura: p.altura };
        if (p.tipo === "cena_ia") {
          if (!statusIA.configurado) { saida.push({ ...base, travada: statusIA.mensagem }); continue; }
          try {
            const ref = fotoReduzida(fotos[fotosDaPosicao(p, fotos.length)[0] ?? 0]);
            const r = await fetch("/api/gerar-cena-ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: p.prompt_ia, fotoBase64: ref.base64, fotoMime: ref.mime, largura: p.largura, altura: p.altura }) });
            const j = await r.json();
            if (!r.ok) { saida.push({ ...base, travada: r.status === 423 ? String(j.mensagem || statusIA.mensagem) : undefined, erro: r.status === 423 ? undefined : String(j.erro || "falhou") }); continue; }
            const blob = await (await fetch(`data:${j.mime};base64,${j.base64}`)).blob();
            saida.push({ ...base, blob, url: URL.createObjectURL(blob) });
          } catch (e: any) { saida.push({ ...base, erro: String(e?.message || e) }); }
          continue;
        }
        const r = await montarUma(p, ajustes[p.posicao]);
        if (r.semLogo) base.nome += " (logo não carregou)";
        saida.push({ ...base, blob: r.blob, url: URL.createObjectURL(r.blob), guia: r.guia, aviso: r.aviso });
      }
      setResultados(saida);
    } catch (e: any) { setMsg("Erro ao montar as imagens: " + (e?.message || e)); }
    setOcupado("");
  }

  function baixar(r: Resultado) {
    if (!r.url) return;
    const a = document.createElement("a"); a.href = r.url; a.download = r.arquivo; document.body.appendChild(a); a.click(); a.remove();
  }
  async function baixarZip() {
    const prontas = resultados.filter((r) => r.blob); if (!prontas.length) return;
    const zip = new JSZip(); prontas.forEach((r) => zip.file(r.arquivo, r.blob!));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${(sku || "produto").trim().replace(/[^\w.-]+/g, "_")}_imagens.zip`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ───────── padrão da marca ─────────
  function ajustar(posicao: number, mudanca: Partial<PadraoImagem>) { setPadroes((l) => l.map((p) => (p.posicao === posicao ? { ...p, ...mudanca } : p))); }
  function criarPadraoInicial() { if (marca) setPadroes(padraoInicial(marca)); }
  async function salvarPadrao() {
    if (!marca) return;
    setOcupado("Salvando o padrão…"); setMsg("");
    const linhas = padroes.map((p) => ({ ...p, id: undefined, marca, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("padroes_imagens").upsert(linhas, { onConflict: "marca,posicao" });
    setOcupado("");
    if (error) { setMsg("Não consegui salvar o padrão: " + error.message); return; }
    setMsg(`Padrão da marca ${marca} salvo.`); carregarMarcas(marca); carregarPadroes(marca);
  }
  async function enviarLogo(posicao: number, arquivo: File | undefined, paraTodas: boolean) {
    if (!arquivo) return;
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) { setMsg("O logo precisa ser PNG, JPG ou WebP (PNG com fundo transparente é o melhor)."); return; }
    setOcupado("Enviando o logo…"); setMsg("");
    const caminho = `padroes-imagens/${marca.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${Date.now()}-${arquivo.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage.from("anexos").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    setOcupado("");
    if (error) { setMsg("Não consegui enviar o logo: " + error.message); return; }
    const url = supabase.storage.from("anexos").getPublicUrl(caminho).data.publicUrl;
    if (paraTodas) setPadroes((l) => l.map((p) => ({ ...p, logo_url: url }))); else ajustar(posicao, { logo_url: url });
  }

  const marcaAtual = marca;
  const ativosQtd = useMemo(() => padroes.filter((p) => p.ativo).length, [padroes]);

  return (
    <div className="min-h-screen bg-[#0d0f18] text-white p-6">
      <Navbar />
      <div className="max-w-7xl mx-auto space-y-6 mt-6">
        <div className="bg-[#131625] p-6 rounded-xl border border-gray-800">
          <h1 className="text-2xl font-bold">Gerador de imagens do anúncio</h1>
          <p className="text-gray-400 text-sm mt-1">
            Suba até {MAX_FOTOS} fotos do produto e o app monta as imagens do anúncio no padrão cadastrado para a marca. As fotos não são salvas: ficam só no seu navegador.
          </p>
          <div className="flex gap-2 mt-4">
            {(["gerar", "padrao"] as const).map((a) => (
              <button key={a} type="button" data-gi-aba={a} onClick={() => setAba(a)}
                className={`${botao} ${aba === a ? "bg-purple-700 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{a === "gerar" ? "Gerar imagens" : "Padrão da marca"}</button>
            ))}
          </div>
        </div>

        {msg && <div data-gi-msg className="bg-amber-950/40 border border-amber-800/60 text-amber-200 text-sm rounded-xl p-4">{msg}</div>}
        {ocupado && <div data-gi-ocupado className="bg-purple-950/40 border border-purple-800/60 text-purple-200 text-sm rounded-xl p-4">{ocupado}</div>}

        <div className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-3">
          <label className="text-xs text-gray-400 block">Marca</label>
          <div className="flex flex-wrap gap-3 items-center">
            <select data-gi-marca value={marca} onChange={(e) => setMarca(e.target.value)} className={campo + " max-w-xs"}>
              <option value="">Escolha a marca…</option>
              {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input data-gi-nova-marca value={novaMarca} onChange={(e) => setNovaMarca(e.target.value)} placeholder="ou digite uma marca nova" className={campo + " max-w-xs"} />
            <button type="button" data-gi-usar-nova disabled={!novaMarca.trim()} className={`${botao} bg-gray-700 hover:bg-gray-600 text-white`}
              onClick={() => { const m = novaMarca.trim(); setMarcas((l) => (l.some((x) => x.toLowerCase() === m.toLowerCase()) ? l : [...l, m])); setMarca(m); setNovaMarca(""); }}>Usar essa marca</button>
          </div>
          <div data-gi-status-ia className={`text-xs ${statusIA.configurado ? "text-emerald-300" : "text-gray-400"}`}>
            {statusIA.configurado ? "✅ " : "🔒 "}Cena de IA: {statusIA.mensagem}
          </div>
        </div>

        {aba === "gerar" && (
          <>
            <div className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-4" data-gi-fotos>
              <h2 className="text-lg font-semibold text-purple-400">1. Fotos do produto ({fotos.length}/{MAX_FOTOS})</h2>
              <input data-gi-arquivo type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={escolherFotos} disabled={fotos.length >= MAX_FOTOS}
                className="block text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-700 file:text-white file:font-semibold file:cursor-pointer" />
              {fotos.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {fotos.map((f, i) => (
                    <div key={f.url} className="relative w-28" data-gi-foto>
                      <img src={f.url} alt={f.nome} className="w-28 h-28 object-cover rounded-lg border border-gray-700" />
                      <span className="absolute top-1 left-1 bg-black/70 text-xs px-1.5 rounded">{i + 1}</span>
                      <button type="button" onClick={() => removerFoto(i)} className="absolute top-1 right-1 bg-black/70 hover:bg-red-700 text-xs w-5 h-5 rounded cursor-pointer" aria-label="Remover foto">×</button>
                      <p className="text-[10px] text-gray-400 truncate mt-1" title={f.nome}>{f.nome}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">SKU (nome dos arquivos)</label>
                  <input data-gi-sku value={sku} onChange={(e) => setSku(e.target.value)} onBlur={buscarMedidas} placeholder="ex.: 22819" className={campo} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Medidas da imagem de medidas (vêm da aba Dimensões e Peso quando o SKU está lá; você pode editar)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([["altura", "Altura (cm)"], ["largura", "Largura (cm)"], ["comprimento", "Comprimento (cm)"]] as const).map(([k, rot]) => (
                    <input key={k} data-gi-medida={k} inputMode="decimal" placeholder={rot} value={medidas[k] ?? ""}
                      onChange={(e) => { const n = Number(e.target.value.replace(",", ".")); setMedidas((m) => ({ ...m, [k]: e.target.value === "" ? null : Number.isFinite(n) ? n : m[k] })); }} className={campo} />
                  ))}
                  <input data-gi-medida="capacidade" placeholder="Capacidade (opcional, ex.: 8 Litros)" value={medidas.capacidade ?? ""} onChange={(e) => setMedidas((m) => ({ ...m, capacidade: e.target.value }))} className={campo} />
                </div>
              </div>
              <button type="button" data-gi-gerar onClick={gerar} disabled={!!ocupado || !marca || !fotos.length}
                className={`${botao} bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5`}>Gerar {ativosQtd || ""} imagem(ns)</button>
            </div>

            {resultados.length > 0 && (
              <div className="bg-[#131625] p-6 rounded-xl border border-emerald-900/60 space-y-4" data-gi-resultado>
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <h2 className="text-lg font-semibold text-emerald-300">2. Imagens geradas</h2>
                  <button type="button" data-gi-zip onClick={baixarZip} disabled={!resultados.some((r) => r.blob)} className={`${botao} bg-emerald-600 hover:bg-emerald-500 text-white`}>Baixar tudo (.zip)</button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {resultados.map((r) => (
                    <div key={r.posicao} data-gi-imagem={r.posicao} className="bg-[#0d0f18] border border-gray-800 rounded-xl p-3 space-y-2">
                      <p className="text-sm font-semibold">{r.posicao}. {r.nome}</p>
                      {r.url ? <img src={r.url} alt={r.nome} className="w-full rounded-lg border border-gray-800 bg-white" />
                        : <div data-gi-travada className="aspect-square flex items-center justify-center text-center text-sm text-gray-400 border border-dashed border-gray-700 rounded-lg p-4">
                            {r.travada ? `🔒 ${r.travada}` : `⚠️ ${r.erro || "não gerou"}`}
                          </div>}
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{r.largura}×{r.altura}px{r.url ? ` · ${r.arquivo}` : ""}</span>
                        {r.url && <button type="button" onClick={() => baixar(r)} className="text-purple-300 hover:text-purple-200 cursor-pointer">Baixar</button>}
                      </div>
                      {r.aviso && <p data-gi-aviso className="text-xs text-amber-300">{r.aviso}</p>}
                      {r.guia && (
                        <div data-gi-ajuste className="border-t border-gray-800 pt-2 space-y-2 text-xs text-gray-300">
                          {!r.guia.limpo && <p className="text-amber-300">As medidas não couberam sem encostar no produto. Use outra foto ou ajuste a caixa abaixo.</p>}
                          <label className="flex items-center gap-2">Foto usada
                            <select data-gi-ajuste-foto value={r.guia.foto} onChange={(e) => ajustarMedidas(r.posicao, { foto: Number(e.target.value) })} className="bg-[#0d0f18] border border-gray-700 rounded px-2 py-1">
                              {fotos.map((_, i) => <option key={i} value={i + 1}>Foto {i + 1}</option>)}
                            </select></label>
                          <p className="text-gray-400">Caixa do corpo do produto (onde as setas encostam). Ajuste se alguma seta ficou fora do lugar:</p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            {([["x0", "Esquerda"], ["x1", "Direita"], ["y0", "Topo"], ["y1", "Base"]] as const).map(([k, rot]) => (
                              <label key={k} className="flex items-center gap-2">{rot}
                                <input data-gi-caixa={k} type="range" min={0} max={100} value={Math.round(r.guia!.corpo[k] * 100)} className="flex-1"
                                  onChange={(e) => ajustarMedidas(r.posicao, { corpo: { ...r.guia!.corpo, [k]: Number(e.target.value) / 100 } })} /></label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {aba === "padrao" && (
          <div className="space-y-4" data-gi-padrao>
            {!marcaAtual && <div className="bg-[#131625] p-6 rounded-xl border border-gray-800 text-sm text-gray-400">Escolha ou digite a marca acima para ver e editar o padrão dela.</div>}
            {marcaAtual && padroes.length === 0 && (
              <div className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-3">
                <p className="text-sm text-gray-300">A marca <strong>{marcaAtual}</strong> ainda não tem padrão de imagens.</p>
                <button type="button" data-gi-criar-padrao onClick={criarPadraoInicial} className={`${botao} bg-purple-700 hover:bg-purple-600 text-white`}>Criar padrão inicial (5 posições)</button>
              </div>
            )}
            {marcaAtual && padroes.length > 0 && (
              <>
                {padroes.map((p) => (
                  <div key={p.posicao} data-gi-posicao={p.posicao} className="bg-[#131625] p-5 rounded-xl border border-gray-800 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="bg-purple-900/60 text-purple-200 text-sm font-bold px-3 py-1 rounded-lg">{p.posicao}</span>
                      <input data-gi-nome value={p.nome} onChange={(e) => ajustar(p.posicao, { nome: e.target.value })} placeholder="Nome da imagem" className={campo + " max-w-xs"} />
                      <select data-gi-tipo value={p.tipo} onChange={(e) => ajustar(p.posicao, { tipo: e.target.value as any })} className={campo + " max-w-[16rem]"}>
                        <option value="montagem">Montagem com as minhas fotos</option>
                        <option value="cena_ia">Cena criada por IA (travada)</option>
                      </select>
                      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={p.ativo} onChange={(e) => ajustar(p.posicao, { ativo: e.target.checked })} /> Gerar esta imagem</label>
                    </div>
                    <div className="grid md:grid-cols-4 gap-3">
                      {p.tipo === "montagem" && (
                        <div className="md:col-span-2"><label className="text-xs text-gray-400 block mb-1">Layout</label>
                          <select data-gi-layout value={p.layout} onChange={(e) => ajustar(p.posicao, { layout: e.target.value as LayoutImagem })} className={campo}>
                            {(Object.keys(ROTULO_LAYOUT) as LayoutImagem[]).map((l) => <option key={l} value={l}>{ROTULO_LAYOUT[l]}</option>)}
                          </select></div>
                      )}
                      <div><label className="text-xs text-gray-400 block mb-1">Largura (px)</label><input type="number" min={200} max={4000} value={p.largura} onChange={(e) => ajustar(p.posicao, { largura: Number(e.target.value) })} className={campo} /></div>
                      <div><label className="text-xs text-gray-400 block mb-1">Altura (px)</label><input type="number" min={200} max={4000} value={p.altura} onChange={(e) => ajustar(p.posicao, { altura: Number(e.target.value) })} className={campo} /></div>
                      {p.tipo === "montagem" && (
                        <div className="md:col-span-2"><label className="text-xs text-gray-400 block mb-1">Fundo da foto</label>
                          <select data-gi-fundo-modo value={p.fundo_modo} onChange={(e) => ajustar(p.posicao, { fundo_modo: e.target.value as FundoModo })} className={campo}>
                            <option value="liso">Fundo branco/liso: tira o fundo da foto</option>
                            <option value="ambientado">Ambientado: mantém o fundo da foto</option>
                          </select></div>
                      )}
                      {(p.tipo !== "montagem" || p.fundo_modo === "liso") && <div><label className="text-xs text-gray-400 block mb-1">Cor do fundo</label><input data-gi-fundo-cor type="color" value={p.fundo} onChange={(e) => ajustar(p.posicao, { fundo: e.target.value })} className="h-10 w-full bg-transparent" /></div>}
                      <div><label className="text-xs text-gray-400 block mb-1">Margem (% do menor lado)</label><input type="number" min={0} max={40} value={p.margem_pct} onChange={(e) => ajustar(p.posicao, { margem_pct: Number(e.target.value) })} className={campo} /></div>
                      <div><label className="text-xs text-gray-400 block mb-1">Formato</label>
                        <select value={p.formato} onChange={(e) => ajustar(p.posicao, { formato: e.target.value as any })} className={campo}><option value="jpg">JPG</option><option value="png">PNG</option></select></div>
                      <div className="md:col-span-2"><label className="text-xs text-gray-400 block mb-1">Fotos usadas (vazio = automático)</label>
                        <div className="flex gap-3 text-sm">{[1, 2, 3, 4, 5].map((n) => (
                          <label key={n} className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={p.fotos.includes(n)}
                            onChange={(e) => ajustar(p.posicao, { fotos: e.target.checked ? [...p.fotos, n].sort() : p.fotos.filter((x) => x !== n) })} />{n}</label>
                        ))}</div></div>
                    </div>
                    {p.tipo === "montagem" && (
                      <div className="grid md:grid-cols-4 gap-3">
                        <div className="md:col-span-2"><label className="text-xs text-gray-400 block mb-1">Logo da marca (PNG transparente é o melhor)</label>
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { enviarLogo(p.posicao, e.target.files?.[0], false); e.target.value = ""; }}
                            className="block text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-700 file:text-white file:cursor-pointer" />
                          {p.logo_url && <div className="flex items-center gap-3 mt-2"><img src={p.logo_url} alt="logo" className="h-10 bg-white/90 rounded p-1" />
                            <button type="button" onClick={() => ajustar(p.posicao, { logo_url: null })} className="text-xs text-red-300 hover:text-red-200 cursor-pointer">Tirar logo</button>
                            <button type="button" onClick={() => setPadroes((l) => l.map((x) => ({ ...x, logo_url: p.logo_url })))} className="text-xs text-purple-300 hover:text-purple-200 cursor-pointer">Usar em todas as posições</button></div>}
                        </div>
                        <div><label className="text-xs text-gray-400 block mb-1">Posição do logo</label>
                          <select value={p.logo_posicao} onChange={(e) => ajustar(p.posicao, { logo_posicao: e.target.value as LogoPosicao })} className={campo}>
                            {(Object.keys(ROTULO_LOGO) as LogoPosicao[]).map((l) => <option key={l} value={l}>{ROTULO_LOGO[l]}</option>)}</select></div>
                        <div><label className="text-xs text-gray-400 block mb-1">Tamanho do logo (% da largura)</label><input type="number" min={3} max={50} value={p.logo_tamanho_pct} onChange={(e) => ajustar(p.posicao, { logo_tamanho_pct: Number(e.target.value) })} className={campo} /></div>
                      </div>
                    )}
                    {p.tipo === "montagem" && p.layout === "beneficios" && (
                      <div><label className="text-xs text-gray-400 block mb-1">Textos de benefícios (um por linha)</label>
                        <textarea data-gi-textos rows={4} value={p.textos.join("\n")} onChange={(e) => ajustar(p.posicao, { textos: e.target.value.split("\n") })} className={campo} /></div>
                    )}
                    {p.tipo === "montagem" && (p.layout === "medidas" || p.layout === "beneficios") && (
                      <div className="grid grid-cols-2 gap-3 max-w-xs">
                        <div><label className="text-xs text-gray-400 block mb-1">Cor do texto</label><input type="color" value={p.cor_texto} onChange={(e) => ajustar(p.posicao, { cor_texto: e.target.value })} className="h-10 w-full bg-transparent" /></div>
                        <div><label className="text-xs text-gray-400 block mb-1">Cor de destaque</label><input type="color" value={p.cor_destaque} onChange={(e) => ajustar(p.posicao, { cor_destaque: e.target.value })} className="h-10 w-full bg-transparent" /></div>
                      </div>
                    )}
                    {p.tipo === "cena_ia" && (
                      <div><label className="text-xs text-gray-400 block mb-1">Instrução para a IA (como deve ser a cena)</label>
                        <textarea data-gi-prompt rows={3} value={p.prompt_ia} onChange={(e) => ajustar(p.posicao, { prompt_ia: e.target.value })} className={campo} />
                        <p className="text-xs text-gray-500 mt-1">{statusIA.configurado ? "Serviço de imagem configurado." : "🔒 Travada por enquanto: o padrão já fica salvo e passa a valer quando o serviço de imagem for configurado."}</p></div>
                    )}
                  </div>
                ))}
                <button type="button" data-gi-salvar onClick={salvarPadrao} disabled={!!ocupado} className={`${botao} bg-purple-700 hover:bg-purple-600 text-white px-6 py-2.5`}>Salvar padrão de {marcaAtual}</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
