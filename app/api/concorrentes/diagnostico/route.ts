import { obterConector } from "../../../../lib/concorrentes/marketplaces";
import { executar } from "../../../../lib/concorrentes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Testa, DE DENTRO da Vercel, o que o Mercado Livre deixa o servidor fazer (API e páginas). */
export async function POST(req: Request) {
  return executar(req, async () => {
    const itens = await obterConector("mercadolivre").diagnosticar();
    return { itens, proxy: Boolean(process.env.ML_SCRAPER_URL_TEMPLATE), estrategia: process.env.ML_ESTRATEGIA || "auto" };
  });
}
