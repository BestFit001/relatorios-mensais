import { adicionarPrioritarios } from "../../../../lib/concorrentes/captura";
import { executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { ErroValidacao } from "../../../../lib/concorrentes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Monitoramento prioritário: cadastra links diretos de anúncios. Corpo: { texto: string (um link por linha), canal? } */
export async function POST(req: Request) {
  return executar(req, async (c) => {
    if (typeof c.texto !== "string" || !c.texto.trim()) throw new ErroValidacao("Cole os links dos anúncios (um por linha).");
    if (c.texto.length > 100_000) throw new ErroValidacao("Texto grande demais.");
    const urls = c.texto.split(/[\r\n\s,;]+/).filter(Boolean);
    return adicionarPrioritarios(supabaseServidor(), { canal: typeof c.canal === "string" ? c.canal : undefined, urls });
  });
}
