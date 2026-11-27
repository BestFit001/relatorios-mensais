import { NextResponse } from "next/server";
import { obterAdaptador, statusImagemIA } from "../../../lib/provedorImagemIA";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Diz só se a geração de cena por IA está liberada (e por que não). Nunca devolve chave. */
export async function GET() {
  return NextResponse.json(statusImagemIA());
}

/** Gera a cena de IA de UMA posição. Enquanto não houver serviço de imagem configurado responde 423 (travado). */
export async function POST(req: Request) {
  const pronto = obterAdaptador();
  if (!pronto) return NextResponse.json(statusImagemIA(), { status: 423 });
  let corpo: any;
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  const prompt = String(corpo?.prompt || "").trim().slice(0, 2000);
  const fotoBase64 = String(corpo?.fotoBase64 || "");
  const fotoMime = String(corpo?.fotoMime || "image/jpeg");
  const largura = Math.min(Math.max(Number(corpo?.largura) || 1200, 256), 2048);
  const altura = Math.min(Math.max(Number(corpo?.altura) || 1200, 256), 2048);
  if (!prompt || !fotoBase64) return NextResponse.json({ erro: "faltou o prompt ou a foto de referência" }, { status: 400 });
  if (fotoBase64.length > 6_000_000) return NextResponse.json({ erro: "foto muito grande (reduza antes de enviar)" }, { status: 413 });
  try {
    const saida = await pronto.adaptador.gerar({ prompt, fotoBase64, fotoMime, largura, altura }, pronto.chave);
    return NextResponse.json(saida);
  } catch (e: any) {
    return NextResponse.json({ erro: "o serviço de imagem não respondeu: " + String(e?.message || e).slice(0, 200) }, { status: 502 });
  }
}
