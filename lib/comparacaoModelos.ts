// Comparação entre o PRODUTO NOVO e o MODELO (produto base) da aba Padronização, sem IA e sem rede.
//
// Exemplo: novo "Bolsa Sacola Farm 3 Litros Floral Bahia" x modelo "Bolsa Sacola 3 Litros Samba Canção Original Farm"
//   - o que é igual:   Bolsa Sacola, 3 Litros (e a marca / "Original", que sempre ficam)
//   - o que muda:      Samba Canção  ->  Floral Bahia
//   - título adaptado: "Bolsa Sacola 3 Litros Floral Bahia Original Farm"
// A mesma troca vale para a descrição, a descrição SEO e as palavras-chave do modelo. A IA só entra, se o usuário quiser,
// para reescrever o texto da descrição quando a estampa antiga é citada de forma visual.

import { norm } from "./padroesAnuncios";
import { ajustarTitulo, LIMITE_TITULO } from "./adaptarModelo";

interface Palavra { texto: string; chave: string; capacidade: boolean; fixa: boolean }

const UNIDADES = /^(litros?|l|ml|g|kg|cm|mm)$/;
const ehNumero = (s: string) => /^\d+([.,]\d+)?$/.test(s);
const soAlfaNum = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");
const unidadeCanonica = (u: string) => (/^litros?$/.test(u) ? "l" : u);

/** Quebra o nome em palavras; "3 Litros" (número + unidade) vira UMA palavra de capacidade. */
function palavras(texto: string, marca: string): Palavra[] {
  const marcas = new Set(norm(marca).split(/[^a-z0-9]+/).filter(Boolean));
  const cruas = String(texto ?? "").replace(/\s+/g, " ").trim().split(" ").filter((w) => w && !/^[-–—|]+$/.test(w));
  const out: Palavra[] = [];
  for (let i = 0; i < cruas.length; i++) {
    const w = cruas[i];
    const k = soAlfaNum(w);
    if (!k) continue;
    const prox = cruas[i + 1] ? soAlfaNum(cruas[i + 1]) : "";
    if (ehNumero(w) && UNIDADES.test(prox)) {
      out.push({ texto: `${w} ${cruas[i + 1]}`, chave: `${soAlfaNum(w)}${unidadeCanonica(prox)}`, capacidade: true, fixa: false });
      i++;
      continue;
    }
    const m = k.match(/^(\d+)(litros?|l|ml|g|kg|cm|mm)$/);
    if (m) { out.push({ texto: w, chave: `${m[1]}${unidadeCanonica(m[2])}`, capacidade: true, fixa: false }); continue; }
    out.push({ texto: w, chave: k, capacidade: false, fixa: marcas.has(k) || k === "original" });
  }
  return out;
}

/** Maior subsequência comum entre duas listas de chaves: devolve, para cada posição de `a`, a posição casada em `b` (ou -1). */
function casar(a: string[], b: string[]): number[] {
  const n = a.length, m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const res = new Array(n).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { res[i] = j; i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return res;
}

export interface Troca { de: string; para: string }
export interface Comparacao {
  /** título do modelo já com a estampa/capacidade do produto novo (máx. 60 caracteres) */
  titulo: string;
  /** trocas a aplicar nos textos do modelo (estampa e capacidade) */
  trocas: Troca[];
  /** palavras do modelo que saem / palavras do produto novo que entram (para mostrar na tela) */
  sai: string[];
  entra: string[];
  /** o modelo e o produto novo têm capacidades diferentes (ex.: 3 Litros x 5 Litros) */
  capacidadeDiferente: boolean;
  /** 0..1: quanto do produto novo (sem a estampa) já existe no modelo */
  parecido: number;
}

export function compararProdutoModelo(nomeNovo: string, tituloModelo: string, marca: string): Comparacao {
  const base = palavras(tituloModelo, marca);
  const novo = palavras(nomeNovo, marca).filter((w) => !w.fixa);
  const candidatas = base.map((w, i) => ({ w, i })).filter((x) => !x.w.fixa);
  const par = casar(candidatas.map((x) => x.w.chave), novo.map((w) => w.chave));

  // "lacunas": o que fica entre duas palavras iguais. Em cada lacuna, o que é do modelo sai e o que é do produto novo entra,
  // então a estampa nova ocupa o lugar da estampa antiga (e não o lugar de uma palavra solta como "Estojo").
  const nLacunas = par.filter((x) => x >= 0).length + 1;
  const lacBase: Palavra[][] = Array.from({ length: nLacunas }, () => []);
  const lacNovo: Palavra[][] = Array.from({ length: nLacunas }, () => []);
  const lacunaDaBase = new Map<number, number>();      // posição em `base` -> lacuna (só palavras que saem)
  const casadoNovo = new Set<number>();
  let ancoras = 0;
  candidatas.forEach((x, k) => {
    if (par[k] >= 0) { ancoras++; casadoNovo.add(par[k]); }
    else { lacBase[ancoras].push(x.w); lacunaDaBase.set(x.i, ancoras); }
  });
  let a = 0;
  novo.forEach((w, j) => { if (casadoNovo.has(j)) a++; else lacNovo[a].push(w); });

  // título: percorre o modelo; palavras iguais ficam, a lacuna é preenchida com as palavras novas
  const partes: string[] = [];
  const preenchida = new Array(nLacunas).fill(false);
  const preencher = (g: number) => { if (!preenchida[g]) { preenchida[g] = true; partes.push(...lacNovo[g].map((w) => w.texto)); } };
  if (lacBase[0].length === 0) preencher(0);
  let vistas = 0;
  const ehCandidata = new Set(candidatas.map((x) => x.i));
  base.forEach((w, i) => {
    if (lacunaDaBase.has(i)) { preencher(lacunaDaBase.get(i)!); return; }   // palavra do modelo que sai
    partes.push(w.texto);
    if (ehCandidata.has(i)) { vistas++; if (lacBase[vistas].length === 0) preencher(vistas); }   // nada saiu aqui: o novo entra logo após a palavra igual
  });
  for (let g = 0; g < nLacunas; g++) preencher(g);

  // trocas nos textos: só onde algo SAI e algo ENTRA na mesma lacuna (apagar uma palavra solta no texto estragaria frases)
  const trocas: Troca[] = [];
  let capacidadeDiferente = false;
  for (let g = 0; g < nLacunas; g++) {
    for (const cap of [false, true]) {
      const de = lacBase[g].filter((w) => w.capacidade === cap).map((w) => w.texto).join(" ");
      const para = lacNovo[g].filter((w) => w.capacidade === cap).map((w) => w.texto).join(" ");
      if (de && para && norm(de) !== norm(para)) { trocas.push({ de, para }); if (cap) capacidadeDiferente = true; }
    }
  }
  const sai = lacBase.flat().map((w) => w.texto), entra = lacNovo.flat().map((w) => w.texto);
  const parecido = novo.length ? casadoNovo.size / novo.length : 0;

  return { titulo: ajustarTitulo(partes.join(" "), LIMITE_TITULO), trocas, sai, entra, capacidadeDiferente, parecido };
}

/** Troca `de` por `para` no texto sem diferenciar maiúsculas/acentos e só em palavra inteira. Devolve o texto e quantas trocas fez. */
export function trocarTexto(texto: string, de: string, para: string): { texto: string; n: number } {
  const original = String(texto ?? "");
  const alvo = norm(de).replace(/\s+/g, " ");
  if (!alvo) return { texto: original, n: 0 };
  let ns = "";
  const mapa: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const c = original[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (let k = 0; k < c.length; k++) { ns += c[k]; mapa.push(i); }
  }
  const alfa = (ch: string | undefined) => !!ch && /[a-z0-9]/.test(ch);
  const achados: [number, number][] = [];
  for (let pos = ns.indexOf(alvo); pos >= 0; pos = ns.indexOf(alvo, pos + alvo.length)) {
    if (alfa(ns[pos - 1]) || alfa(ns[pos + alvo.length])) continue;
    achados.push([mapa[pos], mapa[pos + alvo.length - 1] + 1]);
  }
  let r = original;
  for (let k = achados.length - 1; k >= 0; k--) r = r.slice(0, achados[k][0]) + para + r.slice(achados[k][1]);
  if (achados.length && !para) r = r.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:])/g, "$1");
  return { texto: r, n: achados.length };
}

export function aplicarTrocas(texto: string, trocas: Troca[]): string {
  return trocas.reduce((t, x) => trocarTexto(t, x.de, x.para).texto, String(texto ?? ""));
}

/** Quantas vezes as palavras que saem aparecem no texto (para avisar quando a descrição fala da estampa antiga). */
export function ocorrencias(texto: string, trocas: Troca[]): number {
  return trocas.reduce((s, x) => s + trocarTexto(texto, x.de, "").n, 0);
}

export interface ModeloLinha {
  id: any; titulo?: string | null; marca?: string | null; sku?: string | null; slug?: string | null;
  descricao_seo?: string | null; palavras_chave_seo?: string | null; descricao_complementar?: string | null;
  [k: string]: any;
}

/** Procura o modelo pelo SKU digitado (igual, ou o SKU do pai/variação: "12345" x "12345-AZ-P"). */
export function acharModeloPorSku<T extends ModeloLinha>(skuDigitado: string, modelos: T[]): T | null {
  const s = String(skuDigitado ?? "").trim().toLowerCase();
  if (!s) return null;
  const comSku = modelos.filter((m) => m.sku && String(m.sku).trim());
  const exato = comSku.find((m) => String(m.sku).trim().toLowerCase() === s);
  if (exato) return exato;
  if (s.length < 4) return null;
  return comSku.find((m) => {
    const ms = String(m.sku).trim().toLowerCase();
    return ms.length >= 4 && (s.startsWith(ms + "-") || ms.startsWith(s + "-"));
  }) || null;
}

/** Tudo que o modelo entrega para o produto novo SEM IA: título, SEO, palavras-chave, slug e a descrição com as trocas feitas. */
export function conteudoPeloModelo(nomeNovo: string, marca: string, modelo: ModeloLinha) {
  const c = compararProdutoModelo(nomeNovo, String(modelo.titulo || ""), marca);
  return {
    comparacao: c,
    titulo: c.titulo,
    descricao: aplicarTrocas(String(modelo.descricao_complementar || ""), c.trocas),
    descSeo: aplicarTrocas(String(modelo.descricao_seo || ""), c.trocas),
    palavrasChave: aplicarTrocas(String(modelo.palavras_chave_seo || ""), c.trocas),
  };
}

// ---------- pedidos curtos para a IA (poucos tokens) ----------

/** Reescreve a descrição do modelo para o produto novo. Entrada: só a descrição e as trocas; saída: só o texto. */
export function pedidoDescricaoDoModelo(descricaoModelo: string, trocas: Troca[], marca: string): string {
  const lista = trocas.length ? trocas.map((t) => `"${t.de}" -> "${t.para || "(remover)"}"`).join("; ") : "nenhuma";
  return `Adapte a descrição de produto abaixo (marca ${marca}) para um produto novo da mesma linha. Trocas obrigatórias: ${lista}. ` +
    `Onde o texto descrever cor, desenho ou clima da estampa antiga, reescreva de forma neutra ou apague; não invente cor, medida nem material. ` +
    `Mantenha o resto idêntico, em texto puro (sem markdown, sem emojis, sem comentários). Responda só com a descrição.\n\n${descricaoModelo}`;
}

/** Descrição genérica quando não há modelo: só o nome e a marca. */
export function pedidoDescricaoGenerica(nome: string, marca: string, categoria = ""): string {
  return `Escreva a descrição complementar de e-commerce (texto puro, sem markdown nem emojis) do produto "${nome}", marca ${marca}${categoria ? `, categoria ${categoria}` : ""}. ` +
    `Estrutura: parágrafo de abertura (3 a 4 frases); "Especificações:" (linhas "- Marca: ...", "- Modelo: ..."); "Benefícios:" (linhas "- Nome: explicação curta."); ` +
    `"Composição:" (linhas com "- "); "Cuidados e Conservação:" (uma frase por linha, sem hífen). Sem inventar medidas, tamanho ou cor. Responda só com a descrição.`;
}
