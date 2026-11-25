// Utilitários da exportação para o Tiny: limite e ajuste de título, slug e tradução dos erros da IA (Claude) em frases claras.
// (A comparação entre produto novo e modelo da Padronização fica em lib/comparacaoModelos.ts.) Sem rede aqui.

export const LIMITE_TITULO = 60;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const CONECTORES = new Set(["de", "do", "da", "dos", "das", "e", "em", "com", "para", "por", "a", "o", "na", "no"]);
const DISPENSAVEIS = ["original", "novo", "nova", "oficial", "exclusivo", "exclusiva"];

/**
 * Título com no máximo `max` caracteres, SEM cortar palavra ao meio nem terminar com informação pela metade:
 * se passar do limite, tira palavras inteiras menos importantes (ex.: "Original") e, por último, as do fim.
 */
export function ajustarTitulo(titulo: string, max = LIMITE_TITULO): string {
  let palavras = String(titulo ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const junta = () => palavras.join(" ");
  if (junta().length <= max) return junta();
  for (const d of DISPENSAVEIS) {
    const i = palavras.findIndex((w) => semAcento(w) === d);
    if (i >= 0) { palavras.splice(i, 1); if (junta().length <= max) return junta(); }
  }
  // protege a capacidade/medida do fim ("8 Litros", "350ml", "20 cm"): é informação, não enfeite
  const cauda: string[] = [];
  const m = junta().match(/\s(\d+(?:[.,]\d+)?\s*(?:litros?|l|ml|g|kg|cm|mm))$/i);
  if (m) { const n = m[1].split(" ").length; cauda.push(...palavras.splice(palavras.length - n, n)); }
  const total = () => (palavras.join(" ") + (cauda.length ? " " + cauda.join(" ") : "")).length;
  while (palavras.length > 1 && total() > max) palavras.pop();
  // não termina em conector nem em número solto ("... Thal 8")
  while (palavras.length > 1 && (CONECTORES.has(semAcento(palavras[palavras.length - 1])) || (!cauda.length && /^\d+([.,]\d+)?$/.test(palavras[palavras.length - 1])))) palavras.pop();
  palavras = [...palavras, ...cauda];
  return junta();
}

/** Slug no estilo do modelo ("Mini-Cooler-Farm-..." com maiúsculas e acentos) ou minúsculo sem acento, como o app já fazia. */
export function slugDoTitulo(titulo: string, slugModelo = ""): string {
  const base = String(titulo ?? "").replace(/\s+/g, " ").trim();
  if (/[A-ZÀ-Ú]/.test(String(slugModelo))) return base.replace(/[^A-Za-zÀ-ÿ0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return semAcento(base).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Traduz um erro da chamada à IA (Claude) em uma frase que o usuário entende e diz se vale tentar de novo. Nunca inclui a chave. */
export function analisarErroIA(e: any, nome = "Claude", variavel = "ANTHROPIC_API_KEY"): { motivo: string; transitorio: boolean; status: number } {
  const bruto = String(e?.message ?? e ?? "");
  let msg = bruto;
  try { const j = JSON.parse(bruto); msg = String(j?.error?.message ?? j?.message ?? bruto); } catch { /* texto simples */ }
  msg = msg.replace(/sk-[0-9A-Za-z_\-]{10,}/g, "***").replace(/\s+/g, " ").trim().slice(0, 160);
  const status = Number(e?.status ?? e?.code ?? (bruto.match(/\b(4\d\d|5\d\d)\b/)?.[1] ?? 0)) || 0;
  if (/sem resposta em/i.test(bruto)) return { motivo: `o ${nome} demorou demais (${msg})`, transitorio: true, status: 0 };
  if (status === 402 || /insufficient balance/i.test(bruto)) return { motivo: `o ${nome} está sem saldo (erro 402): ${msg}. Verifique o saldo/plano da conta`, transitorio: false, status: 402 };
  if (status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(bruto)) return { motivo: `limite/cota do ${nome} estourado (erro 429): ${msg}`, transitorio: true, status };
  if (status === 401 || status === 403 || /api key|permission|authentication/i.test(bruto)) return { motivo: `o ${nome} recusou a chave (erro ${status || 403}): ${msg}. Confira a ${variavel} no Vercel`, transitorio: false, status };
  if (status === 404) return { motivo: `o ${nome} não encontrou o modelo (erro 404): ${msg}. Informe o modelo certo em ${variavel.replace("API_KEY", "MODEL")} no Vercel`, transitorio: false, status };
  if (status === 400 || status === 422) return { motivo: `o ${nome} recusou o pedido (erro ${status}): ${msg}`, transitorio: false, status };
  if (status >= 500) return { motivo: `o ${nome} está indisponível (erro ${status}): ${msg}`, transitorio: true, status };
  return { motivo: `falha ao falar com o ${nome}: ${msg || "erro desconhecido"}`, transitorio: true, status };
}

export const MOTIVO_SEM_CHAVE = "a IA não está configurada: falta a variável ANTHROPIC_API_KEY no Vercel";

export function motivoRespostaInvalida(texto: any, nome = "Claude"): string {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  return t ? `o ${nome} respondeu fora do formato esperado: "${t.slice(0, 140)}${t.length > 140 ? "…" : ""}"` : `o ${nome} devolveu uma resposta vazia`;
}
