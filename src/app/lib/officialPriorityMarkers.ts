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
