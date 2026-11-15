// Gravação/leitura do Adsense do Mercado Livre. Tudo em tabelas que já existem (sem migração):
//  - config_regras_tiny: as duas planilhas do mês (patrocinados e vendas), a configuração e os ids espelhados
//  - ads_campanhas_lancamentos: uma linha por anúncio patrocinado, para a Análise global / Budget enxergarem o canal
import { gravarChave, lerChave, mesIso, paraJson } from "./adsImportDb";
import { CFG_ML_PADRAO, analisarML, mesclarCfgML, montarContexto, type AnaliseML, type AnuncioPat, type CfgRecomendacao, type Contexto, type Periodo, type VendaPat } from "./adsMl";

export type EnvioPads = { arquivo: string; importadoEm: string; periodo: Periodo; anuncios: AnuncioPat[]; semInvestimento: number; totalLinhas: number };
export type EnvioVendas = { arquivo: string; importadoEm: string; periodo: Periodo; vendas: VendaPat[] };

const kPads = (slug: string, mes: string) => `ads_ml_pads_${slug}_${mesIso(mes)}`;
const kVendas = (slug: string, mes: string) => `ads_ml_vendas_${slug}_${mesIso(mes)}`;
const kIds = (slug: string, mes: string) => `ads_ml_ids_${slug}_${mesIso(mes)}`;
const kCfg = (slug: string) => `ads_ml_cfg_${slug}`;

export const ehMercadoLivre = (canal: string) => /mercado\s*livre/i.test(String(canal || ""));

export async function carregarCfgML(supabase: any, slug: string): Promise<CfgRecomendacao> {
  return mesclarCfgML(paraJson(await lerChave(supabase, kCfg(slug))));
}
export async function salvarCfgML(supabase: any, slug: string, cfg: CfgRecomendacao): Promise<string | null> {
  const erro = await gravarChave(supabase, kCfg(slug), JSON.stringify(mesclarCfgML(cfg)));
  return erro ? "Não consegui salvar as configurações: " + erro : null;
}
export const cfgMLPadrao = () => ({ ...CFG_ML_PADRAO });

export async function carregarEnvios(supabase: any, slug: string, mes: string): Promise<{ pads: EnvioPads | null; vendas: EnvioVendas | null }> {
  const [p, v] = await Promise.all([lerChave(supabase, kPads(slug, mes)), lerChave(supabase, kVendas(slug, mes))]);
  const pads = paraJson(p), vendas = paraJson(v);
  return { pads: pads && Array.isArray(pads.anuncios) ? pads : null, vendas: vendas && Array.isArray(vendas.vendas) ? vendas : null };
}

/** Meses (AAAA-MM) que têm planilha de patrocinados salva. */
export async function mesesComEnvio(supabase: any, slug: string): Promise<string[]> {
  try {
    const { data } = await supabase.from("config_regras_tiny").select("campo").ilike("campo", `ads_ml_pads_${slug}_%`);
    return ((data as any[]) || []).map((r) => String(r.campo).slice(`ads_ml_pads_${slug}_`.length)).sort().reverse();
  } catch { return []; }
}

export async function idsEspelhadosML(supabase: any, slug: string, mes: string): Promise<number[]> {
  const j = paraJson(await lerChave(supabase, kIds(slug, mes)));
  return Array.isArray(j) ? j.map(Number).filter((n) => Number.isFinite(n)) : [];
}

export async function carregarContextoML(supabase: any): Promise<Contexto> {
  const ler = async (tabela: string, colunas: string) => {
    const tudo: any[] = [];
    for (let de = 0; de < 50000; de += 1000) {
      const { data, error } = await supabase.from(tabela).select(colunas).range(de, de + 999);
      if (error || !data) break;
      tudo.push(...data);
      if (data.length < 1000) break;
    }
    return tudo;
  };
  const [regras, custos] = await Promise.all([ler("ml_anuncios_regras", "mlb, sku, comissao, peso_real, altura, largura, comprimento"), ler("tabela_custos_skus", "sku, produto, custo_unitario")]);
  return montarContexto(regras, custos);
}

const r2 = (n: number) => Number((n || 0).toFixed(2));
/** Refaz as linhas do canal na Análise global a partir do cruzamento atual (apaga as anteriores do mesmo mês). */
export async function espelharNaAnalise(supabase: any, slug: string, canal: string, mes: string, analise: AnaliseML): Promise<string | null> {
  const antigos = await idsEspelhadosML(supabase, slug, mes);
  if (antigos.length) {
    const { error } = await supabase.from("ads_campanhas_lancamentos").delete().in("id", antigos);
    if (error) return "Não consegui substituir os anúncios anteriores na análise: " + error.message;
  }
  const linhas = analise.anuncios.map((a) => ({
    canal, mes_referencia: mes, identificador_anuncio: a.mlb, nome_anuncio: a.titulo || a.mlb,
    sku: a.itens.find((i) => i.direta)?.sku || a.itens[0]?.sku || "",
    unidades_vendidas: a.unidades, investimento: r2(a.investimento), retorno_bruto: r2(a.receitaTotal), faturamento_total: r2(a.receitaTotal),
    custo_produto: r2(a.conta.custo), imposto: r2(a.conta.imposto), tarifa: r2(a.conta.tarifa), embalagem: r2(a.conta.embalagem), frete: r2(a.conta.frete),
    margem_liquida_rs: r2(a.liquidez), margem_liquida_pct: Number(((a.margemPct ?? 0) / 100).toFixed(4)),
  }));
  const ids: number[] = [];
  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await supabase.from("ads_campanhas_lancamentos").insert(linhas.slice(i, i + 200)).select("id");
    if (error) return "Não consegui gravar os anúncios na análise: " + error.message;
    (data || []).forEach((d: any) => ids.push(d.id));
  }
  const erro = await gravarChave(supabase, kIds(slug, mes), JSON.stringify(ids));
  return erro ? "Não consegui registrar os anúncios espelhados: " + erro : null;
}

export async function salvarPatrocinados(supabase: any, slug: string, mes: string, e: EnvioPads): Promise<string | null> {
  const erro = await gravarChave(supabase, kPads(slug, mes), JSON.stringify(e));
  return erro ? "Não consegui salvar a planilha de patrocinados: " + erro : null;
}
export async function salvarVendas(supabase: any, slug: string, mes: string, e: EnvioVendas): Promise<string | null> {
  const erro = await gravarChave(supabase, kVendas(slug, mes), JSON.stringify(e));
  return erro ? "Não consegui salvar a planilha de vendas: " + erro : null;
}

/** Apaga as planilhas do mês e as linhas espelhadas na Análise global. */
export async function excluirMesML(supabase: any, slug: string, mes: string): Promise<string | null> {
  const ids = await idsEspelhadosML(supabase, slug, mes);
  if (ids.length) {
    const { error } = await supabase.from("ads_campanhas_lancamentos").delete().in("id", ids);
    if (error) return "Não consegui apagar os anúncios da análise: " + error.message;
  }
  const { error } = await supabase.from("config_regras_tiny").delete().in("campo", [kPads(slug, mes), kVendas(slug, mes), kIds(slug, mes)]);
  return error ? "Não consegui apagar as planilhas: " + error.message : null;
}

/** Cruza e devolve a análise do mês com o cadastro atual (cadastro/custos podem ter mudado desde o envio). */
export function analisarMes(pads: EnvioPads | null, vendas: EnvioVendas | null, ctx: Contexto, cfg: CfgRecomendacao): AnaliseML | null {
  return pads ? analisarML(pads.anuncios, vendas ? vendas.vendas : null, ctx, cfg) : null;
}
