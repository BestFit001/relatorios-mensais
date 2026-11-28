import { NextResponse } from "next/server";
import { mesmaOrigem } from "../../../../lib/concorrentes/servidor";
import { CanvaDesconectado, JOB_VALIDO, consultarCena, iniciarCena, tokenValido } from "../../../../lib/canva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_REFS = 10; // até 4 fotos + 2 detalhes da logo + 4 quadros do vídeo
const MAX_B64 = 1_500_000; // por foto
const MAX_TOTAL_B64 = 4_000_000; // o corpo inteiro da Vercel aceita ~4,5 MB

function falha(e: any) {
  if (e instanceof CanvaDesconectado) return NextResponse.json({ erro: e.message, desconectado: true }, { status: 409 });
  return NextResponse.json({ erro: String(e?.message || e).slice(0, 240) }, { status: 502 });
}

/** Abre o job de geração: sobe as fotos de referência no Canva e devolve { jobId }. O navegador consulta o andamento com GET. */
export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: "origem não permitida" }, { status: 403 });
  let corpo: any; try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  const prompt = String(corpo?.prompt || "").trim().slice(0, 8000);
  const largura = Number(corpo?.largura) || 1200, altura = Number(corpo?.altura) || 1200;
  const lista: any[] = Array.isArray(corpo?.fotos) ? corpo.fotos : [];
  const refs: { bytes: Buffer; nome: string }[] = [];
  let total = 0;
  for (const [i, f] of lista.slice(0, MAX_REFS).entries()) {
    const b64 = String(f?.base64 || "");
    if (!b64) continue;
    if (b64.length > MAX_B64) return NextResponse.json({ erro: "foto muito grande (reduza antes de enviar)" }, { status: 413 });
    total += b64.length;
    if (total > MAX_TOTAL_B64) return NextResponse.json({ erro: "fotos de referência demais ou grandes demais" }, { status: 413 });
    refs.push({ bytes: Buffer.from(b64, "base64"), nome: `referencia_${i + 1}` });
  }
  if (!prompt || !refs.length) return NextResponse.json({ erro: "faltou a instrução ou a foto de referência" }, { status: 400 });
  try {
    const token = await tokenValido();
    return NextResponse.json({ jobId: await iniciarCena(token, { prompt, referencias: refs, largura, altura }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return falha(e); }
}

/** GET ?job=ID → { status }. Com &baixar=1 e o job pronto, devolve a própria imagem (repassada em streaming, sem passar pelo limite de 4,5 MB). */
export async function GET(req: Request) {
  if (!mesmaOrigem(req) && req.headers.get("sec-fetch-site") !== "same-origin") return NextResponse.json({ erro: "origem não permitida" }, { status: 403 });
  const u = new URL(req.url);
  const job = u.searchParams.get("job") || "";
  if (!JOB_VALIDO.test(job)) return NextResponse.json({ erro: "job inválido" }, { status: 400 });
  try {
    const estado = await consultarCena(await tokenValido(), job);
    if (estado.status !== "pronto") return NextResponse.json(estado, { headers: { "Cache-Control": "no-store" } });
    if (u.searchParams.get("baixar") !== "1") return NextResponse.json({ status: "pronto" }, { headers: { "Cache-Control": "no-store" } });
    const img = await fetch(estado.url);
    if (!img.ok || !img.body) return NextResponse.json({ erro: "não consegui baixar a imagem pronta do Canva" }, { status: 502 });
    return new Response(img.body, { headers: { "Content-Type": img.headers.get("content-type") || "image/png", "Cache-Control": "no-store" } });
  } catch (e) { return falha(e); }
}
