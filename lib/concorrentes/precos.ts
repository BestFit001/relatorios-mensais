// Preço "De" (riscado) x "Por" (atual) e mudanças de preço. Só contas (sem rede nem banco), para poder testar.
// Regra do app: o preço que vale nas análises é SEMPRE o "Por" (o que o cliente paga hoje).

const EPS = 0.005;

/** "De" só vale se for maior que o "Por"; senão não é promoção (ou o texto lido não era o preço de lista). */
export function originalValido(por: number | null | undefined, de: number | null | undefined): number | null {
  if (por == null || de == null || !Number.isFinite(por) || !Number.isFinite(de)) return null;
  return de > por + EPS && de < 10_000_000 ? de : null;
}

export const emPromocao = (por: number | null | undefined, de: number | null | undefined): boolean => originalValido(por, de) != null;

/** Desconto em % do "De" para o "Por" (positivo). null se não for promoção. */
export function descontoPct(por: number | null | undefined, de: number | null | undefined): number | null {
  const o = originalValido(por, de);
  return o == null || por == null ? null : ((o - por) / o) * 100;
}

export interface MudancaDePreco { de: number; para: number; pct: number }

/** Mudança do "Por" entre a leitura anterior e a nova; null se não mudou ou faltar um dos dois. */
export function mudancaDePreco(anterior: number | null | undefined, novo: number | null | undefined): MudancaDePreco | null {
  if (anterior == null || novo == null || !Number.isFinite(anterior) || !Number.isFinite(novo) || anterior <= 0) return null;
  if (Math.abs(novo - anterior) < EPS) return null;
  return { de: anterior, para: novo, pct: ((novo - anterior) / anterior) * 100 };
}

export interface EventoPreco { anuncio_id: string; registrado_em: string; preco: number; preco_anterior: number | null; preco_original: number | null }

/** Evento a gravar nesta leitura: mudança (anterior -> novo) ou, na primeira leitura do preço, o ponto de partida. null = nada a registrar. */
export function eventoDaLeitura(anuncio_id: string, anterior: number | null | undefined, novo: number | null | undefined, original: number | null | undefined, agora: string): EventoPreco | null {
  if (novo == null || !Number.isFinite(novo) || novo <= 0) return null;
  const orig = originalValido(novo, original);
  if (anterior == null) return { anuncio_id, registrado_em: agora, preco: novo, preco_anterior: null, preco_original: orig };
  return mudancaDePreco(anterior, novo) ? { anuncio_id, registrado_em: agora, preco: novo, preco_anterior: anterior, preco_original: orig } : null;
}

/** "AAAA-MM-DD" no fuso de São Paulo de um instante ISO. */
export function diaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
/** "HH:MM" no fuso de São Paulo. */
export function horaSP(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
/** "11/11 14:32" (ou só a data se hora for desconhecida). */
export function quandoBR(iso: string): string {
  const d = diaSP(iso).split("-");
  return `${d[2]}/${d[1]} ${horaSP(iso)}`;
}

/** Uma mudança do preço "Por" vista pelo painel: `comHora` = veio do registro por leitura (tem hora); senão veio da comparação de dias. */
export interface MudancaVista {
  de: number; para: number; pct: number;
  /** instante ISO (comHora) ou "AAAA-MM-DD" */
  quando: string; comHora: boolean;
  /** só nas diárias: dia da leitura anterior */
  anteriorEm?: string;
  /** "De" (riscado) no momento, se estava em promoção */
  original?: number | null;
}

/**
 * Junta o registro por leitura (preciso, com hora, várias no mesmo dia) com a comparação diária antiga (só dias).
 * Antes do primeiro registro por leitura do anúncio, vale o diário; a partir dele, só o registro por leitura
 * (assim a mesma mudança não aparece duas vezes). Ordem: mais antiga primeiro.
 */
export function juntarMudancas(
  eventos: Pick<EventoPreco, "registrado_em" | "preco" | "preco_anterior" | "preco_original">[],
  diarias: { de: number; para: number; pct: number; data: string; dataAnterior: string }[],
): MudancaVista[] {
  const ordenados = [...eventos].sort((a, b) => a.registrado_em.localeCompare(b.registrado_em));
  const primeiroDia = ordenados.length ? diaSP(ordenados[0].registrado_em) : null;
  const out: MudancaVista[] = [];
  for (const d of diarias) if (primeiroDia == null || d.data < primeiroDia) out.push({ de: d.de, para: d.para, pct: d.pct, quando: d.data, comHora: false, anteriorEm: d.dataAnterior });
  for (const e of ordenados) {
    const m = mudancaDePreco(e.preco_anterior, e.preco);
    if (m) out.push({ ...m, quando: e.registrado_em, comHora: true, original: originalValido(e.preco, e.preco_original) });
  }
  return out;
}

/** Dia (AAAA-MM-DD, São Paulo) de uma mudança vista. */
export const diaDaMudanca = (m: Pick<MudancaVista, "quando" | "comHora">): string => (m.comHora ? diaSP(m.quando) : m.quando);
