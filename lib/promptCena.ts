// Prompt da "Cena (IA)": uma pessoa usando o produto. O texto tem campos {{...}} que o app preenche com os dados do modelo escolhido
// (Padronização IA): título, categoria, descrição, benefícios e medidas. Quem decide COMO o produto é usado é o gerador de imagem, a partir da
// foto de referência e desses dados. O texto fixo não cita a marca (o gerador tende a inventar logo ou texto); o título do produto pode citar, e por isso o prompt manda evitar qualquer texto ou logo na imagem.

export const PROMPT_CENA_PESSOA = `Create a photorealistic lifestyle photograph of one person using the product shown in the reference image(s). The product is the hero of the photo.

Product: {{titulo}}. Category: {{categoria}}. Details: {{descricao_resumida}}. Key benefits: {{beneficios}}. Real size: {{altura}} x {{largura}} x {{comprimento}} cm.

Work out how this product is naturally used (carried, worn, held or opened) from the reference image and the product information above, and show exactly that natural use. Choose the pose, the moment and the setting that best demonstrate the product's main benefits.

Product fidelity is the top priority: the product must look identical to the reference image, with the same print, colors, shape, proportions, straps, zippers, pockets, hardware and trims. Do not redesign, recolor, simplify or invent details. Keep it fully visible and sharp, not hidden by hands, hair or clothing, and at a realistic scale for the stated dimensions.

Person: a natural, relaxed, smiling adult, aged 25 to 40, in a simple summery outfit in neutral or soft tones so the print stands out. Natural anatomy, correct hands with five fingers, real skin texture.

Scene and mood: sunny Brazilian tropical lifestyle, vibrant, joyful, fresh and carefree. Pick a real everyday-leisure location that fits how the product is used. The background must be uncluttered and must not compete with the print.

Light and camera: warm natural daylight with soft shadows, shallow depth of field with the product in sharp focus, eye-level framing, 85mm look, medium shot showing the product and the person. Square 1:1 composition with breathing room around the subject.

Avoid: any text, letters, logos, watermarks, labels or price tags; extra products; duplicated or distorted product; extra fingers or deformed hands; plastic-looking skin; collage; borders; heavy filters.`;

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
