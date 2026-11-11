import { buscarFotos, limiteMensal, usoDoMes } from "../../../../lib/fotos/busca";
import { executar, supabaseServidor } from "../../../../lib/concorrentes/servidor";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Quantas buscas já foram feitas neste mês e se a chave do Google está configurada (não revela a chave). */
export async function GET() {
  try {
    return NextResponse.json({ usados: await usoDoMes(supabaseServidor()), limite: limiteMensal(), configurado: Boolean(process.env.GOOGLE_VISION_API_KEY) });
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || "Erro inesperado." }, { status: 500 });
  }
}

/** Busca no Google Cloud Vision as fotos iguais/parecidas e mede a resolução. Corpo: { imagem (base64), sku?, usuario? } */
export async function POST(req: Request) {
  return executar(req, async (c) => buscarFotos(supabaseServidor(), { imagem: c.imagem, usuario: c.usuario, sku: c.sku }));
}
