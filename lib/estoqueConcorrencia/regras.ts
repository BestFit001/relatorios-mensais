// Regras do acompanhamento (só contas, sem rede nem banco): o que muda no registro quando chega uma leitura nova.
import type { LeituraEstoque, StatusEstoque } from "./leitor";

export interface Monitorado {
  id: string; canal: string; item_id: string; url: string; titulo: string | null; vendedor: string | null; url_imagem: string | null;
  ativo: boolean; status: StatusEstoque; estoque: number | null; estoque_aproximado: boolean; detalhe: string | null; erro: string | null;
  lido_em: string | null; ultima_captura: string | null; esgotou_em: string | null; voltou_em: string | null; aviso_visto_em: string | null;
  criado_em: string; criado_por: string | null;
}

/** Aviso "acabou na concorrência" pendente: o anúncio está esgotado e ninguém marcou como visto. */
export const avisoPendente = (m: Pick<Monitorado, "ativo" | "status" | "aviso_visto_em">) => m.ativo && m.status === "esgotado" && !m.aviso_visto_em;

/**
 * Campos a gravar no monitorado depois de uma leitura que funcionou.
 * - "desconhecido" (sem sinal claro) NÃO muda o status: falta de informação não pode disparar nem apagar um aviso.
 * - em_estoque -> esgotado: marca `esgotou_em` e reabre o aviso; esgotado -> em_estoque: marca `voltou_em` e limpa o aviso.
 */
export function camposDaLeitura(atual: Pick<Monitorado, "status" | "esgotou_em" | "titulo" | "vendedor" | "url_imagem">, l: LeituraEstoque, agora: Date, hoje: string): Record<string, unknown> {
  const c: Record<string, unknown> = { lido_em: agora.toISOString(), ultima_captura: hoje, erro: null, detalhe: l.detalhe };
  if (!atual.titulo && l.titulo) c.titulo = l.titulo.slice(0, 300);
  if (!atual.vendedor && l.vendedor) c.vendedor = l.vendedor.slice(0, 120);
  if (!atual.url_imagem && l.imagem && /^https:\/\//i.test(l.imagem)) c.url_imagem = l.imagem;
  if (l.status === "desconhecido") return c;
  c.status = l.status;
  c.estoque = l.estoque;
  c.estoque_aproximado = l.aproximado;
  if (l.status === "esgotado" && atual.status !== "esgotado") { c.esgotou_em = agora.toISOString(); c.aviso_visto_em = null; c.voltou_em = null; }
  if (l.status === "em_estoque" && atual.status === "esgotado") { c.voltou_em = agora.toISOString(); c.esgotou_em = null; c.aviso_visto_em = null; }
  return c;
}

export const rotuloStatus = (s: StatusEstoque) => (s === "esgotado" ? "Acabou" : s === "em_estoque" ? "Em estoque" : "Ainda não lido");
