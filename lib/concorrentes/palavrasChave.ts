// Inteligência de palavras-chave: lê os títulos dos anúncios, tira pontuação e "palavras vazias"
// (artigos, preposições, números, unidades, "kit"...) e devolve as mais repetidas.
// Cada palavra conta UMA vez por título: o que importa é em quantos anúncios ela aparece.

/** Tira acento e põe em minúsculas: "Organização" -> "organizacao". */
export const semAcento = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const BASE = `
a as o os um uma uns umas ao aos à às de do da dos das dum duma em no na nos nas num numa por pelo pela pelos pelas
para pra pro com sem sob sobre entre ate após apos desde contra perante e ou nem mas que se como quando onde
mais menos muito muita muitos muitas tao tão já ja so só também tambem
eu tu ele ela nós nos eles elas me te lhe seu sua seus suas meu minha meus minhas teu tua
este esta estes estas esse essa esses essas aquele aquela isto isso aquilo
ser é são sao foi era tem têm ter há ha
kit kits unidade unidades un und unid pç pçs pc pcs peça peças peca pecas par pares conjunto jogo
cm mm m ml l lt lts kg g gr mg x
novo nova novos novas original frete gratis grátis promoção promocao oferta envio imediato pronta entrega full
`;

export const STOPWORDS_PT: ReadonlySet<string> = new Set(
  BASE.split(/\s+/).filter(Boolean).flatMap((w) => [w, semAcento(w)])
);

export interface PalavraChave {
  palavra: string;
  /** em quantos títulos a palavra aparece */
  anuncios: number;
  /** % dos títulos analisados */
  percentual: number;
}

export interface OpcoesRanking {
  /** quantas palavras devolver (padrão 20) */
  topo?: number;
  /** palavras extras a ignorar (ex.: a marca da própria loja) */
  ignorar?: Iterable<string>;
  /** tamanho mínimo da palavra (padrão 2) */
  tamanhoMinimo?: number;
}

/** Quebra o título em palavras úteis: sem pontuação, sem stopwords, sem números soltos. */
export function extrairPalavras(titulo: string, ignorar?: ReadonlySet<string>): string[] {
  if (!titulo) return [];
  return titulo
    .split(/[^\p{L}\p{N}]+/u) // tudo que não é letra/número vira separador (pontuação, hífen, barra, emoji...)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^\d+$/.test(p))             // "10", "20", "2024"
    .filter((p) => !/^\d+[a-zA-Z]{0,3}$/.test(p)) // "10un", "500g", "30cm"
    .filter((p) => !STOPWORDS_PT.has(p.toLowerCase()) && !STOPWORDS_PT.has(semAcento(p)))
    .filter((p) => !ignorar || !ignorar.has(semAcento(p)));
}

/** Top N palavras-chave dos títulos (padrão 20), da mais para a menos frequente. */
export function rankingPalavrasChave(titulos: string[], opcoes: OpcoesRanking = {}): PalavraChave[] {
  const topo = opcoes.topo ?? 20;
  const minimo = opcoes.tamanhoMinimo ?? 2;
  const ignorar = opcoes.ignorar ? new Set(Array.from(opcoes.ignorar, semAcento)) : undefined;

  const contagem = new Map<string, number>();
  const formas = new Map<string, Map<string, number>>(); // chave sem acento -> forma exibida -> vezes
  for (const titulo of titulos) {
    const jaContou = new Set<string>();
    for (const p of extrairPalavras(titulo, ignorar)) {
      const chave = semAcento(p);
      if (chave.length < minimo || jaContou.has(chave)) continue;
      jaContou.add(chave);
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
      const f = formas.get(chave) || new Map<string, number>();
      const exibida = p.toLowerCase();
      f.set(exibida, (f.get(exibida) || 0) + 1);
      formas.set(chave, f);
    }
  }
  const total = titulos.filter((t) => t && t.trim()).length || 1;
  return Array.from(contagem.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .slice(0, topo)
    .map(([chave, n]) => {
      // mostra a grafia mais comum (com acento, se alguém escreveu assim)
      const melhor = Array.from(formas.get(chave)!.entries()).sort((a, b) => b[1] - a[1])[0][0];
      return { palavra: melhor, anuncios: n, percentual: Math.round((n / total) * 1000) / 10 };
    });
}
