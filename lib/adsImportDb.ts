// Gravação/leitura da importação de Ads por canal. Tudo em tabelas que já existem (sem migração):
//  - config_regras_tiny: configuração de colunas, catálogo de anúncios (ID do TikTok -> SKU do vendedor) e as campanhas importadas
//  - ads_campanhas_lancamentos: uma linha por produto, para a Análise global / Budget enxergarem o canal
import { mesclarConfig, type CfgAdsCanal, type Catalogo, type ProdutoCalculado } from "./adsImport";
import { paiDoSku } from "./skuPai";

/** "TikTok Shop" -> "tiktok-shop" (usado na URL e nas chaves de configuração). */
export const slugCanal = (nome: string) => String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Canais que têm importação de planilhas (por enquanto só o TikTok Shop). */
export const temImportacaoAds = (canal: string) => /tiktok/i.test(String(canal || ""));

/** "MM/AAAA" -> "AAAA-MM". */
export const mesIso = (mes: string) => { const [m, a] = String(mes).split("/"); return `${a}-${String(m).padStart(2, "0")}`; };

const kCfg = (slug: string) => `ads_import_cfg_${slug}`;
const kCatalogo = (slug: string) => `ads_import_catalogo_${slug}`;
const kCampPrefixo = (slug: string, mes: string) => `ads_import_camp_${slug}_${mesIso(mes)}_`;

export type CampanhaSalva = {
  id: string; nome: string; arquivo: string; importadoEm: string; mes: string;
  ids: number[];                         // linhas espelhadas em ads_campanhas_lancamentos
  ignoradas: number;                     // produtos da planilha sem investimento nem vendas
  produtos: ProdutoCalculado[];
};

async function lerChave(supabase: any, campo: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("config_regras_tiny").select("coluna").eq("campo", campo).maybeSingle();
    if (error) return null;
    return data?.coluna ?? null;
  } catch { return null; }
}
const gravarChave = async (supabase: any, campo: string, texto: string): Promise<string | null> => {
  const { error } = await supabase.from("config_regras_tiny").upsert({ campo, coluna: texto }, { onConflict: "campo" });
  return error ? error.message : null;
};
const paraJson = (t: string | null): any => { try { return t ? JSON.parse(t) : null; } catch { return null; } };

export async function carregarCfgAds(supabase: any, slug: string): Promise<CfgAdsCanal> {
  return mesclarConfig(paraJson(await lerChave(supabase, kCfg(slug))));
}
export async function salvarCfgAds(supabase: any, slug: string, cfg: CfgAdsCanal): Promise<string | null> {
  const erro = await gravarChave(supabase, kCfg(slug), JSON.stringify(cfg));
  return erro ? "Não consegui salvar a configuração: " + erro : null;
}

export async function carregarCatalogoAds(supabase: any, slug: string): Promise<Catalogo | null> {
  const j = paraJson(await lerChave(supabase, kCatalogo(slug)));
  return j && j.produtos ? (j as Catalogo) : null;
}
export async function salvarCatalogoAds(supabase: any, slug: string, cat: Catalogo): Promise<string | null> {
  const erro = await gravarChave(supabase, kCatalogo(slug), JSON.stringify(cat));
  return erro ? "Não consegui salvar a planilha de anúncios: " + erro : null;
}

export async function listarCampanhasSalvas(supabase: any, slug: string, mes: string): Promise<CampanhaSalva[]> {
  try {
    const { data, error } = await supabase.from("config_regras_tiny").select("campo, coluna").ilike("campo", kCampPrefixo(slug, mes) + "%");
    if (error || !data) return [];
    return (data as any[]).map((r) => paraJson(r.coluna)).filter((c) => c && c.id && Array.isArray(c.produtos)).sort((a: CampanhaSalva, b: CampanhaSalva) => String(b.importadoEm).localeCompare(String(a.importadoEm)));
  } catch { return []; }
}

/** Linha de ads_campanhas_lancamentos (a mesma que o lançamento manual grava) para um produto da campanha. */
function linhaLancamento(canal: string, mes: string, p: ProdutoCalculado) {
  const sku = p.skus.length > 1 ? paiDoSku(p.sku, new Map()) : p.sku;
  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    canal, mes_referencia: mes, identificador_anuncio: p.idProduto, nome_anuncio: p.produto || "Produto sem nome", sku,
    unidades_vendidas: p.pedidos, investimento: r2(p.investimento), retorno_bruto: r2(p.receita), faturamento_total: r2(p.receita),
    custo_produto: r2(p.custoProduto), imposto: r2(p.imposto), tarifa: r2(p.tarifa), embalagem: r2(p.embalagem), frete: r2(p.frete),
    margem_liquida_rs: r2(p.margemRs), margem_liquida_pct: Number(p.margemPct.toFixed(4)),
  };
}

/** Salva (ou substitui) uma campanha importada: guarda o detalhe e espelha os produtos na tabela da Análise global. */
export async function salvarCampanha(supabase: any, slug: string, canal: string, mes: string, camp: Omit<CampanhaSalva, "ids" | "importadoEm" | "mes">): Promise<string | null> {
  const chave = kCampPrefixo(slug, mes) + camp.id;
  const anterior = paraJson(await lerChave(supabase, chave)) as CampanhaSalva | null;
  if (anterior?.ids?.length) {
    const { error } = await supabase.from("ads_campanhas_lancamentos").delete().in("id", anterior.ids);
    if (error) return "Não consegui substituir a importação anterior desta campanha: " + error.message;
  }
  const ids: number[] = [];
  const linhas = camp.produtos.map((p) => linhaLancamento(canal, mes, p));
  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await supabase.from("ads_campanhas_lancamentos").insert(linhas.slice(i, i + 200)).select("id");
    if (error) return "Não consegui gravar os produtos na análise: " + error.message;
    (data || []).forEach((d: any) => ids.push(d.id));
  }
  const erro = await gravarChave(supabase, chave, JSON.stringify({ ...camp, mes, importadoEm: new Date().toISOString(), ids } satisfies CampanhaSalva));
  return erro ? "Não consegui salvar a campanha: " + erro : null;
}

export async function excluirCampanha(supabase: any, slug: string, mes: string, camp: CampanhaSalva): Promise<string | null> {
  if (camp.ids?.length) {
    const { error } = await supabase.from("ads_campanhas_lancamentos").delete().in("id", camp.ids);
    if (error) return "Não consegui apagar os produtos da análise: " + error.message;
  }
  const { error } = await supabase.from("config_regras_tiny").delete().eq("campo", kCampPrefixo(slug, mes) + camp.id);
  return error ? "Não consegui apagar a campanha: " + error.message : null;
}
