// Ferramentas > Consulta líquida (aba provisória): pedido + PDV + repasse da planilha -> líquido depois do custo do SKU e do imposto.
// Só contas (sem rede nem banco), para poder testar.
import { chaveDoPedido, interpretarTermo, statusContem, textoDoPedido } from "./checagemCanceladosLogica";
import { paraNumeroBR } from "./idPedidoFaturados";

export const IMPOSTO_PADRAO_PCT = 9;

export interface LinhaBase { id_pedido: string; canal: string; sku: string; quantidade: number | string | null; preco_venda?: number | string | null }
export interface CustoSku { sku: string; custo_unitario: number | string | null; produto?: string | null; marca?: string | null }
export interface InfoCusto { custo: number; produto: string; marca: string }

/** SKU como chave: sem espaços/aspas/".0" final, minúsculo (mesma regra do dashboard). */
export const chaveSku = (v: unknown): string => {
  let s = String(v ?? "").trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

/** colPdv = -1: a planilha não tem PDV (ou não interessa); o PDV usado é sempre o da venda cadastrada na base. */
export interface ConfigConsulta {
  linhaInicial: number; colPedido: number; colPdv: number; colRepasse: number; impostoPct: number;
  /** Coluna do status do pedido na planilha (-1/omitida: não há). Linhas cujo status contém algum dos termos de `ignorarStatus` não entram na consulta. */
  colStatus?: number;
  /** Mesmas regras da Checagem de Cancelados: sem acento/maiúscula; "cancelado" acha "Pedido cancelado"; ";" separa alternativas ("cancelado; devolvido"). */
  ignorarStatus?: string;
}

export interface LinhaIgnoradaStatus { linha: number; idPedido: string; status: string }

export type StatusConsulta = "ok" | "sem_pedido" | "sem_custo" | "sem_valor" | "somado";

export interface ItemConsulta {
  sku: string; produto: string; marca: string; quantidade: number; custoUnitario: number | null;
  pdv: number;                 // valor da venda desta linha na base (preco_venda)
  repasse: number | null;      // parte do repasse do pedido que cabe a esta linha (proporcional ao PDV)
  custo: number | null;        // custo unitário × quantidade
  imposto: number | null;      // PDV da linha × imposto%
  liquido: number | null;
}

export interface ResultadoLinha {
  linha: number;                 // número da primeira linha do pedido na planilha (1 = primeira)
  linhasPlanilha: number[];      // todas as linhas da planilha que trazem este pedido (carrinho: uma por item/repasse)
  idPedido: string;
  pdv: number | null;            // PDV da venda cadastrada na base (soma das linhas do pedido) — base do imposto
  pdvPlanilha: number | null;    // PDV que veio na planilha (só conferência)
  repasse: number | null;        // repasse da planilha (soma de todas as linhas do pedido)
  skus: ItemConsulta[];
  canal: string | null;
  custo: number | null;          // soma de custo unitário × quantidade (null se faltar custo de algum SKU)
  imposto: number | null;        // PDV da base × imposto%
  liquido: number | null;        // repasse − custo − imposto
  margemPct: number | null;      // líquido ÷ PDV
  status: StatusConsulta;
  detalhe: string;
}

const dinheiro = (n: number) => Math.round(n * 100) / 100;

/** Líquido = repasse − custo − imposto (imposto = PDV × %). Cada parte pode faltar: nesse caso devolve null. */
export function calcularLiquido(repasse: number | null, pdv: number | null, custo: number | null, impostoPct: number) {
  const impostoBruto = pdv == null ? null : pdv * (impostoPct / 100);
  if (repasse == null || pdv == null || custo == null) return { imposto: impostoBruto == null ? null : dinheiro(impostoBruto), liquido: null, margemPct: null };
  const liquido = repasse - custo - (impostoBruto as number);
  return { imposto: dinheiro(impostoBruto as number), liquido: dinheiro(liquido), margemPct: pdv > 0 ? (liquido / pdv) * 100 : null };
}

/** Índice da base de pedidos: chave do pedido -> linhas (um pedido pode ter vários SKUs). */
export function indexarBase(base: LinhaBase[]): Map<string, LinhaBase[]> {
  const m = new Map<string, LinhaBase[]>();
  for (const l of base) { const k = chaveDoPedido(l.id_pedido); if (!k) continue; const a = m.get(k); if (a) a.push(l); else m.set(k, [l]); }
  return m;
}

export function indexarCustos(custos: CustoSku[]): Map<string, InfoCusto> {
  const m = new Map<string, InfoCusto>();
  for (const c of custos) {
    const k = chaveSku(c.sku); const v = paraNumeroBR(c.custo_unitario);
    if (k && v != null) m.set(k, { custo: v, produto: String(c.produto ?? "").trim(), marca: String(c.marca ?? "").trim() });
  }
  return m;
}

export function consultar(linhas: any[][], cfg: ConfigConsulta, base: Map<string, LinhaBase[]>, custos: Map<string, InfoCusto>): { resultados: ResultadoLinha[]; ignoradas: number; ignoradasStatus: LinhaIgnoradaStatus[] } {
  // 1) Lê a planilha e junta as linhas do mesmo pedido: carrinho vem com um repasse por item, e o pedido vale a soma deles.
  interface Grupo { chave: string; idPedido: string; linhas: number[]; repasses: Array<number | null>; pdvs: Array<number | null> }
  const grupos: Grupo[] = [];
  const porChave = new Map<string, Grupo>();
  let ignoradas = 0;
  const ignoradasStatus: LinhaIgnoradaStatus[] = [];
  const ignoradasPorPedido = new Map<string, number>();
  const termos = interpretarTermo(cfg.ignorarStatus ?? "");
  const usaStatus = (cfg.colStatus ?? -1) >= 0 && termos.length > 0;
  for (let i = Math.max(0, cfg.linhaInicial - 1); i < linhas.length; i++) {
    const l = linhas[i] || [];
    const idPedido = textoDoPedido(l[cfg.colPedido]);
    const pdvPlanilha = cfg.colPdv >= 0 ? paraNumeroBR(l[cfg.colPdv]) : null;
    const repasse = paraNumeroBR(l[cfg.colRepasse]);
    const chave = chaveDoPedido(idPedido);
    // status que o usuário mandou ignorar (cancelados, por exemplo): a linha some da consulta e dos totais
    if (usaStatus && idPedido && statusContem(l[cfg.colStatus as number], termos)) {
      ignoradasStatus.push({ linha: i + 1, idPedido, status: String(l[cfg.colStatus as number] ?? "").trim() });
      if (chave) ignoradasPorPedido.set(chave, (ignoradasPorPedido.get(chave) || 0) + 1);
      continue;
    }
    // linha em branco, ou cabeçalho/observação do relatório (sem repasse e sem pedido correspondente na base)
    if (!(chave && base.get(chave)) && repasse == null && (!idPedido || pdvPlanilha == null)) { ignoradas++; continue; }
    let g = chave ? porChave.get(chave) : undefined;
    if (!g) { g = { chave, idPedido, linhas: [], repasses: [], pdvs: [] }; grupos.push(g); if (chave) porChave.set(chave, g); }
    g.linhas.push(i + 1); g.repasses.push(repasse); g.pdvs.push(pdvPlanilha);
  }

  // 2) Calcula cada pedido
  const resultados: ResultadoLinha[] = [];
  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  for (const g of grupos) {
    const validos = g.repasses.filter((x): x is number => x != null);
    const repasse = validos.length ? dinheiro(validos.reduce((a, b) => a + b, 0)) : null;
    const pdvsValidos = g.pdvs.filter((x): x is number => x != null);
    const pdvPlanilha = pdvsValidos.length ? dinheiro(pdvsValidos.reduce((a, b) => a + b, 0)) : null;
    const idPedido = g.idPedido;
    const ignoradasDoPedido = ignoradasPorPedido.get(g.chave) || 0;
    const itensBase = g.chave ? base.get(g.chave) : undefined;
    const r: ResultadoLinha = { linha: g.linhas[0], linhasPlanilha: g.linhas, idPedido, pdv: null, pdvPlanilha, repasse, skus: [], canal: null, custo: null, imposto: null, liquido: null, margemPct: null, status: "ok", detalhe: "" };
    const notas: string[] = [];
    if (g.linhas.length > 1) {
      notas.push(`Pedido em ${g.linhas.length} linhas da planilha (${g.linhas.join(", ")}): repasses somados${validos.length > 1 ? ` (${validos.map(fmt).join(" + ")} = ${fmt(repasse as number)})` : ""}.`);
      if (validos.length < g.repasses.length) notas.push(`${g.repasses.length - validos.length} linha(s) sem repasse válido ficaram fora da soma.`);
    }

    if (ignoradasDoPedido > 0) notas.push(`${ignoradasDoPedido} linha(s) deste pedido foi(ram) ignorada(s) pelo status; o custo considera todos os itens da venda cadastrada.`);

    if (!g.chave) { r.status = "sem_pedido"; r.detalhe = "Linha sem ID de pedido."; resultados.push(r); continue; }
    if (!itensBase) { r.status = "sem_pedido"; r.detalhe = ["Pedido não encontrado na base de vendas.", ...notas].join(" "); resultados.push(r); continue; }

    r.canal = Array.from(new Set(itensBase.map((b) => b.canal))).join(", ");
    const brutos = itensBase.map((b) => {
      const q = paraNumeroBR(b.quantidade);
      const info = custos.get(chaveSku(b.sku));
      return { b, q: q != null && q > 0 ? q : 1, info, pdv: Math.max(0, paraNumeroBR(b.preco_venda) ?? 0) };
    });
    const somaPdv = brutos.reduce((s, x) => s + x.pdv, 0);
    let pdvBase: number | null = somaPdv > 0 ? somaPdv : null;
    if (pdvBase == null && pdvPlanilha != null) { pdvBase = pdvPlanilha; notas.push("Pedido sem valor de venda na base: o imposto usou o PDV da planilha."); }
    r.pdv = pdvBase == null ? null : dinheiro(pdvBase);
    if (somaPdv > 0 && pdvPlanilha != null && Math.abs(pdvPlanilha - somaPdv) > 0.05) notas.push(`PDV da planilha (${fmt(pdvPlanilha)}) difere do cadastrado na base (${fmt(somaPdv)}); vale o da base.`);

    const semCusto = brutos.filter((x) => !x.info);
    const custoBruto = semCusto.length ? null : brutos.reduce((s, x) => s + (x.info as InfoCusto).custo * x.q, 0);
    r.custo = custoBruto == null ? null : dinheiro(custoBruto);
    const c = calcularLiquido(repasse, pdvBase, r.custo, cfg.impostoPct);
    r.imposto = c.imposto; r.liquido = c.liquido; r.margemPct = c.margemPct;

    // Divide o repasse e o imposto entre os itens (proporção do valor de venda; sem valor, partes iguais) para dar o líquido por produto
    r.skus = brutos.map((x) => {
      const peso = somaPdv > 0 ? x.pdv / somaPdv : 1 / brutos.length;
      const pdvLinha = somaPdv > 0 ? x.pdv : (pdvBase ?? 0) * peso;
      const repLinha = repasse == null ? null : repasse * peso;
      const custoLinha = x.info ? x.info.custo * x.q : null;
      const impLinha = pdvBase == null ? null : pdvLinha * (cfg.impostoPct / 100);
      const liq = repLinha != null && custoLinha != null && impLinha != null ? repLinha - custoLinha - impLinha : null;
      return {
        sku: String(x.b.sku ?? "").trim(), produto: x.info?.produto || "", marca: x.info?.marca || "", quantidade: x.q, custoUnitario: x.info?.custo ?? null,
        pdv: dinheiro(pdvLinha), repasse: repLinha == null ? null : dinheiro(repLinha), custo: custoLinha == null ? null : dinheiro(custoLinha),
        imposto: impLinha == null ? null : dinheiro(impLinha), liquido: r.liquido == null || liq == null ? null : dinheiro(liq),
      };
    });

    if (semCusto.length) { r.status = "sem_custo"; notas.unshift(`Sem custo cadastrado para o SKU ${semCusto.map((x) => String(x.b.sku ?? "").trim()).join(", ")}.`); }
    else if (repasse == null || pdvBase == null) { r.status = "sem_valor"; notas.unshift(repasse == null ? "Repasse vazio ou inválido." : "Pedido sem valor de venda (PDV)."); }
    else if (g.linhas.length > 1) r.status = "somado";
    r.detalhe = notas.join(" ");
    resultados.push(r);
  }
  return { resultados, ignoradas, ignoradasStatus };
}

export interface TotaisConsulta { linhas: number; calculadas: number; semPedido: number; semCusto: number; semValor: number; pdv: number; repasse: number; custo: number; imposto: number; liquido: number; margemPct: number | null }

/** Totais só das linhas com líquido calculado (as incompletas ficam fora para não distorcer). */
export function totalizar(rs: ResultadoLinha[]): TotaisConsulta {
  const calc = rs.filter((r) => r.liquido != null);
  const soma = (f: (r: ResultadoLinha) => number | null) => dinheiro(calc.reduce((s, r) => s + (f(r) ?? 0), 0));
  const pdv = soma((r) => r.pdv);
  const liquido = soma((r) => r.liquido);
  return {
    linhas: rs.length, calculadas: calc.length,
    semPedido: rs.filter((r) => r.status === "sem_pedido").length, semCusto: rs.filter((r) => r.status === "sem_custo").length, semValor: rs.filter((r) => r.status === "sem_valor").length,
    pdv, repasse: soma((r) => r.repasse), custo: soma((r) => r.custo), imposto: soma((r) => r.imposto), liquido, margemPct: pdv > 0 ? (liquido / pdv) * 100 : null,
  };
}

export interface ResultadoProduto {
  sku: string; produto: string; marca: string; unidades: number; pedidos: number;
  pdv: number; repasse: number; custo: number; imposto: number; liquido: number; liquidoPorUnidade: number | null; margemPct: number | null;
}

/** Líquido por produto (SKU): soma dos itens dos pedidos com líquido calculado. O repasse do pedido é dividido entre os itens na proporção do PDV. */
export function porProduto(rs: ResultadoLinha[]): ResultadoProduto[] {
  const m = new Map<string, ResultadoProduto & { _ped: Set<number> }>();
  for (const r of rs) {
    if (r.liquido == null) continue;
    for (const it of r.skus) {
      const k = chaveSku(it.sku) || it.sku;
      let p = m.get(k);
      if (!p) { p = { sku: it.sku, produto: it.produto, marca: it.marca, unidades: 0, pedidos: 0, pdv: 0, repasse: 0, custo: 0, imposto: 0, liquido: 0, liquidoPorUnidade: null, margemPct: null, _ped: new Set() }; m.set(k, p); }
      p.unidades += it.quantidade; p._ped.add(r.linha);
      p.pdv += it.pdv; p.repasse += it.repasse ?? 0; p.custo += it.custo ?? 0; p.imposto += it.imposto ?? 0; p.liquido += it.liquido ?? 0;
    }
  }
  return Array.from(m.values()).map(({ _ped, ...p }) => ({
    ...p, pedidos: _ped.size, pdv: dinheiro(p.pdv), repasse: dinheiro(p.repasse), custo: dinheiro(p.custo), imposto: dinheiro(p.imposto), liquido: dinheiro(p.liquido),
    liquidoPorUnidade: p.unidades > 0 ? dinheiro(p.liquido / p.unidades) : null, margemPct: p.pdv > 0 ? (p.liquido / p.pdv) * 100 : null,
  })).sort((a, b) => b.liquido - a.liquido);
}
