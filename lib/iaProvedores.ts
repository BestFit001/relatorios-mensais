// Camada de IA (somente servidor): hoje só o Claude (API de mensagens da Anthropic).
//
// A chave NUNCA fica no código nem no repositório: ela é lida de process.env.ANTHROPIC_API_KEY, que é configurada
// no painel do Vercel (Project > Settings > Environment Variables) e só existe no servidor. Nada daqui vai para o navegador.
//
// Variáveis de ambiente (Vercel):
//   ANTHROPIC_API_KEY    chave da API do Claude (console.anthropic.com)
//   ANTHROPIC_WORKSPACE_ID  opcional: ID do workspace (wrkspc_...), exigido pela Anthropic quando a chave não é amarrada a um workspace
//   ANTHROPIC_MODEL      opcional: troca o modelo sem mexer no código (padrão: claude-haiku-5-5, o mais barato)
//   ANTHROPIC_BASE_URL   só para testes (aponta para um servidor falso)

import { analisarErroIA, motivoRespostaInvalida } from "./adaptarModelo";

/** Modelo padrão: o mais simples e barato. Para mais capricho, ANTHROPIC_MODEL=claude-sonnet-5-5 no Vercel. */
export const MODELO_PADRAO = "claude-haiku-5-5";
/** Teto de tokens da resposta quando quem chama não pede outro (a descrição de um produto cabe em ~900). */
const MAX_TOKENS_PADRAO = 1200;

export interface OpcoesGerar {
  json: boolean;
  /** tempo máximo desta chamada, em ms */
  limiteMs: number;
  /** teto de tokens da resposta */
  maxTokens?: number;
  imagem?: { base64: string; mimeType: string };
}

export interface ProvedorIA {
  id: "claude";
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

/**
 * Claude via fetch (sem SDK). Lê imagem e segue instrução de formato; para JSON pede "somente JSON" no system prompt
 * (os leitores de resposta do app já toleram cerca ```json e texto em volta).
 */
function criarClaude(apiKey: string): ProvedorIA {
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
  const modelo = process.env.ANTHROPIC_MODEL || MODELO_PADRAO;
  const workspace = (process.env.ANTHROPIC_WORKSPACE_ID || "").trim();
  return {
    id: "claude", nome: "Claude", variavel: "ANTHROPIC_API_KEY", aceitaImagem: true,
    async gerar(prompt, o) {
      const inicio = Date.now();
      const restante = Math.max(o.limiteMs, 1000);
      const conteudo: any[] = [];
      if (o.imagem) conteudo.push({ type: "image", source: { type: "base64", media_type: o.imagem.mimeType || "image/jpeg", data: o.imagem.base64 } });
      conteudo.push({ type: "text", text: prompt });
      const corpo: any = { model: modelo, max_tokens: o.maxTokens ?? MAX_TOKENS_PADRAO, messages: [{ role: "user", content: conteudo }] };
      if (o.json) corpo.system = "Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem cercas de código.";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), restante);
      try {
        const res = await fetch(`${base}/v1/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", ...(workspace ? { "anthropic-workspace-id": workspace } : {}) },
          body: JSON.stringify(corpo),
          signal: ctrl.signal,
        });
        const bruto = await res.text();
        if (!res.ok) throw Object.assign(new Error(bruto || `HTTP ${res.status}`), { status: res.status });
        let j: any;
        try { j = JSON.parse(bruto); } catch { throw new Error("resposta que não é JSON: " + bruto.slice(0, 100)); }
        const uso = j?.usage ? ` (${j.usage.input_tokens ?? "?"} tokens de entrada, ${j.usage.output_tokens ?? "?"} de saída)` : "";
        console.log(`IA Claude (${modelo}): resposta em ${Date.now() - inicio} ms${uso}`);
        return (Array.isArray(j?.content) ? j.content : []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("");
      } catch (e: any) {
        if (e?.name === "AbortError") throw new Error(`IA sem resposta em ${Math.round(restante / 1000)}s`);
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Provedores com chave configurada (lista vazia = sem IA: o app usa os textos padrão). */
export function provedoresConfigurados(): ProvedorIA[] {
  const chave = (process.env.ANTHROPIC_API_KEY || "").trim();
  return chave ? [criarClaude(chave)] : [];
}

/**
 * Pede o texto à IA dentro de um prazo único (`prazoFinal`, epoch em ms): até 2 tentativas, a segunda só se a primeira
 * der erro passageiro (tempo esgotado, limite por minuto, instabilidade) ou vier fora do formato. Uma resposta só vale se
 * `aceitar` disser que sim (ex.: JSON no formato esperado). Erros definitivos (chave errada, sem saldo, modelo
 * inexistente) não são repetidos.
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
  const p = provedores.find((x) => !o.imagem || x.aceitaImagem);
  if (!p) return { texto: null, provedor: null, falhas };

  let pesos = [3, 2];
  while (pesos.length) {
    const restante = o.prazoFinal - Date.now();
    if (restante < 4000) { falhas.push({ provedor: p.nome, motivo: "acabou o tempo da exportação antes de tentar" }); break; }
    const limiteMs = Math.floor((restante * pesos[0]) / pesos.reduce((s, x) => s + x, 0));
    pesos = pesos.slice(1);
    try {
      const texto = await p.gerar(prompt, { json: !!o.json, limiteMs, imagem: o.imagem, maxTokens: o.maxTokens });
      if (o.aceitar ? o.aceitar(texto) : texto.trim() !== "") return { texto, provedor: p.nome, falhas };
      falhas.push({ provedor: p.nome, motivo: motivoRespostaInvalida(texto, p.nome) });
      console.error(`IA ${p.nome}: resposta fora do formato:`, String(texto).slice(0, 300));
    } catch (e) {
      const a = analisarErroIA(e, p.nome, p.variavel);
      falhas.push({ provedor: p.nome, motivo: a.motivo });
      console.error(`Erro na IA ${p.nome}:`, (e as any)?.status ?? "", a.motivo);   // não registra o erro bruto: nada de chave em log
      if (!a.transitorio) break;
    }
  }
  return { texto: null, provedor: null, falhas };
}

/** Junta as falhas numa frase só. Repetições são colapsadas. */
export function resumirFalhas(falhas: FalhaIA[]): string {
  const vistos: string[] = [];
  for (const f of falhas) if (!vistos.includes(f.motivo)) vistos.push(f.motivo);
  return vistos.join(" → ");
}
