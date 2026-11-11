import { NextResponse } from "next/server";
import { dimensoes } from "../../../../lib/fotos/imagem";
import { fetchSeguro, urlPermitida } from "../../../../lib/fotos/seguranca";
import { mesmaOrigem } from "../../../../lib/concorrentes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MIME = { jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" } as const;

/** Baixa a imagem original pelo servidor (o navegador não consegue por causa de CORS) e entrega para o usuário salvar. Corpo: { url } */
export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  let url: unknown; try { url = (await req.json())?.url; } catch { return NextResponse.json({ erro: "JSON inválido." }, { status: 400 }); }
  if (!urlPermitida(url)) return NextResponse.json({ erro: "Endereço não permitido." }, { status: 400 });
  try {
    const r = await fetchSeguro(String(url), { maxBytes: 15 * 1024 * 1024, timeoutMs: 20_000 });
    const d = r.status >= 200 && r.status < 300 && !r.truncado ? dimensoes(r.corpo) : null;
    if (!d) return NextResponse.json({ erro: r.truncado ? "Imagem grande demais (limite 15 MB)." : "O site não entregou a imagem (pode estar bloqueada ou ter sido removida)." }, { status: 400 });
    return new Response(new Uint8Array(r.corpo), { headers: { "content-type": MIME[d.tipo], "cache-control": "no-store", "x-largura": String(d.largura), "x-altura": String(d.altura) } });
  } catch (e: any) {
    return NextResponse.json({ erro: "Não consegui baixar: " + (e?.message || "erro de rede") }, { status: 502 });
  }
}
