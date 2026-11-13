// Chat interno: tipos e funções puras (a tela é app/components/ChatInterno.tsx; o servidor é lib/chatServidor.ts).
export const SALA_GERAL_ID = "00000000-0000-4000-8000-000000000001";
export const DIAS_HISTORICO = 7;
export const MAX_TEXTO = 2000;

export type TipoMsg = "texto" | "imagem" | "tarefa" | "notificacao" | "produto";
export type MensagemChat = {
  id: string; sala_id: string; de_email: string; tipo: TipoMsg; texto: string | null; payload: any | null; criado_em: string; anexo_url: string | null;
};
export type SalaChat = {
  id: string; tipo: "geral" | "dm" | "grupo"; nome: string | null; criado_em: string;
  membros: { email: string; papel: "admin" | "membro" }[]; nao_lidas: number; ultima: { texto: string; de: string; em: string } | null;
};

/** Nome para exibir (o cadastro só tem e-mail): "ana.silva@x.com" -> "Ana Silva". */
export function nomeDoEmail(email: string): string {
  const parte = String(email || "").split("@")[0];
  const nome = parte.split(/[._\-\s]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return nome || email;
}

/** Nome da conversa para quem está olhando: geral, nome do grupo ou a outra pessoa da conversa direta. */
export function nomeDaSala(s: Pick<SalaChat, "tipo" | "nome" | "membros">, meuEmail: string): string {
  if (s.tipo === "geral") return "Geral";
  if (s.tipo === "grupo") return s.nome || "Grupo";
  const outro = s.membros.find((m) => m.email.toLowerCase() !== meuEmail.toLowerCase());
  return outro ? nomeDoEmail(outro.email) : "Conversa";
}

const FUSO = "America/Sao_Paulo";
export const horaSP = (iso: string): string => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
const diaSP = (d: Date): string => d.toLocaleDateString("sv-SE", { timeZone: FUSO });   // aaaa-mm-dd

/** "Hoje", "Ontem" ou "12/11" para separar as mensagens por dia. */
export function rotuloDia(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  if (diaSP(d) === diaSP(agora)) return "Hoje";
  if (diaSP(d) === diaSP(new Date(agora.getTime() - 24 * 60 * 60 * 1000))) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO });
}
export const chaveDia = (iso: string): string => diaSP(new Date(iso));

/** Para onde levar quem clica num cartão de notificação compartilhado. */
export function rotaDaNotificacao(tipo: string): string {
  return tipo === "full" ? "/full" : tipo === "devolucao" ? "/devolucoes" : tipo === "promocao" ? "/promocoes/ml" : tipo === "correcao" ? "/videos" : "/inicio";
}
