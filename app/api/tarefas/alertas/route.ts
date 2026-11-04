import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { processarAlertas, type EnviarPush } from "../../../../lib/alertasPush";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "../../../../lib/pushConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

function configurarVapid(): string | null {
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!privada) return "VAPID_PRIVATE_KEY não está configurada na Vercel.";
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privada);
  return null;
}

const enviarReal: EnviarPush = async (a, payload) => {
  try {
    await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
    return { ok: true };
  } catch (e: any) {
    const status = e?.statusCode;
    return { ok: false, gone: status === 404 || status === 410, erro: `${status || ""} ${e?.body || e?.message || e}`.trim() };
  }
};

// Modo de verificação (sem enviar de verdade): PUSH_DRY_RUN=1
const enviarSimulado: EnviarPush = async () => ({ ok: true });

/** Chamada a cada minuto pelo pg_cron do Supabase (cabeçalho x-cron-secret) */
async function tratar(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.get("x-cron-secret") !== segredo) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const seco = process.env.PUSH_DRY_RUN === "1";
  if (!seco) {
    const falha = configurarVapid();
    if (falha) return NextResponse.json({ erro: falha }, { status: 500 });
  }
  try {
    const resumo = await processarAlertas(supabase, seco ? enviarSimulado : enviarReal);
    return NextResponse.json({ ok: true, seco, ...resumo });
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) { return tratar(req); }

/**
 * POST  {"teste": "email"}  -> manda uma notificação de teste para os navegadores desse usuário (botão "Enviar teste" da tela inicial)
 * POST  sem corpo           -> mesmo que o GET (usado pelo pg_net)
 */
export async function POST(req: Request) {
  let corpo: any = null;
  try { corpo = await req.json(); } catch { /* sem corpo */ }
  if (!corpo?.teste) return tratar(req);

  const falha = configurarVapid();
  if (falha) return NextResponse.json({ erro: falha }, { status: 500 });
  const email = String(corpo.teste).trim().toLowerCase();
  const { data: subs, error } = await supabase.from("push_assinaturas").select("*").ilike("email", email);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!subs || subs.length === 0) return NextResponse.json({ erro: "Nenhum navegador ativado para este usuário." }, { status: 404 });
  let enviados = 0; const erros: string[] = [];
  for (const s of subs) {
    const r = await enviarReal({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, { titulo: "🔔 Teste de alerta", corpo: "Se você está vendo isto, os alertas de tarefa funcionam mesmo com o sistema fechado.", tag: "teste-alerta", url: "/inicio" });
    if (r.ok) enviados++; else { erros.push(r.erro || ""); if (r.gone) await supabase.from("push_assinaturas").delete().eq("endpoint", s.endpoint); }
  }
  return NextResponse.json({ ok: enviados > 0, enviados, erros });
}
