import { supabase } from "./supabase";
import { VAPID_PUBLIC_KEY, urlBase64ParaUint8Array } from "./pushConfig";

export const suportaPush = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Registra o service worker, cria (ou reaproveita) a assinatura de push deste navegador e grava no banco. */
export async function registrarPush(email: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!suportaPush()) return { ok: false, motivo: "Este navegador não suporta notificações com o sistema fechado." };
  if (Notification.permission !== "granted") return { ok: false, motivo: "Permissão de notificação não concedida." };
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ParaUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource });
    }
    const json = sub.toJSON() as any;
    const { error } = await supabase.from("push_assinaturas").upsert(
      {
        email: email.trim().toLowerCase(),
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh || "",
        auth: json.keys?.auth || "",
        user_agent: navigator.userAgent.slice(0, 250),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
    if (error) return { ok: false, motivo: "Não consegui salvar a assinatura (a migração do banco foi executada?): " + error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, motivo: e?.message || String(e) };
  }
}

export async function temAssinaturaAtiva(): Promise<boolean> {
  try {
    if (!suportaPush()) return false;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    return !!(reg && (await reg.pushManager.getSubscription()));
  } catch {
    return false;
  }
}
