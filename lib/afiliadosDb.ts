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

// ---------- quais canais aparecem em Relatórios > Afiliados ----------
const K_CANAIS = "afiliados_canais_visiveis";
export const EVENTO_CANAIS_AFILIADOS = "afiliados-canais-mudou";

/** Canais visíveis: a lista salva (só os que ainda existem); sem nada salvo, começa só com o TikTok. */
export async function carregarCanaisAfiliados(supabase: any, todos: string[]): Promise<string[]> {
  const j = paraJson(await lerChave(supabase, K_CANAIS));
  if (Array.isArray(j)) { const set = new Set(j.map(String)); return todos.filter((c) => set.has(c)); }
  return todos.filter((c) => /tiktok/i.test(c));
}
export async function salvarCanaisAfiliados(supabase: any, visiveis: string[]): Promise<string | null> {
  const erro = await gravarChave(supabase, K_CANAIS, JSON.stringify(visiveis));
  if (!erro && typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_CANAIS_AFILIADOS));
  return erro ? "Não consegui salvar os canais: " + erro : null;
}

/** Afiliados que apareceram nas vendas já lidas do canal (todos os meses), do que mais vendeu para o que menos vendeu. */
export async function listarAfiliadosVistos(supabase: any, canal: string): Promise<{ nome: string; receita: number }[]> {
  try {
    const { data } = await supabase.from("config_regras_tiny").select("campo, coluna").ilike("campo", `afiliados_vendas_${slugCanal(canal)}_%`);
    const soma = new Map<string, number>();
    for (const r of data || []) {
      const j = paraJson(r.coluna);
      for (const g of (j && Array.isArray(j.grupos) ? j.grupos : [])) if (g.a) soma.set(g.a, (soma.get(g.a) || 0) + (Number(g.r) || 0));
    }
    return Array.from(soma.entries()).map(([nome, receita]) => ({ nome, receita })).sort((a, b) => b.receita - a.receita);
  } catch { return []; }
}
