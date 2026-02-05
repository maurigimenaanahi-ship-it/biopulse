import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";

// MapLibre CSS
import "maplibre-gl/dist/maplibre-gl.css";

// App styles
import "./styles/index.css";

// ===== BioPulse Camera Registry (smoke test) =====
import { cameraRegistry } from "@/data/cameras";

console.log("[BioPulse] Camera Registry loaded:", cameraRegistry);

// ===== BioPulse PWA bootstrap =====
async function initPWA() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    console.log("[BioPulse] Service Worker registered", reg);

    // Ask notification permission on first load
    if ("Notification" in window && Notification.permission === "default") {
      console.log("[BioPulse] Notification permission not yet granted");
    }
  } catch (err) {
    console.error("[BioPulse] Service Worker registration failed", err);
  }
}

initPWA();

// Render app
createRoot(document.getElementById("root")!).render(<App />);
