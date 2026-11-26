// Correção de anúncios: pega a planilha de produtos do Tiny (anúncios já criados) e corrige título, descrição, SEO, slug, categoria,
// medidas e peso com base no MODELO escolhido na Padronização. Não salva nada: devolve as linhas corrigidas para virar a planilha de upload.
// Sem rede e sem IA aqui (a IA, se marcada, só reescreve a descrição e é chamada pela tela).

import { conteudoPeloModelo, type ModeloLinha } from "./comparacaoModelos";
import { slugDoTitulo } from "./adaptarModelo";
import { medidasDoProduto, norm } from "./padroesAnuncios";

export type Linha = Record<string, any>;

const chave = (s: any) => norm(s);
const texto = (v: any) => (v === null || v === undefined ? "" : String(v));

// ---------- colunas da planilha do Tiny (nome real do cabeçalho, sem depender de acento/maiúscula) ----------
export interface Colunas {
  sku?: string; desc?: string; tipo?: string; pai?: string; variacoes?: string; marca?: string; categoria?: string;
  largura?: string; altura?: string; comprimento?: string; pesoLiq?: string; pesoBruto?: string;
  compl?: string; tituloSeo?: string; descSeo?: string; kw?: string; slug?: string;
}

export function mapearColunas(headers: string[]): Colunas {
  const mapa = new Map<string, string>();
  headers.forEach((h) => { const k = chave(h); if (k && !mapa.has(k)) mapa.set(k, h); });
  const achar = (...nomes: string[]) => { for (const n of nomes) { const h = mapa.get(chave(n)); if (h) return h; } return undefined; };
  return {
    sku: achar("Código (SKU)", "SKU", "Código"), desc: achar("Descrição", "Título", "Nome"), tipo: achar("Tipo do produto"),
    pai: achar("Código do pai"), variacoes: achar("Variações"), marca: achar("Marca"), categoria: achar("Categoria"),
    largura: achar("Largura embalagem"), altura: achar("Altura embalagem"), comprimento: achar("Comprimento embalagem"),
    pesoLiq: achar("Peso líquido (Kg)"), pesoBruto: achar("Peso bruto (Kg)"),
    compl: achar("Descrição complementar"), tituloSeo: achar("Título SEO"), descSeo: achar("Descrição SEO"),
    kw: achar("Palavras chave SEO"), slug: achar("Slug"),
  };
}

/** Colunas que a correção precisa para funcionar; o que faltar vira aviso na tela. */
export function colunasObrigatorias(c: Colunas): string[] {
  const falta: string[] = [];
  if (!c.sku) falta.push("Código (SKU)");
  if (!c.desc) falta.push("Descrição");
  return falta;
}

// ---------- agrupamento: um anúncio = o produto pai + as variações ----------
export interface GrupoAnuncio {
  /** SKU do pai (ou do produto simples) */
  chave: string;
  paiIdx: number | null;
  filhosIdx: number[];
  marca: string;
  /** título atual do anúncio, sem o sufixo de variação */
  nomeAtual: string;
}

const val = (l: Linha, col?: string) => (col ? texto(l[col]).trim() : "");

/** Separa "Nome - Cor - Tam" em base e sufixo, usando quantas variações o produto tem (campo Variações: "Cor:X||Tamanho:Y||"). */
export function baseDoFilho(desc: string, variacoes: string): { base: string; sufixo: string } {
  const partes = desc.split(/\s+-\s+/);
  const nVar = (variacoes.match(/\|\|/g) || []).length;
  if (nVar > 0 && partes.length > nVar) return { base: partes.slice(0, partes.length - nVar).join(" - ").trim(), sufixo: " - " + partes.slice(partes.length - nVar).join(" - ") };
  return { base: desc.trim(), sufixo: "" };
}

export function agruparAnuncios(linhas: Linha[], c: Colunas): GrupoAnuncio[] {
  const grupos: GrupoAnuncio[] = [];
  const porPai = new Map<string, GrupoAnuncio>();
  const ehPai = (l: Linha) => chave(val(l, c.tipo)) === "v";
  // 1) pais ("com variações")
  linhas.forEach((l, i) => {
    if (!ehPai(l)) return;
    const sku = val(l, c.sku);
    if (!sku) return;
    const g: GrupoAnuncio = { chave: sku, paiIdx: i, filhosIdx: [], marca: val(l, c.marca), nomeAtual: val(l, c.desc) };
    grupos.push(g); porPai.set(sku, g);
  });
  // 2) filhos e produtos simples, na ordem da planilha
  linhas.forEach((l, i) => {
    if (ehPai(l)) return;
    const sku = val(l, c.sku), pai = val(l, c.pai);
    if (!sku && !val(l, c.desc)) return;                         // linha vazia
    if (pai) {
      let g = porPai.get(pai);
      if (!g) {                                                  // pai que não está na planilha: o grupo nasce da primeira variação
        g = { chave: pai, paiIdx: null, filhosIdx: [], marca: val(l, c.marca), nomeAtual: baseDoFilho(val(l, c.desc), val(l, c.variacoes)).base };
        grupos.push(g); porPai.set(pai, g);
      }
      g.filhosIdx.push(i);
      if (!g.marca) g.marca = val(l, c.marca);
      return;
    }
    grupos.push({ chave: sku || `linha-${i + 2}`, paiIdx: i, filhosIdx: [], marca: val(l, c.marca), nomeAtual: val(l, c.desc) });   // produto simples
  });
  return grupos;
}

/** Título em CAIXA ALTA vira "Título Normal"; se já está bem escrito, não mexe (preserva "Onça dos Trópicos"). */
export function nomeParaComparar(nome: string): string {
  const letras = nome.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letras) return nome;
  const maiusculas = letras.replace(/[^A-ZÀ-Ý]/g, "").length;
  if (maiusculas / letras.length < 0.6) return nome.replace(/\s+/g, " ").trim();
  const minusculas = ["de", "do", "da", "dos", "das", "e", "em", "por", "com", "para", "a", "o"];
  return nome.toLowerCase().replace(/\s+/g, " ").trim().split(" ").map((w, i) => (i > 0 && minusculas.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

// ---------- correção ----------
export interface OpcoesCorrecao { titulo: boolean; descricao: boolean; seo: boolean; categoria: boolean; medidas: boolean }
export const OPCOES_PADRAO: OpcoesCorrecao = { titulo: true, descricao: true, seo: true, categoria: true, medidas: true };

export interface MedidasReais { altura: any; largura: any; comprimento: any; peso: any }
export interface Alteracao { sku: string; tipo: "pai" | "variação" | "simples"; campo: string; antes: string; depois: string }
export interface ResultadoGrupo {
  chave: string;
  nomeAtual: string;
  tituloNovo: string;
  modeloTitulo: string;
  /** linhas corrigidas, pelo índice na planilha original (só as que mudaram) */
  linhasNovas: Map<number, Linha>;
  alteracoes: Alteracao[];
  avisos: string[];
}

const num = (v: any): number | null => { const n = Number(String(v ?? "").replace(",", ".")); return String(v ?? "").trim() !== "" && Number.isFinite(n) && n > 0 ? n : null; };
const igual = (a: any, b: any) => texto(a).trim() === texto(b).trim();
const igualNum = (a: any, b: any) => { const x = num(a), y = num(b); return x !== null && y !== null ? x === y : igual(a, b); };

/**
 * Corrige um anúncio com o modelo escolhido. `tituloFinal` é o título que o usuário aprovou na tela (vazio = o calculado);
 * `descricaoIA` é a descrição reescrita pela IA, quando ela foi pedida e respondeu; `dimensoes` são as medidas reais da aba Dimensões e Peso.
 */
export function corrigirGrupo(
  linhas: Linha[], g: GrupoAnuncio, c: Colunas, modelo: ModeloLinha, opcoes: OpcoesCorrecao,
  extras: { tituloFinal?: string; descricaoIA?: string; linhasExtras?: string[]; dimensoes?: MedidasReais | null } = {}
): ResultadoGrupo {
  const nome = nomeParaComparar(g.nomeAtual);
  const marca = g.marca || String(modelo.marca || "") || "Best Fit";
  const cont = conteudoPeloModelo(nome, marca, modelo, extras.linhasExtras || []);
  const tituloNovo = (extras.tituloFinal || "").trim() || cont.titulo;
  const descricao = (extras.descricaoIA || "").trim() || cont.descricao;
  const avisos: string[] = [];
  const linhasNovas = new Map<number, Linha>();
  const alteracoes: Alteracao[] = [];

  // medidas: real (Dimensões e Peso) > modelo; sem nenhuma das duas, a planilha fica como está (nunca vira 20x20x20)
  const fonteMedidas = extras.dimensoes && [extras.dimensoes.altura, extras.dimensoes.largura, extras.dimensoes.comprimento, extras.dimensoes.peso].some((v) => num(v) !== null) ? extras.dimensoes : modelo;
  const temMedidas = [fonteMedidas.altura, fonteMedidas.largura, fonteMedidas.comprimento, fonteMedidas.peso].some((v) => num(v) !== null);
  const m = medidasDoProduto({}, fonteMedidas as any);
  if (opcoes.medidas && !temMedidas) avisos.push("o modelo não tem medidas nem peso: medidas e peso ficaram como estavam");
  if (opcoes.categoria && !String(modelo.categoria || "").trim()) avisos.push("o modelo não tem categoria: a categoria ficou como estava");
  if (opcoes.descricao && !String(modelo.descricao_complementar || "").trim() && !extras.descricaoIA) avisos.push("o modelo não tem descrição complementar: a descrição ficou como estava");

  const indices = [...(g.paiIdx !== null ? [g.paiIdx] : []), ...g.filhosIdx];
  for (const i of indices) {
    const original = linhas[i];
    const nova: Linha = { ...original };
    const ehPai = i === g.paiIdx && g.filhosIdx.length > 0;
    const tipo: Alteracao["tipo"] = ehPai ? "pai" : i === g.paiIdx ? "simples" : "variação";
    const sku = val(original, c.sku);
    const antesDaLinha = alteracoes.length;
    const mudou = (campo: string | undefined, rotulo: string, depois: string, comparar: (a: any, b: any) => boolean = igual) => {
      if (!campo) return;
      if (comparar(original[campo], depois)) return;
      nova[campo] = depois;
      alteracoes.push({ sku, tipo, campo: rotulo, antes: texto(original[campo]), depois });
    };

    // título deste produto: o pai leva o título novo; a variação troca só a parte do nome e mantém " - Cor - Tamanho"
    let tituloLinha = texto(original[c.desc || ""]).trim();
    if (i === g.paiIdx) tituloLinha = tituloNovo;
    else {
      const atual = g.nomeAtual.trim();
      if (atual && chave(tituloLinha.slice(0, atual.length)) === chave(atual)) tituloLinha = tituloNovo + tituloLinha.slice(atual.length);
      else {
        const { base, sufixo } = baseDoFilho(tituloLinha, val(original, c.variacoes));
        if (sufixo) tituloLinha = tituloNovo + sufixo;
        else if (chave(base) === chave(atual)) tituloLinha = tituloNovo;
      }
    }
    tituloLinha = tituloLinha.replace(/\s{2,}/g, " ").trim();   // o Tiny às vezes exporta "Original  - Cor" (2 espaços)
    if (opcoes.titulo) mudou(c.desc, "Descrição (título)", tituloLinha);
    if (opcoes.descricao && descricao) mudou(c.compl, "Descrição complementar", descricao);
    if (opcoes.seo) {
      mudou(c.tituloSeo, "Título SEO", tituloLinha);
      if (cont.descSeo) mudou(c.descSeo, "Descrição SEO", cont.descSeo);
      if (cont.palavrasChave) mudou(c.kw, "Palavras chave SEO", cont.palavrasChave);
      mudou(c.slug, "Slug", slugDoTitulo(tituloLinha, String(modelo.slug || "")));
    }
    if (opcoes.categoria && String(modelo.categoria || "").trim()) mudou(c.categoria, "Categoria", String(modelo.categoria));
    if (opcoes.medidas && temMedidas) {
      mudou(c.altura, "Altura embalagem", String(m.altura), igualNum);
      mudou(c.largura, "Largura embalagem", String(m.largura), igualNum);
      mudou(c.comprimento, "Comprimento embalagem", String(m.comprimento), igualNum);
      mudou(c.pesoLiq, "Peso líquido (Kg)", m.peso.toFixed(3), igualNum);
      mudou(c.pesoBruto, "Peso bruto (Kg)", m.peso.toFixed(3), igualNum);
    }
    if (alteracoes.length > antesDaLinha) linhasNovas.set(i, nova);
  }
  return { chave: g.chave, nomeAtual: g.nomeAtual, tituloNovo, modeloTitulo: String(modelo.titulo || ""), linhasNovas, alteracoes, avisos };
}

/** Aplica os resultados na planilha: devolve TODAS as linhas na ordem original, com as corrigidas no lugar. */
export function montarPlanilhaCorrigida(linhas: Linha[], resultados: ResultadoGrupo[]): Linha[] {
  const saida = linhas.slice();
  for (const r of resultados) r.linhasNovas.forEach((nova, i) => { saida[i] = nova; });
  return saida;
}
