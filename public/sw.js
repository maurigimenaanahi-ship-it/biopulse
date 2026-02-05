/* BioPulse Service Worker (minimal)
   - Allows showing notifications triggered from the app via postMessage
*/

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {});

// Receive messages from the app to show notifications
self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data?.type !== "BP_NOTIFY") return;

  const title = String(data.title || "BioPulse");
  const body = String(data.body || "");
  const tag = data.tag ? String(data.tag) : undefined;
  const url = data.url ? String(data.url) : "/";

  try {
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      badge: "/icons/icon-192.png",
      icon: "/icons/icon-192.png",
      data: { url },
    });
  } catch {
    // ignore
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification?.data?.url || "/";

  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});
