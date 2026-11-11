// Tipos, formatos e acesso a dados compartilhados pelas abas do monitor de concorrentes.
import { buscarTudo } from "../../../lib/buscarTudo";
import type { Ponto } from "../../../lib/concorrentes/historico";

export interface Categoria { id: string; nome: string; canal: string; url_origem: string; ativo: boolean; criado_em: string; ultima_raspagem: string | null }
export interface Anuncio {
  id: string; categoria_id: string; mlb_id: string; titulo: string; vendedor: string | null; marca: string | null; url_anuncio: string; url_imagem: string | null;
  ativo: boolean; manual: boolean; favorito: boolean; ultimo_preco: number | null; ultimo_total_vendas: number | null; ultimo_aproximado: boolean;
  ultimas_vendas_dia: number | null; ultima_captura: string | null;
  ranking_posicao: number | null; ranking_anterior: number | null; ranking_data: string | null; ranking_data_anterior: string | null;
}
export interface Comparativo {
  id: string; anuncio_id: string; sku: string; meu_url: string | null; meu_mlb_id: string | null; meu_titulo: string | null;
  meu_preco: number | null; meu_preco_em: string | null; canal_meu: string; canal_concorrente: string; custo_manual: number | null; criado_em: string;
}

export const COLUNAS_ANUNCIO = "id,categoria_id,mlb_id,titulo,vendedor,marca,url_anuncio,url_imagem,ativo,manual,favorito,ultimo_preco,ultimo_total_vendas,ultimo_aproximado,ultimas_vendas_dia,ultima_captura,ranking_posicao,ranking_anterior,ranking_data,ranking_data_anterior";

const nm = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** Linha do banco -> Anuncio com números de verdade (o banco pode devolver numeric como texto). */
export const lerAnuncio = (r: any): Anuncio => ({ ...r, ultimo_preco: nm(r.ultimo_preco), ultimo_total_vendas: nm(r.ultimo_total_vendas), ultimas_vendas_dia: nm(r.ultimas_vendas_dia), favorito: Boolean(r.favorito), ultimo_aproximado: Boolean(r.ultimo_aproximado), ranking_posicao: nm(r.ranking_posicao), ranking_anterior: nm(r.ranking_anterior), ranking_data: r.ranking_data ?? null, ranking_data_anterior: r.ranking_data_anterior ?? null });
export const lerComparativo = (r: any): Comparativo => ({ ...r, meu_preco: nm(r.meu_preco), custo_manual: nm(r.custo_manual) });

export const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));
export const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
export const pct = (v: number | null | undefined, casas = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`);
/** Total de vendas como o canal mostra: faixa ("+5.000") ou número exato. */
export const totalVendido = (a: Pick<Anuncio, "ultimo_total_vendas" | "ultimo_aproximado">) => (a.ultimo_total_vendas == null ? "—" : `${a.ultimo_aproximado ? "+" : ""}${num(a.ultimo_total_vendas)}`);

/** Chama as rotas /api/concorrentes/*; devolve o JSON ou lança Error com a mensagem do servidor. */
export async function chamar<T = any>(rota: string, metodo: "POST" | "PATCH" | "DELETE", corpo: unknown): Promise<T> {
  const r = await fetch(`/api/concorrentes/${rota}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return j as T;
}

export const caixa = "rounded-2xl border border-slate-800 bg-slate-900/60";
export const campo = "min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-slate-600";
export const botao = "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

export const JANELA_HISTORICO_DIAS = 90;

/** Histórico dos últimos 90 dias, agrupado por anúncio (em lotes de ids para a consulta não ficar grande demais). */
export async function lerHistorico(ids: string[], desde: string): Promise<Record<string, Ponto[]>> {
  const out: Record<string, Ponto[]> = {};
  for (let i = 0; i < ids.length; i += 80) {
    const lote = ids.slice(i, i + 80);
    const linhas = await buscarTudo("historico_diario", "anuncio_id,data_captura,preco,total_vendas_acumulado,vendas_aproximado", (q) => q.in("anuncio_id", lote).gte("data_captura", desde));
    for (const l of linhas) (out[l.anuncio_id] ||= []).push({ data: String(l.data_captura).slice(0, 10), preco: nm(l.preco), total: nm(l.total_vendas_acumulado), aproximado: Boolean(l.vendas_aproximado) });
  }
  return out;
}

export interface AcoesAnuncio {
  alternarFavorito: (a: Anuncio) => void;
  abrirComparativo: (a: Anuncio) => void;
  temComparativo: (anuncioId: string) => boolean;
}
