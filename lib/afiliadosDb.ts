// Gravação/leitura dos Afiliados por canal e mês. Sem migração: tudo em config_regras_tiny (campo/coluna).
//  - afiliados_cfg_<canal>: colunas, perfis próprios e a comissão de cada afiliado
//  - afiliados_vendas_<canal>_<AAAA-MM>: vendas aprovadas do mês somadas por afiliado x método (refeitas a cada upload de vendas do canal)
import { gravarChave, lerChave, mesIso, paraJson, slugCanal } from "./adsImportDb";
import { mesclarCfgAfiliados, padraoAfiliados, type CfgAfiliados, type VendasAfiliadosMes } from "./afiliados";

const kCfg = (slug: string) => `afiliados_cfg_${slug}`;
const kVendas = (slug: string, mesAAAAMM: string) => `afiliados_vendas_${slug}_${mesAAAAMM}`;

export async function carregarCfgAfiliados(supabase: any, canal: string): Promise<CfgAfiliados> {
  return mesclarCfgAfiliados(paraJson(await lerChave(supabase, kCfg(slugCanal(canal)))), padraoAfiliados(canal));
}
export async function salvarCfgAfiliados(supabase: any, canal: string, cfg: CfgAfiliados): Promise<string | null> {
  const erro = await gravarChave(supabase, kCfg(slugCanal(canal)), JSON.stringify(cfg));
  return erro ? "Não consegui salvar a configuração dos afiliados: " + erro : null;
}

/** mes = "MM/AAAA" (como o Adsense usa) */
export async function carregarVendasAfiliados(supabase: any, canal: string, mes: string): Promise<VendasAfiliadosMes | null> {
  const j = paraJson(await lerChave(supabase, kVendas(slugCanal(canal), mesIso(mes))));
  return j && Array.isArray(j.grupos) ? (j as VendasAfiliadosMes) : null;
}
/** mesAAAAMM = "2026-11" (como o upload de vendas conhece o mês) */
export async function salvarVendasAfiliados(supabase: any, canal: string, mesAAAAMM: string, dados: VendasAfiliadosMes): Promise<string | null> {
  const erro = await gravarChave(supabase, kVendas(slugCanal(canal), mesAAAAMM), JSON.stringify(dados));
  return erro ? "Não consegui salvar as vendas dos afiliados: " + erro : null;
}
export async function excluirVendasAfiliados(supabase: any, canal: string, mesAAAAMM: string): Promise<void> {
  try { await supabase.from("config_regras_tiny").delete().eq("campo", kVendas(slugCanal(canal), mesAAAAMM)); } catch { /* sem dados para apagar */ }
}
