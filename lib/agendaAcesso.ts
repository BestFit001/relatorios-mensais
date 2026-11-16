// Agenda: 3 agendas por área (E-commerce, Compras, Financeiro). Quem enxerga cada uma é definido por usuário na tela Admin
// (usuarios_permissoes.agendas); o Admin Geral enxerga todas. A senha é criada no 1º acesso e pedida de novo a cada 30 dias.
import { supabase } from "./supabase";

export const AGENDAS = [
  { chave: "ecommerce", nome: "E-commerce" },
  { chave: "compras", nome: "Compras" },
  { chave: "financeiro", nome: "Financeiro" },
] as const;
export type ChaveAgenda = (typeof AGENDAS)[number]["chave"];
export const nomeDaAgenda = (c: string | null | undefined) => AGENDAS.find((a) => a.chave === c)?.nome || String(c || "");
export const DIAS_VALIDADE = 30;
const MIN_SENHA = 6;

/** Agenda a que uma tarefa pertence (coluna "area"); null = tarefa sem agenda (responsáveis antigos/outros). */
export function agendaDaTarefa(t: { area?: string | null } | null | undefined): ChaveAgenda | null {
  const a = AGENDAS.find((x) => x.chave === t?.area);
  return a ? a.chave : null;
}

/** Agendas que o usuário pode abrir: Admin Geral = todas; os demais = as que o Admin Geral marcou para ele. */
export function agendasDoUsuario(perfil: string | null | undefined, agendas: unknown): ChaveAgenda[] {
  if (perfil === "admin") return AGENDAS.map((a) => a.chave);
  const lista = Array.isArray(agendas) ? agendas : [];
  return AGENDAS.map((a) => a.chave).filter((c) => lista.includes(c));
}

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const novoSalt = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");

export const validarNovaSenha = (s: string, confirmar: string): string | null =>
  s.length < MIN_SENHA ? `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.` : s !== confirmar ? "As duas senhas não são iguais." : null;

/** true = o e-mail já criou a senha da agenda. */
export async function temSenha(email: string): Promise<boolean | null> {
  const { data, error } = await supabase.from("agenda_acessos").select("email").eq("email", email).maybeSingle();
  if (error) return null;
  return !!data;
}

export async function definirSenha(email: string, senha: string): Promise<string | null> {
  const salt = novoSalt();
  const { error } = await supabase.from("agenda_acessos").upsert({ email, salt, senha_hash: await sha256(salt + senha), atualizado_em: new Date().toISOString() }, { onConflict: "email" });
  return error ? "Não consegui salvar a senha: " + error.message : null;
}

export async function conferirSenha(email: string, senha: string): Promise<boolean> {
  const { data } = await supabase.from("agenda_acessos").select("salt, senha_hash").eq("email", email).maybeSingle();
  return !!data && (await sha256(data.salt + senha)) === data.senha_hash;
}

/** Quem esqueceu a senha: a gestora apaga e a pessoa cria outra no próximo acesso. */
export async function redefinirSenha(email: string): Promise<string | null> {
  const { error } = await supabase.from("agenda_acessos").delete().eq("email", email);
  return error ? "Não consegui redefinir: " + error.message : null;
}

// ---- liberação por 30 dias (neste navegador) ----
const chaveLib = (email: string) => "agenda_liberada_" + email;
export function liberadaAgora(email: string): boolean {
  try {
    const t = Number(localStorage.getItem(chaveLib(email)) || 0);
    return t > 0 && Date.now() - t < DIAS_VALIDADE * 86400000 && Date.now() >= t;
  } catch { return false; }
}
export function registrarLiberacao(email: string) { try { localStorage.setItem(chaveLib(email), String(Date.now())); } catch { /* sem storage: pede a senha de novo */ } }
export function limparLiberacao(email: string) { try { localStorage.removeItem(chaveLib(email)); } catch { /* ok */ } }
