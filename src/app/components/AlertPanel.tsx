// AlertPanel.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { EnvironmentalEvent } from "@/data/events";
import { GuardianMissionPanel, type GuardianMissionTemplate } from "@/app/components/GuardianMissionPanel";
import { GuardianObservationForm } from "@/app/components/GuardianObservationForm";
import {
  prepareGuardianEvent,
  readGuardianLocalStore,
  removeGuardianEvent,
  removeGuardianObservation,
  setGuardianExposurePreference,
  type GuardianExposurePreference,
  type GuardianLocalStore,
  type GuardianMission,
  type GuardianObservation,
} from "@/app/lib/guardianStore";
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
} from "lucide-react";

type AlertPanelProps = {
  event: EnvironmentalEvent | null;
  onClose: () => void;
};

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

// ---------- News types ----------
type NewsItem = {
  id: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  language: string | null;
  publishedAt: string | null;
  sourceCountry: string | null;
  image: string | null;
  summary: string | null;
};

type NewsResponse = {
  query: string;
  count: number;
  items: NewsItem[];
  range?: { days: number; start: string; end: string };
  gdelt?: any;
  fetched_at?: string;
};

// ---------- Weather types (Open-Meteo current) ----------
type WeatherCurrent = {
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  precipitation: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
  time: string | null;
};

type WeatherResponse = {
  latitude?: number;
  longitude?: number;
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
};

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

// ---------- Cameras (biopulse.camera.v1) ----------
type CameraRegistryItem = {
  schema: "biopulse.camera.v1";
  id: string;
  providerId?: string;
  title?: string;
  description?: string;
  geo: { lat: number; lon: number };
  coverage?: { countryISO2?: string; admin1?: string; locality?: string };
  mediaType?: "snapshot" | "video" | "stream";
  fetch:
    | { kind: "image_url"; url: string }
    | { kind: "provider_api"; provider: string; cameraKey: string; endpoint?: string }
    | { kind: string; [k: string]: any };
  update?: { expectedIntervalSec?: number };
  usage?: { isPublic?: boolean; attributionText?: string; termsUrl?: string };
  tags?: string[];
  priority?: number;
  validation?: { status?: "pending" | "verified" | "rejected"; verifiedBy?: string; verifiedAt?: string };
  createdAt?: string;
  updatedAt?: string;
};

type LoadedCamera = CameraRegistryItem & { distanceKm: number };

type ProviderCameraSnapshot = {
  status: "loading" | "ready" | "error";
  snapshotUrl?: string | null;
  detailUrl?: string | null;
  attributionText?: string | null;
  message?: string;
};

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
  const { locality, state, country } = normalizePlaceForQuery(place);

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

  const placeBlock = [
    locality ? `"${locality}"` : null,
    state ? `"${state}"` : null,
    country ? `"${country}"` : null,
    locality ? `${locality}` : null,
    state ? `${state}` : null,
    country ? `${country}` : null,
  ]
    .filter(Boolean)
    .join(" OR ");

  return `(${placeBlock}) AND ${hazard}`;
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
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 rounded-xl border border-white/10 bg-black/20 flex items-center justify-center">
            {icon}
          </div>
          <div>
            <div className="text-white/90 font-semibold">{title}</div>
            {subtitle ? <div className="text-xs text-white/45 mt-0.5">{subtitle}</div> : null}
          </div>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
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
  const newsAbortRef = useRef<AbortController | null>(null);
  const weatherAbortRef = useRef<AbortController | null>(null);
  const cameraAbortRef = useRef<AbortController | null>(null);
  const protectedContextAbortRef = useRef<AbortController | null>(null);
  const criticalInfrastructureAbortRef = useRef<AbortController | null>(null);
  const nearbyCommunitiesAbortRef = useRef<AbortController | null>(null);
  const waterContextAbortRef = useRef<AbortController | null>(null);
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [guardianStore, setGuardianStore] = useState<GuardianLocalStore>(() => readGuardianLocalStore());
  const [guardianStorageErr, setGuardianStorageErr] = useState<string | null>(null);
  const [guardianVisualConsent, setGuardianVisualConsent] = useState(false);
  const [guardianDeletePending, setGuardianDeletePending] = useState(false);
  const [guardianObservationDeleteId, setGuardianObservationDeleteId] = useState<string | null>(null);

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
  }, [event?.id]);

  useEffect(() => {
    if (!event) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [event?.id, onClose]);

  // ====== NEWS state ======
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsErr, setNewsErr] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsMeta, setNewsMeta] = useState<{ query: string; fetchedAt?: string; placeUsed?: string } | null>(null);
  const [newsLimited, setNewsLimited] = useState(false);
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
      const cleaned = items
        .filter((x) => x && (x.title || x.url))
        .map((x) => ({
          ...x,
          title: x.title?.trim() ?? null,
          summary: x.summary?.trim() ?? null,
          image: x.image?.trim() ?? null,
        }));

      setNewsItems(cleaned);
      setNewsLimited(data?.gdelt?.ok === false || Number(data?.gdelt?.status) === 429);
      setNewsMeta({ query: data.query ?? query, fetchedAt: data.fetched_at, placeUsed: place });
    } catch (e: any) {
      if (isAbortError(e)) return;
      setNewsItems([]);
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

    return () => {
      newsAbortRef.current?.abort();
      weatherAbortRef.current?.abort();
      cameraAbortRef.current?.abort();
      protectedContextAbortRef.current?.abort();
      criticalInfrastructureAbortRef.current?.abort();
      nearbyCommunitiesAbortRef.current?.abort();
      waterContextAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const splitNews = useMemo(() => {
    const items = Array.isArray(newsItems) ? newsItems : [];
    const official = items.filter((it) => domainIsOfficial(it.domain) || textLooksOfficial(it.title, it.summary));
    const regional = items.filter((x) => !(domainIsOfficial(x.domain) || textLooksOfficial(x.title, x.summary)));
    return { official, regional };
  }, [newsItems]);

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
  const guardianEventMemory = guardianStore.events[event.id] ?? null;
  const guardianObservations = (guardianEventMemory?.observationIds ?? [])
    .map((id) => guardianStore.observations[id])
    .filter((observation): observation is GuardianObservation => Boolean(observation))
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
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
  const visualMediaAllowed =
    guardianExposure === "general_images" || (guardianExposure === "ask_first" && guardianVisualConsent);
  const hasInstrumentalFireData =
    satelliteDetections != null || satelliteFrpMax != null || satelliteFrpSum != null || Boolean(event.liveFeedUrl);
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
        : newsItems.length > 0
        ? `${newsItems.length} referencias regionales recuperadas.`
        : "La consulta terminó sin resultados útiles.",
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
    },
    {
      id: "guardians",
      label: "Guardianes",
      icon: <Users className="h-4 w-4 text-emerald-200/65" />,
      state: guardianEventMemory ? "local" : "not_connected",
      detail: guardianEventMemory
        ? "Espacio privado preparado en este dispositivo; sin sincronización externa."
        : "Observaciones de Guardianes todavía no conectadas.",
    },
  ];
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

  timelineEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
  const visibleTimelineEntries =
    timelineEntries.length > 8 ? [...timelineEntries.slice(0, 1), ...timelineEntries.slice(-7)] : timelineEntries;
  const hasComparableHistory = visibleTimelineEntries.length > 1;

  const panel = (
    <div className="pointer-events-auto fixed inset-0 z-[10050]">
      <div className="absolute inset-0 bg-black/60 z-0" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Alerta: ${event.location}`}
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
                if (newsView !== "main") setNewsView("main");
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

            {/* Cobertura de fuentes */}
            <SectionShell
              icon={<Activity className="h-5 w-5 text-cyan-200" />}
              title="Cobertura de fuentes"
              subtitle="Estado de las fuentes consultadas para este evento. Disponibilidad no implica confirmación del impacto."
              right={
                <div className="hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/60">
                  <span className="text-xs font-semibold">{sourceCoverageItems.length} capas auditadas</span>
                </div>
              }
            >
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
                  {sourceCoverageItems.map((source, index) => {
                    const meta = sourceCoverageMeta[source.state];
                    return (
                      <div
                        key={source.id}
                        className={cn(
                          "min-w-0 px-4 py-3",
                          index >= 2 && "sm:border-t sm:border-white/10",
                          index >= 3 && "lg:border-t lg:border-white/10",
                          index === 2 && "sm:border-l-0 lg:border-l"
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
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/35">
                  “No conectada”, “sin resultados” y “limitada” describen situaciones diferentes y no deben interpretarse como ausencia del fenómeno.
                </div>
              </div>
            </SectionShell>

            {/* Guardian local */}
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
                </div>

                {guardianEventMemory ? (
                  <>
                    <GuardianMissionPanel
                      eventId={event.id}
                      templates={guardianMissionTemplates}
                      activeMission={activeGuardianMission}
                      linkedObservationCount={activeMissionObservationCount}
                      recentMissions={previousGuardianMissions}
                      onStoreChange={(store) => {
                        setGuardianStore(store);
                        setGuardianStorageErr(null);
                      }}
                    />

                    <GuardianObservationForm
                      eventId={event.id}
                      exposure={guardianExposure}
                      missionId={activeGuardianMission?.id}
                      missionTitle={activeGuardianMission?.title}
                      onSaved={(store) => {
                        setGuardianStore(store);
                        setGuardianStorageErr(null);
                      }}
                    />

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
                  </>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] leading-relaxed text-white/35">
                    Trabajo privado guardado en este dispositivo. BioPulse no lo transmite ni lo publica.
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          setGuardianStore(prepareGuardianEvent(event.id));
                          setGuardianStorageErr(null);
                        } catch {
                          setGuardianStorageErr("No se pudo preparar el espacio Guardian en este dispositivo.");
                        }
                      }}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {guardianEventMemory ? "Registrar apertura" : "Preparar espacio privado"}
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
                            setGuardianStore(removeGuardianEvent(event.id));
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

            {/* Estado operativo */}
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
                      <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
                        <div>
                          <ImageIcon className="mx-auto h-7 w-7 text-white/30" />
                          <div className="mt-3 text-sm font-medium text-white/70">
                            Sin imagen satelital disponible en BioPulse para este evento
                          </div>
                          <div className="mt-1 text-xs text-white/40">
                            Las métricas y el acceso a la fuente permanecen disponibles.
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
                  </div>
                </div>

                <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/40">
                  Datos instrumentales: NASA FIRMS / VIIRS cuando estén disponibles. Estas señales pueden tener demoras, cobertura parcial o falsos positivos.
                </div>
              </div>
            </SectionShell>

            {/* Qué protegemos aquí */}
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

            {/* Impacto humano */}
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

            {/* BioPulse Insight */}
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

            {/* ✅ Noticias (ARREGLADO / INCLUIDO) */}
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
                                No se encontraron noticias regionales con esta query.
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
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
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
                            No se encontraron noticias regionales con esta query.
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

            {/* Indicadores operativos */}
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
            <SectionShell
              icon={<Camera className="h-5 w-5 text-white/80" />}
              title="Cámaras en vivo"
              subtitle="Puntos cercanos para verificar visualmente la situación."
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

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
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
                    nearbyCameras.map((cam) => {
                      const title = cam.title ?? cam.id;
                      const locality = cam.coverage?.locality || cam.coverage?.admin1 || cam.coverage?.countryISO2 || "";
                      const dist = `${cam.distanceKm.toFixed(1)} km`;

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

                      return (
                        <div key={cam.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
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
                                <div className="text-sm font-semibold text-white/90 line-clamp-2">{title}</div>
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

                          {visualMediaAllowed && (isSnapshot || isWindyProvider) ? (
                            <CameraSnapshotPreview src={snapUrl ?? ""} alt={title} />
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-4 text-[11px] text-white/30">
                  Nota: si el registry está en <span className="font-mono">public/</span>, Vercel lo sirve directo.
                  Luego conectamos providers reales (vialidad/municipios/alertcalifornia/etc.) sin cambiar este bloque.
                </div>
              </div>
            </SectionShell>

            {/* Historial del evento */}
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
                <div
                  className={cn(
                    "border-b px-4 py-3 text-xs leading-relaxed",
                    hasComparableHistory
                      ? "border-cyan-300/15 bg-cyan-400/[0.05] text-cyan-100/70"
                      : "border-white/10 bg-white/[0.03] text-white/50"
                  )}
                >
                  {hasComparableHistory
                    ? "BioPulse conserva más de un momento comparable para este evento."
                    : "Este evento solo conserva una observación comparable. Todavía no puede mostrarse una evolución temporal."}
                </div>

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

                <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/35">
                  {event.stale
                    ? "El evento está marcado como desactualizado; esto no significa que haya finalizado."
                    : "La cronología refleja únicamente los puntos conservados y no garantiza observación continua."}
                </div>
              </div>
            </SectionShell>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(panel, document.body) : panel;
}
