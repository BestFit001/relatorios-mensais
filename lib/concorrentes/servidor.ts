// Peças do servidor: cliente Supabase com chave de serviço e as duas "portas" de segurança das rotas.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ErroValidacao } from "./tipos";

/** Cliente com a chave de serviço (ignora RLS). Só existe no servidor — nunca vai para o navegador. */
export function supabaseServidor(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY (e a URL do Supabase) nas variáveis de ambiente da Vercel.");
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Autoriza o cron. A Vercel manda `Authorization: Bearer <CRON_SECRET>`; o pg_cron do Supabase usa `x-cron-secret`.
 * Sem CRON_SECRET configurado a rota se recusa a rodar (melhor parar do que ficar aberta).
 */
export function autorizarCron(req: Request): "ok" | "sem_segredo" | "negado" {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return "sem_segredo";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const cab = req.headers.get("x-cron-secret") || "";
  return (bearer && iguais(bearer, segredo)) || (cab && iguais(cab, segredo)) ? "ok" : "negado";
}

/** O pedido veio de uma página deste mesmo site (Origin = Host)? Barra chamadas de outros sites. */
export function mesmaOrigem(req: Request): boolean {
  const origem = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origem || !host) return false;
  try { return new URL(origem).host === host; } catch { return false; }
}


export const ehUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Envelope das rotas chamadas pela tela: confere a origem, lê o JSON e traduz erros (400 = entrada ruim, 500 = o resto). */
export async function executar(req: Request, fn: (corpo: any) => Promise<unknown>): Promise<Response> {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  let corpo: any = {};
  try { const t = await req.text(); corpo = t ? JSON.parse(t) : {}; } catch { return NextResponse.json({ erro: "JSON inválido." }, { status: 400 }); }
  try {
    return NextResponse.json(await fn(corpo ?? {}));
  } catch (e: any) {
    const status = e instanceof ErroValidacao ? 400 : 500;
    return NextResponse.json({ erro: e?.message || "Erro inesperado." }, { status });
  }
}
