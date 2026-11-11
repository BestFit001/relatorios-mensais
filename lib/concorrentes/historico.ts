// Análises sobre o histórico diário de UM anúncio (sem rede nem banco, para poder testar).

export interface Ponto {
  data: string; // AAAA-MM-DD
  preco: number | null;
  total: number | null;
  aproximado: boolean;
}

export interface MudancaPreco {
  de: number;
  para: number;
  /** variação em % sobre o preço anterior (negativo = baixou) */
  pct: number;
  /** dia da captura em que o preço novo apareceu */
  data: string;
  /** dia da captura anterior (pode ser alguns dias antes: só vemos os dias em que houve captura) */
  dataAnterior: string;
}

const porData = (a: Ponto, b: Ponto) => a.data.localeCompare(b.data);

/** Pares de capturas consecutivas com preço diferente (preços ausentes são ignorados; a base passa para o último preço conhecido). */
export function mudancasDePreco(pontos: Ponto[]): MudancaPreco[] {
  const ord = [...pontos].filter((p) => p.preco != null).sort(porData);
  const out: MudancaPreco[] = [];
  for (let i = 1; i < ord.length; i++) {
    const a = ord[i - 1], b = ord[i];
    if (Math.abs((b.preco as number) - (a.preco as number)) < 0.005) continue;
    out.push({ de: a.preco as number, para: b.preco as number, pct: (((b.preco as number) - (a.preco as number)) / (a.preco as number)) * 100, data: b.data, dataAnterior: a.data });
  }
  return out;
}

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface Estimativa {
  /** vendas por dia, na média do período coberto pelo histórico */
  porDia: number;
  /** quantos dias o cálculo cobre */
  dias: number;
  /** o total do canal é faixa ("+500"), então o número pode errar para mais ou para menos */
  aproximado: boolean;
}

/**
 * Média de vendas por dia = (último total − primeiro total) ÷ dias entre as duas capturas.
 * Só devolve algo com pelo menos `minDias` de histórico: com faixas ("+500 vendidos") o total só muda quando a faixa muda,
 * então um período curto daria 0 ou um salto enorme que não representa o dia a dia.
 */
export function mediaVendasPorDia(pontos: Ponto[], minDias = 7): Estimativa | null {
  const ord = [...pontos].filter((p) => p.total != null).sort(porData);
  if (ord.length < 2) return null;
  const a = ord[0], b = ord[ord.length - 1];
  const dias = diasEntre(a.data, b.data);
  if (dias < minDias) return null;
  const delta = Math.max(0, (b.total as number) - (a.total as number));
  return { porDia: delta / dias, dias, aproximado: ord.some((p) => p.aproximado) };
}

export interface ResumoPreco {
  atual: number | null;
  minimo: number | null;
  maximo: number | null;
  /** atual − primeiro preço do período, em % (null se faltar dado) */
  variacaoPct: number | null;
  capturas: number;
}

export function resumoDePreco(pontos: Ponto[]): ResumoPreco {
  const ord = [...pontos].filter((p) => p.preco != null).sort(porData);
  if (!ord.length) return { atual: null, minimo: null, maximo: null, variacaoPct: null, capturas: 0 };
  const precos = ord.map((p) => p.preco as number);
  const primeiro = precos[0], atual = precos[precos.length - 1];
  return { atual, minimo: Math.min(...precos), maximo: Math.max(...precos), variacaoPct: ord.length > 1 && primeiro > 0 ? ((atual - primeiro) / primeiro) * 100 : null, capturas: ord.length };
}

/** "AAAA-MM-DD" de `dias` dias antes de `hoje`. */
export function diasAtras(hoje: string, dias: number): string {
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
