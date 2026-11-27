import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { mesmaOrigem } from "../../../../lib/concorrentes/servidor";
import { chavesCanva, MSG_SEM_CHAVES, novoPKCE, urlDeAutorizacao, urlDeRetorno } from "../../../../lib/canva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Passo 1 da conexão: só um clique dentro do próprio site inicia (POST na mesma origem). Guarda o verificador PKCE e o "state" em cookies
 *  httpOnly de 10 min e devolve a URL de autorização do Canva — o navegador então vai até lá e volta em /api/canva/callback. */
export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: "origem não permitida" }, { status: 403 });
  const ch = chavesCanva();
  if (!ch) return NextResponse.json({ erro: MSG_SEM_CHAVES }, { status: 503 });
  const { verificador, desafio, estado } = novoPKCE();
  const jar = await cookies();
  const opcoes = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/canva", maxAge: 600 };
  jar.set("canva_v", verificador, opcoes);
  jar.set("canva_s", estado, opcoes);
  return NextResponse.json({ url: urlDeAutorizacao(ch.id, urlDeRetorno(req), desafio, estado) }, { headers: { "Cache-Control": "no-store" } });
}
