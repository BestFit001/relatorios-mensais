// Ajustes manuais da Análise global do Adsense (faturamento total do canal e valor usado em Ads). Ficam só aqui:
// não mexem no dashboard nem nos lançamentos do Adsense. Sem ajuste, valem os números automáticos (dashboard e Adsense, em tempo real).
import { gravarChave, lerChave, mesIso, paraJson } from "./adsImportDb";

export type Ajustes = { fat: Record<string, number>; gasto: Record<string, number> };
export const chaveCanalAjuste = (canal: string) => String(canal || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const k = (mes: string) => `ads_ajustes_manuais_${mesIso(mes)}`;
const limpar = (o: any): Record<string, number> => {
  const r: Record<string, number> = {};
  if (o && typeof o === "object") Object.entries(o).forEach(([c, v]) => { const n = Number(v); if (Number.isFinite(n) && n >= 0) r[c] = n; });
  return r;
};

export async function carregarAjustes(supabase: any, mes: string): Promise<Ajustes> {
  const j = paraJson(await lerChave(supabase, k(mes)));
  return { fat: limpar(j?.fat), gasto: limpar(j?.gasto) };
}
/** valor null = volta ao automático */
export async function salvarAjuste(supabase: any, mes: string, tipo: "fat" | "gasto", canal: string, valor: number | null): Promise<string | null> {
  const atual = await carregarAjustes(supabase, mes);
  const c = chaveCanalAjuste(canal);
  if (valor === null) delete atual[tipo][c]; else atual[tipo][c] = valor;
  const erro = await gravarChave(supabase, k(mes), JSON.stringify(atual));
  return erro ? "Não consegui salvar o ajuste: " + erro : null;
}
