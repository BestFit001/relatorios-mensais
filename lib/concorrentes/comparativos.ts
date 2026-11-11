// "Igual ao meu": liga um anúncio de concorrente a um anúncio meu (link + SKU) e guarda o meu preço.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePreco } from "./calculos";
import { canalValido } from "./comparativo";
import { canalDoPayload, sanitizarPayload } from "./importacao";
import { CANAIS } from "./canais";
import { anuncioDeQualquerCanal } from "./urls";
import { ErroValidacao, type AnuncioRaspado } from "./tipos";

const em = <T,>(l: T[], n: number): T[][] => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, (i + 1) * n));

function falha(contexto: string, error: { message: string } | null) {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

/** Texto copiado pelo favorito na página do MEU anúncio -> o anúncio (exatamente um). */
function anuncioDoTexto(texto: string): AnuncioRaspado {
  let bruto: unknown;
  try { bruto = JSON.parse(texto); } catch { throw new ErroValidacao("O texto colado não está completo. Use o botão Copiar do favorito, na página do seu anúncio, e cole tudo."); }
  const p = sanitizarPayload(bruto, canalDoPayload(bruto));
  if (p.anuncios.length !== 1) throw new ErroValidacao("Esse texto tem vários anúncios. Abra a página do SEU anúncio (não uma lista), clique no favorito e cole aqui.");
  return p.anuncios[0];
}

const precoValido = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = parsePreco(v);
  if (n == null || !(n > 0) || n >= 10_000_000) throw new ErroValidacao("Preço inválido.");
  return Math.round(n * 100) / 100;
};

export interface EntradaComparativo {
  anuncio_id: string;
  sku: unknown;
  meu_url?: unknown;
  texto?: unknown;
  meu_preco?: unknown;
  canal_meu?: unknown;
  canal_concorrente?: unknown;
  custo_manual?: unknown;
}

/** Cria (ou refaz) o comparativo de um anúncio de concorrente. */
export async function salvarComparativo(db: SupabaseClient, e: EntradaComparativo) {
  const sku = typeof e.sku === "string" ? e.sku.trim() : "";
  if (!sku || sku.length > 40) throw new ErroValidacao("Informe o SKU do seu produto.");

  const { data: anuncio, error: e1 } = await db.from("anuncios").select("id,categoria_id").eq("id", e.anuncio_id).maybeSingle();
  falha("buscar anúncio", e1);
  if (!anuncio) throw new ErroValidacao("Anúncio do concorrente não encontrado.");
  // canal padrão = o canal em que o concorrente vende (o meu anúncio costuma estar no mesmo)
  const { data: cat, error: e1b } = await db.from("categorias").select("canal").eq("id", anuncio.categoria_id).maybeSingle();
  falha("buscar categoria", e1b);
  const canalPadrao = CANAIS.find((c) => c.id === cat?.canal)?.canalAnalise ?? "Mercado Livre 1 Clássico";

  let meuMlb: string | null = null, meuUrl: string | null = null, meuTitulo: string | null = null, precoDoTexto: number | null = null;
  if (typeof e.texto === "string" && e.texto.trim()) {
    const a = anuncioDoTexto(e.texto);
    meuMlb = a.mlb_id; meuUrl = a.url_anuncio; meuTitulo = a.titulo; precoDoTexto = a.preco;
  } else if (typeof e.meu_url === "string" && e.meu_url.trim()) {
    const l = anuncioDeQualquerCanal(e.meu_url.trim());
    meuMlb = l.mlb_id; meuUrl = l.url;
  } else {
    throw new ErroValidacao("Cole o link do seu anúncio.");
  }

  const preco = precoValido(e.meu_preco) ?? precoDoTexto;
  const custoManual = e.custo_manual == null || e.custo_manual === "" ? null : precoValido(e.custo_manual);
  const linha = {
    anuncio_id: e.anuncio_id, sku,
    meu_url: meuUrl, meu_mlb_id: meuMlb, meu_titulo: meuTitulo,
    meu_preco: preco, meu_preco_em: preco != null ? new Date().toISOString() : null,
    canal_meu: canalValido(e.canal_meu) ? e.canal_meu : canalPadrao,
    // o canal do concorrente é o canal em que ele vende: no ML só muda a modalidade; Amazon e Shopee têm um canal só
    canal_concorrente: canalValido(e.canal_concorrente) && (cat?.canal ?? "mercadolivre") === "mercadolivre" && e.canal_concorrente.includes("Mercado Livre") ? e.canal_concorrente : canalPadrao,
    custo_manual: custoManual,
  };
  const { data, error } = await db.from("comparativos").upsert(linha, { onConflict: "anuncio_id" }).select("*").single();
  falha("gravar comparativo", error);
  return { comparativo: data };
}

/** Atualiza o meu preço de um comparativo: digitado ou lido pelo favorito na página do meu anúncio. */
export async function atualizarPrecoMeu(db: SupabaseClient, e: { id: string; texto?: unknown; meu_preco?: unknown }) {
  let preco = precoValido(e.meu_preco);
  let titulo: string | null = null;
  if (preco == null && typeof e.texto === "string" && e.texto.trim()) {
    const a = anuncioDoTexto(e.texto);
    if (a.preco == null) throw new ErroValidacao("O favorito não conseguiu ler o preço nessa página. Digite o preço.");
    preco = a.preco; titulo = a.titulo;
    const { data: atual, error: e0 } = await db.from("comparativos").select("meu_mlb_id").eq("id", e.id).maybeSingle();
    falha("buscar comparativo", e0);
    if (atual?.meu_mlb_id && atual.meu_mlb_id !== a.mlb_id) throw new ErroValidacao(`Esse texto é de outro anúncio (${a.mlb_id}); este comparativo é do ${atual.meu_mlb_id}.`);
  }
  if (preco == null) throw new ErroValidacao("Informe o preço.");
  const { data, error } = await db.from("comparativos")
    .update({ meu_preco: preco, meu_preco_em: new Date().toISOString(), ...(titulo ? { meu_titulo: titulo } : {}) })
    .eq("id", e.id).select("*").maybeSingle();
  falha("atualizar preço", error);
  if (!data) throw new ErroValidacao("Comparativo não encontrado.");
  return { comparativo: data };
}

export async function removerComparativo(db: SupabaseClient, id: string) {
  const { error } = await db.from("comparativos").delete().eq("id", id);
  falha("remover comparativo", error);
}

/**
 * Quando uma importação traz um anúncio que é o MEU de algum comparativo (mesmo MLB), o meu preço é atualizado junto.
 * Devolve quantos comparativos foram atualizados.
 */
export async function atualizarPrecosMeusDeImportacao(db: SupabaseClient, anuncios: { mlb_id: string; preco: number | null }[]): Promise<number> {
  const comPreco = new Map(anuncios.filter((a) => a.preco != null).map((a) => [a.mlb_id, a.preco as number]));
  if (!comPreco.size) return 0;
  let n = 0;
  for (const lote of em(Array.from(comPreco.keys()), 100)) {
    const { data, error } = await db.from("comparativos").select("id,meu_mlb_id").in("meu_mlb_id", lote);
    falha("buscar comparativos", error);
    for (const c of data || []) {
      const { error: e2 } = await db.from("comparativos").update({ meu_preco: comPreco.get(c.meu_mlb_id), meu_preco_em: new Date().toISOString() }).eq("id", c.id);
      falha("atualizar meu preço", e2);
      n++;
    }
  }
  return n;
}
