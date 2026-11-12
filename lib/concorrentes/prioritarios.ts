// Monitoramento prioritário: regras puras (sem rede nem banco), usadas pelo servidor e pela tela.

/** Categoria "escondida" que guarda os anúncios cadastrados pelo Monitoramento prioritário (não aparece como categoria na tela). */
export const urlCategoriaPrioritaria = (canal: string) => `prioritario://${canal}`;
export const ehCategoriaPrioritaria = (urlOrigem: string | null | undefined) => typeof urlOrigem === "string" && urlOrigem.startsWith("prioritario://");

/** Título provisório de um anúncio cadastrado por link, até a primeira leitura (o servidor não lê o Mercado Livre). */
export const TITULO_PENDENTE = " (aguardando a primeira leitura)";
export const tituloPendente = (titulo: string | null | undefined) => typeof titulo === "string" && titulo.endsWith(TITULO_PENDENTE);
