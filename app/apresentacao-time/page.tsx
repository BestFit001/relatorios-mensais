"use client";
// Ferramentas > Apresentação Time: apresentações em slides (estilo PowerPoint) para a reunião do time.
//  - Apresentar: passa os slides em tela cheia com as setas do teclado
//  - Editar: cria/edita slides e importa PDF (fiel) ou PPTX (leitura aproximada)
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Navbar from "../components/Navbar";
import { SlideFit } from "../components/SlideCanvas";
import {
  LAYOUTS, duplicarSlide, modeloReuniaoMensal, normalizarSlides, novoBloco, novoSlide,
  type Bloco, type LayoutSlide, type Slide,
} from "../../lib/apresentacao";
import { lerPptx, mimeDaExtensao, montarSlidesDoPptx, pdfParaUrls, slidesDeImagens } from "../../lib/apresentacaoImport";

const CHAVE_ATUAL = "bestfit_apresentacao_atual";
const BUCKET = "anexos";

interface Resumo { id: number; titulo: string }
type Aviso = { tipo: "ok" | "erro" | "info"; linhas: string[] } | null;

export default function ApresentacaoTimePage() {
  const router = useRouter();
  const [subAba, setSubAba] = useState<"apresentar" | "editar">("apresentar");
  const [lista, setLista] = useState<Resumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualId, setAtualId] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [alterado, setAlterado] = useState(false);
  const [idxEdit, setIdxEdit] = useState(0);
  const [idxPres, setIdxPres] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [painelNova, setPainelNova] = useState(false);
  const [nomeNova, setNomeNova] = useState("");
  const [emTela, setEmTela] = useState(false);
  const palcoRef = useRef<HTMLDivElement>(null);
  const pseudoTelaRef = useRef(false);

  // ------------------------------------------------------------ dados
  const carregarLista = useCallback(async (): Promise<Resumo[]> => {
    const { data, error } = await supabase.from("apresentacoes").select("id, titulo, updated_at").order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const l = (data || []).map((r: any) => ({ id: r.id, titulo: r.titulo }));
    setLista(l);
    return l;
  }, []);

  const abrir = useCallback(async (id: number) => {
    const { data, error } = await supabase.from("apresentacoes").select("id, titulo, slides").eq("id", id).maybeSingle();
    if (error || !data) { setAviso({ tipo: "erro", linhas: ["Não consegui abrir a apresentação" + (error ? ": " + error.message : ".")] }); return; }
    setAtualId(data.id); setTitulo(data.titulo); setSlides(normalizarSlides(data.slides));
    setIdxEdit(0); setIdxPres(0); setAlterado(false);
    try { localStorage.setItem(CHAVE_ATUAL, String(id)); } catch { /* sem localStorage: só não lembra */ }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("usuario_logado")) { router.push("/login"); return; }
    (async () => {
      try {
        const l = await carregarLista();
        let alvo: number | null = null;
        try { const salvo = Number(localStorage.getItem(CHAVE_ATUAL)); if (salvo && l.some((x) => x.id === salvo)) alvo = salvo; } catch { /* ignora */ }
        if (alvo === null && l.length) alvo = l[0].id;
        if (alvo !== null) await abrir(alvo);
      } catch (e: any) { setAviso({ tipo: "erro", linhas: ["Não consegui carregar as apresentações: " + (e?.message || e)] }); }
      setCarregando(false);
    })();
  }, [router, carregarLista, abrir]);

  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  const confirmarDescarte = () => !alterado || confirm("Há alterações não salvas nesta apresentação. Descartar e continuar?");

  const trocarApresentacao = async (id: number) => {
    if (id === atualId || !confirmarDescarte()) return;
    setAviso(null);
    await abrir(id);
  };

  const salvar = async () => {
    if (atualId === null) return;
    setOcupado("Salvando…");
    const { error } = await supabase.from("apresentacoes").update({ titulo: titulo.trim() || "Sem título", slides, updated_at: new Date().toISOString() }).eq("id", atualId);
    setOcupado(null);
    if (error) return setAviso({ tipo: "erro", linhas: ["Não consegui salvar: " + error.message] });
    setAlterado(false);
    setAviso({ tipo: "ok", linhas: ["Apresentação salva."] });
    carregarLista().catch(() => {});
  };

  const criar = async (nome: string, conteudo: Slide[]): Promise<number | null> => {
    const { data, error } = await supabase.from("apresentacoes").insert({ titulo: nome.trim() || "Nova apresentação", slides: conteudo }).select("id").single();
    if (error || !data) { setAviso({ tipo: "erro", linhas: ["Não consegui criar a apresentação" + (error ? ": " + error.message : ".")] }); return null; }
    await carregarLista();
    return data.id as number;
  };

  const criarNova = async (comModelo: boolean) => {
    if (!confirmarDescarte()) return;
    setOcupado("Criando…");
    const id = await criar(nomeNova, comModelo ? modeloReuniaoMensal() : [novoSlide("capa")]);
    setOcupado(null);
    if (id === null) return;
    setPainelNova(false); setNomeNova("");
    await abrir(id);
    setSubAba("editar");
  };

  const excluirApresentacao = async () => {
    if (atualId === null || !confirm(`Excluir a apresentação “${titulo}” com todos os slides? Não dá para desfazer.`)) return;
    const { error } = await supabase.from("apresentacoes").delete().eq("id", atualId);
    if (error) return setAviso({ tipo: "erro", linhas: ["Não consegui excluir: " + error.message] });
    const l = await carregarLista();
    setAtualId(null); setSlides([]); setTitulo(""); setAlterado(false);
    try { localStorage.removeItem(CHAVE_ATUAL); } catch { /* ignora */ }
    if (l.length) await abrir(l[0].id);
    setAviso({ tipo: "ok", linhas: ["Apresentação excluída."] });
  };

  // ------------------------------------------------------------ imagens (Storage)
  const enviarArquivo = async (idApres: number, arquivo: Blob, nome: string, tipo?: string): Promise<string> => {
    const seguro = nome.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-60);
    const caminho = `apresentacoes/${idApres}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${seguro}`;
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: tipo || (arquivo as File).type || undefined, upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  };

  const enviarImagens = async (arquivos: File[]): Promise<string[]> => {
    if (atualId === null) return [];
    const urls: string[] = [];
    setOcupado(`Enviando imagem 0/${arquivos.length}…`);
    try {
      for (const a of arquivos) {
        if (!a.type.startsWith("image/")) { setAviso({ tipo: "erro", linhas: [`“${a.name}” não é uma imagem.`] }); continue; }
        urls.push(await enviarArquivo(atualId, a, a.name));
        setOcupado(`Enviando imagem ${urls.length}/${arquivos.length}…`);
      }
    } catch (e: any) { setAviso({ tipo: "erro", linhas: ["Erro ao enviar imagem: " + (e?.message || e)] }); }
    setOcupado(null);
    return urls;
  };

  // ------------------------------------------------------------ importar PDF / PPTX
  const importar = async (arquivos: File[]) => {
    const arquivo = arquivos[0];
    if (!arquivo) return;
    const ext = arquivo.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "pptx") return setAviso({ tipo: "erro", linhas: ["Envie um arquivo .pdf ou .pptx. (Arquivos .ppt antigos: salve como .pptx ou exporte para PDF no PowerPoint.)"] });
    if (!confirmarDescarte()) return;
    setAviso(null);
    const nome = arquivo.name.replace(/\.(pdf|pptx)$/i, "");
    let id: number | null = null;
    try {
      setOcupado("Criando a apresentação…");
      id = await criar(nome, []);
      if (id === null) { setOcupado(null); return; }
      let novos: Slide[] = [];
      const linhas: string[] = [];
      if (ext === "pdf") {
        const urls = await pdfParaUrls(arquivo, (blob, n) => enviarArquivo(id!, blob, `pagina-${n}.jpg`, "image/jpeg"), (f, t) => setOcupado(`Convertendo páginas… ${f}/${t}`));
        novos = slidesDeImagens(urls);
        linhas.push(`${novos.length} página(s) do PDF viraram slides (imagem fiel ao original).`);
      } else {
        setOcupado("Lendo o PowerPoint…");
        const lidos = await lerPptx(arquivo);
        const urls: string[][] = [];
        let naoConv = 0, n = 0; const total = lidos.reduce((a, s) => a + s.imagens.length, 0);
        for (const s of lidos) {
          naoConv += s.naoConvertidos;
          const doSlide: string[] = [];
          for (const im of s.imagens) {
            setOcupado(`Enviando imagens do PowerPoint… ${++n}/${total}`);
            doSlide.push(await enviarArquivo(id, new Blob([im.dados as BlobPart], { type: mimeDaExtensao(im.ext) }), `imagem.${im.ext}`, mimeDaExtensao(im.ext)));
          }
          urls.push(doSlide);
        }
        novos = montarSlidesDoPptx(lidos, urls);
        linhas.push(`${novos.length} slide(s) do PowerPoint importados com textos e imagens editáveis.`);
        linhas.push("A leitura do PowerPoint é aproximada: posições, fontes e cores podem mudar. Para ficar idêntico ao original, exporte o PPT como PDF e importe o PDF.");
        if (naoConv) linhas.push(`${naoConv} elemento(s) não convertidos (gráficos, imagens em formato não suportado). Confira esses slides ou use o PDF.`);
      }
      if (novos.length === 0) throw new Error("Nenhum slide encontrado no arquivo.");
      const { error } = await supabase.from("apresentacoes").update({ slides: novos, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      await carregarLista();
      await abrir(id);
      setSubAba("editar");
      setAviso({ tipo: "ok", linhas });
    } catch (e: any) {
      setAviso({ tipo: "erro", linhas: ["Erro ao importar: " + (e?.message || e)] });
      if (id !== null) { await carregarLista().catch(() => {}); }
    }
    setOcupado(null);
  };

  // ------------------------------------------------------------ edição dos slides
  const atual = slides[idxEdit];
  const mudar = (fn: (s: Slide[]) => Slide[]) => { setSlides(fn); setAlterado(true); };
  const mudarSlide = (patch: Partial<Slide>) => mudar((s) => s.map((x, i) => (i === idxEdit ? { ...x, ...patch } : x)));
  const mudarBloco = (bi: number, patch: Partial<Bloco>) => mudarSlide({ blocos: atual.blocos.map((b, i) => (i === bi ? ({ ...b, ...patch } as Bloco) : b)) });

  const adicionarSlide = (layout: LayoutSlide) => {
    mudar((s) => { const c = s.slice(); c.splice(idxEdit + 1, 0, novoSlide(layout)); return c; });
    setIdxEdit(slides.length === 0 ? 0 : idxEdit + 1);
  };
  const moverSlide = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= slides.length) return;
    mudar((s) => { const c = s.slice(); [c[i], c[j]] = [c[j], c[i]]; return c; });
    setIdxEdit(j);
  };
  const duplicar = (i: number) => { mudar((s) => { const c = s.slice(); c.splice(i + 1, 0, duplicarSlide(s[i])); return c; }); setIdxEdit(i + 1); };
  const remover = (i: number) => {
    if (!confirm(`Excluir o slide ${i + 1}?`)) return;
    mudar((s) => s.filter((_, k) => k !== i));
    setIdxEdit(Math.max(0, Math.min(i, slides.length - 2)));
  };
  const moverBloco = (bi: number, d: -1 | 1) => {
    const j = bi + d; if (j < 0 || j >= atual.blocos.length) return;
    const c = atual.blocos.slice(); [c[bi], c[j]] = [c[j], c[bi]]; mudarSlide({ blocos: c });
  };

  // ------------------------------------------------------------ apresentar
  const total = slides.length;
  const idxPresSeguro = Math.min(idxPres, Math.max(total - 1, 0));
  const prox = useCallback(() => setIdxPres((i) => Math.min(i + 1, Math.max(total - 1, 0))), [total]);
  const ant = useCallback(() => setIdxPres((i) => Math.max(i - 1, 0)), []);

  const entrarTela = async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const el = palcoRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else throw new Error("sem fullscreen");
    } catch { pseudoTelaRef.current = true; setEmTela(true); }   // navegador sem API de tela cheia: ocupa a janela toda
  };
  const sairTela = async () => {
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* ignora */ } }
    pseudoTelaRef.current = false; setEmTela(false);
  };

  useEffect(() => {
    const aoMudar = () => { if (document.fullscreenElement) setEmTela(document.fullscreenElement === palcoRef.current); else if (!pseudoTelaRef.current) setEmTela(false); };
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  useEffect(() => {
    if (subAba !== "apresentar") return;
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (alvo && /^(BUTTON|A)$/.test(alvo.tagName) && (e.key === " " || e.key === "Enter")) return;   // deixa o botão focado agir
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case "ArrowRight": case "ArrowDown": case "PageDown": case " ": prox(); break;
        case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace": ant(); break;
        case "Home": setIdxPres(0); break;
        case "End": setIdxPres(Math.max(total - 1, 0)); break;
        case "f": case "F": if (emTela) sairTela(); else entrarTela(); break;
        case "Escape": if (pseudoTelaRef.current) sairTela(); return;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [subAba, prox, ant, total, emTela]);

  useEffect(() => { if (subAba !== "apresentar" && emTela) sairTela(); }, [subAba]); // eslint-disable-line react-hooks/exhaustive-deps

  const aoClicarPalco = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!emTela) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) ant(); else prox();
  };

  // ------------------------------------------------------------ visual
  const abaCls = (ativa: boolean) => `px-4 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer transition-all ${ativa ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`;
  const campo = "w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500";
  const rotuloCls = "block text-[10px] font-bold text-slate-400 uppercase mb-1";
  const btnPeq = "px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer disabled:opacity-30 disabled:cursor-default";

  const seletor = (
    <select value={atualId ?? ""} onChange={(e) => trocarApresentacao(Number(e.target.value))} data-select-apresentacao
      className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none cursor-pointer max-w-xs">
      {lista.length === 0 && <option value="">Nenhuma apresentação</option>}
      {lista.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
    </select>
  );

  const palcoStyle: React.CSSProperties = emTela && pseudoTelaRef.current
    ? { position: "fixed", inset: 0, zIndex: 100, background: "#000" }
    : emTela ? { width: "100%", height: "100%", background: "#000" } : { width: "100%", aspectRatio: "16 / 9", background: "#000" };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100 font-sans">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;700&display=swap" />
      <div className="max-w-[98%] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Apresentação Time</h1>
            <p className="text-sm font-medium text-slate-400">Monte, importe e apresente os slides da reunião do time</p>
          </div>
          <Navbar />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-800">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
            <button data-subaba="apresentar" onClick={() => setSubAba("apresentar")} className={abaCls(subAba === "apresentar")}>▶ Apresentar</button>
            <button data-subaba="editar" onClick={() => setSubAba("editar")} className={abaCls(subAba === "editar")}>✏️ Editar conteúdo</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">{seletor}</div>
        </div>

        {(aviso || ocupado) && (
          <div data-aviso className={`p-4 rounded-xl border text-sm font-semibold flex items-start justify-between gap-3 ${
            ocupado ? "border-indigo-900/60 bg-indigo-950/40 text-indigo-300" : aviso!.tipo === "erro" ? "border-rose-900/60 bg-rose-950/40 text-rose-300" : aviso!.tipo === "ok" ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300" : "border-amber-900/60 bg-amber-950/40 text-amber-300"}`}>
            <div className="space-y-1">
              {ocupado ? <p data-ocupado>{ocupado}</p> : aviso!.linhas.map((l, i) => <p key={i} className={i === 0 ? "" : "text-xs font-medium opacity-90"}>{l}</p>)}
            </div>
            {!ocupado && <button type="button" onClick={() => setAviso(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">✕</button>}
          </div>
        )}

        {/* ===================== APRESENTAR ===================== */}
        {subAba === "apresentar" && (
          total === 0 ? (
            <div className="bg-slate-900/90 p-10 rounded-2xl border border-slate-800 text-center space-y-3">
              <p className="text-sm text-slate-300 font-bold">{carregando ? "Carregando…" : "Ainda não há slides."}</p>
              {!carregando && <button type="button" onClick={() => setSubAba("editar")} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase cursor-pointer">Criar ou importar uma apresentação</button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
              <div className="hidden lg:block space-y-2 max-h-[72vh] overflow-y-auto pr-1" data-miniaturas>
                {slides.map((s, i) => (
                  <button key={s.id} type="button" onClick={() => setIdxPres(i)} data-miniatura={i}
                    className={`block w-full rounded-lg overflow-hidden border-2 cursor-pointer text-left ${i === idxPresSeguro ? "border-indigo-500" : "border-slate-800 hover:border-slate-600"}`}>
                    <SlideFit slide={s} />
                    <div className="bg-slate-900 text-[10px] font-bold text-slate-400 px-2 py-0.5">{i + 1}</div>
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <div ref={palcoRef} style={palcoStyle} onClick={aoClicarPalco} data-palco data-em-tela={emTela ? "1" : "0"} className="relative rounded-xl overflow-hidden border border-slate-800 select-none">
                  <SlideFit slide={slides[idxPresSeguro]} preencher fundo="#000" />
                  {emTela && <div className="absolute bottom-3 right-4 text-[13px] font-bold text-black/40 pointer-events-none" data-contador-tela>{idxPresSeguro + 1} / {total}</div>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={ant} disabled={idxPresSeguro === 0} data-anterior className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-200 cursor-pointer disabled:opacity-40">◀ Anterior</button>
                    <span className="text-xs font-bold text-slate-300 font-mono min-w-[64px] text-center" data-contador>{idxPresSeguro + 1} / {total}</span>
                    <button type="button" onClick={prox} disabled={idxPresSeguro >= total - 1} data-proximo className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-200 cursor-pointer disabled:opacity-40">Próximo ▶</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 hidden md:inline">Setas ← → (ou espaço) passam os slides · F = tela cheia · Esc = sair</span>
                    <button type="button" onClick={entrarTela} data-tela-cheia className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase cursor-pointer shadow">▶ Apresentar em tela cheia</button>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ===================== EDITAR ===================== */}
        {subAba === "editar" && (
          <>
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px] max-w-md">
                  <label className={rotuloCls}>Nome da apresentação</label>
                  <input type="text" value={titulo} disabled={atualId === null} onChange={(e) => { setTitulo(e.target.value); setAlterado(true); }} data-nome-apresentacao className={campo + " font-bold"} />
                </div>
                <button type="button" onClick={salvar} disabled={atualId === null || !alterado || !!ocupado} data-salvar
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase cursor-pointer shadow">💾 Salvar</button>
                {alterado && <span className="text-[11px] font-bold text-amber-400" data-nao-salvo>● alterações não salvas</span>}
                <div className="flex-1" />
                <button type="button" onClick={() => setPainelNova(!painelNova)} data-nova className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase cursor-pointer">＋ Nova apresentação</button>
                <label className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase cursor-pointer">
                  ⬆ Importar PDF / PPTX
                  <input type="file" accept=".pdf,.pptx" className="hidden" disabled={!!ocupado} data-importar
                    onChange={(e) => { const arq = Array.from(e.target.files || []); e.target.value = ""; importar(arq); }} />
                </label>
                <button type="button" onClick={excluirApresentacao} disabled={atualId === null} data-excluir-apresentacao className="bg-rose-950/60 text-rose-400 border border-rose-900/50 font-bold px-3 py-2.5 rounded-xl text-xs cursor-pointer disabled:opacity-40">🗑 Excluir</button>
              </div>
              {painelNova && (
                <div className="flex flex-wrap items-end gap-3 bg-slate-950 border border-slate-800 rounded-xl p-4" data-painel-nova>
                  <div className="flex-1 min-w-[220px] max-w-md">
                    <label className={rotuloCls}>Nome da nova apresentação</label>
                    <input type="text" value={nomeNova} onChange={(e) => setNomeNova(e.target.value)} placeholder="ex.: Reunião mensal – Novembro/2026" data-nome-nova className={campo} />
                  </div>
                  <button type="button" onClick={() => criarNova(true)} disabled={!!ocupado} data-criar-modelo className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer">Com o modelo “Reunião mensal”</button>
                  <button type="button" onClick={() => criarNova(false)} disabled={!!ocupado} data-criar-branco className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer">Em branco</button>
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                <strong className="text-slate-400">PDF</strong>: cada página vira um slide idêntico ao original (exporte seu PowerPoint como PDF). <strong className="text-slate-400">PPTX</strong>: textos e imagens viram slides editáveis, de forma aproximada.
              </p>
            </div>

            {atualId === null ? (
              <div className="bg-slate-900/90 p-10 rounded-2xl border border-slate-800 text-center text-sm text-slate-400">{carregando ? "Carregando…" : "Crie uma nova apresentação ou importe um PDF/PPTX para começar."}</div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[230px_minmax(0,1fr)_380px] gap-4 items-start">
                {/* lista de slides */}
                <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 space-y-3 xl:max-h-[78vh] xl:overflow-y-auto" data-lista-slides>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LAYOUTS.map((l) => (
                      <button key={l.id} type="button" title={l.descricao} onClick={() => adicionarSlide(l.id)} data-add-layout={l.id} className={btnPeq + " !py-1.5"}>＋ {l.nome}</button>
                    ))}
                  </div>
                  {slides.map((s, i) => (
                    <div key={s.id} className={`rounded-lg border-2 ${i === idxEdit ? "border-indigo-500" : "border-slate-800"}`} data-slide-item={i}>
                      <button type="button" onClick={() => setIdxEdit(i)} data-slide-thumb={i} className="block w-full cursor-pointer text-left">
                        <SlideFit slide={s} />
                      </button>
                      <div className="flex items-center justify-between bg-slate-900 px-1.5 py-1 gap-1">
                        <span className="text-[10px] font-bold text-slate-400 w-6">{i + 1}</span>
                        <div className="flex gap-1">
                          <button type="button" className={btnPeq} disabled={i === 0} onClick={() => moverSlide(i, -1)} title="Mover para cima">▲</button>
                          <button type="button" className={btnPeq} disabled={i === slides.length - 1} onClick={() => moverSlide(i, 1)} title="Mover para baixo">▼</button>
                          <button type="button" className={btnPeq} onClick={() => duplicar(i)} title="Duplicar">⧉</button>
                          <button type="button" className={btnPeq + " !text-rose-300"} onClick={() => remover(i)} title="Excluir">🗑</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {slides.length === 0 && <p className="text-[11px] text-slate-500 text-center py-4">Sem slides. Use os botões acima para adicionar.</p>}
                </div>

                {/* prévia */}
                <div className="space-y-2">
                  {atual ? <div className="rounded-xl overflow-hidden border border-slate-700 shadow-xl" data-previa><SlideFit slide={atual} /></div>
                    : <div className="bg-slate-900/90 p-10 rounded-2xl border border-slate-800 text-center text-sm text-slate-400">Adicione um slide para começar.</div>}
                  <p className="text-[11px] text-slate-500 text-center">Slide {atual ? idxEdit + 1 : 0} de {slides.length} · lembre de clicar em Salvar</p>
                </div>

                {/* propriedades */}
                {atual && (
                  <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 space-y-4 xl:max-h-[78vh] xl:overflow-y-auto" data-propriedades>
                    <div>
                      <label className={rotuloCls}>Layout do slide</label>
                      <select value={atual.layout} onChange={(e) => mudarSlide({ layout: e.target.value as LayoutSlide })} data-layout className={campo + " cursor-pointer font-bold"}>
                        {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.nome} — {l.descricao}</option>)}
                      </select>
                    </div>

                    {atual.layout !== "imagem" && (
                      <div>
                        <label className={rotuloCls}>{atual.layout === "capa" ? "Título" : "Título do slide"}</label>
                        <input type="text" value={atual.titulo} onChange={(e) => mudarSlide({ titulo: e.target.value })} data-titulo className={campo + " font-bold"} />
                      </div>
                    )}
                    {(atual.layout === "conteudo" || atual.layout === "capa") && (
                      <div>
                        <label className={rotuloCls}>{atual.layout === "capa" ? "Data / subtítulo" : "Subtítulo (ex.: mês de referência)"}</label>
                        <input type="text" value={atual.subtitulo} onChange={(e) => mudarSlide({ subtitulo: e.target.value })} data-subtitulo className={campo} />
                      </div>
                    )}

                    {atual.layout === "imagem" && (
                      <div className="space-y-2">
                        <label className={rotuloCls}>Imagem do slide</label>
                        <input type="file" accept="image/*" data-imagem-inteira
                          onChange={async (e) => { const arq = Array.from(e.target.files || []); e.target.value = ""; const u = await enviarImagens(arq.slice(0, 1)); if (u[0]) mudarSlide({ imagem: u[0] }); }}
                          className="block w-full text-[11px] text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer cursor-pointer" />
                        {!atual.imagem && <p className="text-[11px] text-slate-500">Ainda sem imagem.</p>}
                      </div>
                    )}

                    {atual.layout === "conteudo" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-white uppercase tracking-wider">Conteúdo do slide</span>
                        </div>
                        {atual.blocos.map((b, bi) => (
                          <div key={b.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2" data-bloco={b.tipo}>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-indigo-300 uppercase">{b.tipo === "metricas" ? "Métricas" : b.tipo === "texto" ? "Texto" : "Imagens"}</span>
                              <div className="flex gap-1">
                                <button type="button" className={btnPeq} disabled={bi === 0} onClick={() => moverBloco(bi, -1)}>▲</button>
                                <button type="button" className={btnPeq} disabled={bi === atual.blocos.length - 1} onClick={() => moverBloco(bi, 1)}>▼</button>
                                <button type="button" className={btnPeq + " !text-rose-300"} onClick={() => mudarSlide({ blocos: atual.blocos.filter((_, k) => k !== bi) })}>✕</button>
                              </div>
                            </div>

                            {b.tipo === "metricas" && (
                              <div className="space-y-1.5">
                                {b.itens.map((it, ii) => (
                                  <div key={ii} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                                    <input type="text" value={it.rotulo} placeholder="Rótulo" data-metrica-rotulo
                                      onChange={(e) => mudarBloco(bi, { itens: b.itens.map((x, k) => (k === ii ? { ...x, rotulo: e.target.value } : x)) })} className={campo} />
                                    <input type="text" value={it.valor} placeholder="Valor (ex.: R$ 57.586,95)" data-metrica-valor
                                      onChange={(e) => mudarBloco(bi, { itens: b.itens.map((x, k) => (k === ii ? { ...x, valor: e.target.value } : x)) })} className={campo + " font-bold"} />
                                    <button type="button" className={btnPeq + " !text-rose-300"} onClick={() => mudarBloco(bi, { itens: b.itens.filter((_, k) => k !== ii) })}>✕</button>
                                  </div>
                                ))}
                                <button type="button" className={btnPeq} data-add-metrica onClick={() => mudarBloco(bi, { itens: [...b.itens, { rotulo: "", valor: "" }] })}>＋ Métrica</button>
                              </div>
                            )}

                            {b.tipo === "texto" && (
                              <div className="space-y-1.5">
                                <input type="text" value={b.titulo} placeholder="Cabeçalho (opcional)" onChange={(e) => mudarBloco(bi, { titulo: e.target.value })} className={campo + " font-bold"} />
                                <textarea value={b.texto} rows={4} placeholder="Texto" data-texto onChange={(e) => mudarBloco(bi, { texto: e.target.value })} className={campo + " resize-y"} />
                                <div className="grid grid-cols-3 gap-1.5">
                                  <select value={b.cor} onChange={(e) => mudarBloco(bi, { cor: e.target.value as any })} className={campo + " cursor-pointer"}>
                                    <option value="normal">Cor normal</option><option value="vermelho">Vermelho</option><option value="cinza">Cinza</option>
                                  </select>
                                  <select value={b.tamanho} onChange={(e) => mudarBloco(bi, { tamanho: e.target.value as any })} className={campo + " cursor-pointer"}>
                                    <option value="p">Pequeno</option><option value="m">Médio</option><option value="g">Grande</option>
                                  </select>
                                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 font-bold cursor-pointer">
                                    <input type="checkbox" checked={b.centralizar} onChange={(e) => mudarBloco(bi, { centralizar: e.target.checked })} className="accent-indigo-500" /> Centralizar
                                  </label>
                                </div>
                              </div>
                            )}

                            {b.tipo === "imagens" && (
                              <div className="space-y-2">
                                <input type="file" accept="image/*" multiple data-imagens-bloco
                                  onChange={async (e) => { const arq = Array.from(e.target.files || []); e.target.value = ""; const u = await enviarImagens(arq); if (u.length) mudarBloco(bi, { urls: [...b.urls, ...u] }); }}
                                  className="block w-full text-[11px] text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-bold file:cursor-pointer cursor-pointer" />
                                <div className="flex flex-wrap gap-2">
                                  {b.urls.map((u, ui) => (
                                    <div key={ui} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700 bg-white">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={u} alt="" className="w-full h-full object-contain" />
                                      <button type="button" onClick={() => mudarBloco(bi, { urls: b.urls.filter((_, k) => k !== ui) })} className="absolute top-0 right-0 bg-black/70 text-white text-[10px] px-1 cursor-pointer">✕</button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className={btnPeq} data-add-bloco="metricas" onClick={() => mudarSlide({ blocos: [...atual.blocos, novoBloco("metricas")] })}>＋ Métricas</button>
                          <button type="button" className={btnPeq} data-add-bloco="texto" onClick={() => mudarSlide({ blocos: [...atual.blocos, novoBloco("texto")] })}>＋ Texto</button>
                          <button type="button" className={btnPeq} data-add-bloco="imagens" onClick={() => mudarSlide({ blocos: [...atual.blocos, novoBloco("imagens")] })}>＋ Imagens</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
