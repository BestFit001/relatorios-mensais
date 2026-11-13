// (parte sem dependências: pode ser usada também no servidor)
// Nome de exibição de cada pessoa, definido pelo admin (Painel Admin > Editar). Sem nome definido, vale o que vem do e-mail ("ana.silva@x.com" -> "Ana Silva").
// Fica salvo em config_regras_tiny (campo "nome_<e-mail>"), a mesma tabela de configurações que o app já usa; não precisa de tabela nova.

export const EVENTO_NOMES = "nomes:atualizados";
const CHAVE_LOCAL = "hub_nomes_cache";
export const MAX_NOME = 60;

export const campoNome = (email: string) => "nome_" + String(email || "").trim().toLowerCase();
/** Nome que veio do e-mail (usado quando ninguém definiu um nome). */
export function nomeDoEmailPadrao(email: string): string {
  const parte = String(email || "").split("@")[0];
  const nome = parte.split(/[._\-\s]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return nome || String(email || "");
}
/** Tira espaços sobrando e limita o tamanho. */
export const limparNome = (v: string) => String(v || "").replace(/\s+/g, " ").trim().slice(0, MAX_NOME);

let cache: Map<string, string> | null = null;
let carregando: Promise<void> | null = null;

/** Lembra os nomes da última visita para a primeira tela já sair com eles, antes da busca terminar. */
function semente(): Map<string, string> {
  if (cache) return cache;
  cache = new Map();
  try {
    if (typeof window !== "undefined") {
      const j = JSON.parse(window.localStorage.getItem(CHAVE_LOCAL) || "{}");
      Object.entries(j).forEach(([k, v]) => { if (typeof v === "string" && v) cache!.set(k, v); });
    }
  } catch { /* sem cache local */ }
  return cache;
}
const guardarLocal = () => { try { window.localStorage.setItem(CHAVE_LOCAL, JSON.stringify(Object.fromEntries(semente()))); } catch { /* ignora */ } };

/** Nome personalizado, se houver. */
export const nomePersonalizado = (email: string): string | null => semente().get(String(email || "").trim().toLowerCase()) || null;
/** Nome para exibir: o definido pelo admin ou o que vem do e-mail. */
export const nomeDeExibicao = (email: string): string => nomePersonalizado(email) || nomeDoEmailPadrao(email);

/** Troca o conjunto de nomes (vindo do banco). Devolve true se algo mudou. */
export function definirNomes(m: Map<string, string>): boolean {
  const antes = JSON.stringify(Array.from(semente().entries()).sort());
  cache = m; guardarLocal();
  return antes !== JSON.stringify(Array.from(m.entries()).sort());
}
/** Guarda (ou remove, com nome vazio) o nome de uma pessoa só na memória deste navegador. */
export function definirNome(email: string, nome: string) {
  const k = String(email).trim().toLowerCase();
  if (nome) semente().set(k, nome); else semente().delete(k);
  guardarLocal();
}
