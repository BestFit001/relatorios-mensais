import { adicionarAnuncioAvulso, definirAtivo } from "../../../../lib/concorrentes/captura";
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

/** Desativa (ou reativa) um anúncio: o histórico é mantido. Corpo: { id, ativo } */
export async function PATCH(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.id) || typeof c.ativo !== "boolean") throw new ErroValidacao("Pedido inválido.");
    await definirAtivo(supabaseServidor(), c.id, c.ativo);
    return { ok: true };
  });
}
