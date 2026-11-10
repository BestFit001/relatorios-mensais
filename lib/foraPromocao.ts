// Anúncios do Mercado Livre cuja promoção venceu e que não estão em outra campanha, e a contagem de SKUs ativos x promocionados.
// Funções puras: recebem as linhas do banco e a data de hoje (aaaa-mm-dd).

export interface PromoValidade { id?: number; conta: string; mlb: string; sku?: string | null; promocao?: string | null; data_inicio?: string | null; data_fim: string }
export interface MarcaPromovido { mlb: string; conta?: string | null; marcado_em: string }

export interface ItemForaDePromocao { mlb: string; sku: string; conta: string; ultimaPromocao: string; fimEm: string; diasFora: number }

const chaveMlb = (m: string) => String(m || "").trim().toUpperCase();
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
/** O dia em que a marcação foi feita, no horário de São Paulo. */
const diaDaMarca = (iso: string) => {
  const t = new Date(iso);
  return isNaN(t.getTime()) ? String(iso).slice(0, 10) : t.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
};

/**
 * Fora de promoção = a última promoção registrada do anúncio já terminou (hoje é depois do dia final) e ele não tem outra
 * campanha que ainda valha. Quem marcou "já promovi" depois do fim da última promoção sai da lista até uma promoção
 * registrada depois dessa marcação terminar.
 */
export function foraDePromocao(validades: PromoValidade[], marcas: MarcaPromovido[], hoje: string): ItemForaDePromocao[] {
  const porMlb = new Map<string, PromoValidade[]>();
  for (const v of validades) {
    if (!v.mlb || !v.data_fim) continue;
    const k = chaveMlb(v.mlb);
    (porMlb.get(k) || porMlb.set(k, []).get(k)!).push(v);
  }
  const marca = new Map<string, string>();
  for (const m of marcas) { const d = diaDaMarca(m.marcado_em); const k = chaveMlb(m.mlb); if (!marca.has(k) || d > marca.get(k)!) marca.set(k, d); }

  const saida: ItemForaDePromocao[] = [];
  porMlb.forEach((lista, mlb) => {
    const ultima = lista.reduce((a, b) => (b.data_fim > a.data_fim ? b : a));
    if (ultima.data_fim >= hoje) return;                              // ainda em promoção (ou termina hoje)
    const m = marca.get(mlb);
    if (m && m >= ultima.data_fim) return;                            // marcado como promovido depois do fim
    const comSku = lista.find((x) => x.sku && String(x.sku).trim());
    saida.push({ mlb, sku: String(comSku?.sku ?? ""), conta: ultima.conta, ultimaPromocao: String(ultima.promocao ?? ""), fimEm: ultima.data_fim, diasFora: diasEntre(ultima.data_fim, hoje) });
  });
  return saida.sort((a, b) => a.fimEm.localeCompare(b.fimEm) || a.mlb.localeCompare(b.mlb));   // vencidos há mais tempo primeiro
}

export interface ResumoSkus { anuncios: number; skusAtivos: number; skusPromocionados: number; anunciosPromocionados: number; skusSemPromocao: number; percentual: number }

/**
 * SKUs ativos = SKUs distintos com anúncio na base de anúncios da conta. Promocionado = anúncio com campanha vigente hoje
 * (início já passou, fim ainda não) ou marcado manualmente como promovido depois do fim da última campanha.
 */
export function resumoSkusPromocionados(
  anuncios: { mlb: string; sku?: string | null }[], validades: PromoValidade[], marcas: MarcaPromovido[], hoje: string,
  normalizarSku: (s: any) => string,
): ResumoSkus {
  const skuDoMlb = new Map<string, string>();
  const ativos = new Set<string>();
  for (const a of anuncios) {
    const sku = normalizarSku(a.sku);
    if (sku.length >= 10) { ativos.add(sku); skuDoMlb.set(chaveMlb(a.mlb), sku); }
  }
  const mlbsDosAtivos = new Set(anuncios.map((a) => chaveMlb(a.mlb)));

  const vigentes = new Set<string>();
  for (const v of validades) {
    if (!v.mlb || !v.data_fim) continue;
    if (v.data_fim >= hoje && (!v.data_inicio || v.data_inicio <= hoje)) vigentes.add(chaveMlb(v.mlb));
  }
  // marcados à mão (já fora da lista de "fora de promoção" por terem sido marcados depois do fim)
  const ultimoFim = new Map<string, string>();
  for (const v of validades) { const k = chaveMlb(v.mlb); if (v.data_fim && (!ultimoFim.has(k) || v.data_fim > ultimoFim.get(k)!)) ultimoFim.set(k, v.data_fim); }
  for (const m of marcas) {
    const k = chaveMlb(m.mlb), d = diaDaMarca(m.marcado_em);
    if (d >= (ultimoFim.get(k) || "0000-00-00")) vigentes.add(k);
  }

  const mlbsPromo = Array.from(vigentes).filter((m) => mlbsDosAtivos.has(m));
  const skusPromo = new Set<string>();
  mlbsPromo.forEach((m) => { const s = skuDoMlb.get(m); if (s) skusPromo.add(s); });
  return {
    anuncios: mlbsDosAtivos.size, skusAtivos: ativos.size, skusPromocionados: skusPromo.size, anunciosPromocionados: mlbsPromo.length,
    skusSemPromocao: ativos.size - skusPromo.size, percentual: ativos.size > 0 ? (skusPromo.size / ativos.size) * 100 : 0,
  };
}
