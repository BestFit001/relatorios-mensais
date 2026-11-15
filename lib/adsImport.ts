// Importação das planilhas de Ads por canal (cada canal tem a sua própria configuração; o TikTok Shop já vem com o padrão preenchido).
//  - Planilha da CAMPANHA: uma linha por produto, com investimento (custo), pedidos, receita e ROI.
//  - Planilha dos ANÚNCIOS (modelo "Sales information" do TikTok): liga o ID do produto/SKU do TikTok ao SKU do vendedor (nosso).
// As colunas de cada planilha ficam configuradas na sub-aba Configurações de cada canal: cada campo aceita a LETRA da coluna (ex.: G)
// ou o NOME do cabeçalho (ex.: "Receita bruta"). A partir do SKU do vendedor o app busca o custo e calcula a margem líquida.
import { obterRegraCanal, type RegraTarifacao } from "./tarifacao";

export type CfgCampanha = {
  aba: string;             // nome da aba ("" = a primeira)
  produto: string;         // nome do produto/anúncio
  idProduto: string;       // ID do produto no TikTok
  idSku: string;           // (opcional) ID do SKU no TikTok, quando a planilha já vem por SKU
  campanhaId: string;
  campanhaNome: string;
  investimento: string;    // custo do anúncio
  custoAfiliado: string;   // (opcional) custo de afiliados
  pedidos: string;         // pedidos (ou unidades) vendidos pelo anúncio
  receita: string;         // receita bruta atribuída ao anúncio
  roi: string;             // (opcional) ROI da própria plataforma
  pdv: string;             // (opcional) preço de venda; sem ele usa receita ÷ pedidos
};
export type CfgCatalogo = {
  aba: string;
  idProduto: string;       // ID do produto no TikTok
  idSku: string;           // ID do SKU no TikTok
  skuSeller: string;       // SKU do vendedor (o nosso)
  variacao: string;
  nome: string;
  preco: string;
};
export type CfgAdsCanal = {
  campanha: CfgCampanha;
  catalogo: CfgCatalogo;
  somarAfiliado: boolean;  // soma o custo de afiliados ao investimento no cálculo da margem
  impostoPct: number;      // % de imposto sobre a receita
  embalagemUn: number;     // R$ de embalagem por pedido
};

export const CFG_PADRAO_TIKTOK: CfgAdsCanal = {
  campanha: {
    aba: "", produto: "Nome do produto", idProduto: "ID do produto", idSku: "", campanhaId: "ID da campanha", campanhaNome: "Nome da campanha",
    investimento: "Custo", custoAfiliado: "Custo (afiliado)", pedidos: "Pedidos de SKU", receita: "Receita bruta", roi: "ROI", pdv: "",
  },
  catalogo: { aba: "Template", idProduto: "A", idSku: "D", skuSeller: "G", variacao: "E", nome: "C", preco: "F" },
  somarAfiliado: true,
  impostoPct: 8,
  embalagemUn: 0.7,
};

/** Canal sem padrão conhecido: colunas em branco (o usuário informa em Configurações), parâmetros de cálculo iguais aos do TikTok. */
export const CFG_PADRAO_EM_BRANCO: CfgAdsCanal = {
  campanha: { aba: "", produto: "", idProduto: "", idSku: "", campanhaId: "", campanhaNome: "", investimento: "", custoAfiliado: "", pedidos: "", receita: "", roi: "", pdv: "" },
  catalogo: { aba: "", idProduto: "", idSku: "", skuSeller: "", variacao: "", nome: "", preco: "" },
  somarAfiliado: true,
  impostoPct: 8,
  embalagemUn: 0.7,
};
export const ehTikTok = (canal: string) => /tiktok/i.test(String(canal || ""));
/** Padrão de colunas de cada canal: o TikTok já vem preenchido, os demais começam em branco. */
export const padraoDoCanal = (canal: string): CfgAdsCanal => (ehTikTok(canal) ? CFG_PADRAO_TIKTOK : CFG_PADRAO_EM_BRANCO);

/** Junta a configuração salva com o padrão do canal (campos novos entram sozinhos). */
export function mesclarConfig(salva: any, padrao: CfgAdsCanal = CFG_PADRAO_TIKTOK): CfgAdsCanal {
  const p = padrao;
  const s = salva && typeof salva === "object" ? salva : {};
  return {
    campanha: { ...p.campanha, ...(s.campanha || {}) },
    catalogo: { ...p.catalogo, ...(s.catalogo || {}) },
    somarAfiliado: typeof s.somarAfiliado === "boolean" ? s.somarAfiliado : p.somarAfiliado,
    impostoPct: Number.isFinite(Number(s.impostoPct)) && s.impostoPct !== "" && s.impostoPct !== null && s.impostoPct !== undefined ? Number(s.impostoPct) : p.impostoPct,
    embalagemUn: Number.isFinite(Number(s.embalagemUn)) && s.embalagemUn !== "" && s.embalagemUn !== null && s.embalagemUn !== undefined ? Number(s.embalagemUn) : p.embalagemUn,
  };
}

// ---------- utilidades ----------
export const semAcento = (s: any) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** SKU comparável: sem espaços, ".0" de número do Excel e em minúsculas. */
export function normalizarSkuAds(valor: any): string {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim();
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return s.replace(/^["']|["']$/g, "").trim().toLowerCase();
}

/** Texto de um ID (que pode ter vindo como número no Excel). */
export function textoId(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(0) : "";
  return String(v).trim().replace(/\.0$/, "");
}
const ehId = (v: any) => /^\d{8,}$/.test(textoId(v));

export function numeroBR(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/R\$/g, "").replace(/\s/g, "").replace(/%/g, "").trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function letraParaIndice(letra: string): number {
  let idx = 0;
  for (const ch of letra.toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

/** Coluna pela LETRA (1 ou 2 letras, ex.: G, AB) ou pelo NOME do cabeçalho. -1 = não achou / não configurada. */
export function indiceDaColuna(ref: string, cabecalhos: string[]): number {
  const r = String(ref || "").trim();
  if (!r) return -1;
  if (/^[A-Za-z]{1,2}$/.test(r)) return letraParaIndice(r);
  const alvo = semAcento(r);
  const norm = cabecalhos.map(semAcento);
  const exato = norm.indexOf(alvo);
  if (exato >= 0) return exato;
  const parecidos = norm.map((h, i) => (h && (h.includes(alvo) || alvo.includes(h)) ? i : -1)).filter((i) => i >= 0);
  return parecidos.length === 1 ? parecidos[0] : -1;
}

/** Acha a linha de cabeçalhos: a primeira (entre as 15 primeiras) em que os nomes configurados aparecem. -1 = planilha só com letras. */
function linhaDeCabecalho(matriz: any[][], refs: string[]): number {
  const nomes = refs.map((r) => String(r || "").trim()).filter((r) => r && !/^[A-Za-z]{1,2}$/.test(r)).map(semAcento);
  if (nomes.length === 0) return -1;
  let melhor = -1, melhorAcertos = 0;
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const cels = (matriz[i] || []).map(semAcento);
    const acertos = nomes.filter((n) => cels.includes(n)).length;
    if (acertos > melhorAcertos) { melhorAcertos = acertos; melhor = i; }
  }
  return melhorAcertos > 0 ? melhor : -1;
}

// ---------- leitura das planilhas ----------
export type LinhaCampanha = {
  campanhaId: string; campanhaNome: string; produto: string; idProduto: string; idSku: string;
  investimento: number; custoAfiliado: number; pedidos: number; receita: number; roiPlanilha: number; pdv: number;
};
export type LeituraCampanha = { linhas: LinhaCampanha[]; erro: string | null; ignoradasSemMovimento: number };

export function lerCampanha(matriz: any[][], cfg: CfgCampanha): LeituraCampanha {
  const refs = Object.values({ ...cfg, aba: "" }).map(String);
  const hdrIdx = linhaDeCabecalho(matriz, refs);
  const cab = hdrIdx >= 0 ? (matriz[hdrIdx] || []).map((c: any) => String(c ?? "")) : [];
  const col = (ref: string) => indiceDaColuna(ref, cab);
  const c = {
    produto: col(cfg.produto), idProduto: col(cfg.idProduto), idSku: col(cfg.idSku), campanhaId: col(cfg.campanhaId), campanhaNome: col(cfg.campanhaNome),
    investimento: col(cfg.investimento), custoAfiliado: col(cfg.custoAfiliado), pedidos: col(cfg.pedidos), receita: col(cfg.receita), roi: col(cfg.roi), pdv: col(cfg.pdv),
  };
  const faltando: string[] = [];
  if (c.idProduto < 0 && c.idSku < 0) faltando.push("ID do produto (ou do SKU)");
  if (c.investimento < 0) faltando.push("investimento (custo)");
  if (c.pedidos < 0) faltando.push("pedidos");
  if (c.receita < 0) faltando.push("receita");
  if (faltando.length) return { linhas: [], ignoradasSemMovimento: 0, erro: `Não achei na planilha da campanha as colunas: ${faltando.join(", ")}. Confira os nomes/letras na sub-aba Configurações deste canal.` };

  const idCol = c.idProduto >= 0 ? c.idProduto : c.idSku;
  const linhas: LinhaCampanha[] = [];
  let ignoradas = 0;
  for (let i = hdrIdx + 1; i < matriz.length; i++) {
    const l = matriz[i] || [];
    if (!ehId(l[idCol])) continue;
    const reg: LinhaCampanha = {
      campanhaId: c.campanhaId >= 0 ? textoId(l[c.campanhaId]) : "", campanhaNome: c.campanhaNome >= 0 ? String(l[c.campanhaNome] ?? "").trim() : "",
      produto: c.produto >= 0 ? String(l[c.produto] ?? "").trim() : "", idProduto: c.idProduto >= 0 ? textoId(l[c.idProduto]) : "", idSku: c.idSku >= 0 ? textoId(l[c.idSku]) : "",
      investimento: numeroBR(l[c.investimento]), custoAfiliado: c.custoAfiliado >= 0 ? numeroBR(l[c.custoAfiliado]) : 0,
      pedidos: numeroBR(l[c.pedidos]), receita: numeroBR(l[c.receita]), roiPlanilha: c.roi >= 0 ? numeroBR(l[c.roi]) : 0, pdv: c.pdv >= 0 ? numeroBR(l[c.pdv]) : 0,
    };
    if (reg.investimento === 0 && reg.custoAfiliado === 0 && reg.pedidos === 0 && reg.receita === 0) { ignoradas++; continue; }
    linhas.push(reg);
  }
  if (linhas.length === 0) return { linhas, ignoradasSemMovimento: ignoradas, erro: "Nenhum produto com investimento ou vendas foi encontrado nessa planilha." };
  return { linhas, ignoradasSemMovimento: ignoradas, erro: null };
}

export type SkuCatalogo = { skuSeller: string; idSku: string; variacao: string; preco: number };
export type Catalogo = { atualizadoEm: string; produtos: Record<string, { n: string; v: SkuCatalogo[] }> };
export type LeituraCatalogo = { catalogo: Catalogo | null; erro: string | null; totalSkus: number; semSkuSeller: number };

export function lerCatalogo(matriz: any[][], cfg: CfgCatalogo): LeituraCatalogo {
  const refs = [cfg.idProduto, cfg.idSku, cfg.skuSeller, cfg.variacao, cfg.nome, cfg.preco];
  const hdrIdx = linhaDeCabecalho(matriz, refs);
  const cab = hdrIdx >= 0 ? (matriz[hdrIdx] || []).map((c: any) => String(c ?? "")) : [];
  const col = (ref: string) => indiceDaColuna(ref, cab);
  const c = { id: col(cfg.idProduto), sku: col(cfg.idSku), seller: col(cfg.skuSeller), variacao: col(cfg.variacao), nome: col(cfg.nome), preco: col(cfg.preco) };
  if (c.id < 0 || c.seller < 0) return { catalogo: null, totalSkus: 0, semSkuSeller: 0, erro: "Não achei, na planilha de anúncios, a coluna do ID do produto e/ou a do SKU do vendedor. Confira na sub-aba Configurações deste canal." };
  const produtos: Catalogo["produtos"] = {};
  let total = 0, sem = 0;
  for (let i = hdrIdx + 1; i < matriz.length; i++) {
    const l = matriz[i] || [];
    if (!ehId(l[c.id])) continue;
    const pid = textoId(l[c.id]);
    const seller = String(l[c.seller] ?? "").trim();
    total++;
    if (!seller) { sem++; continue; }
    const p = produtos[pid] || (produtos[pid] = { n: c.nome >= 0 ? String(l[c.nome] ?? "").trim() : "", v: [] });
    p.v.push({ skuSeller: seller, idSku: c.sku >= 0 ? textoId(l[c.sku]) : "", variacao: c.variacao >= 0 ? String(l[c.variacao] ?? "").trim() : "", preco: c.preco >= 0 ? numeroBR(l[c.preco]) : 0 });
  }
  if (Object.keys(produtos).length === 0) return { catalogo: null, totalSkus: total, semSkuSeller: sem, erro: "Nenhum anúncio com SKU do vendedor foi encontrado nessa planilha." };
  return { catalogo: { atualizadoEm: new Date().toISOString(), produtos }, totalSkus: total, semSkuSeller: sem, erro: null };
}

// ---------- cálculo ----------
export type CustoSku = { custo: number; produto?: string };
export type ProdutoCalculado = {
  campanhaId: string; campanhaNome: string; idProduto: string; produto: string;
  skus: string[]; skusComCusto: number; sku: string;          // sku = SKU do vendedor (ou o do primeiro, quando há variações)
  pedidos: number; receita: number; pdv: number;
  investimento: number; custoAfiliado: number; roiPlataforma: number;
  custoUnit: number; custoProduto: number; imposto: number; tarifa: number; embalagem: number; frete: number;
  margemRs: number; margemPct: number;
  status: "ok" | "custo_parcial" | "sem_custo" | "sem_anuncio";
};

export type OpcoesCalculo = {
  canal: string; regras: RegraTarifacao[]; custos: Map<string, CustoSku>; catalogo: Catalogo | null; cfg: CfgAdsCanal;
};

export function calcularProdutos(linhas: LinhaCampanha[], o: OpcoesCalculo): ProdutoCalculado[] {
  // índice SKU do TikTok -> SKU do vendedor (quando a planilha da campanha já vem por SKU)
  const porSkuId = new Map<string, { pid: string; s: SkuCatalogo }>();
  if (o.catalogo) for (const [pid, p] of Object.entries(o.catalogo.produtos)) for (const s of p.v) if (s.idSku) porSkuId.set(s.idSku, { pid, s });

  return linhas.map((l) => {
    let skusVend: SkuCatalogo[] = [];
    let nomeCat = "";
    const viaSku = l.idSku ? porSkuId.get(l.idSku) : undefined;
    if (viaSku) { skusVend = [viaSku.s]; nomeCat = o.catalogo?.produtos[viaSku.pid]?.n || ""; }
    else if (l.idProduto && o.catalogo?.produtos[l.idProduto]) { skusVend = o.catalogo.produtos[l.idProduto].v; nomeCat = o.catalogo.produtos[l.idProduto].n; }

    const skus = Array.from(new Set(skusVend.map((s) => s.skuSeller)));
    const custosAchados = skus.map((s) => o.custos.get(normalizarSkuAds(s))).filter((c): c is CustoSku => !!c && c.custo > 0);
    const custoUnit = custosAchados.length ? custosAchados.reduce((a, c) => a + c.custo, 0) / custosAchados.length : 0;

    const pedidos = l.pedidos, receita = l.receita;
    const pdv = l.pdv > 0 ? l.pdv : pedidos > 0 ? receita / pedidos : 0;
    const investimento = l.investimento + (o.cfg.somarAfiliado ? l.custoAfiliado : 0);
    const regra = obterRegraCanal(o.regras, o.canal, pdv);
    const tarifa = receita * (regra.comissao / 100) + regra.tarifa_fixa * pedidos;
    const frete = regra.frete * pedidos;
    const imposto = receita * (o.cfg.impostoPct / 100);
    const embalagem = o.cfg.embalagemUn * pedidos;
    const custoProduto = custoUnit * pedidos;
    const margemRs = receita - (investimento + custoProduto + imposto + tarifa + embalagem + frete);
    const status: ProdutoCalculado["status"] = skus.length === 0 ? "sem_anuncio" : custosAchados.length === 0 ? "sem_custo" : custosAchados.length < skus.length ? "custo_parcial" : "ok";

    return {
      campanhaId: l.campanhaId, campanhaNome: l.campanhaNome, idProduto: l.idProduto || l.idSku, produto: l.produto || nomeCat,
      skus, skusComCusto: custosAchados.length, sku: skus[0] || "",
      pedidos, receita, pdv, investimento, custoAfiliado: l.custoAfiliado, roiPlataforma: l.roiPlanilha || (l.investimento > 0 ? receita / l.investimento : 0),
      custoUnit, custoProduto, imposto, tarifa, embalagem, frete, margemRs, margemPct: receita > 0 ? margemRs / receita : 0, status,
    };
  });
}

export type TotaisCampanha = {
  produtos: number; pedidos: number; receita: number; investimento: number; custoProduto: number; imposto: number; tarifa: number; embalagem: number; frete: number;
  margemRs: number; margemPct: number; roi: number; semCusto: number; semAnuncio: number;
};
export function totalizar(ps: ProdutoCalculado[]): TotaisCampanha {
  const t: TotaisCampanha = { produtos: ps.length, pedidos: 0, receita: 0, investimento: 0, custoProduto: 0, imposto: 0, tarifa: 0, embalagem: 0, frete: 0, margemRs: 0, margemPct: 0, roi: 0, semCusto: 0, semAnuncio: 0 };
  for (const p of ps) {
    t.pedidos += p.pedidos; t.receita += p.receita; t.investimento += p.investimento; t.custoProduto += p.custoProduto; t.imposto += p.imposto;
    t.tarifa += p.tarifa; t.embalagem += p.embalagem; t.frete += p.frete; t.margemRs += p.margemRs;
    if (p.status === "sem_custo" || p.status === "custo_parcial") t.semCusto++;
    if (p.status === "sem_anuncio") t.semAnuncio++;
  }
  t.margemPct = t.receita > 0 ? t.margemRs / t.receita : 0;
  t.roi = t.investimento > 0 ? t.receita / t.investimento : 0;
  return t;
}

/** Mês de competência ("MM/AAAA") sugerido pelo nome do arquivo (ex.: Product_data_2026-11-01_-_2026-11-15_...). */
export function mesDoNomeDoArquivo(nome: string): string | null {
  const m = String(nome || "").match(/(20\d{2})-(\d{2})-\d{2}/);
  return m ? `${m[2]}/${m[1]}` : null;
}
