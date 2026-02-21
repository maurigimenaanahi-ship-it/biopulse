import { useEffect, useMemo, useRef, useState } from "react";
import type { EnvironmentalEvent } from "@/data/events";
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
  Image as ImageIcon,
} from "lucide-react";

type AlertPanelProps = {
  event: EnvironmentalEvent | null;
  onClose: () => void;
};

const WORKER_BASE = "https://square-frost-5487.maurigimenaanahi.workers.dev";

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
    | { kind: "provider_api"; provider: string; cameraKey: string }
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

// ---------- Worker clients ----------
async function fetchNewsFromWorker(params: { query: string; days: number; max: number }) {
  const url =
    `${WORKER_BASE}/news` +
    `?query=${encodeURIComponent(params.query)}` +
    `&days=${encodeURIComponent(String(params.days))}` +
    `&max=${encodeURIComponent(String(params.max))}`;

  const res = await fetch(url);
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

async function reverseGeocodeViaWorker(lat: number, lon: number): Promise<string | null> {
  const url = `${WORKER_BASE}/reverse-geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = (await res.json()) as ReverseGeocodeResponse;
  const label = data?.label ?? null;
  return label && typeof label === "string" ? label : null;
}

// ---------- Weather fetch (Open-Meteo, sin key) ----------
async function fetchCurrentWeatherOpenMeteo(lat: number, lon: number): Promise<WeatherCurrent> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m` +
    `&timezone=UTC`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
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
async function fetchCameraRegistry(): Promise<CameraRegistryItem[]> {
  const candidates = [
    "/cameraRegistry.json",
    "/cameraRegistry.sample.json",
    "/cameraregistry.sample.json",
  ];

  let lastErr: any = null;

  for (const path of candidates) {
    try {
      const res = await fetch(path, { headers: { Accept: "application/json" } });
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

// ---------- UI helpers ----------
function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDateTimeUTC(d: Date) {
  return `${pad2(d.getUTCDate())} ${d
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase()} ${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
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

function parseDetectionsFromTitle(title?: string) {
  const s = String(title ?? "");
  const m = s.match(/\((\d+)\s*detections?\)/i);
  const n = m ? Number(m[1]) : null;
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

function isOfficialItem(it: NewsItem) {
  return domainIsOfficial(it.domain) || textLooksOfficial(it.title, it.summary);
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

  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(sLat1) * Math.cos(sLat2) * Math.sin(dLon / 2) ** 2;

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
      <div className="shrink-0 h-16 w-16 rounded-xl overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
        <ImageIcon className="h-5 w-5 text-white/35" />
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
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
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

export function AlertPanel({ event, onClose }: AlertPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!event) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [event?.id]);

  // ====== NEWS state ======
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsErr, setNewsErr] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsMeta, setNewsMeta] = useState<{ query: string; fetchedAt?: string; placeUsed?: string } | null>(null);
  const [newsView, setNewsView] = useState<"main" | "official" | "regional">("main");
  const [placeCache, setPlaceCache] = useState<Record<string, string>>({});

  // ====== WEATHER state ======
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherCurrent | null>(null);

  // ====== CAMERAS state ======
  const [camLoading, setCamLoading] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [camRegistry, setCamRegistry] = useState<CameraRegistryItem[]>([]);
  const [camRadiusKm, setCamRadiusKm] = useState<number>(60);
  const [camRefreshTick, setCamRefreshTick] = useState<number>(0);

  const trend = useMemo(() => (event ? guessTrendLabel(event) ?? "TREND: —" : "TREND: —"), [event?.id]);

  const { frpMax, frpSum } = useMemo(() => parseFRPFromDescription(event?.description), [event?.description]);
  const detections = useMemo(() => parseDetectionsFromTitle(event?.title), [event?.title]);

  const intensityLevel = useMemo(() => levelFromFRPMax(frpMax), [frpMax]);
  const activityLevel = useMemo(() => levelFromDetections(detections), [detections]);
  const energyLevel = useMemo(() => levelFromFRPSum(frpSum), [frpSum]);

  async function ensureNewsPlace(ev: EnvironmentalEvent): Promise<string> {
    const cached = placeCache[String(ev.id)];
    if (cached) return cached;

    const loc = (ev.location ?? "").trim();

    if (loc && !isGenericLocation(loc)) {
      setPlaceCache((p) => ({ ...p, [String(ev.id)]: loc }));
      return loc;
    }

    const place = await reverseGeocodeViaWorker(ev.latitude, ev.longitude);
    const finalPlace = (place ?? loc ?? "").trim();
    const safe = finalPlace && !isGenericLocation(finalPlace) ? finalPlace : `Argentina`;

    setPlaceCache((p) => ({ ...p, [String(ev.id)]: safe }));
    return safe;
  }

  const loadNews = async () => {
    if (!event) return;
    setNewsLoading(true);
    setNewsErr(null);

    try {
      const place = await ensureNewsPlace(event);
      const query = buildNewsQueryFromPlace(event, place);

      const data = await fetchNewsFromWorker({
        query,
        days: event.category === "fire" ? 10 : 14,
        max: 12,
      });

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
      setNewsMeta({ query: data.query ?? query, fetchedAt: data.fetched_at, placeUsed: place });
    } catch (e: any) {
      setNewsItems([]);
      setNewsMeta(null);
      setNewsErr(e?.message ? String(e.message) : "No se pudo cargar noticias.");
    } finally {
      setNewsLoading(false);
    }
  };

  const loadWeather = async () => {
    if (!event) return;
    setWeatherLoading(true);
    setWeatherErr(null);

    try {
      const w = await fetchCurrentWeatherOpenMeteo(event.latitude, event.longitude);
      setWeather(w);
    } catch (e: any) {
      setWeather(null);
      setWeatherErr(e?.message ? String(e.message) : "No se pudo cargar clima.");
    } finally {
      setWeatherLoading(false);
    }
  };

  const loadCameraRegistry = async () => {
    setCamLoading(true);
    setCamErr(null);
    try {
      const items = await fetchCameraRegistry();
      setCamRegistry(items);
    } catch (e: any) {
      setCamRegistry([]);
      setCamErr(e?.message ? String(e.message) : "No se pudo cargar cámaras.");
    } finally {
      setCamLoading(false);
    }
  };

  useEffect(() => {
    if (!event) return;
    setNewsView("main");
    loadNews();
    loadWeather();
    loadCameraRegistry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  useEffect(() => {
    // permite re-cargar snapshots (cache bust)
  }, [camRefreshTick]);

  const splitNews = useMemo(() => {
    const items = Array.isArray(newsItems) ? newsItems : [];
    const official = items.filter((it) => (domainIsOfficial(it.domain) || textLooksOfficial(it.title, it.summary)));
    const regional = items.filter((x) => !(domainIsOfficial(x.domain) || textLooksOfficial(x.title, x.summary)));
    return { official, regional };
  }, [newsItems]);

  const sirenActive = useMemo(() => {
    return splitNews.official.some(isEvacuationRelevant);
  }, [splitNews.official]);

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

  if (!event) return null;

  const chip = sevChip(event.severity);

  const rainText = weather?.precipitation == null ? "—" : `${weather.precipitation.toFixed(1)} mm`;
  const windText = weather?.wind_speed_10m == null ? "—" : `${weather.wind_speed_10m.toFixed(0)} km/h`;
  const humText = weather?.relative_humidity_2m == null ? "—" : `${weather.relative_humidity_2m.toFixed(0)}%`;
  const tempText = weather?.temperature_2m == null ? "—" : `${weather.temperature_2m.toFixed(1)}°C`;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[10050]">
      <div className="absolute inset-0 bg-black/60 z-0" onClick={onClose} />

      <div
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
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onClose}
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

            <div className="flex items-center gap-2">
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

            {/* Noticias */}
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
                                    <NewsThumb src={it.image ?? ""} alt={it.title ?? "Imagen"} />
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
                                    <NewsThumb src={it.image ?? ""} alt={it.title ?? "Imagen"} />
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

            {/* Cámaras en vivo (BLOQUE NUEVO) */}
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
                      Tip: asegurate de tener el JSON en <span className="font-semibold">/public</span> (ej. <span className="font-mono">public/cameraRegistry.sample.json</span>)
                    </div>
                  </div>
                ) : null}

                {/* Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/45 flex items-center gap-2">
                    <MapPin className="h-4 w-4 opacity-70" />
                    Centro: <span className="text-white/55 normal-case">{event.latitude.toFixed(3)}, {event.longitude.toFixed(3)}</span>
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

                {/* List */}
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
                      const locality =
                        cam.coverage?.locality || cam.coverage?.admin1 || cam.coverage?.countryISO2 || "";
                      const dist = `${cam.distanceKm.toFixed(1)} km`;
                      const isSnapshot = cam.fetch?.kind === "image_url" && typeof (cam.fetch as any)?.url === "string";
                      const snapUrlRaw = isSnapshot ? (cam.fetch as any).url : null;
                      const snapUrl = snapUrlRaw ? `${snapUrlRaw}${snapUrlRaw.includes("?") ? "&" : "?"}t=${camRefreshTick}` : null;

                      const providerInfo =
                        cam.fetch?.kind === "provider_api"
                          ? `Provider: ${(cam.fetch as any).provider}`
                          : cam.providerId
                          ? `Provider: ${cam.providerId}`
                          : null;

                      const attribution = cam.usage?.attributionText ?? null;

                      return (
                        <div key={cam.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <CameraThumb src={snapUrl ?? ""} alt={title} />

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
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col gap-2">
                              {isSnapshot && snapUrlRaw ? (
                                <a
                                  href={snapUrlRaw}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    "inline-flex items-center gap-2",
                                    "px-3 py-2 rounded-xl border border-white/10 bg-black/20",
                                    "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                  )}
                                  title="Abrir snapshot"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  <span className="text-xs font-medium">Abrir</span>
                                </a>
                              ) : cam.fetch?.kind === "provider_api" ? (
                                <button
                                  onClick={() => {
                                    // Por ahora: no hay URL real. Esto queda para cuando conectemos provider.
                                    // Igual dejamos una acción que te lleve a la sección de noticias oficiales (o nada).
                                    setNewsView("official");
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-2",
                                    "px-3 py-2 rounded-xl border border-white/10 bg-black/20",
                                    "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                  )}
                                  title="Provider API (pendiente)"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  <span className="text-xs font-medium">Fuente</span>
                                </button>
                              ) : (
                                <div className="px-3 py-2 rounded-xl border border-white/10 bg-black/20 text-xs text-white/55">
                                  Sin URL
                                </div>
                              )}
                            </div>
                          </div>

                          {isSnapshot && snapUrl ? (
                            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                              <img
                                src={snapUrl}
                                alt={title}
                                className="w-full max-h-[260px] object-cover"
                                loading="lazy"
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-4 text-[11px] text-white/30">
                  Nota: si el registry está en <span className="font-mono">public/</span>, Vercel lo sirve directo.
                  Luego conectamos providers reales (ej. alertcalifornia) sin cambiar este bloque.
                </div>
              </div>
            </SectionShell>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
