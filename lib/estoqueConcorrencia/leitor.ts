// Versão chamável do leitor de estoque (servidor e testes). O texto de JS fica em leitorJs.ts para também ir dentro do favorito.
import { LER_ESTOQUE_JS } from "./leitorJs";

export type StatusEstoque = "em_estoque" | "esgotado" | "desconhecido";
export interface LeituraEstoque {
  status: StatusEstoque;
  estoque: number | null;
  /** true = a página só informa faixa ("+50 disponíveis") */
  aproximado: boolean;
  detalhe: string;
  titulo: string | null;
  imagem: string | null;
  vendedor: string | null;
}

/** `canal` ausente ou mercadolivre = leitura específica do Mercado Livre; qualquer outro = leitura genérica (dados embutidos, JSON-LD, texto). `itemId` ajuda a achar o produto certo nos dados da página. */
export const lerEstoqueHtml: (html: string, canal?: string, itemId?: string) => LeituraEstoque = new Function(`${LER_ESTOQUE_JS}\nreturn lerEstoqueHtml;`)();
