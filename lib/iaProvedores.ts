// Camada de IA com reserva (somente servidor): tenta um provedor e, se ele falhar, demorar ou responder fora do formato,
// tenta o outro. Hoje: Gemini (GEMINI_API_KEY) e Groq (GROQ_API_KEY). Basta ter UMA das chaves configuradas.
//
// Variáveis de ambiente (Vercel):
//   GEMINI_API_KEY / GOOGLE_API_KEY  chave do Gemini
//   GROQ_API_KEY                     chave do Groq
//   IA_PRIMARIA                      "gemini" (padrão) ou "groq": quem é tentado primeiro
//   GEMINI_MODEL, GROQ_MODEL         trocam o modelo sem mexer no código (padrões abaixo)
//   GROQ_BASE_URL                    só para testes (padrão https://api.groq.com/openai/v1)

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { analisarErroIA, motivoRespostaInvalida } from "./adaptarModelo";

export interface OpcoesGerar {
  json: boolean;
  /** tempo máximo desta chamada, em ms */
  limiteMs: number;
  /** teto de tokens da resposta (só o Groq usa: ele conta esse valor contra o limite por minuto) */
  maxTokens?: number;
  imagem?: { base64: string; mimeType: string };
}

export interface ProvedorIA {
  id: "gemini" | "groq";
  nome: string;
  variavel: string;
  aceitaImagem: boolean;
  gerar(prompt: string, o: OpcoesGerar): Promise<string>;
}

export interface FalhaIA { provedor: string; motivo: string }
export interface ResultadoIA {
  texto: string | null;
  /** nome do provedor que respondeu (null = nenhum) */
  provedor: string | null;
  /** falhas anteriores à resposta (ou todas, se nenhum respondeu) */
  falhas: FalhaIA[];
}

function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`IA sem resposta em ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function criarGemini(apiKey: string): ProvedorIA {
  const ai = new GoogleGenAI({ apiKey });
  const modelo = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  return {
    id: "gemini", nome: "Gemini", variavel: "GEMINI_API_KEY", aceitaImagem: true,
    async gerar(prompt, o) {
      const inicio = Date.now();
      let raciocinioBaixo = true;
      for (;;) {
        const restante = o.limiteMs - (Date.now() - inicio);
        const config: any = {};
        if (o.json) config.responseMimeType = "application/json";
        if (raciocinioBaixo) config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        const contents: any[] = [];
        if (o.imagem) contents.push({ inlineData: { data: o.imagem.base64, mimeType: o.imagem.mimeType || "image/jpeg" } });
        contents.push(prompt);
        try {
          const r: any = await comTimeout(ai.models.generateContent({ model: modelo, contents, config }), Math.max(restante, 1000));
          console.log(`IA Gemini: resposta em ${Date.now() - inicio} ms (raciocínio ${raciocinioBaixo ? "baixo" : "padrão"})`);
          return String(r?.text ?? "");
        } catch (e) {
          // se o Gemini recusar o parâmetro de raciocínio (400), refaz sem ele
          if (raciocinioBaixo && analisarErroIA(e).status === 400) { raciocinioBaixo = false; continue; }
          throw e;
        }
      }
    },
  };
}

/** Espera (ms) que o Groq pede num erro 429 (cabeçalho retry-after, em segundos); 0 se não informou. */
function esperaPedida(res: Response): number {
  const v = Number(res.headers.get("retry-after"));
  return Number.isFinite(v) && v > 0 ? Math.ceil(v * 1000) : 0;
}

/**
 * Groq (API compatível com a da OpenAI). O plano grátis limita tokens por MINUTO por modelo; quando estoura, o Groq responde
 * 429 com "retry-after". Se a espera cabe no tempo desta chamada, espera e tenta de novo uma vez aqui dentro.
 */
// O Groq troca de modelos com frequência (o llama-3.3-70b-versatile saiu do ar em 16/08/2026). Se o modelo não existir mais,
// o app tenta o próximo da lista sozinho. GROQ_MODEL (Vercel) entra na frente da lista.
const MODELOS_GROQ_PADRAO = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
let groqModeloVivo = 0;   // índice do último modelo que funcionou nesta instância do servidor

const modeloSumiu = (status: number, bruto: string) =>
  status === 404 || (status === 400 && /model_decommissioned|model_not_found|does not exist|decommissioned/i.test(bruto));

function criarGroq(apiKey: string): ProvedorIA {
  const base = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const modelos = Array.from(new Set([process.env.GROQ_MODEL, ...MODELOS_GROQ_PADRAO].filter(Boolean) as string[]));
  return {
    id: "groq", nome: "Groq", variavel: "GROQ_API_KEY", aceitaImagem: false,
    async gerar(prompt, o) {
      const inicio = Date.now();
      let jaEsperou = false;
      let semExtras = false;   // true depois que o Groq recusou response_format/reasoning_effort (400)
      let idx = Math.min(groqModeloVivo, modelos.length - 1);
      for (;;) {
        const modelo = modelos[idx];
        const raciocina = /^openai\/gpt-oss/.test(modelo);   // modelos "que pensam": raciocínio baixo para responder rápido
        const restante = Math.max(o.limiteMs - (Date.now() - inicio), 1000);
        // max_tokens baixo de propósito: o Groq conta o máximo pedido contra o limite por minuto
        const corpo: any = { model: modelo, messages: [{ role: "user", content: prompt }], stream: false, max_tokens: o.maxTokens ?? (raciocina ? 2800 : 2200), temperature: 0.3 };
        if (o.json && !semExtras) corpo.response_format = { type: "json_object" };
        if (raciocina && !semExtras) corpo.reasoning_effort = "low";
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), restante);
        try {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(corpo),
            signal: ctrl.signal,
          });
          const bruto = await res.text();
          if (res.status === 429 && !jaEsperou) {
            const espera = esperaPedida(res);
            const sobra = o.limiteMs - (Date.now() - inicio);
            if (espera > 0 && espera <= 25000 && espera + 4000 < sobra) {
              jaEsperou = true;
              console.log(`IA Groq: limite por minuto, esperando ${espera} ms e tentando de novo`);
              clearTimeout(timer);
              await new Promise((r) => setTimeout(r, espera));
              continue;
            }
          }
          // modelo descontinuado/inexistente: passa para o próximo da lista
          if (!res.ok && modeloSumiu(res.status, bruto) && idx < modelos.length - 1) {
            console.error(`IA Groq: modelo ${modelo} indisponível (${res.status}); tentando ${modelos[idx + 1]}`);
            idx++; groqModeloVivo = idx;
            clearTimeout(timer);
            continue;
          }
          // o Groq recusou algum parâmetro opcional (response_format / reasoning_effort): refaz sem eles
          if (res.status === 400 && !semExtras && (o.json || raciocina)) {
            semExtras = true;
            clearTimeout(timer);
            continue;
          }
          // limite por minuto com espera longa: repetir logo em seguida não adianta
          if (!res.ok) throw Object.assign(new Error(bruto || `HTTP ${res.status}`), { status: res.status, naoRepetir: res.status === 429 && esperaPedida(res) > 25000 });
          let j: any;
          try { j = JSON.parse(bruto); } catch { throw new Error("resposta que não é JSON: " + bruto.slice(0, 100)); }
          groqModeloVivo = idx;
          console.log(`IA Groq (${modelo}): resposta em ${Date.now() - inicio} ms`);
          return String(j?.choices?.[0]?.message?.content ?? "");
        } catch (e: any) {
          if (e?.name === "AbortError") throw new Error(`IA sem resposta em ${Math.round(restante / 1000)}s`);
          throw e;
        } finally {
          clearTimeout(timer);
        }
      }
    },
  };
}

/** Provedores com chave configurada, na ordem em que serão tentados (IA_PRIMARIA decide quem vai primeiro). */
export function provedoresConfigurados(): ProvedorIA[] {
  const lista: ProvedorIA[] = [];
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const groq = process.env.GROQ_API_KEY;
  if (gemini) lista.push(criarGemini(gemini));
  if (groq) lista.push(criarGroq(groq));
  if ((process.env.IA_PRIMARIA || "").toLowerCase() === "groq") lista.sort((a, b) => (a.id === "groq" ? -1 : b.id === "groq" ? 1 : 0));
  return lista;
}

/**
 * Pede o texto à IA. Tenta os provedores em ordem dentro de um prazo único (`prazoFinal`, epoch em ms): cada tentativa
 * recebe uma fatia do tempo que sobra. Uma resposta só vale se `aceitar` disser que sim (ex.: JSON no formato esperado);
 * senão conta como falha e o próximo provedor é tentado. Erros definitivos (chave errada, sem saldo, modelo inexistente)
 * não são repetidos no mesmo provedor.
 */
export async function gerarTexto(
  provedores: ProvedorIA[],
  prompt: string,
  o: {
    json?: boolean;
    maxTokens?: number;
    prazoFinal: number;
    imagem?: { base64: string; mimeType: string };
    aceitar?: (texto: string) => boolean;
  }
): Promise<ResultadoIA> {
  const falhas: FalhaIA[] = [];
  const aptos = provedores.filter((p) => !o.imagem || p.aceitaImagem);
  if (aptos.length === 0) return { texto: null, provedor: null, falhas };

  // 1 provedor: duas tentativas (3:2). 2 provedores: uma cada + 1 repetição do último (2:2:1).
  let fila: { p: ProvedorIA; peso: number }[] = aptos.length === 1
    ? [{ p: aptos[0], peso: 3 }, { p: aptos[0], peso: 2 }]
    : [{ p: aptos[0], peso: 2 }, { p: aptos[1], peso: 2 }, { p: aptos[1], peso: 1 }];

  while (fila.length) {
    const { p, peso } = fila[0];
    const restante = o.prazoFinal - Date.now();
    if (restante < 4000) { falhas.push({ provedor: p.nome, motivo: "acabou o tempo da exportação antes de tentar" }); break; }
    const limiteMs = Math.floor((restante * peso) / fila.reduce((s, x) => s + x.peso, 0));
    fila = fila.slice(1);
    try {
      const texto = await p.gerar(prompt, { json: !!o.json, limiteMs, imagem: o.imagem, maxTokens: o.maxTokens });
      if (o.aceitar ? o.aceitar(texto) : texto.trim() !== "") return { texto, provedor: p.nome, falhas };
      falhas.push({ provedor: p.nome, motivo: motivoRespostaInvalida(texto, p.nome) });
      console.error(`IA ${p.nome}: resposta fora do formato:`, String(texto).slice(0, 300));
      // havendo outro provedor na fila, passa para ele (formato errado costuma se repetir); sozinho, tenta de novo
      if (fila.some((x) => x.p !== p)) fila = fila.filter((x) => x.p !== p);
    } catch (e) {
      const a = analisarErroIA(e, p.nome, p.variavel);
      falhas.push({ provedor: p.nome, motivo: a.motivo });
      console.error(`Erro na IA ${p.nome}:`, e);
      if (!a.transitorio || (e as any)?.naoRepetir) fila = fila.filter((x) => x.p !== p);
    }
  }
  return { texto: null, provedor: null, falhas };
}

/** Junta as falhas numa frase só: "o Gemini demorou demais (…) → o Groq recusou a chave (…)". Repetições são colapsadas. */
export function resumirFalhas(falhas: FalhaIA[]): string {
  const vistos: string[] = [];
  for (const f of falhas) if (!vistos.includes(f.motivo)) vistos.push(f.motivo);
  return vistos.join(" → ");
}
