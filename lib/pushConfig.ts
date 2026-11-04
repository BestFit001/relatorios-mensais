// Chave PÚBLICA do Web Push (VAPID). A chave privada fica só no servidor (variável VAPID_PRIVATE_KEY na Vercel).
export const VAPID_PUBLIC_KEY = "BDRN2K2UTl3qBjuqlVen8-lNI6HTWXUIdiUVUYAelCpY5bMGduNEqPyHQY2HwgXqWsd-FA0yuQuSQhzUujkNbSE";
export const VAPID_SUBJECT = "https://dashboard-e-commerce-nine.vercel.app";

export function urlBase64ParaUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(b64);
  const saida = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
  return saida;
}
