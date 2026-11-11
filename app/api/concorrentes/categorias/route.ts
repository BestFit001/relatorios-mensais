import { cadastrarCategoria } from "../../../../lib/concorrentes/captura";
import { ehUuid, executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { ErroValidacao } from "../../../../lib/concorrentes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // raspar 2 páginas + abrir cada anúncio leva um tempo

/** Cadastra uma categoria: raspa as 2 primeiras páginas e grava os anúncios. Corpo: { url, canal, nome? } */
export async function POST(req: Request) {
  return executar(req, async (c) => {
    if (typeof c.url !== "string" || !c.url.trim()) throw new ErroValidacao("Informe o link da categoria.");
    if (typeof c.canal !== "string") throw new ErroValidacao("Escolha o canal.");
    return cadastrarCategoria(supabaseServidor(), { canal: c.canal, url: c.url, nome: typeof c.nome === "string" ? c.nome.slice(0, 120) : undefined });
  });
}

/** Pausa/retoma o monitoramento de uma categoria inteira. Corpo: { id, ativo } */
export async function PATCH(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.id) || typeof c.ativo !== "boolean") throw new ErroValidacao("Pedido inválido.");
    const { error } = await supabaseServidor().from("categorias").update({ ativo: c.ativo }).eq("id", c.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
