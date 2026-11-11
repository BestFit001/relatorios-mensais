import { NextResponse } from "next/server";
import { capturarDiario } from "../../../../lib/concorrentes/captura";
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
    const resumo = await capturarDiario(supabaseServidor(), { forcar });
    return NextResponse.json(resumo);
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || "falha na captura diária" }, { status: 500 });
  }
}

export const GET = tratar;
export const POST = tratar;
