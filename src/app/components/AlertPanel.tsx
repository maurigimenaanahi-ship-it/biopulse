import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { EnvironmentalEvent } from "@/data/events";
import { categoryLabels, categoryColors } from "@/data/events";

// ===== cameras registry + matching =====
import { cameraRegistry } from "@/data/cameras";
import { findNearestCameras } from "@/app/lib/findNearestCameras";
import type { CameraRecordV1 } from "@/data/cameras/types";

// ============================
// Favorites (seguir alerta)
// ============================
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

// ============================
// Helpers
// ============================
function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtCoord(x: unknown, digits = 4) {
  return isFiniteNumber(x) ? x.toFixed(digits) : "—";
}

function formatTimeUTC(d: any) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toUTCString();
}

function timeAgoFrom(d: any) {
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
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

// ============================
// Extract helpers (Trend / FRP / detections)
// ============================
type ExtractedOps = {
  trendLabel?: string;
  frpMax?: number;
  frpSum?: number;
  detections?: number;
};

function extractOpsFromDescription(desc?: string): ExtractedOps {
  const out: ExtractedOps = {};
  if (!desc || typeof desc !== "string") return out;

  const mTrend = desc.match(/Trend:\s*([A-Za-z]+)/i);
  if (mTrend?.[1]) out.trendLabel = mTrend[1].trim();

  const mFrp = desc.match(/FRP\s*max\s*([0-9]+(?:\.[0-9]+)?)\s*.*FRP\s*sum\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (mFrp?.[1]) out.frpMax = Number(mFrp[1]);
  if (mFrp?.[2]) out.frpSum = Number(mFrp[2]);

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

// ============================
// Weather (contexto operativo) – Open-Meteo
// ============================
type WeatherOps = {
  windowLabel: string;
  rainProbMaxPct?: number;
  windMaxKmh?: number;
  humidityMinPct?: number;
  tempAvgC?: number;
  narrative: string;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

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
  const api =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&hourly=precipitation_probability,windspeed_10m,relativehumidity_2m,temperature_2m` +
    `&forecast_days=2` +
    `&timezone=UTC`;

  const res = await fetch(api);
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
  const windMaxKmh = round1(safeMax(slice(hourly?.windspeed_10m)));
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

// ============================
// UI bits (fuera del componente)
// ============================
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

function badgeStyle(kind: "live" | "periodic" | "snapshot") {
  if (kind === "live") return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
  if (kind === "periodic") return "border-cyan-400/30 bg-cyan-400/15 text-cyan-100";
  return "border-white/10 bg-white/5 text-white/80";
}

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

// ============================
// News types (UI v1) – por ahora mock
// ============================
type NewsSourceKind = "government" | "firefighters" | "media";
type NewsItem = {
  id: string;
  kind: NewsSourceKind;
  sourceName: string;
  title: string;
  summary: string;
  body: string;
  publishedAt: Date;
  imageUrl?: string;
  videoUrl?: string;
  url?: string;
  tags?: string[];
};

function sourceBadge(kind: NewsSourceKind) {
  if (kind === "government")
    return { label: "GOBIERNO", cls: "border-emerald-400/30 bg-emerald-400/15 text-emerald-100" };
  if (kind === "firefighters")
    return { label: "BOMBEROS", cls: "border-orange-400/30 bg-orange-400/15 text-orange-100" };
  return { label: "MEDIOS", cls: "border-white/10 bg-white/5 text-white/80" };
}

function NewsCard(props: { item: NewsItem; onOpen: (id: string) => void }) {
  const { item, onOpen } = props;
  const badge = sourceBadge(item.kind);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="h-16 w-20 rounded-xl border border-white/10 bg-black/30 overflow-hidden shrink-0 flex items-center justify-center">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-white/10 to-white/0" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={["rounded-full border px-2 py-0.5 text-[11px]", badge.cls].join(" ")}>
              {badge.label}
            </span>
            <span className="text-white/40 text-[11px]">{timeAgoFrom(item.publishedAt)}</span>
            <span className="text-white/35 text-[11px]">•</span>
            <span className="text-white/45 text-[11px]">{item.sourceName}</span>
          </div>

          <div className="mt-1 text-white/90 font-semibold text-sm line-clamp-2">{item.title}</div>
          <div className="mt-1 text-white/60 text-xs line-clamp-2">{item.summary}</div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-xl border border-white/10 bg-black/20 text-white/80 hover:bg-black/30 text-xs transition-colors"
              onClick={() => onOpen(item.id)}
            >
              Ver más
            </button>

            {item.videoUrl ? (
              <span className="text-white/55 text-[11px] inline-flex items-center gap-1">▶ video</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialQuote({ who, text }: { who: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-white/60 text-xs font-semibold">{who}</div>
      <div className="mt-1 text-white/75 text-sm leading-relaxed">{text}</div>
    </div>
  );
}

type PanelView =
  | "main"
  | "ops"
  | "satellite"
  | "cameras"
  | "environment"
  | "impact"
  | "insight"
  | "guardian"
  | "news"
  | "news_item";

// ============================
// ✅ Wrapper SIN hooks (evita React #310)
// ============================
export function AlertPanel(props: { event: EnvironmentalEvent | null; onClose: () => void; shareUrl?: string }) {
  const { event, onClose, shareUrl } = props;
  if (!event) return null;
  return <AlertPanelInner key={event.id} event={event} onClose={onClose} shareUrl={shareUrl} />;
}

// ============================
// ✅ Inner CON hooks (event nunca es null)
// ============================
function AlertPanelInner(props: { event: EnvironmentalEvent; onClose: () => void; shareUrl?: string }) {
  const { event, onClose, shareUrl } = props;

  // State
  const [copied, setCopied] = useState(false);
  const [followed, setFollowed] = useState<string[]>([]);
  const [view, setView] = useState<PanelView>("main");

  const [weatherOps, setWeatherOps] = useState<WeatherOps | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);

  // Derived (memo)
  const header = useMemo(() => {
    const cat = categoryLabels[event.category] ?? event.category;
    const color = categoryColors[event.category] ?? "#7dd3fc";
    return { cat, color };
  }, [event.id, event.category]);

  const ops = useMemo(() => extractOpsFromDescription(event.description), [event.id, event.description]);

  const lat = (event as any).latitude;
  const lon = (event as any).longitude;

  const cameraCandidates = useMemo(() => {
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return [];
    const point = { lat, lon };
    return findNearestCameras(cameraRegistry, point, { maxResults: 3, requireVerified: false });
  }, [event.id, lat, lon]);

  // Escape to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Reset view when event changes
  useEffect(() => {
    setCopied(false);
    setView("main");
    setWeatherOps(null);
    setWeatherLoading(false);
    setSelectedNewsId(null);

    try {
      setFollowed(readFollowed());
    } catch {
      setFollowed([]);
    }
  }, [event.id]);

  // Weather fetch
  useEffect(() => {
    let alive = true;

    async function run() {
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
  }, [event.id, lat, lon, ops.trendLabel]);

  // Breaking heuristic
  const isBreaking =
    event.severity === "critical" ||
    event.evacuationLevel === "mandatory" ||
    event.status === "escalating" ||
    (ops.trendLabel ?? "").toLowerCase() === "intensifying";

  // News mock
  const newsItems = useMemo<NewsItem[]>(() => {
    const now = Date.now();
    const baseImg = event.satelliteImageUrl || undefined;

    const mk = (p: Partial<NewsItem> & Pick<NewsItem, "id" | "kind" | "sourceName" | "title" | "summary" | "body">): NewsItem => ({
      publishedAt: p.publishedAt ?? new Date(now - 1000 * 60 * 30),
      tags: p.tags ?? [],
      ...p,
    });

    return [
      mk({
        id: `${event.id}:gov:1`,
        kind: "government",
        sourceName: "Protección Civil (simulado)",
        title: isBreaking
          ? "Alerta preventiva: mantenerse informado y evitar zonas afectadas"
          : "Monitoreo en curso: recomendaciones generales",
        summary:
          "Se solicita a la población evitar acercarse al perímetro del evento y seguir indicaciones oficiales. Actualizaciones cada 60 min.",
        body:
          "Este comunicado es un placeholder para el futuro módulo de fuentes oficiales. En producción, aquí veremos el texto completo del parte, con hora, jurisdicción, mapa de cortes/perímetros y un historial de actualizaciones.\n\nRecomendaciones: evitar circular por caminos rurales cercanos, no obstaculizar el paso de vehículos de emergencia, y reportar humo/llamas a líneas oficiales.\n\nPróximo (BioPulse): adjuntar resoluciones, cortes, refugios y contactos verificados.",
        publishedAt: new Date(now - 1000 * 60 * 35),
        imageUrl: baseImg,
        tags: ["oficial", "recomendaciones"],
      }),
      mk({
        id: `${event.id}:fire:1`,
        kind: "firefighters",
        sourceName: "Bomberos / Operativo (simulado)",
        title: isBreaking ? "Trabajo en zona: perímetro activo y recursos desplegados" : "Revisión de focos: seguimiento operativo",
        summary: "Parte operativo de situación: estado del frente, acceso de brigadas y advertencias por viento. (Datos simulados).",
        body:
          "Placeholder de parte operativo. En producción incluirá: perímetro oficial, recursos desplegados, recomendaciones específicas por viento/relieve y horarios de trabajo.\n\nNota: BioPulse no “inventa” operativos; esto vendrá de fuentes oficiales y sistemas abiertos cuando existan.",
        publishedAt: new Date(now - 1000 * 60 * 50),
        imageUrl: baseImg,
        tags: ["operativo", "perímetro"],
      }),
      mk({
        id: `${event.id}:media:1`,
        kind: "media",
        sourceName: "Medio local (simulado)",
        title: "Vecinos reportan humo visible y olor intenso en sectores cercanos",
        summary: "Resumen periodístico con testimonios. En BioPulse, esto se ordena y se contrasta con fuentes oficiales y señales.",
        body:
          "Placeholder de cobertura mediática. En producción, BioPulse mostrará una ficha con: titular, bajada, contenido, multimedia, y un panel de confiabilidad (fuente, fecha, confirmaciones).\n\nSiempre priorizamos Gobierno y Bomberos por arriba; los medios aparecen como contexto.",
        publishedAt: new Date(now - 1000 * 60 * 80),
        imageUrl: baseImg,
        tags: ["testimonios", "contexto"],
      }),
    ];
  }, [event.id, event.satelliteImageUrl, isBreaking]);

  const selectedNews = useMemo(() => {
    if (!selectedNewsId) return null;
    return newsItems.find((n) => n.id === selectedNewsId) ?? null;
  }, [selectedNewsId, newsItems]);

  // UI helpers
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

  function openNewsItem(id: string) {
    setSelectedNewsId(id);
    setView("news_item");
  }

  function backFromNewsItem() {
    setSelectedNewsId(null);
    setView("news");
  }

  const summary = event.description && event.description.trim().length > 0 ? event.description : fallbackSummary(event);
  const utc = formatTimeUTC(event.timestamp);
  const lastSignalAgo = timeAgoFrom(event.timestamp);

  const opsBadge = ops.trendLabel ? { text: `TREND: ${ops.trendLabel}`, className: trendBadgeStyle(ops.trendLabel) } : null;
  const isCompact = view !== "main";

  const modal = (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] z-0"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          "absolute left-1/2 -translate-x-1/2 z-10",
          "bottom-4 md:bottom-6",
          "w-[calc(100%-24px)] md:w-[900px]",
          "max-h-[88vh]",
          "rounded-2xl border border-white/10 bg-[#0a0f1a]/95 shadow-2xl",
          "backdrop-blur-md",
          "overflow-hidden",
          "flex flex-col",
          "pointer-events-auto",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${header.color}CC, ${header.color}14, transparent)` }} />

        {/* HEADER */}
        <div className={["relative border-b border-white/10 bg-black/10", isCompact ? "px-4 py-3 md:px-5 md:py-3" : "p-5 md:p-6"].join(" ")}>
          <div className="flex items-center justify-between gap-2">
            {isCompact ? (
              <button
                type="button"
                onClick={() => {
                  if (view === "news_item") backFromNewsItem();
                  else setView("main");
                }}
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
                <div className="text-white/90 font-semibold text-base md:text-lg">{event.location}</div>

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

              <div className="mt-1 text-white/55 text-xs">{event.title}</div>
              <div className="mt-1 text-white/45 text-[11px]">
                {fmtCoord(lat)}, {fmtCoord(lon)}
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
                  <div className="mt-1 text-white/45 text-xs">{fmtCoord(lat)}, {fmtCoord(lon)}</div>
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

        {/* Content */}
        <div className="p-5 md:p-6 overflow-y-auto flex-1 min-h-0">
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
                  title="Observación satelital"
                  subtitle={
                    event.satelliteImageUrl ? "Imagen asociada + métricas VIIRS/FRP. (Timeline después)." : "Aún sin imagen asociada."
                  }
                  icon="🛰️"
                  rightBadge={event.satelliteImageUrl ? { text: timeAgoFrom(event.timestamp), className: badgeStyle("snapshot") } : null}
                  onClick={() => setView("satellite")}
                />

                <CardButton
                  title="Cámaras públicas cercanas"
                  subtitle={
                    cameraCandidates.length
                      ? `Cámaras registradas cerca: ${cameraCandidates.length}. (Streams/snapshots según fuente).`
                      : "No hay cámaras públicas registradas cerca por ahora."
                  }
                  icon="🎥"
                  rightBadge={cameraCandidates.length ? { text: `${cameraCandidates.length} cerca`, className: badgeStyle("periodic") } : null}
                  onClick={() => setView("cameras")}
                />

                <CardButton
                  title="Contexto ambiental"
                  subtitle={
                    event.ecosystems?.length || event.speciesAtRisk?.length
                      ? "Ecosistemas/especies disponibles para este evento."
                      : "Aún sin datos ambientales asociados."
                  }
                  icon="🌱"
                  rightBadge={null}
                  onClick={() => setView("environment")}
                />

                <CardButton
                  title="Impacto humano"
                  subtitle={`Población: ${
                    typeof event.affectedPopulation === "number" ? `≈ ${event.affectedPopulation.toLocaleString("es-AR")}` : "—"
                  } • Área: ${km2(event.affectedArea)}`}
                  icon="👥"
                  rightBadge={null}
                  onClick={() => setView("impact")}
                />

                <CardButton
                  title="Indicadores + BioPulse Insight"
                  subtitle={event.aiInsight?.narrative ? "Insight disponible + indicadores de riesgo." : "Sin Insight por ahora."}
                  icon="🧠"
                  rightBadge={null}
                  onClick={() => setView("insight")}
                />

                <CardButton
                  title="Herramientas del guardián"
                  subtitle="Reportar observación • Confirmar datos • Escalar situación (próximo: feed de reportes)."
                  icon="🛡️"
                  rightBadge={{ text: "BETA", className: "border-cyan-400/30 bg-cyan-400/15 text-cyan-100" }}
                  onClick={() => setView("guardian")}
                />

                <CardButton
                  title="Noticias + redes"
                  subtitle="Tarjetas con imagen + resumen • Abrir detalle interno (sin salir de BioPulse)."
                  icon="📰"
                  rightBadge={{ text: "BETA", className: "border-white/10 bg-white/5 text-white/80" }}
                  onClick={() => setView("news")}
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
                <div className="text-white/90 font-semibold text-lg">⚠️ Estado operativo</div>
                <div className="text-white/45 text-sm mt-1">
                  Condiciones locales próximas (Open-Meteo) + lectura satelital (placeholder de “operativo”).
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/60 text-xs uppercase tracking-wider">Condiciones</div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Lluvia</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatPct(weatherOps?.rainProbMaxPct)}</div>
                      <div className="mt-1 text-white/35 text-[11px]">{weatherOps ? weatherOps.windowLabel : "—"}</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Viento</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatKmh(weatherOps?.windMaxKmh)}</div>
                      <div className="mt-1 text-white/35 text-[11px]">máx. estimado</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Humedad</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatPct(weatherOps?.humidityMinPct)}</div>
                      <div className="mt-1 text-white/35 text-[11px]">mín. estimado</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Temp.</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatC(weatherOps?.tempAvgC)}</div>
                      <div className="mt-1 text-white/35 text-[11px]">promedio</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/60 text-xs uppercase tracking-wider">🌦 Ventana operativa</div>
                    <div className="mt-2 text-white/80 text-sm leading-relaxed">
                      {weatherLoading ? "Cargando condiciones locales…" : weatherOps?.narrative ?? "Sin datos meteorológicos disponibles por ahora."}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Status</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{statusLabel(event.status)}</div>
                    <div className="mt-2 text-white/45 text-xs">
                      Última señal: <span className="text-white/70">{lastSignalAgo}</span>
                    </div>
                    <div className="mt-0.5 text-white/35 text-[11px]">Last detection: {utc}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Evacuación</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}</div>
                    <div className="mt-1 text-white/45 text-xs">Fuente: (a definir cuando conectemos datos oficiales)</div>
                  </div>
                </div>

                <div className="mt-3 text-white/35 text-xs">Nota: esto no sustituye fuentes locales. Es una lectura de contexto y señal.</div>
              </div>
            </>
          ) : view === "satellite" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">🛰️ Observación satelital</div>
                <div className="text-white/45 text-sm mt-1">Fuente: VIIRS / FIRMS (por ahora).</div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  {event.satelliteImageUrl ? (
                    <div className="overflowrounded-xl overflow-hidden border border-white/10">
                      <img src={event.satelliteImageUrl} alt="" className="h-56 w-full object-cover opacity-90" loading="lazy" />
                    </div>
                  ) : (
                    <div className="text-white/50 text-sm">No hay imagen satelital asociada para este evento.</div>
                  )}

                  <div className="mt-4 text-white/35 text-xs">Próximo: timeline + capas (hotspots, viento, humedad, combustible).</div>
                </div>
              </div>
            </>
          ) : view === "cameras" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">📹 Cámaras públicas cercanas</div>
                <div className="text-white/45 text-sm mt-1">Registry curado (por ahora). Próximo: proxy Worker + validación guardianes.</div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  {cameraCandidates.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/80 text-sm font-medium">No hay cámaras públicas registradas cerca</div>
                      <div className="text-white/45 text-xs mt-1">Próximo: botón para “Proponer una cámara”.</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {cameraCandidates.map((c) => {
                        const cam = c.camera as CameraRecordV1;
                        const attrib = cam.usage?.attributionText ?? `Provider: ${cam.providerId}`;

                        const href =
                          cam.fetch.kind === "image_url" || cam.fetch.kind === "stream_url" || cam.fetch.kind === "html_embed"
                            ? cam.fetch.url
                            : undefined;

                        return (
                          <div key={cam.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-white/85 text-sm font-semibold truncate">{cam.title}</div>
                            <div className="text-white/45 text-xs mt-0.5 line-clamp-2">
                              {attrib} • {cam.coverage.countryISO2}
                              {cam.coverage.admin1 ? ` • ${cam.coverage.admin1}` : ""}
                              {cam.coverage.locality ? ` • ${cam.coverage.locality}` : ""}
                            </div>

                            <div className="mt-3">
                              {href ? (
                                <a
                                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-black/30"
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Abrir fuente <span className="text-white/40 text-xs">(externo)</span>
                                </a>
                              ) : (
                                <div className="text-white/45 text-xs">Sin enlace directo (se resolverá vía Worker/proxy).</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : view === "environment" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">🌱 Contexto ambiental</div>
                <div className="text-white/45 text-sm mt-1">Ecosistemas afectados + especies en riesgo (cuando estén conectadas fuentes).</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-white/60 text-xs uppercase tracking-wider">Ecosistemas</div>
                    <div className="mt-2 text-white/80 text-sm">
                      {event.ecosystems?.length ? (
                        <ul className="space-y-1">
                          {event.ecosystems.map((e, i) => (
                            <li key={i}>• {e}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-white/60 text-xs uppercase tracking-wider">Especies en riesgo</div>
                    <div className="mt-2 text-white/80 text-sm">
                      {event.speciesAtRisk?.length ? (
                        <ul className="space-y-1">
                          {event.speciesAtRisk.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : view === "impact" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">👥 Impacto humano</div>
                <div className="text-white/45 text-sm mt-1">Población estimada + infraestructura crítica (cuando conectemos fuentes).</div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Población</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">
                      {typeof event.affectedPopulation === "number"
                        ? `≈ ${event.affectedPopulation.toLocaleString("es-AR")}`
                        : "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Área</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{km2(event.affectedArea)}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Evacuación</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">
                      {event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Última señal</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{lastSignalAgo}</div>
                  </div>
                </div>
              </div>
            </>
          ) : view === "insight" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">🧠 Indicadores + BioPulse Insight</div>
                <div className="text-white/45 text-sm mt-1">Explicación y trazabilidad del “por qué” (sin humo).</div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/60 text-xs uppercase tracking-wider">Insight</div>
                  <div className="mt-2 text-white/85 text-sm leading-relaxed">
                    {event.aiInsight?.narrative ? event.aiInsight.narrative : "BioPulse Insight aún no está disponible para este evento."}
                  </div>

                  {typeof event.aiInsight?.confidence === "number" ? (
                    <div className="mt-3 text-white/40 text-xs">
                      Confianza del modelo: {Math.round(event.aiInsight.confidence * 100)}%
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : view === "guardian" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">🛡️ Herramientas del guardián</div>
                <div className="text-white/45 text-sm mt-1">UI prototipo. Backend después.</div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/80 text-sm">
                    Sos parte de la red. Podés reportar evidencia, confirmar datos y ayudar a priorizar.
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/15 p-4 text-left transition-colors"
                    >
                      <div className="text-cyan-100 font-semibold mb-1">📍 Reportar observación</div>
                      <div className="text-cyan-200/60 text-sm">Foto, ubicación, humo, viento, avance.</div>
                    </button>

                    <button
                      type="button"
                      className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/15 p-4 text-left transition-colors"
                    >
                      <div className="text-cyan-100 font-semibold mb-1">✅ Confirmar datos</div>
                      <div className="text-cyan-200/60 text-sm">¿La ubicación/estado coincide con lo que ves?</div>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border border-red-400/30 bg-red-400/10 hover:bg-red-400/15 p-4 text-left transition-colors"
                  >
                    <div className="text-red-100 font-semibold mb-1">🚨 Solicitar ayuda / escalar</div>
                    <div className="text-red-200/60 text-sm">CTA a fuentes oficiales (placeholder).</div>
                  </button>
                </div>
              </div>
            </>
          ) : view === "news" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">📰 Noticias + redes</div>
                <div className="text-white/45 text-sm mt-1">
                  Orden: {isBreaking ? "breaking/urgente" : "actualizaciones"} → gobierno → bomberos → medios → sensación en redes.
                </div>

                {isBreaking ? (
                  <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-4">
                    <div className="text-red-100 text-xs uppercase tracking-wider">BREAKING / Urgente</div>
                    <div className="mt-2 text-red-100/90 text-sm">
                      Señal indica urgencia estimada. En producción, esto se valida con evacuaciones/cortes y partes oficiales.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-white/60 text-xs uppercase tracking-wider">Actualizaciones</div>
                    <div className="mt-2 text-white/75 text-sm">
                      No se detectó urgencia inmediata por señal. Se muestran fuentes y contexto; el orden prioriza oficiales.
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-white/80 text-sm font-semibold">Gobierno (primero)</div>
                      <span className={["rounded-full border px-2 py-0.5 text-[11px]", sourceBadge("government").cls].join(" ")}>
                        {sourceBadge("government").label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      {newsItems.filter((n) => n.kind === "government").map((n) => (
                        <NewsCard key={n.id} item={n} onOpen={openNewsItem} />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-white/80 text-sm font-semibold">Bomberos (segundo)</div>
                      <span className={["rounded-full border px-2 py-0.5 text-[11px]", sourceBadge("firefighters").cls].join(" ")}>
                        {sourceBadge("firefighters").label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      {newsItems.filter((n) => n.kind === "firefighters").map((n) => (
                        <NewsCard key={n.id} item={n} onOpen={openNewsItem} />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-white/80 text-sm font-semibold">Medios (tercero)</div>
                      <span className={["rounded-full border px-2 py-0.5 text-[11px]", sourceBadge("media").cls].join(" ")}>
                        {sourceBadge("media").label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      {newsItems.filter((n) => n.kind === "media").map((n) => (
                        <NewsCard key={n.id} item={n} onOpen={openNewsItem} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/60 text-xs uppercase tracking-wider">Sensación en redes</div>
                  <div className="mt-2 text-white/70 text-sm">
                    Placeholder UI: citas/observaciones. Luego: contador + mapa de calor social + reels/videos.
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <SocialQuote who="Vecino/a (simulado)" text="Se ve una columna de humo hacia el oeste. El viento cambió hace unos minutos." />
                    <SocialQuote who="Cuenta local (simulado)" text="Piden no circular por el acceso rural. Se escuchan sirenas en la zona." />
                  </div>
                </div>

                <div className="mt-3 text-white/35 text-xs">
                  Próximo: Worker que normaliza RSS/APIs + deduplicación + adjunta multimedia.
                </div>
              </div>
            </>
          ) : view === "news_item" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white/90 font-semibold text-lg">🧾 Detalle de noticia</div>
                    <div className="text-white/45 text-sm mt-1">Se abre dentro del panel (no salimos de BioPulse).</div>
                  </div>

                  <button
                    type="button"
                    className="shrink-0 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 text-sm transition-colors"
                    onClick={backFromNewsItem}
                  >
                    Volver a noticias
                  </button>
                </div>

                {selectedNews ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                    {selectedNews.imageUrl ? (
                      <img src={selectedNews.imageUrl} alt="" className="h-56 w-full object-cover opacity-90" loading="lazy" />
                    ) : (
                      <div className="h-48 w-full bg-gradient-to-br from-white/10 to-white/0" />
                    )}

                    <div className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={["rounded-full border px-2 py-0.5 text-[11px]", sourceBadge(selectedNews.kind).cls].join(" ")}>
                          {sourceBadge(selectedNews.kind).label}
                        </span>
                        <span className="text-white/40 text-[11px]">{timeAgoFrom(selectedNews.publishedAt)}</span>
                        <span className="text-white/35 text-[11px]">•</span>
                        <span className="text-white/55 text-[11px]">{selectedNews.sourceName}</span>
                      </div>

                      <div className="mt-2 text-white/95 text-lg font-semibold">{selectedNews.title}</div>
                      <div className="mt-2 text-white/70 text-sm">{selectedNews.summary}</div>

                      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                        <div className="text-white/60 text-xs uppercase tracking-wider">Contenido</div>
                        <div className="mt-2 text-white/80 text-sm leading-relaxed whitespace-pre-line">{selectedNews.body}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-white/70 text-sm">
                    No se encontró la noticia seleccionada.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        <style>{`
          .pulse-dot{ animation: pulse 1.25s ease-in-out infinite; }
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

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
