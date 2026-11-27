import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { chavesCanva, trocarCodigo, urlDeRetorno } from "../../../../lib/canva";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Passo 2: o Canva devolve o usuário aqui com ?code&state. Confere o state, troca o código pelo token, guarda no servidor e volta ao gerador. */
export async function GET(req: Request) {
  const retorno = urlDeRetorno(req);
  const base = new URL(retorno).origin;
  const ir = (estado: string, detalhe = "") => {
    const r = NextResponse.redirect(new URL(`/gerador-imagens?canva=${estado}${detalhe ? "&motivo=" + encodeURIComponent(detalhe.slice(0, 120)) : ""}`, base));
    r.cookies.delete({ name: "canva_v", path: "/api/canva" }); r.cookies.delete({ name: "canva_s", path: "/api/canva" });
    return r;
  };
  const u = new URL(req.url);
  if (u.searchParams.get("error")) return ir("erro", "autorização negada no Canva");
  const code = u.searchParams.get("code") || "", state = u.searchParams.get("state") || "";
  const jar = await cookies();
  const verificador = jar.get("canva_v")?.value || "", estado = jar.get("canva_s")?.value || "";
  if (!code || !state || !verificador || !estado || !iguais(state, estado)) return ir("erro", "a conexão expirou ou não foi iniciada por aqui; tente de novo");
  const ch = chavesCanva(); if (!ch) return ir("erro", "faltam as chaves do Canva na Vercel");
  try { await trocarCodigo(code, verificador, retorno, ch); } catch (e: any) { return ir("erro", String(e?.message || e)); }
  return ir("ok");
}
