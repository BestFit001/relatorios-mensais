// Parte do servidor do acompanhamento de estoque: leitura pelo Mercado Livre (API quando há credenciais, senão a página, com proxy se configurado),
// gravação das leituras, importação do que o favorito leu no navegador e inclusão de links. Usa a chave service_role.
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiItens, baixarHtml, itemDaApi, obterToken, ErroSemTempo } from "../concorrentes/mercadolivre/fontes";
import { ErroBloqueio } from "../concorrentes/mercadolivre/parsers";
import { comLimite, hojeSP } from "../concorrentes/calculos";
import { modoManual } from "../concorrentes/captura";
import { ErroValidacao } from "../concorrentes/tipos";
import { lerEstoqueHtml, type LeituraEstoque, type StatusEstoque } from "./leitor";
import { lerLinksColados, normalizarLinkEstoque, ehLinkCurto, canalEstoqueValido, CANAL_PADRAO_ESTOQUE } from "./links";
import { baixarPagina, resolverLinkCurto } from "./paginas";
import { camposDaLeitura, type Monitorado } from "./regras";

const MAX_LINKS_POR_VEZ = 200;
const MAX_MONITORADOS = 500;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
function falha(contexto: string, error: { message: string } | null) { if (error) throw new Error(`${contexto}: ${error.message}`); }

/** Lê UM anúncio pelo servidor. Lança ErroBloqueio quando o Mercado Livre barra o servidor. */
export async function lerPeloServidor(item: { item_id: string; url: string; canal?: string }, ate?: number): Promise<LeituraEstoque> {
  const vazio = { aproximado: false, titulo: null, imagem: null, vendedor: null } as const;
  if (item.canal && item.canal !== CANAL_PADRAO_ESTOQUE) {
    try { return lerEstoqueHtml(await baixarPagina(item.url, ate), item.canal, item.item_id); }
    catch (e) {
      if (/HTTP (404|410)\b/.test(msg(e))) return { ...vazio, status: "esgotado", estoque: null, detalhe: "A página do anúncio não existe mais (anúncio removido ou finalizado)." };
      throw e;
    }
  }
  let erroApi = "";
  if (await obterToken().catch(() => null)) {
    try {
      const corpo = (await apiItens([item.item_id])).get(item.item_id);
      if (corpo) {
        const a = itemDaApi(corpo);
        const st = String(corpo.status || "active"), qtd = Number(corpo.available_quantity);
        const extra = { titulo: a?.titulo ?? null, imagem: a?.url_imagem ?? null, vendedor: a?.vendedor ?? null };
        if (st !== "active") return { ...vazio, ...extra, status: "esgotado", estoque: 0, detalhe: `A API do Mercado Livre informa o anúncio como “${st}” (não está à venda).` };
        if (Number.isFinite(qtd)) return { ...vazio, ...extra, status: qtd > 0 ? "em_estoque" : "esgotado", estoque: qtd, detalhe: `A API do Mercado Livre informa ${qtd} unidade(s) disponível(is).` };
      }
    } catch (e) { erroApi = msg(e); }
  }
  try {
    return lerEstoqueHtml(await baixarHtml(item.url, ate));
  } catch (e) {
    if (/HTTP (404|410)\b/.test(msg(e))) return { ...vazio, status: "esgotado", estoque: null, detalhe: "A página do anúncio não existe mais (anúncio removido ou finalizado)." };
    if (e instanceof ErroBloqueio || e instanceof ErroSemTempo) throw e;
    throw new Error(erroApi ? `API: ${erroApi} | Página: ${msg(e)}` : msg(e));
  }
}

/** Grava a leitura: atualiza o monitorado (com as regras de aviso) e a linha do dia no histórico. Devolve true se o anúncio ACABOU agora. */
export async function registrarLeitura(db: SupabaseClient, m: Monitorado, l: LeituraEstoque, agora = new Date()): Promise<boolean> {
  const hoje = hojeSP(agora);
  const acabou = l.status === "esgotado" && m.status !== "esgotado";
  const campos = camposDaLeitura(m, l, agora, hoje);
  const { error } = await db.from("estoque_monitorados").update(campos).eq("id", m.id);
  falha("atualizar anúncio monitorado", error);
  if (l.status !== "desconhecido") {
    const { error: e2 } = await db.from("estoque_historico").upsert({ monitorado_id: m.id, data_captura: hoje, status: l.status, estoque: l.estoque, capturado_em: agora.toISOString() }, { onConflict: "monitorado_id,data_captura" });
    falha("gravar histórico de estoque", e2);
  }
  return acabou;
}

export interface ResumoEstoque {
  data: string; total: number; processados: number; ok: number; falhas: number; pendentes: number;
  /** o servidor foi barrado pelo Mercado Livre (use o favorito no navegador) */
  bloqueado: boolean; manual?: boolean; acabaram: string[]; erros: { item_id: string; motivo: string }[]; ms: number;
}

async function ativos(db: SupabaseClient, ids?: string[], canal?: string): Promise<Monitorado[]> {
  const out: Monitorado[] = [];
  for (let de = 0; ; de += 1000) {
    let q = db.from("estoque_monitorados").select("*").eq("ativo", true).order("criado_em", { ascending: true }).range(de, de + 999);
    if (canal) q = q.eq("canal", canal);
    if (ids) q = q.in("id", ids);
    const { data, error } = await q;
    falha("listar anúncios monitorados", error);
    out.push(...((data as Monitorado[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Leitura diária (cron) ou "Ler agora": lê no servidor os anúncios que ainda não foram lidos hoje (`forcar` = todos).
 * Roda dentro de um orçamento de tempo e pode ser repetida. Se o Mercado Livre barrar o servidor, para na hora e avisa (`bloqueado`).
 */
export async function capturarEstoque(db: SupabaseClient, opc: { orcamentoMs?: number; forcar?: boolean; ids?: string[]; canal?: string; ler?: typeof lerPeloServidor } = {}): Promise<ResumoEstoque> {
  const inicio = Date.now(), hoje = hojeSP(), limite = inicio + (opc.orcamentoMs ?? 45_000), ler = opc.ler ?? lerPeloServidor;
  const base: ResumoEstoque = { data: hoje, total: 0, processados: 0, ok: 0, falhas: 0, pendentes: 0, bloqueado: false, acabaram: [], erros: [], ms: 0 };
  if (modoManual()) return { ...base, manual: true };
  const todos = await ativos(db, opc.ids, opc.canal);
  const fila = opc.forcar || opc.ids ? todos : todos.filter((m) => m.ultima_captura !== hoje);
  base.total = todos.length;
  const barrados = new Set<string>();   // canais cujo site barrou o servidor nesta rodada: não insiste neles
  await comLimite(fila, 4, async (m) => {
    if (barrados.has(m.canal) || Date.now() >= limite - 2000) return;
    base.processados++;
    try {
      const l = await ler({ item_id: m.item_id, url: m.url, canal: m.canal }, limite);
      if (await registrarLeitura(db, m, l)) base.acabaram.push(m.titulo || m.item_id);
      base.ok++;
    } catch (e) {
      if (e instanceof ErroSemTempo) { base.processados--; return; }
      base.falhas++;
      const motivo = msg(e);
      base.erros.push({ item_id: m.item_id, motivo });
      await db.from("estoque_monitorados").update({ erro: motivo.slice(0, 300) }).eq("id", m.id);
      if (e instanceof ErroBloqueio) { base.bloqueado = true; barrados.add(m.canal); }
    }
  });
  base.pendentes = Math.max(0, fila.length - base.processados);
  base.ms = Date.now() - inicio;
  return base;
}

// ---------- links ----------
export async function adicionarLinks(db: SupabaseClient, entrada: { canal?: string; texto: string; por?: string | null }) {
  const canal = entrada.canal || CANAL_PADRAO_ESTOQUE;
  if (!canalEstoqueValido(canal)) throw new ErroValidacao("Canal desconhecido.");
  const r = lerLinksColados(entrada.texto, canal);
  // links curtos / de compartilhamento (ex.: vt.tiktok.com/…): abre para descobrir o endereço de verdade do produto
  for (const c of r.curtos.slice(0, 20)) {
    try {
      const final = normalizarLinkEstoque(canal, await resolverLinkCurto(c.url));
      if (ehLinkCurto(final)) throw new Error("o link curto não levou a uma página de produto");
      if (r.validos.some((v) => v.item_id === final.item_id)) r.repetidos++; else r.validos.push(final);
    } catch (e) {
      r.invalidos.push({ texto: c.texto.length > 60 ? c.texto.slice(0, 57) + "…" : c.texto, motivo: `não consegui abrir o link curto daqui (${msg(e)}). Abra o link no navegador e cole o endereço completo que aparece na barra.` });
    }
  }
  if (r.validos.length === 0 && r.invalidos.length === 0) throw new ErroValidacao("Cole pelo menos um link de anúncio.");
  if (r.validos.length > MAX_LINKS_POR_VEZ) throw new ErroValidacao(`Cole no máximo ${MAX_LINKS_POR_VEZ} links por vez.`);
  let adicionados = 0, reativados = 0, jaMonitorados = r.repetidos;
  const novosIds: string[] = [];
  if (r.validos.length) {
    const { data: existentes, error } = await db.from("estoque_monitorados").select("id,item_id,ativo").eq("canal", canal).in("item_id", r.validos.map((v) => v.item_id));
    falha("buscar anúncios", error);
    const porItem = new Map((existentes || []).map((e: any) => [e.item_id as string, e]));
    const { count } = await db.from("estoque_monitorados").select("id", { count: "exact", head: true }).eq("canal", canal);
    const faltam = r.validos.filter((v) => !porItem.has(v.item_id));
    if ((count || 0) + faltam.length > MAX_MONITORADOS) throw new ErroValidacao(`O limite é ${MAX_MONITORADOS} anúncios acompanhados. Remova alguns antes de adicionar mais.`);
    for (const v of r.validos) {
      const e: any = porItem.get(v.item_id);
      if (!e) continue;
      if (e.ativo) { jaMonitorados++; continue; }
      const { error: e2 } = await db.from("estoque_monitorados").update({ ativo: true, url: v.url }).eq("id", e.id);
      falha("reativar anúncio", e2); reativados++; novosIds.push(e.id);
    }
    if (faltam.length) {
      const { data, error: e3 } = await db.from("estoque_monitorados").insert(faltam.map((v) => ({ canal, item_id: v.item_id, url: v.url, criado_por: entrada.por || null }))).select("id");
      falha("adicionar anúncios", e3);
      adicionados = faltam.length; novosIds.push(...((data as any[]) || []).map((d) => d.id));
    }
  }
  // tenta ler já os novos (pode falhar sem problema: o cron ou o favorito leem depois)
  let leitura: ResumoEstoque | null = null;
  if (novosIds.length && !modoManual()) { try { leitura = await capturarEstoque(db, { ids: novosIds.slice(0, 8), orcamentoMs: 14_000 }); } catch { /* fica para a próxima leitura */ } }
  return { adicionados, reativados, jaMonitorados, invalidos: r.invalidos, leitura };
}

export async function definirAtivoEstoque(db: SupabaseClient, id: string, ativo: boolean) {
  const { error } = await db.from("estoque_monitorados").update({ ativo }).eq("id", id);
  falha("atualizar anúncio", error);
}
export async function marcarAvisoVisto(db: SupabaseClient, ids: string[]) {
  const { error } = await db.from("estoque_monitorados").update({ aviso_visto_em: new Date().toISOString() }).in("id", ids).eq("status", "esgotado");
  falha("marcar aviso como visto", error);
}
export async function removerMonitorado(db: SupabaseClient, id: string) {
  const { error } = await db.from("estoque_monitorados").delete().eq("id", id);
  falha("remover anúncio", error);
}

// ---------- importar o que o favorito leu ----------
const ID_GERAL = /^[A-Za-z0-9._:-]{3,80}$/;
const STATUS_OK: StatusEstoque[] = ["em_estoque", "esgotado", "desconhecido"];
const texto = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

export function sanitizarLeituraNavegador(payload: any): { canal: string; lidos: { item_id: string; leitura: LeituraEstoque }[]; falhas: { item_id: string; motivo: string }[] } {
  if (!payload || payload.v !== 1 || payload.tipo !== "estoque" || !Array.isArray(payload.lidos) || !canalEstoqueValido(payload.canal)) throw new ErroValidacao("Esse texto não é do favorito “Ler estoque”. Copie o resultado pelo botão do favorito e cole de novo.");
  const lidos: { item_id: string; leitura: LeituraEstoque }[] = [], falhas: { item_id: string; motivo: string }[] = [];
  const ID_OK = payload.canal === CANAL_PADRAO_ESTOQUE ? /^MLB\d{6,}$/ : ID_GERAL;
  for (const x of payload.lidos.slice(0, 1000)) {
    const item_id = typeof x?.item_id === "string" && ID_OK.test(x.item_id) ? x.item_id : null;
    if (!item_id || !STATUS_OK.includes(x.status)) continue;
    const q = x.estoque === null || x.estoque === undefined ? null : Number(x.estoque);
    lidos.push({ item_id, leitura: {
      status: x.status, estoque: q !== null && Number.isFinite(q) && q >= 0 ? Math.floor(q) : null, aproximado: !!x.aproximado,
      detalhe: texto(x.detalhe, 300) || "Lido pelo navegador.", titulo: texto(x.titulo, 300), vendedor: texto(x.vendedor, 120),
      imagem: typeof x.imagem === "string" && /^https:\/\/[^\s"'<>]+$/i.test(x.imagem.trim()) ? x.imagem.trim() : null,
    } });
  }
  for (const f of Array.isArray(payload.falhas) ? payload.falhas.slice(0, 1000) : []) {
    if (typeof f?.item_id === "string" && ID_OK.test(f.item_id)) falhas.push({ item_id: f.item_id, motivo: texto(f.motivo, 200) || "falha na leitura" });
  }
  return { canal: payload.canal as string, lidos, falhas };
}

export async function importarLeituraNavegador(db: SupabaseClient, payload: unknown) {
  const { canal, lidos, falhas } = sanitizarLeituraNavegador(payload);
  const ids = Array.from(new Set([...lidos.map((l) => l.item_id), ...falhas.map((f) => f.item_id)]));
  if (!ids.length) throw new ErroValidacao("O texto não trouxe nenhum anúncio lido.");
  const { data, error } = await db.from("estoque_monitorados").select("*").eq("canal", canal).in("item_id", ids);
  falha("buscar anúncios monitorados", error);
  const porItem = new Map(((data as Monitorado[]) || []).map((m) => [m.item_id, m]));
  let atualizados = 0, desconhecidos = 0;
  const acabaram: string[] = [];
  for (const { item_id, leitura } of lidos) {
    const m = porItem.get(item_id);
    if (!m) continue;
    if (await registrarLeitura(db, m, leitura)) acabaram.push(m.titulo || leitura.titulo || item_id);
    atualizados++; if (leitura.status === "desconhecido") desconhecidos++;
  }
  for (const f of falhas) { const m = porItem.get(f.item_id); if (m) await db.from("estoque_monitorados").update({ erro: f.motivo }).eq("id", m.id); }
  return { atualizados, desconhecidos, falhas: falhas.length, ignorados: ids.length - porItem.size, acabaram };
}
