// Dados do modelo para a imagem de benefícios do Gerador de imagens: título em 2 linhas, capacidade e benefícios (título curto + descrição curta).
// Tudo sai do texto do modelo cadastrado na Padronização IA (título, descrição, descrição SEO); a IA só reorganiza o que já está escrito lá.

export interface BeneficioModelo { titulo: string; descricao: string }
export interface DadosImagemModelo { linha1: string; linha2: string; capacidade: string; beneficios: BeneficioModelo[] }

export const MAX_BENEFICIOS = 6;
const LIM = { linha1: 28, linha2: 34, capacidade: 20, titulo: 32, descricao: 96 };

/** Texto puro: sem **, ###, quebras de linha nem espaços repetidos. */
export function limparTextoCurto(v: any, max: number): string {
  const t = String(v ?? "").replace(/[*#`_>]+/g, "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, "").trim();
}

/** Primeiras palavras do título = tipo do produto; resto = nome do modelo. Usado só quando a IA não responde. */
export function dividirTitulo(titulo: string, marca = ""): { linha1: string; linha2: string } {
  const palavras = String(titulo || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const ruido = /^(original|estampad[oa]s?|oficial|novo|nova)$/i;
  const uteis = palavras.filter((p) => !ruido.test(p));
  if (uteis.length <= 2) return { linha1: limparTextoCurto(uteis.join(" "), LIM.linha1), linha2: limparTextoCurto(marca, LIM.linha2) };
  const n = /^(mini|mega|super)$/i.test(uteis[0]) || (uteis[1] && /^(de|da|do|para)$/i.test(uteis[1])) ? 2 : 1;
  return { linha1: limparTextoCurto(uteis.slice(0, n).join(" "), LIM.linha1), linha2: limparTextoCurto(uteis.slice(n).join(" "), LIM.linha2) };
}

export function pedidoBeneficios(m: { titulo: string; marca?: string; categoria?: string; descricao?: string; descricao_seo?: string }, quantidade: number): string {
  const q = Math.min(Math.max(Math.round(quantidade) || 4, 1), MAX_BENEFICIOS);
  return [
    "Você prepara o texto de uma imagem de benefícios de anúncio de e-commerce brasileiro (marketplace). Responda em português do Brasil.",
    `Produto: ${m.titulo}${m.marca ? ` (marca ${m.marca})` : ""}${m.categoria ? `. Categoria: ${m.categoria}` : ""}.`,
    "Use SOMENTE o que está escrito abaixo sobre o produto. Não invente material, medida, certificação nem função que o texto não diga.",
    "",
    "TEXTO DO MODELO:",
    String(m.descricao || "").slice(0, 3500),
    String(m.descricao_seo || "").slice(0, 600),
    "",
    "Devolva APENAS um JSON, sem markdown, neste formato:",
    `{"linha1":"tipo do produto, 1 a 3 palavras, ex.: Touca","linha2":"nome do modelo (e estampa), até 4 palavras, ex.: Flat Swim Cap","capacidade":"ex.: 8 Litros (vazio se o texto não disser)","beneficios":[{"titulo":"2 a 4 palavras, ex.: Altíssima elasticidade","descricao":"uma frase curta de até 70 caracteres"}]}`,
    `Faça exatamente ${q} benefícios, do mais importante para o menos. Texto puro, sem asteriscos, sem emoji, sem ponto final no título.`,
  ].join("\n");
}

/** Lê a resposta da IA (JSON, com ou sem cerca de markdown) e limpa. Devolve null se não der para aproveitar. */
export function lerDadosImagem(texto: string, quantidade = MAX_BENEFICIOS): DadosImagemModelo | null {
  const bruto = String(texto || "");
  const ini = bruto.indexOf("{"), fim = bruto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  let j: any; try { j = JSON.parse(bruto.slice(ini, fim + 1)); } catch { return null; }
  const lista = Array.isArray(j?.beneficios) ? j.beneficios : [];
  const beneficios = lista.map((b: any) => ({ titulo: limparTextoCurto(b?.titulo, LIM.titulo), descricao: limparTextoCurto(b?.descricao, LIM.descricao) }))
    .filter((b: BeneficioModelo) => b.titulo).slice(0, Math.min(Math.max(quantidade, 1), MAX_BENEFICIOS));
  if (!beneficios.length) return null;
  return { linha1: limparTextoCurto(j?.linha1, LIM.linha1), linha2: limparTextoCurto(j?.linha2, LIM.linha2), capacidade: limparTextoCurto(j?.capacidade, LIM.capacidade), beneficios };
}

/** Benefícios que vêm do banco (jsonb) -> lista segura. */
export function normalizarBeneficios(v: any): BeneficioModelo[] {
  return (Array.isArray(v) ? v : []).map((b: any) => ({ titulo: limparTextoCurto(b?.titulo, LIM.titulo), descricao: limparTextoCurto(b?.descricao, LIM.descricao) })).filter((b) => b.titulo).slice(0, MAX_BENEFICIOS);
}
