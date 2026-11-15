// Afiliados: a mesma planilha de vendas que alimenta o dashboard (upload do canal) traz, em duas colunas, o método de venda
// (ex.: LIVE, Videos, Product cards) e o afiliado (Creator Handle). Aqui ficam as regras puras (sem rede nem tela):
//  - AcumuladorAfiliados: lê as linhas APROVADAS (as mesmas que viram venda no dashboard, sem canceladas) e soma por afiliado x método;
//  - analisarAfiliados: com a configuração (comissão de cada afiliado, perfis próprios) calcula o que foi pago e como cada um vende.
import { indiceDaColuna } from "./adsImport";

export type Afiliado = { nome: string; comissaoPct: number };
export type CfgAfiliados = {
  colConteudo: string;       // coluna do método de venda (vídeo, live...)
  colAfiliado: string;       // coluna do nome do afiliado (Creator Handle)
  colProduto: string;        // coluna do nome do produto (só usada quando o SKU não está na base de custos)
  perfisProprios: string[];  // perfis da própria loja: vendas deles não pagam comissão
  afiliados: Afiliado[];     // afiliados com comissão definida
};

export const CFG_AFIL_TIKTOK: CfgAfiliados = { colConteudo: "BG", colAfiliado: "BH", colProduto: "I", perfisProprios: ["use.bestfit"], afiliados: [] };
export const CFG_AFIL_EM_BRANCO: CfgAfiliados = { colConteudo: "", colAfiliado: "", colProduto: "", perfisProprios: [], afiliados: [] };
export const ehCanalTikTok = (canal: string) => /tiktok/i.test(String(canal || ""));
export const padraoAfiliados = (canal: string): CfgAfiliados => (ehCanalTikTok(canal) ? CFG_AFIL_TIKTOK : CFG_AFIL_EM_BRANCO);

/** "@Roh_UGC " -> "roh_ugc" (nome comparável). */
export const normHandle = (s: any): string => String(s ?? "").trim().replace(/^@/, "").toLowerCase();

export function mesclarCfgAfiliados(salva: any, padrao: CfgAfiliados): CfgAfiliados {
  const s = salva && typeof salva === "object" ? salva : {};
  const txt = (v: any, p: string) => (typeof v === "string" ? v.trim() : p);
  const lista = (v: any): string[] => (Array.isArray(v) ? Array.from(new Set(v.map(normHandle).filter(Boolean))) : padrao.perfisProprios);
  const afiliados: Afiliado[] = Array.isArray(s.afiliados)
    ? s.afiliados.map((a: any) => ({ nome: normHandle(a?.nome), comissaoPct: Math.max(0, Number(a?.comissaoPct) || 0) })).filter((a: Afiliado) => a.nome)
    : padrao.afiliados;
  return { colConteudo: txt(s.colConteudo, padrao.colConteudo), colAfiliado: txt(s.colAfiliado, padrao.colAfiliado), colProduto: txt(s.colProduto, padrao.colProduto), perfisProprios: lista(s.perfisProprios), afiliados };
}

// ---------- leitura das linhas da planilha de vendas ----------
/** Resultado do dashboard para as vendas deste produto (preenchido na tela, a partir das vendas gravadas): repasse, custo (CMV), frete/tarifa, devoluções. */
export type LiqX = { rp: number; cmv: number; ex: number; dv: number; sc: boolean };   // sc = algum SKU sem custo cadastrado
export type ProdAf = { s: string; n: string; p: number; u: number; r: number; o?: string[]; x?: LiqX };   // SKU, nome, pedidos, unidades, receita, ids dos pedidos, líquido do dashboard
export type GrupoAfil = { a: string; c: string; p: number; u: number; r: number; pr?: ProdAf[] };   // afiliado ("" = sem), conteúdo, pedidos, unidades, receita, produtos (ausente em meses lidos antes desta função)
export type VendasAfiliadosMes = {
  atualizadoEm: string; colConteudo: string; colAfiliado: string;
  pedidos: number; unidades: number; receita: number;   // tudo que foi aprovado na planilha (com ou sem afiliado)
  grupos: GrupoAfil[];
};

export class AcumuladorAfiliados {
  private iCont: number; private iAfil: number; private iProd: number;
  private grupos = new Map<string, { a: string; c: string; ped: Set<string>; u: number; r: number; prod: Map<string, { s: string; n: string; ped: Set<string>; u: number; r: number }> }>();
  private todos = new Set<string>();
  private unidades = 0; private receita = 0;
  constructor(private cfg: CfgAfiliados, cabecalho: any[] | undefined) {
    const cab = (cabecalho || []).map((c) => String(c ?? ""));
    this.iCont = indiceDaColuna(cfg.colConteudo, cab);
    this.iAfil = indiceDaColuna(cfg.colAfiliado, cab);
    this.iProd = cfg.colProduto ? indiceDaColuna(cfg.colProduto, cab) : -1;
  }
  /** Só lê se ao menos uma das duas colunas estiver definida e existir. */
  get ativo() { return this.iCont >= 0 || this.iAfil >= 0; }
  /** Soma uma linha aprovada (mesmo valor de venda e quantidade que o dashboard usa). */
  /** nomeBase = nome do produto na base de custos (vazio se o SKU não está lá: aí vale a coluna do nome na planilha). */
  add(linha: any[], idPedido: string, receita: number, quantidade: number, sku = "", nomeBase = "") {
    if (!this.ativo) return;
    const a = this.iAfil >= 0 ? normHandle(linha[this.iAfil]) : "";
    const c = this.iCont >= 0 ? String(linha[this.iCont] ?? "").trim() : "";
    const k = `${a}\u0000${c.toLowerCase()}`;
    const g = this.grupos.get(k) || { a, c, ped: new Set<string>(), u: 0, r: 0, prod: new Map() };
    g.ped.add(idPedido); g.u += quantidade; g.r += receita;
    const s0 = String(sku ?? "").trim(); const n0 = String(nomeBase || (this.iProd >= 0 ? linha[this.iProd] : "") || "").trim();
    const kp = (s0 && s0 !== "sem-sku" ? s0 : n0 || "sem-sku").toLowerCase();
    const pr = g.prod.get(kp) || { s: s0 && s0 !== "sem-sku" ? s0 : "", n: n0, ped: new Set<string>(), u: 0, r: 0 };
    if (!pr.n && n0) pr.n = n0;
    pr.ped.add(idPedido); pr.u += quantidade; pr.r += receita; g.prod.set(kp, pr);
    this.grupos.set(k, g);
    this.todos.add(idPedido); this.unidades += quantidade; this.receita += receita;
  }
  resultado(): VendasAfiliadosMes {
    const r2 = (n: number) => Number(n.toFixed(2));
    return {
      atualizadoEm: new Date().toISOString(), colConteudo: this.cfg.colConteudo, colAfiliado: this.cfg.colAfiliado,
      pedidos: this.todos.size, unidades: this.unidades, receita: r2(this.receita),
      grupos: Array.from(this.grupos.values()).map((g) => ({
        a: g.a, c: g.c, p: g.ped.size, u: g.u, r: r2(g.r),
        pr: Array.from(g.prod.values()).map((x) => ({ s: x.s, n: x.n, p: x.ped.size, u: x.u, r: r2(x.r), o: Array.from(x.ped) })).sort((x, y) => y.r - x.r),
      })),
    };
  }
}

// ---------- análise ----------
/** "LIVE" -> "Live", "Videos" -> "Vídeo", "Product cards" -> "Vitrine (product cards)"; o resto fica como veio. */
export function rotuloMetodo(bruto: string): string {
  const t = String(bruto ?? "").trim();
  if (!t) return "Sem método informado";
  const n = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n.includes("live")) return "Live";
  if (n.includes("video")) return "Vídeo";
  if (n.includes("product card") || n.includes("showcase") || n.includes("vitrine")) return "Vitrine (product cards)";
  return t;
}

export type Metodo = { metodo: string; pedidos: number; unidades: number; receita: number; pct: number };
export type ProdutoAfil = { sku: string; nome: string; pedidos: number; unidades: number; receita: number; comissao: number; lucro: number | null; liquido: number | null; semCusto: boolean; afiliados: number };
export type LinhaAfiliado = {
  nome: string; comissaoPct: number | null;       // null = comissão ainda não definida
  pedidos: number; unidades: number; receita: number; comissao: number; lucro: number | null; liquido: number | null; semCusto: number;   // lucro = como no dashboard (repasse - custo - frete - devoluções); liquido = lucro - comissão
  metodos: Metodo[]; principal: Metodo | null; definido: boolean; produtos: ProdutoAfil[];
};
export type AnaliseAfiliados = {
  total: { pedidos: number; unidades: number; receita: number; comissao: number; lucro: number | null; liquido: number | null };
  proprias: { pedidos: number; unidades: number; receita: number; lucro: number | null; liquido: number | null; pct: number; metodos: Metodo[] };
  afiliados: { pedidos: number; unidades: number; receita: number; lucro: number | null; liquido: number | null; pct: number; comissao: number; quantos: number; semComissao: number; metodos: Metodo[]; produtos: ProdutoAfil[] };
  linhas: LinhaAfiliado[];
  temLiquido: boolean;    // false enquanto o líquido do dashboard não foi calculado (ou nos meses lidos antes desta função)
  temProdutos: boolean;   // false em meses lidos antes de a planilha guardar os produtos
};

type Soma = { pedidos: number; unidades: number; receita: number };
const somar = (a: Soma, g: GrupoAfil) => { a.pedidos += g.p; a.unidades += g.u; a.receita += g.r; };
function metodosDe(grupos: GrupoAfil[]): Metodo[] {
  const m = new Map<string, Soma>();
  for (const g of grupos) { const k = rotuloMetodo(g.c); const s = m.get(k) || { pedidos: 0, unidades: 0, receita: 0 }; somar(s, g); m.set(k, s); }
  const total = Array.from(m.values()).reduce((t, s) => t + s.receita, 0);
  return Array.from(m.entries()).map(([metodo, s]) => ({ metodo, ...s, pct: total > 0 ? s.receita / total : 0 })).sort((a, b) => b.receita - a.receita);
}

/** Soma os produtos dos grupos (mais vendido primeiro). "afiliados" = quantos afiliados diferentes venderam o produto. */
function produtosDe(grupos: GrupoAfil[], pctDe: (afiliado: string) => number): ProdutoAfil[] {
  const m = new Map<string, ProdutoAfil & { _a: Set<string> }>();
  for (const g of grupos) for (const p of g.pr || []) {
    const k = (p.s || p.n || "sem-sku").toLowerCase();
    const x = m.get(k) || { sku: p.s, nome: p.n, pedidos: 0, unidades: 0, receita: 0, comissao: 0, lucro: null as number | null, liquido: null as number | null, semCusto: false, afiliados: 0, _a: new Set<string>() };
    if (!x.nome && p.n) x.nome = p.n;
    x.pedidos += p.p; x.unidades += p.u; x.receita += p.r; x.comissao += p.r * (pctDe(g.a) / 100);
    if (p.x) { x.lucro = (x.lucro || 0) + p.x.rp - p.x.cmv - p.x.ex - p.x.dv; x.semCusto = x.semCusto || p.x.sc; }
    if (g.a) x._a.add(g.a); m.set(k, x);
  }
  return Array.from(m.values()).map(({ _a, ...x }) => ({ ...x, receita: Number(x.receita.toFixed(2)), comissao: Number(x.comissao.toFixed(2)), lucro: x.lucro === null ? null : Number(x.lucro.toFixed(2)), liquido: x.lucro === null ? null : Number((x.lucro - x.comissao).toFixed(2)), afiliados: _a.size })).sort((a, b) => b.receita - a.receita);
}

export function analisarAfiliados(dados: VendasAfiliadosMes, cfg: CfgAfiliados): AnaliseAfiliados {
  const proprios = new Set(cfg.perfisProprios.map(normHandle));
  const comissao = new Map(cfg.afiliados.map((a) => [normHandle(a.nome), a.comissaoPct] as const));
  const gProprios: GrupoAfil[] = [];
  const porAfil = new Map<string, GrupoAfil[]>();
  for (const g of dados.grupos) {
    if (!g.a || proprios.has(g.a)) gProprios.push(g);
    else porAfil.set(g.a, [...(porAfil.get(g.a) || []), g]);
  }
  const temLiquido = dados.grupos.length > 0 && dados.grupos.every((g) => (g.pr || []).length > 0 && (g.pr || []).every((p) => !!p.x));
  const lucroDe = (gs: GrupoAfil[]): number | null => (!temLiquido ? null : gs.reduce((t, g) => t + (g.pr || []).reduce((u, p) => u + (p.x ? p.x.rp - p.x.cmv - p.x.ex - p.x.dv : 0), 0), 0));
  const linhas: LinhaAfiliado[] = Array.from(porAfil.entries()).map(([nome, gs]) => {
    const s: Soma = { pedidos: 0, unidades: 0, receita: 0 }; gs.forEach((g) => somar(s, g));
    const pct = comissao.has(nome) ? comissao.get(nome)! : null;
    const metodos = metodosDe(gs);
    const com = pct ? s.receita * (pct / 100) : 0;
    const lu = lucroDe(gs);
    return { nome, comissaoPct: pct, ...s, comissao: com, lucro: lu, liquido: lu === null ? null : lu - com, semCusto: gs.reduce((t, g) => t + (g.pr || []).filter((p) => p.x?.sc).length, 0), metodos, principal: metodos[0] || null, definido: pct !== null, produtos: produtosDe(gs, () => pct || 0) };
  }).sort((a, b) => b.receita - a.receita);
  const sp: Soma = { pedidos: 0, unidades: 0, receita: 0 }; gProprios.forEach((g) => somar(sp, g));
  const sa: Soma = { pedidos: 0, unidades: 0, receita: 0 }; linhas.forEach((l) => { sa.pedidos += l.pedidos; sa.unidades += l.unidades; sa.receita += l.receita; });
  const totalComissao = linhas.reduce((t, l) => t + l.comissao, 0);
  const lucroProprias = lucroDe(gProprios);
  const lucroAfil = lucroDe(linhas.flatMap((l) => porAfil.get(l.nome) || []));
  const lucroTotal = lucroProprias === null || lucroAfil === null ? null : lucroProprias + lucroAfil;
  const totalReceita = dados.receita > 0 ? dados.receita : sp.receita + sa.receita;
  return {
    total: { pedidos: dados.pedidos, unidades: dados.unidades, receita: dados.receita, comissao: totalComissao, lucro: lucroTotal, liquido: lucroTotal === null ? null : lucroTotal - totalComissao },
    proprias: { ...sp, lucro: lucroProprias, liquido: lucroProprias, pct: totalReceita > 0 ? sp.receita / totalReceita : 0, metodos: metodosDe(gProprios) },
    afiliados: {
      ...sa, lucro: lucroAfil, liquido: lucroAfil === null ? null : lucroAfil - totalComissao, pct: totalReceita > 0 ? sa.receita / totalReceita : 0, comissao: totalComissao, quantos: linhas.length,
      semComissao: linhas.filter((l) => !l.definido).length, metodos: metodosDe(linhas.flatMap((l) => porAfil.get(l.nome) || [])),
      produtos: produtosDe(linhas.flatMap((l) => porAfil.get(l.nome) || []), (a) => comissao.get(a) || 0),
    },
    linhas,
    temLiquido,
    temProdutos: dados.grupos.length === 0 || dados.grupos.some((g) => Array.isArray(g.pr)),
  };
}

