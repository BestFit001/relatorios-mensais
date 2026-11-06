// Apresentação Time: modelo de dados dos slides (sem dependências, para poder ser testado em Node).
// Um slide tem um layout (capa, conteúdo, seção, imagem inteira), título/subtítulo e uma lista de blocos
// (métricas, texto, imagens) que são empilhados abaixo do título.

export type LayoutSlide = "capa" | "conteudo" | "secao" | "imagem";
export type CorTexto = "normal" | "vermelho" | "cinza";
export type TamanhoTexto = "p" | "m" | "g";

export interface BlocoMetricas { id: string; tipo: "metricas"; itens: { rotulo: string; valor: string }[] }
export interface BlocoTexto { id: string; tipo: "texto"; titulo: string; texto: string; cor: CorTexto; tamanho: TamanhoTexto; centralizar: boolean }
export interface BlocoImagens { id: string; tipo: "imagens"; urls: string[] }
export type Bloco = BlocoMetricas | BlocoTexto | BlocoImagens;

export interface Slide {
  id: string;
  layout: LayoutSlide;
  titulo: string;
  subtitulo: string;
  blocos: Bloco[];
  imagem?: string;   // só no layout "imagem" (página inteira, ex.: páginas de um PDF)
}

export const LAYOUTS: { id: LayoutSlide; nome: string; descricao: string }[] = [
  { id: "capa", nome: "Capa", descricao: "Logo no centro, título e data" },
  { id: "conteudo", nome: "Conteúdo", descricao: "Título + blocos (métricas, texto, imagens)" },
  { id: "secao", nome: "Seção", descricao: "Título grande no centro, para separar assuntos" },
  { id: "imagem", nome: "Imagem inteira", descricao: "Uma imagem ocupando o slide todo" },
];

let contador = 0;
export const novoId = (): string => `${Date.now().toString(36)}${(contador++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const novoBloco = (tipo: Bloco["tipo"]): Bloco => {
  if (tipo === "metricas") return { id: novoId(), tipo, itens: [{ rotulo: "RECEITA TOTAL", valor: "" }, { rotulo: "MARGEM", valor: "" }] };
  if (tipo === "texto") return { id: novoId(), tipo, titulo: "", texto: "", cor: "normal", tamanho: "m", centralizar: false };
  return { id: novoId(), tipo: "imagens", urls: [] };
};

export const novoSlide = (layout: LayoutSlide = "conteudo"): Slide => ({
  id: novoId(), layout, titulo: layout === "capa" ? "TÍTULO DA APRESENTAÇÃO" : layout === "secao" ? "TÍTULO DA SEÇÃO" : layout === "imagem" ? "" : "TÍTULO DO SLIDE",
  subtitulo: "", blocos: [],
});

export const duplicarSlide = (s: Slide): Slide => ({
  ...s, id: novoId(),
  blocos: s.blocos.map((b) => ({ ...JSON.parse(JSON.stringify(b)), id: novoId() })),
});

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
/** "Outubro/2026" para o mês anterior à data (a reunião mensal fala do mês que fechou). */
export const mesAnteriorLabel = (hoje: Date = new Date()): string => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
};

const metricas = (itens: [string, string][]): BlocoMetricas => ({ id: novoId(), tipo: "metricas", itens: itens.map(([rotulo, valor]) => ({ rotulo, valor })) });
const texto = (t: string, extra: Partial<BlocoTexto> = {}): BlocoTexto => ({ id: novoId(), tipo: "texto", titulo: "", texto: t, cor: "normal", tamanho: "m", centralizar: false, ...extra });

/** Modelo "Reunião mensal – E-commerce" (mesma estrutura do PowerPoint atual), para começar uma apresentação nova. */
export function modeloReuniaoMensal(mes: string = mesAnteriorLabel()): Slide[] {
  const M = mes.toUpperCase();
  const resultadoCanal = (canal: string): Slide => ({ ...novoSlide("conteudo"), titulo: `RESULTADO DO MÊS – ${canal}`, subtitulo: M, blocos: [
    metricas([["RECEITA TOTAL", ""], ["MARGEM", ""]]),
    metricas([["INVESTIMENTO", ""], ["FAT. ADS", ""], ["MARGEM LÍQ.", ""], ["ROI", ""]]),
  ] });
  const proximosCanal = (canal: string): Slide => ({ ...novoSlide("conteudo"), titulo: `PRÓXIMOS PASSOS – PRINCIPAIS AÇÕES DO MÊS – ${canal}`, blocos: [
    texto("[escreva aqui as ações do canal]", { cor: "vermelho" }),
  ] });
  return [
    { ...novoSlide("capa"), titulo: "REUNIÃO MENSAL – E-COMMERCE", subtitulo: mes },
    { ...novoSlide("conteudo"), titulo: "RESULTADO DO MÊS", subtitulo: M, blocos: [metricas([["RECEITA TOTAL", ""], ["MARGEM", ""]])] },
    { ...novoSlide("conteudo"), titulo: "RESULTADO ACUMULADO", subtitulo: M, blocos: [metricas([["RECEITA TOTAL", ""], ["MARGEM", ""]])] },
    { ...novoSlide("conteudo"), titulo: "CADASTROS", subtitulo: `POSIÇÃO EM ${M}`, blocos: [{ id: novoId(), tipo: "imagens", urls: [] }] },
    { ...novoSlide("conteudo"), titulo: "PRÓXIMOS PASSOS – PRINCIPAIS AÇÕES DO MÊS", blocos: [
      texto("[informar/validar valor de budget de campanhas do próximo mês]", { cor: "vermelho" }),
      texto("[trazer eventuais proposições além do que já foi alinhado com a diretoria]", { cor: "vermelho" }),
    ] },
    { ...novoSlide("secao"), titulo: "RESULTADOS E AÇÕES POR CANAL" },
    resultadoCanal("MERCADO LIVRE 1.0"), proximosCanal("MERCADO LIVRE 1.0"),
    resultadoCanal("MERCADO LIVRE 2.0"), proximosCanal("MERCADO LIVRE 2.0"),
    resultadoCanal("TIKTOK SHOP"), proximosCanal("TIKTOK SHOP"),
    resultadoCanal("SHOPEE"), proximosCanal("SHOPEE"),
    resultadoCanal("NETSHOES"), proximosCanal("NETSHOES"),
    { ...novoSlide("conteudo"), titulo: "TROCAS E DEVOLUÇÕES", subtitulo: M, blocos: [
      metricas([["VALORES DO MÊS", ""]]), texto("", { titulo: "PLANO DE AÇÃO PARA REDUÇÃO DAS DEVOLUÇÕES" }),
    ] },
    { ...novoSlide("conteudo"), titulo: "MARKETING", subtitulo: M, blocos: [
      metricas([["MÉTRICAS INSTAGRAM", ""], ["MÉTRICAS TIKTOK", ""], ["NÚMEROS DE CLIPS FEITOS NO MÊS", ""]]),
      texto("", { titulo: "PRÓXIMOS PASSOS / SUGESTÕES" }),
    ] },
    { ...novoSlide("conteudo"), titulo: "TENDÊNCIA PARA O VERÃO", blocos: [{ id: novoId(), tipo: "imagens", urls: [] }] },
  ];
}

/** Garante que o que veio do banco tem a forma esperada (slides antigos/incompletos não quebram a tela). */
export function normalizarSlides(bruto: unknown): Slide[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((s) => s && typeof s === "object").map((s: any) => ({
    id: String(s.id || novoId()),
    layout: (["capa", "conteudo", "secao", "imagem"].includes(s.layout) ? s.layout : "conteudo") as LayoutSlide,
    titulo: String(s.titulo ?? ""), subtitulo: String(s.subtitulo ?? ""),
    imagem: s.imagem ? String(s.imagem) : undefined,
    blocos: (Array.isArray(s.blocos) ? s.blocos : []).filter((b: any) => b && ["metricas", "texto", "imagens"].includes(b.tipo)).map((b: any) => {
      const base = { id: String(b.id || novoId()) };
      if (b.tipo === "metricas") return { ...base, tipo: "metricas", itens: (Array.isArray(b.itens) ? b.itens : []).map((i: any) => ({ rotulo: String(i?.rotulo ?? ""), valor: String(i?.valor ?? "") })) } as Bloco;
      if (b.tipo === "texto") return { ...base, tipo: "texto", titulo: String(b.titulo ?? ""), texto: String(b.texto ?? ""), cor: ["normal", "vermelho", "cinza"].includes(b.cor) ? b.cor : "normal", tamanho: ["p", "m", "g"].includes(b.tamanho) ? b.tamanho : "m", centralizar: Boolean(b.centralizar) } as Bloco;
      return { ...base, tipo: "imagens", urls: (Array.isArray(b.urls) ? b.urls : []).map(String) } as Bloco;
    }),
  }));
}
