// Ferramentas > Consulta líquida (aba provisória): pedido + PDV + repasse da planilha -> líquido depois do custo do SKU e do imposto.
// Só contas (sem rede nem banco), para poder testar.
import { chaveDoPedido, textoDoPedido } from "./checagemCanceladosLogica";
import { paraNumeroBR } from "./idPedidoFaturados";

export const IMPOSTO_PADRAO_PCT = 9;

export interface LinhaBase { id_pedido: string; canal: string; sku: string; quantidade: number | string | null }
export interface CustoSku { sku: string; custo_unitario: number | string | null }

/** SKU como chave: sem espaços/aspas/".0" final, minúsculo. */
export const chaveSku = (v: unknown): string => {
  let s = String(v ?? "").trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

export interface ConfigConsulta { linhaInicial: number; colPedido: number; colPdv: number; colRepasse: number; impostoPct: number }

export type StatusConsulta = "ok" | "sem_pedido" | "sem_custo" | "sem_valor" | "repetido";

export interface ItemConsulta { sku: string; quantidade: number; custoUnitario: number | null }

export interface ResultadoLinha {
  linha: number;                 // número da linha na planilha (1 = primeira)
  idPedido: string;
  pdv: number | null;
  repasse: number | null;
  skus: ItemConsulta[];
  canal: string | null;
  custo: number | null;          // soma de custo unitário × quantidade (null se faltar custo de algum SKU)
  imposto: number | null;        // PDV × imposto%
  liquido: number | null;        // repasse − custo − imposto
  margemPct: number | null;      // líquido ÷ PDV
  status: StatusConsulta;
  detalhe: string;
}

const dinheiro = (n: number) => Math.round(n * 100) / 100;

/** Líquido = repasse − custo − imposto (imposto = PDV × %). Cada parte pode faltar: nesse caso devolve null. */
export function calcularLiquido(repasse: number | null, pdv: number | null, custo: number | null, impostoPct: number) {
  if (repasse == null || pdv == null || custo == null) return { imposto: pdv == null ? null : dinheiro(pdv * (impostoPct / 100)), liquido: null, margemPct: null };
  const imposto = pdv * (impostoPct / 100);
  const liquido = repasse - custo - imposto;
  return { imposto: dinheiro(imposto), liquido: dinheiro(liquido), margemPct: pdv > 0 ? (liquido / pdv) * 100 : null };
}

/** Índice da base de pedidos: chave do pedido -> linhas (um pedido pode ter vários SKUs). */
export function indexarBase(base: LinhaBase[]): Map<string, LinhaBase[]> {
  const m = new Map<string, LinhaBase[]>();
  for (const l of base) { const k = chaveDoPedido(l.id_pedido); if (!k) continue; const a = m.get(k); if (a) a.push(l); else m.set(k, [l]); }
  return m;
}

export function indexarCustos(custos: CustoSku[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of custos) { const k = chaveSku(c.sku); const v = paraNumeroBR(c.custo_unitario); if (k && v != null) m.set(k, v); }
  return m;
}

export function consultar(linhas: any[][], cfg: ConfigConsulta, base: Map<string, LinhaBase[]>, custos: Map<string, number>): { resultados: ResultadoLinha[]; ignoradas: number } {
  const resultados: ResultadoLinha[] = [];
  const vistos = new Set<string>();
  let ignoradas = 0;
  for (let i = Math.max(0, cfg.linhaInicial - 1); i < linhas.length; i++) {
    const l = linhas[i] || [];
    const idPedido = textoDoPedido(l[cfg.colPedido]);
    const pdv = paraNumeroBR(l[cfg.colPdv]);
    const repasse = paraNumeroBR(l[cfg.colRepasse]);
    if (!idPedido && pdv == null && repasse == null) { ignoradas++; continue; }     // linha em branco
    const chave = chaveDoPedido(idPedido);
    const itensBase = chave ? base.get(chave) : undefined;
    const r: ResultadoLinha = { linha: i + 1, idPedido, pdv, repasse, skus: [], canal: null, custo: null, imposto: null, liquido: null, margemPct: null, status: "ok", detalhe: "" };

    if (!chave) { r.status = "sem_pedido"; r.detalhe = "Linha sem ID de pedido."; resultados.push(r); continue; }
    if (!itensBase) { r.status = "sem_pedido"; r.detalhe = "Pedido não encontrado na base de vendas."; r.imposto = pdv == null ? null : dinheiro(pdv * (cfg.impostoPct / 100)); resultados.push(r); continue; }

    r.canal = Array.from(new Set(itensBase.map((b) => b.canal))).join(", ");
    r.skus = itensBase.map((b) => {
      const q = paraNumeroBR(b.quantidade);
      return { sku: String(b.sku ?? "").trim(), quantidade: q != null && q > 0 ? q : 1, custoUnitario: custos.get(chaveSku(b.sku)) ?? null };
    });
    const semCusto = r.skus.filter((s) => s.custoUnitario == null);
    r.custo = semCusto.length ? null : dinheiro(r.skus.reduce((s, it) => s + (it.custoUnitario as number) * it.quantidade, 0));
    const c = calcularLiquido(repasse, pdv, r.custo, cfg.impostoPct);
    r.imposto = c.imposto; r.liquido = c.liquido; r.margemPct = c.margemPct;

    if (vistos.has(chave)) { r.status = "repetido"; r.detalhe = "Pedido repetido na planilha (conta de novo nos totais)."; }
    else if (semCusto.length) { r.status = "sem_custo"; r.detalhe = `Sem custo cadastrado para o SKU ${semCusto.map((s) => s.sku).join(", ")}.`; }
    else if (pdv == null || repasse == null) { r.status = "sem_valor"; r.detalhe = pdv == null ? "PDV vazio ou inválido." : "Repasse vazio ou inválido."; }
    vistos.add(chave);
    // repetido e incompleto: o status mais grave aparece
    if (r.status === "repetido" && (semCusto.length || pdv == null || repasse == null)) { r.status = semCusto.length ? "sem_custo" : "sem_valor"; r.detalhe = (semCusto.length ? `Sem custo cadastrado para o SKU ${semCusto.map((s) => s.sku).join(", ")}.` : "PDV ou repasse inválido.") + " Pedido repetido na planilha."; }
    resultados.push(r);
  }
  return { resultados, ignoradas };
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
