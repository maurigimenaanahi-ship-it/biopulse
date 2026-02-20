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
  // dominios “obvios”
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

  // heurística: palabras clave en el dominio
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

  // Noticias: vista expandida dentro del panel (sin cambiar estructura global)
  const [newsView, setNewsView] = useState<"main" | "official" | "regional">("main");

  const [placeCache, setPlaceCache] = useState<Record<string, string>>({});

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

  useEffect(() => {
    if (!event) return;
    setNewsView("main");
    loadNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const splitNews = useMemo(() => {
    const items = Array.isArray(newsItems) ? newsItems : [];
    const official = items.filter(isOfficialItem);
    const regional = items.filter((x) => !isOfficialItem(x));
    return { official, regional };
  }, [newsItems]);

  const sirenActive = useMemo(() => {
    // regla: SOLO si existe comunicado oficial relevante
    return splitNews.official.some(isEvacuationRelevant);
  }, [splitNews.official]);

  if (!event) return null;

  const chip = sevChip(event.severity);

  return (
    // ✅ FIX: z-index alto para no quedar debajo de “Cambiar búsqueda / Mis alertas”
    <div className="pointer-events-auto fixed inset-0 z-[10050]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 z-0" onClick={onClose} />

      {/* Modal */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10",
          "w-[min(980px,92vw)] h-[min(86vh,720px)]",
          "rounded-3xl border border-white/10",
          "bg-[#060b16]/90 backdrop-blur-xl shadow-2xl overflow-hidden",
          "flex flex-col"
        )}
      >
        {/* Siren overlay (solo si sirenActive) */}
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
              {/* Botón alerta/sirena (solo si sirenActive) */}
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

        {/* Body (FIX scroll: flex-1 + min-h-0) */}
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
                      {detections != null && detections >= 15 ? "Sostenida" : detections != null && detections >= 6 ? "Activa" : "Leve"}
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

            {/* Noticias relacionadas (ahora: 2 subpaneles + Ver más + Volver) */}
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
                <div className="text-[11px] uppercase tracking-wide text-white/45">
                  Lugar usado: <span className="text-white/55 normal-case">{newsMeta?.placeUsed ?? "—"}</span>
                </div>

                {newsErr ? (
                  <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                    No se pudo cargar noticias. <span className="text-red-100/70">{newsErr}</span>
                  </div>
                ) : null}

                {newsLoading ? (
                  <div className="mt-4 space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-pulse">
                        <div className="h-4 w-2/3 bg-white/10 rounded" />
                        <div className="h-3 w-1/3 bg-white/10 rounded mt-2" />
                        <div className="h-3 w-full bg-white/10 rounded mt-3" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {/* MAIN: previews + Ver más */}
                    {newsView === "main" ? (
                      <>
                        {/* A) Comunicados oficiales */}
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

                        {/* B) Noticias de la región */}
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white/90">Noticias de la región</div>
                              <div className="text-xs text-white/45 mt-0.5">Secundario. Orden cronológico según resultados.</div>
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
                              <div className="text-sm text-white/55">No se encontraron noticias regionales con esta query.</div>
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

                    {/* OFFICIAL expanded */}
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

                    {/* REGIONAL expanded */}
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
                  <div className="mt-3 text-[11px] text-white/35">
                    Actualizado: {new Date(newsMeta.fetchedAt).toUTCString()}
                  </div>
                ) : null}
              </div>
            </SectionShell>

            {/* Indicadores operativos (tu bloque) */}
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

            {/* Condiciones placeholder (tu bloque, sin reestructurar) */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
              <div className="px-5 pt-4 pb-3">
                <div className="text-white/90 font-semibold">Condiciones</div>
                <div className="text-xs text-white/45 mt-0.5">A reconectar luego.</div>
              </div>

              <div className="px-5 pb-5 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <CloudRain className="h-4 w-4" /> Lluvia
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">—</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Wind className="h-4 w-4" /> Viento
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">—</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Droplets className="h-4 w-4" /> Humedad
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">—</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Thermometer className="h-4 w-4" /> Temp.
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">—</div>
                  </div>
                </div>

                <div className="text-[11px] text-white/30">
                  Nota: esto se completa cuando reconectemos el módulo de condiciones.
                </div>
              </div>
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
