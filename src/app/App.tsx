import { useMemo, useState } from "react";
import { MapScene } from "./components/MapScene";
import { Header } from "./components/Header";
import { AlertPanel } from "./components/AlertPanel";
import { Timeline } from "./components/Timeline";
import { StatsPanel } from "./components/StatsPanel";
import { SplashScreen } from "./components/SplashScreen";
import { SetupPanel, REGION_GROUPS } from "./components/SetupPanel";
import { mockEvents } from "@/data/events";
import type { EnvironmentalEvent, EventCategory, EventStatus } from "@/data/events";
import { clusterFiresDBSCAN, type FirePoint } from "./lib/clusterFires";
import { SlidersHorizontal, CornerUpLeft } from "lucide-react";

const FIRMS_PROXY = "https://square-frost-5487.maurigimenaanahi.workers.dev";
type AppStage = "splash" | "setup" | "dashboard";

/** ✅ Debug temporal (ponelo en true si querés logs en consola) */
const DEBUG_FIRE_TIME = false;

/** ===== Reverse geocode (OSM / Nominatim) =====
 * - Gratis, sin key, pero hay que ser amable:
 *   - cache
 *   - limitar cantidad por corrida
 *   - no spamear en loops enormes
 */
const GEO_CACHE = new Map<string, string>();
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key)!;

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lon)}&zoom=10&addressdetails=1`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;

    const data: any = await res.json();
    const a = data?.address ?? {};

    const locality =
      a.city || a.town || a.village || a.hamlet || a.municipality || a.county || a.state_district;

    const state = a.state;
    const country = a.country;

    const parts = [locality, state, country].filter(Boolean);
    const label = parts.length ? parts.join(", ") : (data?.display_name ?? null);

    if (label && typeof label === "string") {
      GEO_CACHE.set(key, label);
      return label;
    }
    return null;
  } catch {
    return null;
  }
}

/** ===== status automático =====
 * Si tenemos lastSeen:
 * - > 48h => resolved
 * - > 18h => contained
 * - > 6h  => stabilizing
 * - reciente => escalando si es grave
 */
function statusFromLastSeen(lastSeen: Date | null, severity: EnvironmentalEvent["severity"]): EventStatus {
  if (!lastSeen) return severity === "critical" || severity === "high" ? "escalating" : "active";

  const ageMs = Date.now() - lastSeen.getTime();
  const ageH = ageMs / (1000 * 60 * 60);

  if (ageH > 48) return "resolved";
  if (ageH > 18) return "contained";
  if (ageH > 6) return "stabilizing";

  if (severity === "critical" || severity === "high") return "escalating";
  return "active";
}

function ageLabelFromLastSeen(lastSeen: Date | null) {
  if (!lastSeen) return null;
  const ageMs = Date.now() - lastSeen.getTime();
  const ageH = ageMs / (1000 * 60 * 60);

  if (!Number.isFinite(ageH) || ageH < 0) return null;

  if (ageH < 1) return "Last detection: < 1h";
  if (ageH < 24) return `Last detection: ${Math.round(ageH)}h ago`;

  const days = ageH / 24;
  if (days < 7) return `Last detection: ${days.toFixed(1)}d ago`;
  return `Last detection: ${Math.round(days)}d ago`;
}

/** ===== Link FIRMS centrado en el punto ===== */
function firmsViewerUrl(lat: number, lon: number) {
  return `https://firms.modaps.eosdis.nasa.gov/map/#t:adv;d:2026-01-30;@${lon.toFixed(
    4
  )},${lat.toFixed(4)},7z`;
}

export default function App() {
  const [stage, setStage] = useState<AppStage>("splash");
  const [activeView, setActiveView] = useState("home");

  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);

  const [events, setEvents] = useState<EnvironmentalEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EnvironmentalEvent | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [resetKey, setResetKey] = useState(0);

  // “Explorando” (zoom-in) => colapsa panels
  const [isExploring, setIsExploring] = useState(false);
  const [mapZoom, setMapZoom] = useState(1.2);

  const selectedRegion =
    REGION_GROUPS.flatMap((g) => g.regions).find((r) => r.key === selectedRegionKey) ?? null;

  const openSetup = () => {
    setSelectedEvent(null);
    setIsExploring(false);
    setStage("setup");
  };

  const startMonitoring = async (args: {
    category: EventCategory;
    region: { key: string; label: string; bbox: string };
  }) => {
    setSelectedCategory(args.category);
    setSelectedRegionKey(args.region.key);

    if (args.category === "fire") {
      try {
        const bbox = encodeURIComponent(args.region.bbox);
        const url = `${FIRMS_PROXY}/fires?bbox=${bbox}&days=2&source=VIIRS_SNPP_NRT`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`FIRMS proxy error: ${res.status}`);
        const data = await res.json();

        const points: FirePoint[] = (data.features ?? [])
          .map((f: any, i: number) => ({
            id: f.id || `fire-${i}`,
            latitude: Number(f.latitude),
            longitude: Number(f.longitude),
            frp: Number(f.frp ?? 0),
            confidence: f.confidence,
            acq_date: f.acq_date,
            acq_time: f.acq_time,
          }))
          .filter((p: any) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));

        // ✅ ahora clusterFiresDBSCAN ya calcula lastSeen/age/isStale
        const clusters = clusterFiresDBSCAN(points, 10, 4, true);

        // ✅ reverse geocode: limitamos requests para no spamear Nominatim
        const MAX_GEOCODE = 35;

        const clusteredEvents: EnvironmentalEvent[] = await Promise.all(
          clusters.map(async (c: any, i: number) => {
            const lat = Number(c.latitude);
            const lon = Number(c.longitude);

            // lastSeen viene como Date o null desde clusterFires.ts
            const lastSeen: Date | null =
              c?.lastSeen instanceof Date
                ? c.lastSeen
                : typeof c?.lastSeen === "string" || typeof c?.lastSeen === "number"
                ? new Date(c.lastSeen)
                : null;

            const place = i < MAX_GEOCODE ? (await reverseGeocode(lat, lon)) : null;
            const locationLabel = place ?? args.region.label;

            const sev = c.severity as EnvironmentalEvent["severity"];
            const frpMax = Number(c.frpMax ?? 0);
            const frpSum = Number(c.frpSum ?? 0);

            const status = statusFromLastSeen(lastSeen, sev);
            const lastDet = ageLabelFromLastSeen(lastSeen);

            if (DEBUG_FIRE_TIME) {
              // log breve por cluster (no explota la consola)
              // eslint-disable-next-line no-console
              console.log("[BioPulse] fire cluster", {
                id: c.id,
                focusCount: c.focusCount,
                lastSeen,
                ageHours: c.ageHours,
                isStale: c.isStale,
                status,
              });
            }

            // ✅ narrativa simple + FRP
            const narrative =
              `Satellite sensors detected ${c.focusCount} fire ` +
              `${c.focusCount > 1 ? "signals" : "signal"} near ${locationLabel}. ` +
              `Radiative power suggests ${sev === "critical" || sev === "high" ? "high" : "moderate"} intensity.`;

            // ✅ indicadores de riesgo: SIEMPRE (incluye “last detection”)
            const riskIndicators: string[] = [];
            if (sev === "critical") riskIndicators.push("Rapid spread potential");
            else if (sev === "high") riskIndicators.push("High intensity signal");
            else if (sev === "moderate") riskIndicators.push("Moderate intensity");
            else riskIndicators.push("Low intensity / monitoring");

            riskIndicators.push("Satellite detection (VIIRS)");
            riskIndicators.push(`FRP max ${frpMax.toFixed(1)}`);

            if (lastDet) riskIndicators.push(lastDet);

            // ✅ si está stale, lo dejamos explícito (esto responde tu “y si ya lo apagaron?”)
            if (c?.isStale) riskIndicators.push("No recent detections (possible containment)");

            return {
              id: c.id || `cluster-${i}`,
              category: "fire",
              severity: sev,

              // ✅ título humano
              title: c.focusCount > 1 ? `Active Fire Cluster (${c.focusCount} detections)` : "Active Fire",

              // ✅ descripción narrativo + FRP
              description: `${narrative} FRP max ${frpMax.toFixed(2)} • FRP sum ${frpSum.toFixed(2)}.`,

              latitude: lat,
              longitude: lon,

              // ✅ localidad (si pudo), si no región
              location: locationLabel,

              // ✅ timestamp: usamos lastSeen si existe (si no now)
              timestamp: lastSeen ?? new Date(),

              affectedArea: 1,
              affectedPopulation: undefined,

              riskIndicators,

              // ✅ “observación directa”: link FIRMS (no cámara real)
              liveFeedUrl: firmsViewerUrl(lat, lon),

              // ✅ status automático real
              status,

              // opcionales (por ahora)
              evacuationLevel: undefined,
              nearbyInfrastructure: undefined,
              ecosystems: undefined,
              speciesAtRisk: undefined,

              aiInsight: {
                probabilityNext12h:
                  status === "resolved"
                    ? 8
                    : sev === "critical"
                    ? 78
                    : sev === "high"
                    ? 62
                    : sev === "moderate"
                    ? 48
                    : 35,
                narrative:
                  status === "resolved"
                    ? "BioPulse indicates no recent satellite detections for this cluster. This may suggest containment, but ground confirmation is recommended."
                    : sev === "critical" || sev === "high"
                    ? "BioPulse estimates a meaningful probability of continued activity in the next 12 hours. Maintain vigilance and verify conditions on the ground where possible."
                    : "BioPulse continues monitoring this signal. Verify with local sources if available.",
                recommendations:
                  status === "resolved"
                    ? ["Confirm containment with local sources", "Continue periodic monitoring", "Review nearby risk areas"]
                    : sev === "critical" || sev === "high"
                    ? ["Monitor wind/humidity shifts", "Track nearby settlements", "Prepare response readiness"]
                    : ["Continue observation", "Check for new detections", "Confirm local conditions"],
              },
            };
          })
        );

        setEvents(clusteredEvents);
      } catch (err) {
        console.error("Error fetching FIRMS data:", err);
        setEvents(mockEvents.filter((e) => e.category === "fire"));
      }

      setSelectedEvent(null);
      setStage("dashboard");
      setResetKey((k) => k + 1);
      setIsExploring(false);
      return;
    }

    setEvents(mockEvents.filter((e) => e.category === args.category));
    setSelectedEvent(null);
    setStage("dashboard");
    setResetKey((k) => k + 1);
    setIsExploring(false);
  };

  const stats = useMemo(() => {
    const criticalCount = events.filter((e) => e.severity === "critical").length;
    const uniqueLocations = new Set(events.map((e) => e.location.split(",")[0]));
    return { total: events.length, critical: criticalCount, regions: uniqueLocations.size };
  }, [events]);

  // Botón Volver solo si estás explorando y NO hay alerta abierta
  const shouldShowZoomOut = isExploring && !selectedEvent;

  return (
    <div className="w-screen h-screen bg-[#050a14] relative">
      <SplashScreen open={stage === "splash"} onStart={() => setStage("setup")} />

      <Header activeView={activeView} onViewChange={setActiveView} />

      {stage === "setup" && (
        <SetupPanel
          category={selectedCategory}
          regionKey={selectedRegionKey}
          onChangeCategory={setSelectedCategory}
          onChangeRegion={setSelectedRegionKey}
          onStart={startMonitoring}
          onClose={() => setStage("dashboard")}
          canClose={events.length > 0}
        />
      )}

      {stage === "dashboard" && (
        <div className="absolute inset-0">
          <div className="absolute inset-0 z-0">
            <MapScene
              events={events}
              bbox={selectedRegion?.bbox ?? null}
              onEventClick={setSelectedEvent}
              resetKey={resetKey}
              onZoomedInChange={setIsExploring}
              onZoomChange={setMapZoom}
            />
          </div>

          {/* efectos */}
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <div className="absolute inset-0 bg-gradient-radial from-cyan-950/20 via-transparent to-transparent opacity-30" />
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
          </div>

          {/* UI */}
          <div className="absolute inset-0 z-[2] pointer-events-none">
            {/* Cambiar búsqueda */}
            <div className="pointer-events-auto fixed left-4 z-[9999] top-[calc(env(safe-area-inset-top)+96px)] md:left-6 md:top-24">
              <button
                onClick={openSetup}
                className={[
                  "group flex items-center gap-3",
                  "px-4 py-3 rounded-2xl shadow-lg",
                  "backdrop-blur-md border border-cyan-300/25",
                  "bg-cyan-400/12 hover:bg-cyan-400/18",
                  "text-white/90 hover:text-white",
                  "transition-colors",
                  "min-w-[220px]",
                ].join(" ")}
                title="Cambiar categoría o región"
                aria-label="Cambiar categoría o región"
              >
                <div className="h-10 w-10 rounded-xl border border-cyan-300/20 bg-black/20 flex items-center justify-center">
                  <SlidersHorizontal className="h-5 w-5 text-cyan-200" />
                </div>
                <div className="text-left leading-tight">
                  <div className="text-sm md:text-base font-semibold">Cambiar búsqueda</div>
                  <div className="text-xs text-white/55 mt-0.5">Categoría • Región</div>
                </div>
              </button>
            </div>

            {/* StatsPanel */}
            <div className="pointer-events-auto">
              <StatsPanel
                totalEvents={stats.total}
                criticalEvents={stats.critical}
                affectedRegions={stats.regions}
                collapsed={isExploring}
              />
            </div>

            <div className="pointer-events-auto">
              <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} />
            </div>

            <div className="pointer-events-auto">
              <AlertPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            </div>

            <div className="pointer-events-auto absolute left-4 md:left-6 bottom-4 md:bottom-6 px-4 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
              <div className="text-white/70 text-sm font-medium">Scan active</div>
              <div className="text-white/45 text-xs mt-1">
                {selectedCategory?.toUpperCase()} • {selectedRegion?.label ?? "Region"}
              </div>
              <div className="text-white/30 text-[11px] mt-1">events loaded: {events.length}</div>
            </div>

            {/* Volver */}
            <div
              className={[
                "fixed right-4 z-[9999]",
                "bottom-[180px] md:right-6 md:bottom-28",
                "transition-all duration-300 ease-out will-change-transform",
                shouldShowZoomOut
                  ? "opacity-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 translate-y-2 pointer-events-none",
              ].join(" ")}
            >
              <button
                onClick={() => setResetKey((k) => k + 1)}
                className={[
                  "flex items-center gap-2",
                  "px-4 py-3 rounded-2xl shadow-lg",
                  "backdrop-blur-md border",
                  "border-cyan-400/30 bg-cyan-400/15",
                  "text-cyan-100 hover:text-white",
                  "hover:bg-cyan-400/25",
                  "transition-colors",
                ].join(" ")}
                title="Volver a la vista general"
                aria-label="Volver a la vista general"
              >
                <CornerUpLeft className="h-5 w-5 text-cyan-200" />
                <span className="font-medium">Volver</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
