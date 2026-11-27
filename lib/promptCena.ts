// Prompt da "Cena (IA)": uma pessoa usando o produto. O texto tem campos {{...}} que o app preenche com os dados do modelo escolhido
// (Padronização IA): título, categoria, descrição, benefícios e medidas. Quem decide COMO o produto é usado é o gerador de imagem, a partir da
// foto de referência e desses dados. O texto fixo não cita a marca (o gerador tende a inventar logo ou texto); o título do produto pode citar, e por isso o prompt manda evitar qualquer texto ou logo na imagem.

export const PROMPT_CENA_PESSOA = `Create a photorealistic lifestyle photograph of one person using the product shown in the reference images. The reference images show the same real product from different angles and in close-up. The product is the hero of the photo.

Product: {{titulo}}. Category: {{categoria}}. Details: {{descricao_resumida}}. Key benefits: {{beneficios}}. Real size: {{altura}} x {{largura}} x {{comprimento}} cm.

Work out how this product is naturally used (carried, worn, held or opened) from the reference images and the product information above, and show exactly that natural use. Choose the pose, the moment and the setting that best demonstrate the product's main benefits.

Product fidelity is the top priority. The product must be an exact copy of the real product in the reference images: same shape, proportions, colors and materials. Reproduce the print exactly, with the same motifs, the same placement and the same colors, with nothing repainted, blurred, merged, simplified or missing. Reproduce every functional detail exactly: straps and handles (width, padding, shoulder pad, mesh, stitching, adjusters, buckles, sliders and attachment points), zippers and zipper pulls, pockets, piping, labels and hardware. Do not redesign, recolor, simplify or invent anything.

Framing: the product must be large, sharp and fully visible, with its straps, handles and hardware clearly readable and not hidden by hands, hair or clothing. Keep a realistic scale for the stated dimensions.

Person: a natural, relaxed adult, aged 25 to 40, in a simple outfit in neutral or soft tones so the print stands out. Candid, unposed moment, not a staged ad. Natural anatomy, correct hands with five fingers.

Scene: a real everyday-leisure location that fits how the product is used, with a sunny, fresh, Brazilian summer feel. Uncluttered background that does not compete with the print.

Realism: it must look like an unretouched photograph taken with a real camera and a prime lens. Natural skin with visible pores, small imperfections and flyaway hairs, true-to-life colors, soft natural daylight, slight natural film grain, realistic depth of field, natural fabric wrinkles and shadows. No HDR look, no airbrushed or glossy skin, no over-sharpening, no glow, no cinematic color grading, no illustration or 3D render look. Square 1:1 composition.`;

export interface DadosPrompt {
  titulo?: string | null; categoria?: string | null; descricao?: string | null;
  beneficios?: { titulo?: string; descricao?: string }[] | null;
  altura?: number | string | null; largura?: number | string | null; comprimento?: number | string | null;
}

const limpo = (s: any) => String(s ?? "").replace(/\s+/g, " ").trim();
const semPonto = (s: string) => s.replace(/[\s.;:,]+$/, "");
const cortar = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

/** Primeiro trecho da descrição (antes de "Especificações:" ou "Benefícios:"), em uma linha só e sem passar de 500 caracteres. */
export function resumirDescricao(desc: string | null | undefined): string {
  const t = String(desc ?? "").replace(/\r/g, "");
  const corte = t.search(/\n\s*(Especifica[çc][õo]es|Benef[íi]cios|Composi[çc][ãa]o|Cuidados)\s*:/i);
  return semPonto(cortar(limpo(corte >= 0 ? t.slice(0, corte) : t), 500));
}

/** Benefícios escritos na própria descrição ("Benefícios:" com linhas "- Nome: texto"), para quando o modelo ainda não tem benefícios salvos. */
export function beneficiosDaDescricao(desc: string | null | undefined): string[] {
  const t = String(desc ?? "").replace(/\r/g, "");
  const m = t.match(/Benef[íi]cios\s*:\s*\n([\s\S]*?)(?:\n\s*\n|\n\s*(?:Composi[çc][ãa]o|Cuidados|Especifica[çc][õo]es)\s*:|$)/i);
  if (!m) return [];
  return m[1].split("\n").map((l) => semPonto(limpo(l.replace(/^\s*[-•*]\s*/, "")))).filter(Boolean);
}

export function textoBeneficios(d: DadosPrompt): string {
  const salvos = (d.beneficios || []).map((b) => semPonto(limpo([b.titulo, b.descricao].filter(Boolean).join(": ")))).filter(Boolean);
  const lista = salvos.length ? salvos : beneficiosDaDescricao(d.descricao);
  return semPonto(cortar(lista.join("; "), 700));
}

const SEM_DADO = "(not provided)";
const num = (v: any) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? String(Math.round(n * 10) / 10) : ""; };

/** Troca os campos {{...}} pelos dados do produto. Campo sem dado vira "(not provided)"; campo desconhecido é removido. */
export function preencherPrompt(texto: string, d: DadosPrompt): string {
  const v: Record<string, string> = {
    titulo: limpo(d.titulo), categoria: limpo(d.categoria).replace(/\s*>\s*/g, " / "), descricao_resumida: resumirDescricao(d.descricao), beneficios: textoBeneficios(d),
    altura: num(d.altura), largura: num(d.largura), comprimento: num(d.comprimento),
  };
  return String(texto || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => (k.toLowerCase() in v ? v[k.toLowerCase()] || SEM_DADO : "")).replace(/[ \t]{2,}/g, " ").trim();
}

/** Prompt negativo padrão da Cena (IA): uma regra por linha. A API de imagem do Canva não tem campo de prompt negativo, então o app junta isto ao pedido como regras obrigatórias. */
export const PROMPT_NEGATIVO_CENA = `Missing, blank, blurred, moved or altered brand label, patch, logo or text that exists on the product (it must appear exactly as in the reference images)
Missing or simplified straps, shoulder pad, mesh, buckles, sliders, zippers or zipper pulls
Changed, repainted, blurred, merged or missing parts of the print
Changed product colors, proportions or shape
Any text, letters, logos, watermarks or price tags added to the scene or to the clothes
Extra products or accessories, duplicated or distorted product
Extra fingers, deformed hands, plastic-looking skin
Collage, borders, heavy filters, illustration or 3D render look`;

/** Texto final enviado ao gerador: o prompt com os dados do produto + as proibições (uma por linha vira um item). */
export function montarPromptCena(positivo: string, negativo: string | null | undefined, d: DadosPrompt): string {
  const base = preencherPrompt(positivo, d);
  const itens = preencherPrompt(String(negativo || ""), d).split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
  if (!itens.length) return base;
  return `${base}\n\nMust NOT happen (hard requirements, never break these):\n${itens.map((x) => "- " + x).join("\n")}`;
}
