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

type PanelView = "main" | "official" | "regional";

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Heurística inicial: “esto podría ser oficial”
function looksOfficial(item: NewsItem) {
  const host = (item.domain || (item.url ? safeHostname(item.url) : "")).toLowerCase();
  const url = (item.url ?? "").toLowerCase();
  const text = `${host} ${url}`;

  if (!text.trim()) return false;

  const hints = [
    ".gov",
    ".gob",
    "gobierno",
    "ministerio",
    "defensacivil",
    "defensa-civil",
    "proteccioncivil",
    "proteccion-civil",
    "bomberos",
    "policia",
    "municip",
    "prefect",
    "emergenc",
    "rescate",
  ];

  if (host.endsWith(".gov") || host.includes(".gov.") || host.endsWith(".gob") || host.includes(".gob.")) return true;
  return hints.some((h) => text.includes(h));
}

// Prioridad simple para Argentina (ampliamos después por país/provincia/local)
function inferCountryCodeFromPlace(placeUsed?: string | null) {
  const p = String(placeUsed ?? "").toLowerCase();
  if (p.includes("argentina")) return "AR";
  return null;
}

function scoreLocality(item: NewsItem, placeCountryCode: string | null) {
  const host = (item.domain || (item.url ? safeHostname(item.url) : "")).toLowerCase();
  const src = (item.sourceCountry ?? "").toUpperCase();

  // 0 = más local, 1 = mismo país, 2 = resto
  if (placeCountryCode === "AR") {
    if (host.endsWith(".ar") || host.includes(".ar/") || host.includes(".ar.")) return 0;
    if (src === "AR") return 1;
    return 2;
  }
  return 1;
}

function parsePublishedMs(item: NewsItem) {
  if (!item.publishedAt) return 0;
  const t = new Date(item.publishedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function AlertPanel({ event, onClose }: AlertPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<PanelView>("main");

  function scrollTopInstant() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  useEffect(() => {
    if (!event) return;
    setView("main");
    scrollTopInstant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  useEffect(() => {
    if (!event) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view !== "main") {
        setView("main");
        scrollTopInstant();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [event, onClose, view]);

  // ====== NEWS state ======
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsErr, setNewsErr] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsMeta, setNewsMeta] = useState<{ query: string; fetchedAt?: string; placeUsed?: string } | null>(null);

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
        max: 20,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      const cleaned = items
        .filter((x) => x && (x.title || x.url))
        .map((x) => ({
          ...x,
          title: x.title?.trim() ?? null,
          summary: x.summary?.trim() ?? null,
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
    loadNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const countryCode = useMemo(() => inferCountryCodeFromPlace(newsMeta?.placeUsed ?? null), [newsMeta?.placeUsed]);

  const officialItems = useMemo(() => {
    const items = Array.isArray(newsItems) ? newsItems : [];
    return items
      .filter(looksOfficial)
      .sort((a, b) => {
        const la = scoreLocality(a, countryCode);
        const lb = scoreLocality(b, countryCode);
        if (la !== lb) return la - lb;
        return parsePublishedMs(b) - parsePublishedMs(a);
      });
  }, [newsItems, countryCode]);

  const regionalItems = useMemo(() => {
    const items = Array.isArray(newsItems) ? newsItems : [];
    return items
      .filter((x) => !looksOfficial(x))
      .sort((a, b) => {
        const la = scoreLocality(a, countryCode);
        const lb = scoreLocality(b, countryCode);
        if (la !== lb) return la - lb;
        return parsePublishedMs(b) - parsePublishedMs(a);
      });
  }, [newsItems, countryCode]);

  if (!event) return null;

  const chip = sevChip(event.severity);

  const onBack = () => {
    if (view !== "main") {
      setView("main");
      scrollTopInstant();
      return;
    }
    onClose();
  };

  function PreviewCard({
    item,
    emptyText,
  }: {
    item: NewsItem | null;
    emptyText: string;
  }) {
    if (!item) {
      return (
        <div className="text-sm text-white/45">
          {emptyText}
        </div>
      );
    }

    const host = item.domain || (item.url ? safeHostname(item.url) : "");
    const when = item.publishedAt ? new Date(item.publishedAt) : null;
    const whenOk = when && !isNaN(when.getTime());

    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white/90 line-clamp-2">
              {item.title ?? "Publicación"}
            </div>
            <div className="mt-1 text-[11px] text-white/45">
              {host ? <span className="text-white/55">{host}</span> : null}
              {whenOk ? (
                <>
                  <span className="mx-2 text-white/20">•</span>
                  <span>{when!.toUTCString().replace("GMT", "UTC")}</span>
                </>
              ) : null}
            </div>
          </div>

          {item.url ? (
            <a
              href={item.url}
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

        {item.summary ? (
          <div className="mt-2 text-sm text-white/60 leading-relaxed line-clamp-3">
            {item.summary}
          </div>
        ) : null}
      </div>
    );
  }

  function FeedList({ items }: { items: NewsItem[] }) {
    if (newsLoading) {
      return (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-pulse">
              <div className="h-4 w-2/3 bg-white/10 rounded" />
              <div className="h-3 w-1/3 bg-white/10 rounded mt-2" />
              <div className="h-3 w-full bg-white/10 rounded mt-3" />
            </div>
          ))}
        </div>
      );
    }

    if (!items.length) {
      return <div className="text-sm text-white/45">No hay resultados para mostrar.</div>;
    }

    return (
      <div className="mt-4 space-y-3">
        {items.map((it) => {
          const host = it.domain || (it.url ? safeHostname(it.url) : "");
          const when = it.publishedAt ? new Date(it.publishedAt) : null;
          const whenOk = when && !isNaN(when.getTime());

          return (
            <div key={it.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white/90 line-clamp-2">
                    {it.title ?? "Publicación"}
                  </div>
                  <div className="mt-1 text-[11px] text-white/45">
                    {host ? <span className="text-white/55">{host}</span> : null}
                    {whenOk ? (
                      <>
                        <span className="mx-2 text-white/20">•</span>
                        <span>{when!.toUTCString().replace("GMT", "UTC")}</span>
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
                <div className="mt-2 text-sm text-white/60 leading-relaxed line-clamp-4">
                  {it.summary}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[10050]">
      <div className="absolute inset-0 bg-black/60" onClick={view === "main" ? onClose : undefined} />

      <div
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[min(980px,92vw)] h-[min(86vh,720px)]",
          "rounded-3xl border border-white/10",
          "bg-[#060b16]/90 backdrop-blur-xl shadow-2xl overflow-hidden",
          "flex flex-col"
        )}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onBack}
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

        {/* Body (scroll real) */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
          {view === "main" ? (
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

              {/* Comunicados oficiales (preview) */}
              <SectionShell
                icon={<Newspaper className="h-5 w-5 text-white/80" />}
                title="Comunicados oficiales"
                subtitle="Si existe un aviso oficial (gobierno / protección civil / bomberos), aparece primero."
                right={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadNews}
                      className={cn(
                        "inline-flex items-center gap-2",
                        "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                        "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                      )}
                      aria-label="Actualizar"
                      title="Actualizar"
                    >
                      {newsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      <span className="text-xs font-medium">Actualizar</span>
                    </button>

                    <button
                      onClick={() => {
                        setView("official");
                        scrollTopInstant();
                      }}
                      className={cn(
                        "inline-flex items-center gap-2",
                        "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                        "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                      )}
                      aria-label="Ver más"
                      title="Ver más"
                    >
                      <span className="text-xs font-medium">Ver más</span>
                    </button>
                  </div>
                }
              >
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  {newsErr ? (
                    <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                      No se pudo cargar noticias. <span className="text-red-100/70">{newsErr}</span>
                    </div>
                  ) : null}

                  <PreviewCard
                    item={officialItems[0] ?? null}
                    emptyText="No hay comunicados oficiales todavía."
                  />

                  <div className="mt-3 text-[11px] text-white/35">
                    Nota: “oficial” es una clasificación heurística por dominio/palabras clave (hasta conectar fuentes oficiales reales).
                  </div>
                </div>
              </SectionShell>

              {/* Noticias de la región (preview) */}
              <SectionShell
                icon={<Newspaper className="h-5 w-5 text-white/80" />}
                title="Noticias de la región"
                subtitle="Cobertura general (prioriza medios del país si se reconoce el país del lugar)."
                right={
                  <button
                    onClick={() => {
                      setView("regional");
                      scrollTopInstant();
                    }}
                    className={cn(
                      "inline-flex items-center gap-2",
                      "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                      "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    )}
                    aria-label="Ver más"
                    title="Ver más"
                  >
                    <span className="text-xs font-medium">Ver más</span>
                  </button>
                }
              >
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-white/45">
                    Lugar usado:{" "}
                    <span className="text-white/55 normal-case">{newsMeta?.placeUsed ?? "—"}</span>
                  </div>

                  <div className="mt-3">
                    <PreviewCard
                      item={regionalItems[0] ?? null}
                      emptyText="No se encontraron artículos relevantes con esta query."
                    />
                  </div>

                  {newsMeta?.fetchedAt ? (
                    <div className="mt-3 text-[11px] text-white/35">
                      Actualizado: {new Date(newsMeta.fetchedAt).toUTCString()}
                    </div>
                  ) : null}
                </div>
              </SectionShell>

              {/* Indicadores operativos */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
                <div className="px-5 pt-4 pb-3">
                  <div className="text-white/90 font-semibold">Indicadores operativos</div>
                  <div className="text-xs text-white/45 mt-0.5">
                    Visual + número + explicación. Esto traduce la señal, no la “inventa”.
                  </div>
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
                        <div className="text-[11px] text-white/30 mt-2">Base: señal satelital + escala operativa (0–120).</div>
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
                        <div className="text-[11px] text-white/30 mt-2">Base: señal satelital + escala operativa (0–25).</div>
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
                        <div className="text-[11px] text-white/30 mt-2">Base: señal satelital + escala operativa (0–250).</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Condiciones (placeholder) */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
                <div className="px-5 pt-4 pb-3">
                  <div className="text-white/90 font-semibold">Condiciones</div>
                  <div className="text-xs text-white/45 mt-0.5">
                    Condiciones que pueden cambiar la dinámica del evento (no es pronóstico general).
                  </div>
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
                    Nota: esto no sustituye fuentes locales. Es una lectura de señal satelital + contexto informativo.
                  </div>
                </div>
              </div>

              <div className="h-6" />
            </div>
          ) : (
            // ===== Expanded views =====
            <div className="space-y-4">
              <SectionShell
                icon={<Newspaper className="h-5 w-5 text-white/80" />}
                title={view === "official" ? "Comunicados oficiales" : "Noticias de la región"}
                subtitle={view === "official"
                  ? "Vista completa (heurística por dominio/palabras clave)."
                  : "Vista completa (prioriza país cuando es detectable)."}
                right={
                  <button
                    onClick={loadNews}
                    className={cn(
                      "inline-flex items-center gap-2",
                      "px-3 py-1.5 rounded-full border border-white/10 bg-white/5",
                      "text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    )}
                    aria-label="Actualizar"
                    title="Actualizar"
                  >
                    {newsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="text-xs font-medium">Actualizar</span>
                  </button>
                }
              >
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[11px] uppercase tracking-wide text-white/45">
                    Lugar usado:{" "}
                    <span className="text-white/55 normal-case">{newsMeta?.placeUsed ?? "—"}</span>
                  </div>

                  {newsErr ? (
                    <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                      No se pudo cargar noticias. <span className="text-red-100/70">{newsErr}</span>
                    </div>
                  ) : null}

                  {view === "official" ? (
                    <>
                      {!officialItems.length && !newsLoading ? (
                        <div className="mt-4 text-sm text-white/45">No hay comunicados oficiales todavía.</div>
                      ) : (
                        <FeedList items={officialItems} />
                      )}
                      <div className="mt-3 text-[11px] text-white/35">
                        Nota: “oficial” es una clasificación heurística. Próximo: fuente oficial real (API/feeds verificables).
                      </div>
                    </>
                  ) : (
                    <>
                      {!regionalItems.length && !newsLoading ? (
                        <div className="mt-4 text-sm text-white/45">No hay noticias regionales relevantes con esta query.</div>
                      ) : (
                        <FeedList items={regionalItems} />
                      )}
                      <div className="mt-3 text-[11px] text-white/35">
                        Próximo: prioridad local → provincial → nacional → internacional (cuando tengamos mejor metadata / geofencing).
                      </div>
                    </>
                  )}

                  {newsMeta?.fetchedAt ? (
                    <div className="mt-3 text-[11px] text-white/35">
                      Actualizado: {new Date(newsMeta.fetchedAt).toUTCString()}
                    </div>
                  ) : null}
                </div>
              </SectionShell>

              <div className="h-6" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
