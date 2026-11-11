// Marketplaces que o monitor conhece. Arquivo SEM código de servidor: a tela também importa daqui.
export interface CanalInfo {
  id: string;
  nome: string;
  /** false = aparece na lista como "em breve" (ainda não existe conector) */
  disponivel: boolean;
  exemploUrl: string;
}

export const CANAIS: CanalInfo[] = [
  { id: "mercadolivre", nome: "Mercado Livre", disponivel: true, exemploUrl: "https://lista.mercadolivre.com.br/organizador-de-gaveta" },
  { id: "shopee", nome: "Shopee", disponivel: false, exemploUrl: "https://shopee.com.br/..." },
  { id: "amazon", nome: "Amazon", disponivel: false, exemploUrl: "https://www.amazon.com.br/..." },
];

export const nomeDoCanal = (id: string) => CANAIS.find((c) => c.id === id)?.nome ?? id;
