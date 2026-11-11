import { adicionarAnuncioAvulso, definirAtivo, definirFavorito } from "../../../../lib/concorrentes/captura";
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

/** Desativa/reativa um anúncio (o histórico é mantido) e/ou marca como favorito. Corpo: { id, ativo? , favorito? } */
export async function PATCH(req: Request) {
  return executar(req, async (c) => {
    const temAtivo = typeof c.ativo === "boolean", temFavorito = typeof c.favorito === "boolean";
    if (!ehUuid(c.id) || (!temAtivo && !temFavorito)) throw new ErroValidacao("Pedido inválido.");
    const db = supabaseServidor();
    if (temAtivo) await definirAtivo(db, c.id, c.ativo);
    if (temFavorito) await definirFavorito(db, c.id, c.favorito);
    return { ok: true };
  });
}
