// Chat interno — lado do navegador: sessão do chat, chamadas à API, compressão de imagem e o atalho "compartilhar no chat".
import type { TipoMsg } from "./chat";

const CHAVE_SESSAO = "chat_sessao_v1";
export const MAX_IMAGEM_BYTES = 4 * 1024 * 1024;

export const emailLogado = (): string => {
  try { return String(JSON.parse(localStorage.getItem("usuario_logado") || "null")?.email || "").trim().toLowerCase(); } catch { return ""; }
};
export const perfilLogado = (): string => {
  try { return String(JSON.parse(localStorage.getItem("usuario_logado") || "null")?.perfil || ""); } catch { return ""; }
};

export function tokenDoChat(email: string): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null");
    return s && s.email === email && s.token ? String(s.token) : null;
  } catch { return null; }
}
export function guardarToken(email: string, token: string) { try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ email, token })); } catch { /* sem armazenamento */ } }
export function sairDoChat() { try { localStorage.removeItem(CHAVE_SESSAO); } catch { /* ignora */ } }

export type RespostaChat<T = any> = { ok: boolean; status: number; dados: T; erro?: string };

/** Chama a API do chat. Sessão vencida (401) limpa o token e avisa a tela. */
export async function chatApi<T = any>(acao: string, dados: any = {}, comToken = true): Promise<RespostaChat<T>> {
  const email = emailLogado();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (comToken) { const t = tokenDoChat(email); if (t) headers.Authorization = "Bearer " + t; }
  try {
    const r = await fetch("/api/chat", { method: "POST", headers, body: JSON.stringify({ acao, dados }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && comToken) { sairDoChat(); window.dispatchEvent(new CustomEvent("chat:sessao-expirada")); }
    return { ok: r.ok, status: r.status, dados: j as T, erro: r.ok ? undefined : String(j?.erro || "Erro " + r.status) };
  } catch (e: any) {
    return { ok: false, status: 0, dados: {} as T, erro: "Sem conexão com o servidor." };
  }
}

/** Reduz a foto (lado maior 1600 px, JPEG 82%) para subir rápido; GIF vai como está. */
export async function prepararImagem(file: File): Promise<{ blob: Blob; mime: string } | { erro: string }> {
  const tipos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!tipos.includes(file.type)) return { erro: "Use uma imagem JPG, PNG, WEBP ou GIF." };
  if (file.type === "image/gif") return file.size <= MAX_IMAGEM_BYTES ? { blob: file, mime: file.type } : { erro: "GIF grande demais (máximo 4 MB)." };
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"); if (!ctx) return { erro: "Não consegui processar a imagem." };
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.82));
    if (!blob) return { erro: "Não consegui processar a imagem." };
    if (blob.size > MAX_IMAGEM_BYTES) return { erro: "Imagem grande demais mesmo depois de reduzida." };
    return { blob, mime: "image/jpeg" };
  } catch { return { erro: "Não consegui abrir essa imagem." }; }
}

export type ItemCompartilhado = { tipo: Extract<TipoMsg, "tarefa" | "notificacao">; tarefa_id?: number | string; payload?: any };

/** Qualquer tela chama isto para mandar uma tarefa ou notificação para o chat (o chat abre e pergunta para quem). */
export const compartilharNoChat = (item: ItemCompartilhado) => window.dispatchEvent(new CustomEvent("chat:compartilhar", { detail: item }));
