import { useMemo, useState } from "react";
import { MapScene } from "./components/MapScene";
import { Header } from "./components/Header";
import { AlertPanel } from "./components/AlertPanel";
import { Timeline } from "./components/Timeline";
import { StatsPanel } from "./components/StatsPanel";
import { SplashScreen } from "./components/SplashScreen";
import { SetupPanel, REGION_GROUPS } from "./components/SetupPanel";
import { mockEvents } from "@/data/events";
import type { EnvironmentalEvent, EventCategory } from "@/data/events";
import { clusterFiresDBSCAN, type FirePoint } from "./lib/clusterFires";
import { SlidersHorizontal, CornerUpLeft } from "lucide-react";

// 🔥 FIRMS Proxy URL (verificado)
const FIRMS_PROXY = "https://square-frost-5487.maurigimenaanahi.workers.dev";

type AppStage = "splash" | "setup" | "dashboard";

export default function App() {
  const [stage, setStage] = useState<AppStage>("splash");
  const [activeView, setActiveView] = useState("home");

  // Selección activa
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);

  const [events, setEvents] = useState<EnvironmentalEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EnvironmentalEvent | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Control de vista del mapa
  const [resetKey, setResetKey] = useState(0);
  const [showZoomOut, setShowZoomOut] = useState(false);

  const selectedRegion =
    REGION_GROUPS.flatMap((g) => g.regions).find((r) => r.key === selectedRegionKey) ?? null;

  const openSetup = () => {
    setSelectedEvent(null);
    setShowZoomOut(false);
    setStage("setup");
  };

  const startMonitoring = async (args: {
    category: EventCategory;
    region: { key: string; label: string; bbox: string };
  }) => {
    setSelectedCategory(args.category);
    setSelectedRegionKey(args.region.key);

    // 🔥 Incendios reales (FIRMS)
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

        const clusteredEvents: EnvironmentalEvent[] = clusters.map((c, i) => ({
          id: c.id || `cluster-${i}`,
          category: "fire",
          severity: c.severity,
          title: c.focusCount > 1 ? `Fire event (${c.focusCount} detections)` : "Active Fire",
          description: `FRP max ${c.frpMax.toFixed(2)} • FRP sum ${c.frpSum.toFixed(2)}`,
          latitude: c.latitude,
          longitude: c.longitude,
          location: args.region.label,
          timestamp: new Date(),
          affectedArea: 1,
          riskIndicators: [],
        }));

        setEvents(clusteredEvents);
        setSelectedEvent(null);
        setStage("dashboard");
        setResetKey((k) => k + 1);
        setShowZoomOut(false);
        return;
      } catch (error) {
        console.error("Error fetching FIRMS data:", error);
        const filtered = mockEvents.filter((e) => e.category === "fire");
        setEvents(filtered);
        setSelectedEvent(null);
        setStage("dashboard");
        setResetKey((k) => k + 1);
        setShowZoomOut(false);
        return;
      }
    }

    // Otras categorías: mock
    const filtered = mockEvents.filter((e) => e.category === args.category);
    setEvents(filtered);
    setSelectedEvent(null);
    setStage("dashboard");
    setResetKey((k) => k + 1);
    setShowZoomOut(false);
  };

  const stats = useMemo(() => {
    const criticalCount = events.filter((e) => e.severity === "critical").length;
    const uniqueLocations = new Set(events.map((e) => e.location.split(",")[0]));
    return {
      total: events.length,
      critical: criticalCount,
      regions: uniqueLocations.size,
    };
  }, [events]);

  const shouldShowZoomOut = showZoomOut && !selectedEvent;

  return (
    <div className="w-screen h-screen bg-[#050a14] relative">
      <SplashScreen open={stage === "splash"} onStart={() => setStage("setup")} />

      {/* Header */}
      <Header activeView={activeView} onViewChange={setActiveView} />

      {/* Setup overlay */}
      {stage === "setup" && (
        <SetupPanel
          category={selectedCategory}
          regionKey={selectedRegionKey}
          onChangeCategory={setSelectedCategory}
          onChangeRegion={setSelectedRegionKey}
          onStart={startMonitoring}
          onClose={() => setStage("dashboard")}
          canClose={stage === "setup" && events.length > 0}
        />
      )}

      {/* Dashboard */}
      {stage === "dashboard" && (
        <div className="absolute inset-0">
          {/* MAPA */}
          <div className="absolute inset-0 z-0">
            <MapScene
              events={events}
              bbox={selectedRegion?.bbox ?? null}
              onEventClick={setSelectedEvent}
              resetKey={resetKey}
              onZoomedInChange={setShowZoomOut}
            />
          </div>

          {/* EFECTOS */}
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <div className="absolute inset-0 bg-gradient-radial from-cyan-950/20 via-transparent to-transparent opacity-30" />
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
          </div>

          {/* UI */}
          <div className="absolute inset-0 z-[2] pointer-events-none">
            {/* ✅ Cambiar búsqueda (CTA cyan + subtítulo) */}
            <div className="pointer-events-auto fixed left-4 top-20 md:left-6 md:top-24 z-[9999]">
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

            <div className="pointer-events-auto">
              <StatsPanel
                totalEvents={stats.total}
                criticalEvents={stats.critical}
                affectedRegions={stats.regions}
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

            {/* ✅ Volver: se mueve ABAJO A LA DERECHA (evita encimes con dock derecho) */}
            <div
              className={[
                "fixed right-4 md:right-6 z-[9999]",
                // abajo y a la derecha: no compite con panels de arriba
                "bottom-24 md:bottom-28",
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
