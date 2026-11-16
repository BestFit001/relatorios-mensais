// Adsense do Mercado Livre: leitura das duas planilhas do ML e o cruzamento entre elas.
//  1) "Relatório Anúncios patrocinados" (aba de mesmo nome): MLB patrocinado + investimento. Só entra o que investiu mais de R$ 0,00.
//  2) "Relatório de vendas" (aba de mesmo nome): por MLB patrocinado, quais MLBs foram vendidos por causa dele (o próprio = venda direta;
//     outro = venda indireta, o "efeito halo") com unidades e receita.
// A liquidez de cada anúncio usa a mesma lógica de margem do ML no app (custo do SKU, comissão do MLB, frete, 8% de imposto, embalagem)
// menos o investimento. O SKU de cada MLB vem do cadastro de anúncios (ml_anuncios_regras): vale o primeiro SKU ligado ao MLB que tenha custo.
// Tabela de frete do ML (mesma usada nos lançamentos do app, vai até 30 kg).
const matrizFretes = [
  { atePeso: 0.3, faixas: { "78.99": 8.15, "99.99": 12.95, "119.99": 14.95, "149.99": 16.95, "199.99": 19.05, "200": 21.65 } },
  { atePeso: 0.5, faixas: { "78.99": 8.25, "99.99": 13.85, "119.99": 16.15, "149.99": 18.15, "199.99": 20.45, "200": 23.25 } },
  { atePeso: 1.0, faixas: { "78.99": 8.45, "99.99": 14.45, "119.99": 16.85, "149.99": 19.05, "199.99": 21.35, "200": 24.45 } },
  { atePeso: 1.5, faixas: { "78.99": 8.65, "99.99": 14.75, "119.99": 17.15, "149.99": 19.45, "199.99": 21.75, "200": 25.45 } },
  { atePeso: 2.0, faixas: { "78.99": 8.75, "99.99": 15.05, "119.99": 17.65, "149.99": 19.85, "199.99": 22.25, "200": 25.55 } },
  { atePeso: 3.0, faixas: { "78.99": 9.15, "99.99": 16.45, "119.99": 19.15, "149.99": 21.65, "199.99": 24.35, "200": 27.05 } },
  { atePeso: 4.0, faixas: { "78.99": 9.75, "99.99": 17.85, "119.99": 20.75, "149.99": 23.35, "199.99": 26.35, "200": 29.25 } },
  { atePeso: 5.0, faixas: { "78.99": 10.25, "99.99": 19.75, "119.99": 22.85, "149.99": 26.05, "199.99": 29.25, "200": 32.45 } },
  { atePeso: 6.0, faixas: { "78.99": 10.35, "99.99": 25.95, "119.99": 29.15, "149.99": 33.35, "199.99": 36.45, "200": 40.85 } },
  { atePeso: 7.0, faixas: { "78.99": 10.45, "99.99": 27.55, "119.99": 31.65, "149.99": 36.75, "199.99": 40.85, "200": 45.25 } },
  { atePeso: 9.0, faixas: { "78.99": 10.75, "99.99": 29.45, "119.99": 34.25, "149.99": 39.85, "199.99": 44.45, "200": 49.35 } },
  { atePeso: 13.0, faixas: { "78.99": 11.25, "99.99": 33.65, "119.99": 39.25, "149.99": 45.85, "199.99": 51.35, "200": 57.15 } },
  { atePeso: 17.0, faixas: { "78.99": 11.75, "99.99": 37.85, "119.99": 44.25, "149.99": 51.85, "199.99": 58.25, "200": 64.95 } },
  { atePeso: 23.0, faixas: { "78.99": 12.45, "99.99": 44.15, "119.99": 51.85, "149.99": 60.85, "199.99": 68.55, "200": 76.65 } },
  { atePeso: 30.0, faixas: { "78.99": 13.25, "99.99": 51.15, "119.99": 60.15, "149.99": 70.75, "199.99": 79.85, "200": 89.45 } },
];

export function calcularFreteML(pdv: number, pesoReal: number, altura: number, largura: number, comprimento: number): number {
  if (pdv < 79.00) return 0.00;
  const pesoVolumetrico = (altura * largura * comprimento) / 6000;
  const pesoConsiderado = Math.max(pesoReal, pesoVolumetrico);

  let linhaFrete = matrizFretes.find(m => pesoConsiderado <= m.atePeso);
  if (!linhaFrete) linhaFrete = matrizFretes[matrizFretes.length - 1];

  let valorFrete = 0;
  if (pdv < 79) valorFrete = linhaFrete.faixas["78.99"];
  else if (pdv < 100) valorFrete = linhaFrete.faixas["99.99"];
  else if (pdv < 120) valorFrete = linhaFrete.faixas["119.99"];
  else if (pdv < 150) valorFrete = linhaFrete.faixas["149.99"];
  else if (pdv < 200) valorFrete = linhaFrete.faixas["199.99"];
  else valorFrete = linhaFrete.faixas["200"];

  return valorFrete || 0;
}

export const IMPOSTO_ML = 0.08;       // mesma taxa usada nos lançamentos do ML
export const EMBALAGEM_ML_UN = 0.7;   // R$ por unidade, idem

// ---------- leitura das planilhas ----------
export type AnuncioPat = {
  mlb: string; titulo: string; campanha: string; status: string;
  impressoes: number; cliques: number; receita: number; investimento: number;
  vendasDir: number; vendasInd: number; recDir: number; recInd: number;
};
export type VendaPat = { pat: string; tituloPat: string; campanha: string; status: string; vend: string; tituloVend: string; un: number; rec: number };
export type Periodo = { ini: string | null; fim: string | null };   // ISO AAAA-MM-DD

const MESES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
/** "01-out-2026" -> "2026-10-01" (aceita também 01/10/2026 e AAAA-MM-DD). */
export function dataML(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  const s = String(v).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let m = s.match(/^(\d{1,2})[-\/\s]([a-z]{3})[a-z]*[-\/\s](\d{4})/);
  if (m && MESES[m[2]]) return `${m[3]}-${String(MESES[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
/** Número das planilhas do ML: "145.25" (ponto decimal) ou "1.234,56" (BR); "-" vira 0. */
export function numML(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/R\$/g, "").replace(/\s/g, "").replace(/%/g, "").trim();
  if (!s || s === "-") return 0;
  const n = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
const norm = (v: any) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const mlbDe = (v: any) => String(v ?? "").trim().toUpperCase();
/** Identifica a campanha pelo nome (sem acento/maiúscula). Sem nome na planilha = uma campanha só, "sem-campanha". */
export const chaveCampanha = (nome: any): string => norm(nome) || "sem-campanha";

function acharCabecalho(linhas: any[][], chave: string): number {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) if ((linhas[i] || []).some((c) => norm(c).startsWith(chave))) return i;
  return -1;
}
function colunas(cab: any[], mapa: Record<string, (t: string) => boolean>): Record<string, number> {
  const t = cab.map(norm); const out: Record<string, number> = {};
  for (const [k, f] of Object.entries(mapa)) out[k] = t.findIndex(f);
  return out;
}

export type LeituraPads = { anuncios: AnuncioPat[]; periodo: Periodo; totalLinhas: number; semInvestimento: number; erro?: string };
export function lerRelatorioPatrocinados(linhas: any[][]): LeituraPads {
  const h = acharCabecalho(linhas, "desde");
  const vazio: LeituraPads = { anuncios: [], periodo: { ini: null, fim: null }, totalLinhas: 0, semInvestimento: 0 };
  if (h < 0) return { ...vazio, erro: "Não achei o cabeçalho (Desde, Até, Campanha...). Confira se é a aba “Relatório Anúncios patrocinados”." };
  const c = colunas(linhas[h], {
    ini: (t) => t === "desde", fim: (t) => t === "ate", camp: (t) => t === "campanha", tit: (t) => t.startsWith("titulo do anuncio"),
    mlb: (t) => t.startsWith("codigo do anuncio"), st: (t) => t === "status", imp: (t) => t.startsWith("impressoes"), cli: (t) => t.startsWith("cliques"),
    rec: (t) => t.startsWith("receita (moeda") || t === "receita", inv: (t) => t.startsWith("investimento"),
    dir: (t) => t === "vendas diretas", ind: (t) => t === "vendas indiretas", recDir: (t) => t.startsWith("receita por vendas diretas"), recInd: (t) => t.startsWith("receita por vendas indiretas"),
  });
  if (c.mlb < 0 || c.inv < 0) return { ...vazio, erro: "Faltam as colunas “Código do anúncio” e/ou “Investimento”. Confira se é a aba “Relatório Anúncios patrocinados”." };
  const g = (l: any[], i: number) => (i >= 0 ? l[i] : "");
  const mapa = new Map<string, AnuncioPat>();
  let total = 0, sem = 0; let ini: string | null = null, fim: string | null = null;
  for (const l of linhas.slice(h + 1)) {
    const mlb = mlbDe(g(l, c.mlb));
    if (!/^MLB\d+/.test(mlb)) continue;
    total++;
    ini = ini || dataML(g(l, c.ini)); fim = fim || dataML(g(l, c.fim));
    const inv = numML(g(l, c.inv));
    if (!(inv > 0)) { sem++; continue; }
    const a = mapa.get(mlb) || { mlb, titulo: String(g(l, c.tit) ?? "").trim(), campanha: String(g(l, c.camp) ?? "").trim(), status: String(g(l, c.st) ?? "").trim(), impressoes: 0, cliques: 0, receita: 0, investimento: 0, vendasDir: 0, vendasInd: 0, recDir: 0, recInd: 0 };
    a.impressoes += numML(g(l, c.imp)); a.cliques += numML(g(l, c.cli)); a.receita += numML(g(l, c.rec)); a.investimento += inv;
    a.vendasDir += numML(g(l, c.dir)); a.vendasInd += numML(g(l, c.ind)); a.recDir += numML(g(l, c.recDir)); a.recInd += numML(g(l, c.recInd));
    mapa.set(mlb, a);
  }
  return { anuncios: Array.from(mapa.values()), periodo: { ini, fim }, totalLinhas: total, semInvestimento: sem };
}

export type LeituraVendas = { vendas: VendaPat[]; periodo: Periodo; erro?: string };
export function lerRelatorioVendas(linhas: any[][]): LeituraVendas {
  const h = acharCabecalho(linhas, "desde");
  const vazio: LeituraVendas = { vendas: [], periodo: { ini: null, fim: null } };
  if (h < 0) return { ...vazio, erro: "Não achei o cabeçalho (Desde, Até, Campanha...). Confira se é a aba “Relatório de vendas”." };
  const c = colunas(linhas[h], {
    ini: (t) => t === "desde", fim: (t) => t === "ate", camp: (t) => t === "campanha", titPat: (t) => t.startsWith("titulo do anuncio patrocinado"),
    pat: (t) => t.startsWith("numero do anuncio patrocinado"), st: (t) => t.startsWith("status do anuncio"), titVend: (t) => t.startsWith("titulo do anuncio vendido"),
    vend: (t) => t.startsWith("numero do anuncio vendido"), un: (t) => t.startsWith("vendas por"), rec: (t) => t === "receita",
  });
  if (c.pat < 0 || c.vend < 0) return { ...vazio, erro: "Faltam as colunas “Número do anúncio patrocinado” e/ou “Número do anúncio vendido”. Confira se é a aba “Relatório de vendas”." };
  const g = (l: any[], i: number) => (i >= 0 ? l[i] : "");
  const mapa = new Map<string, VendaPat>();
  let ini: string | null = null, fim: string | null = null;
  for (const l of linhas.slice(h + 1)) {
    const pat = mlbDe(g(l, c.pat)), vend = mlbDe(g(l, c.vend));
    if (!/^MLB\d+/.test(pat) || !/^MLB\d+/.test(vend)) continue;
    ini = ini || dataML(g(l, c.ini)); fim = fim || dataML(g(l, c.fim));
    const k = `${pat}|${vend}`;
    const v = mapa.get(k) || { pat, tituloPat: String(g(l, c.titPat) ?? "").trim(), campanha: String(g(l, c.camp) ?? "").trim(), status: String(g(l, c.st) ?? "").trim(), vend, tituloVend: String(g(l, c.titVend) ?? "").trim(), un: 0, rec: 0 };
    v.un += numML(g(l, c.un)); v.rec += numML(g(l, c.rec));
    mapa.set(k, v);
  }
  return { vendas: Array.from(mapa.values()), periodo: { ini, fim } };
}

/** Mês de competência ("MM/AAAA") do período da planilha (mês do "Desde"). */
export const mesDoPeriodo = (p: Periodo): string | null => { const d = p.ini || p.fim; return d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : null; };

// ---------- cálculo ----------
export type RegraMlb = { mlb: string; sku: string; comissao: number; peso_real: number; altura: number; largura: number; comprimento: number };
export type CfgRecomendacao = { invMinimo: number; roiEscalar: number };   // R$ mínimo para julgar o anúncio; ROI (%) a partir do qual vale escalar
export const CFG_ML_PADRAO: CfgRecomendacao = { invMinimo: 10, roiEscalar: 300 };
export const mesclarCfgML = (j: any): CfgRecomendacao => ({
  invMinimo: Number.isFinite(Number(j?.invMinimo)) && Number(j?.invMinimo) >= 0 ? Number(j.invMinimo) : CFG_ML_PADRAO.invMinimo,
  roiEscalar: Number.isFinite(Number(j?.roiEscalar)) && Number(j?.roiEscalar) > 0 ? Number(j.roiEscalar) : CFG_ML_PADRAO.roiEscalar,
});

const normSku = (valor: any): string => {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/^["']|["']$/g, "").trim().toLowerCase();
};
export type Contexto = { regras: Map<string, RegraMlb[]>; custos: Map<string, { custo: number; produto: string }> };
export function montarContexto(regrasBanco: any[], custosBanco: any[]): Contexto {
  const regras = new Map<string, RegraMlb[]>();
  for (const r of regrasBanco || []) {
    const mlb = mlbDe(r.mlb); if (!mlb) continue;
    const x: RegraMlb = { mlb, sku: String(r.sku ?? "").trim(), comissao: Number(r.comissao || 0), peso_real: Number(r.peso_real || 0), altura: Number(r.altura || 0), largura: Number(r.largura || 0), comprimento: Number(r.comprimento || 0) };
    regras.set(mlb, [...(regras.get(mlb) || []), x]);
  }
  const custos = new Map<string, { custo: number; produto: string }>();
  for (const c of custosBanco || []) { const k = normSku(c.sku); if (k) custos.set(k, { custo: Number(c.custo_unitario || 0), produto: String(c.produto || "") }); }
  return { regras, custos };
}

export type Resolvido = { mlb: string; sku: string; produto: string; custoUn: number; semCadastro: boolean; semCusto: boolean; regra: RegraMlb | null };
/** MLB -> primeiro SKU ligado a ele que tenha custo (se nenhum tem, usa o primeiro e marca "sem custo"). */
export function resolverMlb(mlb: string, ctx: Contexto): Resolvido {
  const lista = ctx.regras.get(mlbDe(mlb)) || [];
  if (lista.length === 0) return { mlb, sku: "", produto: "", custoUn: 0, semCadastro: true, semCusto: true, regra: null };
  const comCusto = lista.find((r) => (ctx.custos.get(normSku(r.sku))?.custo || 0) > 0);
  const r = comCusto || lista[0];
  const c = ctx.custos.get(normSku(r.sku));
  return { mlb, sku: r.sku, produto: c?.produto || "", custoUn: c?.custo || 0, semCadastro: false, semCusto: !(c && c.custo > 0), regra: r };
}

export type Conta = { receita: number; custo: number; imposto: number; tarifa: number; embalagem: number; frete: number; lucroAntesAds: number };
const zero = (): Conta => ({ receita: 0, custo: 0, imposto: 0, tarifa: 0, embalagem: 0, frete: 0, lucroAntesAds: 0 });
/** Resultado de vender `un` unidades do MLB por `rec` reais (antes de tirar o investimento do anúncio). */
export function contaDaVenda(rec: number, un: number, r: Resolvido): Conta {
  const preco = un > 0 ? rec / un : 0;
  const comissao = r.regra ? r.regra.comissao : 14;
  const frete = r.regra ? calcularFreteML(preco, r.regra.peso_real, r.regra.altura, r.regra.largura, r.regra.comprimento) * un : calcularFreteML(preco, 2, 10, 10, 10) * un;
  const c: Conta = { receita: rec, custo: r.custoUn * un, imposto: rec * IMPOSTO_ML, tarifa: rec * (comissao / 100), embalagem: EMBALAGEM_ML_UN * un, frete, lucroAntesAds: 0 };
  c.lucroAntesAds = c.receita - c.custo - c.imposto - c.tarifa - c.embalagem - c.frete;
  return c;
}
const somarConta = (a: Conta, b: Conta): Conta => ({ receita: a.receita + b.receita, custo: a.custo + b.custo, imposto: a.imposto + b.imposto, tarifa: a.tarifa + b.tarifa, embalagem: a.embalagem + b.embalagem, frete: a.frete + b.frete, lucroAntesAds: a.lucroAntesAds + b.lucroAntesAds });

export type Acao = "escalar" | "manter" | "revisar" | "retirar" | "reativar" | "aguardar";
export type ItemVendido = { mlb: string; titulo: string; direta: boolean; un: number; rec: number; sku: string; custoUn: number; semCusto: boolean; semCadastro: boolean; patrocinado: boolean; conta: Conta };
export type AnaliseAnuncio = AnuncioPat & {
  unidades: number; receitaTotal: number;           // atribuídas ao anúncio (diretas + indiretas)
  roas: number; acos: number | null; roi: number | null; margemPct: number | null;   // roi = liquidez ÷ investimento (em %)
  conta: Conta; liquidez: number; liquidezDireta: number; liquidezIndireta: number;
  itens: ItemVendido[]; semVendas: boolean; semCruzamento: boolean;
  semCusto: boolean; acao: Acao; motivo: string;
};

export function recomendar(a: { status: string; investimento: number; receitaTotal: number; liquidez: number; roi: number | null; roas: number; unidades: number }, cfg: CfgRecomendacao): { acao: Acao; motivo: string } {
  const R = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ativo = norm(a.status) === "ativo";
  if (a.receitaTotal <= 0) {
    return a.investimento < cfg.invMinimo
      ? { acao: "aguardar", motivo: `Gastou só ${R(a.investimento)} e ainda não vendeu: pouco dado para decidir.` }
      : { acao: "retirar", motivo: `Gastou ${R(a.investimento)} sem nenhuma venda${ativo ? "" : ` (anúncio ${norm(a.status)}: não reative)`}.` };
  }
  if (a.liquidez < 0) {
    const roi = a.roi ?? 0;
    if (a.investimento < cfg.invMinimo) return { acao: "aguardar", motivo: `Liquidez de ${R(a.liquidez)}, mas com só ${R(a.investimento)} investidos: aguarde mais dados.` };
    return roi <= -50
      ? { acao: "retirar", motivo: `Perde ${R(-a.liquidez)} depois de custo, taxas e anúncio (ROI ${roi.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%).` }
      : { acao: "revisar", motivo: `Quase empata (${R(a.liquidez)}): ajuste lance, preço ou orçamento antes de decidir.` };
  }
  if (!ativo) return { acao: "reativar", motivo: `Deu ${R(a.liquidez)} de liquidez e hoje está ${norm(a.status)}: vale reativar.` };
  if ((a.roi ?? 0) >= cfg.roiEscalar) return { acao: "escalar", motivo: `ROI de ${(a.roi ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%: pode aumentar o investimento.` };
  return { acao: "manter", motivo: `Liquidez positiva de ${R(a.liquidez)} (ROI ${(a.roi ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%).` };
}

export type Halo = { mlb: string; titulo: string; un: number; rec: number; sku: string; semCusto: boolean; semCadastro: boolean; conta: Conta; patrocinadores: { mlb: string; titulo: string; un: number; rec: number }[] };
export type AnaliseML = {
  anuncios: AnaliseAnuncio[]; halo: Halo[];
  tot: { investimento: number; receita: number; receitaDir: number; receitaInd: number; unidades: number; liquidez: number; roas: number; roi: number | null; acos: number | null; semCusto: number; semCadastro: number; semVendaMlb: number };
  haloTot: { un: number; rec: number; lucroAntesAds: number; mlbs: number };
  porAcao: Record<Acao, { n: number; investimento: number; liquidez: number }>;
  semCruzamento: boolean;       // nenhuma campanha tem planilha de vendas: usa as colunas da planilha de patrocinados
  campanhasSemVendas: string[]; // campanhas (nomes) cujos anúncios ainda não foram cruzados, quando outras já foram
};

// Totais de qualquer conjunto de anúncios (todas as campanhas = "Geral", ou uma campanha só).
export function totaisAnuncios(lista: AnaliseAnuncio[]): AnaliseML["tot"] {
  const tot = lista.reduce((t, a) => ({
    investimento: t.investimento + a.investimento, receita: t.receita + a.receitaTotal,
    receitaDir: t.receitaDir + a.itens.filter((i) => i.direta).reduce((s, i) => s + i.rec, 0), receitaInd: t.receitaInd + a.itens.filter((i) => !i.direta).reduce((s, i) => s + i.rec, 0),
    unidades: t.unidades + a.unidades, liquidez: t.liquidez + a.liquidez, roas: 0, roi: null as number | null, acos: null as number | null,
    semCusto: t.semCusto + (a.semCusto ? 1 : 0), semCadastro: t.semCadastro + (a.itens.some((i) => i.semCadastro) ? 1 : 0), semVendaMlb: 0,
  }), { investimento: 0, receita: 0, receitaDir: 0, receitaInd: 0, unidades: 0, liquidez: 0, roas: 0, roi: null as number | null, acos: null as number | null, semCusto: 0, semCadastro: 0, semVendaMlb: 0 });
  tot.roas = tot.investimento > 0 ? tot.receita / tot.investimento : 0;
  tot.roi = tot.investimento > 0 ? (tot.liquidez / tot.investimento) * 100 : null;
  tot.acos = tot.receita > 0 ? (tot.investimento / tot.receita) * 100 : null;
  tot.semVendaMlb = lista.filter((a) => a.semVendas).length;
  return tot;
}

export function analisarML(anuncios: AnuncioPat[], vendas: VendaPat[] | null, ctx: Contexto, cfg: CfgRecomendacao): AnaliseML {
  const patrocinados = new Set(anuncios.map((a) => a.mlb));
  // Cada campanha tem a sua planilha de vendas: um anúncio só é cruzado se a campanha dele já tem vendas enviadas (as outras usam as colunas da planilha de patrocinados)
  const chavesVendas = new Set((vendas || []).map((v) => chaveCampanha(v.campanha)));
  const patsVendas = new Set((vendas || []).map((v) => v.pat));
  const nomesBatem = anuncios.some((a) => chavesVendas.has(chaveCampanha(a.campanha)));   // se os nomes não batem em nenhum, vale a planilha de vendas para todos
  const coberto = (a: AnuncioPat) => !!vendas && vendas.length > 0 && (chavesVendas.has(chaveCampanha(a.campanha)) || patsVendas.has(a.mlb) || !nomesBatem);
  const temVendas = !!vendas;
  const porPat = new Map<string, VendaPat[]>();
  for (const v of vendas || []) porPat.set(v.pat, [...(porPat.get(v.pat) || []), v]);
  const haloMap = new Map<string, Halo>();

  const lista: AnaliseAnuncio[] = anuncios.map((a) => {
    // sem a planilha de vendas: aproveita o que a de patrocinados já traz (direta e indireta pelo custo do próprio anúncio)
    const comVendas = temVendas && coberto(a);
    const linhas: { vend: string; titulo: string; un: number; rec: number }[] = comVendas
      ? (porPat.get(a.mlb) || []).map((v) => ({ vend: v.vend, titulo: v.tituloVend, un: v.un, rec: v.rec }))
      : [{ vend: a.mlb, titulo: a.titulo, un: a.vendasDir + a.vendasInd, rec: a.recDir + a.recInd || a.receita }].filter((l) => l.un > 0 || l.rec > 0);
    const itens: ItemVendido[] = linhas.map((l) => {
      const r = resolverMlb(l.vend, ctx);
      const direta = l.vend === a.mlb;
      const conta = contaDaVenda(l.rec, l.un, r);
      const patr = patrocinados.has(l.vend);
      if (comVendas && !direta && !patr) {
        const h = haloMap.get(l.vend) || { mlb: l.vend, titulo: l.titulo, un: 0, rec: 0, sku: r.sku, semCusto: r.semCusto, semCadastro: r.semCadastro, conta: zero(), patrocinadores: [] };
        h.un += l.un; h.rec += l.rec; h.conta = somarConta(h.conta, conta);
        h.patrocinadores.push({ mlb: a.mlb, titulo: a.titulo, un: l.un, rec: l.rec });
        haloMap.set(l.vend, h);
      }
      return { mlb: l.vend, titulo: l.titulo, direta, un: l.un, rec: l.rec, sku: r.sku, custoUn: r.custoUn, semCusto: r.semCusto, semCadastro: r.semCadastro, patrocinado: patr, conta };
    });
    const conta = itens.reduce((t, i) => somarConta(t, i.conta), zero());
    const unidades = itens.reduce((t, i) => t + i.un, 0);
    const receitaTotal = conta.receita;
    const liquidez = conta.lucroAntesAds - a.investimento;
    const liqDir = itens.filter((i) => i.direta).reduce((t, i) => t + i.conta.lucroAntesAds, 0) - a.investimento;
    const liqInd = itens.filter((i) => !i.direta).reduce((t, i) => t + i.conta.lucroAntesAds, 0);
    const roi = a.investimento > 0 ? (liquidez / a.investimento) * 100 : null;
    const roas = a.investimento > 0 ? receitaTotal / a.investimento : 0;
    const rec = recomendar({ status: a.status, investimento: a.investimento, receitaTotal, liquidez, roi, roas, unidades }, cfg);
    return {
      ...a, unidades, receitaTotal, roas, acos: receitaTotal > 0 ? (a.investimento / receitaTotal) * 100 : null, roi, margemPct: receitaTotal > 0 ? (liquidez / receitaTotal) * 100 : null,
      conta, liquidez, liquidezDireta: liqDir, liquidezIndireta: liqInd, itens, semVendas: itens.length === 0, semCruzamento: !comVendas,
      semCusto: itens.some((i) => i.semCusto), acao: rec.acao, motivo: rec.motivo,
    };
  }).sort((x, y) => y.liquidez - x.liquidez);

  const tot = totaisAnuncios(lista);

  const porAcao = { escalar: { n: 0, investimento: 0, liquidez: 0 }, manter: { n: 0, investimento: 0, liquidez: 0 }, revisar: { n: 0, investimento: 0, liquidez: 0 }, retirar: { n: 0, investimento: 0, liquidez: 0 }, reativar: { n: 0, investimento: 0, liquidez: 0 }, aguardar: { n: 0, investimento: 0, liquidez: 0 } } as AnaliseML["porAcao"];
  lista.forEach((a) => { const p = porAcao[a.acao]; p.n++; p.investimento += a.investimento; p.liquidez += a.liquidez; });
  const halo = Array.from(haloMap.values()).sort((x, y) => y.conta.lucroAntesAds - x.conta.lucroAntesAds);
  return {
    anuncios: lista, halo, tot, porAcao, semCruzamento: lista.length > 0 && lista.every((a) => a.semCruzamento),
    campanhasSemVendas: lista.some((a) => !a.semCruzamento) ? Array.from(new Set(lista.filter((a) => a.semCruzamento).map((a) => a.campanha || "Sem nome"))) : [],
    haloTot: { un: halo.reduce((t, h) => t + h.un, 0), rec: halo.reduce((t, h) => t + h.rec, 0), lucroAntesAds: halo.reduce((t, h) => t + h.conta.lucroAntesAds, 0), mlbs: halo.length },
  };
}

// ---------- resumo guardado para o "Atual vs anterior" ----------
// O anterior é guardado POR CAMPANHA (uma "peça" por campanha): reenviar a campanha troca só a peça dela; as outras ficam como estão.
export type ResumoAnuncio = { mlb: string; t: string; inv: number; rec: number; liq: number; un: number; acao: Acao; c?: string };   // c = chave da campanha
export type PecaResumo = { chave: string; nome: string; mes: string; arquivo: string; importadoEm: string; periodo: Periodo; comVendas: boolean; haloUn: number; haloRec: number };
export type ResumoML = {
  mes: string; arquivo: string; importadoEm: string; periodo: Periodo; comVendas: boolean;
  tot: { inv: number; rec: number; liq: number; roi: number | null; roas: number; un: number; haloUn: number; haloRec: number };
  anuncios: ResumoAnuncio[];
  pecas?: PecaResumo[];            // ausente nos resumos antigos (um só bloco)
};
const r2 = (n: number) => Number((n || 0).toFixed(2));
export const CHAVE_LEGADO = "__antigo";

/** Resumo de UMA campanha (a análise precisa ter sido feita só com os anúncios e vendas dela). */
export function resumirCampanha(a: AnaliseML, meta: { chave: string; nome: string; mes: string; arquivo: string; importadoEm: string; periodo: Periodo }): { peca: PecaResumo; anuncios: ResumoAnuncio[] } {
  return {
    peca: { ...meta, comVendas: !a.semCruzamento, haloUn: a.haloTot.un, haloRec: r2(a.haloTot.rec) },
    anuncios: a.anuncios.map((x) => ({ mlb: x.mlb, t: x.titulo, inv: r2(x.investimento), rec: r2(x.receitaTotal), liq: r2(x.liquidez), un: x.unidades, acao: x.acao, c: meta.chave })),
  };
}

/** Peças de um resumo (os antigos viram uma peça só). */
export function pecasDoResumo(r: ResumoML | null): PecaResumo[] {
  if (!r) return [];
  if (r.pecas && r.pecas.length) return r.pecas;
  return [{ chave: CHAVE_LEGADO, nome: "Relatório anterior", mes: r.mes, arquivo: r.arquivo, importadoEm: r.importadoEm, periodo: r.periodo, comVendas: r.comVendas, haloUn: r.tot.haloUn, haloRec: r.tot.haloRec }];
}

/** Junta as peças novas ao anterior que já existe: a peça da mesma campanha é trocada, as demais ficam. */
export function mesclarAnterior(atual: ResumoML | null, novas: { peca: PecaResumo; anuncios: ResumoAnuncio[] }[]): ResumoML | null {
  const chavesNovas = new Set(novas.map((n) => n.peca.chave));
  const mantidas = pecasDoResumo(atual).filter((p) => !chavesNovas.has(p.chave));
  const anunciosMantidos = (atual?.anuncios || []).filter((x) => !chavesNovas.has(x.c || CHAVE_LEGADO) && mantidas.some((p) => p.chave === (x.c || CHAVE_LEGADO)));
  const pecas = [...mantidas, ...novas.map((n) => n.peca)];
  const anuncios = [...anunciosMantidos, ...novas.flatMap((n) => n.anuncios)];
  if (!pecas.length) return null;
  return construirResumo(pecas, anuncios);
}
/** Tira uma campanha do anterior. */
export function removerDoAnterior(atual: ResumoML | null, chave: string): ResumoML | null {
  if (!atual) return null;
  const pecas = pecasDoResumo(atual).filter((p) => p.chave !== chave);
  if (!pecas.length) return null;
  return construirResumo(pecas, atual.anuncios.filter((x) => (x.c || CHAVE_LEGADO) !== chave));
}
function construirResumo(pecas: PecaResumo[], anuncios: ResumoAnuncio[]): ResumoML {
  const inv = anuncios.reduce((t, x) => t + x.inv, 0), rec = anuncios.reduce((t, x) => t + x.rec, 0), liq = anuncios.reduce((t, x) => t + x.liq, 0);
  const recente = [...pecas].sort((a, b) => String(b.importadoEm).localeCompare(String(a.importadoEm)))[0];
  const inis = pecas.map((p) => p.periodo.ini).filter(Boolean) as string[], fins = pecas.map((p) => p.periodo.fim).filter(Boolean) as string[];
  return {
    mes: recente.mes, arquivo: pecas.length > 1 ? `${pecas.length} campanhas` : recente.arquivo, importadoEm: recente.importadoEm,
    periodo: { ini: inis.length ? inis.sort()[0] : null, fim: fins.length ? fins.sort().reverse()[0] : null }, comVendas: pecas.every((p) => p.comVendas),
    tot: { inv: r2(inv), rec: r2(rec), liq: r2(liq), roi: inv > 0 ? Number(((liq / inv) * 100).toFixed(2)) : null, roas: inv > 0 ? Number((rec / inv).toFixed(4)) : 0, un: anuncios.reduce((t, x) => t + x.un, 0), haloUn: pecas.reduce((t, p) => t + p.haloUn, 0), haloRec: r2(pecas.reduce((t, p) => t + p.haloRec, 0)) },
    anuncios, pecas,
  };
}
