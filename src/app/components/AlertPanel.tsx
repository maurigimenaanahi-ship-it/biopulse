// AlertPanel.tsx
import { useEffect, useMemo, useState } from "react";
import type { EnvironmentalEvent } from "@/data/events";
import { categoryLabels, categoryColors } from "@/data/events";
import { X, ChevronDown, ChevronUp, Link2, Star } from "lucide-react";

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

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtCoord(x: unknown, digits = 4) {
  return isFiniteNumber(x) ? x.toFixed(digits) : "—";
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

  const mTrend = desc.match(/Trend:\s*([A-Za-z]+)/i);
  if (mTrend?.[1]) out.trendLabel = mTrend[1].trim();

  const mFrp = desc.match(
    /FRP\s*max\s*([0-9]+(?:\.[0-9]+)?)\s*.*FRP\s*sum\s*([0-9]+(?:\.[0-9]+)?)/i
  );
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
  if (p >= 80) return { stroke: "rgba(248,113,113,0.85)", glow: "rgba(248,113,113,0.20)" };
  if (p >= 55) return { stroke: "rgba(251,146,60,0.85)", glow: "rgba(251,146,60,0.18)" };
  if (p >= 30) return { stroke: "rgba(250,204,21,0.75)", glow: "rgba(250,204,21,0.12)" };
  return { stroke: "rgba(110,231,183,0.75)", glow: "rgba(110,231,183,0.12)" };
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
  const deg = (p / 100) * 270;
  const tone = ringTone(p);

  const bg = `conic-gradient(from 225deg, ${tone.stroke} 0deg ${deg}deg, rgba(255,255,255,0.10) ${deg}deg 270deg, rgba(255,255,255,0) 270deg 360deg)`;

  const markerDeg = 225 + deg;
  const rad = (markerDeg * Math.PI) / 180;
  const r = 42;
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

          <div
            className="absolute h-2.5 w-2.5 rounded-full border border-white/30"
            style={{
              left: mx - 5,
              top: my - 5,
              background: "rgba(255,255,255,0.85)",
              boxShadow: "0 0 10px rgba(255,255,255,0.12)",
            }}
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-white/90 text-lg font-semibold leading-none">{Math.round(p)}</div>
            <div className="text-white/35 text-[11px]">nivel</div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-white/90 text-xl font-semibold">{valueFmt(value)}</div>
          {humanLine ? <div className="mt-1 text-white/70 text-sm">{humanLine}</div> : null}
        </div>
      </div>
    </div>
  );
}

// ===== Weather =====
type WeatherOps = {
  windowLabel: string;
  rainProbMaxPct?: number;
  windMaxKmh?: number;
  humidityMinPct?: number;
  tempAvgC?: number;
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

// ===== Critical Alert Type =====
type CriticalAlert = {
  type: "evacuation" | "official" | "imminent_risk";
  message: string;
  timestamp: Date;
  source?: string;
};

function detectCriticalAlert(event: EnvironmentalEvent): CriticalAlert | null {
  if (event.evacuationLevel && event.evacuationLevel.toLowerCase() === "mandatory") {
    return {
      type: "evacuation",
      message: "EVACUACIÓN OBLIGATORIA EN CURSO",
      timestamp: event.timestamp,
      source: "Defensa Civil",
    };
  }

  if (event.severity === "critical" && event.status === "escalating") {
    return {
      type: "imminent_risk",
      message: "RIESGO INMINENTE - EVENTO ESCALANDO",
      timestamp: event.timestamp,
    };
  }

  if (event.category === "fire" && event.severity === "critical") {
    return {
      type: "official",
      message: "ALERTA CRÍTICA - INCENDIO DE ALTA SEVERIDAD",
      timestamp: event.timestamp,
    };
  }

  return null;
}

// ===== Breaking News Bar Component =====
function BreakingNewsBar({ alert }: { alert: CriticalAlert }) {
  const iconMap = {
    evacuation: "🚨",
    official: "⚠️",
    imminent_risk: "🔴",
  } as const;

  const bgColorMap = {
    evacuation: "bg-red-500/90",
    official: "bg-orange-500/90",
    imminent_risk: "bg-red-600/90",
  } as const;

  return (
    <div
      className={[
        bgColorMap[alert.type],
        "relative px-6 py-4",
        "border-b-4 border-white/30",
        "backdrop-blur-sm",
      ].join(" ")}
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl animate-pulse">{iconMap[alert.type]}</span>
          <div>
            <div className="text-white text-xs font-semibold uppercase tracking-wider">BREAKING NEWS</div>
            <div className="text-white text-lg md:text-xl font-bold mt-0.5">{alert.message}</div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-white/90 text-sm font-medium">{timeAgoFrom(alert.timestamp)}</div>
          {alert.source ? <div className="text-white/70 text-xs mt-0.5">Fuente: {alert.source}</div> : null}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-pulse" />
    </div>
  );
}

// ===== Collapsible section =====
function Section(props: {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  accent?: "neutral" | "cyan" | "green" | "orange";
  defaultOpen?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { title, subtitle, icon, open, onToggle, children } = props;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-5 md:px-6 py-4 bg-black/10 hover:bg-black/15 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white/90 font-semibold text-base md:text-lg uppercase tracking-wide flex items-center gap-2">
              {icon ? <span>{icon}</span> : null}
              <span className="truncate">{title}</span>
            </div>
            {subtitle ? <div className="text-white/45 text-sm mt-1">{subtitle}</div> : null}
          </div>

          <div className="shrink-0 mt-0.5">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white/75">
              {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </span>
          </div>
        </div>
      </button>

      {open ? <div className="px-5 md:px-6 py-5">{children}</div> : null}
    </div>
  );
}

export function AlertPanel(props: { event: EnvironmentalEvent | null; onClose: () => void }) {
  const { event, onClose } = props;

  const [weatherOps, setWeatherOps] = useState<WeatherOps | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Accordion state
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({
    ops: true,
    sat: true,
    cams: false,
    env: false,
    human: false,
    insight: true,
    tools: true,
    news: true,
  });

  const toggle = (id: string) => {
    setOpenIds((s) => ({ ...s, [id]: !s[id] }));
  };

  useEffect(() => {
    if (!event) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [event, onClose]);

  // Reset per-event
  useEffect(() => {
    if (typeof window === "undefined") return;
    setWeatherOps(null);
    setWeatherLoading(false);

    // default accordion on new event
    setOpenIds({
      ops: true,
      sat: true,
      cams: false,
      env: false,
      human: false,
      insight: true,
      tools: true,
      news: true,
    });
  }, [event?.id]);

  const header = useMemo(() => {
    if (!event) return null;
    const cat = categoryLabels[event.category] ?? event.category;
    const color = categoryColors[event.category] ?? "#7dd3fc";
    return { cat, color };
  }, [event?.id]);

  const ops = useMemo(() => extractOpsFromDescription(event?.description), [event?.id]);

  const criticalAlert = useMemo(() => {
    if (!event) return null;
    return detectCriticalAlert(event);
  }, [event]);

  // Weather fetch
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

  if (!event || !header) return null;

  const utc = formatTimeUTC(event.timestamp);
  const lastSignalAgo = timeAgoFrom(event.timestamp);

  const opsBadge = ops.trendLabel
    ? { text: `TREND: ${ops.trendLabel}`, className: trendBadgeStyle(ops.trendLabel) }
    : null;

  const frpScale = 120;
  const detScale = 25;
  const sumScale = 250;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?event=${encodeURIComponent(event.id)}`
      : "";

  const safeLocation =
    (event as any)?.location && String((event as any).location).trim().length
      ? (event as any).location
      : "Ubicación por definir (sin geocoding todavía)";

  async function copyLink() {
    try {
      if (!shareUrl) return;
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // no-op
    }
  }

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
          "w-[calc(100%-24px)] md:w-[900px]",
          "max-h-[88vh] overflow-hidden",
          "rounded-2xl border border-white/10 bg-[#0a0f1a]/95 shadow-2xl",
          "backdrop-blur-md",
          // IMPORTANT: scroll fix
          "flex flex-col",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Breaking News Bar (conditional) */}
        {criticalAlert ? <BreakingNewsBar alert={criticalAlert} /> : null}

        {/* Accent bar */}
        <div
          className="h-1.5"
          style={{
            background: `linear-gradient(90deg, ${header.color}CC, ${header.color}14, transparent)`,
          }}
        />

        {/* HEADER */}
        <div className="relative border-b border-white/10 bg-black/10 p-5 md:p-6">
          <div className="flex items-center justify-between gap-2">
            {/* left actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={[
                  "h-9 rounded-xl px-3",
                  "border border-white/10 bg-white/5",
                  "text-white/80 hover:text-white hover:bg-white/10",
                  "transition-colors",
                  "inline-flex items-center gap-2",
                ].join(" ")}
                onClick={() => {
                  // placeholder: in futuro lo conectamos a tu sistema de "watchlist"
                }}
                title="Seguir alerta"
              >
                <Star className="h-4 w-4" />
                <span className="text-sm">Seguir alerta</span>
              </button>

              <button
                type="button"
                className={[
                  "h-9 rounded-xl px-3",
                  "border border-white/10 bg-white/5",
                  "text-white/80 hover:text-white hover:bg-white/10",
                  "transition-colors",
                  "inline-flex items-center gap-2",
                ].join(" ")}
                onClick={copyLink}
                title="Copiar link"
              >
                <Link2 className="h-4 w-4" />
                <span className="text-sm">Copiar link</span>
              </button>
            </div>

            {/* close */}
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
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="text-white/55 text-xs uppercase tracking-wider flex items-center gap-2 mt-3">
            <span>
              {header.cat} • {utc}
            </span>
          </div>

          <div className="mt-2 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-white text-2xl md:text-3xl font-semibold leading-tight">{event.title}</div>
              <div className="mt-2 text-white/80 text-sm md:text-base font-medium">{safeLocation}</div>
              <div className="mt-1 text-white/45 text-xs">
                {fmtCoord((event as any).latitude)}, {fmtCoord((event as any).longitude)}
              </div>
            </div>
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
          </div>
        </div>

        {/* Content area (SCROLL FIX) */}
        <div className="p-5 md:p-6 overflow-y-auto flex-1 min-h-0 space-y-5">
          {/* 1. ESTADO OPERATIVO */}
          <Section
            id="ops"
            title="ESTADO OPERATIVO"
            subtitle={`Sistema de análisis en tiempo real • Última actualización: ${lastSignalAgo}`}
            icon="🚨"
            open={!!openIds.ops}
            onToggle={() => toggle("ops")}
          >
            {/* Lectura del evento */}
            <div className="rounded-xl border border-white/10 bg-white/[0.08] p-4 mb-4">
              <div className="text-white/60 text-xs uppercase tracking-wider mb-3">🔥 LECTURA DEL EVENTO</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-white/85 font-semibold">Intensidad:</span>{" "}
                  <span className="text-white/75">{intensityHuman(ops.frpMax)}</span>
                </div>
                <div>
                  <span className="text-white/85 font-semibold">Actividad:</span>{" "}
                  <span className="text-white/75">{activityHuman(ops.detections, ops.trendLabel, event.status)}</span>
                </div>
                <div>
                  <span className="text-white/85 font-semibold">Estado:</span>{" "}
                  <span className="text-white/75">{stateHuman(event.status)}</span>
                </div>
                <div>
                  <span className="text-white/85 font-semibold">Trend:</span>{" "}
                  <span className="text-white/75">{ops.trendLabel ?? "—"}</span>
                </div>
              </div>

              <div className="mt-3 text-white/35 text-[11px]">
                Lectura interpretativa basada en detecciones satelitales (VIIRS) y métricas FRP.
              </div>
            </div>

            {/* Indicadores operativos (gauges) */}
            <div className="mb-4">
              <div className="text-white/85 text-sm font-semibold mb-1">📊 INDICADORES OPERATIVOS</div>
              <div className="text-white/45 text-xs mb-3">Visual + número + explicación. Esto traduce la señal, no la "inventa".</div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <GaugeRing
                  label="Intensidad"
                  value={ops.frpMax}
                  max={frpScale}
                  valueFmt={(v) => (typeof v === "number" ? `${v.toFixed(2)} FRP` : "—")}
                  hint="Radiative Power"
                  humanLine={
                    typeof ops.frpMax === "number" ? `Lectura: ${intensityHuman(ops.frpMax)}` : "Sin FRP max disponible"
                  }
                />

                <GaugeRing
                  label="Actividad"
                  value={ops.detections}
                  max={detScale}
                  valueFmt={(v) => (typeof v === "number" ? `${v} detect.` : "—")}
                  hint="Señales VIIRS"
                  humanLine={
                    typeof ops.detections === "number"
                      ? `Lectura: ${activityHuman(ops.detections, ops.trendLabel, event.status)}`
                      : "Sin detections disponibles"
                  }
                />

                <GaugeRing
                  label="Energía total"
                  value={ops.frpSum}
                  max={sumScale}
                  valueFmt={(v) => (typeof v === "number" ? `${v.toFixed(2)} FRP` : "—")}
                  hint="Acumulado"
                  humanLine={typeof ops.frpSum === "number" ? "Aprox. energía radiativa acumulada del cluster." : "Sin FRP sum disponible"}
                />
              </div>
            </div>

            {/* Ventana operativa */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-white/85 text-sm font-semibold mb-1">🌦 VENTANA OPERATIVA</div>
              <div className="text-white/45 text-xs mb-3">Condiciones que pueden cambiar la dinámica del evento (próximas 12h UTC).</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Lluvia</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatPct(weatherOps?.rainProbMaxPct)}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Viento</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatKmh(weatherOps?.windMaxKmh)}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Humedad</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatPct(weatherOps?.humidityMinPct)}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Temp.</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatC(weatherOps?.tempAvgC)}</div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/60 text-xs uppercase tracking-wider mb-2">💬 Análisis de condiciones</div>
                <div className="text-white/80 text-sm leading-relaxed">
                  {weatherLoading ? "Cargando condiciones locales…" : weatherOps?.narrative ?? "Sin datos meteorológicos disponibles por ahora."}
                </div>
              </div>
            </div>

            {/* Status + Evacuación */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">Status</div>
                <div className="mt-1 text-white/90 text-base font-semibold">{statusLabel(event.status)}</div>
                <div className="mt-2 text-white/45 text-xs">
                  Última señal: <span className="text-white/70">{lastSignalAgo}</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">Evacuación</div>
                <div className="mt-1 text-white/90 text-base font-semibold">
                  {event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}
                </div>
                <div className="mt-1 text-white/45 text-xs">Fuente: Defensa Civil</div>
              </div>
            </div>
          </Section>

          {/* 2. OBSERVACIÓN SATELITAL */}
          <Section
            id="sat"
            title="OBSERVACIÓN SATELITAL"
            subtitle={`Fuente: NASA FIRMS VIIRS_SNPP_NRT • Última captura: ${lastSignalAgo}`}
            icon="🛰️"
            open={!!openIds.sat}
            onToggle={() => toggle("sat")}
          >
            {event.satelliteImageUrl ? (
              <div className="rounded-xl overflow-hidden border border-white/10 mb-4">
                <img src={event.satelliteImageUrl} alt="Satellite imagery" className="w-full h-auto object-cover opacity-90" loading="lazy" />
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 p-8 text-center mb-4">
                <div className="text-white/50 text-sm">No hay imagen satelital disponible para este evento</div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-white/60 text-xs uppercase tracking-wider mb-2">📡 Métricas de detección</div>
              <div className="text-white/80 text-sm">
                {ops.frpMax ? `FRP max: ${ops.frpMax.toFixed(2)} MW` : ""}
                {ops.frpSum ? ` • FRP sum: ${ops.frpSum.toFixed(2)} MW` : ""}
                {ops.detections ? ` • Detected: ${ops.detections} fire signals` : ""}
              </div>
            </div>
          </Section>

          {/* 3. CÁMARAS PÚBLICAS CERCANAS */}
          <Section
            id="cams"
            title="CÁMARAS PÚBLICAS CERCANAS"
            subtitle="Red de observación visual comunitaria"
            icon="📹"
            open={!!openIds.cams}
            onToggle={() => toggle("cams")}
          >
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-white/80 text-sm font-medium mb-2">No hay cámaras públicas registradas cerca</div>
              <div className="text-white/45 text-xs">Próximo: botón para “Proponer una cámara” (guardianes) y validación.</div>
            </div>
          </Section>

          {/* 4. CONTEXTO AMBIENTAL */}
          <Section
            id="env"
            title="CONTEXTO AMBIENTAL"
            subtitle="Ecosistemas y biodiversidad en riesgo"
            icon="🌱"
            open={!!openIds.env}
            onToggle={() => toggle("env")}
          >
            {event.ecosystems && event.ecosystems.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 mb-3">
                <div className="text-white/60 text-xs uppercase tracking-wider mb-2">🌲 Ecosistemas afectados</div>
                <ul className="text-white/80 text-sm space-y-1">
                  {event.ecosystems.map((eco, i) => (
                    <li key={i}>• {eco}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {event.speciesAtRisk && event.speciesAtRisk.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-white/60 text-xs uppercase tracking-wider mb-2">🦜 Especies en riesgo (UICN)</div>
                <ul className="text-white/80 text-sm space-y-1">
                  {event.speciesAtRisk.map((sp, i) => (
                    <li key={i}>• {sp}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(!event.ecosystems || event.ecosystems.length === 0) && (!event.speciesAtRisk || event.speciesAtRisk.length === 0) ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-white/50 text-sm">Aún sin datos ambientales asociados a este evento.</div>
              </div>
            ) : null}
          </Section>

          {/* 5. IMPACTO HUMANO */}
          <Section
            id="human"
            title="IMPACTO HUMANO"
            subtitle="Análisis de población e infraestructura afectada"
            icon="👥"
            open={!!openIds.human}
            onToggle={() => toggle("human")}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">POBLACIÓN</div>
                <div className="mt-1 text-white/90 text-base font-semibold">
                  {event.affectedPopulation ? `≈ ${event.affectedPopulation.toLocaleString("es-AR")}` : "—"}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">ÁREA</div>
                <div className="mt-1 text-white/90 text-base font-semibold">{event.affectedArea ? `≈ ${Math.round(event.affectedArea)} km²` : "—"}</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">EVACUADOS</div>
                <div className="mt-1 text-white/90 text-base font-semibold">—</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">NIVEL EVAC.</div>
                <div className="mt-1 text-white/90 text-base font-semibold">
                  {event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-white/60 text-xs uppercase tracking-wider mb-2">🏘️ Información adicional</div>
              <div className="text-white/50 text-sm">Datos de comunidades e infraestructura crítica se agregarán cuando estén disponibles.</div>
            </div>
          </Section>

          {/* 6. INDICADORES + INSIGHT */}
          <Section
            id="insight"
            title="INDICADORES + BIOPULSE INSIGHT"
            subtitle="Análisis predictivo basado en IA"
            icon="🧠"
            open={!!openIds.insight}
            onToggle={() => toggle("insight")}
          >
            {(event as any).aiInsight?.narrative ? (
              <div className="rounded-xl border border-white/10 bg-[rgba(100,200,255,0.05)] p-4">
                <div className="text-white/60 text-xs uppercase tracking-wider mb-2">🤖 BioPulse Insight</div>
                <div className="text-white/85 text-sm leading-relaxed">{(event as any).aiInsight.narrative}</div>
                {(event as any).aiInsight.confidence ? (
                  <div className="mt-3 text-white/40 text-xs">Confianza del modelo: {Math.round((event as any).aiInsight.confidence * 100)}%</div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-white/50 text-sm">BioPulse Insight aún no disponible para este evento.</div>
              </div>
            )}
          </Section>

          {/* 7. HERRAMIENTAS DEL GUARDIÁN */}
          <Section
            id="tools"
            title="HERRAMIENTAS DEL GUARDIÁN"
            subtitle="Tu observación fortalece el sistema • 1,240 guardianes activos"
            icon="🛡️"
            open={!!openIds.tools}
            onToggle={() => toggle("tools")}
          >
            <div className="mb-4 text-white/70 text-sm">
              Sos parte de la red de respuesta. Tu reporte puede salvar vidas y mejorar la precisión de BioPulse para todos.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <button type="button" className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/15 p-4 text-left transition-colors">
                <div className="text-cyan-100 font-semibold mb-1">📍 REPORTAR OBSERVACIÓN</div>
                <div className="text-cyan-200/60 text-sm">¿Estás cerca del evento? Compartí foto, ubicación o condiciones actuales.</div>
              </button>

              <button type="button" className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/15 p-4 text-left transition-colors">
                <div className="text-cyan-100 font-semibold mb-1">✅ CONFIRMAR DATOS</div>
                <div className="text-cyan-200/60 text-sm">¿Esta info es correcta? Ayudanos a validar ubicación y condiciones.</div>
              </button>
            </div>

            <button type="button" className="w-full rounded-xl border border-red-400/30 bg-red-400/10 hover:bg-red-400/15 p-4 text-left transition-colors">
              <div className="text-red-100 font-semibold mb-1">🚨 SOLICITAR AYUDA / ESCALAR</div>
              <div className="text-red-200/60 text-sm">Si la situación empeoró o necesitás asistencia urgente, contactá a Defensa Civil.</div>
            </button>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-white/60 text-xs uppercase tracking-wider mb-2">💡 Reportes recientes de otros guardianes</div>
              <div className="text-white/50 text-sm">Próximamente: feed de reportes en tiempo real de la red de guardianes.</div>
            </div>
          </Section>

          {/* 8. NOTICIAS + REDES SOCIALES */}
          <Section
            id="news"
            title="NOTICIAS Y REDES SOCIALES"
            subtitle="Fuentes verificadas • Actualización automática cada 15min"
            icon="📰"
            open={!!openIds.news}
            onToggle={() => toggle("news")}
          >
            {/* Alertas urgentes */}
            <div className="mb-4">
              <div className="text-white/75 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>🚨 ALERTAS URGENTES</span>
                <span className="rounded-full bg-red-500/20 border border-red-400/30 px-2 py-0.5 text-[11px] text-red-100">
                  2 ACTIVAS
                </span>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border-l-4 border-red-400/60 bg-red-400/[0.08] p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-red-100 font-semibold text-base">⚠️ EVACUACIÓN OBLIGATORIA AMPLIADA - Zona Roja Extendida</div>
                    <span className="shrink-0 rounded-full bg-red-500/30 border border-red-400/40 px-2 py-0.5 text-[11px] text-red-100">
                      URGENTE
                    </span>
                  </div>

                  <div className="text-red-200/70 text-xs mb-2">Defensa Civil Provincial • hace 45 min</div>

                  <div className="text-red-100/90 text-sm leading-relaxed mb-3">
                    Se amplía zona de evacuación obligatoria a Villa Futaleufú (sector este) y comunidades de Los Cipreses,
                    Aldea Escolar y Puerto Ramírez. Dirigirse a puntos de encuentro: Escuela Nº 156 (Ruta 259 km 8) y
                    Gimnasio Municipal. Transporte disponible desde Plaza Central cada 30 minutos.
                  </div>

                  <div className="flex gap-2">
                    <button className="rounded-lg border border-red-300/30 bg-red-300/10 hover:bg-red-300/20 px-3 py-1.5 text-sm text-red-100 transition-colors">
                      📄 Leer comunicado completo →
                    </button>
                    <button className="rounded-lg border border-red-300/30 bg-red-300/10 hover:bg-red-300/20 px-3 py-1.5 text-sm text-red-100 transition-colors">
                      🔗 Compartir
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border-l-4 border-orange-400/60 bg-orange-400/[0.08] p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-orange-100 font-semibold text-base">🔴 Corte de Ruta Provincial 259 por humo denso</div>
                    <span className="shrink-0 rounded-full bg-orange-500/30 border border-orange-400/40 px-2 py-0.5 text-[11px] text-orange-100">
                      URGENTE
                    </span>
                  </div>

                  <div className="text-orange-200/70 text-xs mb-2">Vialidad Provincial Chubut • hace 1h 20min</div>

                  <div className="text-orange-100/90 text-sm leading-relaxed mb-3">
                    Tránsito suspendido entre km 5 y km 18 (Villa Futaleufú - cruce internacional). Visibilidad reducida a menos de 50
                    metros. Desvío habilitado por Ruta 71 (Los Cipreses). Se recomienda evitar circular por la zona.
                  </div>

                  <div className="flex gap-2">
                    <button className="rounded-lg border border-orange-300/30 bg-orange-300/10 hover:bg-orange-300/20 px-3 py-1.5 text-sm text-orange-100 transition-colors">
                      📄 Ver detalles →
                    </button>
                    <button className="rounded-lg border border-orange-300/30 bg-orange-300/10 hover:bg-orange-300/20 px-3 py-1.5 text-sm text-orange-100 transition-colors">
                      🔗 Compartir
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Noticias generales */}
            <div className="mb-4">
              <div className="text-white/75 text-xs uppercase tracking-wider mb-3">📄 NOTICIAS GENERALES</div>

              <div className="space-y-2">
                {[
                  { t: "🧯 Brigadas de bomberos de 4 provincias en camino a Futaleufú", s: "Ministerio de Seguridad Nacional • hace 2h" },
                  { t: "🏥 Hospital Regional Esquel en alerta por posibles inhalaciones de humo", s: "Ministerio de Salud Chubut • hace 3h" },
                  { t: "🌐 Chile ofrece apoyo con aviones hidrantes desde Coyhaique", s: "Cancillería Argentina • hace 4h" },
                  { t: "🌲 Parques Nacionales evalúa daños en Bosque Andino Patagónico", s: "Administración de Parques Nacionales • hace 5h" },
                ].map((x, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 p-3 transition-colors cursor-pointer">
                    <div className="text-white/85 font-medium text-sm mb-1">{x.t}</div>
                    <div className="text-white/45 text-xs mb-2">{x.s}</div>
                    <button className="text-cyan-300/80 hover:text-cyan-300 text-xs transition-colors">Leer más →</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Actividad en redes sociales */}
            <div>
              <div className="text-white/75 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>🐦 ACTIVIDAD EN REDES SOCIALES</span>
                <span className="text-white/40 text-[11px]">(últimas 6h)</span>
              </div>

              <div className="space-y-2">
                {[
                  {
                    u: "@AlertasChubutOK",
                    v: true,
                    t: `"Columna de humo visible desde 40km. Viento del oeste empujando hacia Villa Futaleufú. Autoridades recomiendan cerrar ventanas y permanecer en interior."`,
                    ago: "hace 1h 15min",
                  },
                  {
                    u: "@BomberosVolFutaleufu",
                    v: true,
                    t: `"Evacuación en progreso coordinada con Defensa Civil. 3 camiones trabajando en perímetro norte. Pedimos colaboración de vecinos para mantener rutas despejadas."`,
                    ago: "hace 2h 40min",
                  },
                  {
                    u: "@MeteoPatagonia",
                    v: false,
                    t: `"Cambio de viento esperado para esta noche (rotación a sur). Podría ayudar a frenar avance hacia zona poblada. Humedad relativa sigue baja (22%)."`,
                    ago: "hace 3h 50min",
                  },
                ].map((x, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-cyan-400/20 flex items-center justify-center shrink-0">
                        <span className="text-cyan-300 text-xs">🐦</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white/85 text-sm font-medium">{x.u}</span>
                          {x.v ? (
                            <span className="rounded-full bg-cyan-400/20 border border-cyan-400/30 px-1.5 py-0.5 text-[10px] text-cyan-200">
                              ✓ Verificado
                            </span>
                          ) : null}
                        </div>
                        <div className="text-white/70 text-sm leading-relaxed mb-2">{x.t}</div>
                        <div className="flex items-center gap-3 text-white/40 text-xs">
                          <span>{x.ago}</span>
                          <button className="text-cyan-300/60 hover:text-cyan-300 transition-colors">Ver en Twitter →</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 py-2 text-sm text-white/70 hover:text-white transition-colors">
                Ver todas las menciones →
              </button>
            </div>
          </Section>
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
        `}</style>
      </div>
    </div>
  );
}
