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

export const lerEstoqueHtml: (html: string) => LeituraEstoque = new Function(`${LER_ESTOQUE_JS}\nreturn lerEstoqueHtml;`)();
