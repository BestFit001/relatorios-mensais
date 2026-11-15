// Gravação/leitura do Adsense do Mercado Livre. Tudo em tabelas que já existem (sem migração):
//  - config_regras_tiny: as duas planilhas do mês (patrocinados e vendas), a configuração e os ids espelhados
//  - ads_campanhas_lancamentos: uma linha por anúncio patrocinado, para a Análise global / Budget enxergarem o canal
import { gravarChave, lerChave, mesIso, paraJson } from "./adsImportDb";
import { CFG_ML_PADRAO, analisarML, mesDoPeriodo, mesclarCfgML, montarContexto, resumirAnalise, type AnaliseML, type AnuncioPat, type CfgRecomendacao, type Contexto, type Periodo, type ResumoML, type VendaPat } from "./adsMl";
import { mesclarCfgSug, type CfgSugestoes } from "./adsMlSugestoes";

export type EnvioPads = { arquivo: string; importadoEm: string; periodo: Periodo; anuncios: AnuncioPat[]; semInvestimento: number; totalLinhas: number };
export type EnvioVendas = { arquivo: string; importadoEm: string; periodo: Periodo; vendas: VendaPat[] };
/** O que está valendo agora: o último envio. O mês (competência) vem do período do relatório, não de um seletor. */
export type AtualML = { mes: string; pads: EnvioPads; vendas: EnvioVendas | null };

// Só o último envio (atual) e um resumo do anterior ficam guardados, como no TikTok.
const kAtual = (slug: string) => `ads_ml_atual_${slug}`;
const kAnterior = (slug: string) => `ads_ml_anterior_${slug}`;
const kIds = (slug: string, mes: string) => `ads_ml_ids_${slug}_${mesIso(mes)}`;
const kCfg = (slug: string) => `ads_ml_cfg_${slug}`;
const kSugCfg = (slug: string) => `ads_ml_sug_cfg_${slug}`;
// chaves da primeira versão (uma planilha por mês): ainda são lidas se não houver "atual"
const kPadsLegado = (slug: string, iso: string) => `ads_ml_pads_${slug}_${iso}`;
const kVendasLegado = (slug: string, iso: string) => `ads_ml_vendas_${slug}_${iso}`;

export const ehMercadoLivre = (canal: string) => /mercado\s*livre/i.test(String(canal || ""));

export async function carregarCfgML(supabase: any, slug: string): Promise<CfgRecomendacao> {
  return mesclarCfgML(paraJson(await lerChave(supabase, kCfg(slug))));
}
export async function salvarCfgML(supabase: any, slug: string, cfg: CfgRecomendacao): Promise<string | null> {
  const erro = await gravarChave(supabase, kCfg(slug), JSON.stringify(mesclarCfgML(cfg)));
  return erro ? "Não consegui salvar as configurações: " + erro : null;
}
export async function carregarCfgSug(supabase: any, slug: string): Promise<CfgSugestoes> {
  return mesclarCfgSug(paraJson(await lerChave(supabase, kSugCfg(slug))));
}
export async function salvarCfgSug(supabase: any, slug: string, cfg: CfgSugestoes): Promise<string | null> {
  const erro = await gravarChave(supabase, kSugCfg(slug), JSON.stringify(mesclarCfgSug(cfg)));
  return erro ? "Não consegui salvar as regras das sugestões: " + erro : null;
}
export const cfgMLPadrao = () => ({ ...CFG_ML_PADRAO });

const periodoIgual = (a: Periodo, b: Periodo) => !!a.ini && a.ini === b.ini && a.fim === b.fim;
const mesDe = (p: Periodo, fallback: string) => mesDoPeriodo(p) || fallback;

/** O envio em vigor. Se ainda só existe a versão antiga (uma planilha por mês), usa a mais recente dela. */
export async function carregarAtual(supabase: any, slug: string): Promise<AtualML | null> {
  const j = paraJson(await lerChave(supabase, kAtual(slug)));
  if (j && j.pads && Array.isArray(j.pads.anuncios)) return { mes: j.mes, pads: j.pads, vendas: j.vendas && Array.isArray(j.vendas.vendas) ? j.vendas : null };
  try {
    const { data } = await supabase.from("config_regras_tiny").select("campo").ilike("campo", `ads_ml_pads_${slug}_%`);
    const isos = ((data as any[]) || []).map((r) => String(r.campo).slice(`ads_ml_pads_${slug}_`.length)).sort().reverse();
    if (!isos.length) return null;
    const [p, v] = await Promise.all([lerChave(supabase, kPadsLegado(slug, isos[0])), lerChave(supabase, kVendasLegado(slug, isos[0]))]);
    const pads = paraJson(p), vendas = paraJson(v);
    if (!pads || !Array.isArray(pads.anuncios)) return null;
    return { mes: mesDe(pads.periodo || {}, `${isos[0].slice(5)}/${isos[0].slice(0, 4)}`), pads, vendas: vendas && Array.isArray(vendas.vendas) ? vendas : null };
  } catch { return null; }
}
export async function carregarAnterior(supabase: any, slug: string): Promise<ResumoML | null> {
  const j = paraJson(await lerChave(supabase, kAnterior(slug)));
  return j && j.tot && Array.isArray(j.anuncios) ? j : null;
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

export type EntradaEnvio = { pads?: { arq: string; leitura: { anuncios: AnuncioPat[]; periodo: Periodo; semInvestimento: number; totalLinhas: number } }; vendas?: { arq: string; leitura: { vendas: VendaPat[]; periodo: Periodo } } };

/**
 * Registra um envio. Planilha de patrocinados de OUTRO período = novo "atual" (o anterior vira resumo para comparação e o mais antigo some).
 * Do mesmo período = corrige o atual. A de vendas se junta ao patrocinados em vigor.
 */
export async function registrarEnvio(supabase: any, slug: string, canal: string, ctx: Contexto, cfg: CfgRecomendacao, mesFallback: string, e: EntradaEnvio): Promise<{ erro?: string; avisos: string[]; mes?: string }> {
  const avisos: string[] = [];
  const agora = new Date().toISOString();
  let atual = await carregarAtual(supabase, slug);
  const legado = !!atual && !(await lerChave(supabase, kAtual(slug)));
  if (e.pads) {
    const pads: EnvioPads = { arquivo: e.pads.arq, importadoEm: agora, periodo: e.pads.leitura.periodo, anuncios: e.pads.leitura.anuncios, semInvestimento: e.pads.leitura.semInvestimento, totalLinhas: e.pads.leitura.totalLinhas };
    const mes = mesDe(pads.periodo, mesFallback);
    if (atual && periodoIgual(atual.pads.periodo, pads.periodo)) {
      atual = { mes, pads, vendas: atual.vendas };   // mesmo período: só corrige o atual
    } else {
      if (atual) {
        const ant = analisarML(atual.pads.anuncios, atual.vendas ? atual.vendas.vendas : null, ctx, cfg);
        const erro = await gravarChave(supabase, kAnterior(slug), JSON.stringify(resumirAnalise(ant, { mes: atual.mes, arquivo: atual.pads.arquivo, importadoEm: atual.pads.importadoEm, periodo: atual.pads.periodo })));
        if (erro) return { erro: "Não consegui guardar o relatório anterior para comparação: " + erro, avisos };
      }
      atual = { mes, pads, vendas: null };
    }
  }
  if (e.vendas) {
    if (!atual) return { erro: "Envie primeiro a planilha de anúncios patrocinados.", avisos };
    const vendas: EnvioVendas = { arquivo: e.vendas.arq, importadoEm: agora, periodo: e.vendas.leitura.periodo, vendas: e.vendas.leitura.vendas };
    if (atual.pads.periodo.ini && vendas.periodo.ini && !periodoIgual(atual.pads.periodo, vendas.periodo)) avisos.push("Os períodos das duas planilhas são diferentes: confira os arquivos.");
    atual = { ...atual, vendas };
  }
  if (!atual) return { erro: "Nada para salvar.", avisos };
  const erro = await gravarChave(supabase, kAtual(slug), JSON.stringify(atual));
  if (erro) return { erro: "Não consegui salvar o relatório: " + erro, avisos };
  const a = analisarML(atual.pads.anuncios, atual.vendas ? atual.vendas.vendas : null, ctx, cfg);
  const erroEsp = await espelharNaAnalise(supabase, slug, canal, atual.mes, a);
  if (erroEsp) return { erro: erroEsp, avisos };
  if (legado) await supabase.from("config_regras_tiny").delete().or(`campo.ilike.ads_ml_pads_${slug}_%,campo.ilike.ads_ml_vendas_${slug}_%`);
  return { avisos, mes: atual.mes };
}

/** Apaga o relatório em vigor e as linhas dele na Análise global (o resumo anterior continua guardado). */
export async function excluirAtualML(supabase: any, slug: string): Promise<string | null> {
  const atual = await carregarAtual(supabase, slug);
  if (atual) {
    const ids = await idsEspelhadosML(supabase, slug, atual.mes);
    if (ids.length) {
      const { error } = await supabase.from("ads_campanhas_lancamentos").delete().in("id", ids);
      if (error) return "Não consegui apagar os anúncios da análise: " + error.message;
    }
    const { error } = await supabase.from("config_regras_tiny").delete().in("campo", [kAtual(slug), kIds(slug, atual.mes)]);
    if (error) return "Não consegui apagar o relatório: " + error.message;
  }
  const { error } = await supabase.from("config_regras_tiny").delete().or(`campo.ilike.ads_ml_pads_${slug}_%,campo.ilike.ads_ml_vendas_${slug}_%`);
  return error ? "Não consegui apagar o relatório: " + error.message : null;
}

/** Cruza e devolve a análise do mês com o cadastro atual (cadastro/custos podem ter mudado desde o envio). */
export function analisarAtual(atual: AtualML | null, ctx: Contexto, cfg: CfgRecomendacao): AnaliseML | null {
  return atual ? analisarML(atual.pads.anuncios, atual.vendas ? atual.vendas.vendas : null, ctx, cfg) : null;
}

async function lerTudo(supabase: any, tabela: string, colunas: string, filtro?: (q: any) => any): Promise<any[]> {
  const tudo: any[] = [];
  for (let de = 0; de < 200000; de += 1000) {
    let q = supabase.from(tabela).select(colunas);
    if (filtro) q = filtro(q);
    const { data, error } = await q.range(de, de + 999);
    if (error || !data) break;
    tudo.push(...data);
    if (data.length < 1000) break;
  }
  return tudo;
}
/** O que as sugestões precisam: as vendas do canal no mês (as do dashboard), os cancelados e as devoluções. */
export async function carregarBaseSugestoes(supabase: any, canal: string, mes: string) {
  const [vendas, cancelados, devolucoes] = await Promise.all([
    lerTudo(supabase, "vendas_canais", "id_pedido, sku, quantidade, preco_venda, repasse_liquido", (q) => q.eq("canal", canal).eq("mes_referencia", mes)),
    lerTudo(supabase, "cancelados", "id_pedido, sku", (q) => q.eq("canal", canal).eq("mes_referencia", mes)),
    lerTudo(supabase, "devolucoes", "sku, canal, quantidade, data_retorno"),
  ]);
  return { vendas, cancelados, devolucoes };
}

/** O que o canal (que não é o ML) já tem no Ads no mês: os lançamentos da Análise global / campanhas importadas. */
export async function carregarLancamentosCanal(supabase: any, canal: string, mes: string) {
  return lerTudo(supabase, "ads_campanhas_lancamentos", "identificador_anuncio, sku, investimento, margem_liquida_rs", (q) => q.eq("canal", canal).eq("mes_referencia", mes));
}
