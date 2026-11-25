import { NextResponse } from "next/server";
import { provedoresConfigurados } from "../../../lib/iaProvedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Diz só se a IA está configurada no servidor (true/false). Nunca devolve a chave nem parte dela. */
export async function GET() {
  return NextResponse.json({ configurada: provedoresConfigurados().length > 0 });
}
