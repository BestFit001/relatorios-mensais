// Novos Cadastros > Canais: em quais canais cada produto (pai) já está cadastrado e em quais ainda falta.
// Só lógica (sem rede nem tela). Um canal conta como CADASTRADO para o pai quando:
//   - alguém marcou na tela (todas as variações com o canal marcado em `canais_enviados`), ou
//   - alguma variação (SKU filho) aparece no Mapa de Cadastros (`mapeamento_canais_skus`) ou vendeu nesse canal (`vendas_canais`).
import { normalizarNomeCanal, normalizarSkuVenda } from "./vendasCanaisLogica";

/** SKU normalizado -> nomes de canal normalizados em que ele já está/vendeu. */
export type Presenca = Map<string, Set<string>>;

export interface ItemCadastro {
  sku: string;
  sku_pai?: string | null;
  canais_enviados?: Record<string, boolean> | null;
  [k: string]: any;
}

export function montarPresenca(linhas: { canal: any; sku: any }[]): Presenca {
  const mapa: Presenca = new Map();
  for (const l of linhas) {
    const sku = normalizarSkuVenda(l.sku), canal = normalizarNomeCanal(l.canal);
    if (!sku || !canal) continue;
    let s = mapa.get(sku);
    if (!s) { s = new Set(); mapa.set(sku, s); }
    s.add(canal);
  }
  return mapa;
}

export const paiDoItem = (it: ItemCadastro): string => it.sku_pai || (it.sku.length > 5 ? it.sku.substring(0, 5) : it.sku);

/** Agrupa por SKU pai mantendo a ordem de chegada. */
export function agruparPorPai<T extends ItemCadastro>(lista: T[]): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const it of lista) {
    const pai = paiDoItem(it);
    const g = grupos.get(pai);
    if (g) g.push(it); else grupos.set(pai, [it]);
  }
  // variações em ordem de SKU (a lista vem do banco do mais novo para o mais antigo)
  grupos.forEach((g) => g.sort((a, b) => String(a.sku).localeCompare(String(b.sku), "pt-BR", { numeric: true })));
  return grupos;
}

/** O canal está marcado à mão nesse item (compara o nome sem maiúscula/acento/espaço). */
export function marcadoManual(item: ItemCadastro, canal: string): boolean {
  const ce = item.canais_enviados;
  if (!ce) return false;
  if (ce[canal] === true) return true;
  const k = normalizarNomeCanal(canal);
  return Object.keys(ce).some((c) => ce[c] === true && normalizarNomeCanal(c) === k);
}

export interface CanalStatus {
  canal: string;
  feito: boolean;
  /** "auto" = achado no Mapa/vendas (não dá para desmarcar aqui); "manual" = marcado na tela */
  origem: "auto" | "manual" | null;
  /** SKUs filhos que acusaram o canal automaticamente */
  skusAuto: string[];
}

export interface StatusGrupo {
  canais: CanalStatus[];
  feitos: CanalStatus[];
  faltam: CanalStatus[];
  total: number;
  pct: number;
  completo: boolean;
}

export function statusDoGrupo(itens: ItemCadastro[], canais: string[], presenca: Presenca): StatusGrupo {
  const lista: CanalStatus[] = canais.map((canal) => {
    const k = normalizarNomeCanal(canal);
    const skusAuto = itens.filter((i) => presenca.get(normalizarSkuVenda(i.sku))?.has(k)).map((i) => i.sku);
    const manual = itens.length > 0 && itens.every((i) => marcadoManual(i, canal));
    const origem = skusAuto.length ? "auto" : manual ? "manual" : null;
    return { canal, feito: origem !== null, origem, skusAuto };
  });
  const feitos = lista.filter((c) => c.feito), faltam = lista.filter((c) => !c.feito);
  const total = lista.length;
  return { canais: lista, feitos, faltam, total, pct: total ? Math.round((feitos.length / total) * 100) : 0, completo: total > 0 && faltam.length === 0 };
}

/** Canais (nomes oficiais) em que um SKU já vende / está no Mapa. */
export function canaisDoSku(sku: string, canais: string[], presenca: Presenca): string[] {
  const s = presenca.get(normalizarSkuVenda(sku));
  if (!s) return [];
  return canais.filter((c) => s.has(normalizarNomeCanal(c)));
}

export interface Pagina { pagina: number; totalPaginas: number; inicio: number; fim: number }

/** Página pedida, ajustada para caber no total (nunca devolve página fora do intervalo). */
export function paginar(total: number, pagina: number, tamanho: number): Pagina {
  const t = Math.max(1, tamanho);
  const totalPaginas = Math.max(1, Math.ceil(total / t));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
  return { pagina: p, totalPaginas, inicio: (p - 1) * t, fim: Math.min(total, p * t) };
}

/** Números de página para a barra: 1 … 4 5 [6] 7 8 … 20 */
export function numerosDePagina(atual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, atual - 1, atual, atual + 1]);
  if (atual <= 3) { set.add(2); set.add(3); set.add(4); }
  if (atual >= total - 2) { set.add(total - 1); set.add(total - 2); set.add(total - 3); }
  const nums = Array.from(set).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => { if (i > 0 && n - nums[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

/** Divide uma lista em lotes (o banco limita o tamanho de `in (...)`). */
export const emLotes = <T,>(lista: T[], tam = 100): T[][] =>
  Array.from({ length: Math.ceil(lista.length / tam) }, (_, i) => lista.slice(i * tam, (i + 1) * tam));

/** Variações de maiúscula do SKU, para buscar no banco com `in` (os SKUs podem ter sido gravados em caixa diferente). */
export const variantesDeSku = (sku: string): string[] => Array.from(new Set([sku, sku.toUpperCase(), sku.toLowerCase()]));
