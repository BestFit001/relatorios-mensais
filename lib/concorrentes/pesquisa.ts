// Pesquisa por imagem / Google: o favorito lê a página de resultados do Google (Shopping ou Lens) NO NAVEGADOR e cola aqui.
// Cada resultado vira uma "oferta" (loja, preço, link); as lojas que batem com os meus canais são ligadas ao canal da Análise de mercado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePreco } from "./calculos";
import { imagemSegura } from "./mercadolivre/url";
import { ErroValidacao } from "./tipos";

export const MAX_RESULTADOS = 200;

/** Lojas conhecidas -> canal da Análise de mercado (o que tem taxas cadastradas). Quem não bate fica "fora dos meus canais". */
const LOJAS: { padrao: RegExp; nome: string; canal: string }[] = [
  { padrao: /mercado\s*li[vb]re|mercadolivre|mercadolibre/i, nome: "Mercado Livre", canal: "Mercado Livre 1 Clássico" },
  { padrao: /amazon/i, nome: "Amazon", canal: "Amazon" },
  { padrao: /shopee/i, nome: "Shopee", canal: "Shopee" },
  { padrao: /magalu|magazine\s*luiza|magazinevoce/i, nome: "Magalu", canal: "Magalu" },
  { padrao: /netshoes/i, nome: "Netshoes", canal: "Netshoes" },
  { padrao: /shein/i, nome: "Shein", canal: "Shein" },
  { padrao: /tiktok/i, nome: "TikTok Shop", canal: "TikTok Shop" },
  { padrao: /centauro/i, nome: "Centauro", canal: "Centauro" },
];

/** Loja (nome ou domínio) -> canal meu compatível, ou null. */
export function canalDaLoja(loja: string | null | undefined, host?: string | null): { nome: string | null; canal: string | null } {
  for (const t of [host, loja]) {
    if (!t) continue;
    const l = LOJAS.find((x) => x.padrao.test(t));
    if (l) return { nome: l.nome, canal: l.canal };
  }
  return { nome: null, canal: null };
}

const limpo = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface ResultadoLimpo {
  chave: string; titulo: string; loja: string | null; host: string | null; canal: string | null;
  preco: number; url: string | null; url_imagem: string | null;
}
export interface PesquisaLimpa { termo: string | null; resultados: ResultadoLimpo[]; descartados: number }

/** Conserta o link do Google ("/url?q=https://loja…") e só aceita https; o resto vira null (a oferta continua, sem link). */
export function linkDaOferta(bruto: unknown): { url: string | null; host: string | null } {
  if (typeof bruto !== "string" || bruto.length > 2000) return { url: null, host: null };
  try {
    let u = new URL(bruto.trim());
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && /^\/(url|aclk)$/.test(u.pathname)) {
      const alvo = u.searchParams.get("url") || u.searchParams.get("q") || u.searchParams.get("adurl");
      if (!alvo) return { url: null, host: null };
      u = new URL(alvo);
    }
    if (u.protocol !== "https:" || u.username || u.password) return { url: null, host: null };
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    // link do próprio Google (produto no Shopping) é guardado como está, mas não conta como "loja"
    const url = `${u.protocol}//${u.hostname}${u.pathname}${u.search}`.slice(0, 800);
    return { url, host: /(^|\.)google\.[a-z.]+$/i.test(host) ? null : host };
  } catch { return { url: null, host: null }; }
}

/** Confere TUDO o que o favorito mandou do Google antes de ir para o banco. */
export function sanitizarPesquisa(bruto: unknown): PesquisaLimpa {
  const p = bruto as any;
  if (!p || typeof p !== "object" || p.v !== 1 || p.tipo !== "pesquisa" || !Array.isArray(p.resultados)) {
    throw new ErroValidacao("Texto inválido. Abra a pesquisa no Google (Shopping ou Lens), clique no favorito e cole o texto que ele copiou.");
  }
  if (!p.resultados.length) throw new ErroValidacao("O texto não tem nenhum resultado.");
  if (p.resultados.length > MAX_RESULTADOS) throw new ErroValidacao(`Resultados demais de uma vez (máximo ${MAX_RESULTADOS}).`);
  const vistos = new Map<string, ResultadoLimpo>();
  const resultados: ResultadoLimpo[] = [];
  let descartados = 0;
  for (const r of p.resultados) {
    const titulo = limpo(r?.titulo, 300);
    const preco = parsePreco(r?.preco);
    if (!titulo || preco == null || !(preco > 0) || preco >= 10_000_000) { descartados++; continue; }
    const { url, host } = linkDaOferta(r?.url);
    const loja = limpo(r?.loja, 80);
    const { canal } = canalDaLoja(loja, host);
    const chave = `${semAcento(loja || host || "?")}|${semAcento(titulo).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80)}`;
    const precoArredondado = Math.round(preco * 100) / 100;
    const jaTem = vistos.get(chave);
    if (jaTem) {
      // mesma loja e mesmo título duas vezes na leitura: fica a oferta mais barata
      descartados++;
      if (precoArredondado < jaTem.preco) { jaTem.preco = precoArredondado; jaTem.url = url ?? jaTem.url; }
      continue;
    }
    const nova: ResultadoLimpo = { chave, titulo, loja: loja || host, host, canal, preco: precoArredondado, url, url_imagem: imagemSegura(typeof r?.imagem === "string" ? r.imagem.slice(0, 500) : null) };
    vistos.set(chave, nova);
    resultados.push(nova);
  }
  if (!resultados.length) throw new ErroValidacao("Nenhum resultado com título e preço no texto. Confira se a página do Google mostra os preços (use a aba Shopping).");
  return { termo: limpo(p.termo, 160), resultados, descartados };
}

function falha(contexto: string, error: { message: string } | null) {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

const precoOpcional = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = parsePreco(v);
  if (n == null || !(n > 0) || n >= 10_000_000) throw new ErroValidacao("Preço inválido.");
  return Math.round(n * 100) / 100;
};

export async function criarPesquisa(db: SupabaseClient, e: { sku: unknown; meu_pdv?: unknown; termo?: unknown }) {
  const sku = typeof e.sku === "string" ? e.sku.trim() : "";
  if (!sku || sku.length > 40) throw new ErroValidacao("Informe o SKU do seu produto.");
  const { data, error } = await db.from("pesquisas_imagem").insert({ sku, meu_pdv: precoOpcional(e.meu_pdv), termo: limpo(e.termo, 160) }).select("*").single();
  falha("criar pesquisa", error);
  return { pesquisa: data };
}

export async function atualizarPesquisa(db: SupabaseClient, e: { id: string; meu_pdv?: unknown; termo?: unknown }) {
  const campos: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (e.meu_pdv !== undefined) campos.meu_pdv = precoOpcional(e.meu_pdv);
  if (e.termo !== undefined) campos.termo = limpo(e.termo, 160);
  const { data, error } = await db.from("pesquisas_imagem").update(campos).eq("id", e.id).select("*").maybeSingle();
  falha("atualizar pesquisa", error);
  if (!data) throw new ErroValidacao("Pesquisa não encontrada.");
  return { pesquisa: data };
}

export async function removerPesquisa(db: SupabaseClient, id: string) {
  const { error } = await db.from("pesquisas_imagem").delete().eq("id", id);
  falha("remover pesquisa", error);
}

/** Grava as ofertas lidas no Google. Ler de novo atualiza o preço das que já existem (mesma loja + mesmo título = a mesma linha). */
export async function importarResultados(db: SupabaseClient, e: { pesquisa_id: string; payload: unknown }) {
  const p = sanitizarPesquisa(e.payload);
  const { data: pesq, error: e1 } = await db.from("pesquisas_imagem").select("id,termo").eq("id", e.pesquisa_id).maybeSingle();
  falha("buscar pesquisa", e1);
  if (!pesq) throw new ErroValidacao("Pesquisa não encontrada.");
  const agora = new Date().toISOString();
  const linhas = p.resultados.map((r) => ({ pesquisa_id: pesq.id, chave: r.chave, titulo: r.titulo, loja: r.loja, host: r.host, canal: r.canal, preco: r.preco, url: r.url, url_imagem: r.url_imagem, capturado_em: agora }));
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await db.from("pesquisa_resultados").upsert(linhas.slice(i, i + 200), { onConflict: "pesquisa_id,chave" });
    falha("gravar resultados", error);
  }
  await db.from("pesquisas_imagem").update({ atualizado_em: agora, ...(!pesq.termo && p.termo ? { termo: p.termo } : {}) }).eq("id", pesq.id);
  return { recebidos: p.resultados.length, descartados: p.descartados, nosMeusCanais: p.resultados.filter((r) => r.canal).length };
}
