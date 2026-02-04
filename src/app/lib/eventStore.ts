// src/app/lib/eventStore.ts
import type { EnvironmentalEvent, EventStatus, EventHistoryPoint } from "@/data/events";

const PREFIX = "biopulse:events";

function keyOf(category: string, regionKey: string) {
  return `${PREFIX}:${category}:${regionKey}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toDate(x: any): Date | null {
  if (!x) return null;
  if (x instanceof Date) return x;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d : null;
}

function reviveEvent(e: any): EnvironmentalEvent {
  return {
    ...e,
    timestamp: toDate(e.timestamp) ?? new Date(),
    firstSeen: toDate(e.firstSeen) ?? undefined,
    lastSeen: toDate(e.lastSeen) ?? undefined,
    history: Array.isArray(e.history)
      ? e.history
          .map((h: any) => ({
            ...h,
            t: toDate(h.t) ?? new Date(),
          }))
          .filter((h: any) => h && h.t instanceof Date) as EventHistoryPoint[]
      : undefined,
  };
}

function serializeEvent(e: EnvironmentalEvent) {
  // Date => ISO (para localStorage)
  return {
    ...e,
    timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : new Date(e.timestamp as any).toISOString(),
    firstSeen: e.firstSeen instanceof Date ? e.firstSeen.toISOString() : (e.firstSeen ? new Date(e.firstSeen as any).toISOString() : undefined),
    lastSeen: e.lastSeen instanceof Date ? e.lastSeen.toISOString() : (e.lastSeen ? new Date(e.lastSeen as any).toISOString() : undefined),
    history: Array.isArray(e.history)
      ? e.history.map((h) => ({
          ...h,
          t: h.t instanceof Date ? h.t.toISOString() : new Date(h.t as any).toISOString(),
        }))
      : undefined,
  };
}

/** status automático por “edad desde lastSeen” */
export function statusFromLastSeen(lastSeen: Date | null, severity: EnvironmentalEvent["severity"]): EventStatus {
  if (!lastSeen) return severity === "critical" ? "escalating" : "active";

  const ageMs = Date.now() - lastSeen.getTime();
  const ageH = ageMs / (1000 * 60 * 60);

  if (ageH > 48) return "resolved";
  if (ageH > 18) return "contained";
  if (ageH > 6) return "stabilizing";

  if (severity === "critical" || severity === "high") return "escalating";
  return "active";
}

/** Carga store (si no hay, devuelve []) */
export function loadStoredEvents(category: string, regionKey: string): EnvironmentalEvent[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(keyOf(category, regionKey));
  const parsed = safeParse<any[]>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(reviveEvent);
}

/** Guarda store */
export function saveStoredEvents(category: string, regionKey: string, events: EnvironmentalEvent[]) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(events.map(serializeEvent));
  localStorage.setItem(keyOf(category, regionKey), raw);
}

/**
 * Merge con memoria:
 * - next: los eventos recién obtenidos en el escaneo
 * - prev: lo que había guardado
 * - keepStaleHours: cuánto tiempo mantenemos eventos desaparecidos
 */
export function mergeEventsWithMemory(args: {
  prev: EnvironmentalEvent[];
  next: EnvironmentalEvent[];
  keepStaleHours?: number;
}): EnvironmentalEvent[] {
  const { prev, next } = args;
  const keepStaleHours = args.keepStaleHours ?? 72;

  const now = new Date();

  const prevById = new Map(prev.map((e) => [String(e.id), e]));
  const seen = new Set<string>();

  const merged: EnvironmentalEvent[] = next.map((n) => {
    const id = String(n.id);
    seen.add(id);

    const p = prevById.get(id);

    const firstSeen = p?.firstSeen ?? p?.timestamp ?? n.firstSeen ?? n.timestamp ?? now;
    const lastSeen = n.timestamp ?? now;

    const baseHistory = Array.isArray(p?.history) ? p!.history! : [];
    const point: EventHistoryPoint = {
      t: lastSeen,
      focusCount: n.focusCount ?? p?.focusCount,
      frpSum: n.frpSum ?? p?.frpSum,
      frpMax: n.frpMax ?? p?.frpMax,
      severity: n.severity,
    };

    // evitamos duplicar si mismo timestamp (por recargas)
    const shouldAppend =
      baseHistory.length === 0 ||
      Math.abs(baseHistory[baseHistory.length - 1].t.getTime() - point.t.getTime()) > 30_000;

    const history = shouldAppend ? [...baseHistory, point] : baseHistory;

    return {
      ...p,
      ...n,
      firstSeen,
      lastSeen,
      stale: false,
      history,
      status: n.status ?? statusFromLastSeen(lastSeen, n.severity),
    };
  });

  // Agregar “stale” que estaban antes pero ahora no vinieron
  for (const p of prev) {
    const id = String(p.id);
    if (seen.has(id)) continue;

    const lastSeen = p.lastSeen ?? p.timestamp ?? null;
    const ageH = lastSeen ? (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60) : Infinity;

    if (ageH > keepStaleHours) continue; // lo soltamos del store

    merged.push({
      ...p,
      stale: true,
      status: statusFromLastSeen(lastSeen, p.severity),
    });
  }

  // Orden: primero activos (no stale), luego stale; dentro por severidad
  const sevRank = (s: EnvironmentalEvent["severity"]) =>
    s === "critical" ? 3 : s === "high" ? 2 : s === "moderate" ? 1 : 0;

  merged.sort((a, b) => {
    const sa = a.stale ? 1 : 0;
    const sb = b.stale ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return sevRank(b.severity) - sevRank(a.severity);
  });

  return merged;
}

/** Helper de conveniencia: carga + merge + guarda */
export function mergeAndPersist(args: {
  category: string;
  regionKey: string;
  next: EnvironmentalEvent[];
  keepStaleHours?: number;
}): EnvironmentalEvent[] {
  const prev = loadStoredEvents(args.category, args.regionKey);
  const merged = mergeEventsWithMemory({
    prev,
    next: args.next,
    keepStaleHours: args.keepStaleHours,
  });
  saveStoredEvents(args.category, args.regionKey, merged);
  return merged;
}
