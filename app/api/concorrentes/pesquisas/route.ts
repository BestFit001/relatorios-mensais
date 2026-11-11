import { atualizarPesquisa, criarPesquisa, importarResultados, removerPesquisa } from "../../../../lib/concorrentes/pesquisa";
import { ehUuid, executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { ErroValidacao } from "../../../../lib/concorrentes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Cria a pesquisa (um produto meu: SKU + meu PDV + termo). A imagem NÃO vai para o servidor. Corpo: { sku, meu_pdv?, termo?, ean? } */
export async function POST(req: Request) {
  return executar(req, async (c) => criarPesquisa(supabaseServidor(), { sku: c.sku, meu_pdv: c.meu_pdv, termo: c.termo, ean: c.ean }));
}

/** Importa o que o favorito leu no Google ou ajusta meu PDV/termo. Corpo: { id, texto } ou { id, meu_pdv?, termo?, ean? } */
export async function PATCH(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.id)) throw new ErroValidacao("Pedido inválido.");
    if (c.texto !== undefined) {
      if (typeof c.texto !== "string" || !c.texto.trim()) throw new ErroValidacao("Cole o texto que o favorito copiou no Google.");
      if (c.texto.length > 1_000_000) throw new ErroValidacao("Texto grande demais.");
      let payload: unknown;
      try { payload = JSON.parse(c.texto); } catch { throw new ErroValidacao("O texto colado não está completo. Use o botão Copiar do favorito e cole tudo."); }
      return importarResultados(supabaseServidor(), { pesquisa_id: c.id, payload });
    }
    return atualizarPesquisa(supabaseServidor(), { id: c.id, meu_pdv: c.meu_pdv, termo: c.termo, ean: c.ean });
  });
}

/** Remove a pesquisa e as ofertas dela. Corpo: { id } */
export async function DELETE(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.id)) throw new ErroValidacao("Pedido inválido.");
    await removerPesquisa(supabaseServidor(), c.id);
    return { ok: true };
  });
}
