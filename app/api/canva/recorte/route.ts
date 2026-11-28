import { NextResponse } from "next/server";
import { mesmaOrigem } from "../../../../lib/concorrentes/servidor";
import { CanvaDesconectado, recortarFundo, tokenValido } from "../../../../lib/canva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_B64 = 4_000_000; // o corpo inteiro da Vercel aceita ~4,5 MB

/** Corpo: { base64, mime }. Tira o fundo da foto no Canva e devolve o PNG transparente (em streaming, sem o limite de 4,5 MB da resposta). */
export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: "origem não permitida" }, { status: 403 });
  let corpo: any; try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  const b64 = String(corpo?.base64 || "");
  if (!b64) return NextResponse.json({ erro: "faltou a foto" }, { status: 400 });
  if (b64.length > MAX_B64) return NextResponse.json({ erro: "foto grande demais (reduza antes de enviar)" }, { status: 413 });
  try {
    const url = await recortarFundo(await tokenValido(), Buffer.from(b64, "base64"), "recorte_produto");
    const img = await fetch(url);
    if (!img.ok || !img.body) return NextResponse.json({ erro: "não consegui baixar a foto recortada do Canva" }, { status: 502 });
    return new Response(img.body, { headers: { "Content-Type": img.headers.get("content-type") || "image/png", "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e instanceof CanvaDesconectado) return NextResponse.json({ erro: e.message, desconectado: true }, { status: 409 });
    return NextResponse.json({ erro: String(e?.message || e).slice(0, 240) }, { status: 502 });
  }
}
