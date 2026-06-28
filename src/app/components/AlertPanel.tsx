// AlertPanel.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { EnvironmentalEvent, FireSatelliteObservation } from "@/data/events";
import { GuardianMissionPanel, type GuardianMissionTemplate } from "@/app/components/GuardianMissionPanel";
import {
  GuardianObservationForm,
  type GuardianObservationDraft,
} from "@/app/components/GuardianObservationForm";
import { GuardianObservationReview } from "@/app/components/GuardianObservationReview";
import { GuardianObservationIntegrity } from "@/app/components/GuardianObservationIntegrity";
import { GuardianPreparationDialog } from "@/app/components/GuardianPreparationDialog";
import { GuardianReportPanel } from "@/app/components/GuardianReportPanel";
import { GuardianMemoryTimeline } from "@/app/components/GuardianMemoryTimeline";
import { SATELLITE_RASTER_LAYERS, SatelliteMiniMap } from "@/app/components/SatelliteMiniMap";
import type { CameraRegistryItem, LoadedCamera, ProviderCameraSnapshot } from "@/app/lib/cameraTypes";
import { buildEventObservations } from "@/app/lib/eventObservations";
import type { NewsItem, NewsResponse } from "@/app/lib/newsTypes";
import type { WeatherCurrent, WeatherResponse } from "@/app/lib/weatherTypes";
import {
  prepareGuardianEvent,
  completeGuardianPreparation,
  findGuardianEventRecord,
  readGuardianLocalStore,
  removeGuardianEvent,
  removeGuardianObservation,
  setGuardianExposurePreference,
  type GuardianExposurePreference,
  type GuardianLocalStore,
  type GuardianMission,
  type GuardianObservation,
  GUARDIAN_PREPARATION_VERSION,
} from "@/app/lib/guardianStore";
import type { Observation } from "@/app/lib/observations";
import {
  X,
  CornerUpLeft,
  AlertTriangle,
  Flame,
  Activity,
  Gauge,
  CloudRain,
  Wind,
  Droplets,
  Thermometer,
  Newspaper,
  ExternalLink,
  Loader2,
  RefreshCw,
  Siren,
  Camera,
  MapPin,
  Radius,
  Bell,
  Image as ImageIcon,
  Satellite,
  Brain,
  Leaf,
  PawPrint,
  Flower2,
  ShieldCheck,
  Users,
  Building2,
  House,
  Hospital,
  School,
  Route,
  History,
  Trash2,
  ClipboardPlus,
  ChevronRight,
} from "lucide-react";

type AlertPanelProps = {
  event: EnvironmentalEvent | null;
  onClose: () => void;
};

type AlertPanelSection =
  | "main"
  | "satellite"
  | "weather"
  | "cameras"
  | "news"
  | "official"
  | "guardians"
  | "protected"
  | "human"
  | "insight"
  | "timeline"
  | "operations";

const WORKER_BASE = "https://square-frost-5487.maurigimenaanahi.workers.dev";
const FAV_KEY = "biopulse:followed-alerts";

function readFollowedIds(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toggleFollowedId(id: string): string[] {
  const ids = new Set(readFollowedIds());
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  const next = Array.from(ids);
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  } catch {
    return readFollowedIds();
  }
  return next;
}

function isAbortError(err: unknown) {
  return (err instanceof DOMException && err.name === "AbortError") || (err as any)?.name === "AbortError";
}

type ProtectedArea = {
  id: string;
  name: string;
  designation: string | null;
  protectClass: string | null;
  operator: string | null;
  website: string | null;
  sourceUrl: string;
};

type ProtectedContextResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  areas: ProtectedArea[];
  source: { name: string; attribution: string; licenseUrl: string };
  interpretation: string;
};

type CriticalFacility = {
  id: string;
  category: "healthcare" | "fire_station" | "shelter" | "school";
  name: string;
  address: string | null;
  distanceKm: number | null;
  lat: number;
  lon: number;
  mapUrl: string;
};

type CriticalInfrastructureResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  facilities: CriticalFacility[];
  source: { name: string; attribution: string; attributionUrl: string };
  interpretation: string;
};

type NearbyCommunity = {
  id: string;
  kind: "city" | "town" | "village" | "hamlet" | "municipality" | "township";
  name: string;
  state: string | null;
  country: string | null;
  address: string | null;
  distanceKm: number | null;
  lat: number;
  lon: number;
  mapUrl: string;
};

type NearbyCommunitiesResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  communities: NearbyCommunity[];
  source: { name: string; attribution: string; attributionUrl: string };
  interpretation: string;
};

type WaterResource = {
  id: string;
  kind: "river" | "waterbody" | "wetland" | "bay" | "spring";
  name: string;
  state: string | null;
  country: string | null;
  distanceKm: number | null;
  lat: number;
  lon: number;
  mapUrl: string;
};

type WaterContextResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  resources: WaterResource[];
  source: { name: string; attribution: string; attributionUrl: string };
  interpretation: string;
};

type FireHistoryYearSummary = {
  year: number;
  detections: number;
  frpSum: number | null;
  frpMax: number | null;
  latestDetection: string | null;
};

type FireHistoryResponse = {
  provider: string;
  source: string;
  query: {
    lat: number;
    lon: number;
    radiusKm: number;
    bbox: string;
    years: number;
    sampledMonth: number;
    sampledYears: number[];
  };
  summary: {
    totalDetections: number;
    yearsWithDetections: number;
    peakYear: FireHistoryYearSummary | null;
    latestDetection: string | null;
  };
  years: FireHistoryYearSummary[];
  attributionText: string;
  limitations: string[];
  fetchedAt: string;
};

function GuardianSourceButton({
  onClick,
  label = "Registrar fuente",
  variant = "compact",
}: {
  onClick: () => void;
  label?: string;
  variant?: "compact" | "prominent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 border border-emerald-300/20 bg-emerald-400/[0.08] font-semibold text-emerald-100/80 transition-colors hover:bg-emerald-400/15",
        variant === "prominent"
          ? "min-h-11 w-full rounded-xl px-4 py-2.5 text-sm"
          : "min-h-9 rounded-lg px-3 py-1.5 text-xs"
      )}
      title="Precargar esta fuente en una observación Guardian"
    >
      <ClipboardPlus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ---------- Worker clients ----------
async function fetchNewsFromWorker(params: { query: string; days: number; max: number; signal?: AbortSignal }) {
  const url =
    `${WORKER_BASE}/news` +
    `?query=${encodeURIComponent(params.query)}` +
    `&days=${encodeURIComponent(String(params.days))}` +
    `&max=${encodeURIComponent(String(params.max))}`;

  const res = await fetch(url, { signal: params.signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`News Worker error ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as NewsResponse;
}

type ReverseGeocodeResponse = {
  label: string | null;
  display_name?: string | null;
  lat: number;
  lon: number;
};

async function reverseGeocodeViaWorker(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const url = `${WORKER_BASE}/reverse-geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) return null;
  const data = (await res.json()) as ReverseGeocodeResponse;
  const label = data?.label ?? null;
  return label && typeof label === "string" ? label : null;
}

// ---------- Weather fetch (Open-Meteo, sin key) ----------
async function fetchCurrentWeatherOpenMeteo(lat: number, lon: number, signal?: AbortSignal): Promise<WeatherCurrent> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m` +
    `&timezone=UTC`;

  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Weather error ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = (await res.json()) as WeatherResponse;
  const c = data?.current ?? {};
  return {
    time: typeof c.time === "string" ? c.time : null,
    temperature_2m: Number.isFinite(c.temperature_2m as any) ? (c.temperature_2m as number) : null,
    relative_humidity_2m: Number.isFinite(c.relative_humidity_2m as any) ? (c.relative_humidity_2m as number) : null,
    precipitation: Number.isFinite(c.precipitation as any) ? (c.precipitation as number) : null,
    wind_speed_10m: Number.isFinite(c.wind_speed_10m as any) ? (c.wind_speed_10m as number) : null,
    wind_direction_10m: Number.isFinite(c.wind_direction_10m as any) ? (c.wind_direction_10m as number) : null,
  };
}

// ---------- Camera registry loader ----------
async function fetchCameraRegistry(signal?: AbortSignal): Promise<CameraRegistryItem[]> {
  const candidates = ["/cameraregistry.json", "/cameraRegistry.json", "/cameraRegistry.sample.json", "/cameraregistry.sample.json"];

  let lastErr: any = null;

  for (const path of candidates) {
    try {
      const res = await fetch(path, { headers: { Accept: "application/json" }, signal });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${path}`);
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        lastErr = new Error(`Registry is not an array at ${path}`);
        continue;
      }
      const items = data.filter((x) => x && x.schema === "biopulse.camera.v1") as CameraRegistryItem[];
      return items;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw new Error(lastErr?.message ? String(lastErr.message) : "No se pudo cargar el registry de cámaras.");
}

async function fetchWindyCameraSnapshot(args: {
  cameraKey: string;
  endpoint?: string;
  signal?: AbortSignal;
}): Promise<ProviderCameraSnapshot> {
  const endpoint = args.endpoint || "/api/windy-camera";
  const url = `${endpoint}?cameraId=${encodeURIComponent(args.cameraKey)}`;

  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: args.signal });
  const data: any = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || `Windy camera error ${res.status}`);
  }

  return {
    status: "ready",
    snapshotUrl: typeof data?.snapshotUrl === "string" ? data.snapshotUrl : null,
    detailUrl: typeof data?.detailUrl === "string" ? data.detailUrl : null,
    attributionText: typeof data?.attributionText === "string" ? data.attributionText : null,
  };
}

async function fetchProtectedContext(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<ProtectedContextResponse> {
  const url =
    `/api/protected-context?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}&radiusKm=50`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Contexto ambiental no disponible (${res.status}).`);
  const data = (await res.json()) as ProtectedContextResponse;
  return {
    ...data,
    areas: Array.isArray(data.areas) ? data.areas : [],
  };
}

async function fetchCriticalInfrastructure(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<CriticalInfrastructureResponse> {
  const url =
    `/api/critical-infrastructure?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}&radiusKm=25&schema=2`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Infraestructura crítica no disponible (${res.status}).`);
  const data = (await res.json()) as CriticalInfrastructureResponse;
  return {
    ...data,
    facilities: Array.isArray(data.facilities) ? data.facilities : [],
  };
}

async function fetchNearbyCommunities(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<NearbyCommunitiesResponse> {
  const url =
    `/api/nearby-communities?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}&radiusKm=50`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Comunidades cercanas no disponibles (${res.status}).`);
  const data = (await res.json()) as NearbyCommunitiesResponse;
  return {
    ...data,
    communities: Array.isArray(data.communities) ? data.communities : [],
  };
}

async function fetchWaterContext(lat: number, lon: number, signal?: AbortSignal): Promise<WaterContextResponse> {
  const url =
    `/api/water-context?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}&radiusKm=50`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Recursos hídricos no disponibles (${res.status}).`);
  const data = (await res.json()) as WaterContextResponse;
  return {
    ...data,
    resources: Array.isArray(data.resources) ? data.resources : [],
  };
}

async function fetchFireHistory(args: {
  lat: number;
  lon: number;
  radiusKm: number;
  years: number;
  month: number;
  signal?: AbortSignal;
}): Promise<FireHistoryResponse> {
  const url =
    `/api/fire-history?lat=${encodeURIComponent(String(args.lat))}` +
    `&lon=${encodeURIComponent(String(args.lon))}` +
    `&radiusKm=${encodeURIComponent(String(args.radiusKm))}` +
    `&years=${encodeURIComponent(String(args.years))}` +
    `&month=${encodeURIComponent(String(args.month))}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: args.signal });
  const data = (await res.json().catch(() => null)) as FireHistoryResponse | { error?: string; message?: string } | null;

  if (!res.ok) {
    const message =
      data && "error" in data && data.error
        ? data.message
          ? `${data.error}: ${data.message}`
          : data.error
        : `Historial FIRMS no disponible (${res.status}).`;
    throw new Error(message);
  }

  return data as FireHistoryResponse;
}

// ---------- UI helpers ----------
function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type SourceCoverageState =
  | "available"
  | "partial"
  | "local"
  | "loading"
  | "limited"
  | "empty"
  | "stale"
  | "not_connected";

const sourceCoverageMeta: Record<SourceCoverageState, { label: string; className: string; dot: string }> = {
  available: {
    label: "Disponible",
    className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/85",
    dot: "bg-emerald-300",
  },
  partial: {
    label: "Parcial",
    className: "border-cyan-300/20 bg-cyan-400/10 text-cyan-100/85",
    dot: "bg-cyan-300",
  },
  local: {
    label: "Local",
    className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/85",
    dot: "bg-emerald-300",
  },
  loading: {
    label: "Consultando",
    className: "border-white/10 bg-white/5 text-white/60",
    dot: "bg-white/45 animate-pulse",
  },
  limited: {
    label: "Limitada",
    className: "border-amber-300/20 bg-amber-400/10 text-amber-100/85",
    dot: "bg-amber-300",
  },
  empty: {
    label: "Sin resultados",
    className: "border-white/10 bg-white/5 text-white/55",
    dot: "bg-white/35",
  },
  stale: {
    label: "Desactualizada",
    className: "border-amber-300/20 bg-amber-400/10 text-amber-100/85",
    dot: "bg-amber-300",
  },
  not_connected: {
    label: "No conectada",
    className: "border-white/10 bg-white/[0.03] text-white/45",
    dot: "bg-white/25",
  },
};

function guardianSourceLabel(source: GuardianObservation["sourceType"]) {
  switch (source) {
    case "satellite":
      return "Satélite";
    case "camera":
      return "Cámara";
    case "news":
      return "Noticia";
    case "official_document":
      return "Documento oficial";
    case "physical_observation":
      return "Observación física";
    case "other":
      return "Otra fuente";
    default:
      return "Sin fuente identificada";
  }
}

function shortTimelineText(value: string | null | undefined, limit = 130) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}...` : text;
}

function formatObservationMeasurements(measurements?: Observation["evidence"]["measurements"]) {
  if (!measurements) return "";

  const parts = Object.entries(measurements)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return parts.join(" · ");
}

function observationTimelineTitle(observation: Observation) {
  switch (observation.type) {
    case "guardian_report":
      return "Evidencia Guardian normalizada";
    case "satellite_detection":
      return "Evidencia satelital normalizada";
    case "camera_snapshot":
      return "Evidencia de cámara normalizada";
    case "official_alert":
      return "Alerta oficial normalizada";
    case "news_report":
      return "Referencia informativa normalizada";
    case "official_reference":
      return "Referencia oficial normalizada";
    case "weather_reading":
      return "Lectura meteorológica normalizada";
    default:
      return "Observación normalizada";
  }
}

function observationTimelineDetail(observation: Observation) {
  const measurements = formatObservationMeasurements(observation.evidence.measurements);
  const parts = [
    observation.source.name,
    shortTimelineText(observation.evidence.summary, 110),
    measurements,
    observation.narrativeUse.caution ? `Cautela: ${shortTimelineText(observation.narrativeUse.caution, 90)}` : null,
  ].filter((item): item is string => Boolean(item));

  return parts.join(" · ");
}

function observationTypeLabel(observation: Observation) {
  switch (observation.type) {
    case "satellite_detection":
      return "Satélite";
    case "satellite_layer":
      return "Capa satelital";
    case "camera_snapshot":
      return "Cámara";
    case "weather_reading":
      return "Clima";
    case "news_report":
      return "Noticia";
    case "official_reference":
      return "Referencia oficial";
    case "official_alert":
      return "Alerta oficial";
    case "guardian_report":
      return "Guardian";
    case "infrastructure_context":
      return "Infraestructura";
    case "environmental_context":
      return "Ambiente";
    case "community_context":
      return "Comunidad";
    default:
      return "Observación";
  }
}

function observationOriginLabel(observation: Observation) {
  switch (observation.origin.kind) {
    case "human":
      return "Humana";
    case "official":
      return "Oficial";
    case "automated":
      return "Automatizada";
    case "media":
      return "Medio";
    case "system":
      return "Sistema";
    default:
      return "No indicada";
  }
}

const observationConfidenceMeta: Record<Observation["confidence"]["level"], { label: string; className: string }> = {
  high: {
    label: "Alta",
    className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/85",
  },
  medium: {
    label: "Media",
    className: "border-cyan-300/20 bg-cyan-400/10 text-cyan-100/85",
  },
  low: {
    label: "Baja",
    className: "border-amber-300/20 bg-amber-400/10 text-amber-100/85",
  },
  unknown: {
    label: "No indicada",
    className: "border-white/10 bg-white/5 text-white/55",
  },
};

const observationStatusLabel: Record<Observation["status"], string> = {
  recorded: "Registrada",
  active: "Activa",
  stale: "Desactualizada",
  superseded: "Reemplazada",
  disputed: "Discutida",
  retracted: "Retirada",
  confirmed: "Confirmada",
  archived: "Archivada",
};

const observationVerificationLabel: Record<Observation["verification"]["status"], string> = {
  unreviewed: "Sin revisión",
  source_reviewed: "Fuente revisada",
  corroborated: "Corroborada",
  conflicted: "En conflicto",
  official_confirmed: "Confirmada oficialmente",
  inconclusive: "Inconclusa",
};

function observationLocationLabel(observation: Observation) {
  if (observation.type === "news_report" || observation.type === "official_reference") {
    return "No geolocalizada; vinculada por texto";
  }

  const { location } = observation;
  if (
    location.kind === "point" &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  ) {
    return `${Number(location.latitude).toFixed(3)}, ${Number(location.longitude).toFixed(3)}`;
  }
  if (location.kind === "event_area") return "Área del evento";
  if (location.kind === "bbox") return "Área aproximada";
  if (location.kind === "polygon") return "Polígono";
  return "No indicada";
}

function observationDateLabel(observation: Observation) {
  const date = toValidDate(observation.timestamp.observedAt) ?? toValidDate(observation.timestamp.recordedAt);
  return date ? fmtDateTimeUTC(date) : "Fecha no disponible";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDateTimeUTC(d: Date) {
  return `${pad2(d.getUTCDate())} ${d
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase()} ${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

function toValidDate(value: Date | string | number | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatObservationFreshness(date: Date | null) {
  if (!date) return "Antigüedad no disponible";

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Observación reciente";
  if (elapsedMinutes < 60) return `Actualizada hace ${elapsedMinutes} min`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Actualizada hace ${elapsedHours} h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `Actualizada hace ${elapsedDays} d`;
}

function fmtNowishUTC(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toUTCString().replace("GMT", "UTC");
}

function sevChip(sev: EnvironmentalEvent["severity"]) {
  if (sev === "critical")
    return { label: "CRITICAL", dot: "bg-red-500", ring: "border-red-400/30", bg: "bg-red-500/10" };
  if (sev === "high")
    return { label: "HIGH", dot: "bg-orange-500", ring: "border-orange-400/30", bg: "bg-orange-500/10" };
  if (sev === "moderate")
    return { label: "MODERATE", dot: "bg-yellow-400", ring: "border-yellow-300/30", bg: "bg-yellow-400/10" };
  return { label: "LOW", dot: "bg-emerald-400", ring: "border-emerald-300/30", bg: "bg-emerald-400/10" };
}

function statusLabel(s?: string | null) {
  if (!s) return "—";
  const k = String(s).toLowerCase();
  if (k === "escalating") return "Escalating";
  if (k === "active") return "Active";
  if (k === "stabilizing") return "Stabilizing";
  if (k === "contained") return "Contained";
  if (k === "resolved") return "Resolved";
  return s;
}

function isGenericLocation(locRaw: string) {
  const loc = (locRaw ?? "").trim().toLowerCase();
  if (!loc) return true;

  const generic = [
    "américa",
    "america",
    "south america",
    "américa del sur",
    "latin america",
    "latam",
    "world",
    "mundo",
    "region",
  ];

  if (generic.some((g) => loc.includes(g))) return true;
  if (!loc.includes(",")) return true;

  return false;
}

function normalizePlaceForQuery(place: string) {
  const parts = place
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const country = parts[parts.length - 1] ?? "";
  const state = parts.length >= 2 ? parts[parts.length - 2] : "";
  const locality = parts[0] ?? "";

  return { locality, state, country, parts };
}

function buildNewsQueryFromPlace(ev: EnvironmentalEvent, place: string) {
  const { country } = normalizePlaceForQuery(place);

  const hazard =
    ev.category === "fire"
      ? "(incendio OR incendios OR wildfire OR wildfires OR fire OR forest fire OR bushfire)"
      : ev.category === "flood"
      ? "(inundación OR flood)"
      : ev.category === "storm"
      ? "(tormenta OR storm)"
      : ev.category === "earthquake"
      ? "(terremoto OR earthquake)"
      : ev.category === "drought"
      ? "(sequía OR drought)"
      : "(emergency OR disaster)";

  const localTerms = newsPlaceTermsFor(ev, place).slice(0, 5);
  const placeBlock = localTerms.length
    ? localTerms.map((term) => `"${term}"`).join(" OR ")
    : country
    ? `"${country}"`
    : `"${place}"`;

  return `(${placeBlock}) AND ${hazard}`;
}

function normalizeNewsSearchText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NEWS_COUNTRY_ONLY_TERMS = new Set([
  "argentina",
  "usa",
  "united states",
  "estados unidos",
  "brasil",
  "brazil",
  "chile",
  "uruguay",
  "paraguay",
  "bolivia",
  "peru",
  "colombia",
  "ecuador",
  "venezuela",
  "mexico",
  "canada",
  "india",
  "china",
  "australia",
  "bangladesh",
]);

const NEWS_ADMIN_PREFIXES = [
  "distrito",
  "departamento",
  "partido",
  "municipio",
  "municipalidad",
  "comuna",
  "localidad",
  "ciudad",
  "provincia",
  "region",
];

const NEWS_HAZARD_TERMS: Record<EnvironmentalEvent["category"], string[]> = {
  fire: [
    "incendio",
    "incendios",
    "humo",
    "quema",
    "quemas",
    "foco igneo",
    "focos igneos",
    "forestal",
    "bomberos",
    "wildfire",
    "wildfires",
    "bushfire",
    "forest fire",
  ],
  flood: ["inundacion", "inundaciones", "anegamiento", "crecida", "desborde", "evacuacion", "flood"],
  storm: ["tormenta", "temporal", "viento", "granizo", "rayos", "alerta meteorologica", "storm"],
  heatwave: ["calor", "ola de calor", "temperatura", "alerta amarilla", "alerta naranja", "alerta roja", "heatwave"],
  "air-pollution": ["contaminacion", "humo", "calidad del aire", "particulas", "smog", "air pollution"],
  "ocean-anomaly": ["marea", "oleaje", "temperatura del mar", "anomalia", "costa", "ocean"],
};

function uniqueNewsTerms(terms: string[]) {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const normalized = normalizeNewsSearchText(term);
    if (!normalized || normalized.length < 4) return false;
    if (NEWS_COUNTRY_ONLY_TERMS.has(normalized)) return false;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function stripNewsAdminPrefix(term: string) {
  const normalized = normalizeNewsSearchText(term);
  for (const prefix of NEWS_ADMIN_PREFIXES) {
    if (normalized.startsWith(`${prefix} `)) return normalized.slice(prefix.length + 1).trim();
  }
  return normalized;
}

function newsPlaceTermsFor(ev: EnvironmentalEvent, place: string) {
  const candidates: string[] = [];
  const addPlaceParts = (value: string | null | undefined) => {
    String(value ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        candidates.push(part);
        const stripped = stripNewsAdminPrefix(part);
        if (stripped && stripped !== normalizeNewsSearchText(part)) candidates.push(stripped);
      });
  };

  addPlaceParts(place);
  addPlaceParts(ev.location);

  return uniqueNewsTerms(candidates);
}

function newsItemTextBlob(item: NewsItem) {
  return normalizeNewsSearchText([item.title, item.summary, item.url, item.domain].filter(Boolean).join(" "));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function newsHasAnyTerm(blob: string, terms: string[]) {
  return terms.some((term) => {
    const normalized = normalizeNewsSearchText(term);
    if (normalized.length < 4) return false;
    if (normalized.includes(" ")) return blob.includes(normalized);
    return new RegExp(`(^|\\s)${escapeRegExp(normalized)}(\\s|$)`).test(blob);
  });
}

function isNewsRelevantToEvent(ev: EnvironmentalEvent, place: string, item: NewsItem) {
  const blob = newsItemTextBlob(item);
  if (!blob) return false;

  const placeTerms = newsPlaceTermsFor(ev, place);
  const hasPlaceSignal = placeTerms.length === 0 || newsHasAnyTerm(blob, placeTerms);
  if (!hasPlaceSignal) return false;

  const hazardTerms = NEWS_HAZARD_TERMS[ev.category] ?? ["emergency", "disaster", "alerta", "emergencia"];
  const hasHazardSignal = newsHasAnyTerm(blob, hazardTerms);
  const hasOfficialSignal = domainIsOfficial(item.domain) || textLooksOfficial(item.title, item.summary);
  const hasEmergencySignal = isEvacuationRelevant(item);

  return hasHazardSignal || hasOfficialSignal || hasEmergencySignal;
}

function parseFRPFromDescription(desc?: string) {
  const s = String(desc ?? "");
  const maxMatch = s.match(/FRP\s*max\s*([0-9]+(?:\.[0-9]+)?)/i);
  const sumMatch = s.match(/FRP\s*sum\s*([0-9]+(?:\.[0-9]+)?)/i);
  const frpMax = maxMatch ? Number(maxMatch[1]) : null;
  const frpSum = sumMatch ? Number(sumMatch[1]) : null;
  return {
    frpMax: Number.isFinite(frpMax as any) ? (frpMax as number) : null,
    frpSum: Number.isFinite(frpSum as any) ? (frpSum as number) : null,
  };
}

function parseDetections(title?: string, description?: string) {
  const titleMatch = String(title ?? "").match(/\((\d+)\s*detections?\)/i);
  const descriptionMatch = String(description ?? "").match(/detected\s+(\d+)\s+fire\s+signals?/i);
  const n = Number(titleMatch?.[1] ?? descriptionMatch?.[1] ?? Number.NaN);
  return Number.isFinite(n as any) ? (n as number) : null;
}

function formatFirmsAcquisitionTime(obs: FireSatelliteObservation) {
  if (!obs.acq_date) return "Fecha no disponible";
  const raw = String(obs.acq_time ?? "").trim();
  if (!raw) return `${obs.acq_date} UTC`;
  const padded = raw.padStart(4, "0");
  return `${obs.acq_date} ${padded.slice(0, 2)}:${padded.slice(2, 4)} UTC`;
}

function confidenceLabel(confidence?: string) {
  const c = String(confidence ?? "").toLowerCase();
  if (c === "h") return "Alta";
  if (c === "n") return "Nominal";
  if (c === "l") return "Baja";
  return confidence || "No indicada";
}

function dayNightLabel(daynight?: string) {
  const d = String(daynight ?? "").toUpperCase();
  if (d === "D") return "Día";
  if (d === "N") return "Noche";
  return daynight || "No indicado";
}

function guessTrendLabel(ev: EnvironmentalEvent) {
  const arr = Array.isArray(ev.riskIndicators) ? ev.riskIndicators : [];
  const trendLine = arr.find((x) => String(x).toLowerCase().startsWith("trend:"));
  if (!trendLine) return null;

  const lower = String(trendLine).toLowerCase();
  if (lower.includes("intens")) return "TREND: Intensifying";
  if (lower.includes("weak")) return "TREND: Weakening";
  if (lower.includes("stable")) return "TREND: Stable";

  const after = trendLine.split(":").slice(1).join(":").trim();
  return after ? `TREND: ${after}` : null;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function levelFromFRPMax(frpMax: number | null) {
  if (frpMax == null) return null;
  return clamp(Math.round((frpMax / 120) * 100), 0, 100);
}

function levelFromDetections(d: number | null) {
  if (d == null) return null;
  return clamp(Math.round((d / 25) * 100), 0, 100);
}

function levelFromFRPSum(frpSum: number | null) {
  if (frpSum == null) return null;
  return clamp(Math.round((frpSum / 250) * 100), 0, 100);
}

// ---------- Official + siren logic (Opción A) ----------
const OFFICIAL_DOMAIN_ALLOWLIST = [
  "argentina.gob.ar",
  "gob.ar",
  "gov.ar",
  "ina.gob.ar",
  "smn.gob.ar",
  "mininterior.gob.ar",
  "seguridad.gob.ar",
  "ambiente.gob.ar",
  "prefecturanaval.gob.ar",
];

const OFFICIAL_DOMAIN_HINTS = [
  "gobierno",
  "municipalidad",
  "defensacivil",
  "proteccioncivil",
  "proteccióncivil",
  "bomberos",
  "prefectura",
  "coe",
  "comite",
  "comité",
  "emergencia",
  "emergencias",
  "parquenacional",
  "parquesnacionales",
  "salud",
];

const OFFICIAL_TEXT_KEYWORDS = [
  "comunicado",
  "se informa",
  "se dispone",
  "se solicita",
  "aviso oficial",
  "defensa civil",
  "protección civil",
  "proteccion civil",
  "municipalidad",
  "gobierno",
  "ministerio",
  "prefectura",
  "bomberos",
  "coe",
  "comité de emergencia",
  "comite de emergencia",
];

const SIREN_KEYWORDS = [
  "evacuación",
  "evacuar",
  "evacue",
  "evacuen",
  "orden de evacuación",
  "orden de evacuacion",
  "alerta roja",
  "alerta naranja",
  "emergencia",
  "desalojo",
  "refugio",
  "centro de evacuados",
  "crecida",
  "desborde",
  "inminente",
];

function safeLower(s: string | null | undefined) {
  return String(s ?? "").toLowerCase();
}

function domainIsOfficial(domain: string | null) {
  const d = safeLower(domain).trim();
  if (!d) return false;

  if (OFFICIAL_DOMAIN_ALLOWLIST.some((x) => d === x || d.endsWith(`.${x}`))) return true;

  if (d.endsWith(".gob.ar") || d.endsWith(".gov.ar")) return true;
  if (d.endsWith(".gov") || d.endsWith(".gob")) return true;

  if (OFFICIAL_DOMAIN_HINTS.some((k) => d.includes(k))) return true;

  return false;
}

function textLooksOfficial(title: string | null, summary: string | null) {
  const t = safeLower(title);
  const s = safeLower(summary);
  const blob = `${t} ${s}`.trim();
  if (!blob) return false;
  return OFFICIAL_TEXT_KEYWORDS.some((k) => blob.includes(k));
}

function isEvacuationRelevant(it: NewsItem) {
  const blob = `${safeLower(it.title)} ${safeLower(it.summary)}`.trim();
  if (!blob) return false;
  return SIREN_KEYWORDS.some((k) => blob.includes(k));
}

// ---------- Guardian climate insight (heurística) ----------
type GuardianWeatherInsight = {
  headline: string;
  mood: "good" | "watch" | "bad" | "unknown";
  reliefPct: number | null;
  lines: string[];
};

function computeGuardianWeatherInsight(ev: EnvironmentalEvent, w: WeatherCurrent | null): GuardianWeatherInsight {
  if (!w) {
    return {
      headline: "Clima no disponible",
      mood: "unknown",
      reliefPct: null,
      lines: [
        "No pude leer condiciones en este punto ahora mismo.",
        "Si estás cerca del evento, priorizá tu seguridad y revisá actualizaciones oficiales.",
      ],
    };
  }

  const rain = w.precipitation ?? null;
  const wind = w.wind_speed_10m ?? null;
  const hum = w.relative_humidity_2m ?? null;
  const temp = w.temperature_2m ?? null;

  let score = 50;

  if (ev.category === "fire") {
    if (rain != null) {
      if (rain >= 2) score += 25;
      else if (rain >= 0.5) score += 12;
      else score -= 10;
    }
    if (wind != null) {
      if (wind >= 35) score -= 25;
      else if (wind >= 20) score -= 12;
      else score += 6;
    }
    if (hum != null) {
      if (hum >= 60) score += 12;
      else if (hum <= 30) score -= 12;
    }
    if (temp != null) {
      if (temp >= 32) score -= 10;
      else if (temp <= 20) score += 4;
    }
  } else if (ev.category === "flood") {
    if (rain != null) {
      if (rain >= 10) score -= 30;
      else if (rain >= 3) score -= 18;
      else if (rain >= 0.5) score -= 8;
      else score += 6;
    }
    if (wind != null) {
      if (wind >= 35) score -= 6;
      else score += 2;
    }
  } else if (ev.category === "storm") {
    if (wind != null) {
      if (wind >= 50) score -= 25;
      else if (wind >= 30) score -= 15;
      else score += 6;
    }
    if (rain != null) {
      if (rain >= 10) score -= 15;
      else if (rain >= 3) score -= 8;
      else score += 2;
    }
  } else {
    if (wind != null && wind >= 35) score -= 10;
    if (rain != null && rain >= 5) score -= 5;
  }

  score = clamp(Math.round(score), 0, 100);

  const mood: GuardianWeatherInsight["mood"] = score >= 70 ? "good" : score >= 45 ? "watch" : "bad";
  const headline = mood === "good" ? "Buenas señales" : mood === "watch" ? "Atención" : "Condición difícil";

  const lines: string[] = [];

  if (ev.category === "fire") {
    if (rain != null && rain >= 0.5) lines.push("Hay lluvia registrada: puede ayudar a bajar intensidad, aunque no garantiza control.");
    else lines.push("No se ve lluvia útil en este punto ahora: el fuego tiende a sostenerse más tiempo.");

    if (wind != null) {
      if (wind >= 35) lines.push("El viento está fuerte: puede empujar el frente y empeorar la propagación.");
      else if (wind >= 20) lines.push("El viento es moderado: puede complicar focos activos y cambios rápidos.");
      else lines.push("El viento está relativamente calmo: eso suele ayudar a que el frente no corra tan rápido.");
    }

    if (hum != null) {
      if (hum >= 60) lines.push("La humedad es alta: es una condición un poco más favorable.");
      else if (hum <= 30) lines.push("La humedad es baja: el ambiente está seco y el fuego se vuelve más agresivo.");
    }
  } else if (ev.category === "flood") {
    if (rain != null && rain >= 3) lines.push("Se registra lluvia: puede sostener la crecida o empeorar anegamientos.");
    else if (rain != null && rain >= 0.5) lines.push("Hay lluvia leve: puede sumar, aunque el impacto depende del suelo y del cauce.");
    else lines.push("No se ve lluvia relevante ahora: eso ayuda a que la situación no escale por precipitación.");

    if (wind != null && wind >= 35) lines.push("El viento está fuerte: puede complicar traslados y operaciones en zonas expuestas.");
  } else if (ev.category === "storm") {
    if (wind != null && wind >= 30) lines.push("Viento sostenido: posible caída de ramas, cables y riesgo en traslados.");
    if (rain != null && rain >= 3) lines.push("Lluvia activa: atención a calles anegadas y visibilidad reducida.");
    if (lines.length === 0) lines.push("Condiciones moderadas ahora, pero una tormenta puede cambiar rápido.");
  } else {
    lines.push("Estas condiciones ayudan a leer el contexto, pero el riesgo depende de varios factores.");
  }

  lines.push("Si estás cerca, priorizá moverte a un lugar seguro y mantené tu plan listo.");

  return { headline, mood, reliefPct: score, lines: lines.slice(0, 3) };
}

// ---------- Distance helpers (haversine) ----------
function toRad(n: number) {
  return (n * Math.PI) / 180;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const sLat1 = toRad(aLat);
  const sLat2 = toRad(bLat);

  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(sLat1) * Math.cos(sLat2) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

// ---------- UI bits ----------
function NewsThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const ok = !!src && /^https?:\/\//i.test(src) && !failed;
  if (!ok) return null;

  return (
    <div className="shrink-0 h-16 w-16 rounded-xl overflow-hidden border border-white/10 bg-white/5">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function CameraThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const ok = !!src && /^https?:\/\//i.test(src) && !failed;
  if (!ok) {
    return (
      <div className="shrink-0 h-16 w-16 rounded-xl overflow-hidden border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-1 px-1 text-center">
        <ImageIcon className="h-4 w-4 text-white/35" />
        <span className="text-[9px] leading-tight text-white/45">Snapshot no disponible</span>
      </div>
    );
  }

  return (
    <div className="shrink-0 h-16 w-16 rounded-xl overflow-hidden border border-white/10 bg-white/5">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function CameraSnapshotPreview({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const ok = !!src && /^https?:\/\//i.test(src) && !failed;

  if (!ok) {
    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 min-h-[180px] flex flex-col items-center justify-center gap-2 px-4 text-center">
        <ImageIcon className="h-6 w-6 text-white/35" />
        <div className="text-sm font-medium text-white/65">Snapshot no disponible</div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
      <img
        src={src}
        alt={alt}
        className="w-full max-h-[260px] object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function VisualExposureGate({
  preference,
  onReveal,
}: {
  preference: GuardianExposurePreference;
  onReveal: () => void;
}) {
  const message =
    preference === "data_only"
      ? "Contenido visual oculto por tu preferencia Solo datos."
      : preference === "hide_sensitive"
      ? "Contenido visual sin clasificación de sensibilidad. Se mantiene oculto."
      : "Contenido visual oculto hasta que decidas verlo en esta sesión.";

  return (
    <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.04] px-4 py-4 text-center">
      <ShieldCheck className="mx-auto h-5 w-5 text-emerald-200/65" />
      <div className="mt-2 text-sm text-white/65">{message}</div>
      {preference === "ask_first" ? (
        <button
          type="button"
          onClick={onReveal}
          className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15"
        >
          <ImageIcon className="h-4 w-4" />
          Mostrar imágenes en esta sesión
        </button>
      ) : null}
    </div>
  );
}

function Dial({ value, label }: { value: number | null; label: string }) {
  const v = value == null ? 0 : clamp(value, 0, 100);
  const deg = 240 * (v / 100);

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full bg-white/5 border border-white/10" />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 210deg, rgba(255,0,68,0.85) ${deg}deg, rgba(255,255,255,0.06) 0deg)`,
            maskImage: "radial-gradient(circle at center, transparent 58%, black 60%)",
            WebkitMaskImage: "radial-gradient(circle at center, transparent 58%, black 60%)",
          }}
        />
        <div className="absolute inset-0 flex items-end justify-center pb-2">
          <div className="text-[11px] text-white/85 font-semibold">{value ?? "—"}</div>
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wide text-white/45">{label}</div>
        <div className="text-sm text-white/85 font-medium">{value == null ? "—" : `${v} nivel`}</div>
      </div>
    </div>
  );
}

function SectionShell({
  icon,
  title,
  right,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
      <div className="flex flex-col items-stretch justify-between gap-3 px-5 pb-3 pt-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-white/90 font-semibold">{title}</div>
            {subtitle ? <div className="text-xs text-white/45 mt-0.5">{subtitle}</div> : null}
          </div>
        </div>
        {right ? <div className="self-start sm:shrink-0">{right}</div> : null}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function CriticalFacilitySummary({
  items,
  loading,
  error,
  loaded,
}: {
  items: CriticalFacility[];
  loading: boolean;
  error: boolean;
  loaded: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-1 flex items-center gap-2 text-xs text-white/45">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Consultando servicios cercanos…
      </div>
    );
  }

  if (error) {
    return <div className="mt-1 text-xs text-amber-100/65">Fuente temporalmente limitada.</div>;
  }

  if (items.length > 0) {
    return (
      <div className="mt-1">
        <div className="text-xs text-white/55">
          {items.length} {items.length === 1 ? "registro cartografiado" : "registros cartografiados"} en 25 km
        </div>
        <div className="mt-2 space-y-1.5">
          {items.slice(0, 3).map((facility) => (
            <a
              key={facility.id}
              href={facility.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-start justify-between gap-2 text-xs text-cyan-100/65 hover:text-cyan-100/90"
            >
              <span className="min-w-0 truncate">{facility.name}</span>
              <span className="shrink-0 text-white/35">
                {facility.distanceKm != null ? `${facility.distanceKm.toFixed(1)} km` : "distancia n/d"}
              </span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 text-xs leading-relaxed text-white/45">
      {loaded
        ? "Sin registros cercanos en la fuente consultada; la cobertura puede ser incompleta."
        : "Fuente aún no conectada."}
    </div>
  );
}

const COMMUNITY_KIND_LABEL: Record<NearbyCommunity["kind"], string> = {
  city: "Ciudad",
  town: "Localidad",
  village: "Pueblo",
  hamlet: "Paraje",
  municipality: "Municipio",
  township: "Municipio/localidad",
};

function NearbyCommunitySummary({
  items,
  loading,
  error,
  loaded,
}: {
  items: NearbyCommunity[];
  loading: boolean;
  error: boolean;
  loaded: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-1 flex items-center gap-2 text-xs text-white/45">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Consultando núcleos habitados…
      </div>
    );
  }
  if (error) return <div className="mt-1 text-xs text-amber-100/65">Fuente temporalmente limitada.</div>;
  if (items.length === 0) {
    return (
      <div className="mt-1 text-xs leading-relaxed text-white/45">
        {loaded
          ? "Sin comunidades registradas dentro del radio; la cobertura puede ser incompleta."
          : "Información territorial aún no conectada."}
      </div>
    );
  }

  return (
    <div className="mt-1">
      <div className="text-xs text-white/55">
        {items.length} {items.length === 1 ? "núcleo habitado" : "núcleos habitados"} en 50 km
      </div>
      <div className="mt-2 space-y-1.5">
        {items.slice(0, 3).map((community) => (
          <a
            key={community.id}
            href={community.mapUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-start justify-between gap-2 text-xs text-cyan-100/65 hover:text-cyan-100/90"
          >
            <span className="min-w-0 truncate">
              {community.name} · {COMMUNITY_KIND_LABEL[community.kind]}
            </span>
            <span className="shrink-0 text-white/35">
              {community.distanceKm != null ? `${community.distanceKm.toFixed(1)} km` : "distancia n/d"}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

const WATER_KIND_LABEL: Record<WaterResource["kind"], string> = {
  river: "Curso o sistema hídrico",
  waterbody: "Cuerpo de agua",
  wetland: "Humedal",
  bay: "Bahía",
  spring: "Manantial",
};

function WaterResourceSummary({
  items,
  loading,
  error,
  loaded,
}: {
  items: WaterResource[];
  loading: boolean;
  error: boolean;
  loaded: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-white/45">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Consultando recursos hídricos cercanos…
      </div>
    );
  }
  if (error) return <div className="mt-2 text-xs text-amber-100/65">Fuente temporalmente limitada.</div>;
  if (items.length === 0) {
    return (
      <div className="mt-2 text-xs leading-relaxed text-white/45">
        {loaded
          ? "Sin recursos hídricos con nombre dentro del radio; la cobertura puede ser incompleta."
          : "Información de recursos hídricos aún no conectada."}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="text-xs text-white/55">
        {items.length} {items.length === 1 ? "recurso cartografiado" : "recursos cartografiados"} en 50 km
      </div>
      <div className="mt-2 space-y-1.5">
        {items.slice(0, 4).map((resource) => (
          <a
            key={resource.id}
            href={resource.mapUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-start justify-between gap-2 text-xs text-cyan-100/65 hover:text-cyan-100/90"
          >
            <span className="min-w-0 truncate">
              {resource.name} · {WATER_KIND_LABEL[resource.kind]}
            </span>
            <span className="shrink-0 text-white/35">
              {resource.distanceKm != null ? `${resource.distanceKm.toFixed(1)} km` : "distancia n/d"}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function AlertPanel({ event, onClose }: AlertPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const guardianObservationRef = useRef<HTMLDivElement | null>(null);
  const newsAbortRef = useRef<AbortController | null>(null);
  const weatherAbortRef = useRef<AbortController | null>(null);
  const cameraAbortRef = useRef<AbortController | null>(null);
  const protectedContextAbortRef = useRef<AbortController | null>(null);
  const criticalInfrastructureAbortRef = useRef<AbortController | null>(null);
  const nearbyCommunitiesAbortRef = useRef<AbortController | null>(null);
  const waterContextAbortRef = useRef<AbortController | null>(null);
  const fireHistoryAbortRef = useRef<AbortController | null>(null);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [guardianStore, setGuardianStore] = useState<GuardianLocalStore>(() => readGuardianLocalStore());
  const [guardianStorageErr, setGuardianStorageErr] = useState<string | null>(null);
  const [guardianVisualConsent, setGuardianVisualConsent] = useState(false);
  const [guardianDeletePending, setGuardianDeletePending] = useState(false);
  const [guardianObservationDeleteId, setGuardianObservationDeleteId] = useState<string | null>(null);
  const [guardianPreparationOpen, setGuardianPreparationOpen] = useState(false);
  const [guardianObservationDraft, setGuardianObservationDraft] = useState<GuardianObservationDraft | null>(null);
  const [activeSection, setActiveSection] = useState<AlertPanelSection>("main");
  const [activeSatelliteLayerId, setActiveSatelliteLayerId] = useState(SATELLITE_RASTER_LAYERS[0].id);

  useEffect(() => {
    if (!event) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [event?.id]);

  useEffect(() => {
    if (!event) return;
    setFollowedIds(readFollowedIds());
    setGuardianStore(readGuardianLocalStore());
    setGuardianStorageErr(null);
    setGuardianVisualConsent(false);
    setGuardianDeletePending(false);
    setGuardianObservationDeleteId(null);
    setGuardianPreparationOpen(false);
    setGuardianObservationDraft(null);
    setActiveSection("main");
  }, [event?.id]);

  useEffect(() => {
    if (!event) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardianPreparationOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [event?.id, guardianPreparationOpen, onClose]);

  // ====== NEWS state ======
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsErr, setNewsErr] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsMeta, setNewsMeta] = useState<{ query: string; fetchedAt?: string; placeUsed?: string } | null>(null);
  const [newsLimited, setNewsLimited] = useState(false);
  const [newsDiscardedCount, setNewsDiscardedCount] = useState(0);
  const [newsView, setNewsView] = useState<"main" | "official" | "regional">("main");
  const [placeCache, setPlaceCache] = useState<Record<string, string>>({});

  // ====== WEATHER state ======
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherCurrent | null>(null);

  // ====== PROTECTED CONTEXT state ======
  const [protectedContextLoading, setProtectedContextLoading] = useState(false);
  const [protectedContextErr, setProtectedContextErr] = useState<string | null>(null);
  const [protectedContext, setProtectedContext] = useState<ProtectedContextResponse | null>(null);

  // ====== CRITICAL INFRASTRUCTURE state ======
  const [criticalInfrastructureLoading, setCriticalInfrastructureLoading] = useState(false);
  const [criticalInfrastructureErr, setCriticalInfrastructureErr] = useState<string | null>(null);
  const [criticalInfrastructure, setCriticalInfrastructure] = useState<CriticalInfrastructureResponse | null>(null);

  // ====== NEARBY COMMUNITIES state ======
  const [nearbyCommunitiesLoading, setNearbyCommunitiesLoading] = useState(false);
  const [nearbyCommunitiesErr, setNearbyCommunitiesErr] = useState<string | null>(null);
  const [nearbyCommunitiesContext, setNearbyCommunitiesContext] = useState<NearbyCommunitiesResponse | null>(null);

  // ====== WATER CONTEXT state ======
  const [waterContextLoading, setWaterContextLoading] = useState(false);
  const [waterContextErr, setWaterContextErr] = useState<string | null>(null);
  const [waterContext, setWaterContext] = useState<WaterContextResponse | null>(null);

  // ====== FIRE HISTORY state ======
  const [fireHistoryLoading, setFireHistoryLoading] = useState(false);
  const [fireHistoryErr, setFireHistoryErr] = useState<string | null>(null);
  const [fireHistory, setFireHistory] = useState<FireHistoryResponse | null>(null);

  // ====== CAMERAS state ======
  const [camLoading, setCamLoading] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [camRegistry, setCamRegistry] = useState<CameraRegistryItem[]>([]);
  const [camRadiusKm, setCamRadiusKm] = useState<number>(60);
  const [camRefreshTick, setCamRefreshTick] = useState<number>(0);
  const [providerSnapshots, setProviderSnapshots] = useState<Record<string, ProviderCameraSnapshot>>({});

  const trend = useMemo(() => (event ? guessTrendLabel(event) ?? "TREND: —" : "TREND: —"), [event?.id]);

  const { frpMax, frpSum } = useMemo(() => parseFRPFromDescription(event?.description), [event?.description]);
  const detections = useMemo(
    () => parseDetections(event?.title, event?.description),
    [event?.title, event?.description]
  );

  const intensityLevel = useMemo(() => levelFromFRPMax(frpMax), [frpMax]);
  const activityLevel = useMemo(() => levelFromDetections(detections), [detections]);
  const energyLevel = useMemo(() => levelFromFRPSum(frpSum), [frpSum]);

  async function ensureNewsPlace(ev: EnvironmentalEvent, signal?: AbortSignal): Promise<string> {
    const cached = placeCache[String(ev.id)];
    if (cached) return cached;

    const loc = (ev.location ?? "").trim();

    if (loc && !isGenericLocation(loc)) {
      setPlaceCache((p) => ({ ...p, [String(ev.id)]: loc }));
      return loc;
    }

    const place = await reverseGeocodeViaWorker(ev.latitude, ev.longitude, signal);
    const finalPlace = (place ?? loc ?? "").trim();
    const safe = finalPlace && !isGenericLocation(finalPlace) ? finalPlace : `Argentina`;

    setPlaceCache((p) => ({ ...p, [String(ev.id)]: safe }));
    return safe;
  }

  const loadNews = async () => {
    if (!event) return;
    newsAbortRef.current?.abort();
    const controller = new AbortController();
    newsAbortRef.current = controller;

    setNewsLoading(true);
    setNewsErr(null);
    setNewsLimited(false);
    setNewsDiscardedCount(0);
    setNewsItems([]);
    setNewsMeta(null);

    try {
      const place = await ensureNewsPlace(event, controller.signal);
      const query = buildNewsQueryFromPlace(event, place);

      const data = await fetchNewsFromWorker({
        query,
        days: event.category === "fire" ? 10 : 14,
        max: 12,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      const items = Array.isArray(data?.items) ? data.items : [];
      const candidateItems = items
        .filter((x) => x && (x.title || x.url))
        .map((x) => ({
          ...x,
          title: x.title?.trim() ?? null,
          summary: x.summary?.trim() ?? null,
          image: x.image?.trim() ?? null,
        }));
      const cleaned = candidateItems.filter((item) => isNewsRelevantToEvent(event, place, item));

      setNewsItems(cleaned);
      setNewsDiscardedCount(Math.max(0, candidateItems.length - cleaned.length));
      setNewsLimited(data?.gdelt?.ok === false || Number(data?.gdelt?.status) === 429);
      setNewsMeta({ query: data.query ?? query, fetchedAt: data.fetched_at, placeUsed: place });
    } catch (e: any) {
      if (isAbortError(e)) return;
      setNewsItems([]);
      setNewsDiscardedCount(0);
      setNewsMeta(null);
      setNewsErr(e?.message ? String(e.message) : "No se pudo cargar noticias.");
    } finally {
      if (!controller.signal.aborted) setNewsLoading(false);
    }
  };

  const loadWeather = async () => {
    if (!event) return;
    weatherAbortRef.current?.abort();
    const controller = new AbortController();
    weatherAbortRef.current = controller;

    setWeatherLoading(true);
    setWeatherErr(null);
    setWeather(null);

    try {
      const w = await fetchCurrentWeatherOpenMeteo(event.latitude, event.longitude, controller.signal);
      if (controller.signal.aborted) return;
      setWeather(w);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setWeather(null);
      setWeatherErr(e?.message ? String(e.message) : "No se pudo cargar clima.");
    } finally {
      if (!controller.signal.aborted) setWeatherLoading(false);
    }
  };

  const loadCameraRegistry = async () => {
    cameraAbortRef.current?.abort();
    const controller = new AbortController();
    cameraAbortRef.current = controller;

    setCamLoading(true);
    setCamErr(null);
    try {
      const items = await fetchCameraRegistry(controller.signal);
      if (controller.signal.aborted) return;
      setCamRegistry(items);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setCamRegistry([]);
      setCamErr(e?.message ? String(e.message) : "No se pudo cargar cámaras.");
    } finally {
      if (!controller.signal.aborted) setCamLoading(false);
    }
  };

  const loadProtectedContext = async () => {
    if (!event) return;
    protectedContextAbortRef.current?.abort();
    const controller = new AbortController();
    protectedContextAbortRef.current = controller;

    setProtectedContextLoading(true);
    setProtectedContextErr(null);
    setProtectedContext(null);

    try {
      const context = await fetchProtectedContext(event.latitude, event.longitude, controller.signal);
      if (controller.signal.aborted) return;
      setProtectedContext(context);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setProtectedContext(null);
      setProtectedContextErr(e?.message ? String(e.message) : "No se pudo consultar áreas protegidas.");
    } finally {
      if (!controller.signal.aborted) setProtectedContextLoading(false);
    }
  };

  const loadCriticalInfrastructure = async () => {
    if (!event) return;
    criticalInfrastructureAbortRef.current?.abort();
    const controller = new AbortController();
    criticalInfrastructureAbortRef.current = controller;

    setCriticalInfrastructureLoading(true);
    setCriticalInfrastructureErr(null);
    setCriticalInfrastructure(null);

    try {
      const context = await fetchCriticalInfrastructure(event.latitude, event.longitude, controller.signal);
      if (controller.signal.aborted) return;
      setCriticalInfrastructure(context);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setCriticalInfrastructure(null);
      setCriticalInfrastructureErr(e?.message ? String(e.message) : "No se pudo consultar infraestructura crítica.");
    } finally {
      if (!controller.signal.aborted) setCriticalInfrastructureLoading(false);
    }
  };

  const loadNearbyCommunities = async () => {
    if (!event) return;
    nearbyCommunitiesAbortRef.current?.abort();
    const controller = new AbortController();
    nearbyCommunitiesAbortRef.current = controller;

    setNearbyCommunitiesLoading(true);
    setNearbyCommunitiesErr(null);
    setNearbyCommunitiesContext(null);

    try {
      const context = await fetchNearbyCommunities(event.latitude, event.longitude, controller.signal);
      if (controller.signal.aborted) return;
      setNearbyCommunitiesContext(context);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setNearbyCommunitiesContext(null);
      setNearbyCommunitiesErr(e?.message ? String(e.message) : "No se pudo consultar comunidades cercanas.");
    } finally {
      if (!controller.signal.aborted) setNearbyCommunitiesLoading(false);
    }
  };

  const loadWaterContext = async () => {
    if (!event) return;
    waterContextAbortRef.current?.abort();
    const controller = new AbortController();
    waterContextAbortRef.current = controller;

    setWaterContextLoading(true);
    setWaterContextErr(null);
    setWaterContext(null);

    try {
      const context = await fetchWaterContext(event.latitude, event.longitude, controller.signal);
      if (controller.signal.aborted) return;
      setWaterContext(context);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setWaterContext(null);
      setWaterContextErr(e?.message ? String(e.message) : "No se pudo consultar recursos hídricos.");
    } finally {
      if (!controller.signal.aborted) setWaterContextLoading(false);
    }
  };

  const loadFireHistory = async () => {
    if (!event || event.category !== "fire") {
      fireHistoryAbortRef.current?.abort();
      setFireHistoryLoading(false);
      setFireHistoryErr(null);
      setFireHistory(null);
      return;
    }

    fireHistoryAbortRef.current?.abort();
    const controller = new AbortController();
    fireHistoryAbortRef.current = controller;

    const historyMonth = (toValidDate(event.lastSeen) ?? toValidDate(event.timestamp) ?? new Date()).getUTCMonth() + 1;

    setFireHistoryLoading(true);
    setFireHistoryErr(null);
    setFireHistory(null);

    try {
      const history = await fetchFireHistory({
        lat: event.latitude,
        lon: event.longitude,
        radiusKm: 25,
        years: 5,
        month: historyMonth,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setFireHistory(history);
    } catch (e: any) {
      if (isAbortError(e)) return;
      setFireHistory(null);
      setFireHistoryErr(e?.message ? String(e.message) : "No se pudo consultar historial FIRMS.");
    } finally {
      if (!controller.signal.aborted) setFireHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!event) return;
    setNewsView("main");
    setProviderSnapshots({});
    loadNews();
    loadWeather();
    loadCameraRegistry();
    loadProtectedContext();
    loadCriticalInfrastructure();
    loadNearbyCommunities();
    loadWaterContext();
    loadFireHistory();

    return () => {
      newsAbortRef.current?.abort();
      weatherAbortRef.current?.abort();
      cameraAbortRef.current?.abort();
      protectedContextAbortRef.current?.abort();
      criticalInfrastructureAbortRef.current?.abort();
      nearbyCommunitiesAbortRef.current?.abort();
      waterContextAbortRef.current?.abort();
      fireHistoryAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const splitNews = useMemo(() => {
    const items = Array.isArray(newsItems) ? newsItems : [];
    const official = items.filter((it) => domainIsOfficial(it.domain) || textLooksOfficial(it.title, it.summary));
    const regional = items.filter((x) => !(domainIsOfficial(x.domain) || textLooksOfficial(x.title, x.summary)));
    return { official, regional };
  }, [newsItems]);
  const newsFilteredOut = newsDiscardedCount > 0 && newsItems.length === 0 && !newsLoading && !newsErr;
  const newsFilteredMessage =
    newsDiscardedCount === 1
      ? "BioPulse descartó 1 resultado débil porque no mencionaba claramente el lugar del evento o no tenía relación suficiente con la catástrofe."
      : `BioPulse descartó ${newsDiscardedCount} resultados débiles porque no mencionaban claramente el lugar del evento o no tenían relación suficiente con la catástrofe.`;
  const showHistoricalNewsContext =
    (Boolean(newsMeta) && !newsLoading && !newsErr && !newsLimited) || event.category === "fire";
  const historicalNewsTopic =
    event.category === "fire"
      ? "incendios y focos térmicos"
      : event.category === "flood"
      ? "inundaciones y crecidas"
      : event.category === "storm"
      ? "tormentas y alertas meteorológicas"
      : event.category === "heatwave"
      ? "olas de calor"
      : event.category === "air-pollution"
      ? "episodios de contaminación del aire"
      : "eventos ambientales similares";
  const sirenActive = useMemo(() => {
    if (event?.evacuationLevel === "mandatory") return true;
    return splitNews.official.some((item) => domainIsOfficial(item.domain) && isEvacuationRelevant(item));
  }, [event?.evacuationLevel, splitNews.official]);

  const guardianInsight = useMemo(() => {
    if (!event) {
      return {
        headline: "Clima no disponible",
        mood: "unknown" as const,
        reliefPct: null,
        lines: ["No pude leer condiciones en este punto ahora mismo."],
      };
    }
    return computeGuardianWeatherInsight(event, weather);
  }, [event, weather]);

  const insightPill =
    guardianInsight.mood === "good"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/90"
      : guardianInsight.mood === "watch"
      ? "border-yellow-300/20 bg-yellow-300/10 text-yellow-100/90"
      : guardianInsight.mood === "bad"
      ? "border-red-400/20 bg-red-500/10 text-red-100/90"
      : "border-white/10 bg-white/5 text-white/80";

  const nearbyCameras = useMemo(() => {
    if (!event) return [] as LoadedCamera[];
    const baseLat = event.latitude;
    const baseLon = event.longitude;

    const list = (Array.isArray(camRegistry) ? camRegistry : [])
      .filter((c) => c?.geo && Number.isFinite(c.geo.lat as any) && Number.isFinite(c.geo.lon as any))
      .map((c) => {
        const d = haversineKm(baseLat, baseLon, c.geo.lat, c.geo.lon);
        return { ...c, distanceKm: d } as LoadedCamera;
      })
      .filter((c) => c.distanceKm <= camRadiusKm)
      .sort((a, b) => {
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pb !== pa) return pb - pa;
        return a.distanceKm - b.distanceKm;
      });

    return list;
  }, [camRegistry, camRadiusKm, event?.id]);

  useEffect(() => {
    if (!event || nearbyCameras.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();

    nearbyCameras.forEach((cam) => {
      const fetchInfo: any = cam.fetch;
      if (fetchInfo?.kind !== "provider_api" || fetchInfo?.provider !== "windy" || !fetchInfo?.cameraKey) return;

      setProviderSnapshots((prev) => ({
        ...prev,
        [cam.id]: {
          status: "loading",
          detailUrl: `https://www.windy.com/webcams/${fetchInfo.cameraKey}`,
          attributionText: cam.usage?.attributionText ?? "Webcams provided by Windy.com",
        },
      }));

      fetchWindyCameraSnapshot({
        cameraKey: String(fetchInfo.cameraKey),
        endpoint: typeof fetchInfo.endpoint === "string" ? fetchInfo.endpoint : undefined,
        signal: controller.signal,
      })
        .then((snapshot) => {
          if (cancelled) return;
          setProviderSnapshots((prev) => ({ ...prev, [cam.id]: snapshot }));
        })
        .catch((err: any) => {
          if (cancelled || isAbortError(err)) return;
          setProviderSnapshots((prev) => ({
            ...prev,
            [cam.id]: {
              status: "error",
              detailUrl: `https://www.windy.com/webcams/${fetchInfo.cameraKey}`,
              attributionText: cam.usage?.attributionText ?? "Webcams provided by Windy.com",
              message: err?.message ? String(err.message) : "No se pudo cargar snapshot.",
            },
          }));
        });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [nearbyCameras, camRefreshTick, event?.id]);

  if (!event) return null;

  const chip = sevChip(event.severity);
  const isFollowed = followedIds.includes(event.id);
  const evacuationLabel =
    event.evacuationLevel === "mandatory"
      ? "Evacuación obligatoria"
      : event.evacuationLevel === "recommended"
      ? "Evacuación recomendada"
      : event.evacuationLevel === "none"
      ? "Sin evacuación indicada"
      : null;

  const rainText = weather?.precipitation == null ? "—" : `${weather.precipitation.toFixed(1)} mm`;
  const windText = weather?.wind_speed_10m == null ? "—" : `${weather.wind_speed_10m.toFixed(0)} km/h`;
  const humText = weather?.relative_humidity_2m == null ? "—" : `${weather.relative_humidity_2m.toFixed(0)}%`;
  const tempText = weather?.temperature_2m == null ? "—" : `${weather.temperature_2m.toFixed(1)}°C`;

  const observationDate = toValidDate(event.lastSeen) ?? toValidDate(event.timestamp);
  const observationFreshness = formatObservationFreshness(observationDate);
  const satelliteDetections = Number.isFinite(event.focusCount) ? event.focusCount! : detections;
  const satelliteFrpMax = Number.isFinite(event.frpMax) ? event.frpMax! : frpMax;
  const satelliteFrpSum = Number.isFinite(event.frpSum) ? event.frpSum! : frpSum;
  const satelliteFireObservations = Array.isArray(event.satelliteObservations)
    ? event.satelliteObservations.filter(
        (obs) => Number.isFinite(obs.latitude) && Number.isFinite(obs.longitude)
      )
    : [];
  const satelliteObservedInstruments = Array.from(
    new Set(satelliteFireObservations.map((obs) => obs.instrument).filter((item): item is string => Boolean(item)))
  );
  const satelliteSource = event.satelliteSource ?? null;
  const activeSatelliteLayer =
    SATELLITE_RASTER_LAYERS.find((layer) => layer.id === activeSatelliteLayerId) ?? SATELLITE_RASTER_LAYERS[0];
  const satelliteLayerObservedAt = (observationDate ?? new Date()).toISOString();
  const satelliteLayerSourceReference = [
    `NASA GIBS layer: ${activeSatelliteLayer.label} (${activeSatelliteLayer.id})`,
    `human label: ${activeSatelliteLayer.plainLabel}`,
    `date: ${observationDate ? fmtDateTimeUTC(observationDate) : "no disponible"}`,
    `coordinates: ${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`,
    satelliteSource?.product ? `FIRMS product: ${satelliteSource.product}` : null,
    event.liveFeedUrl ? `FIRMS viewer: ${event.liveFeedUrl}` : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(" | ");
  const satelliteLayerObservationLimitations = [
    activeSatelliteLayer.limitations,
    "La vista GIBS puede tener nubes, retraso temporal, huecos de cobertura o no mostrar humo/fuego aunque existan detecciones térmicas FIRMS.",
    event.stale ? "El evento está marcado como desactualizado; revisar fecha y fuente original antes de interpretar." : null,
    "La observación Guardian debe describir únicamente lo visible y separar cualquier inferencia.",
  ]
    .filter((item): item is string => Boolean(item))
    .join(" ");
  const insightProbability =
    Number.isFinite(event.aiInsight?.probabilityNext12h) &&
    event.aiInsight!.probabilityNext12h! >= 0 &&
    event.aiInsight!.probabilityNext12h! <= 100
      ? event.aiInsight!.probabilityNext12h!
      : null;
  const insightNarrative = event.aiInsight?.narrative?.trim() || null;
  const insightRecommendations = Array.isArray(event.aiInsight?.recommendations)
    ? event.aiInsight.recommendations.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
  const observedWeather = [
    Number.isFinite(event.temperature) ? `Temperatura: ${event.temperature!.toFixed(1)}°C` : null,
    Number.isFinite(event.humidity) ? `Humedad: ${event.humidity!.toFixed(0)}%` : null,
    Number.isFinite(event.windSpeed) ? `Viento: ${event.windSpeed!.toFixed(0)} km/h` : null,
  ].filter((item): item is string => Boolean(item));
  const eventEcosystems = Array.isArray(event.ecosystems)
    ? event.ecosystems.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
  const eventSpecies = Array.isArray(event.speciesAtRisk)
    ? event.speciesAtRisk.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
  const eventWaterLevel = Number.isFinite(event.waterLevel) ? event.waterLevel! : null;
  const nearbyWaterResources = Array.isArray(waterContext?.resources) ? waterContext.resources : [];
  const protectedAreas = Array.isArray(protectedContext?.areas) ? protectedContext.areas : [];
  const hasProtectionContext =
    eventEcosystems.length > 0 ||
    eventSpecies.length > 0 ||
    eventWaterLevel != null ||
    protectedAreas.length > 0 ||
    nearbyWaterResources.length > 0;
  const eventPopulation =
    Number.isFinite(event.affectedPopulation) && event.affectedPopulation! >= 0 ? event.affectedPopulation! : null;
  const hasTechnicalFireArea = event.category === "fire" && event.affectedArea === 1;
  const eventArea =
    Number.isFinite(event.affectedArea) && event.affectedArea >= 0 && !hasTechnicalFireArea
      ? event.affectedArea
      : null;
  const eventInfrastructure = Array.isArray(event.nearbyInfrastructure)
    ? event.nearbyInfrastructure.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];
  const criticalFacilities = Array.isArray(criticalInfrastructure?.facilities)
    ? criticalInfrastructure.facilities
    : [];
  const nearbyHealthcare = criticalFacilities.filter((facility) => facility.category === "healthcare");
  const nearbyFireStations = criticalFacilities.filter((facility) => facility.category === "fire_station");
  const nearbyShelters = criticalFacilities.filter((facility) => facility.category === "shelter");
  const nearbySchools = criticalFacilities.filter((facility) => facility.category === "school");
  const nearbyCommunities = Array.isArray(nearbyCommunitiesContext?.communities)
    ? nearbyCommunitiesContext.communities
    : [];
  const humanGeoSource = criticalInfrastructure?.source ?? nearbyCommunitiesContext?.source ?? null;
  const humanEvacuationLabel =
    event.evacuationLevel === "mandatory"
      ? "Evacuación obligatoria informada en el evento"
      : event.evacuationLevel === "recommended"
      ? "Evacuación recomendada informada en el evento"
      : event.evacuationLevel === "none"
      ? "El evento no registra una evacuación"
      : "Estado de evacuación no conectado";
  const hasHumanContext =
    event.evacuationLevel != null ||
    eventPopulation != null ||
    eventArea != null ||
    eventInfrastructure.length > 0 ||
    criticalFacilities.length > 0 ||
    nearbyCommunities.length > 0;
  const timelineEntries: Array<{ id: string; date: Date; title: string; detail: string }> = [];
  const firstSeenDate = toValidDate(event.firstSeen);
  const eventHistory = Array.isArray(event.history) ? event.history : [];
  const comparableHistory = eventHistory
    .map((point) => {
      const date = toValidDate(point?.t as any);
      return date ? { point, date } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const comparisonCurrent = comparableHistory[comparableHistory.length - 1] ?? null;
  const comparisonPrevious = comparableHistory[comparableHistory.length - 2] ?? null;
  const recentHistoricalSignals = [
    firstSeenDate ? `Primera señal conservada: ${fmtDateTimeUTC(firstSeenDate)}` : null,
    observationDate ? `Última señal conservada: ${fmtDateTimeUTC(observationDate)}` : null,
    Number.isFinite(event.scanCount)
      ? `${event.scanCount} ${event.scanCount === 1 ? "escaneo conservado" : "escaneos conservados"}`
      : null,
    comparableHistory.length > 1
      ? `${comparableHistory.length} puntos comparables en la memoria reciente del evento`
      : null,
    satelliteFireObservations.length > 0
      ? `${satelliteFireObservations.length} señales FIRMS crudas conservadas del escaneo actual`
      : null,
    satelliteSource?.days ? `Ventana FIRMS actual consultada: últimos ${satelliteSource.days} días` : null,
  ].filter((item): item is string => Boolean(item));
  const hasRecentHistoricalSignals = recentHistoricalSignals.length > 0;
  const metricChanges: Array<{
    label: string;
    previous: string;
    current: string;
    delta: string;
    direction: "up" | "down" | "same";
  }> = [];

  if (comparisonPrevious && comparisonCurrent) {
    const addNumericChange = (
      label: string,
      previousValue: number | undefined,
      currentValue: number | undefined,
      decimals: number,
      unit = ""
    ) => {
      if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) return;
      const previous = previousValue as number;
      const current = currentValue as number;
      const delta = current - previous;
      const threshold = decimals === 0 ? 0.5 : 0.005;
      const direction = Math.abs(delta) < threshold ? "same" : delta > 0 ? "up" : "down";
      const format = (value: number) => `${value.toFixed(decimals)}${unit}`;
      metricChanges.push({
        label,
        previous: format(previous),
        current: format(current),
        delta: direction === "same" ? "Sin cambio" : `${delta > 0 ? "+" : ""}${format(delta)}`,
        direction,
      });
    };

    addNumericChange(
      "Detecciones",
      comparisonPrevious.point.focusCount,
      comparisonCurrent.point.focusCount,
      0
    );
    addNumericChange("FRP acumulado", comparisonPrevious.point.frpSum, comparisonCurrent.point.frpSum, 2, " MW");
    addNumericChange("FRP máximo", comparisonPrevious.point.frpMax, comparisonCurrent.point.frpMax, 2, " MW");

    if (comparisonPrevious.point.severity && comparisonCurrent.point.severity) {
      const severityRank = { low: 0, moderate: 1, high: 2, critical: 3 } as const;
      const previousSeverity = comparisonPrevious.point.severity;
      const currentSeverity = comparisonCurrent.point.severity;
      const direction =
        severityRank[currentSeverity] === severityRank[previousSeverity]
          ? "same"
          : severityRank[currentSeverity] > severityRank[previousSeverity]
          ? "up"
          : "down";
      metricChanges.push({
        label: "Severidad",
        previous: sevChip(previousSeverity).label,
        current: sevChip(currentSeverity).label,
        delta: direction === "same" ? "Sin cambio" : direction === "up" ? "Aumentó" : "Disminuyó",
        direction,
      });
    }
  }
  const currentTrendLabel =
    event.trend === "rising"
      ? "En aumento"
      : event.trend === "falling"
      ? "En descenso"
      : event.trend === "stable"
      ? "Estable"
      : trend.toLowerCase().includes("intens")
      ? "En aumento"
      : trend.toLowerCase().includes("weak")
      ? "En descenso"
      : trend.toLowerCase().includes("stable")
      ? "Estable"
      : "No disponible";
  const guardianEventRecord = findGuardianEventRecord(guardianStore, event);
  const guardianEventMemory = guardianEventRecord?.memory ?? null;
  const guardianEventRecordId = guardianEventRecord?.recordId ?? null;
  const guardianObservations = (guardianEventMemory?.observationIds ?? [])
    .map((id) => guardianStore.observations[id])
    .filter((observation): observation is GuardianObservation => Boolean(observation))
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  const observationBundleGeneratedAt =
    (observationDate ?? toValidDate(event.timestamp) ?? new Date(0)).toISOString();
  const eventObservationBundle = buildEventObservations({
    event,
    guardianMemory: guardianEventMemory,
    guardianObservations,
    newsItems: [
      ...splitNews.official.map((item) => ({ item, classification: "official_reference" as const })),
      ...splitNews.regional.map((item) => ({ item, classification: "regional_report" as const })),
    ],
    weather,
    cameras: nearbyCameras.map((camera) => ({ camera, providerSnapshot: providerSnapshots[camera.id] ?? null })),
    generatedAt: observationBundleGeneratedAt,
  });
  const normalizedObservationCount = eventObservationBundle.observations.length;
  const normalizedInferenceCount = eventObservationBundle.inferences.length;
  const visibleObservationLedger = [...eventObservationBundle.observations].reverse().slice(0, 8);
  const normalizedGuardianObservations = eventObservationBundle.observations.filter(
    (observation) => observation.type === "guardian_report"
  );
  const normalizedNewsObservations = eventObservationBundle.observations.filter(
    (observation) => observation.type === "news_report" || observation.type === "official_reference"
  );
  const normalizedWeatherObservations = eventObservationBundle.observations.filter(
    (observation) => observation.type === "weather_reading"
  );
  const normalizedCameraObservations = eventObservationBundle.observations.filter(
    (observation) => observation.type === "camera_snapshot"
  );
  const cameraGuardianObservations = guardianObservations.filter(
    (observation) => observation.sourceType === "camera"
  );
  const guardianMissions = (guardianEventMemory?.missionIds ?? [])
    .map((id) => guardianStore.missions[id])
    .filter((mission): mission is GuardianMission => Boolean(mission))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const activeGuardianMission = guardianEventMemory?.activeMissionId
    ? guardianStore.missions[guardianEventMemory.activeMissionId] ?? null
    : null;
  const previousGuardianMissions = guardianMissions.filter((mission) => mission.status !== "active");
  const activeMissionObservationCount = activeGuardianMission
    ? guardianObservations.filter((observation) => observation.missionId === activeGuardianMission.id).length
    : 0;
  const guardianExposureOptions: Array<{ value: GuardianExposurePreference; label: string }> = [
    { value: "data_only", label: "Solo datos" },
    { value: "general_images", label: "Imágenes generales" },
    { value: "ask_first", label: "Preguntar antes" },
    { value: "hide_sensitive", label: "Ocultar sensibles" },
  ];
  const guardianExposure = guardianStore.preferences.exposure;
  const guardianPreparationComplete =
    guardianStore.preferences.preparationVersion === GUARDIAN_PREPARATION_VERSION;
  const guardianCanCaptureSource = Boolean(
    guardianEventMemory && guardianEventRecordId && guardianPreparationComplete
  );
  const beginGuardianSourceObservation = (draft: Omit<GuardianObservationDraft, "id">) => {
    if (!guardianCanCaptureSource) return;
    setGuardianObservationDraft({ ...draft, id: `${Date.now()}-${Math.random()}` });
    setActiveSection("guardians");
    window.setTimeout(() => {
      guardianObservationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  const beginNewsObservation = (item: NewsItem, classification: "official" | "regional") => {
    const publishedAt = item.publishedAt ? new Date(item.publishedAt) : new Date();
    beginGuardianSourceObservation({
      label: item.title ?? item.domain ?? "Referencia periodística",
      sourceType: "news",
      sourceReference: item.url ?? item.domain ?? "",
      observedAt: Number.isFinite(publishedAt.getTime()) ? publishedAt.toISOString() : new Date().toISOString(),
      limitations:
        classification === "official"
          ? "La clasificación como comunicado oficial es operativa. Revisar autoría, fecha y contenido en la fuente original."
          : "Una publicación periodística puede contener información incompleta, desactualizada o no verificada. Contrastar con fuentes independientes.",
    });
  };
  const visualMediaAllowed =
    guardianPreparationComplete &&
    (guardianExposure === "general_images" || (guardianExposure === "ask_first" && guardianVisualConsent));
  const hasInstrumentalFireData =
    satelliteDetections != null ||
    satelliteFrpMax != null ||
    satelliteFrpSum != null ||
    satelliteFireObservations.length > 0 ||
    Boolean(event.liveFeedUrl);
  const satelliteInstrumentLabel =
    event.category === "fire" && hasInstrumentalFireData
      ? `NASA FIRMS${satelliteObservedInstruments.length ? ` / ${satelliteObservedInstruments.join(" / ")}` : " / VIIRS"}`
      : "Fuente no conectada";
  const satelliteMetricExplanations = [
    {
      label: "Detecciones",
      value: satelliteDetections != null ? `${satelliteDetections}` : "No disponible",
      meaning:
        "Puntos térmicos detectados por sensores satelitales. No equivalen a perímetro, daño confirmado ni cantidad de incendios.",
      available: satelliteDetections != null,
    },
    {
      label: "FRP máximo",
      value: satelliteFrpMax != null ? `${satelliteFrpMax.toFixed(2)} MW` : "No disponible",
      meaning:
        "Fire Radiative Power del punto más intenso. Ayuda a estimar intensidad térmica, pero puede variar por humo, nubes o ángulo de observación.",
      available: satelliteFrpMax != null,
    },
    {
      label: "FRP acumulado",
      value: satelliteFrpSum != null ? `${satelliteFrpSum.toFixed(2)} MW` : "No disponible",
      meaning:
        "Suma operativa de energía radiativa de las detecciones agrupadas por BioPulse para este evento.",
      available: satelliteFrpSum != null,
    },
  ];
  const satelliteFutureLayers = [
    "Humo y aerosoles",
    "Calidad atmosférica",
    "Agua superficial / inundación",
    "Vegetación y sequedad",
    "Nubes, tormentas y rayos",
  ];
  const guardianMissionTemplates: GuardianMissionTemplate[] = [
    {
      kind: "review_satellite",
      title: "Revisar observación satelital",
      question: "¿Qué muestran las señales instrumentales más recientes y cuáles son sus limitaciones?",
      available: hasInstrumentalFireData,
      unavailableReason: "Este evento todavía no tiene señales instrumentales o enlace FIRMS disponible.",
    },
    {
      kind: "review_cameras",
      title: "Revisar cámaras cercanas",
      question: "¿Qué puede verificarse en las cámaras cercanas sin exceder lo que muestran las imágenes?",
      available: nearbyCameras.length > 0,
      unavailableReason: `No hay cámaras dentro del radio actual de ${camRadiusKm} km.`,
    },
    {
      kind: "review_weather",
      title: "Revisar condiciones meteorológicas",
      question: "¿Qué condiciones meteorológicas actuales podrían ser relevantes para comprender este evento?",
      available: Boolean(weather) && !weatherErr,
      unavailableReason: weatherLoading
        ? "Las condiciones meteorológicas todavía se están consultando."
        : "No hay condiciones meteorológicas disponibles para revisar.",
    },
    {
      kind: "document_source",
      title: "Documentar una fuente",
      question: "¿Qué afirma la fuente, cuándo fue publicada y qué grado de procedencia puede conservarse?",
      available: Boolean(event.liveFeedUrl) || newsItems.some((item) => Boolean(item.url)),
      unavailableReason: "No hay enlaces satelitales o noticias recuperadas para documentar en este momento.",
    },
    {
      kind: "compare_changes",
      title: "Comparar cambios",
      question: "¿Qué cambió entre las dos observaciones conservadas y qué permanece incierto?",
      available: Boolean(comparisonPrevious && comparisonCurrent),
      unavailableReason: "BioPulse necesita al menos dos puntos comparables para proponer esta misión.",
    },
    {
      kind: "identify_gaps",
      title: "Identificar vacíos de información",
      question: "¿Qué información falta para comprender mejor el evento y qué fuente podría aportarla?",
      available: true,
    },
  ];
  const sourceCoverageItems: Array<{
    id: string;
    label: string;
    icon: ReactNode;
    state: SourceCoverageState;
    detail: string;
    actionLabel?: string;
    onOpen?: () => void;
  }> = [
    {
      id: "firms",
      label: "Satélite / FIRMS",
      icon: <Satellite className="h-4 w-4 text-cyan-200/75" />,
      state: event.stale ? "stale" : hasInstrumentalFireData ? "available" : "partial",
      detail: event.stale
        ? `Última señal conservada · ${observationFreshness}`
        : hasInstrumentalFireData
        ? `${satelliteDetections ?? "Sin conteo"} ${satelliteDetections === 1 ? "detección" : "detecciones"} · ${observationFreshness}`
        : "Evento disponible sin métricas instrumentales completas.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("satellite"),
    },
    {
      id: "operations",
      label: "Estado operativo",
      icon: <Activity className="h-4 w-4 text-yellow-200/75" />,
      state: hasInstrumentalFireData ? "partial" : "empty",
      detail: `${trend} · ${statusLabel(event.status)} · ${observationFreshness}`,
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("operations"),
    },
    {
      id: "weather",
      label: "Clima",
      icon: <CloudRain className="h-4 w-4 text-sky-200/75" />,
      state: weatherLoading ? "loading" : weatherErr ? "limited" : weather ? "available" : "empty",
      detail: weatherLoading
        ? "Consultando Open-Meteo."
        : weatherErr
        ? "Open-Meteo no respondió para este evento."
        : weather
        ? `Open-Meteo · ${weather.time ? fmtNowishUTC(weather.time) : "hora no informada"}`
        : "No hay condiciones disponibles.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("weather"),
    },
    {
      id: "cameras",
      label: "Cámaras",
      icon: <Camera className="h-4 w-4 text-white/65" />,
      state: camLoading ? "loading" : camErr ? "limited" : camRegistry.length > 0 ? "available" : "empty",
      detail: camLoading
        ? "Cargando registro de cámaras."
        : camErr
        ? "El registro de cámaras no está disponible."
        : camRegistry.length > 0
        ? `${camRegistry.length} registradas · ${nearbyCameras.length} dentro de ${camRadiusKm} km`
        : "Registro cargado sin cámaras válidas.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("cameras"),
    },
    {
      id: "news",
      label: "Noticias",
      icon: <Newspaper className="h-4 w-4 text-violet-200/75" />,
      state: newsLoading ? "loading" : newsErr || newsLimited ? "limited" : newsMeta && newsItems.length === 0 ? "empty" : newsItems.length > 0 ? "available" : "loading",
      detail: newsLoading
        ? "Consultando noticias regionales."
        : newsErr || newsLimited
        ? "La fuente de noticias está temporalmente limitada."
        : newsFilteredOut
        ? `${newsDiscardedCount} resultados descartados por vínculo débil.`
        : newsItems.length > 0
        ? `${newsItems.length} referencias regionales recuperadas.`
        : "La consulta terminó sin resultados útiles.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => {
        setNewsView("main");
        setActiveSection("news");
      },
    },
    {
      id: "official-alerts",
      label: "Alertas oficiales",
      icon: <Siren className="h-4 w-4 text-orange-200/75" />,
      state: splitNews.official.length > 0 ? "partial" : "not_connected",
      detail:
        newsLoading
          ? "Clasificando referencias; el canal oficial estructurado sigue sin conectar."
          : splitNews.official.length > 0
          ? `${splitNews.official.length} referencias clasificadas desde noticias; falta un canal oficial estructurado.`
          : "Fuente oficial estructurada todavía no conectada.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => {
        setNewsView("official");
        setActiveSection("official");
      },
    },
    {
      id: "guardians",
      label: "Guardianes",
      icon: <Users className="h-4 w-4 text-emerald-200/65" />,
      state: guardianEventMemory ? "local" : "not_connected",
      detail: guardianEventMemory
        ? "Espacio privado preparado en este dispositivo; sin sincronización externa."
        : "Observaciones de Guardianes todavía no conectadas.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("guardians"),
    },
    {
      id: "protected-context",
      label: "Qu\u00e9 protegemos",
      icon: <Leaf className="h-4 w-4 text-emerald-200/65" />,
      state: protectedContextLoading ? "loading" : protectedContextErr ? "limited" : protectedContext ? "partial" : "not_connected",
      detail: protectedContextLoading
        ? "Consultando contexto ambiental."
        : protectedContextErr
        ? "Contexto ambiental temporalmente limitado."
        : protectedContext
        ? "Contexto ambiental disponible con datos conectados y vac\u00edos expl\u00edcitos."
        : "Contexto ambiental todav\u00eda no conectado.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("protected"),
    },
    {
      id: "human-impact",
      label: "Impacto humano",
      icon: <Hospital className="h-4 w-4 text-rose-200/65" />,
      state:
        criticalInfrastructureLoading || nearbyCommunitiesLoading
          ? "loading"
          : criticalInfrastructureErr || nearbyCommunitiesErr
          ? "limited"
          : criticalInfrastructure || nearbyCommunitiesContext
          ? "partial"
          : "not_connected",
      detail:
        criticalInfrastructureLoading || nearbyCommunitiesLoading
          ? "Consultando infraestructura y comunidades."
          : criticalInfrastructureErr || nearbyCommunitiesErr
          ? "Parte del contexto humano est\u00e1 temporalmente limitado."
          : criticalInfrastructure || nearbyCommunitiesContext
          ? "Infraestructura y comunidades cercanas disponibles cuando hay fuente conectada."
          : "Impacto humano estructurado todav\u00eda no conectado.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("human"),
    },
    {
      id: "insight",
      label: "BioPulse Insight",
      icon: <Brain className="h-4 w-4 text-fuchsia-200/65" />,
      state: event.aiInsight ? "partial" : "empty",
      detail: event.aiInsight
        ? "Lectura heur\u00edstica disponible; no constituye confirmaci\u00f3n oficial."
        : "Sin inferencias BioPulse disponibles para este evento.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("insight"),
    },
    {
      id: "timeline",
      label: "Historial",
      icon: <History className="h-4 w-4 text-cyan-200/65" />,
      state: normalizedObservationCount > 0 || firstSeenDate || observationDate || eventHistory.length > 0 ? "available" : "empty",
      detail:
        normalizedObservationCount > 0
          ? `${normalizedObservationCount} observaciones normalizadas · ${normalizedInferenceCount} inferencias separadas.`
          : firstSeenDate || observationDate || eventHistory.length > 0
          ? "Cronolog\u00eda disponible con los puntos conservados por BioPulse."
          : "Sin puntos temporales v\u00e1lidos para este evento.",
      actionLabel: "Abrir secci\u00f3n",
      onOpen: () => setActiveSection("timeline"),
    },
  ];
  const activeSectionMeta: Record<Exclude<AlertPanelSection, "main">, { title: string; subtitle: string }> = {
    satellite: {
      title: "Observaci\u00f3n satelital",
      subtitle: `${event.location} · ${observationFreshness}`,
    },
    weather: {
      title: "Clima del evento",
      subtitle: weather?.time ? `Open-Meteo · ${fmtNowishUTC(weather.time)}` : "Condiciones actuales estimadas.",
    },
    cameras: {
      title: "C\u00e1maras cercanas",
      subtitle: `${event.location} · ${nearbyCameras.length} dentro de ${camRadiusKm} km · ${camRegistry.length} registradas`,
    },
    news: {
      title: "Noticias relacionadas",
      subtitle: newsItems.length > 0 ? `${newsItems.length} referencias recuperadas.` : "Seguimiento period\u00edstico regional.",
    },
    official: {
      title: "Alertas oficiales",
      subtitle:
        splitNews.official.length > 0
          ? `${splitNews.official.length} referencias clasificadas desde noticias.`
          : "Canal oficial estructurado todav\u00eda no conectado.",
    },
    guardians: {
      title: "Guardianes",
      subtitle: guardianEventMemory
        ? "Espacio local privado preparado en este dispositivo."
        : "Observaci\u00f3n local sin sincronizaci\u00f3n externa.",
    },
    protected: {
      title: "Qu\u00e9 protegemos aqu\u00ed",
      subtitle: "Ecosistemas, especies, agua y \u00e1reas sensibles cuando haya fuente conectada.",
    },
    human: {
      title: "Impacto humano",
      subtitle: "Comunidades, infraestructura, escuelas, hospitales y evacuaci\u00f3n.",
    },
    insight: {
      title: "BioPulse Insight",
      subtitle: "Dato observado separado de inferencia heur\u00edstica.",
    },
    timeline: {
      title: "Historial del evento",
      subtitle: "Cronolog\u00eda de se\u00f1ales y observaciones conservadas.",
    },
    operations: {
      title: "Estado operativo",
      subtitle: `${trend} · ${statusLabel(event.status)}`,
    },
  };
  const currentTimelineMetrics = [
    satelliteDetections != null
      ? `${satelliteDetections} ${satelliteDetections === 1 ? "detección" : "detecciones"}`
      : null,
    satelliteFrpMax != null ? `FRP máximo ${satelliteFrpMax.toFixed(2)} MW` : null,
    satelliteFrpSum != null ? `FRP acumulado ${satelliteFrpSum.toFixed(2)} MW` : null,
  ].filter((item): item is string => Boolean(item));

  if (firstSeenDate) {
    timelineEntries.push({
      id: `first-${firstSeenDate.getTime()}`,
      date: firstSeenDate,
      title: "Primera señal registrada",
      detail: "Primer momento conservado por BioPulse para este evento.",
    });
  }

  eventHistory.forEach((point, index) => {
    const date = toValidDate(point?.t as any);
    if (!date) return;

    const metrics = [
      Number.isFinite(point.focusCount)
        ? `${point.focusCount} ${point.focusCount === 1 ? "detección" : "detecciones"}`
        : null,
      Number.isFinite(point.frpMax) ? `FRP máximo ${point.frpMax!.toFixed(2)} MW` : null,
      Number.isFinite(point.frpSum) ? `FRP acumulado ${point.frpSum!.toFixed(2)} MW` : null,
      point.severity ? `Severidad ${point.severity}` : null,
    ].filter((item): item is string => Boolean(item));

    const existingIndex = timelineEntries.findIndex(
      (entry) => Math.abs(entry.date.getTime() - date.getTime()) <= 30_000
    );
    if (existingIndex >= 0) {
      const existingEntry = timelineEntries[existingIndex];
      if (existingEntry && metrics.length > 0) {
        timelineEntries[existingIndex] = { ...existingEntry, detail: metrics.join(" · ") };
      }
      return;
    }

    timelineEntries.push({
      id: `history-${date.getTime()}-${index}`,
      date,
      title: "Observación registrada",
      detail: metrics.length > 0 ? metrics.join(" · ") : "Sin métricas comparables adicionales.",
    });
  });

  if (observationDate) {
    const alreadyRepresented = timelineEntries.some(
      (entry) => Math.abs(entry.date.getTime() - observationDate.getTime()) <= 30_000
    );
    if (!alreadyRepresented) {
      timelineEntries.push({
        id: `latest-${observationDate.getTime()}`,
        date: observationDate,
        title: timelineEntries.length > 0 ? "Última señal registrada" : "Observación disponible",
        detail:
          currentTimelineMetrics.length > 0
            ? currentTimelineMetrics.join(" · ")
            : "Sin métricas comparables adicionales.",
      });
    } else if (timelineEntries.length === 1 && currentTimelineMetrics.length > 0) {
      const onlyEntry = timelineEntries[0];
      if (onlyEntry) {
        timelineEntries[0] = { ...onlyEntry, detail: currentTimelineMetrics.join(" · ") };
      }
    }
  }

  normalizedGuardianObservations.forEach((observation) => {
    const date = toValidDate(observation.timestamp.observedAt) ?? toValidDate(observation.timestamp.recordedAt);
    if (!date) return;

    timelineEntries.push({
      id: `guardian-${observation.id}`,
      date,
      title: observationTimelineTitle(observation),
      detail: observationTimelineDetail(observation),
    });
  });

  normalizedNewsObservations.slice(-3).forEach((observation) => {
    const date = toValidDate(observation.timestamp.observedAt) ?? toValidDate(observation.timestamp.recordedAt);
    if (!date) return;

    timelineEntries.push({
      id: `news-${observation.id}`,
      date,
      title: observationTimelineTitle(observation),
      detail: observationTimelineDetail(observation),
    });
  });

  normalizedWeatherObservations.forEach((observation) => {
    const date = toValidDate(observation.timestamp.observedAt) ?? toValidDate(observation.timestamp.recordedAt);
    if (!date) return;

    timelineEntries.push({
      id: `weather-${observation.id}`,
      date,
      title: observationTimelineTitle(observation),
      detail: observationTimelineDetail(observation),
    });
  });

  normalizedCameraObservations.slice(0, 3).forEach((observation) => {
    const date = toValidDate(observation.timestamp.observedAt) ?? toValidDate(observation.timestamp.recordedAt);
    if (!date) return;

    timelineEntries.push({
      id: `camera-${observation.id}`,
      date,
      title: observationTimelineTitle(observation),
      detail: observationTimelineDetail(observation),
    });
  });

  timelineEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
  const visibleTimelineEntries =
    timelineEntries.length > 8 ? [...timelineEntries.slice(0, 1), ...timelineEntries.slice(-7)] : timelineEntries;
  const hasComparableHistory = visibleTimelineEntries.length > 1;
  const eventStoryEvidence = [
    firstSeenDate ? `Comenzó a registrarse el ${fmtDateTimeUTC(firstSeenDate)}.` : null,
    observationDate ? `La señal más reciente conservada corresponde a ${fmtDateTimeUTC(observationDate)}.` : null,
    normalizedObservationCount > 0
      ? `BioPulse organiza este relato con ${normalizedObservationCount} ${
          normalizedObservationCount === 1 ? "observación normalizada" : "observaciones normalizadas"
        }: ${eventObservationBundle.sourceCounts.firms} instrumentales y ${
          eventObservationBundle.sourceCounts.guardian
        } humanas Guardian, con ${eventObservationBundle.sourceCounts.news} referencias informativas y ${
          eventObservationBundle.sourceCounts.officialReferences
        } referencias de apariencia oficial, ${eventObservationBundle.sourceCounts.cameras} cámaras cercanas y ${
          eventObservationBundle.sourceCounts.weather
        } lectura climática contextual.`
      : null,
    eventObservationBundle.sourceCounts.cameras > 0
      ? "Las cámaras se conservan como evidencia visual contextual: muestran una perspectiva limitada, no el evento completo."
      : null,
    eventObservationBundle.sourceCounts.weather > 0
      ? "El clima se conserva como contexto operacional; no se usa como confirmación causal del evento."
      : null,
    satelliteDetections != null
      ? `BioPulse conserva ${satelliteDetections} ${satelliteDetections === 1 ? "detección instrumental" : "detecciones instrumentales"} para este evento.`
      : null,
    satelliteFrpMax != null || satelliteFrpSum != null
      ? `La energía térmica observada incluye ${
          satelliteFrpMax != null ? `FRP máximo ${satelliteFrpMax.toFixed(2)} MW` : "FRP máximo no disponible"
        }${
          satelliteFrpSum != null ? ` y FRP acumulado ${satelliteFrpSum.toFixed(2)} MW` : ""
        }.`
      : null,
    guardianObservations.length > 0
      ? `La memoria Guardian local aporta evidencia humana privada; ${
          normalizedInferenceCount > 0
            ? `${normalizedInferenceCount} interpretación${normalizedInferenceCount === 1 ? "" : "es"} queda${
                normalizedInferenceCount === 1 ? "" : "n"
              } separada${normalizedInferenceCount === 1 ? "" : "s"} de los hechos observados.`
            : "no hay interpretaciones separadas para este evento."
        }`
      : null,
    event.liveFeedUrl ? "Existe un enlace externo para revisar la observación FIRMS/NASA original." : null,
  ].filter((item): item is string => Boolean(item));
  const eventStoryUnknowns = [
    event.evacuationLevel == null ? "estado de evacuación oficial" : null,
    !eventPopulation ? "población afectada verificada" : null,
    nearbyCameras.length === 0 ? "cámaras cercanas disponibles" : null,
    newsItems.length === 0 ? "noticias o comunicados vinculados" : null,
  ].filter((item): item is string => Boolean(item));

  const panel = (
    <div className="pointer-events-auto fixed inset-0 z-[10050]">
      <div className="absolute inset-0 bg-black/60 z-0" onClick={onClose} />

      <div
        role={guardianPreparationOpen ? undefined : "dialog"}
        aria-modal={guardianPreparationOpen ? undefined : "true"}
        aria-hidden={guardianPreparationOpen ? true : undefined}
        aria-label={guardianPreparationOpen ? undefined : `Alerta: ${event.location}`}
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10",
          "w-[min(980px,92vw)] h-[min(86vh,720px)]",
          "rounded-3xl border border-white/10",
          "bg-[#060b16]/90 backdrop-blur-xl shadow-2xl overflow-hidden",
          "flex flex-col"
        )}
      >
        {sirenActive ? (
          <>
            <div className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-red-500/25" />
            <div className="pointer-events-none absolute inset-0 rounded-3xl animate-pulse">
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-transparent to-blue-500/10" />
            </div>
            <div className="pointer-events-none absolute -inset-1 rounded-[28px] animate-ping opacity-20">
              <div className="absolute inset-0 bg-red-500/10" />
            </div>
          </>
        ) : null}

        {/* Header */}
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => {
                if (activeSection !== "main") {
                  setActiveSection("main");
                  setNewsView("main");
                }
                else if (newsView !== "main") setNewsView("main");
                else onClose();
              }}
              className={cn(
                "inline-flex items-center gap-2",
                "px-3 py-2 rounded-2xl border border-white/10 bg-white/5",
                "text-white/85 hover:text-white hover:bg-white/8 transition-colors"
              )}
              aria-label="Volver"
              title="Volver"
            >
              <CornerUpLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Volver</span>
            </button>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setFollowedIds(toggleFollowedId(event.id))}
                className={cn(
                  "inline-flex items-center gap-2",
                  "px-3 py-2 rounded-2xl border transition-colors",
                  isFollowed
                    ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100"
                    : "border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10"
                )}
                aria-pressed={isFollowed}
                title={isFollowed ? "Dejar de seguir alerta" : "Seguir alerta"}
              >
                <Bell className="h-4 w-4" />
                <span className="text-xs sm:text-sm font-medium">{isFollowed ? "Siguiendo" : "Seguir alerta"}</span>
              </button>

              {sirenActive ? (
                <button
                  onClick={() => setNewsView("official")}
                  className={cn(
                    "inline-flex items-center gap-2",
                    "px-3 py-2 rounded-2xl border border-red-400/30 bg-red-500/10",
                    "text-red-100/90 hover:text-white hover:bg-red-500/20 transition-colors",
                    "animate-pulse"
                  )}
                  aria-label="Alerta oficial detectada"
                  title="Alerta oficial detectada (ver comunicados)"
                >
                  <Siren className="h-4 w-4" />
                  <span className="text-sm font-semibold">ALERTA</span>
                </button>
              ) : null}

              <button
                onClick={onClose}
                className={cn(
                  "h-10 w-10 rounded-2xl border border-white/10 bg-white/5",
                  "text-white/70 hover:text-white hover:bg-white/10 transition-colors",
                  "flex items-center justify-center"
                )}
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-3 text-[11px] uppercase tracking-wide text-white/40">
            {String(event.category ?? "").toUpperCase()} • {fmtDateTimeUTC(new Date(event.timestamp))}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <div className="text-xl md:text-2xl font-semibold text-white/95">{event.location}</div>

            <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-full border", chip.ring, chip.bg)}>
              <span className={cn("h-2 w-2 rounded-full", chip.dot)} />
              <span className="text-xs font-semibold text-white/90">{chip.label}</span>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5">
              <span className="h-2 w-2 rounded-full bg-cyan-400/80" />
              <span className="text-xs font-medium text-white/80">{statusLabel(event.status)}</span>
            </div>

            <div className="inline-flex items-center px-3 py-1.5 rounded-full border border-yellow-300/20 bg-yellow-300/10">
              <span className="text-xs font-semibold text-yellow-100/90">{trend}</span>
            </div>

            {evacuationLabel ? (
              <div
                className={cn(
                  "inline-flex items-center px-3 py-1.5 rounded-full border",
                  event.evacuationLevel === "mandatory"
                    ? "border-red-400/35 bg-red-500/15 text-red-100"
                    : event.evacuationLevel === "recommended"
                    ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                    : "border-white/10 bg-white/5 text-white/65"
                )}
              >
                <span className="text-xs font-semibold">{evacuationLabel}</span>
              </div>
            ) : null}

            <div className="w-full text-xs text-white/45">
              {event.title}
              <span className="mx-2 text-white/25">•</span>
              {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
            </div>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
          <div className="space-y-4">
            {activeSection !== "main" ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] uppercase tracking-wide text-white/45">Vista dedicada</div>
                <div className="mt-1 text-lg font-semibold text-white/90">{activeSectionMeta[activeSection].title}</div>
                <div className="mt-1 text-sm leading-relaxed text-white/55">{activeSectionMeta[activeSection].subtitle}</div>
              </div>
            ) : null}

            {activeSection === "main" ? (
              <>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] uppercase tracking-wide text-white/45">Qué está pasando</div>
              <div className="mt-2 text-sm leading-relaxed text-white/80">
                {event.description?.trim() || "BioPulse está monitoreando este evento y actualizará la información disponible."}
              </div>

              {event.liveFeedUrl ? (
                <a
                  href={event.liveFeedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/15 transition-colors"
                  title="Abrir observación FIRMS/NASA"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir observación FIRMS / NASA
                </a>
              ) : null}
            </div>

            {/* Centro de comando */}
            <SectionShell
              icon={<Activity className="h-5 w-5 text-cyan-200" />}
              title="Centro de comando"
              subtitle="Entradas operativas del evento. Cada módulo conserva su estado de fuente sin saturar el resumen."
              right={
                <div className="hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/60">
                  <span className="text-xs font-semibold">{sourceCoverageItems.length} módulos</span>
                </div>
              }
            >
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sourceCoverageItems.map((source, index) => {
                    const meta = sourceCoverageMeta[source.state];
                    const ModuleTag = source.onOpen ? "button" : "div";
                    return (
                      <ModuleTag
                        key={source.id}
                        type={source.onOpen ? "button" : undefined}
                        onClick={source.onOpen}
                        className={cn(
                          "group min-w-0 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left",
                          "transition-colors",
                          source.onOpen && "cursor-pointer hover:border-cyan-200/25 hover:bg-white/[0.065]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {source.icon}
                            <span className="text-sm font-medium leading-tight text-white/80">{source.label}</span>
                          </div>
                          <div className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1", meta.className)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                            <span className="text-[10px] font-semibold uppercase tracking-wide">{meta.label}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs leading-relaxed text-white/40">{source.detail}</div>
                        {source.onOpen ? (
                          <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-cyan-100/60 transition-colors group-hover:text-cyan-100">
                            <span>{source.actionLabel ?? "Abrir"}</span>
                            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        ) : null}
                      </ModuleTag>
                    );
                  })}
                </div>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-[11px] leading-relaxed text-white/35">
                  Los estados indican disponibilidad de fuentes o capas de trabajo. No conectada, sin resultados y limitada describen situaciones diferentes; ninguna confirma ausencia del fenómeno.
                </div>
              </div>
            </SectionShell>

              </>
            ) : null}

            {/* Guardian local */}
            {activeSection === "guardians" ? (
              <>
            <SectionShell
              icon={<Users className="h-5 w-5 text-emerald-200" />}
              title="Guardian local"
              subtitle="Entrada privada para observar este evento con propósito y conservar continuidad en este dispositivo."
              right={
                <div className="hidden sm:inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-100/85">
                  <span className="text-xs font-semibold">Privado · local</span>
                </div>
              }
            >
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <div className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200/75" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white/85">
                        {guardianEventMemory ? "Espacio Guardian preparado" : "Prepará tu espacio de observación"}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-white/45">
                        {guardianEventMemory
                          ? "BioPulse conserva en este navegador cuándo preparaste este espacio y tu preferencia de exposición."
                          : "Este paso crea un registro privado vinculado al evento. No publica información ni inicia colaboración externa."}
                      </div>
                    </div>
                  </div>

                  {guardianEventMemory ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                      <div className="border-l-2 border-emerald-300/25 pl-3">
                        <div className="text-white/35">Primer ingreso Guardian</div>
                        <div className="mt-1 font-medium text-white/70">
                          {fmtDateTimeUTC(new Date(guardianEventMemory.firstEnteredAt))}
                        </div>
                      </div>
                      <div className="border-l-2 border-cyan-300/20 pl-3">
                        <div className="text-white/35">Última apertura</div>
                        <div className="mt-1 font-medium text-white/70">
                          {fmtDateTimeUTC(new Date(guardianEventMemory.lastOpenedAt))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-white/10 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-wide text-white/40">Preferencia de exposición</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {guardianExposureOptions.map((option) => {
                      const selected = guardianStore.preferences.exposure === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            try {
                              setGuardianStore(setGuardianExposurePreference(option.value));
                              if (option.value !== "general_images") setGuardianVisualConsent(false);
                              setGuardianStorageErr(null);
                            } catch {
                              setGuardianStorageErr("No se pudo guardar la preferencia en este dispositivo.");
                            }
                          }}
                          aria-pressed={selected}
                          className={cn(
                            "min-h-10 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                            selected
                              ? "border-emerald-300/30 bg-emerald-400/12 text-emerald-100"
                              : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white/75"
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {guardianPreparationComplete ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="text-white/35">
                        Preparación completada
                        {guardianStore.preferences.preparedAt
                          ? ` · ${fmtDateTimeUTC(new Date(guardianStore.preferences.preparedAt))}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGuardianPreparationOpen(true)}
                        aria-label="Revisar preparación Guardian"
                        className="font-medium text-emerald-100/55 hover:text-emerald-100/80"
                      >
                        Revisar
                      </button>
                    </div>
                  ) : null}
                </div>

                {guardianEventMemory && guardianPreparationComplete ? (
                  <>
                    <GuardianMissionPanel
                      eventId={guardianEventRecordId!}
                      templates={guardianMissionTemplates}
                      activeMission={activeGuardianMission}
                      linkedObservationCount={activeMissionObservationCount}
                      recentMissions={previousGuardianMissions}
                      onStoreChange={(store) => {
                        setGuardianStore(store);
                        setGuardianStorageErr(null);
                      }}
                    />

                    <div ref={guardianObservationRef}>
                      <GuardianObservationForm
                        eventId={guardianEventRecordId!}
                        exposure={guardianExposure}
                        missionId={activeGuardianMission?.id}
                        missionTitle={activeGuardianMission?.title}
                        draft={guardianObservationDraft}
                        onDraftConsumed={() => setGuardianObservationDraft(null)}
                        onSaved={(store) => {
                          setGuardianStore(store);
                          setGuardianStorageErr(null);
                        }}
                      />
                    </div>

                    <div className="border-t border-white/10">
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-white/80">Observaciones guardadas</div>
                          <div className="mt-0.5 text-xs text-white/35">Privadas en este dispositivo</div>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/55">
                          {guardianObservations.length}
                        </div>
                      </div>

                      {guardianObservations.length > 0 ? (
                        <div className="divide-y divide-white/10 border-t border-white/10">
                          {guardianObservations.map((observation) => (
                            <div key={observation.id} className="px-4 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm leading-relaxed text-white/75">{observation.observedText}</div>
                                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/35">
                                    <span>{guardianSourceLabel(observation.sourceType)}</span>
                                    <span>Observado: {fmtDateTimeUTC(new Date(observation.observedAt))}</span>
                                    <span>Registrado: {fmtDateTimeUTC(new Date(observation.recordedAt))}</span>
                                    {observation.missionId && guardianStore.missions[observation.missionId] ? (
                                      <span>Misión: {guardianStore.missions[observation.missionId].title}</span>
                                    ) : null}
                                    <span>Privada</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setGuardianObservationDeleteId(observation.id)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/35 hover:bg-white/5 hover:text-red-100/70"
                                  aria-label="Eliminar observación"
                                  title="Eliminar observación"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>

                              {observation.sourceReference ? (
                                <div className="mt-2 break-words text-xs text-cyan-100/55">
                                  Fuente: {observation.sourceReference}
                                </div>
                              ) : null}
                              {observation.interpretation ? (
                                <div className="mt-3 border-l-2 border-violet-300/20 pl-3">
                                  <div className="text-[10px] uppercase tracking-wide text-violet-100/45">Interpretación</div>
                                  <div className="mt-1 text-xs leading-relaxed text-white/50">{observation.interpretation}</div>
                                </div>
                              ) : null}
                              {observation.limitations ? (
                                <div className="mt-2 text-xs leading-relaxed text-white/40">
                                  Limitaciones: {observation.limitations}
                                </div>
                              ) : null}

                              <GuardianObservationReview
                                observation={observation}
                                onSaved={(store) => {
                                  setGuardianStore(store);
                                  setGuardianStorageErr(null);
                                }}
                              />

                              <GuardianObservationIntegrity
                                observation={observation}
                                onStoreChange={(store) => {
                                  setGuardianStore(store);
                                  setGuardianStorageErr(null);
                                }}
                              />

                              {guardianObservationDeleteId === observation.id ? (
                                <div className="mt-3 rounded-xl border border-red-300/15 bg-red-500/[0.05] p-3">
                                  <div className="text-xs text-red-100/75">¿Eliminar esta observación privada?</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setGuardianObservationDeleteId(null)}
                                      className="min-h-8 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        try {
                                          setGuardianStore(removeGuardianObservation(observation.id));
                                          setGuardianObservationDeleteId(null);
                                          setGuardianStorageErr(null);
                                        } catch {
                                          setGuardianStorageErr("No se pudo eliminar la observación de este dispositivo.");
                                        }
                                      }}
                                      className="min-h-8 rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100/80"
                                    >
                                      Confirmar eliminación
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border-t border-white/10 px-4 py-4 text-sm text-white/40">
                          Todavía no registraste observaciones para este evento.
                        </div>
                      )}
                    </div>

                    <GuardianMemoryTimeline
                      memory={guardianEventMemory}
                      missions={guardianMissions}
                      observations={guardianObservations}
                    />

                    <GuardianReportPanel
                      event={event}
                      memory={guardianEventMemory}
                      missions={guardianMissions}
                      observations={guardianObservations}
                    />
                  </>
                ) : null}

                {guardianEventMemory && !guardianPreparationComplete ? (
                  <div className="border-t border-amber-300/10 bg-amber-400/[0.03] px-4 py-4">
                    <div className="text-sm font-semibold text-white/75">Preparación pendiente</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/40">
                      Tu memoria local permanece intacta. Completá la preparación para volver a misiones, observaciones e informes.
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] leading-relaxed text-white/35">
                    Trabajo privado guardado en este dispositivo. BioPulse no lo transmite ni lo publica.
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (!guardianPreparationComplete) {
                          setGuardianPreparationOpen(true);
                          return;
                        }
                        try {
                          setGuardianStore(prepareGuardianEvent(event));
                          setGuardianStorageErr(null);
                        } catch {
                          setGuardianStorageErr("No se pudo preparar el espacio Guardian en este dispositivo.");
                        }
                      }}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {!guardianPreparationComplete
                        ? "Prepararme como Guardián"
                        : guardianEventMemory
                        ? "Registrar apertura"
                        : "Preparar espacio privado"}
                    </button>
                    {guardianEventMemory ? (
                      <button
                        type="button"
                        onClick={() => setGuardianDeletePending(true)}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs text-white/40 hover:bg-white/5 hover:text-white/65"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar registro local
                      </button>
                    ) : null}
                  </div>
                </div>

                {guardianDeletePending && guardianEventMemory ? (
                  <div className="border-t border-red-300/15 bg-red-500/[0.05] px-4 py-4">
                    <div className="text-sm font-medium text-red-100/80">¿Eliminar el registro Guardian de este evento?</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/40">
                      Se eliminarán las fechas y observaciones privadas asociadas. Esta acción no modifica el evento público.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setGuardianDeletePending(false)}
                        className="min-h-9 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/65 hover:bg-white/10"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            if (!guardianEventRecordId) return;
                            setGuardianStore(removeGuardianEvent(guardianEventRecordId));
                            setGuardianDeletePending(false);
                            setGuardianObservationDeleteId(null);
                            setGuardianVisualConsent(false);
                            setGuardianStorageErr(null);
                          } catch {
                            setGuardianStorageErr("No se pudo eliminar el registro Guardian de este dispositivo.");
                          }
                        }}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100/80 hover:bg-red-500/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Confirmar eliminación
                      </button>
                    </div>
                  </div>
                ) : null}

                {guardianStorageErr ? (
                  <div className="border-t border-red-300/15 bg-red-500/[0.06] px-4 py-3 text-xs text-red-100/75">
                    {guardianStorageErr}
                  </div>
                ) : null}
              </div>
            </SectionShell>

            <GuardianPreparationDialog
              open={guardianPreparationOpen}
              initialExposure={guardianExposure}
              onClose={() => setGuardianPreparationOpen(false)}
              onComplete={(exposure) => {
                try {
                  completeGuardianPreparation(exposure);
                  setGuardianStore(prepareGuardianEvent(event));
                  if (exposure !== "general_images") setGuardianVisualConsent(false);
                  setGuardianPreparationOpen(false);
                  setGuardianStorageErr(null);
                } catch {
                  setGuardianStorageErr("No se pudo guardar la preparación Guardian en este dispositivo.");
                }
              }}
            />
              </>
            ) : null}

            {/* Estado operativo */}
            {activeSection === "operations" ? (
              <>
            <SectionShell
              icon={<AlertTriangle className="h-5 w-5 text-yellow-200" />}
              title="Estado operativo"
              subtitle="Lectura operativa basada en señales satelitales recientes, tendencia y estado estimado."
              right={
                <div className="inline-flex items-center px-3 py-1.5 rounded-full border border-yellow-300/20 bg-yellow-300/10">
                  <span className="text-xs font-semibold text-yellow-100/90">{trend}</span>
                </div>
              }
            >
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-wide text-white/45 mb-2 flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-200/80" />
                  Lectura del evento
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="text-white/80">
                    <span className="text-white/55 font-medium">Intensidad:</span>{" "}
                    <span className="font-semibold text-white/90">
                      {event.severity === "critical"
                        ? "Muy alta"
                        : event.severity === "high"
                        ? "Alta"
                        : event.severity === "moderate"
                        ? "Media"
                        : "Baja"}
                    </span>
                  </div>
                  <div className="text-white/80">
                    <span className="text-white/55 font-medium">Actividad:</span>{" "}
                    <span className="font-semibold text-white/90">
                      {detections != null && detections >= 15
                        ? "Sostenida"
                        : detections != null && detections >= 6
                        ? "Activa"
                        : "Leve"}
                    </span>
                  </div>
                  <div className="text-white/80">
                    <span className="text-white/55 font-medium">Estado:</span>{" "}
                    <span className="font-semibold text-white/90">{statusLabel(event.status)}</span>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-white/35">
                  Interpretación basada en detecciones VIIRS + FRP. Puede haber retrasos o falsos positivos.
                </div>
              </div>
            </SectionShell>

            {/* Qué cambió */}
            <SectionShell
              icon={<Activity className="h-5 w-5 text-cyan-200" />}
              title="Qué cambió"
              subtitle="Comparación entre las dos observaciones instrumentales más recientes conservadas por BioPulse."
              right={
                comparisonPrevious && comparisonCurrent ? (
                  <div className="hidden sm:inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-cyan-100/90">
                    <span className="text-xs font-semibold">2 puntos comparados</span>
                  </div>
                ) : null
              }
            >
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                {comparisonPrevious && comparisonCurrent ? (
                  <>
                    <div className="border-b border-white/10 px-4 py-3 text-xs text-white/50">
                      {fmtDateTimeUTC(comparisonPrevious.date)}
                      <span className="mx-2 text-white/20">→</span>
                      {fmtDateTimeUTC(comparisonCurrent.date)}
                    </div>

                    {metricChanges.length > 0 ? (
                      <div className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
                        {metricChanges.map((change) => (
                          <div key={change.label} className="bg-[#080e19] p-4">
                            <div className="text-[11px] uppercase tracking-wide text-white/40">{change.label}</div>
                            <div className="mt-2 flex items-baseline gap-2 text-sm">
                              <span className="text-white/40">{change.previous}</span>
                              <span className="text-white/20">→</span>
                              <span className="font-semibold text-white/90">{change.current}</span>
                            </div>
                            <div
                              className={cn(
                                "mt-2 text-xs font-medium",
                                change.direction === "up"
                                  ? "text-amber-200/80"
                                  : change.direction === "down"
                                  ? "text-cyan-200/80"
                                  : "text-white/45"
                              )}
                            >
                              {change.delta}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-center text-sm text-white/50">
                        Hay dos observaciones, pero no comparten métricas comparables.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-white/50">
                    Todavía no hay un estado anterior comparable.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 border-t border-white/10 px-4 py-3 text-xs sm:grid-cols-3">
                  <div>
                    <span className="text-white/40">Tendencia actual:</span>{" "}
                    <span className="font-medium text-white/70">{currentTrendLabel}</span>
                  </div>
                  <div>
                    <span className="text-white/40">Estado actual:</span>{" "}
                    <span className="font-medium text-white/70">{statusLabel(event.status)}</span>
                  </div>
                  <div>
                    <span className="text-white/40">Antigüedad:</span>{" "}
                    <span className="font-medium text-white/70">{observationFreshness}</span>
                  </div>
                </div>

                <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/35">
                  Los cambios reflejan únicamente puntos conservados; no implican observación continua ni impacto confirmado.
                </div>
              </div>
            </SectionShell>

            {/* Observación satelital */}
              </>
            ) : null}

            {activeSection === "satellite" ? (
            <SectionShell
              icon={<Satellite className="h-5 w-5 text-cyan-200" />}
              title="Observación satelital"
              subtitle="Señales instrumentales y referencias disponibles para este evento."
              right={
                <div
                  className={cn(
                    "inline-flex items-center px-3 py-1.5 rounded-full border",
                    event.stale
                      ? "border-amber-300/25 bg-amber-400/10 text-amber-100/90"
                      : "border-cyan-300/20 bg-cyan-400/10 text-cyan-100/90"
                  )}
                >
                  <span className="text-xs font-semibold">
                    {event.stale ? `Desactualizada · ${observationFreshness}` : observationFreshness}
                  </span>
                </div>
              }
            >
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] gap-4">
                  <div>
                    {event.satelliteImageUrl && visualMediaAllowed ? (
                      <div>
                        <div className="mb-2 text-[11px] uppercase tracking-wide text-white/45">
                          Imagen asociada al evento
                        </div>
                        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                          <img
                            src={event.satelliteImageUrl}
                            alt={`Imagen asociada al evento ${event.title}`}
                            className="h-56 w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="mt-2 text-[11px] leading-relaxed text-white/35">
                          La imagen se presenta como referencia asociada. Su procedencia no se atribuye a NASA salvo que la fuente lo indique expresamente.
                        </div>
                      </div>
                    ) : event.satelliteImageUrl ? (
                      <VisualExposureGate
                        preference={guardianExposure}
                        onReveal={() => setGuardianVisualConsent(true)}
                      />
                    ) : (
                      <div>
                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-white/45">
                              Vista satelital consultable
                            </div>
                            <div className="mt-1 text-xs text-white/40">
                              NASA GIBS / VIIRS por coordenadas y fecha del evento.
                            </div>
                          </div>
                          <span className="self-start rounded-full border border-cyan-300/15 bg-cyan-400/[0.06] px-2.5 py-1 text-[11px] font-semibold text-cyan-100/70">
                            No es video en vivo
                          </span>
                        </div>
                        <div className="mb-3 grid grid-cols-2 gap-2">
                          {SATELLITE_RASTER_LAYERS.map((layer) => {
                            const selected = layer.id === activeSatelliteLayer.id;
                            return (
                              <button
                                key={layer.id}
                                type="button"
                                onClick={() => setActiveSatelliteLayerId(layer.id)}
                                className={cn(
                                  "rounded-lg border px-2.5 py-2 text-left transition-colors",
                                  selected
                                    ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-50"
                                    : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
                                )}
                                title={layer.description}
                              >
                                <div className="text-xs font-semibold">{layer.label}</div>
                                <div className="mt-0.5 text-[10px] font-medium text-white/55">{layer.plainLabel}</div>
                                <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/40">
                                  {layer.description}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                          <SatelliteMiniMap
                            lat={event.latitude}
                            lon={event.longitude}
                            date={observationDate ?? undefined}
                            zoom={6}
                            height={260}
                            layer={activeSatelliteLayer}
                          />
                        </div>
                        <div className="mt-2 text-[11px] leading-relaxed text-white/35">
                          Esta vista usa teselas satelitales de referencia. Puede tener nubes, retraso temporal o no mostrar humo/fuego aunque existan detecciones térmicas FIRMS.
                        </div>
                        <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.06] p-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-cyan-100/90">Cómo leer esta capa</div>
                              <div className="mt-0.5 text-xs text-white/45">{activeSatelliteLayer.plainLabel}</div>
                            </div>
                            <span className="self-start rounded-full border border-cyan-300/20 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-100/70">
                              Guía BioPulse
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-relaxed text-white/55">
                            <div>
                              <span className="font-semibold text-white/75">Qué estás viendo: </span>
                              {activeSatelliteLayer.whatYouSee}
                            </div>
                            <div>
                              <span className="font-semibold text-white/75">Por qué importa: </span>
                              {activeSatelliteLayer.whyItMatters}
                            </div>
                            <div>
                              <span className="font-semibold text-white/75">Qué no confirma: </span>
                              {activeSatelliteLayer.limitations}
                            </div>
                            <div>
                              <span className="font-semibold text-white/75">Como Guardián: </span>
                              {activeSatelliteLayer.guardianHint}
                            </div>
                          </div>
                          <div className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-white/35">
                            BioPulse traduce esta capa como apoyo de observación. No constituye confirmación oficial ni reemplaza la lectura de especialistas.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/40">Observación</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">
                          {observationDate ? fmtDateTimeUTC(observationDate) : "No disponible"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/40">Vigencia</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">
                          {event.stale ? "Marcada como desactualizada" : observationFreshness}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/40">Detecciones</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">
                          {satelliteDetections != null ? satelliteDetections : "No disponible"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/40">FRP máximo</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">
                          {satelliteFrpMax != null ? `${satelliteFrpMax.toFixed(2)} MW` : "No disponible"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/40">FRP acumulado</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">
                          {satelliteFrpSum != null ? `${satelliteFrpSum.toFixed(2)} MW` : "No disponible"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/40">Coordenadas</div>
                        <div className="mt-1 text-sm font-semibold text-white/85">
                          {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
                        </div>
                      </div>
                    </div>

                    {event.liveFeedUrl ? (
                      <a
                        href={event.liveFeedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2.5 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/15"
                        title="Abrir observación FIRMS/NASA"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir observación FIRMS / NASA
                      </a>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center text-xs text-white/45">
                        No hay un enlace externo de observación asociado.
                      </div>
                    )}

                    {guardianCanCaptureSource ? (
                      <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.05] p-4">
                        <div className="text-sm font-semibold text-emerald-100/90">Registrar evidencia Guardian</div>
                        <div className="mt-1 text-xs leading-relaxed text-white/45">
                          Guarda esta capa satelital como fuente local para documentar lo que observes.
                        </div>
                        <div className="mt-3">
                          <GuardianSourceButton
                            label="Registrar esta capa como evidencia"
                            variant="prominent"
                            onClick={() =>
                              beginGuardianSourceObservation({
                                label: `Capa satelital: ${activeSatelliteLayer.label}`,
                                sourceType: "satellite",
                                sourceReference: satelliteLayerSourceReference,
                                observedAt: satelliteLayerObservedAt,
                                limitations: satelliteLayerObservationLimitations,
                              })
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/[0.05] p-4">
                        <div className="text-sm font-semibold text-emerald-100/90">Registrar evidencia Guardian</div>
                        <div className="mt-1 text-xs leading-relaxed text-white/45">
                          Antes de guardar evidencia, BioPulse te prepara para observar con cuidado y separar datos de inferencias.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSection("guardians");
                            setGuardianPreparationOpen(true);
                          }}
                          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.08] px-4 py-2.5 text-sm font-semibold text-emerald-100/80 transition-colors hover:bg-emerald-400/15"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Prepararme para registrar
                        </button>
                        <div className="mt-2 text-[11px] leading-relaxed text-white/35">
                          Para guardar esta capa como evidencia local, primero completá la preparación Guardian del evento.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {satelliteMetricExplanations.map((metric) => (
                    <div
                      key={metric.label}
                      className={cn(
                        "rounded-xl border p-3",
                        metric.available
                          ? "border-cyan-300/15 bg-cyan-400/[0.06]"
                          : "border-white/10 bg-white/[0.03]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-white/40">{metric.label}</div>
                          <div className="mt-1 text-sm font-semibold text-white/85">{metric.value}</div>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            metric.available
                              ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100/80"
                              : "border-white/10 bg-white/5 text-white/45"
                          )}
                        >
                          {metric.available ? "Dato observado" : "No conectado"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs leading-relaxed text-white/45">{metric.meaning}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white/85">Señales FIRMS conservadas</div>
                      <div className="mt-1 text-xs leading-relaxed text-white/40">
                        Muestra operativa de detecciones reales usadas para construir este evento. No representa todas las señales globales.
                      </div>
                    </div>
                    <span className="self-start rounded-full border border-cyan-300/15 bg-cyan-400/[0.06] px-2.5 py-1 text-[11px] font-semibold text-cyan-100/70">
                      {satelliteFireObservations.length
                        ? `${satelliteFireObservations.length} de ${satelliteDetections ?? satelliteFireObservations.length}`
                        : "Sin muestra"}
                    </span>
                  </div>

                  {satelliteFireObservations.length > 0 ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                      {satelliteFireObservations.slice(0, 6).map((obs) => (
                        <div
                          key={obs.id}
                          className="grid grid-cols-1 gap-2 border-b border-white/10 bg-black/15 p-3 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
                        >
                          <div>
                            <div className="text-xs font-semibold text-white/80">
                              {formatFirmsAcquisitionTime(obs)}
                            </div>
                            <div className="mt-1 text-[11px] text-white/40">
                              {obs.latitude.toFixed(4)}, {obs.longitude.toFixed(4)}
                            </div>
                          </div>
                          <div className="text-xs text-white/55">
                            <div>
                              FRP:{" "}
                              <span className="font-semibold text-white/80">
                                {Number.isFinite(obs.frp as any) ? `${Number(obs.frp).toFixed(2)} MW` : "No disponible"}
                              </span>
                            </div>
                            <div className="mt-1">
                              Confianza: <span className="text-white/70">{confidenceLabel(obs.confidence)}</span>
                            </div>
                          </div>
                          <div className="text-xs text-white/55">
                            <div>
                              Instrumento:{" "}
                              <span className="text-white/70">{obs.instrument || "No indicado"}</span>
                            </div>
                            <div className="mt-1">
                              Satélite: <span className="text-white/70">{obs.satellite || "No indicado"}</span> ·{" "}
                              {dayNightLabel(obs.daynight)}
                            </div>
                            <div className="mt-1 text-[11px] text-white/35">
                              Brillo T4/T5:{" "}
                              {Number.isFinite(obs.bright_ti4 as any) ? Number(obs.bright_ti4).toFixed(1) : "—"} /{" "}
                              {Number.isFinite(obs.bright_ti5 as any) ? Number(obs.bright_ti5).toFixed(1) : "—"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-white/45">
                      Este evento todavía no conserva una muestra de señales FIRMS crudas. Las métricas agregadas y el enlace externo siguen disponibles si existen.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.05] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-cyan-100/90">Procedencia de la consulta</div>
                      <div className="mt-1 text-xs leading-relaxed text-white/45">
                        Metadatos de la consulta usada por BioPulse para construir este evento.
                      </div>
                    </div>
                    <span className="self-start rounded-full border border-cyan-300/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-100/70">
                      {satelliteSource?.provider ?? "Fuente no conectada"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-white/35">Producto</div>
                      <div className="mt-1 text-xs font-semibold text-white/75">
                        {satelliteSource?.product ?? "No disponible"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-white/35">Ventana</div>
                      <div className="mt-1 text-xs font-semibold text-white/75">
                        {satelliteSource?.days != null ? `${satelliteSource.days} días` : "No disponible"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-white/35">Área consultada</div>
                      <div className="mt-1 break-all text-xs font-semibold text-white/75">
                        {satelliteSource?.bbox ?? "No disponible"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/15 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-white/35">Consulta</div>
                      <div className="mt-1 text-xs font-semibold text-white/75">
                        {satelliteSource?.fetchedAt ? fmtNowishUTC(satelliteSource.fetchedAt) : "No disponible"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
                  <div className="rounded-xl border border-amber-300/15 bg-amber-400/[0.06] p-4">
                    <div className="text-sm font-semibold text-amber-100/90">Límites de lectura satelital</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs leading-relaxed text-white/50 sm:grid-cols-2">
                      <div>Puede haber demoras entre observación, procesamiento y visualización.</div>
                      <div>Nubes, humo denso, resolución y ángulo orbital pueden ocultar o distorsionar señales.</div>
                      <div>Una detección térmica no confirma evacuación, personas afectadas ni daño en superficie.</div>
                      <div>BioPulse agrupa señales para comprensión operativa; la fuente oficial debe revisarse en FIRMS.</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white/85">Capas satelitales futuras</div>
                        <div className="mt-1 text-xs leading-relaxed text-white/40">
                          Pertinentes para BioPulse, pero todavía no conectadas a este evento.
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/45">
                        Roadmap
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {satelliteFutureLayers.map((layer) => (
                        <span
                          key={layer}
                          className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-white/50"
                        >
                          {layer}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/40">
                  Datos instrumentales: {satelliteInstrumentLabel} cuando estén disponibles. Estas señales pueden tener demoras, cobertura parcial o falsos positivos.
                </div>
              </div>
            </SectionShell>

            ) : null}
            {/* Qué protegemos aquí */}

            {activeSection === "protected" ? (
            <SectionShell
              icon={<Leaf className="h-5 w-5 text-emerald-200" />}
              title="Qué protegemos aquí"
              subtitle="Contexto ambiental disponible alrededor del evento. La cercanía no implica afectación confirmada."
              right={
                <div
                  className={cn(
                    "hidden sm:inline-flex items-center rounded-full border px-3 py-1.5",
                    hasProtectionContext
                      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/90"
                      : "border-white/10 bg-white/5 text-white/55"
                  )}
                >
                  <span className="text-xs font-semibold">
                    {hasProtectionContext ? "Parcial" : "No conectado"}
                  </span>
                </div>
              }
            >
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <div className="border-b border-amber-300/15 bg-amber-400/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-100/75">
                  BioPulse identifica la procedencia cuando la fuente está conectada. La cercanía espacial no constituye
                  por sí sola un análisis de exposición o afectación.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2">
                  <div className="border-b border-white/10 p-4 md:border-r">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                        <Leaf className="h-4 w-4 text-emerald-200/75" />
                        Ecosistemas
                      </div>
                      <span className="text-[11px] text-white/40">
                        {eventEcosystems.length > 0 ? "Información asociada" : "No conectada"}
                      </span>
                    </div>
                    {eventEcosystems.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {eventEcosystems.map((ecosystem, index) => (
                          <li key={`${ecosystem}-${index}`} className="flex items-start gap-2 text-sm text-white/70">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300/65" />
                            <span>{ecosystem}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-3 text-sm leading-relaxed text-white/50">
                        Información de ecosistemas aún no conectada para este evento.
                      </div>
                    )}
                  </div>

                  <div className="border-b border-white/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                        <PawPrint className="h-4 w-4 text-amber-200/75" />
                        Fauna y especies relevantes
                      </div>
                      <span className="text-[11px] text-white/40">
                        {eventSpecies.length > 0 ? "Información asociada" : "No conectada"}
                      </span>
                    </div>
                    {eventSpecies.length > 0 ? (
                      <>
                        <ul className="mt-3 space-y-2">
                          {eventSpecies.map((species, index) => (
                            <li key={`${species}-${index}`} className="flex items-start gap-2 text-sm text-white/70">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-200/65" />
                              <span>{species}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 text-[11px] leading-relaxed text-white/35">
                          Su exposición o afectación no está confirmada.
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-sm leading-relaxed text-white/50">
                        Información de fauna aún no conectada.
                      </div>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-white/10">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Flower2 className="mt-0.5 h-4 w-4 shrink-0 text-pink-200/65" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white/75">Flora</div>
                      <div className="mt-0.5 text-xs text-white/45">Información de flora aún no conectada.</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200/65" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-white/75">Áreas protegidas</div>
                        <div className="text-[11px] text-white/40">Radio consultado: 50 km</div>
                      </div>

                      {protectedContextLoading ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-white/45">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Consultando registros cartográficos cercanos…
                        </div>
                      ) : protectedContextErr ? (
                        <div className="mt-2 text-xs leading-relaxed text-amber-100/65">
                          La fuente de áreas protegidas está temporalmente limitada. Intentá nuevamente más tarde.
                        </div>
                      ) : protectedAreas.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {protectedAreas.map((area) => (
                            <a
                              key={area.id}
                              href={area.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-start justify-between gap-3 rounded-xl border border-cyan-300/10 bg-cyan-400/[0.04] px-3 py-2.5 transition-colors hover:bg-cyan-400/[0.08]"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-cyan-50/85">{area.name}</div>
                                <div className="mt-0.5 text-[11px] leading-relaxed text-white/40">
                                  {[
                                    area.designation,
                                    area.protectClass ? `Clase de protección ${area.protectClass}` : null,
                                    area.operator,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") ||
                                    "Clasificación u operador no informados"}
                                </div>
                              </div>
                              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-200/55" />
                            </a>
                          ))}
                          <div className="text-[11px] leading-relaxed text-white/35">
                            Registros cercanos en OpenStreetMap. Su presencia no confirma exposición ni daño.
                          </div>
                        </div>
                      ) : protectedContext ? (
                        <div className="mt-2 text-xs leading-relaxed text-white/45">
                          No se encontraron áreas protegidas con nombre dentro del radio consultado. Esto puede reflejar
                          ausencia de registros o cobertura cartográfica incompleta.
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-white/45">Catálogo de áreas protegidas aún no conectado.</div>
                      )}

                      {protectedContext?.source ? (
                        <a
                          href={protectedContext.source.licenseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-100/50 hover:text-cyan-100/75"
                        >
                          {protectedContext.source.attribution}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-sky-200/65" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white/75">Recursos hídricos</div>
                      {eventWaterLevel != null ? (
                        <div className="mt-1">
                          <div className="mt-0.5 text-sm text-white/70">
                            Nivel de agua informado: {eventWaterLevel.toFixed(1)} m
                          </div>
                          <div className="mt-1 text-xs leading-relaxed text-white/40">
                            La fuente y el recurso hídrico específico no están identificados en el modelo actual.
                          </div>
                        </div>
                      ) : null}

                      <WaterResourceSummary
                        items={nearbyWaterResources}
                        loading={waterContextLoading}
                        error={Boolean(waterContextErr)}
                        loaded={Boolean(waterContext)}
                      />

                      {waterContext?.source ? (
                        <a
                          href={waterContext.source.attributionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-100/50 hover:text-cyan-100/75"
                        >
                          {waterContext.source.attribution}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/35">
                  Relación con el evento: desconocida. No se confirma exposición, daño ni afectación ambiental.
                </div>
              </div>
            </SectionShell>

            ) : null}
            {/* Impacto humano */}

            {activeSection === "human" ? (
            <SectionShell
              icon={<Users className="h-5 w-5 text-sky-200" />}
              title="Impacto humano"
              subtitle="Información disponible sobre población, evacuación e infraestructura. Los datos sin fuente explícita no constituyen confirmación oficial."
              right={
                <div
                  className={cn(
                    "hidden sm:inline-flex items-center rounded-full border px-3 py-1.5",
                    hasHumanContext
                      ? "border-sky-300/20 bg-sky-400/10 text-sky-100/90"
                      : "border-white/10 bg-white/5 text-white/55"
                  )}
                >
                  <span className="text-xs font-semibold">{hasHumanContext ? "Parcial" : "No conectado"}</span>
                </div>
              }
            >
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <div
                  className={cn(
                    "flex items-start gap-3 border-b px-4 py-4",
                    event.evacuationLevel === "mandatory"
                      ? "border-red-400/20 bg-red-500/10"
                      : event.evacuationLevel === "recommended"
                      ? "border-amber-300/20 bg-amber-400/[0.08]"
                      : "border-white/10 bg-white/[0.03]"
                  )}
                >
                  <Siren
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0",
                      event.evacuationLevel === "mandatory"
                        ? "text-red-200"
                        : event.evacuationLevel === "recommended"
                        ? "text-amber-200"
                        : "text-white/45"
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Evacuación</div>
                    <div className="mt-1 text-sm font-semibold text-white/85">{humanEvacuationLabel}</div>
                    {event.evacuationLevel != null ? (
                      <div className="mt-1 text-xs leading-relaxed text-white/45">
                        La fuente oficial no está especificada en el modelo actual.
                      </div>
                    ) : (
                      <div className="mt-1 text-xs leading-relaxed text-white/45">
                        BioPulse todavía no dispone de una fuente estructurada para este estado.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-white/10">
                  <div className="p-4 sm:border-r sm:border-white/10">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                      <Users className="h-4 w-4 text-sky-200/70" />
                      Población informada
                    </div>
                    {eventPopulation != null ? (
                      <>
                        <div className="mt-2 text-xl font-semibold text-white/90">
                          Aproximadamente {eventPopulation.toLocaleString("es-AR")}
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-white/40">
                          Sin fuente, metodología ni distinción entre población expuesta o afectada.
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 text-sm text-white/50">Información poblacional aún no conectada.</div>
                    )}
                  </div>

                  <div className="border-t border-white/10 p-4 sm:border-t-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                      <MapPin className="h-4 w-4 text-amber-200/70" />
                      Superficie informada
                    </div>
                    {eventArea != null ? (
                      <>
                        <div className="mt-2 text-xl font-semibold text-white/90">
                          {eventArea.toLocaleString("es-AR", { maximumFractionDigits: 1 })} km²
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-white/40">
                          Sin fuente ni metodología especificada; no se presenta como superficie afectada validada.
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 text-sm text-white/50">
                        {hasTechnicalFireArea
                          ? "El valor técnico provisional fue ocultado. El cálculo real aún no está disponible."
                          : "Cálculo de superficie aún no disponible."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-b border-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                      <Building2 className="h-4 w-4 text-cyan-200/70" />
                      Infraestructura asociada al evento
                    </div>
                    <span className="text-[11px] text-white/40">
                      {eventInfrastructure.length > 0 ? "Información asociada" : "No conectada"}
                    </span>
                  </div>
                  {eventInfrastructure.length > 0 ? (
                    <>
                      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {eventInfrastructure.map((item, index) => (
                          <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-white/70">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/60" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 text-[11px] leading-relaxed text-white/35">
                        La proximidad, el estado operativo y cualquier impacto no están confirmados.
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-white/50">
                      Inventario de infraestructura aún no conectado.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <div className="divide-y divide-white/10">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <House className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200/65" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white/75">Comunidades cercanas</div>
                        <NearbyCommunitySummary
                          items={nearbyCommunities}
                          loading={nearbyCommunitiesLoading}
                          error={Boolean(nearbyCommunitiesErr)}
                          loaded={Boolean(nearbyCommunitiesContext)}
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-3 px-4 py-3">
                      <Hospital className="mt-0.5 h-4 w-4 shrink-0 text-red-200/65" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white/75">Hospitales</div>
                        <CriticalFacilitySummary
                          items={nearbyHealthcare}
                          loading={criticalInfrastructureLoading}
                          error={Boolean(criticalInfrastructureErr)}
                          loaded={Boolean(criticalInfrastructure)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-white/10">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <School className="mt-0.5 h-4 w-4 shrink-0 text-yellow-200/65" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white/75">Escuelas</div>
                        <CriticalFacilitySummary
                          items={nearbySchools}
                          loading={criticalInfrastructureLoading}
                          error={Boolean(criticalInfrastructureErr)}
                          loaded={Boolean(criticalInfrastructure)}
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-3 px-4 py-3">
                      <Route className="mt-0.5 h-4 w-4 shrink-0 text-white/55" />
                      <div>
                        <div className="text-sm font-medium text-white/75">Rutas y accesos</div>
                        <div className="mt-0.5 text-xs text-white/45">Estado vial aún no conectado.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 divide-y divide-white/10 border-t border-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Siren className="mt-0.5 h-4 w-4 shrink-0 text-orange-200/70" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white/75">Bomberos</div>
                      <CriticalFacilitySummary
                        items={nearbyFireStations}
                        loading={criticalInfrastructureLoading}
                        error={Boolean(criticalInfrastructureErr)}
                        loaded={Boolean(criticalInfrastructure)}
                      />
                    </div>
                  </div>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200/70" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white/75">Refugios y puntos de encuentro</div>
                      <CriticalFacilitySummary
                        items={nearbyShelters}
                        loading={criticalInfrastructureLoading}
                        error={Boolean(criticalInfrastructureErr)}
                        loaded={Boolean(criticalInfrastructure)}
                      />
                    </div>
                  </div>
                </div>

                {humanGeoSource ? (
                  <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/35">
                    Comunidades y servicios cercanos no implican población expuesta, disponibilidad ni afectación. {" "}
                    <a
                      href={humanGeoSource.attributionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-100/55 hover:text-cyan-100/80"
                    >
                      {humanGeoSource.attribution}
                    </a>
                  </div>
                ) : null}

                <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/35">
                  Última observación del evento: {observationDate ? fmtDateTimeUTC(observationDate) : "no disponible"}
                  {observationDate ? ` · ${observationFreshness}` : ""}. La vigencia de cada dato humano puede ser diferente.
                </div>
              </div>
            </SectionShell>

            ) : null}
            {/* BioPulse Insight */}

            {activeSection === "insight" ? (
            <SectionShell
              icon={<Brain className="h-5 w-5 text-violet-200" />}
              title="BioPulse Insight"
              subtitle="Lectura interpretativa separada de los datos observados."
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-4">
                  <div className="text-[11px] uppercase tracking-wide text-cyan-100/60">Dato observado</div>
                  <div className="mt-1 text-xs leading-relaxed text-white/45">
                    Valores disponibles en el registro actual del evento.
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/40">Detecciones</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">
                        {satelliteDetections != null ? satelliteDetections : "No disponible"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/40">Tendencia</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">{trend}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/40">FRP máximo</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">
                        {satelliteFrpMax != null ? `${satelliteFrpMax.toFixed(2)} MW` : "No disponible"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/40">FRP acumulado</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">
                        {satelliteFrpSum != null ? `${satelliteFrpSum.toFixed(2)} MW` : "No disponible"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Fecha de observación</div>
                    <div className="mt-1 text-sm font-semibold text-white/85">
                      {observationDate ? fmtDateTimeUTC(observationDate) : "No disponible"}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Clima actual registrado</div>
                    {observedWeather.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {observedWeather.map((item) => (
                          <span
                            key={item}
                            className="inline-flex rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/75"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-white/50">No hay clima observado guardado en este evento.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.04] p-4">
                  <div className="text-[11px] uppercase tracking-wide text-violet-100/60">Inferencia BioPulse</div>

                  <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs font-medium leading-relaxed text-amber-100/90">
                    Estimación heurística de BioPulse. No constituye confirmación oficial.
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Probabilidad próximas 12 h</div>
                    <div className="mt-1 text-lg font-semibold text-white/90">
                      {insightProbability != null ? `${insightProbability}%` : "No disponible"}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Interpretación</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/75">
                      {insightNarrative || "No hay una inferencia BioPulse disponible para este evento."}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Recomendaciones</div>
                    {insightRecommendations.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {insightRecommendations.map((recommendation, index) => (
                          <li key={`${recommendation}-${index}`} className="flex items-start gap-2 text-sm text-white/70">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300/70" />
                            <span>{recommendation}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-1 text-sm text-white/50">No hay recomendaciones disponibles.</div>
                    )}
                  </div>
                </div>
              </div>
            </SectionShell>

            ) : null}
            {/* ✅ Noticias (ARREGLADO / INCLUIDO) */}

            {(activeSection === "news" || activeSection === "official") ? (
            <SectionShell
              icon={<Newspaper className="h-5 w-5 text-white/80" />}
              title="Noticias"
              subtitle="Comunicados oficiales (prioridad) + noticias de la región."
              right={
                newsView !== "main" ? (
                  <button
                    onClick={() => setNewsView("main")}
                    className={cn(
                      "inline-flex items-center gap-2",
                      "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                      "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    )}
                    aria-label="Volver a resumen"
                    title="Volver"
                  >
                    <CornerUpLeft className="h-4 w-4" />
                    <span className="text-xs font-medium">Volver</span>
                  </button>
                ) : (
                  <button
                    onClick={loadNews}
                    className={cn(
                      "inline-flex items-center gap-2",
                      "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                      "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    )}
                    aria-label="Actualizar noticias"
                    title="Actualizar"
                  >
                    {newsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="text-xs font-medium">Actualizar</span>
                  </button>
                )
              }
            >
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                {newsErr ? (
                  <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                    No se pudo cargar noticias. <span className="text-red-100/70">{newsErr}</span>
                  </div>
                ) : null}

                {newsLimited ? (
                  <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100/90">
                    Fuente de noticias temporalmente limitada. Intentá nuevamente más tarde.
                  </div>
                ) : null}

                {newsFilteredOut ? (
                  <div className="mb-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.06] p-3 text-sm leading-relaxed text-cyan-50/75">
                    {newsFilteredMessage} Preferimos dejar el espacio vacío antes que mostrar ruido como evidencia.
                  </div>
                ) : null}

                {!visualMediaAllowed && newsItems.some((item) => Boolean(item.image)) ? (
                  <div className="mb-3">
                    <VisualExposureGate
                      preference={guardianExposure}
                      onReveal={() => setGuardianVisualConsent(true)}
                    />
                  </div>
                ) : null}

                {newsLoading ? (
                  <div className="mt-2 space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-pulse">
                        <div className="h-4 w-2/3 bg-white/10 rounded" />
                        <div className="h-3 w-1/3 bg-white/10 rounded mt-2" />
                        <div className="h-3 w-full bg-white/10 rounded mt-3" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 space-y-4">
                    {newsView === "main" ? (
                      <>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white/90">Comunicados oficiales</div>
                              <div className="text-xs text-white/45 mt-0.5">
                                Prioridad máxima. Activa alerta si menciona evacuación/alerta.
                              </div>
                            </div>
                            <button
                              onClick={() => setNewsView("official")}
                              className={cn(
                                "shrink-0 inline-flex items-center gap-2",
                                "px-3 py-2 rounded-xl border border-white/10 bg-black/20",
                                "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                              )}
                              title="Ver más"
                            >
                              <span className="text-xs font-medium">Ver más</span>
                              <ExternalLink className="h-4 w-4 opacity-70" />
                            </button>
                          </div>

                          <div className="mt-3 space-y-3">
                            {splitNews.official.length === 0 ? (
                              <div className="text-sm text-white/55">No hay comunicados oficiales todavía.</div>
                            ) : (
                              splitNews.official.slice(0, 3).map((it) => {
                                const when = it.publishedAt ? new Date(it.publishedAt) : null;
                                const evac = isEvacuationRelevant(it);
                                return (
                                  <div key={it.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <div className="text-sm font-semibold text-white/90 line-clamp-2">
                                            {it.title ?? "Comunicado"}
                                          </div>
                                          {evac ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-red-400/30 bg-red-500/10 text-[10px] font-semibold text-red-100/90">
                                              ALERTA
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="mt-1 text-[11px] text-white/45">
                                          {it.domain ? <span className="text-white/55">{it.domain}</span> : null}
                                          {when ? (
                                            <>
                                              <span className="mx-2 text-white/20">•</span>
                                              <span>{when.toUTCString().replace("GMT", "UTC")}</span>
                                            </>
                                          ) : null}
                                        </div>
                                      </div>

                                      {it.url ? (
                                        <a
                                          href={it.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={cn(
                                            "shrink-0 inline-flex items-center gap-2",
                                            "px-3 py-2 rounded-xl border border-white/10 bg-white/5",
                                            "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                          )}
                                          title="Abrir"
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                          <span className="text-xs font-medium">Abrir</span>
                                        </a>
                                      ) : null}
                                    </div>

                                    {it.summary ? (
                                      <div className="mt-2 text-sm text-white/60 leading-relaxed line-clamp-3">
                                        {it.summary}
                                      </div>
                                    ) : null}
                                    {guardianCanCaptureSource ? (
                                      <div className="mt-3">
                                        <GuardianSourceButton onClick={() => beginNewsObservation(it, "official")} />
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white/90">Noticias de la región</div>
                              <div className="text-xs text-white/45 mt-0.5">
                                Secundario. Orden cronológico según resultados.
                              </div>
                            </div>
                            <button
                              onClick={() => setNewsView("regional")}
                              className={cn(
                                "shrink-0 inline-flex items-center gap-2",
                                "px-3 py-2 rounded-xl border border-white/10 bg-black/20",
                                "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                              )}
                              title="Ver más"
                            >
                              <span className="text-xs font-medium">Ver más</span>
                              <ExternalLink className="h-4 w-4 opacity-70" />
                            </button>
                          </div>

                          <div className="mt-3 space-y-3">
                            {splitNews.regional.length === 0 ? (
                              <div className="text-sm text-white/55">
                                {newsFilteredOut
                                  ? "Se encontraron resultados regionales débiles, pero BioPulse los descartó para no mezclarlos con evidencia del evento."
                                  : "No se encontraron noticias regionales suficientemente vinculadas a este evento."}
                              </div>
                            ) : (
                              splitNews.regional.slice(0, 3).map((it) => {
                                const when = it.publishedAt ? new Date(it.publishedAt) : null;
                                return (
                                  <div key={it.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold text-white/90 line-clamp-2">
                                          {it.title ?? "Artículo"}
                                        </div>
                                        <div className="mt-1 text-[11px] text-white/45">
                                          {it.domain ? <span className="text-white/55">{it.domain}</span> : null}
                                          {when ? (
                                            <>
                                              <span className="mx-2 text-white/20">•</span>
                                              <span>{when.toUTCString().replace("GMT", "UTC")}</span>
                                            </>
                                          ) : null}
                                        </div>
                                      </div>

                                      {it.url ? (
                                        <a
                                          href={it.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={cn(
                                            "shrink-0 inline-flex items-center gap-2",
                                            "px-3 py-2 rounded-xl border border-white/10 bg-white/5",
                                            "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                          )}
                                          title="Abrir"
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                          <span className="text-xs font-medium">Abrir</span>
                                        </a>
                                      ) : null}
                                    </div>

                                    {it.summary ? (
                                      <div className="mt-2 text-sm text-white/60 leading-relaxed line-clamp-3">
                                        {it.summary}
                                      </div>
                                    ) : null}
                                    {guardianCanCaptureSource ? (
                                      <div className="mt-3">
                                        <GuardianSourceButton onClick={() => beginNewsObservation(it, "regional")} />
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {showHistoricalNewsContext ? (
                          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.045] p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100/90">
                                  <History className="h-4 w-4" />
                                  Investigación histórica BioPulse
                                </div>
                                <div className="mt-1 text-xs leading-relaxed text-cyan-50/55">
                                  Además de la actualidad, este espacio separa memoria reciente conectada y archivo
                                  histórico pendiente sobre {historicalNewsTopic} cerca de {event.location}.
                                </div>
                              </div>
                              <span className="self-start rounded-full border border-cyan-300/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-100/70">
                                {hasRecentHistoricalSignals ? "Memoria reciente" : "Próxima fuente"}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 md:grid-cols-3">
                              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-white/35">Memoria reciente</div>
                                {hasRecentHistoricalSignals ? (
                                  <div className="mt-2 space-y-1.5">
                                    {recentHistoricalSignals.slice(0, 4).map((signal) => (
                                      <div key={signal} className="flex gap-2 text-xs leading-relaxed text-white/58">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/70" />
                                        <span>{signal}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-1 text-xs leading-relaxed text-white/58">
                                    BioPulse todavía no conserva suficientes señales comparables para esta zona.
                                  </div>
                                )}
                              </div>
                              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-white/35">Archivo FIRMS</div>
                                {fireHistoryLoading ? (
                                  <div className="mt-2 flex items-center gap-2 text-xs text-white/55">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Consultando antecedentes satelitales...
                                  </div>
                                ) : fireHistory ? (
                                  <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/58">
                                    <div>
                                      {fireHistory.summary.totalDetections} detecciones en{" "}
                                      {fireHistory.summary.yearsWithDetections} de {fireHistory.query.years} años
                                      muestreados.
                                    </div>
                                    {fireHistory.summary.peakYear ? (
                                      <div>
                                        Año con más señales: {fireHistory.summary.peakYear.year} (
                                        {fireHistory.summary.peakYear.detections}).
                                      </div>
                                    ) : null}
                                    {fireHistory.summary.latestDetection ? (
                                      <div>
                                        Última señal histórica:{" "}
                                        {fmtDateTimeUTC(new Date(fireHistory.summary.latestDetection))}.
                                      </div>
                                    ) : null}
                                  </div>
                                ) : fireHistoryErr ? (
                                  <div className="mt-1 text-xs leading-relaxed text-amber-50/65">
                                    Historial FIRMS no disponible: {fireHistoryErr}
                                  </div>
                                ) : (
                                  <div className="mt-1 text-xs leading-relaxed text-white/58">
                                    FIRMS multianual todavía no devolvió antecedentes para este evento.
                                  </div>
                                )}
                              </div>
                              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-white/35">Cómo se usaría</div>
                                <div className="mt-1 text-xs leading-relaxed text-white/58">
                                  Como contexto histórico, separado de noticias actuales y de confirmaciones oficiales.
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/[0.055] p-3 text-xs leading-relaxed text-amber-50/65">
                              Un antecedente histórico no confirma relación causal con el evento actual. BioPulse debe
                              mostrar evidencia, fuente y fecha antes de convertirlo en memoria del evento.
                              {fireHistory ? (
                                <div className="mt-2 text-amber-50/55">
                                  Fuente: {fireHistory.attributionText} / {fireHistory.source}.{" "}
                                  {fireHistory.limitations[0]}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {newsView === "official" ? (
                      <div className="space-y-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/45">
                          Sección: <span className="text-white/55 normal-case">Comunicados oficiales</span>
                        </div>

                        {splitNews.official.length === 0 ? (
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/55">
                            No hay comunicados oficiales todavía.
                          </div>
                        ) : (
                          splitNews.official.map((it) => {
                            const when = it.publishedAt ? new Date(it.publishedAt) : null;
                            const evac = isEvacuationRelevant(it);
                            return (
                              <div key={it.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    {visualMediaAllowed ? (
                                      <NewsThumb src={it.image ?? ""} alt={it.title ?? "Imagen"} />
                                    ) : null}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <div className="text-sm font-semibold text-white/90 line-clamp-2">
                                          {it.title ?? "Comunicado"}
                                        </div>
                                        {evac ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-red-400/30 bg-red-500/10 text-[10px] font-semibold text-red-100/90">
                                            ALERTA
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="mt-1 text-[11px] text-white/45">
                                        {it.domain ? <span className="text-white/55">{it.domain}</span> : null}
                                        {when ? (
                                          <>
                                            <span className="mx-2 text-white/20">•</span>
                                            <span>{when.toUTCString().replace("GMT", "UTC")}</span>
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>

                                  {it.url ? (
                                    <a
                                      href={it.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cn(
                                        "shrink-0 inline-flex items-center gap-2",
                                        "px-3 py-2 rounded-xl border border-white/10 bg-black/20",
                                        "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                      )}
                                      title="Abrir"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      <span className="text-xs font-medium">Abrir</span>
                                    </a>
                                  ) : null}
                                </div>

                                {it.summary ? (
                                  <div className="mt-2 text-sm text-white/60 leading-relaxed">{it.summary}</div>
                                ) : null}
                                {guardianCanCaptureSource ? (
                                  <div className="mt-3">
                                    <GuardianSourceButton onClick={() => beginNewsObservation(it, "official")} />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : null}

                    {newsView === "regional" ? (
                      <div className="space-y-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/45">
                          Sección: <span className="text-white/55 normal-case">Noticias de la región</span>
                        </div>

                        {splitNews.regional.length === 0 ? (
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/55">
                            {newsFilteredOut
                              ? "Se encontraron resultados regionales débiles, pero BioPulse los descartó para no mezclarlos con evidencia del evento."
                              : "No se encontraron noticias regionales suficientemente vinculadas a este evento."}
                          </div>
                        ) : (
                          splitNews.regional.map((it) => {
                            const when = it.publishedAt ? new Date(it.publishedAt) : null;
                            return (
                              <div key={it.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    {visualMediaAllowed ? (
                                      <NewsThumb src={it.image ?? ""} alt={it.title ?? "Imagen"} />
                                    ) : null}
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-white/90 line-clamp-2">
                                        {it.title ?? "Artículo"}
                                      </div>
                                      <div className="mt-1 text-[11px] text-white/45">
                                        {it.domain ? <span className="text-white/55">{it.domain}</span> : null}
                                        {when ? (
                                          <>
                                            <span className="mx-2 text-white/20">•</span>
                                            <span>{when.toUTCString().replace("GMT", "UTC")}</span>
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>

                                  {it.url ? (
                                    <a
                                      href={it.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cn(
                                        "shrink-0 inline-flex items-center gap-2",
                                        "px-3 py-2 rounded-xl border border-white/10 bg-black/20",
                                        "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                      )}
                                      title="Abrir"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      <span className="text-xs font-medium">Abrir</span>
                                    </a>
                                  ) : null}
                                </div>

                                {it.summary ? (
                                  <div className="mt-2 text-sm text-white/60 leading-relaxed">{it.summary}</div>
                                ) : null}
                                {guardianCanCaptureSource ? (
                                  <div className="mt-3">
                                    <GuardianSourceButton onClick={() => beginNewsObservation(it, "regional")} />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {newsMeta?.fetchedAt ? (
                  <div className="mt-4 text-[11px] text-white/35">
                    Actualizado: {new Date(newsMeta.fetchedAt).toUTCString().replace("GMT", "UTC")}
                  </div>
                ) : null}
              </div>
            </SectionShell>
            ) : null}

            {/* Indicadores operativos */}
            {activeSection === "weather" ? (
              <>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
              <div className="px-5 pt-4 pb-3">
                <div className="text-white/90 font-semibold">Indicadores operativos</div>
                <div className="text-xs text-white/45 mt-0.5">Visual + número + explicación.</div>
              </div>

              <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-white/45">Intensidad</div>
                      <div className="text-[11px] text-white/35 mt-0.5">Radiative Power</div>
                    </div>
                    <Gauge className="h-4 w-4 text-white/40" />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Dial value={intensityLevel} label="nivel" />
                    <div className="text-right">
                      <div className="text-white/90 font-semibold">
                        {frpMax != null ? `${frpMax.toFixed(2)} FRP` : "—"} <span className="text-white/50">max</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-white/45">Actividad</div>
                      <div className="text-[11px] text-white/35 mt-0.5">Señales VIIRS</div>
                    </div>
                    <Activity className="h-4 w-4 text-white/40" />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Dial value={activityLevel} label="nivel" />
                    <div className="text-right">
                      <div className="text-white/90 font-semibold">
                        {detections != null ? `${detections}` : "—"} <span className="text-white/50">detections</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-white/45">Energía total</div>
                      <div className="text-[11px] text-white/35 mt-0.5">Acumulado</div>
                    </div>
                    <Flame className="h-4 w-4 text-white/40" />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Dial value={energyLevel} label="nivel" />
                    <div className="text-right">
                      <div className="text-white/90 font-semibold">
                        {frpSum != null ? `${frpSum.toFixed(2)} FRP` : "—"} <span className="text-white/50">sum</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Condiciones climáticas + Lectura guardián */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
              <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-white/90 font-semibold">Condiciones climáticas</div>
                  <div className="text-xs text-white/45 mt-0.5">Clima actual estimado en el punto del evento.</div>
                </div>

                <button
                  onClick={loadWeather}
                  className={cn(
                    "inline-flex items-center gap-2",
                    "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                    "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  )}
                  aria-label="Actualizar clima"
                  title="Actualizar clima"
                >
                  {weatherLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="text-xs font-medium">Actualizar</span>
                </button>
              </div>

              <div className="px-5 pb-5 space-y-3">
                {weatherErr ? (
                  <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                    No se pudo cargar clima. <span className="text-red-100/70">{weatherErr}</span>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <CloudRain className="h-4 w-4" /> Lluvia
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">{rainText}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Wind className="h-4 w-4" /> Viento
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">{windText}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Droplets className="h-4 w-4" /> Humedad
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">{humText}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Thermometer className="h-4 w-4" /> Temp.
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">{tempText}</div>
                  </div>
                </div>

                {/* Lectura guardián */}
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-white/45">Lectura (modo guardián)</div>
                      <div className="mt-1 text-sm font-semibold text-white/90">{guardianInsight.headline}</div>
                    </div>

                    <div className={cn("shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border", insightPill)}>
                      <span className="text-xs font-semibold">
                        {guardianInsight.reliefPct == null ? "—" : `Mejora por clima: ${guardianInsight.reliefPct}%`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {guardianInsight.lines.map((ln, idx) => (
                      <div key={idx} className="text-sm text-white/65 leading-relaxed">
                        {ln}
                      </div>
                    ))}
                  </div>

                  {weather?.time ? (
                    <div className="mt-3 text-[11px] text-white/35">
                      Lectura basada en clima actual (UTC): {fmtNowishUTC(weather.time)}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Cámaras en vivo */}
              </>
            ) : null}

            {activeSection === "cameras" ? (
            <SectionShell
              icon={<Camera className="h-5 w-5 text-white/80" />}
              title="Cámaras en vivo"
              subtitle="Observación visual cercana al evento. Las imágenes externas pueden actualizarse, fallar o quedar fuera de servicio."
              right={
                <div className="flex items-center gap-2">
                  <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/75">
                    <Radius className="h-4 w-4 opacity-70" />
                    <span className="text-xs">Radio {camRadiusKm} km</span>
                  </div>
                  <button
                    onClick={() => {
                      loadCameraRegistry();
                      setCamRefreshTick((t) => t + 1);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2",
                      "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                      "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    )}
                    aria-label="Actualizar cámaras"
                    title="Actualizar cámaras"
                  >
                    {camLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="text-xs font-medium">Actualizar</span>
                  </button>
                </div>
              }
            >
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                {camErr ? (
                  <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                    No se pudo cargar cámaras. <span className="text-red-100/70">{camErr}</span>
                    <div className="mt-2 text-xs text-red-100/70">
                      Tip: asegurate de tener el JSON en <span className="font-semibold">/public</span> (ej.{" "}
                      <span className="font-mono">public/cameraRegistry.sample.json</span>)
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Cámaras cercanas</div>
                    <div className="mt-2 text-2xl font-semibold text-white/90">{nearbyCameras.length}</div>
                    <div className="mt-1 text-xs text-white/35">Dentro del radio actual.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Registro</div>
                    <div className="mt-2 text-2xl font-semibold text-white/90">{camRegistry.length}</div>
                    <div className="mt-1 text-xs text-white/35">Cámaras cargadas en BioPulse.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Reportes Guardian</div>
                    <div className="mt-2 text-2xl font-semibold text-white/90">{cameraGuardianObservations.length}</div>
                    <div className="mt-1 text-xs text-white/35">Observaciones locales vinculadas a cámaras.</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/45 flex items-center gap-2">
                    <MapPin className="h-4 w-4 opacity-70" />
                    Centro:{" "}
                    <span className="text-white/55 normal-case">
                      {event.latitude.toFixed(3)}, {event.longitude.toFixed(3)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-[11px] text-white/45">Radio:</div>
                    <div className="inline-flex overflow-hidden rounded-xl border border-white/10 bg-white/5">
                      {[20, 40, 60, 100].map((km) => (
                        <button
                          key={km}
                          onClick={() => setCamRadiusKm(km)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-semibold transition-colors",
                            camRadiusKm === km ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/10"
                          )}
                          title={`Mostrar cámaras hasta ${km} km`}
                        >
                          {km}km
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setCamRefreshTick((t) => t + 1)}
                      className={cn(
                        "inline-flex items-center gap-2",
                        "px-3 py-1.5 rounded-xl border border-white/10 bg-black/20",
                        "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                      )}
                      title="Refrescar snapshots"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span className="text-xs font-medium">Refrescar</span>
                    </button>
                  </div>
                </div>

                {nearbyCameras.length > 0 && !visualMediaAllowed ? (
                  <div className="mt-4">
                    <VisualExposureGate
                      preference={guardianExposure}
                      onReveal={() => setGuardianVisualConsent(true)}
                    />
                  </div>
                ) : null}

                <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.045] p-4">
                  <div className="text-sm font-semibold text-cyan-100/85">Lectura visual responsable</div>
                  <div className="mt-1 text-xs leading-relaxed text-cyan-100/55">
                    Una cámara puede ayudar a observar humo, visibilidad o condiciones locales, pero no confirma por sí sola
                    el impacto del evento. Preservá contexto: hora, fuente, ubicación aproximada y limitaciones visibles.
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {camLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-pulse">
                          <div className="h-4 w-2/3 bg-white/10 rounded" />
                          <div className="h-3 w-1/3 bg-white/10 rounded mt-2" />
                          <div className="h-3 w-full bg-white/10 rounded mt-3" />
                        </div>
                      ))}
                    </div>
                  ) : nearbyCameras.length === 0 ? (
                    <div className="text-sm text-white/55">
                      No hay cámaras dentro del radio actual. Probá ampliar a 100 km o registrar nuevas cámaras.
                    </div>
                  ) : (
                    nearbyCameras.map((cam, index) => {
                      const title = cam.title ?? cam.id;
                      const locality = cam.coverage?.locality || cam.coverage?.admin1 || cam.coverage?.countryISO2 || "";
                      const dist = `${cam.distanceKm.toFixed(1)} km`;
                      const isNearest = index === 0;

                      const isSnapshot = cam.fetch?.kind === "image_url" && typeof (cam.fetch as any)?.url === "string";
                      const isWindyProvider =
                        cam.fetch?.kind === "provider_api" && (cam.fetch as any)?.provider === "windy";
                      const providerSnapshot = providerSnapshots[cam.id] ?? null;
                      const snapUrlRaw = isSnapshot ? (cam.fetch as any).url : null;
                      const snapUrl = snapUrlRaw
                        ? `${snapUrlRaw}${snapUrlRaw.includes("?") ? "&" : "?"}t=${camRefreshTick}`
                        : isWindyProvider && providerSnapshot?.snapshotUrl
                        ? `${providerSnapshot.snapshotUrl}${
                            providerSnapshot.snapshotUrl.includes("?") ? "&" : "?"
                          }t=${camRefreshTick}`
                        : null;
                      const providerDetailUrl =
                        isWindyProvider && (cam.fetch as any)?.cameraKey
                          ? providerSnapshot?.detailUrl ?? `https://www.windy.com/webcams/${(cam.fetch as any).cameraKey}`
                          : null;
                      const openUrl = snapUrlRaw ?? providerDetailUrl;

                      const providerInfo =
                        cam.fetch?.kind === "provider_api"
                          ? `Provider: ${(cam.fetch as any).provider}`
                          : cam.providerId
                          ? `Provider: ${cam.providerId}`
                          : null;

                      const attribution = providerSnapshot?.attributionText ?? cam.usage?.attributionText ?? null;
                      const snapshotState =
                        snapUrl
                          ? "Snapshot disponible"
                          : isWindyProvider && providerSnapshot?.status === "loading"
                          ? "Consultando provider"
                          : openUrl
                          ? "Fuente externa"
                          : "Sin snapshot";
                      const snapshotStateClass = snapUrl
                        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/80"
                        : isWindyProvider && providerSnapshot?.status === "loading"
                        ? "border-white/10 bg-white/5 text-white/60"
                        : openUrl
                        ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100/75"
                        : "border-amber-300/20 bg-amber-400/10 text-amber-100/75";

                      return (
                        <div
                          key={cam.id}
                          className={cn(
                            "rounded-2xl border p-3 transition-colors",
                            isNearest
                              ? "border-cyan-300/25 bg-cyan-400/[0.055]"
                              : "border-white/10 bg-white/5"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              {visualMediaAllowed ? (
                                <CameraThumb src={snapUrl ?? ""} alt={title} />
                              ) : (
                                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-1 text-center">
                                  <ShieldCheck className="h-4 w-4 text-emerald-200/55" />
                                  <span className="text-[9px] leading-tight text-white/40">Vista oculta</span>
                                </div>
                              )}

                              <div className="min-w-0">
                                {isNearest ? (
                                  <div className="mb-1 inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/80">
                                    Cámara más cercana
                                  </div>
                                ) : null}
                                <div className="text-sm font-semibold text-white/90 line-clamp-2">{title}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", snapshotStateClass)}>
                                    {snapshotState}
                                  </span>
                                  {isWindyProvider ? (
                                    <span className="inline-flex rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100/75">
                                      Windy API
                                    </span>
                                  ) : isSnapshot ? (
                                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/55">
                                      Imagen directa
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-[11px] text-white/45">
                                  <span className="text-white/55">{dist}</span>
                                  {locality ? (
                                    <>
                                      <span className="mx-2 text-white/20">•</span>
                                      <span>{locality}</span>
                                    </>
                                  ) : null}
                                </div>

                                {cam.description ? (
                                  <div className="mt-2 text-sm text-white/60 leading-relaxed line-clamp-2">
                                    {cam.description}
                                  </div>
                                ) : null}

                                <div className="mt-2 text-[11px] text-white/35">
                                  {providerInfo ? <span>{providerInfo}</span> : null}
                                  {providerInfo && attribution ? <span className="mx-2 text-white/20">•</span> : null}
                                  {attribution ? <span>{attribution}</span> : null}
                                </div>

                                {isWindyProvider && providerSnapshot?.status === "loading" ? (
                                  <div className="mt-2 text-[11px] text-white/35">Cargando snapshot...</div>
                                ) : null}
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col gap-2">
                              {openUrl ? (
                                <a
                                  href={openUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    "inline-flex items-center gap-2",
                                    "px-3 py-2 rounded-xl border border-white/10 bg-black/20",
                                    "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                  )}
                                  title={isWindyProvider ? "Abrir fuente" : "Abrir snapshot"}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  <span className="text-xs font-medium">Abrir</span>
                                </a>
                              ) : (
                                <div className="px-3 py-2 rounded-xl border border-white/10 bg-black/20 text-xs text-white/55">
                                  Sin URL
                                </div>
                              )}
                            </div>
                          </div>

                          {guardianCanCaptureSource ? (
                            <div className="mt-3">
                              <GuardianSourceButton
                                onClick={() =>
                                  beginGuardianSourceObservation({
                                    label: title,
                                    sourceType: "camera",
                                    sourceReference: openUrl ?? `Cámara ${cam.id}`,
                                    observedAt: new Date().toISOString(),
                                    limitations:
                                      "La referencia apunta a una cámara externa que puede actualizarse o dejar de estar disponible. BioPulse no conserva el archivo visual; describir sólo lo visible al momento de observar.",
                                  })
                                }
                              />
                            </div>
                          ) : null}

                          {visualMediaAllowed && (isSnapshot || isWindyProvider) ? (
                            <CameraSnapshotPreview src={snapUrl ?? ""} alt={title} />
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white/85">Últimos reportes Guardian</div>
                      <div className="text-xs text-white/40">Observaciones locales vinculadas a cámaras de este evento.</div>
                    </div>
                    <div className="inline-flex w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/55">
                      {cameraGuardianObservations.length} locales
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {cameraGuardianObservations.length > 0 ? (
                      cameraGuardianObservations.slice(0, 3).map((observation) => (
                        <div key={observation.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-white/75 line-clamp-2">{observation.observedText}</div>
                            <div className="shrink-0 text-[11px] text-white/35">
                              {fmtDateTimeUTC(new Date(observation.recordedAt))}
                            </div>
                          </div>
                          {observation.sourceReference ? (
                            <div className="mt-1 text-[11px] text-white/35 line-clamp-1">{observation.sourceReference}</div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-3 text-sm text-white/45">
                        Todavía no hay reportes locales sobre cámaras para este evento.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 text-[11px] text-white/30">
                  Nota: si el registry está en <span className="font-mono">public/</span>, Vercel lo sirve directo.
                  Luego conectamos providers reales (vialidad/municipios/alertcalifornia/etc.) sin cambiar este bloque.
                </div>
              </div>
            </SectionShell>
            ) : null}

            {/* Historial del evento */}
            {activeSection === "timeline" ? (
            <SectionShell
              icon={<History className="h-5 w-5 text-cyan-200" />}
              title="Historial del evento"
              subtitle="Cronología de señales y observaciones conservadas por BioPulse."
              right={
                <div className="hidden sm:inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-cyan-100/90">
                  <span className="text-xs font-semibold">
                    {visibleTimelineEntries.length} {visibleTimelineEntries.length === 1 ? "punto" : "puntos"}
                  </span>
                </div>
              }
            >
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <div className="border-b border-cyan-300/10 bg-cyan-400/[0.04] px-4 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-cyan-100/90">Historia viva preliminar</div>
                      <div className="mt-1 text-xs leading-relaxed text-white/45">
                        Reconstrucción operativa basada en observaciones normalizadas, evidencia conservada e
                        inferencias separadas. No reemplaza confirmación oficial.
                      </div>
                    </div>
                    <span className="self-start rounded-full border border-cyan-300/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-100/70">
                      Observation v1
                    </span>
                  </div>

                  {eventStoryEvidence.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {eventStoryEvidence.map((item) => (
                        <div key={item} className="flex gap-2 text-xs leading-relaxed text-white/60">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/70" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/15 p-3 text-xs text-white/45">
                      Todavía no hay evidencia suficiente para construir un relato operativo.
                    </div>
                  )}

                  {eventStoryUnknowns.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] p-3 text-xs leading-relaxed text-amber-50/60">
                      Falta confirmar: {eventStoryUnknowns.join(", ")}.
                    </div>
                  ) : null}
                </div>

                <div
                  className={cn(
                    "border-b px-4 py-3 text-xs leading-relaxed",
                    normalizedObservationCount > 0 || hasComparableHistory
                      ? "border-cyan-300/15 bg-cyan-400/[0.05] text-cyan-100/70"
                      : "border-white/10 bg-white/[0.03] text-white/50"
                  )}
                >
                  {normalizedObservationCount > 0
                    ? `BioPulse conserva ${normalizedObservationCount} observaciones normalizadas y mantiene ${normalizedInferenceCount} inferencias separadas para no mezclar evidencia con interpretación.`
                    : hasComparableHistory
                    ? guardianObservations.length > 0
                      ? "BioPulse muestra señales del evento junto con memoria Guardian local conservada en este dispositivo."
                      : "BioPulse conserva más de un momento comparable para este evento."
                    : guardianObservations.length > 0
                    ? "La cronología incluye memoria Guardian local, pero todavía conserva pocas señales instrumentales comparables."
                    : "Este evento solo conserva una observación comparable. Todavía no puede mostrarse una evolución temporal."}
                </div>

                {normalizedObservationCount > 0 ? (
                  <div className="border-b border-white/10 bg-white/[0.025] px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white/85">Registro de evidencia normalizada</div>
                        <div className="mt-1 max-w-2xl text-xs leading-relaxed text-white/45">
                          Cada observación conserva fuente, evidencia, confianza, verificación y cautelas narrativas.
                          Las inferencias permanecen separadas para no convertir interpretación en hecho.
                        </div>
                      </div>
                      <span className="self-start rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white/55">
                        {visibleObservationLedger.length} visibles
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                      <div className="rounded-xl border border-cyan-300/10 bg-cyan-400/[0.04] p-3">
                        <div className="text-[10px] uppercase tracking-wide text-white/35">Satélite</div>
                        <div className="mt-1 text-lg font-semibold text-white/85">
                          {eventObservationBundle.sourceCounts.firms}
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-300/10 bg-emerald-400/[0.04] p-3">
                        <div className="text-[10px] uppercase tracking-wide text-white/35">Guardian</div>
                        <div className="mt-1 text-lg font-semibold text-white/85">
                          {eventObservationBundle.sourceCounts.guardian}
                        </div>
                      </div>
                      <div className="rounded-xl border border-violet-300/10 bg-violet-400/[0.04] p-3">
                        <div className="text-[10px] uppercase tracking-wide text-white/35">Noticias</div>
                        <div className="mt-1 text-lg font-semibold text-white/85">
                          {eventObservationBundle.sourceCounts.news + eventObservationBundle.sourceCounts.officialReferences}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                        <div className="text-[10px] uppercase tracking-wide text-white/35">Cámaras</div>
                        <div className="mt-1 text-lg font-semibold text-white/85">
                          {eventObservationBundle.sourceCounts.cameras}
                        </div>
                      </div>
                      <div className="rounded-xl border border-sky-300/10 bg-sky-400/[0.04] p-3">
                        <div className="text-[10px] uppercase tracking-wide text-white/35">Clima</div>
                        <div className="mt-1 text-lg font-semibold text-white/85">
                          {eventObservationBundle.sourceCounts.weather}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {visibleObservationLedger.map((observation) => {
                        const confidence =
                          observationConfidenceMeta[observation.confidence.level] ?? observationConfidenceMeta.unknown;
                        const artifactCount = observation.evidence.artifacts?.length ?? 0;
                        const measurementCount = Object.values(observation.evidence.measurements ?? {}).filter(
                          (value) => value !== null && value !== undefined && value !== ""
                        ).length;
                        const providerLine = [observation.source.provider, observation.source.attribution]
                          .filter(Boolean)
                          .join(" · ");
                        const limitation =
                          observation.evidence.limitations?.[0] ?? observation.narrativeUse.caution ?? null;

                        return (
                          <div
                            key={observation.id}
                            className="rounded-xl border border-white/10 bg-black/20 p-3"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/60">
                                    {observationTypeLabel(observation)}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                      confidence.className
                                    )}
                                  >
                                    Confianza {confidence.label}
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[10px] font-semibold text-white/45">
                                    {observationStatusLabel[observation.status]}
                                  </span>
                                </div>

                                <div className="mt-2 text-sm font-semibold text-white/80 line-clamp-2">
                                  {observation.source.name}
                                </div>
                                {providerLine ? (
                                  <div className="mt-1 text-[11px] text-white/35 line-clamp-1">{providerLine}</div>
                                ) : null}
                              </div>
                              <div className="shrink-0 text-[11px] text-white/35">
                                {observationDateLabel(observation)}
                              </div>
                            </div>

                            <div className="mt-2 text-xs leading-relaxed text-white/55">
                              {observation.evidence.summary}
                            </div>

                            <div className="mt-3 grid gap-2 text-[11px] text-white/42 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <span className="text-white/30">Origen:</span> {observationOriginLabel(observation)}
                              </div>
                              <div>
                                <span className="text-white/30">Evidencia:</span> {artifactCount} enlaces ·{" "}
                                {measurementCount} métricas
                              </div>
                              <div>
                                <span className="text-white/30">Verificación:</span>{" "}
                                {observationVerificationLabel[observation.verification.status]}
                              </div>
                              <div>
                                <span className="text-white/30">Ubicación:</span> {observationLocationLabel(observation)}
                              </div>
                            </div>

                            {limitation ? (
                              <div className="mt-2 rounded-lg border border-amber-300/10 bg-amber-400/[0.045] px-3 py-2 text-[11px] leading-relaxed text-amber-50/55">
                                Cautela: {limitation}
                              </div>
                            ) : null}

                            {observation.source.url ? (
                              <a
                                href={observation.source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100/70 hover:text-cyan-100"
                              >
                                Abrir fuente <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {normalizedObservationCount > visibleObservationLedger.length ? (
                      <div className="mt-3 text-[11px] leading-relaxed text-white/35">
                        Mostrando las {visibleObservationLedger.length} observaciones más recientes de{" "}
                        {normalizedObservationCount}. El contrato conserva el resto para Historia Viva.
                      </div>
                    ) : null}

                    {eventObservationBundle.inferences.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-fuchsia-300/15 bg-fuchsia-400/[0.045] p-3">
                        <div className="text-xs font-semibold text-fuchsia-100/80">
                          Inferencias separadas de la evidencia
                        </div>
                        <div className="mt-2 space-y-2">
                          {eventObservationBundle.inferences.slice(0, 3).map((inference) => (
                            <div key={inference.id} className="text-xs leading-relaxed text-fuchsia-50/58">
                              {inference.statement}{" "}
                              <span className="text-fuchsia-50/35">({inference.caution})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {visibleTimelineEntries.length > 0 ? (
                  <div className="relative px-4 py-2">
                    <div className="absolute bottom-5 left-[25px] top-5 w-px bg-white/10" />
                    {visibleTimelineEntries.map((entry, index) => (
                      <div key={entry.id} className="relative flex gap-4 py-3">
                        <div
                          className={cn(
                            "relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2",
                            index === visibleTimelineEntries.length - 1
                              ? "border-cyan-200 bg-cyan-400/70"
                              : "border-white/30 bg-[#0b111d]"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="text-sm font-semibold text-white/80">{entry.title}</div>
                            <div className="text-[11px] text-white/40">{fmtDateTimeUTC(entry.date)}</div>
                          </div>
                          <div className="mt-1 text-xs leading-relaxed text-white/50">{entry.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-white/50">
                    No hay puntos temporales válidos disponibles para este evento.
                  </div>
                )}

                {guardianObservations.length > 0 ? (
                  <div className="border-t border-emerald-300/10 bg-emerald-400/[0.035] px-4 py-3 text-[11px] leading-relaxed text-emerald-50/55">
                    Memoria Guardian local: {guardianObservations.length}{" "}
                    {guardianObservations.length === 1 ? "observación privada" : "observaciones privadas"} vinculadas
                    a este evento en este dispositivo. No constituyen confirmación oficial.
                  </div>
                ) : null}

                <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/35">
                  {event.stale
                    ? "El evento está marcado como desactualizado; esto no significa que haya finalizado."
                    : "La cronología refleja únicamente los puntos conservados y no garantiza observación continua."}
                </div>
              </div>
            </SectionShell>
            ) : null}
          </div>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(panel, document.body) : panel;
}
