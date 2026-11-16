import { adicionarLinks, definirAtivoEstoque, marcarAvisoVisto, removerMonitorado } from "../../../../lib/estoqueConcorrencia/servidor";
import { ehUuid, executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { ErroValidacao } from "../../../../lib/concorrentes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Adiciona links de anúncios ao acompanhamento. Corpo: { canal?, texto (um link por linha), por? } */
export async function POST(req: Request) {
  return executar(req, async (c) => {
    if (typeof c.texto !== "string" || !c.texto.trim()) throw new ErroValidacao("Cole o link do anúncio.");
    if (c.texto.length > 100_000) throw new ErroValidacao("Texto grande demais.");
    return adicionarLinks(supabaseServidor(), { canal: typeof c.canal === "string" ? c.canal : undefined, texto: c.texto, por: typeof c.por === "string" ? c.por.slice(0, 120).toLowerCase() : null });
  });
}

/** Pausa/retoma um anúncio ({ id, ativo }) ou marca o aviso "acabou" como visto ({ ids: [...], visto: true }). */
export async function PATCH(req: Request) {
  return executar(req, async (c) => {
    const db = supabaseServidor();
    if (c.visto === true && Array.isArray(c.ids) && c.ids.length && c.ids.length <= 500 && c.ids.every(ehUuid)) { await marcarAvisoVisto(db, c.ids); return { ok: true }; }
    if (ehUuid(c.id) && typeof c.ativo === "boolean") { await definirAtivoEstoque(db, c.id, c.ativo); return { ok: true }; }
    throw new ErroValidacao("Pedido inválido.");
  });
}

/** Remove um anúncio do acompanhamento (e o histórico dele). Corpo: { id } */
export async function DELETE(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.id)) throw new ErroValidacao("Pedido inválido.");
    await removerMonitorado(supabaseServidor(), c.id);
    return { ok: true };
  });
}
