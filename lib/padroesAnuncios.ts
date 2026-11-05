// Padrões de anúncio (aba Padronização): leitura da planilha de produtos do Tiny/Olist e escolha do modelo
// que serve a um produto novo (usado para trazer medidas, categoria e peso na exportação).

export const norm = (v: any) =>
  String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ", agrave: "à", Agrave: "À", ccedil: "ç", Ccedil: "Ç", uuml: "ü", ordm: "º", ordf: "ª",
  ndash: "–", mdash: "—", hellip: "…", deg: "°",
};

/** HTML do Tiny (<p>, <br>, <li>) -> texto simples com linhas, no mesmo formato do campo "Descrição complementar" da tela. */
export function htmlParaTexto(html: any): string {
  let s = String(html ?? "");
  if (!/<[a-z!/]/i.test(s)) return s.replace(/\r\n?/g, "\n").trim();
  s = s
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol)\s*>\s*(<\s*(p|div|h[1-6]|ul|ol)[^>]*>)?/gi, "\n\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTIDADES ? ENTIDADES[n] : m));
  return s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const numero = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface ModeloPadrao {
  titulo: string;
  marca: string;
  slug: string;
  palavras_chave_seo: string;
  categoria: string;
  altura: number | null;
  largura: number | null;
  comprimento: number | null;
  peso: number | null;
  descricao_seo: string;
  descricao_complementar: string;
  /** SKU de onde o modelo saiu (só informativo) */
  sku: string;
}

type Linha = Record<string, any>;

/** Converte as linhas da planilha de produtos do Tiny/Olist em modelos da Padronização (um por produto pai ou simples). */
export function modelosDaPlanilha(linhas: Linha[]): { modelos: ModeloPadrao[]; ignoradas: number } {
  const lidas = linhas.map((l) => {
    const m: Record<string, any> = {};
    Object.keys(l).forEach((k) => { m[norm(k)] = l[k]; });
    const c = (...nomes: string[]) => { for (const n of nomes) { const v = m[norm(n)]; if (v !== undefined && String(v).trim() !== "") return v; } return ""; };
    return {
      sku: String(c("codigo (sku)", "sku", "codigo")).trim(),
      desc: String(c("descricao", "titulo", "nome", "produto")).replace(/\s+/g, " ").trim(),
      tipo: norm(c("tipo do produto")),
      pai: String(c("codigo do pai")).trim(),
      variacoes: String(c("variacoes")),
      marca: String(c("marca")).trim(),
      slug: String(c("slug")).trim(),
      kw: String(c("palavras chave seo")).trim(),
      categoria: String(c("categoria")).trim(),
      alt: numero(c("altura embalagem", "altura")),
      larg: numero(c("largura embalagem", "largura")),
      comp: numero(c("comprimento embalagem", "comprimento")),
      peso: numero(c("peso bruto (kg)", "peso liquido (kg)", "peso")),
      seo: String(c("descricao seo")).trim(),
      compl: htmlParaTexto(c("descricao complementar")),
    };
  }).filter((l) => l.sku || l.desc);

  const codigosPai = new Set(lidas.filter((l) => l.tipo === "v").map((l) => l.sku));
  const modelos: ModeloPadrao[] = [];
  const paisOrfaosVistos = new Set<string>();
  let ignoradas = 0;

  const montar = (l: typeof lidas[number], titulo: string): ModeloPadrao => ({
    titulo, marca: l.marca, slug: l.slug, palavras_chave_seo: l.kw, categoria: l.categoria,
    altura: l.alt, largura: l.larg, comprimento: l.comp, peso: l.peso,
    descricao_seo: l.seo, descricao_complementar: l.compl, sku: l.sku,
  });

  for (const l of lidas) {
    if (!l.desc) { ignoradas++; continue; }
    if (l.tipo === "v") { modelos.push(montar(l, l.desc)); continue; }
    if (l.pai) {
      if (codigosPai.has(l.pai)) { ignoradas++; continue; }          // variação de um pai que já está na planilha
      if (paisOrfaosVistos.has(l.pai)) { ignoradas++; continue; }    // pai ausente: usa só a primeira variação
      paisOrfaosVistos.add(l.pai);
      // tira o sufixo " - Cor - Tamanho" do nome da variação
      const partes = l.desc.split(/\s+-\s+/);
      const nVar = (l.variacoes.match(/\|\|/g) || []).length || 0;
      const titulo = nVar > 0 && partes.length > nVar ? partes.slice(0, partes.length - nVar).join(" - ") : l.desc;
      modelos.push(montar(l, titulo.trim()));
      continue;
    }
    modelos.push(montar(l, l.desc));                                 // produto simples
  }
  return { modelos, ignoradas };
}

// ---------- escolha do modelo para um produto ----------
const IGNORAR = new Set(["de", "do", "da", "dos", "das", "e", "em", "com", "para", "a", "o", "original", "estampa", "estampado", "estampada", "best", "fit"]);

export function tokens(texto: string, marca = ""): string[] {
  const base = norm(texto).replace(/(\d)\s+(ml|l|g|kg|cm|mm)\b/g, "$1$2").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const marcas = new Set(norm(marca).replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
  return Array.from(new Set(base.filter((t) => t.length >= 2 && !IGNORAR.has(t) && !marcas.has(t))));
}
export const capacidade = (toks: string[]) => toks.filter((t) => /^\d+(ml|l)$/.test(t));

export interface PadraoBase {
  titulo?: string | null; marca?: string | null; categoria?: string | null;
  altura?: any; largura?: any; comprimento?: any; peso?: any; created_at?: string | null;
  [k: string]: any;
}

/**
 * Procura o modelo da Padronização que "é do mesmo produto" (mesmo tipo/modelo/capacidade) e mesma marca.
 * Devolve null se não houver nenhum parecido o suficiente — aí a exportação mantém as medidas genéricas.
 */
export function acharPadrao<T extends PadraoBase>(nome: string, marca: string, padroes: T[]): { padrao: T; score: number } | null {
  const tp = tokens(nome, marca);
  if (tp.length === 0) return null;
  let melhor: { padrao: T; score: number; mesmaMarca: boolean } | null = null;
  for (const p of padroes) {
    if (!p.titulo) continue;
    const mp = norm(p.marca), mm = norm(marca);
    if (mp && mm && !mp.includes(mm) && !mm.includes(mp)) continue;      // marcas diferentes
    const tm = tokens(String(p.titulo), String(p.marca || marca));
    if (tm.length === 0) continue;
    const capA = capacidade(tm), capB = capacidade(tp);
    if (capA.length && capB.length && !capA.some((c) => capB.includes(c))) continue;   // capacidade diferente (350ml x 500ml)
    const comuns = tm.filter((t) => tp.includes(t)).length;
    const score = comuns / tm.length;
    if (comuns < Math.min(2, tm.length) || score < 0.6) continue;
    const mesmaMarca = !!mp && !!mm;
    if (!melhor || score > melhor.score || (score === melhor.score && mesmaMarca && !melhor.mesmaMarca)
      || (score === melhor.score && String(p.created_at || "") > String(melhor.padrao.created_at || ""))) {
      melhor = { padrao: p, score, mesmaMarca };
    }
  }
  return melhor ? { padrao: melhor.padrao, score: melhor.score } : null;
}

export interface ModeloParecido<T> { padrao: T; comuns: number; proporcao: number }

/**
 * Modelos da Padronização que podem ser "o mesmo tipo de produto" do produto novo — mesma marca e mesmo tipo/linha,
 * mesmo que a estampa/cor seja outra (ex.: "Mini Cooler Farofa Lenço Magia" x "Mini Cooler Farofa Praia Bahia Thal").
 * Ordenados do mais parecido para o menos. Quem decide se serve de verdade é a IA (ou a regra de modeloParecido).
 */
export function rankearModelos<T extends PadraoBase>(nome: string, marca: string, padroes: T[]): ModeloParecido<T>[] {
  const tp = tokens(nome, marca);
  if (tp.length === 0) return [];
  const out: ModeloParecido<T>[] = [];
  for (const p of padroes) {
    if (!p.titulo) continue;
    const mp = norm(p.marca), mm = norm(marca);
    if (mp && mm && !mp.includes(mm) && !mm.includes(mp)) continue;
    const tm = tokens(String(p.titulo), String(p.marca || marca));
    if (tm.length === 0) continue;
    const capA = capacidade(tm), capB = capacidade(tp);
    if (capA.length && capB.length && !capA.some((c) => capB.includes(c))) continue;   // 350ml x 500ml: outro produto
    const comuns = tm.filter((t) => tp.includes(t)).length;
    const proporcao = comuns / Math.min(tm.length, tp.length);
    if (comuns < Math.min(2, tm.length) || proporcao < 0.4) continue;
    out.push({ padrao: p, comuns, proporcao });
  }
  return out.sort((a, b) => b.proporcao - a.proporcao || b.comuns - a.comuns || String(b.padrao.created_at || "").localeCompare(String(a.padrao.created_at || "")));
}

/** Melhor modelo "do mesmo tipo" quando a IA não está disponível (medidas, peso e categoria vêm dele). */
export function modeloParecido<T extends PadraoBase>(nome: string, marca: string, padroes: T[]): T | null {
  const r = rankearModelos(nome, marca, padroes)[0];
  return r && r.comuns >= 2 && (r.comuns >= 3 || r.proporcao >= 0.6) ? r.padrao : null;
}

/** true se os dois nomes têm exatamente as mesmas palavras (mesmo produto, mesma estampa). */
export function nomesEquivalentes(a: string, b: string, marca = ""): boolean {
  const ta = tokens(a, marca).sort().join("|"), tb = tokens(b, marca).sort().join("|");
  return ta !== "" && ta === tb;
}

export const MEDIDAS_GENERICAS = { altura: 20, largura: 20, comprimento: 20, peso: 0.5 };

/** Medidas finais de um produto: as dele, senão as do modelo da Padronização, senão as genéricas. */
export function medidasDoProduto(
  item: { altura?: any; largura?: any; comprimento?: any; peso?: any },
  padrao?: PadraoBase | null
): { altura: number; largura: number; comprimento: number; peso: number; origem: "produto" | "padrao" | "generica" } {
  const g = MEDIDAS_GENERICAS;
  const pick = (a: any, b: any, def: number) => numero(a) ?? numero(b) ?? def;
  const temProprio = [item.altura, item.largura, item.comprimento].some((v) => numero(v) !== null);
  const temPadrao = !!padrao && [padrao.altura, padrao.largura, padrao.comprimento].some((v) => numero(v) !== null);
  return {
    altura: pick(item.altura, padrao?.altura, g.altura),
    largura: pick(item.largura, padrao?.largura, g.largura),
    comprimento: pick(item.comprimento, padrao?.comprimento, g.comprimento),
    peso: pick(item.peso, padrao?.peso, g.peso),
    origem: temProprio ? "produto" : temPadrao ? "padrao" : "generica",
  };
}
