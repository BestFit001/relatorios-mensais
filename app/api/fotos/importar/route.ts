import { executar } from "../../../../lib/concorrentes/servidor";
import { importarFotos } from "../../../../lib/fotos/importar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Modo gratuito (sem API): recebe o que o favorito leu no Bing Imagens, mede as fotos e ordena pela resolução. Corpo: { texto } */
export async function POST(req: Request) {
  return executar(req, async (c) => importarFotos(c.texto));
}
