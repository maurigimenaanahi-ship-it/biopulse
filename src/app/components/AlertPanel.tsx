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
  ShieldAlert,
} from "lucide-react";

type AlertPanelProps = {
  event: EnvironmentalEvent | null;
  onClose: () => void;
};

const WORKER_BASE = "https://square-frost-5487.maurigimenaanahi.workers.dev";

// ✅ Control legal/UX: si te incomoda, ponelo en false y listo.
const ALLOW_NEWS_IMAGES = true;

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

  // si no tiene coma, puede ser provincia/país; preferimos geocode igual
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

function buildHazardTerms(ev: EnvironmentalEvent) {
  return ev.category === "fire"
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
}

function buildNewsQueryFromPlace(ev: EnvironmentalEvent, place: string) {
  const { locality, state, country } = normalizePlaceForQuery(place);
  const hazard = buildHazardTerms(ev);

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

function buildOfficialQueryFromPlace(ev: EnvironmentalEvent, place: string) {
  const { locality, state, country } = normalizePlaceForQuery(place);
  const hazard = buildHazardTerms(ev);

  const official =
    "(comunicado OR oficial OR gobierno OR gobernación OR ministerio OR protección civil OR defensa civil OR bomberos OR brigadistas OR evacuación OR evacuar OR alerta OR emergencia)";

  const placeBlock = [
    locality ? `"${locality}"` : null,
    state ? `"${state}"` : null,
    country ? `"${country}"` : null,
    state ? `${state}` : null,
    country ? `${country}` : null,
  ]
    .filter(Boolean)
    .join(" OR ");

  return `(${placeBlock}) AND ${hazard} AND ${official}`;
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

function safeHostFromUrl(u: string | null) {
  if (!u) return "";
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}

function isProbablyOfficialDomain(host: string) {
  const h = (host ?? "").toLowerCase();
  if (!h) return false;

  // ✅ Argentina: patrones típicos oficiales
  if (h.endsWith(".gob.ar")) return true;
  if (h.endsWith(".gov.ar")) return true;
  if (h.includes("argentina.gob.ar")) return true;

  // Protección/defensa/bomberos (heurístico, se puede afinar después)
  const hints = ["defensacivil", "proteccioncivil", "bomberos", "brigada", "emergencia", "seguridad"];
  if (hints.some((k) => h.includes(k))) return true;

  return false;
}

function textLooksLikeEvacuation(t: string) {
  const s = (t ?? "").toLowerCase();
  const keys = ["evacu", "alerta", "orden", "emergencia", "desalojo", "zona de exclus", "toque de queda"];
  return keys.some((k) => s.includes(k));
}

function canUseImage(it: NewsItem) {
  if (!ALLOW_NEWS_IMAGES) return false;
  if (!it.image || !it.url) return false;
  if (!/^https?:\/\//i.test(it.image)) return false;

  // regla conservadora: si la imagen NO es URL válida, no.
  try {
    const imgHost = new URL(it.image).hostname;
    const artHost = new URL(it.url).hostname;
    // Permitimos si coincide host o si viene sin host “raro”
    if (imgHost === artHost) return true;

    // muchas socialimage vienen de cdn del mismo medio: permitimos si comparte el “root domain” simple
    const root = (h: string) => h.split(".").slice(-2).join(".");
    return root(imgHost) === root(artHost);
  } catch {
    return false;
  }
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

type NewsView = "summary" | "official_full" | "region_full";

export function AlertPanel({ event, onClose }: AlertPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // scroll-to-top al cambiar evento
  useEffect(() => {
    if (!event) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [event?.id]);

  // ====== NEWS state ======
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsErr, setNewsErr] = useState<string | null>(null);

  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialErr, setOfficialErr] = useState<string | null>(null);

  const [regionNews, setRegionNews] = useState<NewsItem[]>([]);
  const [officialNews, setOfficialNews] = useState<NewsItem[]>([]);

  const [newsMeta, setNewsMeta] = useState<{ placeUsed?: string } | null>(null);

  // cache de “place bueno” por event.id
  const [placeCache, setPlaceCache] = useState<Record<string, string>>({});

  // vista interna (usa el botón Volver del header)
  const [view, setView] = useState<NewsView>("summary");

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

  const loadRegionNews = async (ev: EnvironmentalEvent, place: string) => {
    setNewsLoading(true);
    setNewsErr(null);
    try {
      const query = buildNewsQueryFromPlace(ev, place);
      const data = await fetchNewsFromWorker({
        query,
        days: ev.category === "fire" ? 10 : 14,
        max: 12,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      const cleaned = items
        .filter((x) => x && (x.title || x.url))
        .map((x) => ({
          ...x,
          title: x.title?.trim() ?? null,
          summary: x.summary?.trim() ?? null,
        }));

      setRegionNews(cleaned);
    } catch (e: any) {
      setRegionNews([]);
      setNewsErr(e?.message ? String(e.message) : "No se pudo cargar noticias de la región.");
    } finally {
      setNewsLoading(false);
    }
  };

  const loadOfficialNews = async (ev: EnvironmentalEvent, place: string) => {
    setOfficialLoading(true);
    setOfficialErr(null);
    try {
      const query = buildOfficialQueryFromPlace(ev, place);
      const data = await fetchNewsFromWorker({
        query,
        days: 14,
        max: 20,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      const cleaned = items
        .filter((x) => x && (x.title || x.url))
        .map((x) => ({
          ...x,
          title: x.title?.trim() ?? null,
          summary: x.summary?.trim() ?? null,
        }))
        // ✅ filtro “oficial” por dominio (heurístico)
        .filter((it) => {
          const host = (it.domain || safeHostFromUrl(it.url)).toLowerCase();
          return isProbablyOfficialDomain(host);
        });

      setOfficialNews(cleaned);
    } catch (e: any) {
      setOfficialNews([]);
      setOfficialErr(e?.message ? String(e.message) : "No se pudo cargar comunicados oficiales.");
    } finally {
      setOfficialLoading(false);
    }
  };

  const loadAllNews = async () => {
    if (!event) return;

    // al recargar, volvemos a summary (no tocamos el botón volver del header, solo el estado)
    setView("summary");

    const place = await ensureNewsPlace(event);
    setNewsMeta({ placeUsed: place });

    await Promise.all([loadOfficialNews(event, place), loadRegionNews(event, place)]);
  };

  // Autoload al abrir/cambiar evento
  useEffect(() => {
    if (!event) return;
    loadAllNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  // Si cambia el evento, reseteamos vista interna a summary
  useEffect(() => {
    setView("summary");
  }, [event?.id]);

  if (!event) return null;

  const chip = sevChip(event.severity);

  // ✅ Sirena se activa SOLO si hay comunicado oficial con hint de evacuación/alerta
  const sirenOn = useMemo(() => {
    if (!officialNews.length) return false;
    return officialNews.some((it) => textLooksLikeEvacuation(`${it.title ?? ""} ${it.summary ?? ""}`));
  }, [officialNews]);

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-0 z-[10050]", // ✅ por encima de Cambiar búsqueda / Mis alertas
        sirenOn && "bp-siren-on"
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      tabIndex={-1}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Siren edge glow overlay */}
      {sirenOn ? (
        <div className="pointer-events-none absolute inset-0">
          <div className="bp-siren-edges" />
        </div>
      ) : null}

      {/* Modal */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[min(980px,92vw)] h-[min(86vh,720px)]",
          "rounded-3xl border border-white/10",
          "bg-[#060b16]/90 backdrop-blur-xl shadow-2xl overflow-hidden",
          "flex flex-col" // ✅ FIX scroll: header + body real
        )}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => {
                // ✅ “Volver” NO se quita: ahora sirve para las vistas expandidas
                if (view !== "summary") setView("summary");
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

            {/* ✅ Noticias (resumen / full) */}
            {view === "summary" ? (
              <SectionShell
                icon={<Newspaper className="h-5 w-5 text-white/80" />}
                title="Noticias"
                subtitle="Primero comunicados oficiales. Luego cobertura general de la región."
                right={
                  <button
                    onClick={loadAllNews}
                    className={cn(
                      "inline-flex items-center gap-2",
                      "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                      "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    )}
                    aria-label="Actualizar noticias"
                    title="Actualizar"
                  >
                    {(newsLoading || officialLoading) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="text-xs font-medium">Actualizar</span>
                  </button>
                }
              >
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4">
                  <div className="text-[11px] uppercase tracking-wide text-white/45">
                    Lugar usado:{" "}
                    <span className="text-white/55 normal-case">{newsMeta?.placeUsed ?? "—"}</span>
                  </div>

                  {/* A) Comunicados oficiales */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-white/70" />
                        <div className="text-sm font-semibold text-white/90">Comunicados oficiales</div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Sirena solo si hay comunicado relevante */}
                        {sirenOn ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-red-400/25 bg-red-500/10">
                            <Siren className="h-4 w-4 bp-siren-icon" />
                            <span className="text-xs font-semibold text-red-100/90">ALERTA / EVACUACIÓN</span>
                          </div>
                        ) : null}

                        <button
                          onClick={() => setView("official_full")}
                          className={cn(
                            "px-3 py-1.5 rounded-full border border-white/10 bg-black/20",
                            "text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                          )}
                        >
                          Ver más
                        </button>
                      </div>
                    </div>

                    {officialErr ? (
                      <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                        No se pudo cargar comunicados oficiales.{" "}
                        <span className="text-red-100/70">{officialErr}</span>
                      </div>
                    ) : null}

                    {officialLoading ? (
                      <div className="mt-3 text-sm text-white/50 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                      </div>
                    ) : officialNews.length === 0 ? (
                      <div className="mt-3 text-sm text-white/55">
                        No hay comunicados oficiales todavía.
                        <div className="text-xs text-white/35 mt-1">
                          (Esto busca fuentes gubernamentales y de emergencia. Cuando haya, aparece arriba con máxima prioridad.)
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {/* preview: mostramos 1–2 */}
                        {officialNews.slice(0, 2).map((it) => {
                          const host = (it.domain || safeHostFromUrl(it.url)).toLowerCase();
                          const when = it.publishedAt ? new Date(it.publishedAt) : null;

                          return (
                            <div key={it.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                              <div className="text-sm font-semibold text-white/90 line-clamp-2">
                                {it.title ?? "Comunicado oficial"}
                              </div>
                              <div className="mt-1 text-[11px] text-white/45">
                                {host ? <span className="text-white/55">{host}</span> : null}
                                {when ? (
                                  <>
                                    <span className="mx-2 text-white/20">•</span>
                                    <span>{when.toUTCString().replace("GMT", "UTC")}</span>
                                  </>
                                ) : null}
                              </div>
                              {it.summary ? (
                                <div className="mt-2 text-sm text-white/60 leading-relaxed line-clamp-2">
                                  {it.summary}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* B) Noticias de la región */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Newspaper className="h-4 w-4 text-white/70" />
                        <div className="text-sm font-semibold text-white/90">Noticias de la región</div>
                      </div>

                      <button
                        onClick={() => setView("region_full")}
                        className={cn(
                          "px-3 py-1.5 rounded-full border border-white/10 bg-black/20",
                          "text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                        )}
                      >
                        Ver más
                      </button>
                    </div>

                    {newsErr ? (
                      <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                        No se pudo cargar noticias de la región.{" "}
                        <span className="text-red-100/70">{newsErr}</span>
                      </div>
                    ) : null}

                    {newsLoading ? (
                      <div className="mt-3 text-sm text-white/50 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                      </div>
                    ) : regionNews.length === 0 ? (
                      <div className="mt-3 text-sm text-white/55">
                        No se encontraron artículos relevantes con esta búsqueda.
                        <div className="text-xs text-white/35 mt-1">
                          (Esto es estricto. Luego podemos sumar un “modo amplio” opcional.)
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {/* preview: 1 noticia */}
                        {regionNews.slice(0, 1).map((it) => {
                          const host = it.domain || safeHostFromUrl(it.url);
                          const when = it.publishedAt ? new Date(it.publishedAt) : null;
                          const showImg = canUseImage(it);

                          return (
                            <div key={it.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                              <div className="flex gap-3">
                                {showImg ? (
                                  <div className="shrink-0 w-24 h-16 rounded-lg overflow-hidden border border-white/10 bg-white/5">
                                    {/* hotlink thumbnail (opcional) */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={it.image as string} alt="" className="w-full h-full object-cover" />
                                  </div>
                                ) : null}

                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-white/90 line-clamp-2">
                                    {it.title ?? "Artículo"}
                                  </div>
                                  <div className="mt-1 text-[11px] text-white/45">
                                    {host ? <span className="text-white/55">{host}</span> : null}
                                    {when ? (
                                      <>
                                        <span className="mx-2 text-white/20">•</span>
                                        <span>{when.toUTCString().replace("GMT", "UTC")}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  {it.summary ? (
                                    <div className="mt-2 text-sm text-white/60 leading-relaxed line-clamp-2">
                                      {it.summary}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </SectionShell>
            ) : view === "official_full" ? (
              <SectionShell
                icon={<ShieldAlert className="h-5 w-5 text-white/80" />}
                title="Comunicados oficiales"
                subtitle="Lista completa (prioridad máxima). Si aparece evacuación, se activa sirena."
              >
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  {officialLoading ? (
                    <div className="text-sm text-white/50 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                    </div>
                  ) : officialNews.length === 0 ? (
                    <div className="text-sm text-white/55">No hay comunicados oficiales todavía.</div>
                  ) : (
                    <div className="space-y-3">
                      {officialNews.map((it) => {
                        const host = (it.domain || safeHostFromUrl(it.url)).toLowerCase();
                        const when = it.publishedAt ? new Date(it.publishedAt) : null;
                        const evac = textLooksLikeEvacuation(`${it.title ?? ""} ${it.summary ?? ""}`);

                        return (
                          <div key={it.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {evac ? <Siren className="h-4 w-4 bp-siren-icon" /> : null}
                                  <div className="text-sm font-semibold text-white/90 line-clamp-2">
                                    {it.title ?? "Comunicado oficial"}
                                  </div>
                                </div>

                                <div className="mt-1 text-[11px] text-white/45">
                                  {host ? <span className="text-white/55">{host}</span> : null}
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
                                    "px-3 py-2 rounded-xl border border-white/10 bg-black/20",
                                    "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                  )}
                                  title="Abrir fuente"
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
                      })}
                    </div>
                  )}
                </div>
              </SectionShell>
            ) : (
              <SectionShell
                icon={<Newspaper className="h-5 w-5 text-white/80" />}
                title="Noticias de la región"
                subtitle="Lista completa (cobertura general)."
              >
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  {newsLoading ? (
                    <div className="text-sm text-white/50 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                    </div>
                  ) : regionNews.length === 0 ? (
                    <div className="text-sm text-white/55">No se encontraron artículos relevantes.</div>
                  ) : (
                    <div className="space-y-3">
                      {regionNews.map((it) => {
                        const host = it.domain || safeHostFromUrl(it.url);
                        const when = it.publishedAt ? new Date(it.publishedAt) : null;
                        const showImg = canUseImage(it);

                        return (
                          <div key={it.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="flex gap-3">
                              {showImg ? (
                                <div className="shrink-0 w-28 h-20 rounded-lg overflow-hidden border border-white/10 bg-white/5">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={it.image as string} alt="" className="w-full h-full object-cover" />
                                </div>
                              ) : null}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-white/90 line-clamp-2">
                                      {it.title ?? "Artículo"}
                                    </div>
                                    <div className="mt-1 text-[11px] text-white/45">
                                      {host ? <span className="text-white/55">{host}</span> : null}
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
                                  <div className="mt-2 text-sm text-white/60 leading-relaxed line-clamp-3">
                                    {it.summary}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SectionShell>
            )}

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
                        {frpMax != null ? `${frpMax.toFixed(2)} FRP` : "—"}{" "}
                        <span className="text-white/50">max</span>
                      </div>
                      <div className="text-xs text-white/45 mt-1">
                        Lectura:{" "}
                        <span className="text-white/70 font-medium">
                          {event.severity === "critical"
                            ? "Muy alta"
                            : event.severity === "high"
                            ? "Alta"
                            : event.severity === "moderate"
                            ? "Media"
                            : "Baja"}
                        </span>
                      </div>
                      <div className="text-[11px] text-white/30 mt-2">Base: escala operativa (0–120).</div>
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
                        {detections != null ? `${detections}` : "—"}{" "}
                        <span className="text-white/50">detections</span>
                      </div>
                      <div className="text-xs text-white/45 mt-1">
                        Lectura:{" "}
                        <span className="text-white/70 font-medium">
                          {detections != null && detections >= 15
                            ? "Sostenida"
                            : detections != null && detections >= 6
                            ? "Activa"
                            : "Leve"}
                        </span>
                      </div>
                      <div className="text-[11px] text-white/30 mt-2">Base: escala operativa (0–25).</div>
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
                        {frpSum != null ? `${frpSum.toFixed(2)} FRP` : "—"}{" "}
                        <span className="text-white/50">sum</span>
                      </div>
                      <div className="text-xs text-white/45 mt-1">
                        Aprox. energía radiativa acumulada del cluster.
                      </div>
                      <div className="text-[11px] text-white/30 mt-2">Base: escala operativa (0–250).</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Condiciones (placeholder) */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
              <div className="px-5 pt-4 pb-3">
                <div className="text-white/90 font-semibold">Condiciones</div>
                <div className="text-xs text-white/45 mt-0.5">A reconectar luego (clima/índices).</div>
              </div>

              <div className="px-5 pb-5 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <CloudRain className="h-4 w-4" /> Lluvia
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">—</div>
                    <div className="text-[11px] text-white/35 mt-1">Próximas 12 h (UTC)</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Wind className="h-4 w-4" /> Viento
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">—</div>
                    <div className="text-[11px] text-white/35 mt-1">máx. estimado</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Droplets className="h-4 w-4" /> Humedad
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">—</div>
                    <div className="text-[11px] text-white/35 mt-1">mín. estimado</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40 flex items-center gap-2">
                      <Thermometer className="h-4 w-4" /> Temp.
                    </div>
                    <div className="mt-2 text-white/90 font-semibold">—</div>
                    <div className="text-[11px] text-white/35 mt-1">promedio</div>
                  </div>
                </div>

                <div className="text-[11px] text-white/30">
                  Nota: esta sección la volvemos a conectar con la fuente meteorológica que ya tenías.
                </div>
              </div>
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>

      {/* Tiny CSS for siren */}
      <style>{`
        .bp-siren-icon {
          animation: bpSirenPulse 1.1s ease-in-out infinite;
        }
        @keyframes bpSirenPulse {
          0%, 100% { transform: translateY(0); filter: drop-shadow(0 0 0 rgba(255,0,68,0)); }
          50% { transform: translateY(-1px); filter: drop-shadow(0 0 10px rgba(255,0,68,0.55)); }
        }
        .bp-siren-edges {
          position: absolute;
          inset: 0;
          border-radius: 0;
          box-shadow:
            inset 0 0 0 2px rgba(255,255,255,0.05),
            inset 0 0 40px rgba(255,0,68,0.10);
          animation: bpEdgeFlash 1.3s linear infinite;
          pointer-events: none;
        }
        @keyframes bpEdgeFlash {
          0% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.05), inset 0 0 40px rgba(255,0,68,0.10); }
          25% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.05), inset 0 0 48px rgba(0,170,255,0.10); }
          50% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.05), inset 0 0 54px rgba(255,0,68,0.12); }
          75% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.05), inset 0 0 48px rgba(0,170,255,0.10); }
          100% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.05), inset 0 0 40px rgba(255,0,68,0.10); }
        }
      `}</style>
    </div>
  );
}
