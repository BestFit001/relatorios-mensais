// Integração com o Canva (Connect REST API) — só no SERVIDOR. Autorização OAuth (código + PKCE) uma única vez; o token fica na tabela
// fechada public.canva_conexao (RLS ligada, sem políticas), lida apenas com a chave de serviço. Nunca vai para o navegador, para log ou para o código.
// As chaves do app (CANVA_CLIENT_ID e CANVA_CLIENT_SECRET) vêm das variáveis de ambiente da Vercel.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { supabaseServidor } from "./concorrentes/servidor";

export const CANVA_API = "https://api.canva.com/rest/v1";
export const CANVA_AUTORIZAR = "https://www.canva.com/api/oauth/authorize";
export const ESCOPOS = "asset:read asset:write";
export const MODELO_IMAGEM = "craft_v1_2k";
const FOLGA_EXPIRACAO_MS = 60_000;

export type EnvCanva = Record<string, string | undefined>;
export const MSG_SEM_CHAVES = "Faltam CANVA_CLIENT_ID e CANVA_CLIENT_SECRET nas variáveis de ambiente da Vercel.";

export function chavesCanva(env: EnvCanva = process.env): { id: string; segredo: string } | null {
  const id = (env.CANVA_CLIENT_ID || "").trim(), segredo = (env.CANVA_CLIENT_SECRET || "").trim();
  return id && segredo ? { id, segredo } : null;
}

/** URL de retorno cadastrada no Canva (Redirect URLs). Vem do próprio endereço do site, a menos que CANVA_REDIRECT_URI force outra. */
export function urlDeRetorno(req: Request, env: EnvCanva = process.env): string {
  const fixa = (env.CANVA_REDIRECT_URI || "").trim();
  if (fixa) return fixa;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}/api/canva/callback`;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function novoPKCE(): { verificador: string; desafio: string; estado: string } {
  const verificador = b64url(randomBytes(48));
  return { verificador, desafio: b64url(createHash("sha256").update(verificador).digest()), estado: b64url(randomBytes(24)) };
}

export function urlDeAutorizacao(clientId: string, retorno: string, desafio: string, estado: string): string {
  const q = new URLSearchParams({ code_challenge_method: "s256", response_type: "code", client_id: clientId, redirect_uri: retorno, scope: ESCOPOS, code_challenge: desafio, state: estado });
  return `${CANVA_AUTORIZAR}?${q.toString()}`;
}

interface RespostaToken { access_token: string; refresh_token: string; expires_in: number; scope?: string }

async function pedirToken(corpo: Record<string, string>, ch: { id: string; segredo: string }): Promise<RespostaToken> {
  const r = await fetch(`${CANVA_API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${ch.id}:${ch.segredo}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo).toString(),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token || !j.refresh_token) throw new Error(`o Canva recusou a autorização (${r.status}${j.error ? " " + j.error : ""})`);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: Number(j.expires_in) || 14400, scope: j.scope };
}

async function guardar(t: RespostaToken): Promise<void> {
  const { error } = await supabaseServidor().from("canva_conexao").upsert({
    id: 1, access_token: t.access_token, refresh_token: t.refresh_token,
    expira_em: new Date(Date.now() + t.expires_in * 1000).toISOString(), escopo: t.scope || ESCOPOS, atualizado_em: new Date().toISOString(),
  });
  if (error) throw new Error("não consegui guardar a conexão do Canva: " + error.message);
}

export async function trocarCodigo(code: string, verificador: string, retorno: string, ch: { id: string; segredo: string }): Promise<void> {
  await guardar(await pedirToken({ grant_type: "authorization_code", code, code_verifier: verificador, redirect_uri: retorno }, ch));
}

async function lerConexao(): Promise<{ access_token: string; refresh_token: string; expira_em: string; escopo: string } | null> {
  const { data, error } = await supabaseServidor().from("canva_conexao").select("access_token,refresh_token,expira_em,escopo").eq("id", 1).maybeSingle();
  if (error) throw new Error("não consegui ler a conexão do Canva: " + error.message);
  return data as any;
}

export class CanvaDesconectado extends Error { constructor(msg = "O Canva não está conectado. Clique em “Conectar ao Canva”.") { super(msg); } }

/** Token de acesso válido. Renova sozinho (o refresh token do Canva só vale uma vez, então a renovação grava o novo par na hora). */
export async function tokenValido(env: EnvCanva = process.env): Promise<string> {
  const ch = chavesCanva(env); if (!ch) throw new Error(MSG_SEM_CHAVES);
  const c = await lerConexao(); if (!c) throw new CanvaDesconectado();
  if (new Date(c.expira_em).getTime() - Date.now() > FOLGA_EXPIRACAO_MS) return c.access_token;
  try {
    const t = await pedirToken({ grant_type: "refresh_token", refresh_token: c.refresh_token }, ch);
    await guardar(t); return t.access_token;
  } catch (e) {
    // outra chamada pode ter renovado na frente (refresh token de uso único): relê antes de desistir
    const c2 = await lerConexao();
    if (c2 && c2.refresh_token !== c.refresh_token && new Date(c2.expira_em).getTime() - Date.now() > FOLGA_EXPIRACAO_MS) return c2.access_token;
    throw new CanvaDesconectado("A conexão com o Canva expirou. Clique em “Conectar ao Canva” de novo.");
  }
}

export async function statusConexao(env: EnvCanva = process.env): Promise<{ chaves: boolean; conectado: boolean; mensagem: string }> {
  if (!chavesCanva(env)) return { chaves: false, conectado: false, mensagem: MSG_SEM_CHAVES };
  try {
    const c = await lerConexao();
    return c ? { chaves: true, conectado: true, mensagem: "Canva conectado." } : { chaves: true, conectado: false, mensagem: "Canva ainda não conectado." };
  } catch (e: any) { return { chaves: true, conectado: false, mensagem: String(e?.message || e) }; }
}

// ───────── geração de imagem ─────────
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(token: string, caminho: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${CANVA_API}${caminho}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const cod = String(j?.code || j?.error || r.status);
    if (r.status === 401) throw new CanvaDesconectado("O Canva recusou o acesso. Clique em “Conectar ao Canva” de novo.");
    if (r.status === 402) throw new Error("os créditos de IA do Canva acabaram (" + cod + ")");
    if (r.status === 403) throw new Error("o Canva negou o pedido (" + cod + "): confira se a sua conta tem IA de imagem, créditos e se o app tem acesso a essa função");
    if (r.status === 429) throw new Error("o Canva limitou as chamadas por enquanto (20 por minuto); tente de novo em instantes");
    throw new Error(`o Canva respondeu ${r.status} (${cod}): ${String(j?.message || "").slice(0, 160)}`);
  }
  return j;
}

/** Sobe uma foto como "asset" do Canva e devolve o id (o Canva só aceita imagens de referência já dentro dele). */
export async function subirReferencia(token: string, bytes: Buffer, nome: string, limiteMs = 20_000): Promise<string> {
  const nomeB64 = Buffer.from(nome.slice(0, 50)).toString("base64");
  let job = (await api(token, "/asset-uploads", {
    method: "POST", headers: { "Content-Type": "application/octet-stream", "Asset-Upload-Metadata": JSON.stringify({ name_base64: nomeB64 }) }, body: new Uint8Array(bytes),
  })).job;
  const fim = Date.now() + limiteMs;
  while (job?.status === "in_progress") {
    if (Date.now() > fim) throw new Error("o Canva demorou para receber a foto de referência");
    await espera(1000);
    job = (await api(token, `/asset-uploads/${encodeURIComponent(job.id)}`)).job;
  }
  const id = job?.asset?.id;
  if (job?.status !== "success" || !id) throw new Error("o Canva não aceitou a foto de referência" + (job?.error?.message ? ": " + String(job.error.message).slice(0, 120) : ""));
  return String(id);
}

export interface PedidoCena { prompt: string; referencias: { bytes: Buffer; nome: string }[]; largura?: number; altura?: number }

/** Formatos aceitos pelo Canva (aspect_ratio) e a proporção de cada um (largura/altura). */
const FORMATOS_CANVA: [string, number][] = [
  ["square", 1], ["landscape", 16 / 9], ["portrait", 9 / 16], ["landscape_3_2", 3 / 2], ["portrait_2_3", 2 / 3], ["portrait_4_5", 4 / 5],
  ["landscape_4_3", 4 / 3], ["portrait_3_4", 3 / 4], ["landscape_5_4", 5 / 4], ["landscape_2_1", 2], ["portrait_1_2", 1 / 2],
];
/** O formato do Canva mais parecido com o tamanho da posição (1200x1200 = "square"). */
export function formatoCanva(largura?: number, altura?: number): string {
  const r = Number(largura) / Number(altura);
  if (!(r > 0) || !Number.isFinite(r)) return "square";
  return FORMATOS_CANVA.reduce((m, f) => (Math.abs(Math.log(r / f[1])) < Math.abs(Math.log(r / m[1])) ? f : m))[0];
}

/** Sobe as referências e abre o job de geração. Devolve o id do job (o navegador consulta depois). */
export async function iniciarCena(token: string, p: PedidoCena): Promise<string> {
  const ids: string[] = [];
  const refs = p.referencias.slice(0, 12);
  for (let i = 0; i < refs.length; i += 3) { // em lotes de 3 para ganhar tempo sem estourar o limite de chamadas do Canva
    ids.push(...(await Promise.all(refs.slice(i, i + 3).map((ref, k) => subirReferencia(token, ref.bytes, ref.nome || `referencia_${i + k + 1}`)))));
  }
  const corpo: any = { prompt: p.prompt.slice(0, 8000), idempotency_key: randomUUID(), model: MODELO_IMAGEM, aspect_ratio: formatoCanva(p.largura, p.altura) };
  if (ids.length) corpo.images = ids.map((asset_id) => ({ type: "asset", asset_id }));
  const j = await api(token, "/image-generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const id = j?.job?.id; if (!id) throw new Error("o Canva não devolveu o número do job de geração");
  return String(id);
}

export type EstadoCena = { status: "em_andamento" } | { status: "pronto"; url: string } | { status: "falhou"; mensagem: string };

export async function consultarCena(token: string, jobId: string): Promise<EstadoCena> {
  const job = (await api(token, `/image-generations/${encodeURIComponent(jobId)}`)).job;
  if (job?.status === "success" && job?.result?.image?.url) return { status: "pronto", url: String(job.result.image.url) };
  if (job?.status === "failed") return { status: "falhou", mensagem: String(job?.error?.message || job?.error?.code || "o Canva não conseguiu gerar a imagem").slice(0, 200) };
  return { status: "em_andamento" };
}

/** Mensagem em português para o motivo de falha de um job de recorte. */
function motivoRecorte(erro: any): string {
  const cod = String(erro?.code || "");
  if (cod === "no_foreground_found") return "o Canva não achou o produto na foto para recortar";
  if (cod === "quota_exceeded") return "os créditos de IA do Canva acabaram";
  return String(erro?.message || cod || "o Canva não conseguiu recortar a foto").slice(0, 200);
}

/**
 * Tira o fundo de uma foto com a ferramenta "remover fundo" do Canva e devolve o endereço temporário do PNG transparente.
 * Sobe a foto, abre o job de `background_removal` (preview API; consome crédito de IA do Canva) e aguarda até `limiteMs`.
 */
export async function recortarFundo(token: string, bytes: Buffer, nome: string, limiteMs = 40_000): Promise<string> {
  const fim = Date.now() + limiteMs;
  const assetId = await subirReferencia(token, bytes, nome);
  const corpo = { asset_id: assetId, name: nome.slice(0, 200) || "recorte", transformations: [{ type: "background_removal" }], idempotency_key: randomUUID() };
  let job = (await api(token, "/image-transformations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).job;
  while (job?.status === "in_progress" && job?.id) {
    if (Date.now() > fim) throw new Error("o Canva demorou demais para tirar o fundo da foto");
    await espera(1500);
    job = (await api(token, `/image-transformations/${encodeURIComponent(job.id)}`)).job;
  }
  if (job?.status === "failed") throw new Error(motivoRecorte(job?.error));
  const url = job?.result?.url;
  if (job?.status !== "success" || !url) throw new Error("o Canva não liberou a foto recortada em alta resolução");
  return String(url);
}

export const JOB_VALIDO = /^[A-Za-z0-9_-]{8,80}$/;
