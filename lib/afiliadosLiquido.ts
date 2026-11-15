// Líquido das vendas de afiliados com a MESMA lógica do dashboard (app/page.tsx):
//   lucro = repasse do canal (fórmula da aba Regras: taxas e impostos) - custo (CMV = custo da base x quantidade) - frete Flex/tarifa - devoluções
// e depois, no painel, menos a comissão do afiliado. Tudo é calculado na hora, a partir das vendas já gravadas pelo upload do canal
// (vendas_canais), do custo atual da base (tabela_custos_skus), das devoluções e do frete; assim, corrigir um custo atualiza o líquido.
import { avaliarFormulaPorUnidade } from "./formulaRepasse";
import type { LiqX, VendasAfiliadosMes } from "./afiliados";

const MESES_NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const normSku = (valor: any): string => {
  if (valor === null || valor === undefined) return "";
  let s = String(valor).trim().replace(/^['"]/, "").replace(/['"]$/, "").trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};
const normPedido = (v: any): string => String(v ?? "").trim().replace(/\.0$/, "").replace(/\s+/g, "").toLowerCase();
const normTexto = (v: any): string => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const num = (v: any): number => {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  return isNaN(n) ? 0 : n;
};
/** "11/2026" -> "novembro de 2026" (como o upload grava o mes_referencia). */
export const mesPorExtenso = (mes: string): string => { const [m, a] = String(mes).split("/"); return `${MESES_NOMES[Number(m) - 1] || ""} de ${a}`; };

async function lerTudo(supabase: any, tabela: string, colunas: string, filtros: (q: any) => any = (q) => q): Promise<any[]> {
  const todos: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtros(supabase.from(tabela).select(colunas)).order("id").range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    todos.push(...data);
    if (data.length < 1000) break;
  }
  return todos;
}
async function lerPorLista(supabase: any, tabela: string, colunas: string, coluna: string, valores: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < valores.length; i += 150) {
    const { data, error } = await supabase.from(tabela).select(colunas).in(coluna, valores.slice(i, i + 150));
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

/**
 * Devolve as vendas do mês com o resultado do dashboard em cada produto (campo x), ou null se não der para calcular
 * (mês lido antes de a planilha guardar os pedidos, vendas do canal ainda não gravadas, ou erro de leitura).
 */
export async function calcularLiquidoAfiliados(supabase: any, canal: string, mes: string, dados: VendasAfiliadosMes): Promise<VendasAfiliadosMes | null> {
  const pedidosAfil = new Set<string>();
  for (const g of dados.grupos) for (const p of g.pr || []) for (const o of p.o || []) pedidosAfil.add(normPedido(o));
  if (pedidosAfil.size === 0) return null;
  try {
    const [vendas, custosLista, regras] = await Promise.all([
      lerTudo(supabase, "vendas_canais", "id, id_pedido, sku, preco_venda, repasse_liquido, quantidade", (q) => q.eq("canal", canal).eq("mes_referencia", mesPorExtenso(mes))),
      lerTudo(supabase, "tabela_custos_skus", "id, sku, custo_unitario"),
      lerTudo(supabase, "config_regras_canais", "id, canal, col_pdv, col_quantidade, formula_excel"),
    ]);
    if (vendas.length === 0) return null;
    const custos = new Map<string, number>();
    custosLista.forEach((c) => { const k = normSku(c.sku); if (k) custos.set(k, num(c.custo_unitario)); });
    const regra = regras.find((r) => normTexto(r.canal) === normTexto(canal));
    const ehSite = normTexto(canal).includes("site");
    const ids = Array.from(new Set(vendas.map((v) => String(v.id_pedido ?? "")).filter(Boolean)));
    const [plp, tarifas, devs] = await Promise.all([
      lerPorLista(supabase, "plp_pedidos", "numero_pedido, valor_frete", "numero_pedido", ids),
      ehSite ? lerPorLista(supabase, "tarifas_site", "id_pedido, valor_tarifa", "id_pedido", ids) : Promise.resolve([] as any[]),
      lerPorLista(supabase, "devolucoes", "pedido, sku, pdv", "pedido", ids),
    ]);

    // linhas do mês com o repasse do dashboard
    type L = { ped: string; sku: string; qtd: number; preco: number; repasse: number; extra: number; dev: number };
    const linhas: L[] = vendas.map((s) => {
      const qtd = num(s.quantidade) || 1; const preco = num(s.preco_venda);
      let rep = num(s.repasse_liquido);
      if (regra?.formula_excel && String(regra.formula_excel).trim()) {
        const calc = avaliarFormulaPorUnidade(String(regra.formula_excel), preco, qtd, regra.col_pdv || "P", regra.col_quantidade || "O");
        if (calc !== null) rep = calc;
      }
      if (isNaN(rep) || rep <= 0 || (preco > 0 && rep > preco * qtd * 1.5)) rep = Math.max(0, preco - preco * 0.16);
      return { ped: normPedido(s.id_pedido), sku: normSku(s.sku), qtd, preco, repasse: rep, extra: 0, dev: 0 };
    });
    // frete Flex (e tarifa do Site) é do pedido: reparte entre os itens pelo valor; devolução casa pelo pedido e SKU (o que sobrar, pelo valor)
    const flex = new Map<string, number>(); plp.forEach((p) => { const k = normPedido(p.numero_pedido); const v = num(p.valor_frete); if (k && v > 0) flex.set(k, v); });
    const tarifa = new Map<string, number>(); tarifas.forEach((t) => { const k = normPedido(t.id_pedido); if (k) tarifa.set(k, num(t.valor_tarifa)); });
    const devPorPedido = new Map<string, { sku: string; valor: number }[]>();
    devs.forEach((d) => { const k = normPedido(d.pedido); if (k) devPorPedido.set(k, [...(devPorPedido.get(k) || []), { sku: normSku(d.sku), valor: num(d.pdv) }]); });
    const porPedido = new Map<string, L[]>(); linhas.forEach((l) => porPedido.set(l.ped, [...(porPedido.get(l.ped) || []), l]));
    porPedido.forEach((itens, ped) => {
      const soma = itens.reduce((a, i) => a + i.preco, 0);
      const rateio = (valor: number, alvo: L[]) => { const s = alvo.reduce((a, i) => a + i.preco, 0); return alvo.map((i) => valor * (s > 0 ? i.preco / s : 1 / alvo.length)); };
      const frete = (flex.get(ped) || 0) + (ehSite ? tarifa.get(ped) || 0 : 0);
      if (frete > 0) itens.forEach((i) => { i.extra = frete * (soma > 0 ? i.preco / soma : 1 / itens.length); });
      for (const d of devPorPedido.get(ped) || []) {
        const alvo = itens.filter((i) => i.sku === d.sku); const lista = alvo.length ? alvo : itens;
        rateio(d.valor, lista).forEach((v, k) => { lista[k].dev += v; });
      }
    });

    // soma por pedido + SKU
    const porChave = new Map<string, LiqX>();
    linhas.forEach((l) => {
      const k = `${l.ped}|${l.sku}`; const custo = custos.get(l.sku) || 0;
      const x = porChave.get(k) || { rp: 0, cmv: 0, ex: 0, dv: 0, sc: false };
      x.rp += l.repasse; x.cmv += custo * l.qtd; x.ex += l.extra; x.dv += l.dev; x.sc = x.sc || custo <= 0;
      porChave.set(k, x);
    });
    let achou = 0, procurou = 0;
    const grupos = dados.grupos.map((g) => ({
      ...g,
      pr: (g.pr || []).map((p) => {
        const sku = normSku(p.s || "sem-sku");
        const x: LiqX = { rp: 0, cmv: 0, ex: 0, dv: 0, sc: false };
        for (const o of p.o || []) {
          procurou++; const l = porChave.get(`${normPedido(o)}|${sku}`);
          if (!l) { continue; }
          achou++; x.rp += l.rp; x.cmv += l.cmv; x.ex += l.ex; x.dv += l.dv; x.sc = x.sc || l.sc;
        }
        return { ...p, x };
      }),
    }));
    if (procurou === 0 || achou / procurou < 0.9) return null;   // vendas do mês não conferem com a planilha lida: melhor não mostrar um líquido errado
    return { ...dados, grupos };
  } catch {
    return null;
  }
}
