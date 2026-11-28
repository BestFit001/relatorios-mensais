"use client";
// Gerador de imagens do anúncio: sobe as fotos do produto (até 10), escolhe a marca e o modelo (aba Produtos, importada por planilha) e o app monta as imagens do padrão
// cadastrado para a marca (tabela padroes_imagens: 5 no início, até 12). Medidas e benefícios vêm do modelo escolhido. As posições "cena de IA" ficam travadas até existir um serviço de geração de imagem configurado no servidor.

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import Navbar from "../components/Navbar";
import {
  MAX_FOTOS, MAX_POSICOES, ROTULO_LAYOUT, canvasParaBlob, carregarFoto, extrasValidos, registrarRecorte, temRecorte, carregarImagem, fotosDaPosicao, montarImagem, nomeDoArquivoImagem, normalizarPadrao, novaPosicao, padraoInicial, renumerarPosicoes,
  type CaixaFrac, type Foto, type FundoModo, type LayoutImagem, type LogoPosicao, type MedidasProduto, type PadraoImagem,
} from "../../lib/imagensAnuncio";
import { extrairQuadros, quadrosIniciais, type Quadro } from "../../lib/videoQuadros";
import * as XLSX from "xlsx";
import { MAX_EXTRAS } from "../../lib/guiaMedidas";
import { chaveProduto, emLotes, linhasUnicas, linhaDoProduto, modelosDaPlanilha, MARCA_PADRAO, type ModeloPadrao } from "../../lib/produtosImagens";
import { PROMPT_CENA_PESSOA, PROMPT_NEGATIVO_CENA, montarPromptCena, type RefsDoPedido } from "../../lib/promptCena";
import { chavePaiDe } from "../../lib/dimensoesPeso";
import { MAX_BENEFICIOS, dividirTitulo, normalizarBeneficios, type BeneficioModelo } from "../../lib/beneficiosModelo";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

interface FotoEnviada extends Foto { url: string; nome: string }
interface GuiaUsado { foto: number; corpo: CaixaFrac; limpo: boolean }
interface Resultado { posicao: number; nome: string; arquivo: string; url?: string; blob?: Blob; largura: number; altura: number; travada?: string; erro?: string; guia?: GuiaUsado; aviso?: string }
interface ModeloLinha { medidas_extras?: any; id: string; titulo: string; marca: string; sku: string | null; categoria: string | null; altura: number | null; largura: number | null; comprimento: number | null; descricao_complementar: string | null; descricao_seo: string | null; linha1?: string | null; linha2?: string | null; capacidade?: string | null; beneficios?: any }
interface ProdutoLista { id: string; chave: string; titulo: string; marca: string; sku: string | null; categoria: string | null; altura: number | null; largura: number | null; comprimento: number | null; beneficios: any }
interface PreviaProdutos { arquivo: string; modelos: (ModeloPadrao & { marcada: boolean })[]; ignoradas: number }
interface DadosModelo { linha1: string; linha2: string; beneficios: BeneficioModelo[] }
const DADOS_VAZIOS: DadosModelo = { linha1: "", linha2: "", beneficios: [] };
interface AjusteMedidas { foto?: number; corpo?: CaixaFrac }
interface StatusIA { configurado: boolean; mensagem: string }

const ROTULO_LOGO: Record<LogoPosicao, string> = {
  superior_esquerdo: "Canto superior esquerdo", superior_direito: "Canto superior direito", inferior_esquerdo: "Canto inferior esquerdo",
  inferior_direito: "Canto inferior direito", centro_inferior: "Centro, embaixo",
};

/** Recorta (cover) a imagem gerada para o tamanho exato da posição e devolve em JPEG. */
async function ajustarAoTamanho(blob: Blob, largura: number, altura: number): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas"); c.width = largura; c.height = altura;
  const ctx = c.getContext("2d")!; ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, largura, altura);
  const k = Math.max(largura / bmp.width, altura / bmp.height), w = bmp.width * k, h = bmp.height * k;
  ctx.drawImage(bmp, (largura - w) / 2, (altura - h) / 2, w, h);
  return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("não consegui converter a imagem"))), "image/jpeg", 0.92));
}

/** Quadros do vídeo que entram como referência extra na Cena (IA); as fotos da posição vão primeiro. */
const MAX_QUADROS_REF = 4;
const QUADROS_INICIAIS = 2;

const campo = "bg-[#0d0f18] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-full";
const botao = "px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

/** Foto reduzida (máx. 1024 px) em base64, para mandar de referência ao serviço de imagem. */
function fotoReduzida(f: Foto): { base64: string; mime: string } {
  const k = Math.min(1, 1024 / Math.max(f.largura, f.altura));
  const c = document.createElement("canvas"); c.width = Math.round(f.largura * k); c.height = Math.round(f.altura * k);
  c.getContext("2d")!.drawImage(f.img, 0, 0, c.width, c.height);
  return { base64: c.toDataURL("image/jpeg", 0.85).split(",")[1], mime: "image/jpeg" };
}

/** Texto digitado → número em cm. Aceita "3,5", "3.5" e "3,5 cm". Vazio = sem medida; texto que não é número = null (mantém o anterior). */
function lerMedida(t: string): number | null | undefined {
  const limpo = t.replace(/cm\s*$/i, "").trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
/** Campo de medida que guarda o que a pessoa digita (para dar para escrever "3," antes do "5") e só entrega o número. */
function CampoMedida({ valor, onMudar, ...resto }: { valor: number | null | undefined; onMudar: (n: number | null) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const mostrar = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
  const [txt, setTxt] = useState(mostrar(valor));
  useEffect(() => { const atual = lerMedida(txt); if ((valor ?? null) !== (atual === undefined ? null : atual)) setTxt(mostrar(valor)); }, [valor]); // mudou por fora (outro modelo, medidas do SKU)
  return <input {...resto} inputMode="decimal" value={txt}
    onChange={(e) => { const t = e.target.value.replace(/[^0-9.,]/g, ""); setTxt(t); const n = lerMedida(t); if (n !== undefined) onMudar(n); }} />;
}

/** Foto para o recorte do Canva: até 2400 px no lado maior, em JPEG, reduzindo a qualidade até caber no limite do envio (~4 MB em base64). */
function fotoParaRecorte(f: Foto): { base64: string; mime: string } {
  const k = Math.min(1, 2400 / Math.max(f.largura, f.altura));
  const c = document.createElement("canvas"); c.width = Math.round(f.largura * k); c.height = Math.round(f.altura * k);
  c.getContext("2d")!.drawImage(f.img, 0, 0, c.width, c.height);
  let b64 = "";
  for (const q of [0.92, 0.85, 0.75, 0.6]) { b64 = c.toDataURL("image/jpeg", q).split(",")[1]; if (b64.length <= 3_800_000) break; }
  return { base64: b64, mime: "image/jpeg" };
}

export default function GeradorImagensPage() {
  const [aba, setAba] = useState<"gerar" | "produtos" | "padrao">("gerar");
  const [produtos, setProdutos] = useState<ProdutoLista[]>([]);
  const [previa, setPrevia] = useState<PreviaProdutos | null>(null);
  const [importando, setImportando] = useState(false);
  const [msgImport, setMsgImport] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [apagarId, setApagarId] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [marcas, setMarcas] = useState<string[]>([]);
  const [marca, setMarca] = useState("");
  const [novaMarca, setNovaMarca] = useState("");
  const [padroes, setPadroes] = useState<PadraoImagem[]>([]);
  const [statusIA, setStatusIA] = useState<StatusIA>({ configurado: false, mensagem: "Verificando o serviço de imagem…" });
  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [quadrosSel, setQuadrosSel] = useState<number[]>([]);
  const [lendoVideo, setLendoVideo] = useState(false);
  const [canva, setCanva] = useState<{ chaves: boolean; conectado: boolean; mensagem: string }>({ chaves: false, conectado: false, mensagem: "Verificando o Canva…" });
  const [fotos, setFotos] = useState<FotoEnviada[]>([]);
  const [sku, setSku] = useState("");
  const [medidas, setMedidas] = useState<MedidasProduto>({});
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [ajustes, setAjustes] = useState<Record<number, AjusteMedidas>>({});
  const logosCache = useRef(new Map<string, Foto>());
  const recortesEmCurso = useRef(new Map<object, Promise<void>>()); // fotos que estão sendo recortadas no Canva
  const avisosRecorte = useRef(new Set<string>());
  const [modelos, setModelos] = useState<ModeloLinha[]>([]);
  const [modeloId, setModeloId] = useState("");
  const [dadosModelo, setDadosModelo] = useState<DadosModelo>(DADOS_VAZIOS);
  const [qtdBeneficios, setQtdBeneficios] = useState(4);

  async function carregarMarcas(manter?: string) {
    const [a, b] = await Promise.all([supabase.from("produtos_imagens").select("marca"), supabase.from("padroes_imagens").select("marca")]);
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
  useEffect(() => {
    fetch("/api/canva/status").then((r) => r.json()).then((s) => setCanva({ chaves: !!s.chaves, conectado: !!s.conectado, mensagem: String(s.mensagem || "") })).catch(() => setCanva({ chaves: false, conectado: false, mensagem: "Não consegui consultar o Canva." }));
    const q = new URLSearchParams(window.location.search);
    if (q.get("canva")) {
      setMsg(q.get("canva") === "ok" ? "Canva conectado. Agora a posição “Cena (IA)” pode gerar imagens." : "Não consegui conectar o Canva: " + (q.get("motivo") || "tente de novo."));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  async function escolherVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0]; e.target.value = "";
    if (!arq) return;
    setLendoVideo(true); setMsg(""); setQuadros([]); setQuadrosSel([]);
    try { const q = await extrairQuadros(arq, 12); setQuadros(q); setQuadrosSel(quadrosIniciais(q.length, QUADROS_INICIAIS)); }
    catch (err: any) { setMsg("Não consegui tirar os quadros do vídeo: " + (err?.message || err)); }
    setLendoVideo(false);
  }
  function alternarQuadro(i: number) {
    setQuadrosSel((l) => (l.includes(i) ? l.filter((x) => x !== i) : l.length >= MAX_QUADROS_REF ? l : [...l, i].sort((a, b) => a - b)));
  }
  async function conectarCanva() {
    try {
      const r = await fetch("/api/canva/conectar", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.url) { setMsg("Não consegui iniciar a conexão com o Canva: " + (j.erro || r.status)); return; }
      window.location.href = j.url;
    } catch (e: any) { setMsg("Não consegui iniciar a conexão com o Canva: " + (e?.message || e)); }
  }
  /** Gera a cena pelo Canva: abre o job, consulta até ficar pronto e baixa a imagem (ajustada ao tamanho da posição). */
  async function cenaPeloCanva(prompt: string, refs: { base64: string; mime: string }[], largura: number, altura: number): Promise<Blob> {
    const r = await fetch("/api/canva/cena", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, fotos: refs, largura, altura }) });
    const j = await r.json();
    if (!r.ok) { if (j.desconectado) setCanva((c) => ({ ...c, conectado: false, mensagem: j.erro })); throw new Error(String(j.erro || "o Canva não aceitou o pedido")); }
    const fim = Date.now() + 180_000;
    for (;;) {
      if (Date.now() > fim) throw new Error("o Canva demorou demais para gerar a imagem");
      await new Promise((ok) => setTimeout(ok, 3000));
      const s = await (await fetch(`/api/canva/cena?job=${encodeURIComponent(j.jobId)}`)).json();
      if (s.status === "falhou") throw new Error(String(s.mensagem || "o Canva não conseguiu gerar a imagem"));
      if (s.status === "pronto") break;
      if (s.erro) throw new Error(String(s.erro));
    }
    const img = await fetch(`/api/canva/cena?job=${encodeURIComponent(j.jobId)}&baixar=1`);
    if (!img.ok) throw new Error("não consegui baixar a imagem pronta");
    return await ajustarAoTamanho(await img.blob(), largura, altura);
  }
  useEffect(() => { setResultados([]); carregarPadroes(marca); carregarModelos(marca); }, [marca]);

  // ───────── produto (aba Produtos, importado por planilha): medidas e benefícios ─────────
  async function carregarProdutos() {
    const { data, error } = await supabase.from("produtos_imagens").select("id,chave,titulo,marca,sku,categoria,altura,largura,comprimento,beneficios").order("marca").order("titulo");
    if (error) { setMsgImport("Não consegui ler a lista de produtos: " + error.message); return; }
    setProdutos((data || []) as ProdutoLista[]);
  }
  useEffect(() => { carregarProdutos(); }, []);
  async function carregarModelos(m: string) {
    setModeloId(""); setDadosModelo(DADOS_VAZIOS);
    if (!m) { setModelos([]); return; }
    const { data, error } = await supabase.from("produtos_imagens").select("id,titulo,marca,sku,categoria,altura,largura,comprimento,descricao_complementar,descricao_seo,linha1,linha2,capacidade,beneficios,medidas_extras").ilike("marca", m).order("titulo");
    if (error) { setMsg("Não consegui ler os produtos da aba Produtos: " + error.message); setModelos([]); return; }
    setModelos((data || []) as ModeloLinha[]);
  }
  const modeloAtual = useMemo(() => modelos.find((x) => x.id === modeloId) || null, [modelos, modeloId]);
  async function escolherModelo(id: string) {
    setModeloId(id); setMsg(""); setResultados([]);
    const m = modelos.find((x) => x.id === id);
    if (!m) { setDadosModelo(DADOS_VAZIOS); return; }
    const num = (v: any) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    setSku(m.sku || "");
    setMedidas((a) => ({ ...a, altura: num(m.altura), largura: num(m.largura), comprimento: num(m.comprimento), capacidade: "", extras: Array.isArray(m.medidas_extras) ? m.medidas_extras.map((x: any) => ({ nome: String(x?.nome ?? ""), valor: String(x?.valor ?? "") })) : [] }));
    const t = dividirTitulo(m.titulo, m.marca);
    const benef = normalizarBeneficios(m.beneficios);
    if (m.linha1 || m.linha2 || benef.length || m.capacidade) {
      setDadosModelo({ linha1: String(m.linha1 || t.linha1), linha2: String(m.linha2 || t.linha2), beneficios: benef });
      setMedidas((a) => ({ ...a, capacidade: String(m.capacidade || "") }));
    } else setDadosModelo({ linha1: t.linha1, linha2: t.linha2, beneficios: [] });
  }
  // ───────── aba Produtos: importar planilha do Tiny ─────────
  async function lerPlanilhaProdutos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]; e.target.value = "";
    if (!arquivo) return;
    setMsgImport("");
    try {
      const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[];
      const { modelos: lidos, ignoradas } = modelosDaPlanilha(linhas);
      if (!lidos.length) { setPrevia(null); setMsgImport("Não encontrei produtos nessa planilha. Use a planilha de produtos exportada do Tiny (com as colunas Código (SKU), Descrição, Marca, Categoria, Altura/Largura/Comprimento embalagem, Descrição complementar…)."); return; }
      setPrevia({ arquivo: arquivo.name, modelos: lidos.map((m) => ({ ...m, marcada: true })), ignoradas });
    } catch (err: any) { setPrevia(null); setMsgImport("Não consegui ler a planilha: " + (err?.message || err)); }
  }
  async function importarProdutos() {
    if (!previa) return;
    const escolhidos = linhasUnicas(previa.modelos.filter((m) => m.marcada));
    if (!escolhidos.length) return;
    setImportando(true); setMsgImport("");
    const jaTem = new Set(produtos.map((p) => p.chave));
    const erros: string[] = [];
    let gravados = 0;
    for (const lote of emLotes(escolhidos, 200)) {
      // as linhas não levam id, linha1/linha2/capacidade/beneficios: a reimportação atualiza os dados da planilha e mantém os benefícios salvos
      const { error } = await supabase.from("produtos_imagens").upsert(lote, { onConflict: "chave" });
      if (error) erros.push(error.message); else gravados += lote.length;
    }
    const atualizados = escolhidos.filter((l) => jaTem.has(l.chave)).length;
    setImportando(false); setPrevia(null);
    setMsgImport(erros.length ? `Importei ${gravados} de ${escolhidos.length}. Erro: ${erros[0]}` : `✅ Importação concluída: ${escolhidos.length - atualizados} novo(s) e ${atualizados} atualizado(s). Já dá para escolher esses produtos na aba Gerar imagens.`);
    await Promise.all([carregarProdutos(), carregarMarcas()]);
    if (marca) carregarModelos(marca);
  }
  async function apagarProduto(id: string) {
    if (apagarId !== id) { setApagarId(id); return; } // primeiro clique pede a confirmação
    setApagarId("");
    const { error } = await supabase.from("produtos_imagens").delete().eq("id", id);
    if (error) { setMsgImport("Não consegui apagar: " + error.message); return; }
    if (modeloId === id) { setModeloId(""); setDadosModelo(DADOS_VAZIOS); }
    setMsgImport("Produto apagado da lista do gerador."); await carregarProdutos(); if (marca) carregarModelos(marca);
  }
  const produtosFiltrados = useMemo(() => {
    const q = buscaProduto.trim().toLowerCase();
    return q ? produtos.filter((p) => `${p.titulo} ${p.marca} ${p.sku || ""}`.toLowerCase().includes(q)) : produtos;
  }, [produtos, buscaProduto]);

  async function sugerirBeneficios() {
    if (!modeloAtual) return;
    setOcupado("Lendo o modelo e sugerindo os benefícios…"); setMsg("");
    try {
      const r = await fetch("/api/beneficios-modelo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: modeloAtual.titulo, marca: modeloAtual.marca, categoria: modeloAtual.categoria, descricao: modeloAtual.descricao_complementar, descricao_seo: modeloAtual.descricao_seo, quantidade: qtdBeneficios }) });
      const j = await r.json();
      if (!r.ok) { setMsg(String(j.erro || "A IA não respondeu.")); if (j.sugestaoTitulo) setDadosModelo((d) => ({ ...d, linha1: d.linha1 || j.sugestaoTitulo.linha1, linha2: d.linha2 || j.sugestaoTitulo.linha2 })); }
      else { setDadosModelo({ linha1: String(j.linha1 || ""), linha2: String(j.linha2 || ""), beneficios: normalizarBeneficios(j.beneficios) }); if (j.capacidade) setMedidas((a) => ({ ...a, capacidade: String(j.capacidade) })); }
    } catch (e: any) { setMsg("Não consegui falar com a IA: " + (e?.message || e)); }
    setOcupado("");
  }
  async function salvarDadosModelo() {
    if (!modeloAtual) return;
    setOcupado("Salvando no modelo…"); setMsg("");
    const dados = { linha1: dadosModelo.linha1.trim(), linha2: dadosModelo.linha2.trim(), capacidade: String(medidas.capacidade || "").trim(), medidas_extras: extrasValidos(medidas.extras), beneficios: dadosModelo.beneficios.filter((b) => b.titulo.trim()), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("produtos_imagens").update(dados).eq("id", modeloAtual.id);
    if (!error) setModelos((l) => l.map((x) => (x.id === modeloAtual.id ? { ...x, ...dados } : x)));
    setOcupado("");
    setMsg(error ? "Não consegui salvar no modelo: " + error.message : "Título, capacidade, medidas extras e benefícios salvos no modelo. Da próxima vez é só escolher o modelo.");
  }
  function mudarBeneficio(i: number, campo2: keyof BeneficioModelo, v: string) { setDadosModelo((d) => ({ ...d, beneficios: d.beneficios.map((b, k) => (k === i ? { ...b, [campo2]: v } : b)) })); }

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
    if (modeloAtual) return; // com modelo escolhido, as medidas vêm dele
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
  /** Tira o fundo da foto no Canva (ferramenta "remover fundo") e guarda o recorte para a montagem. */
  async function recortarPeloCanva(f: FotoEnviada): Promise<void> {
    const ref = fotoParaRecorte(f);
    const r = await fetch("/api/canva/recorte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ref) });
    if (!r.ok || !/^image\//.test(r.headers.get("content-type") || "")) {
      const j = await r.json().catch(() => ({} as any));
      if (j?.desconectado) setCanva((c) => ({ ...c, conectado: false, mensagem: j.erro }));
      throw new Error(String(j?.erro || `o Canva não devolveu o recorte (${r.status})`));
    }
    const url = URL.createObjectURL(await r.blob());
    try { registrarRecorte(f, await carregarImagem(url)); } finally { URL.revokeObjectURL(url); }
  }
  /** Antes de montar: as fotos sem fundo branco usadas em posições de fundo liso são recortadas pelo Canva (o recorte do app só entra se o Canva não puder). */
  async function prepararRecortes(p: PadraoImagem): Promise<void> {
    if (p.tipo !== "montagem" || !(p.fundo_modo === "liso" || p.layout === "beneficios")) return;
    const pendentes = fotosDaPosicao(p, fotos.length).map((i) => fotos[i]).filter((f): f is FotoEnviada => !!f && !f.jaBranco && !temRecorte(f));
    if (!pendentes.length) return;
    if (!canva.conectado) { avisosRecorte.current.add("O Canva não está conectado: o fundo das fotos foi tirado pelo app, que pode deixar falhas nas bordas. Conecte o Canva para um recorte melhor."); return; }
    setOcupado("Tirando o fundo das fotos no Canva…");
    await Promise.all(pendentes.map(async (f) => {
      if (!recortesEmCurso.current.has(f.img)) recortesEmCurso.current.set(f.img, recortarPeloCanva(f));
      try { await recortesEmCurso.current.get(f.img); }
      catch (e: any) { recortesEmCurso.current.delete(f.img); avisosRecorte.current.add(`O Canva não tirou o fundo da foto “${f.nome}” (${String(e?.message || e)}): usei o recorte do app, que pode deixar falhas. Confira a imagem.`); }
    }));
    setOcupado("Montando as imagens…");
  }
  /** Monta uma imagem do tipo "montagem"; na de medidas aceita foto e caixa do produto escolhidas à mão. */
  async function montarUma(p: PadraoImagem, ajuste?: AjusteMedidas): Promise<{ blob: Blob; guia?: GuiaUsado; semLogo: boolean; aviso?: string }> {
    const logo = await carregarLogo(p);
    const usado: PadraoImagem = p.layout === "medidas" && ajuste?.foto ? { ...p, fotos: [ajuste.foto] } : p;
    await prepararRecortes(usado);
    const ctxM = { fotos, logo, medidas, caixaProduto: ajuste?.corpo || null, modelo: { ...dadosModelo, marca: modeloAtual?.marca || marca } } as Parameters<typeof montarImagem>[1];
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
  /** Prompt final da cena: preenche {{titulo}}, {{beneficios}}, {{altura}}… com o modelo escolhido e junta o prompt negativo ("não pode acontecer"). */
  function promptDaCena(p: PadraoImagem, refs?: RefsDoPedido): string {
    return montarPromptCena(p.prompt_ia, p.prompt_negativo, {
      titulo: modeloAtual?.titulo, categoria: modeloAtual?.categoria, descricao: modeloAtual?.descricao_complementar || modeloAtual?.descricao_seo,
      beneficios: dadosModelo.beneficios, altura: medidas.altura, largura: medidas.largura, comprimento: medidas.comprimento,
    }, refs);
  }
  async function gerar() {
    setMsg(""); setResultados([]); setAjustes({}); avisosRecorte.current.clear();
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
          if (canva.conectado) {
            setOcupado(`Gerando “${base.nome}” no Canva… (pode levar até 1 minuto)`);
            try {
              const idx = fotosDaPosicao(p, fotos.length);
              const refsFotos = (idx.length ? idx : [0]).slice(0, 4).map((i) => fotoReduzida(fotos[i] ?? fotos[0]));
              const refsQuadros = quadrosSel.map((i) => quadros[i]).filter(Boolean).map((q) => ({ base64: q.base64, mime: q.mime }));
              const refs = [...refsFotos, ...refsQuadros]; // as fotos principais vão primeiro; os quadros do vídeo, só como complemento
              const blob = await cenaPeloCanva(promptDaCena(p, { fotos: refsFotos.length, quadros: refsQuadros.length }), refs, p.largura, p.altura);
              saida.push({ ...base, blob, url: URL.createObjectURL(blob), aviso: !modeloAtual && /\{\{/.test(p.prompt_ia) ? "Sem modelo escolhido: a cena foi pedida sem título, benefícios e medidas do produto." : undefined });
            } catch (e: any) { saida.push({ ...base, erro: String(e?.message || e) }); }
            setOcupado("Montando as imagens…");
            continue;
          }
          if (!statusIA.configurado) { saida.push({ ...base, travada: canva.chaves ? "Conecte o Canva (botão no topo da página) para gerar a cena por IA." : statusIA.mensagem }); continue; }
          try {
            const ref = fotoReduzida(fotos[fotosDaPosicao(p, fotos.length)[0] ?? 0]);
            const r = await fetch("/api/gerar-cena-ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: promptDaCena(p), fotoBase64: ref.base64, fotoMime: ref.mime, largura: p.largura, altura: p.altura }) });
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
      if (avisosRecorte.current.size) setMsg([...avisosRecorte.current].join(" "));
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
  function adicionarPosicao() { const n = novaPosicao(marca, padroes); if (!n) { setMsg(`O máximo é ${MAX_POSICOES} imagens por marca.`); return; } setMsg(""); setPadroes((l) => [...l, n]); }
  function removerPosicao(posicao: number) {
    const p = padroes.find((x) => x.posicao === posicao); if (!p) return;
    if (padroes.length <= 1) { setMsg("A marca precisa de pelo menos uma imagem."); return; }
    if (!confirm(`Tirar a imagem ${posicao}${p.nome ? ` (${p.nome})` : ""} do padrão? As seguintes sobem uma posição. Vale quando você salvar.`)) return;
    setPadroes((l) => renumerarPosicoes(l.filter((x) => x.posicao !== posicao)));
  }
  async function salvarPadrao() {
    if (!marca) return;
    setOcupado("Salvando o padrão…"); setMsg("");
    const ordenadas = renumerarPosicoes(padroes);
    // sem a chave "id": com `id: undefined` o supabase-js manda a coluna id como null e o banco recusa (not-null). O conflito é por marca+posição.
    const linhas = ordenadas.map((p) => { const { id: _id, ...resto } = p; return { ...resto, marca, updated_at: new Date().toISOString() }; });
    let { error } = await supabase.from("padroes_imagens").upsert(linhas, { onConflict: "marca,posicao" });
    if (!error) ({ error } = await supabase.from("padroes_imagens").delete().eq("marca", marca).gt("posicao", ordenadas.length)); // imagens removidas da lista
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
            {(["gerar", "produtos", "padrao"] as const).map((a) => (
              <button key={a} type="button" data-gi-aba={a} onClick={() => setAba(a)}
                className={`${botao} ${aba === a ? "bg-purple-700 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{a === "gerar" ? "Gerar imagens" : a === "produtos" ? "Produtos (planilha)" : "Padrão da marca"}</button>
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
          <div data-gi-status-ia className={`text-xs flex flex-wrap items-center gap-3 ${canva.conectado || statusIA.configurado ? "text-emerald-300" : "text-gray-400"}`}>
            <span>{canva.conectado || statusIA.configurado ? "✅ " : "🔒 "}Cena de IA: {canva.conectado ? "Canva conectado (gera pelo Canva, usando os créditos de IA da sua conta)." : canva.chaves ? "falta conectar o Canva." : statusIA.mensagem}</span>
            {canva.chaves && !canva.conectado && (
              <button type="button" data-gi-conectar-canva onClick={conectarCanva} className={`${botao} bg-sky-700 hover:bg-sky-600 text-white py-1 text-xs`}>Conectar ao Canva</button>
            )}
            {canva.chaves && canva.conectado && (
              <button type="button" data-gi-reconectar-canva onClick={conectarCanva} className="text-gray-400 underline cursor-pointer">reconectar</button>
            )}
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
                      <select data-gi-fundo-foto value={f.jaBranco ? "sim" : "nao"} title="Se a foto já tem fundo branco, ela não é recortada. Se não (cinza, colorido), o fundo é tirado nas posições em “Fundo branco”."
                        onChange={(e) => { const v = e.target.value === "sim"; setFotos((l) => l.map((x, k) => (k === i ? { ...x, jaBranco: v } : x))); setResultados([]); }}
                        className="w-full mt-1 bg-[#0d0f18] border border-gray-700 rounded px-1 py-1 text-[11px]">
                        <option value="sim">Tem fundo branco</option>
                        <option value="nao">Sem fundo branco</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-gray-800 pt-4 space-y-2" data-gi-video-bloco>
                <h3 className="text-sm font-semibold text-purple-300">Vídeo do produto (opcional, só como complemento da Cena de IA)</h3>
                <p className="text-xs text-gray-500">Complemento, não fonte principal: as fotos continuam sendo a referência do produto. Os quadros marcados vão para a Cena (IA) só para o gerador conferir o que as fotos não mostram (verso, laterais, alça, ferragens, detalhes), e o pedido diz isso a ele. Se o vídeo e as fotos divergirem, valem as fotos. As outras imagens não mudam. Atenção: no Canva cada foto de referência além da primeira consome créditos de IA a mais, então marque só os quadros que ajudam.</p>
                <input data-gi-video type="file" accept="video/*" onChange={escolherVideo} disabled={lendoVideo}
                  className="block text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-700 file:text-white file:font-semibold file:cursor-pointer" />
                {lendoVideo && <p className="text-xs text-purple-200" data-gi-video-lendo>Tirando os quadros do vídeo…</p>}
                {quadros.length > 0 && (
                  <>
                    <p className="text-xs text-gray-400" data-gi-video-qtd>{quadrosSel.length}/{MAX_QUADROS_REF} quadros marcados. Marque os que mostram melhor os detalhes do produto.</p>
                    <div className="flex flex-wrap gap-2">
                      {quadros.map((q, i) => (
                        <button type="button" key={i} data-gi-quadro={i} aria-pressed={quadrosSel.includes(i)} onClick={() => alternarQuadro(i)}
                          className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 cursor-pointer ${quadrosSel.includes(i) ? "border-purple-400" : "border-gray-700 opacity-60"}`}>
                          <img src={q.url} alt={`quadro ${i + 1}`} className="w-full h-full object-cover" />
                          {quadrosSel.includes(i) && <span className="absolute top-0.5 right-0.5 bg-purple-600 text-[10px] px-1 rounded">✓</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 block mb-1">Modelo (cadastrado na aba Produtos): traz as medidas e os benefícios</label>
                  <select data-gi-modelo value={modeloId} onChange={(e) => escolherModelo(e.target.value)} disabled={!marca} className={campo}>
                    <option value="">{!marca ? "Escolha a marca primeiro" : modelos.length ? "Escolha o modelo…" : "Essa marca não tem produtos: importe a planilha na aba Produtos"}</option>
                    {modelos.map((m) => <option key={m.id} value={m.id}>{m.titulo}{m.sku ? ` (SKU ${m.sku})` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">SKU (nome dos arquivos)</label>
                  <input data-gi-sku value={sku} onChange={(e) => setSku(e.target.value)} onBlur={buscarMedidas} placeholder="ex.: 22819" className={campo} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Medidas da imagem de medidas (vêm do modelo escolhido; sem modelo, da aba Dimensões e Peso pelo SKU; você pode editar). Pode usar vírgula ou ponto: 3,5.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([["altura", "Altura (cm)"], ["largura", "Largura (cm)"], ["comprimento", "Comprimento (cm)"]] as const).map(([k, rot]) => (
                    <label key={k} className="block text-[11px] text-gray-400">{rot}
                      <CampoMedida data-gi-medida={k} placeholder="ex.: 3,5" valor={medidas[k]} onMudar={(n) => setMedidas((m) => ({ ...m, [k]: n }))} className={`${campo} mt-1`} />
                    </label>
                  ))}
                  <label className="block text-[11px] text-gray-400">Capacidade (opcional)
                    <input data-gi-medida="capacidade" placeholder="ex.: 8 Litros" value={medidas.capacidade ?? ""} onChange={(e) => setMedidas((m) => ({ ...m, capacidade: e.target.value }))} className={`${campo} mt-1`} />
                  </label>
                </div>
                <div className="mt-3 space-y-2" data-gi-extras>
                  <p className="text-[11px] text-gray-400">Outras medidas (aparecem como mais linhas no “Guia de tamanho”; escreva o nome e o valor com a unidade que quiser, ex.: Alça = 55 cm, Boca = 9,5 cm).</p>
                  <datalist id="gi-nomes-medida">{["Alça", "Profundidade", "Boca", "Diâmetro", "Tamanho da alça", "Espessura"].map((n) => <option key={n} value={n} />)}</datalist>
                  {(medidas.extras || []).map((x, i) => (
                    <div key={i} data-gi-extra={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 md:max-w-xl">
                      <input data-gi-extra-nome list="gi-nomes-medida" maxLength={18} value={x.nome} placeholder="Nome (ex.: Alça)" onChange={(e) => setMedidas((m) => ({ ...m, extras: (m.extras || []).map((y, k) => (k === i ? { ...y, nome: e.target.value } : y)) }))} className={campo} />
                      <input data-gi-extra-valor maxLength={14} value={x.valor} placeholder="Valor (ex.: 55 cm)" onChange={(e) => setMedidas((m) => ({ ...m, extras: (m.extras || []).map((y, k) => (k === i ? { ...y, valor: e.target.value } : y)) }))} className={campo} />
                      <button type="button" data-gi-extra-tirar onClick={() => setMedidas((m) => ({ ...m, extras: (m.extras || []).filter((_, k) => k !== i) }))} className="text-xs text-red-300 hover:text-red-200 cursor-pointer px-2">Tirar</button>
                    </div>
                  ))}
                  {(medidas.extras || []).length < MAX_EXTRAS && (
                    <button type="button" data-gi-add-extra onClick={() => setMedidas((m) => ({ ...m, extras: [...(m.extras || []), { nome: "", valor: "" }] }))} className="text-xs text-purple-300 hover:text-purple-200 cursor-pointer">+ Adicionar medida</button>
                  )}
                </div>
              </div>
              {modeloAtual && (
                <div data-gi-beneficios className="border border-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <p className="text-sm font-semibold text-purple-300">Imagem de benefícios (usa o layout “Benefícios do modelo” do padrão da marca)</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                      <label className="flex items-center gap-1">Quantos benefícios
                        <select data-gi-qtd-beneficios value={qtdBeneficios} onChange={(e) => setQtdBeneficios(Number(e.target.value))} className="bg-[#0d0f18] border border-gray-700 rounded px-2 py-1">
                          {Array.from({ length: MAX_BENEFICIOS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                        </select></label>
                      <button type="button" data-gi-sugerir onClick={sugerirBeneficios} disabled={!!ocupado} className={`${botao} bg-purple-700 hover:bg-purple-600 text-white py-1.5`}>Sugerir benefícios com IA</button>
                      <button type="button" data-gi-salvar-modelo onClick={salvarDadosModelo} disabled={!!ocupado} className={`${botao} bg-gray-700 hover:bg-gray-600 text-white py-1.5`}>Salvar no modelo</button>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input data-gi-linha1 value={dadosModelo.linha1} onChange={(e) => setDadosModelo((d) => ({ ...d, linha1: e.target.value }))} placeholder="Título, linha 1 (fina) — ex.: Touca" className={campo} />
                    <input data-gi-linha2 value={dadosModelo.linha2} onChange={(e) => setDadosModelo((d) => ({ ...d, linha2: e.target.value }))} placeholder="Título, linha 2 (grossa) — ex.: Flat Swim Cap" className={campo} />
                  </div>
                  {dadosModelo.beneficios.map((b, i) => (
                    <div key={i} data-gi-beneficio={i} className="grid md:grid-cols-[1fr_2fr_auto] gap-2">
                      <input data-gi-ben-titulo value={b.titulo} onChange={(e) => mudarBeneficio(i, "titulo", e.target.value)} placeholder="Título do benefício" className={campo} />
                      <input data-gi-ben-descricao value={b.descricao} onChange={(e) => mudarBeneficio(i, "descricao", e.target.value)} placeholder="Descrição curta" className={campo} />
                      <button type="button" onClick={() => setDadosModelo((d) => ({ ...d, beneficios: d.beneficios.filter((_, k) => k !== i) }))} className="text-xs text-red-300 hover:text-red-200 cursor-pointer px-2" aria-label="Tirar benefício">Tirar</button>
                    </div>
                  ))}
                  {dadosModelo.beneficios.length < MAX_BENEFICIOS && (
                    <button type="button" data-gi-add-beneficio onClick={() => setDadosModelo((d) => ({ ...d, beneficios: [...d.beneficios, { titulo: "", descricao: "" }] }))} className="text-xs text-purple-300 hover:text-purple-200 cursor-pointer">+ Adicionar benefício à mão</button>
                  )}
                  {dadosModelo.beneficios.length === 0 && <p className="text-xs text-gray-500">Ainda sem benefícios neste modelo: clique em “Sugerir benefícios com IA” (a IA só reorganiza o que está na descrição do modelo) ou escreva à mão. Depois salve no modelo.</p>}
                </div>
              )}
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

        {aba === "produtos" && (
          <div className="bg-[#131625] p-6 rounded-xl border border-gray-800 space-y-4" data-gi-produtos>
            <div>
              <h2 className="text-lg font-semibold text-purple-400">Produtos do gerador (planilha)</h2>
              <p className="text-xs text-gray-400 mt-1">
                Suba a planilha de produtos exportada do Tiny (.xls, .xlsx ou .csv), a mesma que a Padronização IA lê. Cada produto pai (ou simples) vira um produto desta lista, com título,
                marca, categoria, medidas, peso e descrições. A lista é só do gerador e não mexe na Padronização IA: é daqui que você escolhe o modelo na aba Gerar imagens.
                Se o produto (mesmo título e marca) já existir, os dados da planilha são atualizados e os benefícios que você salvou continuam.
              </p>
            </div>
            <input data-gi-planilha type="file" accept=".xls,.xlsx,.csv" onChange={lerPlanilhaProdutos} disabled={importando}
              className="block text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white file:font-semibold file:cursor-pointer" />
            {msgImport && <p data-gi-msg-import className="text-xs text-gray-300 bg-[#1b1f38] border border-gray-700 rounded-lg p-3">{msgImport}</p>}

            {previa && (
              <div data-gi-previa className="space-y-3">
                <p className="text-xs text-gray-300">
                  <strong>{previa.arquivo}</strong>: {previa.modelos.length} produto(s) encontrado(s)
                  {previa.ignoradas > 0 ? ` (${previa.ignoradas} linha(s) de variação ignorada(s): vale o produto pai)` : ""}.
                </p>
                <div className="overflow-x-auto border border-gray-800 rounded-lg max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1b1f38] text-gray-400 uppercase sticky top-0"><tr>
                      <th className="p-3 w-8"></th><th className="p-3">Título</th><th className="p-3">Marca</th><th className="p-3">Categoria</th><th className="p-3">Medidas (A×L×C) / Peso</th><th className="p-3">Situação</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-800">
                      {previa.modelos.map((m, i) => {
                        const ja = produtos.some((p) => p.chave === chaveProduto(m.titulo, m.marca));
                        return (
                          <tr key={i} data-gi-previa-linha>
                            <td className="p-3"><input type="checkbox" checked={m.marcada} onChange={(e) => setPrevia({ ...previa, modelos: previa.modelos.map((x, j) => (j === i ? { ...x, marcada: e.target.checked } : x)) })} className="accent-purple-600 cursor-pointer" /></td>
                            <td className="p-3 text-white">{m.titulo}</td>
                            <td className="p-3 text-gray-300">{m.marca || MARCA_PADRAO}</td>
                            <td className="p-3 text-gray-300">{m.categoria || "—"}</td>
                            <td className="p-3 text-gray-300 font-mono">{m.altura || 0}x{m.largura || 0}x{m.comprimento || 0} cm {m.peso ? `| ${m.peso} kg` : ""}</td>
                            <td className="p-3">{ja ? <span className="text-amber-300">atualiza o existente</span> : <span className="text-green-400">novo</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setPrevia(null)} className={`${botao} bg-gray-700 hover:bg-gray-600 text-white`}>Descartar</button>
                  <button type="button" data-gi-importar disabled={importando || previa.modelos.every((m) => !m.marcada)} onClick={importarProdutos} className={`${botao} bg-purple-600 hover:bg-purple-700 text-white`}>
                    {importando ? "Importando…" : `Importar ${previa.modelos.filter((m) => m.marcada).length} produto(s)`}
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-800">
              <h3 className="text-sm font-semibold text-gray-200" data-gi-produtos-qtd>Produtos cadastrados: {produtos.length}</h3>
              <input data-gi-busca-produto value={buscaProduto} onChange={(e) => setBuscaProduto(e.target.value)} placeholder="Buscar por título, marca ou SKU" className={`${campo} max-w-xs`} />
            </div>
            {produtos.length === 0 ? (
              <p className="text-xs text-gray-500">Nenhum produto ainda. Suba a planilha acima.</p>
            ) : (
              <div className="overflow-x-auto border border-gray-800 rounded-lg max-h-[28rem] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1b1f38] text-gray-400 uppercase sticky top-0"><tr>
                    <th className="p-3">Marca</th><th className="p-3">Título</th><th className="p-3">SKU</th><th className="p-3">Medidas (A×L×C)</th><th className="p-3">Benefícios</th><th className="p-3"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-800">
                    {produtosFiltrados.map((p) => {
                      const nb = normalizarBeneficios(p.beneficios).length;
                      return (
                        <tr key={p.id} data-gi-produto={p.id}>
                          <td className="p-3 text-gray-300">{p.marca}</td>
                          <td className="p-3 text-white">{p.titulo}</td>
                          <td className="p-3 text-gray-400 font-mono">{p.sku || "—"}</td>
                          <td className="p-3 text-gray-300 font-mono">{p.altura || 0}x{p.largura || 0}x{p.comprimento || 0} cm</td>
                          <td className="p-3">{nb ? <span className="text-green-400">{nb} salvo(s)</span> : <span className="text-gray-500">ainda não</span>}</td>
                          <td className="p-3 text-right">
                            <button type="button" data-gi-apagar-produto={p.id} onClick={() => apagarProduto(p.id)} className="text-red-300 hover:text-red-200 cursor-pointer">{apagarId === p.id ? "Confirmar: apagar" : "Apagar"}</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
                      <button type="button" data-gi-remover-posicao onClick={() => removerPosicao(p.posicao)} className="ml-auto text-xs text-red-300 hover:text-red-200 cursor-pointer">Tirar esta imagem</button>
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
                        <div className="flex flex-wrap gap-3 text-sm">{Array.from({ length: MAX_FOTOS }, (_, i) => i + 1).map((n) => (
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
                        <label className="text-xs text-gray-400 block mt-3 mb-1">O que NÃO pode acontecer (prompt negativo, uma regra por linha)</label>
                        <textarea data-gi-prompt-negativo rows={5} value={p.prompt_negativo} onChange={(e) => ajustar(p.posicao, { prompt_negativo: e.target.value })} className={campo}
                          placeholder="Ex.: faltar a etiqueta/logo do produto; a alça sem a ombreira; a estampa alterada…" />
                        <p className="text-xs text-gray-500 mt-1">O Canva não tem um campo de prompt negativo próprio: o app junta estas linhas ao pedido como “Must NOT happen”. Escreva em inglês, se puder, e diga também o que deve ficar (ex.: “the rubber brand label on the front must be visible”). Texto muito pequeno, como letras de uma etiqueta, o gerador nem sempre consegue reproduzir.</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <button type="button" data-gi-prompt-pessoa onClick={() => ajustar(p.posicao, { prompt_ia: PROMPT_CENA_PESSOA, prompt_negativo: PROMPT_NEGATIVO_CENA })} className={`${botao} bg-gray-700 hover:bg-gray-600 text-white py-1 text-xs`}>Usar o prompt padrão “pessoa usando o produto” (com o negativo)</button>
                          <span className="text-xs text-gray-500">Os campos {"{{titulo}}"}, {"{{beneficios}}"}, {"{{altura}}"}… são preenchidos com o modelo escolhido na hora de gerar (escolha o modelo na aba Gerar).</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{canva.conectado || statusIA.configurado ? "Serviço de imagem configurado." : canva.chaves ? "🔒 Falta conectar o Canva (botão no topo da página): o padrão já fica salvo." : "🔒 Travada por enquanto: o padrão já fica salvo e passa a valer quando o serviço de imagem for configurado."}</p></div>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" data-gi-add-posicao onClick={adicionarPosicao} disabled={padroes.length >= MAX_POSICOES} className={`${botao} bg-gray-700 hover:bg-gray-600 text-white`}>+ Adicionar imagem ({padroes.length}/{MAX_POSICOES})</button>
                  <span className="text-xs text-gray-500">Cada imagem tem o seu layout, fotos e fundo. Salve o padrão para valer.</span>
                </div>
                <button type="button" data-gi-salvar onClick={salvarPadrao} disabled={!!ocupado} className={`${botao} bg-purple-700 hover:bg-purple-600 text-white px-6 py-2.5`}>Salvar padrão de {marcaAtual}</button>
                {msg && <p data-gi-msg-salvar className="text-sm text-amber-200">{msg}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
