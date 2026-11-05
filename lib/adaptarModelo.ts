// Exportação para o Tiny: a IA lê o modelo da aba Padronização, entende o que é igual ao produto novo (tipo, linha,
// capacidade, materiais, medidas, cuidados) e o que muda (estampa/cor) e devolve título, descrição complementar,
// descrição SEO e palavras-chave já adaptados. Este arquivo só monta o pedido e confere a resposta (sem rede).

import { limparDescricao, REGRAS_FORMATO_DESCRICAO } from "./textoDescricao";

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

export interface ModeloParaIA {
  titulo: string; marca?: string | null; categoria?: string | null; slug?: string | null;
  altura?: any; largura?: any; comprimento?: any; peso?: any;
  descricao_seo?: string | null; palavras_chave_seo?: string | null; descricao_complementar?: string | null;
}

const linha = (rotulo: string, v: any) => (v === null || v === undefined || String(v).trim() === "" ? "" : `${rotulo}: ${String(v).trim()}\n`);

export function montarPedidoAdaptacao(
  produto: { nome: string; marca: string; cores: string[] },
  modelos: ModeloParaIA[]
): string {
  const blocos = modelos.map((m, i) =>
    `=== MODELO ${i + 1} ===\n` +
    linha("Título do modelo", m.titulo) + linha("Marca", m.marca) + linha("Categoria", m.categoria) +
    linha("Medidas (alt x larg x comp, cm) e peso (kg)", [m.altura, m.largura, m.comprimento].some((x) => x) ? `${m.altura || 0} x ${m.largura || 0} x ${m.comprimento || 0}; ${m.peso || "?"}` : "") +
    linha("Slug do modelo", m.slug) + linha("Descrição SEO do modelo", m.descricao_seo) + linha("Palavras-chave do modelo", m.palavras_chave_seo) +
    `Descrição complementar do modelo:\n${limparDescricao(m.descricao_complementar)}\n`
  ).join("\n");

  return `Você é analista sênior de e-commerce da Best Fit e vai preparar o cadastro de um PRODUTO NOVO a partir dos MODELOS OFICIAIS já homologados na aba Padronização.

PRODUTO NOVO
- Nome: ${produto.nome}
- Marca: ${produto.marca}
${produto.cores.length ? `- Cor(es) das variações: ${produto.cores.join(", ")}\n` : ""}
${blocos}

COMO TRABALHAR
1. Decida qual modelo é do MESMO tipo de produto e da mesma linha do produto novo (ex.: o mesmo "Mini Cooler Farofa", mudando só o nome da estampa ou a cor). Responda o número dele em "modelo". Se NENHUM for o mesmo tipo de produto, responda 0 e escreva tudo do zero, sem copiar nada de modelo.
2. Compare o título do modelo com o nome do produto novo e separe o que é IGUAL (tipo de produto, linha, marca, capacidade, material, forro, alças, fechamento, medidas, composição, cuidados) do que MUDA (nome da estampa, cor, detalhes visuais).
3. Escreva o conteúdo do produto novo REAPROVEITANDO o que é igual no modelo (especificações técnicas, composição, cuidados, medidas, capacidade — mantenha exatamente como está no modelo) e SUBSTITUINDO ou REMOVENDO tudo que é específico do modelo: o nome da estampa, cores, descrições visuais (desenhos, fundo, tom) e qualquer benefício que dependa da estampa ou da cor do modelo. Troque o nome da estampa antiga pelo nome da estampa do produto novo.
4. NÃO invente cor, desenho nem característica visual do produto novo: use só o nome da estampa que aparece no nome dele (e, se ajudar, as cores informadas). NÃO invente medidas, capacidade, material nem outros dados técnicos além dos do modelo. Quando uma frase só fizer sentido com a estampa do modelo, reescreva de forma neutra ou apague.
5. Mantenha o tom, a estrutura e o nível de detalhe do modelo.

CAMPOS DA RESPOSTA
- "titulo": o mesmo padrão do título do modelo, trocando só a estampa/cor (ex.: "Mini Cooler Farm Farofa Lenço Magia Original 8 Litros" para o produto "Mini Cooler Farm Farofa Praia Bahia Thal" vira "Mini Cooler Farm Farofa Praia Bahia Thal Original 8 Litros"). No máximo ${LIMITE_TITULO} caracteres contando os espaços. NUNCA corte uma palavra ao meio nem termine com informação pela metade: se passar do limite, tire palavras inteiras menos importantes (como "Original").
- "descricao_complementar": ${"a descrição completa do produto novo, em texto puro. Dentro do JSON use \\n para quebra de linha."}
- "descricao_seo": no mesmo estilo e tamanho da descrição SEO do modelo, trocando a estampa; até 160 caracteres, sem cortar palavras.
- "palavras_chave": no mesmo estilo das palavras-chave do modelo, trocando a estampa; separadas por vírgula, sem repetir.

${REGRAS_FORMATO_DESCRICAO}

Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem crases:
{"modelo": 1, "titulo": "...", "descricao_complementar": "...", "descricao_seo": "...", "palavras_chave": "..."}`;
}

export interface RespostaAdaptacao {
  modelo: number;            // 0 = nenhum modelo serviu; 1..n = índice (1-based) do modelo escolhido
  titulo: string;
  descricao_complementar: string;
  descricao_seo: string;
  palavras_chave: string;
}

/** Lê o JSON da IA (aceita cercas ```json e texto em volta). Devolve null se não der para aproveitar. */
export function lerRespostaAdaptacao(texto: any, totalModelos: number): RespostaAdaptacao | null {
  let s = String(texto ?? "").trim();
  if (!s) return null;
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const ini = s.indexOf("{"), fim = s.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  let o: any;
  try { o = JSON.parse(s.slice(ini, fim + 1)); } catch { return null; }
  const str = (v: any) => (typeof v === "string" ? v.trim() : "");
  const descricao = limparDescricao(str(o.descricao_complementar));
  if (descricao.length < 80) return null;     // resposta vazia ou cortada
  let modelo = Number(o.modelo);
  if (!Number.isInteger(modelo) || modelo < 0 || modelo > totalModelos) modelo = 0;
  return {
    modelo,
    titulo: str(o.titulo).replace(/\s+/g, " "),
    descricao_complementar: descricao,
    descricao_seo: str(o.descricao_seo).replace(/\s+/g, " "),
    palavras_chave: str(o.palavras_chave).replace(/\s*,\s*/g, ",").replace(/^,+|,+$/g, ""),
  };
}

/** Traduz um erro da chamada à IA (Gemini ou Groq) em uma frase que o usuário entende e diz se vale tentar de novo. Nunca inclui a chave. */
export function analisarErroIA(e: any, nome = "Gemini", variavel = "GEMINI_API_KEY"): { motivo: string; transitorio: boolean; status: number } {
  const bruto = String(e?.message ?? e ?? "");
  let msg = bruto;
  try { const j = JSON.parse(bruto); msg = String(j?.error?.message ?? j?.message ?? bruto); } catch { /* texto simples */ }
  msg = msg.replace(/AIza[0-9A-Za-z_\-]{20,}/g, "***").replace(/(?:sk|gsk)[-_][0-9A-Za-z_\-]{16,}/g, "***").replace(/\s+/g, " ").trim().slice(0, 160);
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

export const MOTIVO_SEM_CHAVE = "nenhuma IA está configurada no Vercel (faltam GEMINI_API_KEY e GROQ_API_KEY)";

export function motivoRespostaInvalida(texto: any, nome = "Gemini"): string {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  return t ? `o ${nome} respondeu fora do formato esperado: "${t.slice(0, 140)}${t.length > 140 ? "…" : ""}"` : `o ${nome} devolveu uma resposta vazia`;
}
