import type { EnvironmentalEvent } from "@/data/events";
import type { OfficialAlertRecord } from "@/app/lib/officialAlertTypes";

export type OfficialPriorityLevel = "official_evacuation";

export type OfficialPriorityMarker = {
  id: string;
  eventId: string;
  lat: number;
  lon: number;
  title: string;
  source: string;
  detail?: string;
  level: OfficialPriorityLevel;
  observedAt: string;
  expiresAt?: string | null;
  reportUrl?: string | null;
};

export const OFFICIAL_PRIORITY_MARKERS_CHANGED_EVENT = "biopulse:official-priority-markers-changed";

const STORAGE_KEY = "biopulse:official-priority-markers:v1";

function isFiniteCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function normalizeMarker(value: unknown): OfficialPriorityMarker | null {
  if (!value || typeof value !== "object") return null;
  const marker = value as Partial<OfficialPriorityMarker>;
  const lat = Number(marker.lat);
  const lon = Number(marker.lon);
  if (!marker.id || !marker.eventId || !isFiniteCoordinate(lat, lon)) return null;

  return {
    id: String(marker.id),
    eventId: String(marker.eventId),
    lat,
    lon,
    title: String(marker.title || "Alerta oficial de evacuacion"),
    source: String(marker.source || "Fuente oficial"),
    detail: marker.detail ? String(marker.detail) : undefined,
    level: "official_evacuation",
    observedAt: marker.observedAt ? String(marker.observedAt) : new Date(0).toISOString(),
    expiresAt: marker.expiresAt ? String(marker.expiresAt) : null,
    reportUrl: marker.reportUrl ? String(marker.reportUrl) : null,
  };
}

function isExpired(marker: OfficialPriorityMarker, now: Date) {
  if (!marker.expiresAt) return false;
  const expires = new Date(marker.expiresAt);
  if (!Number.isFinite(expires.getTime())) return false;
  const graceMs = 48 * 60 * 60 * 1000;
  return expires.getTime() + graceMs < now.getTime();
}

function officialAlertSourceLabel(alert: OfficialAlertRecord) {
  if (alert.sourceId === "smn-cap-alert-hub") return "Servicio Meteorologico Nacional";
  if (alert.sourceId === "gdacs-ercc") return "Referencia internacional";
  return alert.provider || "Fuente oficial";
}

export function officialPriorityMarkerFromAlert(args: {
  event: EnvironmentalEvent;
  alert: OfficialAlertRecord;
  fetchedAt?: string | null;
}): OfficialPriorityMarker {
  const alertLat = Number(args.alert.lat);
  const alertLon = Number(args.alert.lon);
  const hasAlertPoint = isFiniteCoordinate(alertLat, alertLon);

  return {
    id: `official-evacuation:${args.alert.id}`,
    eventId: args.event.id,
    lat: hasAlertPoint ? alertLat : args.event.latitude,
    lon: hasAlertPoint ? alertLon : args.event.longitude,
    title: args.alert.title || "Alerta oficial de evacuacion",
    source: officialAlertSourceLabel(args.alert),
    detail: args.alert.instruction?.trim() || args.alert.description?.trim() || undefined,
    level: "official_evacuation",
    observedAt: args.alert.fromDate || args.fetchedAt || new Date().toISOString(),
    expiresAt: args.alert.toDate ?? null,
    reportUrl: args.alert.reportUrl ?? args.alert.detailsUrl ?? null,
  };
}

export function readOfficialPriorityMarkers(now = new Date()): OfficialPriorityMarker[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeMarker)
      .filter((marker): marker is OfficialPriorityMarker => Boolean(marker))
      .filter((marker) => !isExpired(marker, now))
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  } catch {
    return [];
  }
}

export function writeOfficialPriorityMarkers(markers: OfficialPriorityMarker[]) {
  if (typeof window === "undefined") return markers;
  const normalized = markers
    .map(normalizeMarker)
    .filter((marker): marker is OfficialPriorityMarker => Boolean(marker));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(
    new CustomEvent(OFFICIAL_PRIORITY_MARKERS_CHANGED_EVENT, {
      detail: { markers: normalized },
    })
  );
  return normalized;
}

export function upsertOfficialPriorityMarker(marker: OfficialPriorityMarker) {
  const normalized = normalizeMarker(marker);
  if (!normalized) return readOfficialPriorityMarkers();
  const current = readOfficialPriorityMarkers();
  const withoutCurrent = current.filter((item) => item.id !== normalized.id);
  return writeOfficialPriorityMarkers([normalized, ...withoutCurrent]);
}

export function upsertOfficialPriorityMarkers(markers: OfficialPriorityMarker[]) {
  const normalized = markers
    .map(normalizeMarker)
    .filter((marker): marker is OfficialPriorityMarker => Boolean(marker));
  if (normalized.length === 0) return readOfficialPriorityMarkers();

  const nextById = new Map(readOfficialPriorityMarkers().map((marker) => [marker.id, marker]));
  normalized.forEach((marker) => nextById.set(marker.id, marker));
  return writeOfficialPriorityMarkers(Array.from(nextById.values()));
}
