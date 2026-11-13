// Vídeos "com problemas" -> correções para os analistas dos canais. Só lógica (sem rede nem tela), para poder testar.
import { normalizarNomeCanal } from "./vendasCanaisLogica";

export const STATUS_SEM_ESTOQUE = "__sem_estoque";   // chave dentro de clipes_enviados (não é canal)
export type SituacaoVideo = "" | "sem_estoque" | "com_problemas";

export interface CorrecaoCanal { id?: number; correcao_id: number; canal: string; feito: boolean; feito_por?: string | null; feito_em?: string | null }
export interface Correcao { id: number; sku_pai: string; produto?: string | null; origem?: string | null; status: string; criado_por?: string | null; criado_em?: string | null; concluido_em?: string | null }
export interface Responsavel { email: string; canal: string }

const mesmoCanal = (a: any, b: any) => normalizarNomeCanal(a) === normalizarNomeCanal(b);
const email = (e: any) => String(e ?? "").trim().toLowerCase();

/** Canais ativos em que o produto ainda NÃO está marcado (em todos os itens do grupo): para estes vai a correção. */
export function canaisNaoMarcados(itens: { clipes_enviados?: Record<string, any> | null }[], canaisAtivos: string[]): string[] {
  return canaisAtivos.filter((c) => !itens.every((it) => Boolean((it.clipes_enviados || {})[c])));
}

/** E-mails dos responsáveis do canal (home_responsaveis_canais). */
export function responsaveisDoCanal(resp: Responsavel[], canal: string): string[] {
  return Array.from(new Set(resp.filter((r) => mesmoCanal(r.canal, canal)).map((r) => email(r.email))));
}

/** O analista só marca os canais dele; o administrador marca qualquer um. */
export function podeMarcarCanal(usuario: { email: string; perfil: string } | null, resp: Responsavel[], canal: string): boolean {
  if (!usuario) return false;
  if (usuario.perfil === "admin") return true;
  return responsaveisDoCanal(resp, canal).includes(email(usuario.email));
}

/** Correção concluída = tem canais e todos estão feitos. */
export function correcaoConcluida(canais: Pick<CorrecaoCanal, "feito">[]): boolean {
  return canais.length > 0 && canais.every((c) => c.feito);
}

/** SKU Pai com correção aberta: some da aba Vídeos. */
export function paisEmCorrecao(correcoes: Pick<Correcao, "sku_pai" | "status">[]): Set<string> {
  return new Set(correcoes.filter((c) => c.status === "aberta").map((c) => String(c.sku_pai)));
}

/** Situação mostrada na lista de seleção da linha. */
export function situacaoDoItem(itens: { clipes_enviados?: Record<string, any> | null }[]): SituacaoVideo {
  return itens.length > 0 && itens.every((it) => Boolean((it.clipes_enviados || {})[STATUS_SEM_ESTOQUE])) ? "sem_estoque" : "";
}

/** Linhas pendentes de correção que a pessoa enxerga: do analista = canais dele; do admin = todos (ou os do analista filtrado). */
export function correcoesVisiveis(
  correcoes: Correcao[], canais: CorrecaoCanal[], resp: Responsavel[],
  opc: { admin: boolean; email?: string },
): { correcao: Correcao; canais: CorrecaoCanal[] }[] {
  const alvo = email(opc.email);
  return correcoes
    .filter((c) => c.status === "aberta")
    .map((c) => {
      const todos = canais.filter((x) => x.correcao_id === c.id);
      const meus = alvo || !opc.admin ? todos.filter((x) => responsaveisDoCanal(resp, x.canal).includes(alvo)) : todos;
      return { correcao: c, canais: meus };
    })
    .filter((x) => x.canais.length > 0);
}

// ---------------------------------------------------------------- situação do produto na aba Vídeos
export type EstadoCorrecao = "nenhum" | "aberta" | "corrigido" | "sem_acao";

/**
 * Situação do SKU Pai conforme a correção MAIS RECENTE dele:
 *  - "aberta": os analistas ainda estão corrigindo → o produto fica em "concluído" na aba Vídeos (se já tem algum canal marcado);
 *  - "corrigido": fechou com pelo menos um canal "Resolvido" → volta para os pendentes com a tag verde "Corrigido";
 *  - "sem_acao": fechou só com "Sem ação efetiva" → nada mudou para o produto, continua em "concluído".
 */
export function estadoDaCorrecao(
  skuPai: string, correcoes: Pick<Correcao, "id" | "sku_pai" | "status">[], canais: Pick<CorrecaoCanal, "id" | "correcao_id" | "feito">[], semAcao: Set<number>,
): EstadoCorrecao {
  const doPai = correcoes.filter((c) => String(c.sku_pai) === String(skuPai)).sort((a, b) => b.id - a.id);
  const ultima = doPai[0];
  if (!ultima) return "nenhum";
  if (ultima.status === "aberta") return "aberta";
  const linhas = canais.filter((x) => x.correcao_id === ultima.id);
  if (linhas.length === 0) return "nenhum";
  return linhas.some((x) => x.feito && !(x.id !== undefined && semAcao.has(x.id))) ? "corrigido" : "sem_acao";
}
