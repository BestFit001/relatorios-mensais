// Cena de IA do gerador de imagens: está TRAVADA de propósito. Para destravar é preciso (1) escolher um serviço de geração de imagem,
// (2) acrescentar o adaptador dele em ADAPTADORES e (3) cadastrar na Vercel IMAGEM_IA_PROVEDOR (nome do adaptador) e IMAGEM_IA_API_KEY.
// A API do Claude analisa imagens, mas não gera imagens, por isso não serve como provedor aqui.

export interface EntradaCena {
  prompt: string;
  /** foto de referência do produto (base64, sem o prefixo data:) */
  fotoBase64: string;
  fotoMime: string;
  largura: number;
  altura: number;
}
export interface SaidaCena { base64: string; mime: string }
export interface AdaptadorImagemIA { nome: string; gerar(entrada: EntradaCena, chave: string): Promise<SaidaCena> }

/** Nenhum serviço de imagem escolhido ainda. */
export const ADAPTADORES: Record<string, AdaptadorImagemIA> = {};

export type MotivoTrava = "sem_provedor" | "sem_chave" | "provedor_desconhecido";
export interface StatusImagemIA { configurado: boolean; motivo?: MotivoTrava; mensagem: string }

export const MENSAGENS_TRAVA: Record<MotivoTrava, string> = {
  sem_provedor: "Travado: ainda não há um serviço de geração de imagem configurado.",
  sem_chave: "Travado: falta a chave do serviço de imagem (IMAGEM_IA_API_KEY) na Vercel.",
  provedor_desconhecido: "Travado: o serviço informado em IMAGEM_IA_PROVEDOR ainda não tem adaptador no app.",
};

export function statusImagemIA(env: Record<string, string | undefined> = process.env): StatusImagemIA {
  const nome = (env.IMAGEM_IA_PROVEDOR || "").trim();
  if (!nome) return { configurado: false, motivo: "sem_provedor", mensagem: MENSAGENS_TRAVA.sem_provedor };
  if (!ADAPTADORES[nome]) return { configurado: false, motivo: "provedor_desconhecido", mensagem: MENSAGENS_TRAVA.provedor_desconhecido };
  if (!(env.IMAGEM_IA_API_KEY || "").trim()) return { configurado: false, motivo: "sem_chave", mensagem: MENSAGENS_TRAVA.sem_chave };
  return { configurado: true, mensagem: "Geração por IA disponível." };
}

export function obterAdaptador(env: Record<string, string | undefined> = process.env): { adaptador: AdaptadorImagemIA; chave: string } | null {
  if (!statusImagemIA(env).configurado) return null;
  return { adaptador: ADAPTADORES[(env.IMAGEM_IA_PROVEDOR || "").trim()], chave: String(env.IMAGEM_IA_API_KEY) };
}
