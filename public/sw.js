// Service worker do Controle Best Fit: recebe os alertas de tarefa (Web Push) e mostra a notificação do Windows
// mesmo com o sistema fechado (o navegador só precisa estar em execução, o que é o padrão do Chrome/Edge).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = { titulo: "Controle Best Fit", corpo: event.data ? event.data.text() : "" }; }
  const titulo = dados.titulo || "Controle Best Fit";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "",
      tag: dados.tag || undefined,
      requireInteraction: true,
      renotify: !!dados.tag,
      data: { url: dados.url || "/inicio" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inicio";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      for (const aba of abas) {
        if ("focus" in aba) { aba.navigate && aba.navigate(url); return aba.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
