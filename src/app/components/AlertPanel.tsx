import { useEffect, useMemo, useState } from "react";
import type { EnvironmentalEvent } from "@/data/events";
import { categoryLabels, categoryColors } from "@/data/events";

// ===== cameras registry + matching (Fase B - módulo visual) =====
import { cameraRegistry } from "@/data/cameras";
import { findNearestCameras } from "@/app/lib/findNearestCameras";
import type { CameraRecordV1 } from "@/data/cameras/types";

// ===== favorites (seguir alerta) =====
const FAV_KEY = "biopulse:followed-alerts";
function readFollowed(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function toggleFollow(id: string): string[] {
  const curr = new Set(readFollowed());
  if (curr.has(id)) curr.delete(id);
  else curr.add(id);
  const next = Array.from(curr);
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next;
}

// ===== helpers =====
function formatTimeUTC(d: Date) {
  const date = d instanceof Date ? d : new Date(d as any);
  return date.toUTCString();
}

function timeAgoFrom(d: Date) {
  const t = d instanceof Date ? d.getTime() : new Date(d as any).getTime();
  const diff = Date.now() - t;
  const sec = Math.max(0, Math.floor(diff / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day > 0) return `hace ${day} d`;
  if (hr > 0) return `hace ${hr} h`;
  if (min > 0) return `hace ${min} min`;
  return `recién`;
}

function km2(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `≈ ${(n / 1000).toFixed(1)}k km²`;
  return `≈ ${Math.round(n)} km²`;
}

function metric(value?: number, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}${suffix}`;
}

function statusLabel(s?: EnvironmentalEvent["status"]) {
  switch (s) {
    case "active":
      return "Active";
    case "contained":
      return "Contained";
    case "escalating":
      return "Escalating";
    case "stabilizing":
      return "Stabilizing";
    case "resolved":
      return "Resolved";
    default:
      return "Active";
  }
}

function fallbackSummary(ev: EnvironmentalEvent) {
  const cat = categoryLabels[ev.category] ?? ev.category;
  const sev = ev.severity;

  const parts: string[] = [];
  parts.push(`A ${sev} intensity ${cat.toLowerCase()} event was detected in ${ev.location}.`);

  const cond: string[] = [];
  if (typeof ev.windSpeed === "number") cond.push(`wind ${Math.round(ev.windSpeed)} km/h`);
  if (typeof ev.humidity === "number") cond.push(`humidity ${Math.round(ev.humidity)}%`);
  if (typeof ev.temperature === "number") cond.push(`temperature ${Math.round(ev.temperature)}°C`);
  if (typeof ev.waterLevel === "number") cond.push(`river level ${ev.waterLevel} m`);
  if (typeof ev.airQualityIndex === "number") cond.push(`AQI ${ev.airQualityIndex}`);

  if (cond.length) parts.push(`Current conditions: ${cond.join(" • ")}.`);

  if (ev.severity === "critical" || ev.severity === "high") {
    parts.push(`Risk of escalation is elevated. Continuous monitoring is recommended.`);
  } else {
    parts.push(`Monitoring continues as conditions evolve.`);
  }

  return parts.join(" ");
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtCoord(x: unknown, digits = 4) {
  return isFiniteNumber(x) ? x.toFixed(digits) : "—";
}

// ===== Extract helpers (Trend / FRP / detections) =====
type ExtractedOps = {
  trendLabel?: string;
  frpMax?: number;
  frpSum?: number;
  detections?: number;
};

function extractOpsFromDescription(desc?: string): ExtractedOps {
  const out: ExtractedOps = {};
  if (!desc || typeof desc !== "string") return out;

  // Trend: Intensifying / Stable / Weakening
  const mTrend = desc.match(/Trend:\s*([A-Za-z]+)/i);
  if (mTrend?.[1]) out.trendLabel = mTrend[1].trim();

  // FRP max 45.37 • FRP sum 105.00
  const mFrp = desc.match(/FRP\s*max\s*([0-9]+(?:\.[0-9]+)?)\s*.*FRP\s*sum\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (mFrp?.[1]) out.frpMax = Number(mFrp[1]);
  if (mFrp?.[2]) out.frpSum = Number(mFrp[2]);

  // detected 5 fire signals
  const mDet = desc.match(/detected\s+([0-9]+)\s+fire\s+signals?/i);
  if (mDet?.[1]) out.detections = Number(mDet[1]);

  return out;
}

function trendBadgeStyle(label?: string) {
  const t = (label ?? "").toLowerCase();
  if (t === "intensifying") return "border-red-400/30 bg-red-400/15 text-red-100";
  if (t === "weakening") return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
  if (t === "stable") return "border-amber-400/30 bg-amber-400/15 text-amber-100";
  return "border-white/10 bg-white/5 text-white/75";
}

// ===== Lectura del evento (humana) =====
type Trend = "intensifying" | "stable" | "weakening" | string;

function intensityHuman(frpMax?: number) {
  if (typeof frpMax !== "number" || !Number.isFinite(frpMax)) return "—";
  if (frpMax >= 80) return "Muy alta";
  if (frpMax >= 40) return "Alta";
  if (frpMax >= 15) return "Moderada";
  return "Baja";
}

function activityHuman(detections?: number, trend?: Trend, status?: any) {
  const t = (trend ?? "").toLowerCase();
  const s = (status ?? "").toLowerCase();

  if (s === "escalating" || t === "intensifying") return "En expansión";
  if (s === "stabilizing" || t === "stable") return "Sostenida";
  if (t === "weakening") return "En retroceso";

  if (typeof detections === "number" && Number.isFinite(detections)) {
    if (detections >= 20) return "Muy activa";
    if (detections >= 8) return "Activa";
    if (detections >= 3) return "Leve";
    return "Débil";
  }
  return "—";
}

function stateHuman(status?: any) {
  const s = (status ?? "").toLowerCase();
  if (s === "escalating") return "Escalando";
  if (s === "stabilizing") return "Estabilizándose";
  if (s === "contained") return "Contenido";
  if (s === "resolved") return "Resuelto";
  if (s === "active") return "Activo";
  return "Activo";
}

// ===== Gauge (Microsoft-ish) =====
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct(value?: number, maxForScale = 1) {
  if (typeof value !== "number" || !Number.isFinite(value) || maxForScale <= 0) return 0;
  return clamp((value / maxForScale) * 100, 0, 100);
}

function ringTone(p: number) {
  // sobrio pero informativo (no chillón)
  if (p >= 80) return { stroke: "rgba(248,113,113,0.85)", glow: "rgba(248,113,113,0.20)" }; // red-ish
  if (p >= 55) return { stroke: "rgba(251,146,60,0.85)", glow: "rgba(251,146,60,0.18)" }; // orange-ish
  if (p >= 30) return { stroke: "rgba(250,204,21,0.75)", glow: "rgba(250,204,21,0.12)" }; // amber-ish
  return { stroke: "rgba(110,231,183,0.75)", glow: "rgba(110,231,183,0.12)" }; // emerald-ish
}

function GaugeRing(props: {
  label: string;
  value?: number;
  max: number;
  valueFmt: (v?: number) => string;
  hint?: string;
  humanLine?: string;
}) {
  const { label, value, max, valueFmt, hint, humanLine } = props;
  const p = pct(value, max);
  const deg = (p / 100) * 270; // 270° arc
  const tone = ringTone(p);

  // ring: conic-gradient from 225° to cover 270° (semi-ish)
  const bg = `conic-gradient(from 225deg, ${tone.stroke} 0deg ${deg}deg, rgba(255,255,255,0.10) ${deg}deg 270deg, rgba(255,255,255,0) 270deg 360deg)`;

  // marker
  const markerDeg = 225 + deg;
  const rad = (markerDeg * Math.PI) / 180;
  const r = 42; // px
  const cx = 52;
  const cy = 52;
  const mx = cx + r * Math.cos(rad);
  const my = cy + r * Math.sin(rad);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-white/75 text-xs uppercase tracking-wider">{label}</div>
        {hint ? <div className="text-white/35 text-[11px]">{hint}</div> : null}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-[104px] w-[104px] shrink-0">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: bg,
              filter: `drop-shadow(0 0 18px ${tone.glow})`,
            }}
          />
          <div className="absolute inset-[10px] rounded-full bg-[#0a0f1a]/95 border border-white/10" />

          {/* marker dot */}
          <div
            className="absolute h-2.5 w-2.5 rounded-full border border-white/30"
            style={{
              left: mx - 5,
              top: my - 5,
              background: "rgba(255,255,255,0.85)",
              boxShadow: "0 0 10px rgba(255,255,255,0.12)",
            }}
          />

          {/* center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-white/90 text-lg font-semibold leading-none">{Math.round(p)}</div>
            <div className="text-white/35 text-[11px]">nivel</div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-white/90 text-xl font-semibold">{valueFmt(value)}</div>
          {humanLine ? <div className="mt-1 text-white/70 text-sm">{humanLine}</div> : null}
          <div className="mt-2 text-white/35 text-[11px]">
            Base: señal satelital + escala operativa (0–{max}).
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Weather (contexto operativo, no pronóstico general) =====
type WeatherOps = {
  windowLabel: string;
  rainProbMaxPct?: number; // 0..100
  windMaxKmh?: number; // km/h
  humidityMinPct?: number; // % (mín)
  tempAvgC?: number; // °C
  narrative: string;
};

function round1(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined;
}

function safeMax(arr?: Array<number | null>) {
  const xs = (arr ?? []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return undefined;
  return Math.max(...xs);
}

function safeMin(arr?: Array<number | null>) {
  const xs = (arr ?? []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return undefined;
  return Math.min(...xs);
}

function safeAvg(arr?: Array<number | null>) {
  const xs = (arr ?? []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return undefined;
  const s = xs.reduce((a, b) => a + b, 0);
  return s / xs.length;
}

function formatPct(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)}%` : "—";
}
function formatKmh(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)} km/h` : "—";
}
function formatC(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)}°C` : "—";
}

function weatherNarrative(input: {
  rainProbMaxPct?: number;
  windMaxKmh?: number;
  humidityMinPct?: number;
  tempAvgC?: number;
  trendLabel?: string;
}) {
  const r = input.rainProbMaxPct;
  const w = input.windMaxKmh;
  const h = input.humidityMinPct;

  const hasRain = typeof r === "number";
  const hasWind = typeof w === "number";
  const hasHum = typeof h === "number";

  const rainHelp =
    hasRain && r >= 60
      ? "Se esperan lluvias con probabilidad alta: podrían ayudar a frenar el avance del fuego."
      : hasRain && r >= 30
      ? "Hay chances moderadas de lluvia: podrían aliviar parcialmente, pero no garantizan contención."
      : hasRain
      ? "Baja probabilidad de lluvia: el incendio podría sostenerse si las condiciones siguen secas."
      : "Sin datos de lluvia por ahora.";

  const windRisk =
    hasWind && w >= 35
      ? "Vientos fuertes: aumentan el riesgo de propagación y cambios bruscos de dirección."
      : hasWind && w >= 20
      ? "Viento moderado: puede favorecer el avance del frente si el combustible está seco."
      : hasWind
      ? "Viento débil: menor empuje para la propagación, aunque el fuego puede persistir."
      : "Sin datos de viento por ahora.";

  const dryness =
    hasHum && h <= 25
      ? "Aire muy seco: el entorno favorece ignición y reactivaciones."
      : hasHum && h <= 40
      ? "Humedad baja: condiciones favorables para mantener actividad del fuego."
      : hasHum
      ? "Humedad relativamente alta: podría ayudar a moderar la actividad."
      : "Sin datos de humedad por ahora.";

  const t = (input.trendLabel ?? "").toLowerCase();
  const trendHint =
    t === "intensifying"
      ? "Además, la tendencia indica intensificación: conviene monitorear con más frecuencia."
      : t === "weakening"
      ? "La tendencia indica debilitamiento: aun así, pueden ocurrir rebrotes."
      : t === "stable"
      ? "La tendencia se mantiene estable: atención a cambios por viento/combustible."
      : "";

  return `${rainHelp} ${windRisk} ${dryness}${trendHint ? " " + trendHint : ""}`.trim();
}

async function fetchWeatherOps(lat: number, lon: number): Promise<WeatherOps | null> {
  // Open-Meteo (sin API key)
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&hourly=precipitation_probability,windspeed_10m,relativehumidity_2m,temperature_2m` +
    `&forecast_days=2` +
    `&timezone=UTC`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const hourly = data?.hourly;
  const times: string[] = hourly?.time ?? [];
  const now = Date.now();

  let i0 = 0;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (Number.isFinite(t) && t >= now) {
      i0 = i;
      break;
    }
  }
  const i1 = clamp(i0 + 12, i0, times.length);

  const slice = (arr: Array<number | null> | undefined) => (arr ? arr.slice(i0, i1) : undefined);

  const rainProbMaxPct = safeMax(slice(hourly?.precipitation_probability));
  const windMaxKmh = round1(safeMax(slice(hourly?.windspeed_10m))); // km/h
  const humidityMinPct = safeMin(slice(hourly?.relativehumidity_2m));
  const tempAvgC = round1(safeAvg(slice(hourly?.temperature_2m)));

  return {
    windowLabel: "Próximas 12 h (UTC)",
    rainProbMaxPct,
    windMaxKmh,
    humidityMinPct,
    tempAvgC,
    narrative: "",
  };
}

// ===== Visual Observation (Módulo 1) =====
type VisualSource = {
  kind: "live" | "periodic" | "snapshot";
  title: string;
  subtitle?: string;
  freshnessLabel: string;
  href?: string;
  imageUrl?: string;
};

function buildVisualSources(ev: EnvironmentalEvent): VisualSource[] {
  const sources: VisualSource[] = [];

  if (ev.liveFeedUrl && /^https?:\/\//.test(ev.liveFeedUrl)) {
    sources.push({
      kind: "live",
      title: "Live feed (externo)",
      subtitle: "Fuente: enlace del evento",
      freshnessLabel: "LIVE",
      href: ev.liveFeedUrl,
    });
  }

  if (ev.satelliteImageUrl && /^https?:\/\//.test(ev.satelliteImageUrl)) {
    sources.push({
      kind: "snapshot",
      title: "Snapshot satelital",
      subtitle: "Fuente: imagen asociada",
      freshnessLabel: timeAgoFrom(ev.timestamp),
      imageUrl: ev.satelliteImageUrl,
      href: ev.satelliteImageUrl,
    });
  }

  return sources;
}

function badgeStyle(kind: VisualSource["kind"]) {
  if (kind === "live") return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
  if (kind === "periodic") return "border-cyan-400/30 bg-cyan-400/15 text-cyan-100";
  return "border-white/10 bg-white/5 text-white/80";
}

function formatDistanceKm(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n < 10) return `${n.toFixed(1)} km`;
  return `${Math.round(n)} km`;
}

function cadenceLabel(cam: CameraRecordV1) {
  const sec = cam.update?.expectedIntervalSec;
  if (typeof sec === "number" && Number.isFinite(sec) && sec > 0) {
    const min = Math.max(1, Math.round(sec / 60));
    return `≈ cada ${min} min`;
  }
  return cam.mediaType === "stream" ? "STREAM" : "snapshot";
}

function cameraHref(cam: CameraRecordV1): { href?: string; label?: string; hint?: string } {
  const f = cam.fetch;
  if (f.kind === "image_url") return { href: f.url, label: "Abrir imagen", hint: "externo" };
  if (f.kind === "stream_url") return { href: f.url, label: "Abrir stream", hint: "externo" };
  if (f.kind === "html_embed") return { href: f.url, label: "Abrir fuente", hint: "externo" };
  if (f.kind === "provider_api") return { href: undefined, label: undefined, hint: "Proveedor API (sin enlace directo)" };
  return { href: undefined, label: undefined };
}

type PanelView = "main" | "ops" | "visual";

function CardButton(props: {
  title: string;
  subtitle: string;
  icon: string;
  rightBadge?: { text: string; className: string } | null;
  onClick: () => void;
}) {
  const { title, subtitle, icon, rightBadge, onClick } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left",
        "rounded-2xl border border-white/10 bg-white/5",
        "px-4 py-4",
        "hover:bg-white/7 transition-colors",
        "flex items-start justify-between gap-4",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-10 w-10 rounded-xl border border-white/10 bg-black/20 flex items-center justify-center shrink-0">
          <span className="text-white/85">{icon}</span>
        </div>
        <div className="min-w-0">
          <div className="text-white/90 font-semibold">{title}</div>
          <div className="text-white/50 text-sm mt-0.5 line-clamp-2">{subtitle}</div>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {rightBadge ? (
          <span className={["rounded-full border px-2 py-0.5 text-[11px]", rightBadge.className].join(" ")}>
            {rightBadge.text}
          </span>
        ) : null}
        <span className="text-white/40 text-sm">›</span>
      </div>
    </button>
  );
}

function SeverityDot({ sev }: { sev: EnvironmentalEvent["severity"] }) {
  return (
    <span
      className={[
        "inline-block h-2 w-2 rounded-full",
        sev === "critical"
          ? "bg-red-500"
          : sev === "high"
          ? "bg-orange-500"
          : sev === "moderate"
          ? "bg-yellow-500"
          : "bg-emerald-400",
      ].join(" ")}
    />
  );
}

export function AlertPanel(props: { event: EnvironmentalEvent | null; onClose: () => void; shareUrl?: string }) {
  const { event, onClose, shareUrl } = props;

  const [copied, setCopied] = useState(false);
  const [followed, setFollowed] = useState<string[]>([]);
  const [view, setView] = useState<PanelView>("main");

  // Weather state
  const [weatherOps, setWeatherOps] = useState<WeatherOps | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    if (!event) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [event, onClose]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFollowed(readFollowed());
    setCopied(false);
    setView("main");
    setWeatherOps(null);
    setWeatherLoading(false);
  }, [event?.id]);

  // ✅ Hooks SIEMPRE arriba, sin returns antes
  const header = useMemo(() => {
    if (!event) return null;
    const cat = categoryLabels[event.category] ?? event.category;
    const color = categoryColors[event.category] ?? "#7dd3fc";
    return { cat, color };
  }, [event?.id]);

  const cameraCandidates = useMemo(() => {
    if (!event) return [];
    if (!isFiniteNumber((event as any).latitude) || !isFiniteNumber((event as any).longitude)) return [];

    const point = { lat: (event as any).latitude as number, lon: (event as any).longitude as number };
    return findNearestCameras(cameraRegistry, point, {
      maxResults: 3,
      requireVerified: false,
    });
  }, [event?.id]);

  // ✅ Extract ops info (trend/frp/detections) from description safely
  const ops = useMemo(() => extractOpsFromDescription(event?.description), [event?.id]);

  // Weather fetch (Open-Meteo) based on event coords
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!event) return;
      const lat = (event as any).latitude;
      const lon = (event as any).longitude;
      if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
        setWeatherOps(null);
        return;
      }

      setWeatherLoading(true);
      try {
        const base = await fetchWeatherOps(lat, lon);
        if (!alive) return;

        if (!base) {
          setWeatherOps(null);
          return;
        }

        const narrative = weatherNarrative({
          rainProbMaxPct: base.rainProbMaxPct,
          windMaxKmh: base.windMaxKmh,
          humidityMinPct: base.humidityMinPct,
          tempAvgC: base.tempAvgC,
          trendLabel: ops.trendLabel,
        });

        setWeatherOps({ ...base, narrative });
      } catch {
        if (!alive) return;
        setWeatherOps(null);
      } finally {
        if (!alive) return;
        setWeatherLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [event?.id, ops.trendLabel]);

  // ✅ Recién acá hacemos el return temprano
  if (!event || !header) return null;

  const isFollowed = followed.includes(event.id);

  async function handleCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Copiá el link:", shareUrl);
    }
  }

  const summary = event.description && event.description.trim().length > 0 ? event.description : fallbackSummary(event);
  const utc = formatTimeUTC(event.timestamp);
  const lastSignalAgo = timeAgoFrom(event.timestamp);

  const visuals = buildVisualSources(event);

  const visualBadge = (() => {
    const live = visuals.find((v) => v.kind === "live");
    if (live) return { text: "LIVE", className: badgeStyle("live") };
    const periodic = visuals.find((v) => v.kind === "periodic");
    if (periodic) return { text: periodic.freshnessLabel, className: badgeStyle("periodic") };
    const snap = visuals.find((v) => v.kind === "snapshot");
    if (snap) return { text: snap.freshnessLabel, className: badgeStyle("snapshot") };
    return null;
  })();

  const opsBadge =
    ops.trendLabel
      ? { text: `TREND: ${ops.trendLabel}`, className: trendBadgeStyle(ops.trendLabel) }
      : null;

  const isCompact = view !== "main";

  // scales (operativas, conservadoras)
  const frpScale = 120; // FRP max típico: 0..120+
  const detScale = 25; // detections por cluster en ventana actual
  const sumScale = 250; // FRP sum (muy variable)

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={[
          "absolute left-1/2 -translate-x-1/2",
          "bottom-4 md:bottom-6",
          "w-[calc(100%-24px)] md:w-[860px]",
          "max-h-[82vh] overflow-hidden",
          "rounded-2xl border border-white/10 bg-[#0a0f1a]/95 shadow-2xl",
          "backdrop-blur-md",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="h-1.5"
          style={{
            background: `linear-gradient(90deg, ${header.color}CC, ${header.color}14, transparent)`,
          }}
        />

        {/* HEADER */}
        <div
          className={[
            "relative border-b border-white/10 bg-black/10",
            isCompact ? "px-4 py-3 md:px-5 md:py-3" : "p-5 md:p-6",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-2">
            {isCompact ? (
              <button
                type="button"
                onClick={() => setView("main")}
                className={[
                  "h-9 px-3 rounded-xl",
                  "border border-white/10 bg-white/5",
                  "text-white/80 hover:text-white hover:bg-white/10",
                  "transition-colors",
                  "flex items-center gap-2",
                ].join(" ")}
                aria-label="Volver"
                title="Volver"
              >
                <span className="text-white/80">←</span>
                <span className="text-sm">Volver</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className={[
                "h-9 w-9 rounded-xl",
                "border border-white/10 bg-white/5",
                "text-white/80 hover:text-white hover:bg-white/10",
                "transition-colors",
                "flex items-center justify-center",
              ].join(" ")}
              aria-label="Cerrar"
              title="Cerrar"
            >
              ✕
            </button>
          </div>

          {isCompact ? (
            <>
              <div className="mt-2 text-white/55 text-[11px] uppercase tracking-wider">
                {header.cat} • {utc}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="text-white/90 font-semibold text-base md:text-lg">{event.title}</div>

                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                  <SeverityDot sev={event.severity} />
                  <span className="text-white/75 text-xs">{event.severity.toUpperCase()}</span>
                </span>

                <span className="inline-flex items-center gap-2 text-white/60 text-xs">
                  <span className="pulse-dot h-2 w-2 rounded-full bg-cyan-300/80" />
                  {statusLabel(event.status)}
                </span>

                {opsBadge ? (
                  <span className={["rounded-full border px-2 py-0.5 text-[11px]", opsBadge.className].join(" ")}>
                    {opsBadge.text}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="text-white/55 text-xs uppercase tracking-wider flex items-center gap-2">
                <span>
                  {header.cat} • {utc}
                </span>
              </div>

              <div className="mt-2 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-white text-2xl md:text-3xl font-semibold leading-tight">{event.title}</div>
                  <div className="mt-2 text-white/80 text-sm md:text-base font-medium">{event.location}</div>
                  <div className="mt-1 text-white/45 text-xs">
                    {fmtCoord((event as any).latitude)}, {fmtCoord((event as any).longitude)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = toggleFollow(event.id);
                    setFollowed(next);
                  }}
                  className={[
                    "shrink-0",
                    "rounded-xl border border-white/10",
                    "bg-white/5 hover:bg-white/10",
                    "px-3 py-2 text-xs md:text-sm",
                    "text-white/85 transition-colors",
                  ].join(" ")}
                  aria-pressed={isFollowed}
                  title="Seguir esta alerta (futuro: notificaciones)"
                >
                  {isFollowed ? "Siguiendo ✓" : "Seguir alerta"}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <SeverityDot sev={event.severity} />
                  <span className="text-white/80 text-sm">{event.severity.toUpperCase()} Severity</span>

                  <span className="ml-3 inline-flex items-center gap-2 text-white/65 text-sm">
                    <span className="pulse-dot h-2 w-2 rounded-full bg-cyan-300/80" />
                    {statusLabel(event.status)}
                  </span>

                  {opsBadge ? (
                    <span className={["ml-2 rounded-full border px-2 py-0.5 text-[11px]", opsBadge.className].join(" ")}>
                      {opsBadge.text}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 text-sm transition-colors"
                  onClick={handleCopyLink}
                  disabled={!shareUrl}
                  title={shareUrl ? "Copiar link" : "Link no disponible"}
                >
                  {copied ? "Link copiado" : "Copiar link"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Content area */}
        <div className="p-5 md:p-6 overflow-y-auto max-h-[calc(82vh-120px)]">
          {view === "main" ? (
            <>
              <div className="grid grid-cols-1 gap-3">
                <CardButton
                  title="Estado operativo"
                  subtitle={[
                    `Status: ${statusLabel(event.status)}`,
                    ops.trendLabel ? `Trend: ${ops.trendLabel}` : null,
                    `Evacuación: ${event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}`,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                  icon="⚠️"
                  rightBadge={opsBadge}
                  onClick={() => setView("ops")}
                />

                <CardButton
                  title="Observación visual"
                  subtitle={
                    visuals.length
                      ? `Fuentes disponibles: ${visuals.length}. Se prioriza LIVE; luego actualizaciones y snapshots con timestamp.`
                      : cameraCandidates.length
                      ? `Hay cámaras cercanas registradas: ${cameraCandidates.length}. (Sin prometer LIVE: snapshots/streams según fuente).`
                      : "No hay fuentes visuales asociadas a este evento por ahora."
                  }
                  icon="🎥"
                  rightBadge={visualBadge}
                  onClick={() => setView("visual")}
                />

                <CardButton
                  title="Impacto humano"
                  subtitle={`Población: ${
                    typeof event.affectedPopulation === "number"
                      ? `≈ ${event.affectedPopulation.toLocaleString("es-AR")}`
                      : "—"
                  } • Área: ${km2(event.affectedArea)}`}
                  icon="👥"
                  rightBadge={null}
                  onClick={() => window.alert("Próximo módulo: Impacto humano.")}
                />

                <CardButton
                  title="Contexto ambiental"
                  subtitle={
                    event.ecosystems?.length || event.speciesAtRisk?.length
                      ? "Ecosistemas/especies disponibles en este evento."
                      : "Aún sin datos ambientales asociados."
                  }
                  icon="🌱"
                  rightBadge={null}
                  onClick={() => window.alert("Próximo módulo: Contexto ambiental.")}
                />

                <CardButton
                  title="Observación satelital"
                  subtitle={event.satelliteImageUrl ? "Hay imagen asociada. (Más adelante: capas/timeline)." : "Aún sin capas satelitales."}
                  icon="🛰️"
                  rightBadge={event.satelliteImageUrl ? { text: timeAgoFrom(event.timestamp), className: badgeStyle("snapshot") } : null}
                  onClick={() => window.alert("Próximo módulo: Observación satelital (capas).")}
                />

                <CardButton
                  title="Indicadores + Insight"
                  subtitle={event.aiInsight?.narrative ? "BioPulse Insight disponible + indicadores de riesgo." : "Sin Insight por ahora."}
                  icon="🧠"
                  rightBadge={null}
                  onClick={() => window.alert("Próximo módulo: Insight + Risk.")}
                />
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/45 text-xs uppercase tracking-wider">Qué está pasando</div>
                <div className="mt-2 text-white/85 text-sm leading-relaxed">{summary}</div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/45 text-xs uppercase tracking-wider">Condiciones</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Viento</div>
                    <div className="mt-1 text-white/85 text-sm font-medium">{metric(event.windSpeed, " km/h")}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Humedad</div>
                    <div className="mt-1 text-white/85 text-sm font-medium">{metric(event.humidity, "%")}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Temperatura</div>
                    <div className="mt-1 text-white/85 text-sm font-medium">{metric(event.temperature, "°C")}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">AQI / Río</div>
                    <div className="mt-1 text-white/85 text-sm font-medium">
                      {typeof event.airQualityIndex === "number"
                        ? `AQI ${event.airQualityIndex}`
                        : typeof event.waterLevel === "number"
                        ? `${event.waterLevel} m`
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 text-white/35 text-xs">
                Tip: presioná <span className="text-white/55">Esc</span> o tocá afuera para cerrar.
              </div>
            </>
          ) : view === "ops" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-white/90 font-semibold text-lg">⚠️ Estado operativo</div>
                    <div className="text-white/45 text-sm mt-1">
                      Lectura operativa basada en señales satelitales recientes, tendencia del fuego y estado estimado.
                    </div>
                  </div>

                  {opsBadge ? (
                    <span className={["rounded-full border px-2 py-0.5 text-[11px]", opsBadge.className].join(" ")}>
                      {opsBadge.text}
                    </span>
                  ) : null}
                </div>

                {/* 🔥 LECTURA DEL EVENTO (humana) */}
                {(() => {
                  const t = (ops.trendLabel?.toLowerCase() || "") as Trend;
                  const intensityText = intensityHuman(ops.frpMax);
                  const activityText = activityHuman(ops.detections, t, event.status as any);
                  const stateText = stateHuman(event.status as any);

                  return (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-white/60 text-xs uppercase tracking-wider">🔥 Lectura del evento</div>

                      <div className="mt-3 space-y-2 text-sm leading-relaxed">
                        <p>
                          <span className="text-white/85 font-semibold">Intensidad:</span>{" "}
                          <span className="text-white/75">{intensityText}</span>
                        </p>
                        <p>
                          <span className="text-white/85 font-semibold">Actividad:</span>{" "}
                          <span className="text-white/75">{activityText}</span>
                        </p>
                        <p>
                          <span className="text-white/85 font-semibold">Estado:</span>{" "}
                          <span className="text-white/75">{stateText}</span>
                        </p>
                      </div>

                      <div className="mt-3 text-white/35 text-[11px]">
                        Lectura interpretativa basada en detecciones satelitales (VIIRS) y métricas FRP. Puede haber retrasos o falsos positivos.
                      </div>
                    </div>
                  );
                })()}

                {/* ✅ Indicadores operativos (tipo Microsoft) */}
                <div className="mt-4">
                  <div className="text-white/85 text-sm font-semibold">Indicadores operativos</div>
                  <div className="text-white/45 text-xs mt-0.5">
                    Visual + número + explicación. Esto traduce la señal, no la “inventa”.
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <GaugeRing
                      label="Intensidad"
                      value={ops.frpMax}
                      max={frpScale}
                      valueFmt={(v) => (typeof v === "number" ? `${v.toFixed(2)} FRP max` : "—")}
                      hint="Radiative Power"
                      humanLine={typeof ops.frpMax === "number" ? `Lectura: ${intensityHuman(ops.frpMax)}` : "Sin FRP max disponible"}
                    />

                    <GaugeRing
                      label="Actividad"
                      value={ops.detections}
                      max={detScale}
                      valueFmt={(v) => (typeof v === "number" ? `${v} detections` : "—")}
                      hint="Señales VIIRS"
                      humanLine={
                        typeof ops.detections === "number"
                          ? `Lectura: ${activityHuman(ops.detections, ops.trendLabel as any, event.status as any)}`
                          : "Sin detections disponibles"
                      }
                    />

                    <GaugeRing
                      label="Energía total"
                      value={ops.frpSum}
                      max={sumScale}
                      valueFmt={(v) => (typeof v === "number" ? `${v.toFixed(2)} FRP sum` : "—")}
                      hint="Acumulado"
                      humanLine={
                        typeof ops.frpSum === "number"
                          ? "Aprox. energía radiativa acumulada del cluster (no es “bomberos”, es del fuego)."
                          : "Sin FRP sum disponible"
                      }
                    />
                  </div>
                </div>

                {/* 🌦 Condiciones operativas + narrativa */}
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/85 text-sm font-semibold">Condiciones</div>
                  <div className="text-white/45 text-xs mt-0.5">
                    Condiciones que pueden cambiar la dinámica del evento (no es pronóstico general).
                  </div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Lluvia</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {weatherLoading ? "…" : formatPct(weatherOps?.rainProbMaxPct)}
                      </div>
                      <div className="mt-1 text-white/35 text-[11px]">
                        {weatherOps ? weatherOps.windowLabel : "—"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Viento</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {weatherLoading ? "…" : formatKmh(weatherOps?.windMaxKmh)}
                      </div>
                      <div className="mt-1 text-white/35 text-[11px]">máx. estimado</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Humedad</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {weatherLoading ? "…" : formatPct(weatherOps?.humidityMinPct)}
                      </div>
                      <div className="mt-1 text-white/35 text-[11px]">mín. estimado</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Temp.</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {weatherLoading ? "…" : formatC(weatherOps?.tempAvgC)}
                      </div>
                      <div className="mt-1 text-white/35 text-[11px]">promedio</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/60 text-xs uppercase tracking-wider">🌦 Ventana operativa</div>
                    <div className="mt-2 text-white/80 text-sm leading-relaxed">
                      {weatherLoading
                        ? "Cargando condiciones locales…"
                        : weatherOps?.narrative ?? "Sin datos meteorológicos disponibles por ahora."}
                    </div>
                  </div>
                </div>

                {/* Status / Evacuación / Tendencia (por qué) */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Status</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{statusLabel(event.status)}</div>

                    <div className="mt-2 text-white/45 text-xs">
                      Última señal: <span className="text-white/70">{lastSignalAgo}</span>
                    </div>
                    <div className="mt-0.5 text-white/35 text-[11px]">Last detection: {utc}</div>
                  </div>
            </>
          ) : view === "visual" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-white/90 font-semibold text-lg">🎥 Observación visual</div>
                    <div className="text-white/45 text-sm mt-1">
                      BioPulse prioriza LIVE real. Si no hay, muestra fuentes con timestamp (cada X min / snapshot).
                    </div>
                  </div>

                  {visualBadge ? (
                    <span className={["rounded-full border px-2 py-0.5 text-[11px]", visualBadge.className].join(" ")}>
                      {visualBadge.text}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-white/85 text-sm font-semibold">Cámaras cercanas (registry)</div>
                      <div className="text-white/45 text-xs mt-0.5">
                        Fuente curada por BioPulse. No se promete “LIVE” salvo stream real del proveedor.
                      </div>
                    </div>
                    <span className={["shrink-0 rounded-full border px-2 py-0.5 text-[11px]", badgeStyle("periodic")].join(" ")}>
                      {cameraCandidates.length ? `${cameraCandidates.length} cerca` : "0"}
                    </span>
                  </div>

                  <div className="mt-3">
                    {cameraCandidates.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-white/80 text-sm font-medium">No hay cámaras públicas registradas cerca</div>
                        <div className="text-white/45 text-xs mt-1">
                          Próximo: botón para “Proponer una cámara” (guardianes) y validación.
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {cameraCandidates.map((c) => {
                          const cam = c.camera as CameraRecordV1;
                          const dist = formatDistanceKm(c.distanceKm);
                          const attrib = cam.usage?.attributionText ?? `Provider: ${cam.providerId}`;
                          const cadence = cadenceLabel(cam);
                          const link = cameraHref(cam);

                          return (
                            <div key={cam.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-white/85 text-sm font-semibold truncate">{cam.title}</div>
                                  <div className="text-white/45 text-xs mt-0.5 line-clamp-2">
                                    {attrib} • {cam.coverage.countryISO2}
                                    {cam.coverage.admin1 ? ` • ${cam.coverage.admin1}` : ""}
                                    {cam.coverage.locality ? ` • ${cam.coverage.locality}` : ""}
                                  </div>
                                  <div className="text-white/40 text-xs mt-1">
                                    A {dist} • {cam.mediaType === "stream" ? "Stream" : "Snapshot"} • {cadence}
                                  </div>
                                </div>

                                <span
                                  className={[
                                    "shrink-0 rounded-full border px-2 py-0.5 text-[11px]",
                                    cam.mediaType === "stream" ? badgeStyle("live") : badgeStyle("periodic"),
                                  ].join(" ")}
                                  title={cam.mediaType === "stream" ? "Stream (no necesariamente “en vivo”)" : "Actualización periódica / snapshot"}
                                >
                                  {cam.mediaType === "stream" ? "STREAM" : cadence}
                                </span>
                              </div>

                              <div className="mt-3">
                                {link.href ? (
                                  <a
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-black/30"
                                    href={link.href}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {link.label ?? "Abrir fuente"}
                                    <span className="text-white/40 text-xs">({link.hint ?? "externo"})</span>
                                  </a>
                                ) : (
                                  <div className="text-white/45 text-xs">
                                    {link.hint ?? "Sin enlace directo (se resolverá vía Worker/proxy)."}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  {visuals.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-white/80 text-sm font-medium">No hay observación visual del evento</div>
                      <div className="text-white/45 text-xs mt-1">
                        Se usarán cámaras cercanas y snapshots con timestamp cuando haya fuentes conectadas.
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {visuals.map((v) => (
                        <div key={`${v.kind}:${v.title}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-white/85 text-sm font-semibold">{v.title}</div>
                              {v.subtitle ? <div className="text-white/45 text-xs mt-0.5">{v.subtitle}</div> : null}
                            </div>

                            <span className={["shrink-0 rounded-full border px-2 py-0.5 text-[11px]", badgeStyle(v.kind)].join(" ")}>
                              {v.kind === "live" ? "LIVE" : v.freshnessLabel}
                            </span>
                          </div>

                          {v.imageUrl ? (
                            <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                              <img src={v.imageUrl} alt="" className="h-40 w-full object-cover opacity-90" loading="lazy" />
                            </div>
                          ) : null}

                          <div className="mt-3">
                            {v.href ? (
                              <a
                                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                                href={v.href}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir fuente
                                <span className="text-white/40 text-xs">(externo)</span>
                              </a>
                            ) : (
                              <div className="text-white/50 text-sm">—</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 text-white/35 text-xs">
                  Nota: lo próximo es proxyear snapshots/streams vía Worker (CORS + cache) para no depender de enlaces externos.
                </div>
              </div>
            </>
          ) : null}
        </div>

        <style>{`
          .pulse-dot{
            animation: pulse 1.25s ease-in-out infinite;
          }
          @keyframes pulse{
            0%{ transform: scale(1); opacity: 0.35; }
            50%{ transform: scale(1.35); opacity: 0.95; }
            100%{ transform: scale(1); opacity: 0.35; }
          }
          .line-clamp-2{
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
        `}</style>
      </div>
    </div>
  );
}
