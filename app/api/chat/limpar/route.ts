import { NextResponse } from "next/server";
import { autorizarCron, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { limparExpirados } from "../../../../lib/chatServidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cron diário da Vercel: apaga as mensagens e imagens do chat com mais de 7 dias. */
export async function GET(req: Request) {
  const a = autorizarCron(req);
  if (a === "sem_segredo") return NextResponse.json({ erro: "CRON_SECRET não configurado" }, { status: 500 });
  if (a === "negado") return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const r = await limparExpirados(supabaseServidor(), true);
  return NextResponse.json({ ok: true, ...r });
}
