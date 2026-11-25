// Precificação por marca: cada marca pode ter o seu próprio lucro desejado (e, na Amazon, as suas unidades comprometidas).
// A marca de cada SKU vem da base de custos (tabela_custos_skus.marca). As regras ficam salvas no banco, uma configuração por tela.
import { supabase } from "./supabase";
import { lerChave, gravarChave, paraJson } from "./adsImportDb";

export interface RegraMarca {
  /** chave normalizada da marca (sem acento, caixa ou espaço): "BEST FIT", "Bestfit" e "BESTFIT" são a mesma */
  chave: string;
  /** nome para mostrar */
  nome: string;
  /** lucro desejado, em % (texto digitado) */
  margem: string;
  /** unidades comprometidas (só na Amazon; texto digitado) */
  unidades: string;
}
export interface CfgMarcas {
  ativo: boolean;
  regras: RegraMarca[];
  /** o que fazer com as marcas que não têm regra: usar o lucro padrão da tela ou deixar de fora */
  semRegra: "padrao" | "excluir";
}
export const CFG_MARCAS_PADRAO: CfgMarcas = { ativo: false, regras: [], semRegra: "padrao" };

export interface MarcaInfo { chave: string; nome: string; qtd: number }

/** "BEST FIT", "Best Fit" e "BESTFIT" viram a mesma chave. Vazio = SKU sem marca. */
export const chaveMarca = (m: any): string =>
  String(m ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Marcas distintas da base de custos (variações de escrita juntas), da que tem mais SKUs para a que tem menos. */
export function listarMarcas(linhas: { marca?: any }[]): MarcaInfo[] {
  const grupos = new Map<string, { variantes: Map<string, number>; qtd: number }>();
  for (const l of linhas) {
    const nome = String(l?.marca ?? "").trim();
    const chave = chaveMarca(nome);
    if (!chave) continue;
    const g = grupos.get(chave) || { variantes: new Map<string, number>(), qtd: 0 };
    g.qtd++;
    g.variantes.set(nome, (g.variantes.get(nome) || 0) + 1);
    grupos.set(chave, g);
  }
  return Array.from(grupos.entries())
    .map(([chave, g]) => ({ chave, nome: Array.from(g.variantes.entries()).sort((a, b) => b[1] - a[1])[0][0], qtd: g.qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Percentual digitado ("12", "12,5"): entre 0 e 99,99. Fora disso (ou vazio) = null. */
export function lerPercentual(texto: any): number | null {
  const t = String(texto ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
}
/** Unidades digitadas: inteiro positivo. Fora disso (ou vazio) = null. */
export function lerUnidades(texto: any): number | null {
  const t = String(texto ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

export interface AplicacaoMarca {
  /** lucro desejado que vale para o SKU, em % */
  margemPct: number;
  /** unidades comprometidas que valem para o SKU */
  unidades: number;
  /** a marca do SKU tem regra própria (com lucro válido) */
  daMarca: boolean;
  /** a regra é "marcas sem regra ficam de fora" e esta marca não tem regra */
  fora: boolean;
}

/** Decide o lucro (e as unidades) de um SKU pela marca dele. Com a precificação por marca desligada, vale sempre o padrão. */
export function aplicarMarca(cfg: CfgMarcas, marcaDoSku: any, margemPadraoPct: number, unidadesPadrao = 0): AplicacaoMarca {
  const padrao: AplicacaoMarca = { margemPct: margemPadraoPct, unidades: unidadesPadrao, daMarca: false, fora: false };
  if (!cfg?.ativo) return padrao;
  const chave = chaveMarca(marcaDoSku);
  const regra = chave ? cfg.regras.find((r) => r.chave === chave) : undefined;
  const m = regra ? lerPercentual(regra.margem) : null;
  if (regra && m !== null) return { margemPct: m, unidades: lerUnidades(regra.unidades) ?? unidadesPadrao, daMarca: true, fora: false };
  if (cfg.semRegra === "excluir") return { ...padrao, fora: true };
  return padrao;
}

export function sanitizarCfgMarcas(bruto: any): CfgMarcas {
  if (!bruto || typeof bruto !== "object") return { ...CFG_MARCAS_PADRAO, regras: [] };
  const vistos = new Set<string>();
  const regras: RegraMarca[] = [];
  for (const r of Array.isArray(bruto.regras) ? bruto.regras : []) {
    const chave = chaveMarca(r?.chave ?? r?.nome);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    regras.push({ chave, nome: String(r?.nome ?? chave), margem: String(r?.margem ?? ""), unidades: String(r?.unidades ?? "") });
  }
  return { ativo: Boolean(bruto.ativo), regras, semRegra: bruto.semRegra === "excluir" ? "excluir" : "padrao" };
}

const campoDoEscopo = (escopo: string) => `precificacao_marcas_${escopo}`;

export async function carregarCfgMarcas(escopo: string): Promise<CfgMarcas> {
  return sanitizarCfgMarcas(paraJson(await lerChave(supabase, campoDoEscopo(escopo))));
}
export async function salvarCfgMarcas(escopo: string, cfg: CfgMarcas): Promise<string | null> {
  return gravarChave(supabase, campoDoEscopo(escopo), JSON.stringify(cfg));
}
