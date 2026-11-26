// Análises do "Acompanhamento" da tela inicial: canais (devolução e vendas no prejuízo), margem líquida por produto/marca,
// dashboard de vendas (mais vendidos, modalidade, palavras-chave) e estoque parado.
// Parte das MESMAS linhas de venda da Curva ABC (lib/vendasLinhas), então os números batem com as demais telas.
// Só lógica (sem rede nem tela), para poder testar.
import { chaveDaMarca, normalizarSkuLinha, normalizarTextoLinha, normalizarPedidoLinha, numeroLinha, dataIsoLinha, type LinhaVenda, type MapaCustos } from "./vendasLinhas";
import { extrairPalavras, semAcento } from "./concorrentes/palavrasChave";
import { paiDoSku } from "./skuPai";
import { afetaReputacao, MOTIVO_SEM_INFORMACAO } from "./devolucaoMotivos";

/** Mesmos limites do aviso de devolução do Início e da aba Full. */
export const LIMITE_DEV_ATENCAO = 5;
export const LIMITE_DEV_CRITICO = 10;
export const DIAS_ESTOQUE_PARADO = 30;

export interface Periodo { inicio: string; fim: string; rotulo: string }
export type PresetPeriodo = "7d" | "30d" | "60d" | "mes_atual" | "mes_anterior" | "tudo";

export const PRESETS_PERIODO: { id: PresetPeriodo; nome: string }[] = [
  { id: "7d", nome: "Últimos 7 dias" }, { id: "30d", nome: "Últimos 30 dias" }, { id: "60d", nome: "Últimos 60 dias" },
  { id: "mes_atual", nome: "Mês atual" }, { id: "mes_anterior", nome: "Mês anterior" }, { id: "tudo", nome: "Todo o histórico" },
];

const somaDias = (iso: string, dias: number): string => {
  const [a, m, d] = iso.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + dias));
  return x.toISOString().slice(0, 10);
};
export const diasEntre = (de: string, ate: string): number => {
  const f = (s: string) => { const [a, m, d] = s.split("-").map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((f(ate) - f(de)) / 86_400_000);
};
const brData = (iso: string) => iso.split("-").reverse().join("/");

/** Período escolhido -> datas (AAAA-MM-DD, inclusive nas duas pontas). `hoje` em AAAA-MM-DD (fuso de São Paulo). */
export function periodoDoPreset(preset: PresetPeriodo, hoje: string): Periodo {
  const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const [a, m] = hoje.split("-").map(Number);
  switch (preset) {
    case "7d": return { inicio: somaDias(hoje, -6), fim: hoje, rotulo: "últimos 7 dias" };
    case "30d": return { inicio: somaDias(hoje, -29), fim: hoje, rotulo: "últimos 30 dias" };
    case "60d": return { inicio: somaDias(hoje, -59), fim: hoje, rotulo: "últimos 60 dias" };
    case "mes_atual": return { inicio: `${a}-${String(m).padStart(2, "0")}-01`, fim: hoje, rotulo: "mês atual" };
    case "mes_anterior": {
      const ma = m === 1 ? a - 1 : a, mm = m === 1 ? 12 : m - 1;
      return { inicio: `${ma}-${String(mm).padStart(2, "0")}-01`, fim: `${ma}-${String(mm).padStart(2, "0")}-${String(ultimoDia(ma, mm)).padStart(2, "0")}`, rotulo: "mês anterior" };
    }
    default: return { inicio: "0000-01-01", fim: hoje, rotulo: "todo o histórico" };
  }
}

const dentro = (iso: string, p: Periodo) => !!iso && iso >= p.inicio && iso <= p.fim;

export interface OpcoesAnalise {
  linhas: LinhaVenda[];
  custosMap: MapaCustos;
  devolucoes: any[];
  periodo: Periodo;
  /** canais que a pessoa pode ver (nomes como estão nas vendas); null = todos */
  canaisPermitidos: string[] | null;
  /** um canal específico (nome) ou "TODOS" */
  canal: string;
  /** imposto sobre a venda (% do preço), descontado do lucro só quando `descontarImposto` */
  impostoPct?: number;
  descontarImposto?: boolean;
}

const canalOk = (canal: string, o: Pick<OpcoesAnalise, "canaisPermitidos" | "canal">) => {
  const n = normalizarTextoLinha(canal);
  if (o.canaisPermitidos && !o.canaisPermitidos.some((c) => normalizarTextoLinha(c) === n)) return false;
  return o.canal === "TODOS" || normalizarTextoLinha(o.canal) === n;
};

/** Resultado de uma linha de venda: repasse − custo − frete Flex/tarifa (− imposto, se pedido). Sem custo cadastrado = não dá para saber. */
export function resultadoDaLinha(l: LinhaVenda, custosMap: MapaCustos, impostoPct = 0): { resultado: number; semCusto: boolean; cmv: number } {
  const custo = custosMap[l.skuNorm]?.custo ?? 0;
  const cmv = custo * l.qtd;
  return { resultado: l.repasse - cmv - l.extra - (l.preco * impostoPct) / 100, semCusto: !(custo > 0), cmv };
}

const imp = (o: OpcoesAnalise) => (o.descontarImposto ? o.impostoPct ?? 0 : 0);

/** Linhas de venda (não canceladas) do período e dos canais escolhidos. */
export function linhasDoPeriodo(o: OpcoesAnalise): LinhaVenda[] {
  return o.linhas.filter((l) => !l.cancelado && dentro(l.data, o.periodo) && canalOk(l.canal, o));
}

/** Devoluções do período (data do retorno) dos canais escolhidos. */
export function devolucoesDoPeriodo(o: OpcoesAnalise): any[] {
  return (o.devolucoes || []).filter((d) => {
    const dt = dataIsoLinha(d.data_retorno);
    return dentro(dt, o.periodo) && canalOk(String(d.canal ?? ""), o);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// 1) CANAIS: devolução e vendas no prejuízo
// ---------------------------------------------------------------------------------------------------------------------
export interface MotivoDev { motivo: string; qtd: number; valor: number; afeta: boolean }
export interface SkuDevolvido { sku: string; titulo: string; qtd: number; valor: number }
export interface ResumoCanalAnalise {
  canal: string;
  unidades: number; pedidos: number; faturamento: number;
  /** devoluções do período no canal */
  devQtd: number; devValor: number; devFrete: number;
  /** unidades devolvidas ÷ unidades vendidas */
  taxaDevUnidades: number;
  /** valor devolvido ÷ faturamento */
  taxaDevValor: number;
  /** só devoluções que afetam a reputação (qualquer motivo que não seja arrependimento) */
  devAfetaQtd: number;
  nivelDev: "ok" | "atencao" | "critico" | "sem_base";
  motivos: MotivoDev[];
  topDevolvidos: SkuDevolvido[];
  lucro: number; margem: number | null;
  /** faturamento só das vendas com custo cadastrado (base da margem) */
  faturamentoComCusto: number;
  /** vendas (itens de pedido) com resultado negativo, antes das devoluções */
  prejuizoLinhas: number; prejuizoValor: number; prejuizoPct: number; prejuizoEstimadoLinhas: number;
  semCustoLinhas: number;
}

/** Vendas mínimas (unidades) para a taxa de devolução ser considerada (mesmo critério do aviso do Início). */
export const AMOSTRA_MIN_DEV = 5;

export function analisarCanais(o: OpcoesAnalise): ResumoCanalAnalise[] {
  const linhas = linhasDoPeriodo(o);
  const devs = devolucoesDoPeriodo(o);
  const imposto = imp(o);
  const por = new Map<string, ResumoCanalAnalise & { _peds: Set<string>; _titulos: Map<string, SkuDevolvido>; _motivos: Map<string, MotivoDev>; _comCusto: number; _fatComCusto: number }>();
  const get = (canal: string) => {
    const k = normalizarTextoLinha(canal);
    let r = por.get(k);
    if (!r) {
      r = { canal: String(canal).trim(), unidades: 0, pedidos: 0, faturamento: 0, devQtd: 0, devValor: 0, devFrete: 0, taxaDevUnidades: 0, taxaDevValor: 0, devAfetaQtd: 0, nivelDev: "sem_base", motivos: [], topDevolvidos: [],
        lucro: 0, margem: null, faturamentoComCusto: 0, prejuizoLinhas: 0, prejuizoValor: 0, prejuizoPct: 0, prejuizoEstimadoLinhas: 0, semCustoLinhas: 0,
        _peds: new Set(), _titulos: new Map(), _motivos: new Map(), _comCusto: 0, _fatComCusto: 0 };
      por.set(k, r);
    }
    return r;
  };

  for (const l of linhas) {
    const r = get(l.canal);
    const { resultado, semCusto } = resultadoDaLinha(l, o.custosMap, imposto);
    r.unidades += l.qtd; r.faturamento += l.preco; r._peds.add(l.chave);
    if (semCusto) { r.semCustoLinhas++; continue; }   // sem custo o lucro ficaria inflado: não entra no lucro nem no prejuízo
    r.lucro += resultado; r._comCusto++; r._fatComCusto += l.preco;
    if (resultado < 0) { r.prejuizoLinhas++; r.prejuizoValor += -resultado; if (l.repasseEstimado) r.prejuizoEstimadoLinhas++; }
  }
  for (const d of devs) {
    const r = get(String(d.canal ?? "").trim());
    const qtd = Math.max(1, Math.round(numeroLinha(d.quantidade)) || 1);
    const valor = numeroLinha(d.pdv);
    r.devQtd += qtd; r.devValor += valor; r.devFrete += numeroLinha(d.custo_frete);
    const motivo = String(d.motivo || "").trim().replace(/\.$/, "") || MOTIVO_SEM_INFORMACAO;
    const afeta = afetaReputacao(motivo);
    if (afeta) r.devAfetaQtd += qtd;
    const m = r._motivos.get(motivo) || { motivo, qtd: 0, valor: 0, afeta };
    m.qtd += qtd; m.valor += valor; r._motivos.set(motivo, m);
    const sk = normalizarSkuLinha(d.sku) || "sem sku";
    const t = r._titulos.get(sk) || { sku: String(d.sku ?? "").trim() || "sem sku", titulo: String(d.produto ?? "").trim() || o.custosMap[sk]?.titulo || "", qtd: 0, valor: 0 };
    t.qtd += qtd; t.valor += valor; r._titulos.set(sk, t);
  }

  return Array.from(por.values()).map((r) => {
    const { _peds, _titulos, _motivos, _comCusto, _fatComCusto, ...base } = r;
    const taxaUn = r.unidades > 0 ? (r.devQtd / r.unidades) * 100 : 0;
    return {
      ...base, pedidos: _peds.size,
      taxaDevUnidades: taxaUn,
      taxaDevValor: r.faturamento > 0 ? (r.devValor / r.faturamento) * 100 : 0,
      nivelDev: r.unidades < AMOSTRA_MIN_DEV ? "sem_base" : taxaUn >= LIMITE_DEV_CRITICO ? "critico" : taxaUn >= LIMITE_DEV_ATENCAO ? "atencao" : "ok",
      motivos: Array.from(_motivos.values()).sort((a, b) => b.qtd - a.qtd),
      topDevolvidos: Array.from(_titulos.values()).sort((a, b) => b.valor - a.valor || b.qtd - a.qtd).slice(0, 5),
      lucro: r.lucro - r.devValor, faturamentoComCusto: _fatComCusto,
      // margem só sobre as vendas com custo cadastrado (sem custo o lucro ficaria inflado)
      margem: _fatComCusto > 0 ? ((r.lucro - r.devValor) / _fatComCusto) * 100 : null,
      prejuizoPct: _comCusto > 0 ? (r.prejuizoLinhas / _comCusto) * 100 : 0,
    } as ResumoCanalAnalise;
  }).sort((a, b) => b.faturamento - a.faturamento);
}

export interface VendaPrejuizo {
  pedido: string; canal: string; data: string; sku: string; titulo: string; marca: string;
  qtd: number; preco: number; repasse: number; cmv: number; extra: number; resultado: number; repasseEstimado: boolean;
}

/** As vendas (itens de pedido) com resultado negativo, da pior para a menos pior. */
export function listarVendasNoPrejuizo(o: OpcoesAnalise): VendaPrejuizo[] {
  const imposto = imp(o);
  const out: VendaPrejuizo[] = [];
  for (const l of linhasDoPeriodo(o)) {
    const { resultado, semCusto, cmv } = resultadoDaLinha(l, o.custosMap, imposto);
    if (semCusto || resultado >= 0) continue;
    const info = o.custosMap[l.skuNorm];
    out.push({ pedido: String(l.ped ?? ""), canal: l.canal, data: l.data, sku: String(l.sku ?? ""), titulo: info?.titulo || l.tituloVenda, marca: info?.marca || "SEM MARCA",
      qtd: l.qtd, preco: l.preco, repasse: l.repasse, cmv, extra: l.extra, resultado, repasseEstimado: l.repasseEstimado });
  }
  return out.sort((a, b) => a.resultado - b.resultado);
}

// ---------------------------------------------------------------------------------------------------------------------
// 2) MARGEM LÍQUIDA por produto (SKU) e por marca
// ---------------------------------------------------------------------------------------------------------------------
export interface ProdutoMargem {
  skuNorm: string; sku: string; titulo: string; marca: string;
  qtd: number; faturamento: number; repasse: number; cmv: number; extra: number; imposto: number;
  devQtd: number; devValor: number;
  lucro: number;
  /** lucro ÷ faturamento; null quando não há custo cadastrado (a margem ficaria inflada) */
  margem: number | null;
  semCusto: boolean;
  prejuizoLinhas: number;
}
export interface MarcaMargem {
  marca: string; skus: number; qtd: number; faturamento: number; cmv: number; devValor: number; lucro: number; margem: number | null; semCustoSkus: number;
}

export function analisarMargens(o: OpcoesAnalise): { produtos: ProdutoMargem[]; marcas: MarcaMargem[] } {
  const imposto = imp(o);
  const linhas = linhasDoPeriodo(o);
  const m = new Map<string, ProdutoMargem>();
  for (const l of linhas) {
    const info = o.custosMap[l.skuNorm];
    let p = m.get(l.skuNorm);
    if (!p) {
      p = { skuNorm: l.skuNorm, sku: String(l.sku ?? "").trim(), titulo: info?.titulo || l.tituloVenda || "Produto não cadastrado", marca: info?.marca || "SEM MARCA",
        qtd: 0, faturamento: 0, repasse: 0, cmv: 0, extra: 0, imposto: 0, devQtd: 0, devValor: 0, lucro: 0, margem: null, semCusto: !(info && info.custo > 0), prejuizoLinhas: 0 };
      m.set(l.skuNorm, p);
    }
    const r = resultadoDaLinha(l, o.custosMap, imposto);
    p.qtd += l.qtd; p.faturamento += l.preco; p.repasse += l.repasse; p.cmv += r.cmv; p.extra += l.extra; p.imposto += (l.preco * imposto) / 100;
    if (!r.semCusto && r.resultado < 0) p.prejuizoLinhas++;
  }
  // devoluções do período e canais, por SKU (como na Curva ABC: abate o valor devolvido do lucro)
  for (const d of devolucoesDoPeriodo(o)) {
    const k = normalizarSkuLinha(d.sku);
    const p = k ? m.get(k) : undefined;
    if (!p) continue;   // devolução de produto que não vendeu no período: aparece na análise de canais, não na margem do produto
    p.devQtd += Math.max(1, Math.round(numeroLinha(d.quantidade)) || 1);
    p.devValor += numeroLinha(d.pdv);
  }
  const produtos = Array.from(m.values()).map((p) => {
    const lucro = p.repasse - p.cmv - p.extra - p.imposto - p.devValor;
    return { ...p, lucro, margem: p.semCusto || !(p.faturamento > 0) ? null : (lucro / p.faturamento) * 100 };
  });

  const b = new Map<string, MarcaMargem>();
  for (const p of produtos) {
    const x = b.get(p.marca) || { marca: p.marca, skus: 0, qtd: 0, faturamento: 0, cmv: 0, devValor: 0, lucro: 0, margem: null, semCustoSkus: 0 };
    x.skus++; x.qtd += p.qtd; x.faturamento += p.faturamento; x.cmv += p.cmv; x.devValor += p.devValor; x.lucro += p.lucro;
    if (p.semCusto) x.semCustoSkus++;
    b.set(p.marca, x);
  }
  const marcas = Array.from(b.values()).map((x) => ({ ...x, margem: x.semCustoSkus > 0 || !(x.faturamento > 0) ? (x.faturamento > 0 ? marcaMargemParcial(x, produtos) : null) : (x.lucro / x.faturamento) * 100 }));
  return { produtos: produtos.sort((a, b) => b.faturamento - a.faturamento), marcas: marcas.sort((a, b) => b.faturamento - a.faturamento) };
}

/** Margem da marca só com os SKUs que têm custo (os sem custo deixariam o percentual inflado). */
function marcaMargemParcial(x: MarcaMargem, produtos: ProdutoMargem[]): number | null {
  const com = produtos.filter((p) => p.marca === x.marca && !p.semCusto);
  const fat = com.reduce((s, p) => s + p.faturamento, 0);
  return fat > 0 ? (com.reduce((s, p) => s + p.lucro, 0) / fat) * 100 : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3) DASHBOARD de vendas
// ---------------------------------------------------------------------------------------------------------------------
export interface ItemRanking { chave: string; nome: string; sub: string; marca: string; qtd: number; faturamento: number; variacoes: number }
export interface Modalidade { modalidade: string; pedidos: number; unidades: number; faturamento: number; pctPedidos: number; pctFaturamento: number }
export interface PalavraVendida { palavra: string; unidades: number; faturamento: number; produtos: number; pctUnidades: number }
export interface DiaVenda { data: string; unidades: number; faturamento: number; pedidos: number }

export const SEM_MODALIDADE = "Não informada";

const MODALIDADES: Record<string, string> = { agencia: "Agência", flex: "Flex", correios: "Correios", full: "Full", coleta: "Coleta" };
export const nomeModalidade = (v: any): string => {
  const t = String(v ?? "").trim();
  if (!t) return SEM_MODALIDADE;
  return MODALIDADES[semAcento(t)] || t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

export interface EntradaDashboard extends OpcoesAnalise {
  plp: any[];
  /** sku normalizado -> pai (ajuste manual); sem ajuste vale a regra dos 5 primeiros dígitos */
  paiManual?: Map<string, string> | null;
}

export function analisarDashboard(o: EntradaDashboard, topo = 10) {
  const linhas = linhasDoPeriodo(o);
  const faturamentoTotal = linhas.reduce((s, l) => s + l.preco, 0);
  const unidadesTotal = linhas.reduce((s, l) => s + l.qtd, 0);

  // mais vendidos: por produto (SKU pai) e por SKU
  const agrupar = (chaveDe: (l: LinhaVenda) => string): ItemRanking[] => {
    const m = new Map<string, ItemRanking & { _filhos: Map<string, number>; _skus: Set<string> }>();
    for (const l of linhas) {
      const k = chaveDe(l); if (!k) continue;
      const info = o.custosMap[l.skuNorm];
      const x = m.get(k) || { chave: k, nome: "", sub: "", marca: info?.marca || "SEM MARCA", qtd: 0, faturamento: 0, variacoes: 0, _filhos: new Map(), _skus: new Set() };
      x.qtd += l.qtd; x.faturamento += l.preco; x._skus.add(l.skuNorm);
      x._filhos.set(l.skuNorm, (x._filhos.get(l.skuNorm) || 0) + l.qtd);
      m.set(k, x);
    }
    return Array.from(m.values()).map(({ _filhos, _skus, ...x }) => {
      const melhor = Array.from(_filhos.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const info = o.custosMap[melhor];
      return { ...x, nome: info?.titulo || x.chave, sub: info?.skuOriginal || x.chave, marca: info?.marca || x.marca, variacoes: _skus.size };
    }).sort((a, b) => b.qtd - a.qtd || b.faturamento - a.faturamento);
  };
  const porProduto = agrupar((l) => paiDoSku(l.skuNorm, o.paiManual) || l.skuNorm);
  const porSku = agrupar((l) => l.skuNorm);

  // modalidade (Agência/Flex/Correios): vem do PLP, casado pelo número do pedido (e pelo canal, quando bate)
  // O mesmo pedido pode aparecer no PLP em mais de uma modalidade (ex.: Flex e Agência): vale a linha que tem frete Flex lançado.
  const modPorCanalPed = new Map<string, { mod: string; frete: number }>(), modPorPed = new Map<string, { mod: string; frete: number }>();
  const guardar = (m: Map<string, { mod: string; frete: number }>, k: string, mod: string, frete: number) => { const x = m.get(k); if (!x || frete > x.frete) m.set(k, { mod, frete }); };
  for (const p of o.plp || []) {
    const ped = normalizarPedidoLinha(p.numero_pedido ?? p.id_pedido); if (!ped) continue;
    const mod = nomeModalidade(p.modalidade); if (mod === SEM_MODALIDADE) continue;
    const frete = numeroLinha(p.valor_frete);
    guardar(modPorCanalPed, `${normalizarTextoLinha(p.canal)}|${ped}`, mod, frete);
    guardar(modPorPed, ped, mod, frete);
  }
  const mods = new Map<string, { pedidos: Set<string>; unidades: number; faturamento: number }>();
  for (const l of linhas) {
    const mod = modPorCanalPed.get(l.chave)?.mod ?? modPorPed.get(l.pedN)?.mod ?? SEM_MODALIDADE;
    const x = mods.get(mod) || { pedidos: new Set<string>(), unidades: 0, faturamento: 0 };
    x.pedidos.add(l.chave); x.unidades += l.qtd; x.faturamento += l.preco; mods.set(mod, x);
  }
  const pedidosTotal = new Set(linhas.map((l) => l.chave)).size;
  const modalidades: Modalidade[] = Array.from(mods.entries()).map(([modalidade, x]) => ({
    modalidade, pedidos: x.pedidos.size, unidades: x.unidades, faturamento: x.faturamento,
    pctPedidos: pedidosTotal > 0 ? (x.pedidos.size / pedidosTotal) * 100 : 0,
    pctFaturamento: faturamentoTotal > 0 ? (x.faturamento / faturamentoTotal) * 100 : 0,
  })).sort((a, b) => (a.modalidade === SEM_MODALIDADE ? 1 : 0) - (b.modalidade === SEM_MODALIDADE ? 1 : 0) || b.pedidos - a.pedidos);

  // palavras-chave dos títulos VENDIDOS, pesadas pelas unidades (uma palavra conta uma vez por título/linha)
  const pal = new Map<string, { formas: Map<string, number>; unidades: number; faturamento: number; skus: Set<string> }>();
  for (const l of linhas) {
    const titulo = o.custosMap[l.skuNorm]?.titulo || l.tituloVenda;
    const vistas = new Set<string>();
    for (const w of extrairPalavras(titulo || "")) {
      // singular e plural contam juntos ("litro"/"litros", "bolsa"/"bolsas"); aparece a grafia mais usada
      const sem = semAcento(w);
      const k = sem.length > 4 && sem.endsWith("s") ? sem.slice(0, -1) : sem;
      if (k.length < 2 || vistas.has(k)) continue;
      vistas.add(k);
      const x = pal.get(k) || { formas: new Map(), unidades: 0, faturamento: 0, skus: new Set() };
      x.unidades += l.qtd; x.faturamento += l.preco; x.skus.add(l.skuNorm);
      x.formas.set(w.toLowerCase(), (x.formas.get(w.toLowerCase()) || 0) + 1);
      pal.set(k, x);
    }
  }
  const palavras: PalavraVendida[] = Array.from(pal.entries()).map(([, x]) => ({
    palavra: Array.from(x.formas.entries()).sort((a, b) => b[1] - a[1])[0][0],
    unidades: x.unidades, faturamento: x.faturamento, produtos: x.skus.size,
    pctUnidades: unidadesTotal > 0 ? (x.unidades / unidadesTotal) * 100 : 0,
  })).sort((a, b) => b.unidades - a.unidades || a.palavra.localeCompare(b.palavra, "pt-BR")).slice(0, 20);

  const dias = new Map<string, { unidades: number; faturamento: number; peds: Set<string> }>();
  for (const l of linhas) {
    const x = dias.get(l.data) || { unidades: 0, faturamento: 0, peds: new Set<string>() };
    x.unidades += l.qtd; x.faturamento += l.preco; x.peds.add(l.chave); dias.set(l.data, x);
  }
  const porDia: DiaVenda[] = Array.from(dias.entries()).map(([data, x]) => ({ data, unidades: x.unidades, faturamento: x.faturamento, pedidos: x.peds.size })).sort((a, b) => a.data.localeCompare(b.data));

  const porCanal = new Map<string, { canal: string; unidades: number; faturamento: number }>();
  for (const l of linhas) {
    const k = normalizarTextoLinha(l.canal);
    const x = porCanal.get(k) || { canal: l.canal, unidades: 0, faturamento: 0 };
    x.unidades += l.qtd; x.faturamento += l.preco; porCanal.set(k, x);
  }

  return {
    faturamentoTotal, unidadesTotal, pedidosTotal,
    produtos: porProduto.slice(0, topo), skus: porSku.slice(0, topo),
    totalProdutos: porProduto.length, totalSkus: porSku.length,
    modalidades, palavras, porDia,
    canais: Array.from(porCanal.values()).sort((a, b) => b.faturamento - a.faturamento),
    semModalidadePct: pedidosTotal > 0 ? ((modalidades.find((m) => m.modalidade === SEM_MODALIDADE)?.pedidos ?? 0) / pedidosTotal) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 4) ESTOQUE PARADO: SKUs com estoque e sem venda há mais de N dias
// ---------------------------------------------------------------------------------------------------------------------
export interface SkuParado {
  skuNorm: string; sku: string; titulo: string; marca: string;
  estoque: number; custo: number; capitalParado: number;
  ultimaVenda: string | null; diasSemVender: number | null;
  /** unidades vendidas em todo o histórico carregado (0 = nunca vendeu desde o começo do histórico) */
  vendidoNoHistorico: number;
  statusCatalogo: string;
  prioridade: "alta" | "media" | "baixa";
  acao: string;
}

export interface EntradaEstoqueParado {
  linhas: LinhaVenda[];
  custosMap: MapaCustos;
  /** sku normalizado -> estoque (Tiny) */
  estoque: Map<string, number>;
  /** sku normalizado -> status do catálogo (Normal / Obsoleto) */
  statusCatalogo?: Map<string, string>;
  canaisPermitidos: string[] | null;
  canal: string;
  hoje: string;
  dias?: number;
}

export function analisarEstoqueParado(e: EntradaEstoqueParado): { skus: SkuParado[]; inicioHistorico: string | null; totalComEstoque: number; capitalTotal: number } {
  const dias = e.dias ?? DIAS_ESTOQUE_PARADO;
  const naoCanc = e.linhas.filter((l) => !l.cancelado && canalOk(l.canal, e));
  const inicioHistorico = e.linhas.reduce<string | null>((m, l) => (!m || l.data < m ? l.data : m), null);   // o histórico é de TODOS os canais, não só dos visíveis
  const ultima = new Map<string, string>(), qtdHist = new Map<string, number>();
  for (const l of naoCanc) {
    if (!ultima.has(l.skuNorm) || l.data > ultima.get(l.skuNorm)!) ultima.set(l.skuNorm, l.data);
    qtdHist.set(l.skuNorm, (qtdHist.get(l.skuNorm) || 0) + l.qtd);
  }
  const out: SkuParado[] = [];
  let totalComEstoque = 0;
  e.estoque.forEach((est, sku) => {
    if (!(est > 0)) return;
    totalComEstoque++;
    const ult = ultima.get(sku) ?? null;
    const dsv = ult ? diasEntre(ult, e.hoje) : null;
    if (dsv !== null && dsv <= dias) return;   // vendeu dentro da janela
    const info = e.custosMap[sku];
    const custo = info?.custo ?? 0;
    const status = e.statusCatalogo?.get(sku) ?? "";
    const capital = custo * est;
    const nuncaVendeu = ult === null;
    let acao: string;
    if (normalizarTextoLinha(status) === "obsoleto") acao = "Obsoleto com estoque: liquidar (queima, kit ou promoção forte)";
    else if (nuncaVendeu) acao = `Sem nenhuma venda desde ${inicioHistorico ? brData(inicioHistorico) : "o início do histórico"}: conferir se está anunciado nos canais, com título, foto e preço bons`;
    else if ((dsv ?? 0) >= 90) acao = "Mais de 90 dias parado: promoção agressiva, kit com item de giro ou live";
    else if ((dsv ?? 0) >= 60) acao = "60+ dias parado: cupom ou campanha de Ads e revisar o preço";
    else acao = "Passou de 30 dias sem vender: dar visibilidade (Ads, destaque, live) antes que envelheça";
    const prioridade: SkuParado["prioridade"] = capital >= 1500 || (dsv ?? 999) >= 90 ? "alta" : capital >= 400 || (dsv ?? 999) >= 60 ? "media" : "baixa";
    out.push({
      skuNorm: sku, sku: info?.skuOriginal || sku, titulo: info?.titulo || "Produto não cadastrado nos custos", marca: info?.marca || "SEM MARCA",
      estoque: est, custo, capitalParado: capital, ultimaVenda: ult, diasSemVender: dsv, vendidoNoHistorico: qtdHist.get(sku) || 0,
      statusCatalogo: status, prioridade, acao,
    });
  });
  out.sort((a, b) => b.capitalParado - a.capitalParado || b.estoque - a.estoque);
  return { skus: out, inicioHistorico, totalComEstoque, capitalTotal: out.reduce((s, x) => s + x.capitalParado, 0) };
}

/** Estoque do Tiny somado por SKU normalizado (mesma regra da Cobertura de Estoque). */
export function mapaEstoque(linhas: { sku: any; estoque: any }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of linhas || []) { const k = normalizarSkuLinha(x.sku); if (k) m.set(k, (m.get(k) || 0) + (Number(x.estoque) || 0)); }
  return m;
}

export { chaveDaMarca };
