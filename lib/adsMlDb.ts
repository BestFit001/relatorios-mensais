// Gravação/leitura do Adsense do Mercado Livre. Tudo em tabelas que já existem (sem migração):
//  - config_regras_tiny: as duas planilhas do mês (patrocinados e vendas), a configuração e os ids espelhados
//  - ads_campanhas_lancamentos: uma linha por anúncio patrocinado, para a Análise global / Budget enxergarem o canal
import { gravarChave, lerChave, mesIso, paraJson } from "./adsImportDb";
import { CFG_ML_PADRAO, analisarML, chaveCampanha, mesDoPeriodo, mesclarCfgML, mesclarAnterior, montarContexto, removerDoAnterior, resumirCampanha, type AnaliseML, type AnuncioPat, type CfgRecomendacao, type Contexto, type Periodo, type ResumoML, type VendaPat } from "./adsMl";
import { mesclarCfgSug, type CfgSugestoes } from "./adsMlSugestoes";

/** Uma campanha em vigor: cada campanha tem o seu envio (arquivo, período, data). Campanhas diferentes convivem; reenviar a mesma campanha atualiza só ela. */
export type CampEnvio = { chave: string; nome: string; arquivo: string; importadoEm: string; periodo: Periodo; n: number; sem?: number };
export type EnvioPads = { arquivo: string; importadoEm: string; periodo: Periodo; anuncios: AnuncioPat[]; semInvestimento: number; totalLinhas: number; campanhas?: CampEnvio[] };
export type EnvioVendas = { arquivo: string; importadoEm: string; periodo: Periodo; vendas: VendaPat[] };
/** O que está valendo agora: o último envio. O mês (competência) vem do período do relatório, não de um seletor. */
export type AtualML = { mes: string; pads: EnvioPads; vendas: EnvioVendas | null };

// Por campanha: o último envio de cada campanha (atual) e um resumo do envio anterior dela ficam guardados, como no TikTok.
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
const uniaoPeriodo = (ps: Periodo[]): Periodo => {
  const ini = ps.map((p) => p.ini).filter(Boolean) as string[], fim = ps.map((p) => p.fim).filter(Boolean) as string[];
  return { ini: ini.length ? [...ini].sort()[0] : null, fim: fim.length ? [...fim].sort().reverse()[0] : null };
};

/** As campanhas em vigor (as versões antigas, sem a lista, são lidas pelo nome da campanha de cada anúncio). */
export function campanhasDoAtual(a: AtualML | null): CampEnvio[] {
  if (!a) return [];
  if (a.pads.campanhas && a.pads.campanhas.length) return a.pads.campanhas;
  const m = new Map<string, CampEnvio>();
  for (const x of a.pads.anuncios) {
    const k = chaveCampanha(x.campanha);
    const c = m.get(k) || { chave: k, nome: x.campanha || "Sem nome", arquivo: a.pads.arquivo, importadoEm: a.pads.importadoEm, periodo: a.pads.periodo, n: 0 };
    c.n++; m.set(k, c);
  }
  return Array.from(m.values());
}

export type PlanoCampanha = { chave: string; nome: string; n: number; acao: "nova" | "corrige" | "atualiza"; periodoAnterior: Periodo | null };
/** O que um envio de patrocinados vai fazer com cada campanha da planilha (usado na prévia e ao salvar). */
export function planejarPads(atual: AtualML | null, anuncios: AnuncioPat[], periodo: Periodo, mesFallback: string): { mes: string; trocaMes: boolean; campanhas: PlanoCampanha[] } {
  const mes = mesDe(periodo, mesFallback);
  const trocaMes = !!atual && atual.mes !== mes;
  const existentes = trocaMes ? [] : campanhasDoAtual(atual);
  const nomes = new Map<string, { nome: string; n: number }>();
  for (const a of anuncios) { const k = chaveCampanha(a.campanha); const x = nomes.get(k) || { nome: a.campanha || "Sem nome", n: 0 }; x.n++; nomes.set(k, x); }
  const campanhas = Array.from(nomes.entries()).map(([chave, v]) => {
    const ex = existentes.find((c) => c.chave === chave);
    const acao: PlanoCampanha["acao"] = !ex ? "nova" : periodoIgual(ex.periodo, periodo) ? "corrige" : "atualiza";
    return { chave, nome: v.nome, n: v.n, acao, periodoAnterior: ex?.periodo ?? null };
  });
  return { mes, trocaMes, campanhas };
}

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

/** Resumo (para o "anterior") de uma campanha como ela está hoje no atual. */
function pecaDoAtual(atual: AtualML, c: CampEnvio, ctx: Contexto, cfg: CfgRecomendacao) {
  const ads = atual.pads.anuncios.filter((x) => chaveCampanha(x.campanha) === c.chave);
  const mlbs = new Set(ads.map((x) => x.mlb));
  const v = (atual.vendas?.vendas || []).filter((x) => mlbs.has(x.pat) || (!!x.campanha && chaveCampanha(x.campanha) === c.chave));
  const an = analisarML(ads, v.length ? v : null, ctx, cfg);
  return resumirCampanha(an, { chave: c.chave, nome: c.nome, mes: atual.mes, arquivo: c.arquivo, importadoEm: c.importadoEm, periodo: c.periodo });
}
const mlbsDaCampanha = (atual: AtualML, chave: string) => new Set(atual.pads.anuncios.filter((x) => chaveCampanha(x.campanha) === chave).map((x) => x.mlb));
/** Tira da planilha de vendas as linhas das campanhas indicadas (por anúncio patrocinado ou pelo nome da campanha). */
function semVendasDe(vendas: EnvioVendas | null, pats: Set<string>, chaves: Set<string>): EnvioVendas | null {
  if (!vendas) return null;
  const resto = vendas.vendas.filter((v) => !(pats.has(v.pat) || (!!v.campanha && chaves.has(chaveCampanha(v.campanha)))));
  return resto.length ? { ...vendas, vendas: resto } : null;
}

/**
 * Registra um envio, POR CAMPANHA:
 *  - campanha nova (ou de outro nome) no mesmo mês: é acrescentada, sem mexer nas demais;
 *  - mesma campanha, mesmo período: corrige o que está em vigor;
 *  - mesma campanha, período diferente: passa a valer, e o envio anterior DELA vira o resumo para o "Atual vs anterior";
 *  - planilha de outro mês: abre o novo mês e tudo o que estava em vigor vira o resumo anterior.
 * A planilha de vendas troca só as linhas das campanhas que ela traz.
 */
export async function registrarEnvio(supabase: any, slug: string, canal: string, ctx: Contexto, cfg: CfgRecomendacao, mesFallback: string, e: EntradaEnvio): Promise<{ erro?: string; avisos: string[]; mes?: string }> {
  const avisos: string[] = [];
  const agora = new Date().toISOString();
  let atual = await carregarAtual(supabase, slug);
  const legado = !!atual && !(await lerChave(supabase, kAtual(slug)));
  if (e.pads) {
    const L = e.pads.leitura;
    if (!L.anuncios.length) return { erro: "A planilha não tem nenhum anúncio com investimento acima de R$ 0,00.", avisos };
    const plano = planejarPads(atual, L.anuncios, L.periodo, mesFallback);
    const novas = new Set(plano.campanhas.map((c) => c.chave));
    const metas: CampEnvio[] = plano.campanhas.map((c, i) => ({ chave: c.chave, nome: c.nome, arquivo: e.pads!.arq, importadoEm: agora, periodo: L.periodo, n: c.n, sem: i === 0 ? L.semInvestimento : 0 }));
    if (atual && plano.trocaMes) {
      // mês novo: o que estava em vigor inteiro vira o anterior
      const pecas = campanhasDoAtual(atual).map((c) => pecaDoAtual(atual!, c, ctx, cfg));
      const ant = mesclarAnterior(null, pecas);
      const erro = await gravarChave(supabase, kAnterior(slug), JSON.stringify(ant));
      if (erro) return { erro: "Não consegui guardar o relatório anterior para comparação: " + erro, avisos };
      atual = { mes: plano.mes, pads: { arquivo: e.pads.arq, importadoEm: agora, periodo: L.periodo, anuncios: L.anuncios, semInvestimento: L.semInvestimento, totalLinhas: L.totalLinhas, campanhas: metas }, vendas: null };
    } else if (atual) {
      const trocadas = plano.campanhas.filter((c) => c.acao === "atualiza");
      if (trocadas.length) {
        const pecas = trocadas.map((c) => pecaDoAtual(atual!, campanhasDoAtual(atual).find((x) => x.chave === c.chave)!, ctx, cfg));
        const ant = mesclarAnterior(await carregarAnterior(supabase, slug), pecas);
        const erro = await gravarChave(supabase, kAnterior(slug), JSON.stringify(ant));
        if (erro) return { erro: "Não consegui guardar o relatório anterior para comparação: " + erro, avisos };
      }
      // vendas das campanhas que passam a ter um período novo eram do período antigo: ficam de fora até a planilha de vendas nova
      let pats = new Set<string>(), chaves = new Set<string>();
      for (const c of trocadas) { mlbsDaCampanha(atual, c.chave).forEach((m) => pats.add(m)); chaves.add(c.chave); }
      const vendas = trocadas.length ? semVendasDe(atual.vendas, pats, chaves) : atual.vendas;
      const mantidas = campanhasDoAtual(atual).filter((c) => !novas.has(c.chave));
      const todas = [...mantidas, ...metas];
      atual = {
        mes: plano.mes,
        pads: { arquivo: e.pads.arq, importadoEm: agora, periodo: uniaoPeriodo(todas.map((c) => c.periodo)), anuncios: [...atual.pads.anuncios.filter((x) => !novas.has(chaveCampanha(x.campanha))), ...L.anuncios], semInvestimento: todas.reduce((t, c) => t + (c.sem || 0), 0), totalLinhas: atual.pads.totalLinhas + L.totalLinhas, campanhas: todas },
        vendas,
      };
      if (trocadas.length && atual.vendas === null) avisos.push(`${trocadas.map((c) => c.nome).join(", ")}: novo período, envie também a planilha de vendas dessa campanha.`);
    } else {
      atual = { mes: plano.mes, pads: { arquivo: e.pads.arq, importadoEm: agora, periodo: L.periodo, anuncios: L.anuncios, semInvestimento: L.semInvestimento, totalLinhas: L.totalLinhas, campanhas: metas }, vendas: null };
    }
  }
  if (e.vendas) {
    if (!atual) return { erro: "Envie primeiro a planilha de anúncios patrocinados.", avisos };
    const V = e.vendas.leitura.vendas;
    const chavesV = new Set(V.filter((v) => v.campanha).map((v) => chaveCampanha(v.campanha))), patsV = new Set(V.map((v) => v.pat));
    const camps = campanhasDoAtual(atual);
    const dasVendas = camps.filter((c) => chavesV.has(c.chave));
    const alvo = dasVendas.length ? dasVendas : camps;
    if (alvo.length && e.vendas.leitura.periodo.ini && !alvo.some((c) => periodoIgual(c.periodo, e.vendas!.leitura.periodo))) avisos.push("O período da planilha de vendas é diferente do da campanha de patrocinados: confira os arquivos.");
    const semCampanha = Array.from(chavesV).filter((k) => !camps.some((c) => c.chave === k));
    if (semCampanha.length && camps.length) avisos.push("A planilha de vendas traz campanha(s) que não estão nos patrocinados enviados.");
    const base = semVendasDe(atual.vendas, patsV, chavesV);
    atual = { ...atual, vendas: { arquivo: e.vendas.arq, importadoEm: agora, periodo: e.vendas.leitura.periodo, vendas: [...(base?.vendas || []), ...V] } };
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

/** Apaga UMA campanha do que está em vigor (e do resumo anterior dela). As outras campanhas continuam. */
export async function excluirCampanhaML(supabase: any, slug: string, canal: string, ctx: Contexto, cfg: CfgRecomendacao, chave: string): Promise<string | null> {
  const atual = await carregarAtual(supabase, slug);
  if (!atual) return null;
  const restantes = campanhasDoAtual(atual).filter((c) => c.chave !== chave);
  if (!restantes.length) return excluirAtualML(supabase, slug);
  const pats = mlbsDaCampanha(atual, chave);
  const novo: AtualML = {
    mes: atual.mes,
    pads: { ...atual.pads, anuncios: atual.pads.anuncios.filter((x) => chaveCampanha(x.campanha) !== chave), periodo: uniaoPeriodo(restantes.map((c) => c.periodo)), campanhas: restantes },
    vendas: semVendasDe(atual.vendas, pats, new Set([chave])),
  };
  const erro = await gravarChave(supabase, kAtual(slug), JSON.stringify(novo));
  if (erro) return "Não consegui apagar a campanha: " + erro;
  const ant = await carregarAnterior(supabase, slug);
  if (ant && (ant.pecas || []).some((p) => p.chave === chave)) {
    const sobra = removerDoAnterior(ant, chave);
    if (sobra) await gravarChave(supabase, kAnterior(slug), JSON.stringify(sobra));
    else await supabase.from("config_regras_tiny").delete().eq("campo", kAnterior(slug));
  }
  return espelharNaAnalise(supabase, slug, canal, novo.mes, analisarML(novo.pads.anuncios, novo.vendas ? novo.vendas.vendas : null, ctx, cfg));
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
