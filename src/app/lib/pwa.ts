// src/app/lib/pwa.ts

export async function registerPWA() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    console.log("[BioPulse] Service Worker registered", reg);
  } catch (err) {
    console.error("[BioPulse] SW registration failed", err);
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;

  const perm = await Notification.requestPermission();
  return perm === "granted";
}

export async function notify(title: string, body: string, options?: { tag?: string; url?: string }) {
  if (!("serviceWorker" in navigator)) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const reg = await navigator.serviceWorker.ready;

  reg.active?.postMessage({
    type: "BP_NOTIFY",
    title,
    body,
    tag: options?.tag,
    url: options?.url,
  });
}
