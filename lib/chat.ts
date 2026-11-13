// Chat interno: tipos e funções puras (a tela é app/components/ChatInterno.tsx).
export const SALA_GERAL = "geral";
export const DIAS_HISTORICO = 7;
export const MAX_TEXTO = 2000;

export type MensagemChat = { id: string; sala: string; de_email: string; para_email: string | null; texto: string; criado_em: string };

/** Sala da conversa direta entre dois e-mails: a mesma para os dois lados. */
export function salaDireta(a: string, b: string): string {
  const [x, y] = [a.trim().toLowerCase(), b.trim().toLowerCase()].sort();
  return `dm:${x}|${y}`;
}

/** Nome para exibir (o cadastro só tem e-mail): "ana.silva@x.com" -> "Ana Silva". */
export function nomeDoEmail(email: string): string {
  const parte = String(email || "").split("@")[0];
  const nome = parte.split(/[._\-\s]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return nome || email;
}

/** Instante a partir do qual a mensagem ainda vale (7 dias atrás). */
export const limiteHistorico = (agora = Date.now()): number => agora - DIAS_HISTORICO * 24 * 60 * 60 * 1000;

export const aindaVale = (m: { criado_em: string }, agora = Date.now()): boolean => new Date(m.criado_em).getTime() >= limiteHistorico(agora);

/** A mensagem é para mim? (sala geral, ou conversa direta em que sou um dos lados) */
export const mensagemRelevante = (m: MensagemChat, meuEmail: string): boolean => {
  const eu = meuEmail.trim().toLowerCase();
  return m.sala === SALA_GERAL || String(m.de_email).toLowerCase() === eu || String(m.para_email || "").toLowerCase() === eu;
};

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
