// Compras > Análise: monta a "BASE" (uma linha por grade + filial, como na planilha de estoque geral) a partir das tabelas
// do banco e oferece o motor da tabela dinâmica: grupos em níveis, coluna cruzada, medidas, filtros e curva ABC.

export type DimId = "filial" | "grade" | "codigo" | "produto" | "cor" | "tamanho" | "genero" | "marca" | "classe" | "familia" | "fornecedor" | "abc" | "situacao";

export const DIMENSOES: { id: DimId; nome: string }[] = [
  { id: "filial", nome: "Filial" },
  { id: "marca", nome: "Marca" },
  { id: "genero", nome: "Gênero" },
  { id: "classe", nome: "Classe" },
  { id: "familia", nome: "Família" },
  { id: "fornecedor", nome: "Fornecedor" },
  { id: "codigo", nome: "Código (produto)" },
  { id: "produto", nome: "Produto" },
  { id: "tamanho", nome: "Tamanho" },
  { id: "cor", nome: "Cor" },
  { id: "grade", nome: "Grade (SKU)" },
  { id: "abc", nome: "Curva ABC" },
  { id: "situacao", nome: "Situação do estoque" },
];
export const nomeDim = (d: DimId) => DIMENSOES.find((x) => x.id === d)?.nome ?? d;

export interface ProdutoDB { grade: string; codigo: string; produto: string; cor: string; tamanho: string; genero: string; marca: string; classe: string; familia: string; fornecedor: string; custo: number | null; pdv_loja: number | null; pdv_ec: number | null }
export interface EstoqueDB { grade: string; filial: number; estoque: number }
export interface VendaDB { grade: string; filial: number; periodo: number; qtd: number; valor: number }

export interface LinhaBase {
  chave: string;
  filial: number;
  dims: Record<DimId, string>;
  estoque: number; custo: number; pdv: number;
  qtdMes: number[]; valorMes: number[];     // alinhados com a lista de períodos
  qtd: number; valor: number;               // somas do período analisado
}

export interface OpcoesABC { criterio: "qtd" | "valor"; escopo: "geral" | "filial"; corteA: number; corteB: number }
export const ABC_PADRAO: OpcoesABC = { criterio: "valor", escopo: "geral", corteA: 80, corteB: 95 };

const vazio = (s: string | null | undefined, semCadastro = false) => (s && String(s).trim() !== "" ? String(s).trim() : semCadastro ? "(sem cadastro)" : "(vazio)");

export function nomeDaFilial(n: number, nomes: Record<string, string> = {}): string {
  const nome = (nomes[String(n)] || "").trim();
  return nome ? `${n} - ${nome}` : `Filial ${n}`;
}

/** BASE = uniao de (grade, filial) com saldo e (grade, filial) com venda dentro dos períodos. */
export function construirBase(
  produtos: Map<string, ProdutoDB>, estoque: EstoqueDB[], vendas: VendaDB[], periodos: number[],
  nomesFilial: Record<string, string> = {}, abc: OpcoesABC = ABC_PADRAO,
): LinhaBase[] {
  const base = new Map<string, LinhaBase>();
  const idxPeriodo = new Map(periodos.map((p, i) => [p, i]));
  const nova = (grade: string, filial: number): LinhaBase => {
    const pr = produtos.get(grade);
    const ehEc = filial === 8 || filial === 10;
    const dims = {
      filial: nomeDaFilial(filial, nomesFilial), grade,
      codigo: vazio(pr?.codigo || grade), produto: pr ? vazio(pr.produto) : `(sem cadastro) ${grade}`,
      cor: vazio(pr?.cor, !pr), tamanho: vazio(pr?.tamanho, !pr), genero: vazio(pr?.genero, !pr), marca: vazio(pr?.marca, !pr),
      classe: vazio(pr?.classe, !pr), familia: vazio(pr?.familia, !pr), fornecedor: vazio(pr?.fornecedor, !pr),
      abc: "Sem venda", situacao: "Sem estoque",
    } as Record<DimId, string>;
    return {
      chave: `${grade}-${filial}`, filial, dims, estoque: 0,
      custo: pr?.custo ?? 0, pdv: (ehEc ? (pr?.pdv_ec || pr?.pdv_loja) : pr?.pdv_loja) ?? 0,
      qtdMes: periodos.map(() => 0), valorMes: periodos.map(() => 0), qtd: 0, valor: 0,
    };
  };
  const pegar = (grade: string, filial: number) => {
    const k = `${grade}|${filial}`;
    let l = base.get(k);
    if (!l) { l = nova(grade, filial); base.set(k, l); }
    return l;
  };
  for (const e of estoque) pegar(e.grade, e.filial).estoque += Number(e.estoque) || 0;
  for (const v of vendas) {
    const i = idxPeriodo.get(v.periodo);
    if (i === undefined) continue;
    const l = pegar(v.grade, v.filial);
    const q = Number(v.qtd) || 0, val = Number(v.valor) || 0;
    l.qtdMes[i] += q; l.valorMes[i] += val; l.qtd += q; l.valor += val;
  }
  const linhas = Array.from(base.values());
  for (const l of linhas) l.dims.situacao = l.estoque > 0 ? "Com estoque" : l.estoque < 0 ? "Estoque negativo" : "Sem estoque";
  aplicarABC(linhas, abc);
  return linhas;
}

/** Curva ABC por produto (código), acumulando do que mais vende para o que menos vende. */
export function aplicarABC(linhas: LinhaBase[], o: OpcoesABC): void {
  const chaveDe = (l: LinhaBase) => (o.escopo === "filial" ? `${l.dims.codigo}|${l.filial}` : l.dims.codigo);
  const metrica = (l: LinhaBase) => (o.criterio === "qtd" ? l.qtd : l.valor);
  const total = new Map<string, number>();
  for (const l of linhas) total.set(chaveDe(l), (total.get(chaveDe(l)) ?? 0) + metrica(l));
  const grupos = new Map<string, Map<string, number>>();   // (escopo filial) agrupa o ranking dentro da filial; geral = um ranking só
  for (const [k, v] of total) {
    if (v <= 0) continue;
    const g = o.escopo === "filial" ? k.split("|")[1] : "*";
    if (!grupos.has(g)) grupos.set(g, new Map());
    grupos.get(g)!.set(k, v);
  }
  const classe = new Map<string, string>();
  for (const m of grupos.values()) {
    const ordem = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    const soma = ordem.reduce((s, x) => s + x[1], 0);
    let antes = 0;
    for (const [k, v] of ordem) {
      const pct = (antes / soma) * 100;
      classe.set(k, pct < o.corteA ? "A" : pct < o.corteB ? "B" : "C");
      antes += v;
    }
  }
  for (const l of linhas) l.dims.abc = classe.get(chaveDe(l)) ?? "Sem venda";
}

// ---------- filtros ----------
export type Filtros = Partial<Record<DimId, Set<string>>>;
export function aplicarFiltros(linhas: LinhaBase[], f: Filtros, soComEstoque: boolean, soComVenda: boolean): LinhaBase[] {
  const ativos = (Object.entries(f) as [DimId, Set<string>][]).filter(([, s]) => s && s.size > 0);
  return linhas.filter((l) => {
    if (soComEstoque && !(l.estoque > 0)) return false;
    if (soComVenda && !(l.qtd > 0)) return false;
    for (const [d, s] of ativos) if (!s.has(l.dims[d])) return false;
    return true;
  });
}

// ---------- ordenação de rótulos ----------
const ORDEM_TAM = ["PPP", "PP", "P", "M", "G", "GG", "XG", "EXG", "XGG", "G1", "G2", "G3", "UNICO", "ÚNICO", "U"];
export function compararRotulo(dim: DimId, a: string, b: string): number {
  if (dim === "tamanho") {
    const ia = ORDEM_TAM.indexOf(a.toUpperCase()), ib = ORDEM_TAM.indexOf(b.toUpperCase());
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
  }
  if (dim === "abc") {
    const o = ["A", "B", "C", "Sem venda"];
    return o.indexOf(a) - o.indexOf(b);
  }
  if (dim === "situacao") {
    const o = ["Com estoque", "Sem estoque", "Estoque negativo"];
    return o.indexOf(a) - o.indexOf(b);
  }
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

// ---------- agregação e medidas ----------
export interface Acum {
  estoque: number; estCusto: number; estPdv: number;
  qtd: number; valor: number; custoVend: number;
  tabela: number; valorTab: number; qtdTab: number;   // venda a preço de tabela, o valor praticado e as unidades das mesmas linhas
  qtdMes: number[];
  linhas: number;
  produtos: Set<string> | null;
}

export function agregar(linhas: LinhaBase[], nPeriodos: number, contarProdutos: boolean): Acum {
  const a: Acum = { estoque: 0, estCusto: 0, estPdv: 0, qtd: 0, valor: 0, custoVend: 0, tabela: 0, valorTab: 0, qtdTab: 0, qtdMes: new Array(nPeriodos).fill(0), linhas: linhas.length, produtos: contarProdutos ? new Set() : null };
  for (const l of linhas) {
    a.estoque += l.estoque; a.estCusto += l.estoque * l.custo; a.estPdv += l.estoque * l.pdv;
    a.qtd += l.qtd; a.valor += l.valor; a.custoVend += l.qtd * l.custo;
    if (l.qtd > 0 && l.pdv > 0) { a.tabela += l.qtd * l.pdv; a.valorTab += l.valor; a.qtdTab += l.qtd; }
    for (let i = 0; i < nPeriodos; i++) a.qtdMes[i] += l.qtdMes[i];
    if (a.produtos) a.produtos.add(l.dims.codigo);
  }
  return a;
}

export type FormatoMedida = "int" | "brl" | "pct" | "dec";
export interface Medida { id: string; nome: string; grupo: string; formato: FormatoMedida; calc: (a: Acum, nPer: number) => number | null }

export function listarMedidas(periodos: number[], rotuloPer: (p: number) => string): Medida[] {
  const m: Medida[] = [
    { id: "estoque", nome: "Estoque (un)", grupo: "Estoque", formato: "int", calc: (a) => a.estoque },
    { id: "estCusto", nome: "Estoque a custo (R$)", grupo: "Estoque", formato: "brl", calc: (a) => a.estCusto },
    { id: "estPdv", nome: "Estoque a preço de tabela (R$)", grupo: "Estoque", formato: "brl", calc: (a) => a.estPdv },
    { id: "qtd", nome: "Vendas no período (un)", grupo: "Vendas", formato: "int", calc: (a) => a.qtd },
    { id: "valor", nome: "Vendas no período (R$)", grupo: "Vendas", formato: "brl", calc: (a) => a.valor },
    { id: "custoVend", nome: "Vendas a custo (R$)", grupo: "Vendas", formato: "brl", calc: (a) => a.custoVend },
    { id: "precoMedio", nome: "Preço médio praticado (R$)", grupo: "Preço", formato: "brl", calc: (a) => (a.qtd > 0 ? a.valor / a.qtd : null) },
    { id: "pdvMedio", nome: "Preço de tabela médio (R$)", grupo: "Preço", formato: "brl", calc: (a) => (a.qtdTab > 0 ? a.tabela / a.qtdTab : null) },
    { id: "desconto", nome: "Desconto praticado (%)", grupo: "Preço", formato: "pct", calc: (a) => (a.tabela > 0 ? 1 - a.valorTab / a.tabela : null) },
    { id: "margem", nome: "Margem praticada (%)", grupo: "Preço", formato: "pct", calc: (a) => (a.valor > 0 ? (a.valor - a.custoVend) / a.valor : null) },
    { id: "mediaMensal", nome: "Média mensal (un)", grupo: "Giro", formato: "dec", calc: (a, n) => (n > 0 ? a.qtd / n : null) },
    { id: "cobertura", nome: "Cobertura (meses)", grupo: "Giro", formato: "dec", calc: (a, n) => (a.qtd > 0 && n > 0 ? a.estoque / (a.qtd / n) : null) },
    { id: "produtos", nome: "Produtos distintos", grupo: "Contagem", formato: "int", calc: (a) => (a.produtos ? a.produtos.size : null) },
    { id: "linhas", nome: "Grades × filiais (linhas)", grupo: "Contagem", formato: "int", calc: (a) => a.linhas },
  ];
  periodos.forEach((p, i) => m.push({ id: `mes:${p}`, nome: `Vendas ${rotuloPer(p)} (un)`, grupo: "Por mês", formato: "int", calc: (a) => a.qtdMes[i] ?? 0 }));
  return m;
}

export function formatar(v: number | null, f: FormatoMedida): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (f === "brl") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  if (f === "pct") return (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  if (f === "dec") return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return Math.round(v).toLocaleString("pt-BR");
}

// ---------- tabela dinâmica ----------
export interface Pivot {
  linhas: DimId[];                 // níveis de linha, em ordem
  coluna: DimId | null;            // dimensão cruzada nas colunas (ex.: filial)
  medidas: string[];               // ids de medidas (ordem de exibição)
}
export interface Ordenacao { coluna: number | null; dir: "asc" | "desc" }   // coluna = índice na lista de células; null = pelo rótulo

export interface LinhaVisivel {
  id: string; nivel: number; dim: DimId; rotulo: string;
  linhas: LinhaBase[]; temFilhos: boolean; aberto: boolean;
}

export interface ContextoPivot {
  medidas: Medida[]; nPer: number; colunaDim: DimId | null; colunaValores: string[];
}

/** Células de um nó: [total das medidas..., (para cada valor da coluna cruzada) medidas...]. */
export function celulasDoNo(linhas: LinhaBase[], ctx: ContextoPivot): (number | null)[] {
  const contar = ctx.medidas.some((m) => m.id === "produtos");
  const saida: (number | null)[] = [];
  const total = agregar(linhas, ctx.nPer, contar);
  for (const m of ctx.medidas) saida.push(m.calc(total, ctx.nPer));
  if (ctx.colunaDim) {
    const partes = new Map<string, LinhaBase[]>();
    for (const l of linhas) {
      const k = l.dims[ctx.colunaDim];
      let arr = partes.get(k);
      if (!arr) { arr = []; partes.set(k, arr); }
      arr.push(l);
    }
    for (const cv of ctx.colunaValores) {
      const sub = partes.get(cv);
      if (!sub) { for (const m of ctx.medidas) saida.push(m.id === "produtos" || m.id === "linhas" || m.formato === "int" ? 0 : null); continue; }
      const a = agregar(sub, ctx.nPer, contar);
      for (const m of ctx.medidas) saida.push(m.calc(a, ctx.nPer));
    }
  }
  return saida;
}

export function valoresDaColuna(linhas: LinhaBase[], dim: DimId | null): string[] {
  if (!dim) return [];
  const s = new Set<string>();
  for (const l of linhas) s.add(l.dims[dim]);
  return Array.from(s).sort((a, b) => compararRotulo(dim, a, b));
}

/** Lista as linhas visíveis (respeitando o que está expandido) já ordenadas. */
export function achatar(
  linhas: LinhaBase[], niveis: DimId[], abertos: Set<string>, ordem: Ordenacao, ctx: ContextoPivot,
): LinhaVisivel[] {
  const saida: LinhaVisivel[] = [];
  const visitar = (rows: LinhaBase[], nivel: number, prefixo: string) => {
    const dim = niveis[nivel];
    const grupos = new Map<string, LinhaBase[]>();
    for (const l of rows) {
      const k = l.dims[dim];
      let arr = grupos.get(k);
      if (!arr) { arr = []; grupos.set(k, arr); }
      arr.push(l);
    }
    let chaves = Array.from(grupos.keys());
    if (ordem.coluna === null) {
      chaves.sort((a, b) => compararRotulo(dim, a, b));
      if (ordem.dir === "desc") chaves.reverse();
    } else {
      const val = new Map<string, number>();
      for (const k of chaves) val.set(k, celulasDoNo(grupos.get(k)!, ctx)[ordem.coluna] ?? -Infinity);
      chaves.sort((a, b) => (ordem.dir === "desc" ? (val.get(b)! - val.get(a)!) : (val.get(a)! - val.get(b)!)) || compararRotulo(dim, a, b));
    }
    for (const k of chaves) {
      const id = prefixo + "\u0001" + k;
      const filhos = grupos.get(k)!;
      const temFilhos = nivel < niveis.length - 1;
      const aberto = temFilhos && abertos.has(id);
      saida.push({ id, nivel, dim, rotulo: k, linhas: filhos, temFilhos, aberto });
      if (aberto) visitar(filhos, nivel + 1, id);
    }
  };
  if (niveis.length > 0) visitar(linhas, 0, "");
  return saida;
}

/** Ids de TODOS os nós que têm filhos (para "Expandir tudo"). Limita para não explodir em bases gigantes. */
export function idsExpansiveis(linhas: LinhaBase[], niveis: DimId[], limite = 20000): Set<string> {
  const ids = new Set<string>();
  const visitar = (rows: LinhaBase[], nivel: number, prefixo: string) => {
    if (nivel >= niveis.length - 1 || ids.size >= limite) return;
    const grupos = new Map<string, LinhaBase[]>();
    for (const l of rows) {
      const k = l.dims[niveis[nivel]];
      let arr = grupos.get(k);
      if (!arr) { arr = []; grupos.set(k, arr); }
      arr.push(l);
    }
    for (const [k, filhos] of grupos) {
      const id = prefixo + "\u0001" + k;
      ids.add(id);
      visitar(filhos, nivel + 1, id);
    }
  };
  visitar(linhas, 0, "");
  return ids;
}

// ---------- modelos prontos ----------
export interface Modelo { id: string; nome: string; descricao: string; pivot: Pivot }
export const MODELOS: Modelo[] = [
  { id: "dinamica", nome: "Dinâmica (Produto › Tamanho › Cor)", descricao: "Estoque e venda por produto, como a aba Dinâmica da planilha.",
    pivot: { linhas: ["produto", "tamanho", "cor"], coluna: null, medidas: ["estoque", "qtd", "valor", "precoMedio"] } },
  { id: "juliana", nome: "Visão por Gênero › Classe › Família › Marca", descricao: "Resumo para decisão de compra, como a aba Dinâmica Juliana.",
    pivot: { linhas: ["genero", "classe", "familia", "marca"], coluna: null, medidas: ["estoque", "produtos", "qtd", "valor", "cobertura"] } },
  { id: "filial", nome: "Estoque × venda por filial (remanejamento)", descricao: "Compare onde o produto está parado e onde ele vende.",
    pivot: { linhas: ["produto", "tamanho", "cor"], coluna: "filial", medidas: ["estoque", "qtd"] } },
  { id: "abc", nome: "Curva ABC por produto", descricao: "Classes A/B/C com venda, preço praticado e cobertura.",
    pivot: { linhas: ["abc", "produto"], coluna: null, medidas: ["qtd", "valor", "precoMedio", "desconto", "estoque", "cobertura"] } },
  { id: "preco", nome: "Preço praticado por marca", descricao: "Quanto cada marca está vendendo abaixo (ou acima) do preço de tabela.",
    pivot: { linhas: ["marca", "familia", "produto"], coluna: null, medidas: ["qtd", "valor", "precoMedio", "pdvMedio", "desconto", "margem"] } },
];
