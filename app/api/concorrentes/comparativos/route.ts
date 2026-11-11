import { atualizarPrecoMeu, removerComparativo, salvarComparativo } from "../../../../lib/concorrentes/comparativos";
import { ehUuid, executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { ErroValidacao } from "../../../../lib/concorrentes/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const TEXTO_MAX = 200_000;
const texto = (v: unknown) => {
  if (v == null || v === "") return undefined;
  if (typeof v !== "string" || v.length > TEXTO_MAX) throw new ErroValidacao("Texto inválido ou grande demais.");
  return v;
};

/** Marca um anúncio de concorrente como igual a um anúncio meu (cria ou refaz). Corpo: { anuncio_id, sku, meu_url? | texto?, meu_preco?, canal_meu?, canal_concorrente?, custo_manual? } */
export async function POST(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.anuncio_id)) throw new ErroValidacao("Escolha o anúncio do concorrente.");
    return salvarComparativo(supabaseServidor(), {
      anuncio_id: c.anuncio_id, sku: c.sku, meu_url: c.meu_url, texto: texto(c.texto),
      meu_preco: c.meu_preco, canal_meu: c.canal_meu, canal_concorrente: c.canal_concorrente, custo_manual: c.custo_manual,
    });
  });
}

/** Atualiza o meu preço. Corpo: { id, meu_preco? | texto? } */
export async function PATCH(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.id)) throw new ErroValidacao("Pedido inválido.");
    return atualizarPrecoMeu(supabaseServidor(), { id: c.id, texto: texto(c.texto), meu_preco: c.meu_preco });
  });
}

/** Remove o comparativo (o anúncio do concorrente continua monitorado). Corpo: { id } */
export async function DELETE(req: Request) {
  return executar(req, async (c) => {
    if (!ehUuid(c.id)) throw new ErroValidacao("Pedido inválido.");
    await removerComparativo(supabaseServidor(), c.id);
    return { ok: true };
  });
}
