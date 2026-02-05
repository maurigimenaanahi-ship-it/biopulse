import type { EnvironmentalEvent, EventHistoryPoint } from "@/data/events";
import { notify } from "./pwa";

const STORAGE_KEY = "biopulse:eventsMemory:v1";

type MemoryStore = Record<string, EnvironmentalEvent>; // key = eventId

// ===================
// JSON → Date revival
// ===================
function reviveEvent(ev: EnvironmentalEvent): EnvironmentalEvent {
  const out = { ...ev };

  if (typeof out.timestamp === "string") out.timestamp = new Date(out.timestamp);
  if (typeof out.firstSeen === "string") out.firstSeen = new Date(out.firstSeen);
  if (typeof out.lastSeen === "string") out.lastSeen = new Date(out.lastSeen);

  if (out.history) {
    out.history = out.history.map((h) => ({
      ...h,
      t: typeof h.t === "string" ? new Date(h.t) : h.t,
    }));
  }

  return out;
}

export function loadEventsMemory(): MemoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: MemoryStore = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = reviveEvent(v as EnvironmentalEvent);
    return out;
  } catch {
    return {};
  }
}

export function saveEventsMemory(store: MemoryStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

export function createEventId(prefix = "fire") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ===============
// Geo utils
// ===============
function deg2rad(v: number) {
  return (v * Math.PI) / 180;
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLon = deg2rad(b.lon - a.lon);
  const lat1 = deg2rad(a.lat);
  const lat2 = deg2rad(b.lat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ===============
// Trend
// ===============
function computeTrend(history: EventHistoryPoint[]) {
  if (history.length < 2) return "stable";
  const a = history[history.length - 2];
  const b = history[history.length - 1];

  const Ia = (a.frpSum ?? 0) + (a.frpMax ?? 0) * 0.6 + (a.focusCount ?? 0) * 0.25;
  const Ib = (b.frpSum ?? 0) + (b.frpMax ?? 0) * 0.6 + (b.focusCount ?? 0) * 0.25;

  const pct = Ia === 0 ? 0 : (Ib - Ia) / Ia;
  if (pct > 0.15) return "rising";
  if (pct < -0.15) return "falling";
  return "stable";
}

// ===============
// Matching
// ===============
function findMatch(store: MemoryStore, lat: number, lon: number, maxKm = 25) {
  let best: { id: string; d: number } | null = null;

  for (const [id, ev] of Object.entries(store)) {
    if (ev.category !== "fire" || ev.status === "resolved") continue;
    const d = distanceKm({ lat, lon }, { lat: ev.latitude, lon: ev.longitude });
    if (!best || d < best.d) best = { id, d };
  }

  if (best && best.d <= maxKm) return best.id;
  return null;
}

// ===============
// Alert rules
// ===============
function shouldNotify(prev: EnvironmentalEvent | undefined, next: EnvironmentalEvent) {
  if (!prev) return false;

  // Severity increase
  const sevRank = (s?: string) =>
    s === "critical" ? 3 : s === "high" ? 2 : s === "moderate" ? 1 : 0;

  if (sevRank(next.severity) > sevRank(prev.severity)) return "severity";

  // Status escalates
  if (prev.status !== next.status && next.status === "escalating") return "status";

  // Trend goes rising
  if (prev.trend !== next.trend && next.trend === "rising") return "trend";

  return false;
}

function notifyChange(reason: "severity" | "status" | "trend", ev: EnvironmentalEvent) {
  const title = "🔥 BioPulse Alert";
  let body = "";

  if (reason === "severity") body = `${ev.location}: severity increased to ${ev.severity.toUpperCase()}`;
  if (reason === "status") body = `${ev.location}: event is now ESCALATING`;
  if (reason === "trend") body = `${ev.location}: fire activity is rising`;

  notify(title, body, { tag: ev.id, url: "/" });
}

// ===============
// Upsert
// ===============
export function upsertFireEvent(
  store: MemoryStore,
  base: EnvironmentalEvent,
  now: Date
): { event: EnvironmentalEvent; store: MemoryStore } {
  const lat = base.latitude;
  const lon = base.longitude;

  const matchId = findMatch(store, lat, lon);
  const historyPoint: EventHistoryPoint = {
    t: now,
    focusCount: base.focusCount,
    frpSum: base.frpSum,
    frpMax: base.frpMax,
    severity: base.severity,
  };

  // ---- New event
  if (!matchId) {
    const id = createEventId("fire");
    const event: EnvironmentalEvent = {
      ...base,
      id,
      firstSeen: now,
      lastSeen: now,
      scanCount: 1,
      history: [historyPoint],
      trend: "stable",
    };
    return { event, store: { ...store, [id]: event } };
  }

  // ---- Update existing
  const prev = store[matchId];
  const history = [...(prev.history ?? []), historyPoint].slice(-40);
  const trend = computeTrend(history);

  const event: EnvironmentalEvent = {
    ...prev,
    ...base,
    id: matchId,
    lastSeen: now,
    scanCount: (prev.scanCount ?? 0) + 1,
    history,
    trend,
  };

  // 🔔 Auto alert
  const reason = shouldNotify(prev, event);
  if (reason) notifyChange(reason, event);

  return { event, store: { ...store, [matchId]: event } };
}
