import { NextResponse } from "next/server";
import { statusConexao } from "../../../../lib/canva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Só diz se há chaves e se o Canva está conectado. Nunca devolve token nem chave. */
export async function GET() {
  return NextResponse.json(await statusConexao(), { headers: { "Cache-Control": "no-store" } });
}
