// Linhas de venda prontas para análise (uma por item de pedido): é a MESMA montagem da Curva ABC (app/page.tsx),
// extraída para ser usada também no Acompanhamento da tela inicial. Se a regra mudar, muda aqui e vale nas duas telas.
// Só lógica (sem rede nem tela), para poder testar.
import { avaliarFormulaPorUnidade } from "./formulaRepasse";

export const normalizarSkuLinha = (valor: any): string => {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};
export const normalizarPedidoLinha = (v: any): string => String(v ?? "").trim().replace(/\.0$/, "").replace(/\s+/g, "").toLowerCase();
export const normalizarTextoLinha = (v: any): string => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
export const numeroLinha = (v: any): number => {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  return isNaN(n) ? 0 : n;
};
export const dataIsoLinha = (v: any): string => {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
};
/** Lojas físicas (clubes) não têm SKU de marketplace: ficam fora da análise por produto. */
export const ehCanalFisico = (canal: any): boolean => {
  const nome = normalizarTextoLinha(canal);
  return nome.includes("clube") || nome.includes("loja") || nome.includes("paineiras") || nome.includes("hebraica");
};
/** Marcas escritas de formas diferentes ("Best Fit", "BESTFIT", "FARM", "Farm") viram uma só. */
export const chaveDaMarca = (m: any): string => normalizarTextoLinha(m).replace(/[^a-z0-9]/g, "");

export interface InfoCusto { custo: number; marca: string; titulo: string; skuOriginal: string }
export type MapaCustos = Record<string, InfoCusto>;

/** SKU -> custo, marca e título; marcas equivalentes são unificadas. */
export function montarCustosMap(custosLista: any[]): MapaCustos {
  const rotuloPorChave: Record<string, string> = {};
  const bruto = (custosLista || []).map((c) => {
    const marca = String(c.marca || "SEM MARCA").trim().toUpperCase().replace(/\s+/g, " ");
    const ch = chaveDaMarca(marca);
    // entre "BESTFIT" e "BEST FIT" fica o escrito com espaço
    if (!rotuloPorChave[ch] || (marca.includes(" ") && !rotuloPorChave[ch].includes(" "))) rotuloPorChave[ch] = marca;
    return { c, ch };
  });
  const map: MapaCustos = {};
  bruto.forEach(({ c, ch }) => {
    const k = normalizarSkuLinha(c.sku);
    if (k) map[k] = { custo: numeroLinha(c.custo_unitario), marca: rotuloPorChave[ch], titulo: c.produto || "Produto não identificado", skuOriginal: String(c.sku ?? "").trim() };
  });
  return map;
}

export interface LinhaVenda {
  ped: any; pedN: string; chave: string; canal: string; sku: any; skuNorm: string;
  qtd: number; preco: number; repasse: number;
  /** o repasse veio da estimativa (16% de taxa) porque o gravado estava vazio ou fora do normal */
  repasseEstimado: boolean;
  data: string; t: number; cancelado: boolean;
  /** frete Flex (e tarifa do Site) rateado entre os itens do pedido */
  extra: number;
  /** título do anúncio como veio na planilha de vendas */
  tituloVenda: string;
}

export interface EntradaLinhas {
  vendas: any[]; faturados: any[]; plp: any[]; tarifasSite: any[]; cancelados: any[]; regrasCanais: any[];
  custosMap: MapaCustos;
}

/** Linhas de venda prontas: data vem dos faturados, Flex/tarifa do Site rateados por pedido, cancelados marcados. */
export function montarLinhasBase(e: EntradaLinhas): { linhasBase: LinhaVenda[]; semFaturamento: number; chavesVendas: Set<string> } {
  const { vendas, faturados, plp, tarifasSite, cancelados, regrasCanais, custosMap } = e;
  const dataPorPedido = new Map<string, string>();
  faturados.forEach((f) => {
    const k = normalizarPedidoLinha(f.id_pedido);
    const d = dataIsoLinha(f.data_faturamento);
    if (k && d && !dataPorPedido.has(k)) dataPorPedido.set(k, d);
  });
  const flex = new Map<string, number>();
  plp.forEach((p) => { const k = normalizarPedidoLinha(p.numero_pedido); const val = numeroLinha(p.valor_frete); if (k && val > 0) flex.set(k, val); });
  const tarifa = new Map<string, number>();
  tarifasSite.forEach((t) => { const k = normalizarPedidoLinha(t.id_pedido); if (k) tarifa.set(k, numeroLinha(t.valor_tarifa)); });
  const canc = new Set<string>();
  cancelados.forEach((c) => { const k = normalizarPedidoLinha(c.id_pedido); if (k) canc.add(`${normalizarTextoLinha(c.canal)}|${k}`); });

  // Amazon: vendas antigas ainda com sufixo F / -F / -FBA casam com o SKU da base (mesma regra do upload)
  const resolverSku = (canal: any, norm: string): string => {
    if (!norm || custosMap[norm] || !normalizarTextoLinha(canal).includes("amazon")) return norm;
    if (norm.endsWith("fba") && custosMap[norm.slice(0, -3)]) return norm.slice(0, -3);
    if (norm.endsWith("f") && custosMap[norm.slice(0, -1)]) return norm.slice(0, -1);
    return norm;
  };

  const regraDoCanal = (canal: any) => {
    const n = normalizarTextoLinha(canal);
    return regrasCanais.find((r) => normalizarTextoLinha(r.canal) === n)
      || (n.includes("magalu") || n.includes("magazine") ? regrasCanais.find((r) => normalizarTextoLinha(r.canal).includes("magalu")) : undefined);
  };

  const linhas: LinhaVenda[] = [];
  const chaves = new Set<string>();
  let sem = 0;
  vendas.forEach((s) => {
    if (ehCanalFisico(s.canal)) return;
    const pedN = normalizarPedidoLinha(s.id_pedido);
    const chave = `${normalizarTextoLinha(s.canal)}|${pedN}`;
    chaves.add(chave);
    const data = dataPorPedido.get(pedN);
    if (!data) { sem++; return; }
    const skuNorm = resolverSku(s.canal, normalizarSkuLinha(s.sku));
    const qtdLinha = numeroLinha(s.quantidade) || 1;
    const precoLinha = numeroLinha(s.preco_venda);
    // Mesmo repasse do Dashboard: fórmula do canal (aba Regras) calculada por unidade; senão o repasse gravado no upload
    let repasseLinha = numeroLinha(s.repasse_liquido);
    const regra = regraDoCanal(s.canal);
    if (regra?.formula_excel && String(regra.formula_excel).trim()) {
      const calc = avaliarFormulaPorUnidade(String(regra.formula_excel), precoLinha, qtdLinha, regra.col_pdv || "P", regra.col_quantidade || "O");
      if (calc !== null) repasseLinha = calc;
    }
    let estimado = false;
    if (isNaN(repasseLinha) || repasseLinha <= 0 || (precoLinha > 0 && repasseLinha > precoLinha * qtdLinha * 1.5)) {
      repasseLinha = Math.max(0, precoLinha - precoLinha * 0.16);
      estimado = true;
    }
    linhas.push({
      ped: s.id_pedido, pedN, chave, canal: s.canal, sku: custosMap[skuNorm]?.skuOriginal || s.sku, skuNorm,
      qtd: qtdLinha, preco: precoLinha, repasse: repasseLinha, repasseEstimado: estimado,
      data, t: new Date(data + "T00:00:00").getTime(), cancelado: canc.has(chave), extra: 0,
      tituloVenda: String(s.produto ?? "").trim(),
    });
  });

  // Frete Flex (e tarifa Vindi no Site) é do pedido: divide entre os itens na proporção do valor
  const porPedido = new Map<string, LinhaVenda[]>();
  linhas.forEach((l) => porPedido.set(l.chave, [...(porPedido.get(l.chave) || []), l]));
  porPedido.forEach((itens) => {
    const pedN = itens[0].pedN;
    const total = (flex.get(pedN) || 0) + (normalizarTextoLinha(itens[0].canal).includes("site") ? tarifa.get(pedN) || 0 : 0);
    if (total <= 0) return;
    const soma = itens.reduce((a, i) => a + i.preco, 0);
    itens.forEach((i) => { i.extra = total * (soma > 0 ? i.preco / soma : 1 / itens.length); });
  });
  return { linhasBase: linhas, semFaturamento: sem, chavesVendas: chaves };
}
