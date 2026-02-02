import { useState, useMemo } from "react";
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

// 🔥 FIRMS Proxy URL (verificado)
const FIRMS_PROXY = "https://square-frost-5487.maurigimenaanahi.workers.dev";

type AppStage = "splash" | "setup" | "dashboard";

export default function App() {
  const [stage, setStage] = useState<AppStage>("splash");
  const [activeView, setActiveView] = useState("home");

  // 1 categoría activa
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);

  const [events, setEvents] = useState<EnvironmentalEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EnvironmentalEvent | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // 👇 NUEVO: reset de vista + botón contextual de “volver”
  const [resetKey, setResetKey] = useState(0);
  const [showZoomOut, setShowZoomOut] = useState(false);

  const selectedRegion =
    REGION_GROUPS.flatMap((g) => g.regions).find((r) => r.key === selectedRegionKey) ?? null;

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

        // 1) points crudos
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

        // 2) clustering para móvil (reduce miles de puntos a “eventos” tocables)
        const clusters = clusterFiresDBSCAN(points, 10, 4, true);

        // 3) convertir a EnvironmentalEvent (lo que tu UI ya entiende)
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
        setStage("dashboard");
        // Resetear UI de navegación
        setResetKey((k) => k + 1);
        setShowZoomOut(false);
        return;
      } catch (error) {
        console.error("Error fetching FIRMS data:", error);
        const filtered = mockEvents.filter((e) => e.category === "fire");
        setEvents(filtered);
        setStage("dashboard");
        setResetKey((k) => k + 1);
        setShowZoomOut(false);
        return;
      }
    }

    // Otras categorías: mock (MVP)
    const filtered = mockEvents.filter((e) => e.category === args.category);
    setEvents(filtered);
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

  return (
    <div className="w-screen h-screen bg-[#050a14] relative">
      {/* Splash overlay */}
      <SplashScreen open={stage === "splash"} onStart={() => setStage("setup")} />

      {/* Header */}
      <Header activeView={activeView} onViewChange={setActiveView} />

      {/* Setup overlay */}
      {stage === "setup" && (
        <SetupPanel
          category={selectedCategory}
          regionKey={selectedRegionKey}
          onChangeCategory={(c) => setSelectedCategory(c)}
          onChangeRegion={(rk) => setSelectedRegionKey(rk)}
          onStart={startMonitoring}
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

          {/* EFECTOS (no bloquean interacción) */}
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <div className="absolute inset-0 bg-gradient-radial from-cyan-950/20 via-transparent to-transparent opacity-30" />
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,212,255,0.03),transparent_50%)]" />
          </div>

          {/* UI (NO bloquea el mapa salvo en controles) */}
          <div className="absolute inset-0 z-[2] pointer-events-none">
            {/* Paneles / controles: clickeables */}
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

            <div className="pointer-events-auto absolute left-6 bottom-6 px-4 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
              <div className="text-white/70 text-sm font-medium">Scan active</div>
              <div className="text-white/45 text-xs mt-1">
                {selectedCategory?.toUpperCase()} • {selectedRegion?.label ?? "Region"}
              </div>
              <div className="text-white/30 text-[11px] mt-1">events loaded: {events.length}</div>
            </div>

            {/* Botón contextual: aparece solo si estás con zoom-in */}
            {showZoomOut && (
              <div className="pointer-events-auto absolute right-6 top-1/2 -translate-y-1/2">
                <button
                  onClick={() => setResetKey((k) => k + 1)}
                  className="px-4 py-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md text-white/80 hover:text-white shadow-lg"
                  title="Volver a la vista general"
                  aria-label="Volver a la vista general"
                >
                  Volver
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
