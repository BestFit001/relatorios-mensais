import { NextResponse } from "next/server";
import { capturarDiario } from "../../../../lib/concorrentes/captura";
import { capturarEstoque } from "../../../../lib/estoqueConcorrencia/servidor";
import { autorizarCron, supabaseServidor } from "../../../../lib/concorrentes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Captura diária dos anúncios monitorados (agendada em vercel.json).
 * Auth: `Authorization: Bearer $CRON_SECRET` (a Vercel envia sozinha) ou `x-cron-secret`.
 * `?forcar=1` recaptura até quem já foi capturado hoje.
 */
async function tratar(req: Request) {
  const auth = autorizarCron(req);
  if (auth === "sem_segredo") return NextResponse.json({ erro: "CRON_SECRET não está configurada na Vercel; a rota não roda sem ela." }, { status: 503 });
  if (auth === "negado") return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  try {
    const forcar = new URL(req.url).searchParams.get("forcar") === "1";
    const db = supabaseServidor();
    const t0 = Date.now();
    const resumo = await capturarDiario(db, { forcar, orcamentoMs: 40_000 });   // sobra tempo para a leitura de estoque (a rota para em 60 s)
    // Acompanhamento de estoque da concorrência: roda na mesma chamada diária (com o tempo que sobrar) e nunca derruba a captura de preços
    let estoque: unknown = null;
    try { estoque = await capturarEstoque(db, { forcar, orcamentoMs: Math.max(6_000, 54_000 - (Date.now() - t0)) }); } catch (e: any) { estoque = { erro: e?.message || "falha na leitura de estoque" }; }
    return NextResponse.json({ ...resumo, estoque });
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || "falha na captura diária" }, { status: 500 });
  }
}

export const GET = tratar;
export const POST = tratar;
