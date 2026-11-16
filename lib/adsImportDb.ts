// Gravação/leitura da importação de Ads por canal. Tudo em tabelas que já existem (sem migração):
//  - config_regras_tiny: configuração de colunas, catálogo de anúncios (ID do TikTok -> SKU do vendedor) e as campanhas importadas
//  - ads_campanhas_lancamentos: uma linha por produto, para a Análise global / Budget enxergarem o canal
import { mesclarConfig, padraoDoCanal, periodoDoNomeDoArquivo, type CfgAdsCanal, type Catalogo, type CustosManuais, type ProdutoCalculado } from "./adsImport";
import { paiDoSku } from "./skuPai";

/** "TikTok Shop" -> "tiktok-shop" (usado na URL e nas chaves de configuração). */
export const slugCanal = (nome: string) => String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Canal que já abre direto na importação de planilhas (os demais abrem no lançamento manual, mas também têm a importação). */
export const temImportacaoAds = (canal: string) => /tiktok/i.test(String(canal || ""));

/** "MM/AAAA" -> "AAAA-MM". */
export const mesIso = (mes: string) => { const [m, a] = String(mes).split("/"); return `${a}-${String(m).padStart(2, "0")}`; };

const kCfg = (slug: string) => `ads_import_cfg_${slug}`;
const kCatalogo = (slug: string) => `ads_import_catalogo_${slug}`;
const kCustosManuais = (slug: string) => `ads_import_custos_${slug}`;
const kComparativo = (slug: string) => `ads_import_cmp_${slug}`;
const kCampPrefixo = (slug: string, mes: string) => `ads_import_camp_${slug}_${mesIso(mes)}_`;

export type CampanhaSalva = {
  id: string; nome: string; arquivo: string; importadoEm: string; mes: string;
  periodo?: { ini: string; fim: string } | null;   // período que o nome do arquivo informa
  ids: number[];                         // linhas espelhadas em ads_campanhas_lancamentos
  ignoradas: number;                     // produtos da planilha sem investimento nem vendas
  produtos: ProdutoCalculado[];
};

export async function lerChave(supabase: any, campo: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("config_regras_tiny").select("coluna").eq("campo", campo).maybeSingle();
    if (error) return null;
    return data?.coluna ?? null;
  } catch { return null; }
}
export const gravarChave = async (supabase: any, campo: string, texto: string): Promise<string | null> => {
  const { error } = await supabase.from("config_regras_tiny").upsert({ campo, coluna: texto }, { onConflict: "campo" });
  return error ? error.message : null;
};
export const paraJson = (t: string | null): any => { try { return t ? JSON.parse(t) : null; } catch { return null; } };

export async function carregarCfgAds(supabase: any, slug: string, canal: string): Promise<CfgAdsCanal> {
  return mesclarConfig(paraJson(await lerChave(supabase, kCfg(slug))), padraoDoCanal(canal));
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
export async function salvarCampanha(supabase: any, slug: string, canal: string, mes: string, camp: Omit<CampanhaSalva, "ids" | "importadoEm" | "mes">, manterImportadoEm?: string): Promise<string | null> {
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
  const erro = await gravarChave(supabase, chave, JSON.stringify({ ...camp, periodo: camp.periodo ?? periodoDoNomeDoArquivo(camp.arquivo), mes, importadoEm: manterImportadoEm || new Date().toISOString(), ids } satisfies CampanhaSalva));
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

// ---------- custos informados à mão (por ID do produto/anúncio pai) ----------
export async function carregarCustosManuais(supabase: any, slug: string): Promise<CustosManuais> {
  const j = paraJson(await lerChave(supabase, kCustosManuais(slug)));
  return j && typeof j === "object" ? (j as CustosManuais) : {};
}
export async function salvarCustosManuais(supabase: any, slug: string, m: CustosManuais): Promise<string | null> {
  const erro = await gravarChave(supabase, kCustosManuais(slug), JSON.stringify(m));
  return erro ? "Não consegui salvar os custos informados: " + erro : null;
}

/** Todas as campanhas salvas do canal, de qualquer mês (a mais recente primeiro). */
export async function listarTodasCampanhasSalvas(supabase: any, slug: string): Promise<CampanhaSalva[]> {
  try {
    const { data, error } = await supabase.from("config_regras_tiny").select("campo, coluna").ilike("campo", `ads_import_camp_${slug}_%`);
    if (error || !data) return [];
    return (data as any[]).map((r) => paraJson(r.coluna)).filter((c) => c && c.id && Array.isArray(c.produtos)).sort((a: CampanhaSalva, b: CampanhaSalva) => String(b.importadoEm).localeCompare(String(a.importadoEm)));
  } catch { return []; }
}

// ---------- comparativo "atual vs anterior": só as duas últimas planilhas enviadas ----------
export type SnapProduto = { id: string; n: string; inv: number; af: number; rec: number; ped: number };   // inv = custo do anúncio (sem afiliados), af = afiliados
export type Snapshot = { arquivo: string; importadoEm: string; mes: string; ini: string | null; fim: string | null; campanhas: string[]; produtos: SnapProduto[] };
export type Comparativo = { atual: Snapshot | null; anterior: Snapshot | null };

export async function carregarComparativo(supabase: any, slug: string): Promise<Comparativo> {
  const j = paraJson(await lerChave(supabase, kComparativo(slug)));
  return { atual: j?.atual ?? null, anterior: j?.anterior ?? null };
}

/** Junta os produtos de várias campanhas (mesmo ID de produto soma) num snapshot enxuto. */
export function montarSnapshot(arquivo: string, mes: string, importadoEm: string, campanhas: { nome: string; produtos: ProdutoCalculado[] }[]): Snapshot {
  const mapa = new Map<string, SnapProduto>();
  for (const c of campanhas) for (const p of c.produtos) {
    const af = p.custoAfiliado || 0;
    const inv = p.investimentoAnuncio ?? Math.max(0, p.investimento - af);
    const x = mapa.get(p.idProduto) || { id: p.idProduto, n: p.produto, inv: 0, af: 0, rec: 0, ped: 0 };
    x.inv += inv; x.af += af; x.rec += p.receita; x.ped += p.pedidos; if (!x.n) x.n = p.produto;
    mapa.set(p.idProduto, x);
  }
  const per = periodoDoNomeDoArquivo(arquivo);
  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    arquivo, importadoEm, mes, ini: per?.ini ?? null, fim: per?.fim ?? null, campanhas: campanhas.map((c) => c.nome),
    produtos: Array.from(mapa.values()).map((x) => ({ ...x, inv: r2(x.inv), af: r2(x.af), rec: r2(x.rec) })),
  };
}

const mesmoEnvio = (a: Snapshot, b: Snapshot) => (a.ini && a.fim && b.ini && b.fim ? a.ini === b.ini && a.fim === b.fim : a.arquivo === b.arquivo);

/**
 * Registra o envio mais recente. O que era "atual" vira "anterior" (some o que era anterior). Se for o mesmo período reenviado,
 * só substitui o atual. Se ainda não havia comparativo mas já havia campanhas salvas, a mais recente delas vira o "atual" antes do novo envio.
 */
export async function registrarEnvioComparativo(supabase: any, slug: string, novo: Snapshot, semente?: Snapshot | null): Promise<string | null> {
  const cmp = await carregarComparativo(supabase, slug);
  let atual = cmp.atual, anterior = cmp.anterior;
  if (!atual && semente && !mesmoEnvio(semente, novo)) atual = semente;
  if (atual && mesmoEnvio(atual, novo)) { atual = novo; }
  else { anterior = atual; atual = novo; }
  const erro = await gravarChave(supabase, kComparativo(slug), JSON.stringify({ atual, anterior }));
  return erro ? "Não consegui salvar o comparativo: " + erro : null;
}

// ---------- comparativo "atual vs anterior" POR CAMPANHA ----------
// Cada campanha guarda o seu envio atual e o anterior dela. O "Geral" soma as campanhas que já têm os dois lados
// (comparar a melhor campanha de ontem com a mais simples de hoje não faz sentido).
const kCmpCamp = (slug: string) => `ads_import_cmpc_${slug}`;
export type CmpCampanha = { id: string; nome: string; atual: Snapshot | null; anterior: Snapshot | null };

const snapDaSalva = (c: CampanhaSalva): Snapshot => montarSnapshot(c.arquivo, c.mes, c.importadoEm, [{ nome: c.nome, produtos: c.produtos }]);

/** O que há de mais recente salvo de cada campanha (qualquer mês): serve de "atual" quando ainda não há comparativo guardado dela. */
async function maisRecentePorCampanha(supabase: any, slug: string): Promise<Map<string, CampanhaSalva>> {
  const m = new Map<string, CampanhaSalva>();
  for (const c of await listarTodasCampanhasSalvas(supabase, slug)) if (!m.has(c.id)) m.set(c.id, c);   // já vem da mais recente para a mais antiga
  return m;
}

export async function carregarComparativoCampanhas(supabase: any, slug: string): Promise<CmpCampanha[]> {
  const guardado: Record<string, CmpCampanha> = paraJson(await lerChave(supabase, kCmpCamp(slug)))?.campanhas || {};
  const salvas = await maisRecentePorCampanha(supabase, slug);
  const out: CmpCampanha[] = [];
  for (const [id, c] of salvas) {
    const g = guardado[id];
    out.push(g ? { ...g, id, nome: c.nome || g.nome } : { id, nome: c.nome, atual: snapDaSalva(c), anterior: null });
  }
  return out.sort((a, b) => String(b.atual?.importadoEm || "").localeCompare(String(a.atual?.importadoEm || "")));
}

/** Registra o envio de cada campanha: o atual dela vira o anterior; mesmo período reenviado só substitui o atual. */
export async function registrarEnvioCampanhas(supabase: any, slug: string, envios: { id: string; nome: string; novo: Snapshot; semente?: Snapshot | null }[]): Promise<string | null> {
  const guardado: Record<string, CmpCampanha> = paraJson(await lerChave(supabase, kCmpCamp(slug)))?.campanhas || {};
  for (const e of envios) {
    const g = guardado[e.id];
    let atual: Snapshot | null = g?.atual ?? null, anterior: Snapshot | null = g?.anterior ?? null;
    if (!atual && e.semente && !mesmoEnvio(e.semente, e.novo)) atual = e.semente;
    if (atual && mesmoEnvio(atual, e.novo)) atual = e.novo; else { anterior = atual; atual = e.novo; }
    guardado[e.id] = { id: e.id, nome: e.nome, atual, anterior };
  }
  const erro = await gravarChave(supabase, kCmpCamp(slug), JSON.stringify({ campanhas: guardado }));
  return erro ? "Não consegui salvar o comparativo: " + erro : null;
}

/** Semente de uma campanha: o que estava salvo dela (de qualquer mês) antes do novo envio. */
export async function sementesDasCampanhas(supabase: any, slug: string): Promise<Map<string, Snapshot>> {
  const m = new Map<string, Snapshot>();
  for (const [id, c] of await maisRecentePorCampanha(supabase, slug)) m.set(id, snapDaSalva(c));
  return m;
}

/** Soma vários snapshots (mesmo ID de produto soma): usado no "Geral". */
export function somarSnapshots(snaps: Snapshot[], rotulo: string): Snapshot {
  const mapa = new Map<string, SnapProduto>();
  for (const sn of snaps) for (const p of sn.produtos) {
    const x = mapa.get(p.id) || { id: p.id, n: p.n, inv: 0, af: 0, rec: 0, ped: 0 };
    x.inv += p.inv; x.af += p.af; x.rec += p.rec; x.ped += p.ped; if (!x.n) x.n = p.n;
    mapa.set(p.id, x);
  }
  const datas = (k: "ini" | "fim") => snaps.map((x) => x[k]).filter(Boolean) as string[];
  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    arquivo: rotulo, importadoEm: snaps.map((x) => x.importadoEm).sort().pop() || "", mes: snaps[0]?.mes || "",
    ini: datas("ini").sort()[0] ?? null, fim: datas("fim").sort().pop() ?? null, campanhas: snaps.flatMap((x) => x.campanhas),
    produtos: Array.from(mapa.values()).map((x) => ({ ...x, inv: r2(x.inv), af: r2(x.af), rec: r2(x.rec) })),
  };
}
