// Marketplaces que o monitor conhece. Arquivo SEM código de servidor: a tela também importa daqui.
export interface CanalInfo {
  id: string;
  nome: string;
  /** false = aparece na lista como "em breve" (ainda não existe conector) */
  disponivel: boolean;
  /** true = o servidor consegue ler o site (API/proxy); false = só pelo favorito no navegador */
  leituraServidor: boolean;
  /** nome do canal na Análise de mercado (para taxas e lucro) */
  canalAnalise: string;
  exemploUrl: string;
}

export const CANAIS: CanalInfo[] = [
  { id: "mercadolivre", nome: "Mercado Livre", disponivel: true, leituraServidor: true, canalAnalise: "Mercado Livre 1 Clássico", exemploUrl: "https://lista.mercadolivre.com.br/organizador-de-gaveta" },
  { id: "shopee", nome: "Shopee", disponivel: true, leituraServidor: false, canalAnalise: "Shopee", exemploUrl: "https://shopee.com.br/search?keyword=organizador" },
  { id: "amazon", nome: "Amazon", disponivel: true, leituraServidor: false, canalAnalise: "Amazon", exemploUrl: "https://www.amazon.com.br/s?k=organizador" },
];

export const nomeDoCanal = (id: string) => CANAIS.find((c) => c.id === id)?.nome ?? id;
