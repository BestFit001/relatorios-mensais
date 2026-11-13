import { NextResponse } from "next/server";
import { mesmaOrigem } from "../../../lib/concorrentes/servidor";
import { tratarChat } from "../../../lib/chatServidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Única porta do chat: { acao, dados } + cabeçalho Authorization: Bearer <token da sessão do chat> */
export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: "origem não permitida" }, { status: 403 });
  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo.acao !== "string") return NextResponse.json({ erro: "pedido inválido" }, { status: 400 });
  const auth = req.headers.get("authorization") || "";
  const r = await tratarChat(corpo.acao, corpo.dados, auth.startsWith("Bearer ") ? auth.slice(7) : null);
  return NextResponse.json(r.corpo, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
