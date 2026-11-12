import { adicionarAnuncioAvulso, definirAtivo, definirFavorito, definirPrioritario } from "../../../../lib/concorrentes/captura";
import { ehUuid, executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { ErroValidacao } from "../../../../lib/concorrentes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Adiciona um anúncio avulso (por link) a uma categoria existente. Corpo: { categoria_id, url } */
export async function POST(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.categoria_id)) throw new ErroValidacao("Escolha a categoria.");
    if (typeof c.url !== "string" || !c.url.trim()) throw new ErroValidacao("Cole o link do anúncio.");
    return adicionarAnuncioAvulso(supabaseServidor(), { categoria_id: c.categoria_id, url: c.url });
  });
}

/** Desativa/reativa um anúncio (o histórico é mantido), marca como favorito e/ou como prioritário. Corpo: { id, ativo?, favorito?, prioritario? } */
export async function PATCH(req: Request) {
  return executar(req, async (c) => {
    const temAtivo = typeof c.ativo === "boolean", temFavorito = typeof c.favorito === "boolean", temPrioritario = typeof c.prioritario === "boolean";
    if (!ehUuid(c.id) || (!temAtivo && !temFavorito && !temPrioritario)) throw new ErroValidacao("Pedido inválido.");
    const db = supabaseServidor();
    if (temAtivo) await definirAtivo(db, c.id, c.ativo);
    if (temFavorito) await definirFavorito(db, c.id, c.favorito);
    if (temPrioritario) await definirPrioritario(db, c.id, c.prioritario);
    return { ok: true };
  });
}
