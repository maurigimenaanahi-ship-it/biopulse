// src/app/App.tsx
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
import { mergeAndPersist, statusFromLastSeen } from "./lib/eventStore";
import { SlidersHorizontal, CornerUpLeft } from "lucide-react";

const FIRMS_PROXY = "https://square-frost-5487.maurigimenaanahi.workers.dev";
type AppStage = "splash" | "setup" | "dashboard";

/** ===== Reverse geocode (OSM / Nominatim) =====
 * - Gratis, sin key, pero hay que ser amable:
 *   - cache
 *   - limitar cantidad por corrida
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

        const clusters = clusterFiresDBSCAN(points, 10, 4, true);

        // ✅ reverse geocode: limitamos cantidad
        const MAX_GEOCODE = 35;

        const clusteredEventsRaw: EnvironmentalEvent[] = await Promise.all(
          clusters.map(async (c: any, i: number) => {
            const lat = Number(c.latitude);
            const lon = Number(c.longitude);

            const lastSeen: Date | null =
              c.lastSeen instanceof Date
                ? c.lastSeen
                : typeof c.lastSeen === "string" || typeof c.lastSeen === "number"
                ? new Date(c.lastSeen)
                : null;

            const place = i < MAX_GEOCODE ? (await reverseGeocode(lat, lon)) : null;
            const locationLabel = place ?? args.region.label;

            const sev = c.severity as EnvironmentalEvent["severity"];

            const frpMax = Number(c.frpMax ?? 0);
            const frpSum = Number(c.frpSum ?? 0);
            const focusCount = Number(c.focusCount ?? 1);

            const narrative =
              `Satellite sensors detected ${focusCount} fire ` +
              `${focusCount > 1 ? "signals" : "signal"} near ${locationLabel}. ` +
              `Radiative power suggests ${sev === "critical" || sev === "high" ? "high" : "moderate"} intensity.`;

            const ts = lastSeen ?? new Date();

            return {
              id: c.id || `cluster-${i}`,
              category: "fire",
              severity: sev,

              title: focusCount > 1 ? `Active Fire Cluster (${focusCount} detections)` : "Active Fire",
              description: `${narrative} FRP max ${frpMax.toFixed(2)} • FRP sum ${frpSum.toFixed(2)}.`,

              latitude: lat,
              longitude: lon,

              location: locationLabel,

              timestamp: ts,

              affectedArea: 1,
              affectedPopulation: undefined,

              riskIndicators: [
                sev === "critical" ? "Rapid spread potential" : "Monitoring",
                "Satellite detection (VIIRS)",
                `FRP max ${frpMax.toFixed(1)}`,
              ],

              liveFeedUrl: firmsViewerUrl(lat, lon),

              // ✅ status automático (por recencia)
              status: statusFromLastSeen(ts, sev),

              // ✅ métricas para historia
              focusCount,
              frpSum,
              frpMax,

              // opcionales
              evacuationLevel: undefined,
              nearbyInfrastructure: undefined,
              ecosystems: undefined,
              speciesAtRisk: undefined,
              aiInsight: {
                probabilityNext12h:
                  sev === "critical" ? 78 : sev === "high" ? 62 : sev === "moderate" ? 48 : 35,
                narrative:
                  sev === "critical" || sev === "high"
                    ? "BioPulse estimates a meaningful probability of continued activity in the next 12 hours. Maintain vigilance and verify conditions on the ground where possible."
                    : "BioPulse continues monitoring this signal. Verify with local sources if available.",
                recommendations:
                  sev === "critical" || sev === "high"
                    ? ["Monitor wind/humidity shifts", "Track nearby settlements", "Prepare response readiness"]
                    : ["Continue observation", "Check for new detections", "Confirm local conditions"],
              },
            };
          })
        );

        // ✅ MEMORIA: merge + history + stale
        const merged = mergeAndPersist({
          category: "fire",
          regionKey: args.region.key,
          next: clusteredEventsRaw,
          keepStaleHours: 72,
        });

        setEvents(merged);
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

    // No-fire: por ahora sin memoria (cuando quieras lo extendemos)
    setEvents(mockEvents.filter((e) => e.category === args.category));
    setSelectedEvent(null);
    setStage("dashboard");
    setResetKey((k) => k + 1);
    setIsExploring(false);
  };

  const stats = useMemo(() => {
    const criticalCount = events.filter((e) => e.severity === "critical" && !e.stale).length;
    const uniqueLocations = new Set(events.filter((e) => !e.stale).map((e) => e.location.split(",")[0]));
    return { total: events.filter((e) => !e.stale).length, critical: criticalCount, regions: uniqueLocations.size };
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
              events={events.filter((e) => !e.stale)} // ✅ no mostramos stale en el mapa
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
