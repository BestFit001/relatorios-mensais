// Avatar de cada pessoa: um personagem (emoji sobre um fundo colorido) ou uma foto de perfil.
// Fica salvo em config_regras_tiny (campo "avatar_<e-mail>"), a mesma tabela de configurações que o app já usa; não precisa de tabela nova.
import { supabase } from "./supabase";

export type AvatarConfig = { tipo: "personagem"; id: string } | { tipo: "foto"; url: string };

export const PERSONAGENS: { id: string; emoji: string; nome: string; fundo: string }[] = [
  { id: "raposa", emoji: "🦊", nome: "Raposa", fundo: "#f97316" }, { id: "panda", emoji: "🐼", nome: "Panda", fundo: "#64748b" },
  { id: "leao", emoji: "🦁", nome: "Leão", fundo: "#eab308" }, { id: "tigre", emoji: "🐯", nome: "Tigre", fundo: "#f59e0b" },
  { id: "polvo", emoji: "🐙", nome: "Polvo", fundo: "#ec4899" }, { id: "coruja", emoji: "🦉", nome: "Coruja", fundo: "#a16207" },
  { id: "pinguim", emoji: "🐧", nome: "Pinguim", fundo: "#0ea5e9" }, { id: "unicornio", emoji: "🦄", nome: "Unicórnio", fundo: "#d946ef" },
  { id: "sapo", emoji: "🐸", nome: "Sapo", fundo: "#22c55e" }, { id: "coala", emoji: "🐨", nome: "Coala", fundo: "#94a3b8" },
  { id: "robo", emoji: "🤖", nome: "Robô", fundo: "#6366f1" }, { id: "alien", emoji: "👽", nome: "Alien", fundo: "#10b981" },
  { id: "mago", emoji: "🧙", nome: "Mago", fundo: "#7c3aed" }, { id: "heroi", emoji: "🦸", nome: "Herói", fundo: "#ef4444" },
  { id: "astronauta", emoji: "🧑‍🚀", nome: "Astronauta", fundo: "#0f766e" }, { id: "ninja", emoji: "🥷", nome: "Ninja", fundo: "#334155" },
  { id: "vampiro", emoji: "🧛", nome: "Vampiro", fundo: "#9f1239" }, { id: "dragao", emoji: "🐲", nome: "Dragão", fundo: "#16a34a" },
  { id: "dino", emoji: "🦖", nome: "Dino", fundo: "#65a30d" }, { id: "gato", emoji: "🐱", nome: "Gato", fundo: "#fb923c" },
  { id: "cachorro", emoji: "🐶", nome: "Cachorro", fundo: "#b45309" }, { id: "aguia", emoji: "🦅", nome: "Águia", fundo: "#475569" },
  { id: "tubarao", emoji: "🦈", nome: "Tubarão", fundo: "#0284c7" }, { id: "abelha", emoji: "🐝", nome: "Abelha", fundo: "#facc15" },
  { id: "foguete", emoji: "🚀", nome: "Foguete", fundo: "#4f46e5" }, { id: "coroa", emoji: "👑", nome: "Coroa", fundo: "#ca8a04" },
  { id: "diamante", emoji: "💎", nome: "Diamante", fundo: "#06b6d4" }, { id: "raio", emoji: "⚡", nome: "Raio", fundo: "#f59e0b" },
];

export const campoAvatar = (email: string) => "avatar_" + String(email || "").trim().toLowerCase();
export const personagemPorId = (id: string) => PERSONAGENS.find((p) => p.id === id) || null;

const CORES_PADRAO = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];
/** Cor estável por e-mail, para quem ainda não escolheu avatar (iniciais sobre fundo colorido). */
export function corPadrao(email: string): string {
  let h = 0; for (const c of String(email || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_PADRAO[h % CORES_PADRAO.length];
}
export function iniciais(email: string): string {
  const parte = String(email || "").split("@")[0].split(/[._\-\s]+/).filter(Boolean);
  return ((parte[0]?.[0] || "?") + (parte[1]?.[0] || "")).toUpperCase();
}

export function lerConfig(coluna: any): AvatarConfig | null {
  try {
    const j = typeof coluna === "string" ? JSON.parse(coluna) : coluna;
    if (j?.tipo === "personagem" && personagemPorId(j.id)) return { tipo: "personagem", id: j.id };
    if (j?.tipo === "foto" && typeof j.url === "string" && /^https?:\/\//i.test(j.url)) return { tipo: "foto", url: j.url };
  } catch { /* configuração inválida: sem avatar */ }
  return null;
}

// ---------------------------------------------------------------- cache do navegador
let cache: Map<string, AvatarConfig> | null = null;
let carregando: Promise<void> | null = null;
export const EVENTO_AVATAR = "avatar:atualizado";

export async function carregarAvatares(forcar = false): Promise<Map<string, AvatarConfig>> {
  if (cache && !forcar) return cache;
  if (!carregando || forcar) {
    carregando = (async () => {
      const { data } = await supabase.from("config_regras_tiny").select("campo, coluna").like("campo", "avatar_%");
      const m = new Map<string, AvatarConfig>();
      ((data as any[]) || []).forEach((r) => { const c = lerConfig(r.coluna); if (c) m.set(String(r.campo).slice(7), c); });
      cache = m;
    })().finally(() => { carregando = null; });
  }
  await carregando;
  return cache || new Map();
}
export const avatarEmCache = (email: string): AvatarConfig | null => cache?.get(String(email || "").trim().toLowerCase()) || null;

export async function salvarAvatar(email: string, cfg: AvatarConfig | null): Promise<string | null> {
  const campo = campoAvatar(email);
  const { error } = cfg
    ? await supabase.from("config_regras_tiny").upsert({ campo, coluna: JSON.stringify(cfg) }, { onConflict: "campo" })
    : await supabase.from("config_regras_tiny").delete().eq("campo", campo);
  if (error) return error.message;
  if (!cache) cache = new Map();
  const k = String(email).trim().toLowerCase();
  if (cfg) cache.set(k, cfg); else cache.delete(k);
  window.dispatchEvent(new CustomEvent(EVENTO_AVATAR));
  return null;
}

/** Reduz a foto para um quadrado de 256 px (recorte central) em JPEG, para subir leve. */
export async function prepararFoto(file: File): Promise<Blob | { erro: string }> {
  if (!file.type.startsWith("image/")) return { erro: "Escolha um arquivo de imagem." };
  try {
    const bmp = await createImageBitmap(file);
    const lado = Math.min(bmp.width, bmp.height), N = 256;
    const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
    const ctx = cv.getContext("2d"); if (!ctx) return { erro: "Não consegui processar a foto." };
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, N, N);
    ctx.drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, N, N);
    const blob: Blob | null = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85));
    return blob || { erro: "Não consegui processar a foto." };
  } catch { return { erro: "Não consegui abrir essa imagem." }; }
}

export async function enviarFoto(email: string, blob: Blob): Promise<{ url: string } | { erro: string }> {
  const caminho = `avatares/${campoAvatar(email).replace(/[^a-z0-9]+/g, "_")}_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("anexos").upload(caminho, blob, { contentType: "image/jpeg" });
  if (error) return { erro: "Não consegui enviar a foto: " + error.message };
  return { url: supabase.storage.from("anexos").getPublicUrl(caminho).data.publicUrl };
}
