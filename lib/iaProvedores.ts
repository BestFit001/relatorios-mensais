// Camada de IA com reserva (somente servidor): tenta um provedor e, se ele falhar, demorar ou responder fora do formato,
// tenta o outro. Hoje: Gemini (GEMINI_API_KEY) e DeepSeek (DEEPSEEK_API_KEY). Basta ter UMA das chaves configuradas.
//
// Variáveis de ambiente (Vercel):
//   GEMINI_API_KEY / GOOGLE_API_KEY  chave do Gemini
//   DEEPSEEK_API_KEY                 chave do DeepSeek
//   IA_PRIMARIA                      "gemini" (padrão) ou "deepseek": quem é tentado primeiro
//   GEMINI_MODEL, DEEPSEEK_MODEL     trocam o modelo sem mexer no código (padrões abaixo)
//   DEEPSEEK_BASE_URL                só para testes (padrão https://api.deepseek.com)

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { analisarErroIA, motivoRespostaInvalida } from "./adaptarModelo";

export interface OpcoesGerar {
  json: boolean;
  /** tempo máximo desta chamada, em ms */
  limiteMs: number;
  imagem?: { base64: string; mimeType: string };
}

export interface ProvedorIA {
  id: "gemini" | "deepseek";
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

function criarDeepSeek(apiKey: string): ProvedorIA {
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const modelo = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  return {
    id: "deepseek", nome: "DeepSeek", variavel: "DEEPSEEK_API_KEY", aceitaImagem: false,
    async gerar(prompt, o) {
      const inicio = Date.now();
      let semRaciocinio = true;   // pedimos o modo sem "pensar" (mais rápido); se a API recusar o parâmetro, refaz sem ele
      for (;;) {
        const restante = Math.max(o.limiteMs - (Date.now() - inicio), 1000);
        const corpo: any = { model: modelo, messages: [{ role: "user", content: prompt }], stream: false, max_tokens: 4096, temperature: 0.3 };
        if (o.json) corpo.response_format = { type: "json_object" };
        if (semRaciocinio) corpo.thinking = { type: "disabled" };
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
          if (!res.ok) throw Object.assign(new Error(bruto || `HTTP ${res.status}`), { status: res.status });
          let j: any;
          try { j = JSON.parse(bruto); } catch { throw new Error("resposta que não é JSON: " + bruto.slice(0, 100)); }
          console.log(`IA DeepSeek: resposta em ${Date.now() - inicio} ms`);
          return String(j?.choices?.[0]?.message?.content ?? "");
        } catch (e: any) {
          if (e?.name === "AbortError") throw new Error(`IA sem resposta em ${Math.round(restante / 1000)}s`);
          if (semRaciocinio && analisarErroIA(e).status === 400) { semRaciocinio = false; continue; }
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
  const deepseek = process.env.DEEPSEEK_API_KEY;
  if (gemini) lista.push(criarGemini(gemini));
  if (deepseek) lista.push(criarDeepSeek(deepseek));
  if ((process.env.IA_PRIMARIA || "").toLowerCase() === "deepseek") lista.sort((a, b) => (a.id === "deepseek" ? -1 : b.id === "deepseek" ? 1 : 0));
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
      const texto = await p.gerar(prompt, { json: !!o.json, limiteMs, imagem: o.imagem });
      if (o.aceitar ? o.aceitar(texto) : texto.trim() !== "") return { texto, provedor: p.nome, falhas };
      falhas.push({ provedor: p.nome, motivo: motivoRespostaInvalida(texto, p.nome) });
      console.error(`IA ${p.nome}: resposta fora do formato:`, String(texto).slice(0, 300));
      // havendo outro provedor na fila, passa para ele (formato errado costuma se repetir); sozinho, tenta de novo
      if (fila.some((x) => x.p !== p)) fila = fila.filter((x) => x.p !== p);
    } catch (e) {
      const a = analisarErroIA(e, p.nome, p.variavel);
      falhas.push({ provedor: p.nome, motivo: a.motivo });
      console.error(`Erro na IA ${p.nome}:`, e);
      if (!a.transitorio) fila = fila.filter((x) => x.p !== p);
    }
  }
  return { texto: null, provedor: null, falhas };
}

/** Junta as falhas numa frase só: "o Gemini demorou demais (…) → o DeepSeek recusou a chave (…)". Repetições são colapsadas. */
export function resumirFalhas(falhas: FalhaIA[]): string {
  const vistos: string[] = [];
  for (const f of falhas) if (!vistos.includes(f.motivo)) vistos.push(f.motivo);
  return vistos.join(" → ");
}
