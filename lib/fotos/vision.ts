// Google Cloud Vision (WEB_DETECTION): recebe a foto e devolve as imagens/páginas iguais ou parecidas que existem na internet.
import { ErroValidacao } from "../concorrentes/tipos";

export type OrigemFoto = "igual" | "parcial" | "parecida";
export interface Candidato { url: string; origem: OrigemFoto; pagina?: string; titulo?: string }
export interface ResultadoVision { candidatos: Candidato[]; palpite: string; entidades: string[] }

const PESO: Record<OrigemFoto, number> = { igual: 0, parcial: 1, parecida: 2 };
const MAX_CANDIDATOS = 60;

/** Transforma a resposta do Vision numa lista sem repetição, da mais certa (igual) para a menos certa (parecida). */
export function extrairCandidatos(resposta: any): ResultadoVision {
  const w = resposta?.responses?.[0]?.webDetection || {};
  const mapa = new Map<string, Candidato>();
  const add = (url: any, origem: OrigemFoto, pagina?: string, titulo?: string) => {
    if (typeof url !== "string" || !/^https:\/\//i.test(url)) return;
    const atual = mapa.get(url);
    if (!atual) mapa.set(url, { url, origem, pagina, titulo });
    else {
      if (PESO[origem] < PESO[atual.origem]) atual.origem = origem;
      if (!atual.pagina && pagina) { atual.pagina = pagina; atual.titulo = titulo; }
    }
  };
  for (const i of w.fullMatchingImages || []) add(i?.url, "igual");
  for (const p of w.pagesWithMatchingImages || []) {
    const t = typeof p?.pageTitle === "string" ? p.pageTitle.replace(/<[^>]+>/g, "").trim() : undefined;
    for (const i of p?.fullMatchingImages || []) add(i?.url, "igual", p?.url, t);
    for (const i of p?.partialMatchingImages || []) add(i?.url, "parcial", p?.url, t);
  }
  for (const i of w.partialMatchingImages || []) add(i?.url, "parcial");
  for (const i of w.visuallySimilarImages || []) add(i?.url, "parecida");
  const candidatos = Array.from(mapa.values()).sort((a, b) => PESO[a.origem] - PESO[b.origem]).slice(0, MAX_CANDIDATOS);
  const palpite = String(w.bestGuessLabels?.[0]?.label || "").trim();
  const entidades = (w.webEntities || []).filter((e: any) => e?.description).slice(0, 6).map((e: any) => String(e.description));
  return { candidatos, palpite, entidades };
}

const URL_VISION = () => (!process.env.VERCEL && process.env.GOOGLE_VISION_URL) || "https://vision.googleapis.com/v1/images:annotate";

/** Uma chamada = 1 uso da cota gratuita (1.000/mês). A chave fica só no servidor. */
export async function buscarNoVision(base64: string, chave: string): Promise<ResultadoVision> {
  const r = await fetch(`${URL_VISION()}?key=${encodeURIComponent(chave)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: "WEB_DETECTION", maxResults: 60 }] }] }),
    signal: AbortSignal.timeout(25_000),
  });
  let j: any = null; try { j = await r.json(); } catch { /* corpo vazio */ }
  const erro = j?.error || j?.responses?.[0]?.error;
  if (!r.ok || erro) throw new ErroValidacao(mensagemDeErro(r.status, erro?.message, erro?.status));
  return extrairCandidatos(j);
}

export function mensagemDeErro(http: number, msg?: string, status?: string): string {
  const m = String(msg || "").slice(0, 300);
  if (/billing/i.test(m)) return `O Google recusou: o projeto precisa ter a cobrança ativada (a cota gratuita continua valendo). Detalhe: ${m}`;
  if (status === "PERMISSION_DENIED" || http === 403) return `O Google recusou a chave. Confira se a “Cloud Vision API” está ativada no projeto e se a chave não tem restrição que bloqueie essa API. Detalhe: ${m}`;
  if (http === 400 && /api key/i.test(m)) return "A chave do Google (GOOGLE_VISION_API_KEY) não é válida.";
  if (http === 429) return "O Google limitou as chamadas (cota). Tente de novo mais tarde.";
  return `Erro do Google Vision (${http}): ${m || "sem detalhe"}`;
}
