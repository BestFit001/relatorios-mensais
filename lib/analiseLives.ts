// Análise de desempenho das lives: agrega as vendas (uma linha da planilha = uma unidade vendida)
// por dia, horário, dia da semana e produto. Funções puras, sem React nem banco.

export type OrdemData = "dma" | "mda";   // dia/mês/ano ou mês/dia/ano (planilhas do TikTok costumam vir em mês/dia/ano)

export interface DataHoraLive { iso: string; hora: number | null; minuto: number | null }

/** Decide se as datas "a/b/aaaa" da base estão em dia/mês ou mês/dia olhando todas de uma vez (um valor >12 resolve). */
export function detectarOrdemData(textos: any[]): OrdemData {
  let dma = 0, mda = 0;
  for (const t of textos) {
    const m = String(t ?? "").trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (!m) continue;
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a > 12 && b <= 12) dma++;
    else if (b > 12 && a <= 12) mda++;
  }
  if (dma > mda) return "dma";
  return "mda";   // sem evidência: o formato que aparece hoje na base (09/29/2026) é mês/dia/ano
}

/** "09/29/2026 14:32:10", "29/09/2026 02:32 PM", "2026-09-29T14:32:10" ou só a data. Não reconhecido = null. */
export function interpretarDataHora(valor: any, ordem: OrdemData): DataHoraLive | null {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  const hm = s.match(/(?:[ T,]|^)(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?\s*(AM|PM|am|pm)?\s*(?:Z|[+-]\d{2}:?\d{2})?\s*$/);
  let hora: number | null = null, minuto: number | null = null;
  if (hm) {
    hora = parseInt(hm[1], 10); minuto = parseInt(hm[2], 10);
    const ap = (hm[3] || "").toLowerCase();
    if (ap === "pm" && hora < 12) hora += 12;
    if (ap === "am" && hora === 12) hora = 0;
    if (hora > 23 || minuto > 59) { hora = null; minuto = null; }
  }
  let ano = 0, mes = 0, dia = 0;
  const iso = s.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  const barra = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (iso) { ano = +iso[1]; mes = +iso[2]; dia = +iso[3]; }
  else if (barra) {
    const a = +barra[1], b = +barra[2];
    ano = +barra[3]; if (ano < 100) ano += 2000;
    if (a > 12) { dia = a; mes = b; }
    else if (b > 12) { mes = a; dia = b; }
    else if (ordem === "dma") { dia = a; mes = b; }
    else { mes = a; dia = b; }
  } else return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return { iso: `${ano}-${p(mes)}-${p(dia)}`, hora, minuto };
}

export function dataIsoParaBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export interface ItemAnalise {
  sku: string;
  nome: string;
  valorPago: number;
  tarifas: number;
  rebate: number;
  repasse: number;
  custo: number;
  imposto: number;
  comissaoVendedora: number;
  liquidez: number;
  dataIso: string;          // "" quando a data não foi reconhecida
  hora: number | null;
  minuto: number | null;
}

export interface Bloco {
  itens: number;
  venda: number;
  tarifas: number;
  rebate: number;
  repasse: number;
  liquidez: number;
}
const vazio = (): Bloco => ({ itens: 0, venda: 0, tarifas: 0, rebate: 0, repasse: 0, liquidez: 0 });
const somar = (b: Bloco, it: ItemAnalise) => {
  b.itens += 1; b.venda += it.valorPago; b.tarifas += it.tarifas; b.rebate += it.rebate; b.repasse += it.repasse; b.liquidez += it.liquidez;
};
export const ticket = (b: { itens: number; venda: number }) => (b.itens > 0 ? b.venda / b.itens : 0);

export interface DiaAnalise extends Bloco { iso: string; semana: number; topProduto: string; topProdutoQtd: number; horaPico: number | null }
export interface HoraAnalise extends Bloco { hora: number }
export interface SemanaAnalise extends Bloco { semana: number; dias: number }
export interface ProdutoAnalise extends Bloco { sku: string; nome: string; custo: number; margem: number }
export interface FaixaAnalise extends Bloco { nome: string; de: number; ate: number }

export interface ResultadoAnalise {
  total: Bloco;
  semData: number;                 // itens sem data reconhecida
  comHorario: number;              // itens com horário reconhecido
  dias: DiaAnalise[];              // em ordem de data
  horas: HoraAnalise[];            // 24 posições
  faixas: FaixaAnalise[];
  semana: SemanaAnalise[];         // 7 posições (domingo..sábado)
  produtos: ProdutoAnalise[];      // por quantidade vendida
  melhorDia: DiaAnalise | null;
  melhorHora: HoraAnalise | null;
  melhorSemana: SemanaAnalise | null;
  maisVendido: ProdutoAnalise | null;
  maiorFaturamento: ProdutoAnalise | null;
  maiorLiquidez: ProdutoAnalise | null;
  prejuizo: ProdutoAnalise[];      // produtos com liquidez negativa
  mediaVendaPorDia: number;
  mediaItensPorDia: number;
}

const FAIXAS: [string, number, number][] = [["Madrugada (0h–5h)", 0, 5], ["Manhã (6h–11h)", 6, 11], ["Tarde (12h–17h)", 12, 17], ["Noite (18h–23h)", 18, 23]];

export function analisarLives(itens: ItemAnalise[]): ResultadoAnalise {
  const total = vazio();
  const porDia = new Map<string, { b: Bloco; prod: Map<string, { nome: string; qtd: number }>; horas: number[] }>();
  const horas: HoraAnalise[] = Array.from({ length: 24 }, (_, h) => ({ hora: h, ...vazio() }));
  const semana: SemanaAnalise[] = Array.from({ length: 7 }, (_, s) => ({ semana: s, dias: 0, ...vazio() }));
  const diasPorSemana: Set<string>[] = Array.from({ length: 7 }, () => new Set());
  const porProduto = new Map<string, ProdutoAnalise>();
  let semData = 0, comHorario = 0;

  for (const it of itens) {
    somar(total, it);
    const chave = it.sku || it.nome;
    let p = porProduto.get(chave);
    if (!p) { p = { sku: it.sku, nome: it.nome, custo: 0, margem: 0, ...vazio() }; porProduto.set(chave, p); }
    somar(p, it); p.custo += it.custo;

    if (!it.dataIso) { semData++; continue; }
    let d = porDia.get(it.dataIso);
    if (!d) { d = { b: vazio(), prod: new Map(), horas: new Array(24).fill(0) }; porDia.set(it.dataIso, d); }
    somar(d.b, it);
    const pd = d.prod.get(chave) || { nome: it.nome, qtd: 0 };
    pd.qtd += 1; d.prod.set(chave, pd);

    const sem = diaDaSemana(it.dataIso);
    somar(semana[sem], it); diasPorSemana[sem].add(it.dataIso);

    if (it.hora !== null) {
      comHorario++;
      somar(horas[it.hora], it);
      d.horas[it.hora] += 1;
    }
  }
  semana.forEach((s, i) => { s.dias = diasPorSemana[i].size; });

  const dias: DiaAnalise[] = Array.from(porDia.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([iso, d]) => {
    let top = { nome: "—", qtd: 0 };
    d.prod.forEach((v) => { if (v.qtd > top.qtd) top = v; });
    const max = Math.max(...d.horas);
    return { iso, semana: diaDaSemana(iso), ...d.b, topProduto: top.nome, topProdutoQtd: top.qtd, horaPico: max > 0 ? d.horas.indexOf(max) : null };
  });

  const faixas: FaixaAnalise[] = FAIXAS.map(([nome, de, ate]) => {
    const f: FaixaAnalise = { nome, de, ate, ...vazio() };
    for (let h = de; h <= ate; h++) { f.itens += horas[h].itens; f.venda += horas[h].venda; f.tarifas += horas[h].tarifas; f.rebate += horas[h].rebate; f.repasse += horas[h].repasse; f.liquidez += horas[h].liquidez; }
    return f;
  });

  const produtos = Array.from(porProduto.values()).map((p) => ({ ...p, margem: p.venda > 0 ? (p.liquidez / p.venda) * 100 : 0 }))
    .sort((a, b) => b.itens - a.itens || b.venda - a.venda);

  const melhor = <T extends Bloco>(lista: T[], por: (x: T) => number): T | null => {
    let m: T | null = null;
    for (const x of lista) if (x.itens > 0 && (m === null || por(x) > por(m))) m = x;
    return m;
  };

  return {
    total, semData, comHorario, dias, horas, faixas, semana, produtos,
    melhorDia: melhor(dias, (d) => d.venda),
    melhorHora: melhor(horas, (h) => h.venda),
    melhorSemana: melhor(semana, (s) => (s.dias > 0 ? s.venda / s.dias : 0)),
    maisVendido: produtos[0] || null,
    maiorFaturamento: melhor(produtos, (p) => p.venda),
    maiorLiquidez: melhor(produtos, (p) => p.liquidez),
    prejuizo: produtos.filter((p) => p.liquidez < 0).sort((a, b) => a.liquidez - b.liquidez),
    mediaVendaPorDia: dias.length ? total.venda / dias.length : 0,
    mediaItensPorDia: dias.length ? total.itens / dias.length : 0,
  };
}
