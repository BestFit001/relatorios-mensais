// Tipos compartilhados do monitor de concorrentes (servidor e tela).

/** Um anúncio como o marketplace mostra hoje. */
export interface AnuncioRaspado {
  mlb_id: string;
  titulo: string;
  vendedor: string | null;
  /** marca do produto, quando o anúncio mostra (nunca é inventada) */
  marca?: string | null;
  url_anuncio: string;
  /** só o link da imagem (https); o arquivo não é guardado */
  url_imagem: string | null;
  preco: number | null;
  /** total de vendas acumulado informado pelo marketplace */
  total_vendas: number | null;
  /** true quando o marketplace só informa faixa ("+500 vendidos") */
  vendas_aproximado: boolean;
}

/** O que a captura diária precisa de cada anúncio. */
export interface Captura {
  preco: number | null;
  total_vendas: number | null;
  vendas_aproximado: boolean;
}

export interface RefAnuncio { mlb_id: string; url_anuncio: string }

export interface ResultadoCategoria {
  /** nome sugerido para a categoria (vem da página, se achou) */
  nome: string | null;
  anuncios: AnuncioRaspado[];
  /** de onde vieram os dados: "api", "html" ou "proxy" */
  fonte: string;
  avisos: string[];
}

export interface ResultadoLote {
  ok: Map<string, Captura>;
  /** mlb_id -> motivo da falha */
  erros: Map<string, string>;
}

/** Cada marketplace implementa isto; assim Shopee/Amazon entram sem mexer no resto. */
export interface Conector {
  id: string;
  nome: string;
  /** devolve a URL normalizada ou lança Error com mensagem para o usuário */
  validarUrlCategoria(url: string): string;
  validarUrlAnuncio(url: string): { url: string; mlb_id: string };
  rasparCategoria(url: string, paginas: number): Promise<ResultadoCategoria>;
  buscarAnuncio(url: string): Promise<AnuncioRaspado>;
  /** `ate` = instante (ms) em que a rodada precisa terminar; o que não der tempo volta como SEM_TEMPO */
  capturarLote(refs: RefAnuncio[], ate?: number): Promise<ResultadoLote>;
  /** testa cada estratégia (API/HTML) e conta o que cada uma consegue fazer daqui */
  diagnosticar(): Promise<DiagnosticoItem[]>;
}

export interface DiagnosticoItem { estrategia: string; ok: boolean; detalhe: string; ms: number }

/** Erro de entrada do usuário (link inválido, canal sem conector...) -> a rota responde 400, não 500. */
export class ErroValidacao extends Error {}

/** Motivo usado quando a rodada acabou antes de o anúncio ser lido (não é falha: fica para a próxima rodada). */
export const SEM_TEMPO = "sem tempo nesta rodada";
