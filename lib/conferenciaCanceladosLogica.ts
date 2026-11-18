// Checagem de Cancelados > Conferência: lê a planilha de notas (NF-e de saída) de meses antigos e cruza com os cancelados guardados.
// Só lógica (sem rede nem tela). O número do pedido sai da coluna indicada do mesmo jeito que no upload de Faturados.
import { chaveDoPedido, textoDoPedido } from "./checagemCanceladosLogica";
import { extrairIdPedidoDaObservacao, paraNumeroBR } from "./idPedidoFaturados";

export interface NotaLida { chave: string; id_pedido: string; nf_e: string; comprador: string; valor_pedido: number | null }

/** Índices (base 0) das colunas; -1 = não puxar. */
export interface ColunasNota { colPedido: number; colNf: number; colComprador: number; colValor: number }

/** Linhas da planilha de notas -> uma nota por pedido (se o pedido repete, vale a primeira linha). */
export function lerNotas(linhas: any[][], p: ColunasNota & { linhaInicial: number }) {
  const notas = new Map<string, NotaLida>();
  let lidas = 0, semPedido = 0, repetidos = 0;
  for (let i = Math.max(0, p.linhaInicial - 1); i < linhas.length; i++) {
    const row = linhas[i];
    if (!row || row.every((c: any) => String(c ?? "").trim() === "")) continue;
    lidas++;
    const id = extrairIdPedidoDaObservacao(row[p.colPedido]);
    const chave = id ? chaveDoPedido(id) : "";
    if (!chave) { semPedido++; continue; }
    if (notas.has(chave)) { repetidos++; continue; }
    notas.set(chave, {
      chave, id_pedido: id!,
      nf_e: p.colNf >= 0 ? textoDoPedido(row[p.colNf]) : "",
      comprador: p.colComprador >= 0 ? String(row[p.colComprador] ?? "").trim() : "",
      valor_pedido: p.colValor >= 0 ? paraNumeroBR(row[p.colValor]) : null,
    });
  }
  return { notas, lidas, semPedido, repetidos };
}

// ---- SKU e quantidade (para dar baixa no estoque antes da NF-e de devolução) ----

export interface ItemLido { chave: string; id_pedido: string; sku: string; quantidade: number; produto: string }
export interface ColunasItens { colPedido: number; colSku: number; colQtd: number; colProduto: number }

/** Código do SKU como texto (planilha pode trazer número: sem notação científica, sem ".0"). */
export const textoDoSku = (v: unknown) => textoDoPedido(v).replace(/\.0$/, "").trim();

/** Número do pedido de uma célula: o próprio texto, ou, se for um texto longo (observação), o número achado dentro dele. */
function pedidoDaCelula(v: unknown): string {
  const t = textoDoPedido(v);
  if (!t) return "";
  return /\s/.test(t) || t.length > 30 ? extrairIdPedidoDaObservacao(t) || "" : t;
}

/**
 * Linhas da planilha -> itens (SKU + quantidade) por pedido. A mesma linha de pedido+SKU repetida soma as quantidades.
 * Quantidade vazia vale 1. `chavesAlvo`: se informado, só guarda os pedidos dessa lista (os cancelados) e conta os demais em `ignoradas`.
 */
export function lerItens(linhas: any[][], p: ColunasItens & { linhaInicial: number }, chavesAlvo?: Set<string>) {
  const itens = new Map<string, ItemLido>();
  let lidas = 0, semPedido = 0, semSku = 0, ignoradas = 0, qtdInvalida = 0;
  const pedidosAchados = new Set<string>();
  for (let i = Math.max(0, p.linhaInicial - 1); i < linhas.length; i++) {
    const row = linhas[i];
    if (!row || row.every((c: any) => String(c ?? "").trim() === "")) continue;
    lidas++;
    const id = pedidoDaCelula(row[p.colPedido]);
    const chave = id ? chaveDoPedido(id) : "";
    if (!chave) { semPedido++; continue; }
    if (chavesAlvo && !chavesAlvo.has(chave)) { ignoradas++; continue; }
    const sku = textoDoSku(row[p.colSku]);
    if (!sku) { semSku++; continue; }
    let qtd = 1;
    if (p.colQtd >= 0 && String(row[p.colQtd] ?? "").trim() !== "") {
      const n = paraNumeroBR(row[p.colQtd]);
      if (n === null || n <= 0) { qtdInvalida++; continue; }
      qtd = n;
    }
    pedidosAchados.add(chave);
    const k = chave + "\u0000" + sku;
    const ja = itens.get(k);
    if (ja) ja.quantidade += qtd;
    else itens.set(k, { chave, id_pedido: id, sku, quantidade: qtd, produto: p.colProduto >= 0 ? String(row[p.colProduto] ?? "").trim() : "" });
  }
  return { itens: Array.from(itens.values()), lidas, semPedido, semSku, ignoradas, qtdInvalida, pedidos: pedidosAchados.size };
}

export interface ItemGuardado { chave: string; sku: string; quantidade: number | string; produto?: string | null; origem?: string | null }

/** Agrupa os itens por pedido (chave). */
export function itensPorPedido(itens: ItemGuardado[]): Map<string, ItemGuardado[]> {
  const m = new Map<string, ItemGuardado[]>();
  for (const it of itens) { const l = m.get(it.chave); if (l) l.push(it); else m.set(it.chave, [it]); }
  m.forEach((l) => l.sort((a, b) => a.sku.localeCompare(b.sku)));
  return m;
}

/**
 * Itens de cada pedido: o que foi subido na conferência vale; o que não foi subido vem das vendas já guardadas (vendas_canais).
 * Vendas repetidas do mesmo SKU no pedido somam.
 */
export function juntarItens(subidos: ItemGuardado[], vendas: { id_pedido: any; sku: any; quantidade: any; produto?: any }[]): Map<string, ItemGuardado[]> {
  const mapa = itensPorPedido(subidos.map((i) => ({ ...i, origem: "Planilha da conferência" })));
  const dasVendas = new Map<string, Map<string, ItemGuardado>>();
  for (const v of vendas) {
    const chave = chaveDoPedido(v.id_pedido), sku = textoDoSku(v.sku);
    if (!chave || !sku || mapa.has(chave)) continue;
    const q = paraNumeroBR(v.quantidade) ?? 1;
    const por = dasVendas.get(chave) || new Map<string, ItemGuardado>();
    const ja = por.get(sku);
    if (ja) ja.quantidade = Number(ja.quantidade) + q;
    else por.set(sku, { chave, sku, quantidade: q, produto: v.produto ? String(v.produto) : null, origem: "Vendas guardadas" });
    dasVendas.set(chave, por);
  }
  dasVendas.forEach((por, chave) => mapa.set(chave, Array.from(por.values()).sort((a, b) => a.sku.localeCompare(b.sku))));
  return mapa;
}

/** Soma por SKU (quantidade a tirar do estoque), do maior para o menor. */
export function baixaPorSku(pedidos: ItemGuardado[][]): { sku: string; produto: string; quantidade: number; pedidos: number }[] {
  const m = new Map<string, { sku: string; produto: string; quantidade: number; pedidos: number }>();
  for (const itens of pedidos) for (const it of itens) {
    const x = m.get(it.sku) || { sku: it.sku, produto: "", quantidade: 0, pedidos: 0 };
    x.quantidade += Number(it.quantidade) || 0; x.pedidos++;
    if (!x.produto && it.produto) x.produto = String(it.produto);
    m.set(it.sku, x);
  }
  return Array.from(m.values()).sort((a, b) => b.quantidade - a.quantidade || a.sku.localeCompare(b.sku));
}

/** "SKU ×2; SKU2 ×1" */
export const textoDosItens = (itens: ItemGuardado[] | undefined) => (itens || []).map((i) => `${i.sku} ×${Number(i.quantidade)}`).join("; ");

export interface CanceladoGuardado { canal: string; id_pedido: string; chave: string }
export interface NotaGuardada { chave: string; nf_e: string | null; comprador: string | null; valor_pedido: number | string | null; periodo?: string | null; arquivo?: string | null }

/** Cancelados com a nota do mesmo pedido (ou null = ainda sem nota). */
export function cruzar<C extends CanceladoGuardado>(cancelados: C[], notas: Map<string, NotaGuardada>) {
  const linhas = cancelados.map((c) => ({ ...c, nota: notas.get(c.chave) ?? null }));
  const comNota = linhas.filter((l) => l.nota).length;
  const total = linhas.reduce((a, l) => a + (Number(l.nota?.valor_pedido) || 0), 0);
  return { linhas, comNota, semNota: linhas.length - comNota, total };
}
