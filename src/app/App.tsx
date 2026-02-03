import { useMemo, useState, useEffect } from "react";
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

import { Flame, AlertTriangle, Globe2 } from "lucide-react";

// 🔥 FIRMS Proxy URL (verificado)
const FIRMS_PROXY = "https://square-frost-5487.maurigimenaanahi.workers.dev";

type AppStage = "splash" | "setup" | "dashboard";
type StatDockKey = "live" | "critical" | "regions";

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

  // ✅ Mobile detect (para ajustar distancias/padding)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // ✅ Lo que pediste: stats se “meten” al explorar y quedan como pictogramas
  const [statsDocked, setStatsDocked] = useState(false); // true = colapsado a pictos
  const [statsExpanded, setStatsExpanded] = useState(false); // true = stats completos visibles
  const [activeStatDock, setActiveStatDock] = useState<StatDockKey>("live");

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

        // ✅ reset de UI
        setStatsDocked(false);
        setStatsExpanded(false);
        return;
      } catch (error) {
        console.error("Error fetching FIRMS data:", error);
        const filtered = mockEvents.filter((e) => e.category === "fire");
        setEvents(filtered);
        setSelectedEvent(null);
        setStage("dashboard");
        setResetKey((k) => k + 1);
        setShowZoomOut(false);

        setStatsDocked(false);
        setStatsExpanded(false);
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

    setStatsDocked(false);
    setStatsExpanded(false);
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

  // ✅ Cuando el mapa se considera “zoom-in” (exploración) -> dock automático
  useEffect(() => {
    if (showZoomOut) {
      setStatsDocked(true);
      setStatsExpanded(false);
    } else {
      // si volvés a vista general, stats vuelven normales
      setStatsDocked(false);
      setStatsExpanded(false);
    }
  }, [showZoomOut]);

  // ✅ Si hay alerta abierta, no metemos overlay raro
  useEffect(() => {
    if (selectedEvent) {
      setStatsExpanded(false);
    }
  }, [selectedEvent]);

  // ✅ Toggle: tocar pictograma despliega / vuelve a meter
  const toggleStatsFromDock = (key: StatDockKey) => {
    setActiveStatDock(key);
    setStatsExpanded((prev) => {
      // si estaba desplegado y tocás el mismo, se cierra
      if (prev && activeStatDock === key) return false;
      return true;
    });
  };

  // ✅ Volver: SOLO si zoom-in y NO hay alerta abierta y NO stats desplegados
  const shouldShowZoomOut = showZoomOut && !selectedEvent && !statsExpanded;

  const headerOverlayActive = !!selectedEvent || stage === "setup";

  return (
    <div className="w-screen h-screen bg-[#050a14] relative">
      <SplashScreen open={stage === "splash"} onStart={() => setStage("setup")} />

      <Header activeView={activeView} onViewChange={setActiveView} overlayActive={headerOverlayActive} />

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
            {/* Botón Cambiar (siempre disponible) */}
            <div className="pointer-events-auto fixed left-4 top-20 md:left-6 md:top-24 z-[9999]">
              <button
                onClick={openSetup}
                className={[
                  "px-4 py-2 rounded-xl shadow-lg",
                  "backdrop-blur-md border border-white/10 bg-white/5",
                  "text-white/80 hover:text-white hover:bg-white/10",
                  "transition-colors",
                ].join(" ")}
                title="Cambiar categoría o región"
                aria-label="Cambiar categoría o región"
              >
                Cambiar
              </button>
            </div>

            {/* ✅ Stats: normal o dock + expand */}
            {/* Normal (como estaba) */}
            <div
              className={[
                "pointer-events-auto transition-all duration-300 ease-out",
                statsDocked ? "opacity-0 -translate-x-2 pointer-events-none" : "opacity-100 translate-x-0",
              ].join(" ")}
            >
              <StatsPanel totalEvents={stats.total} criticalEvents={stats.critical} affectedRegions={stats.regions} />
            </div>

            {/* Dock reducido a pictogramas (aparece al explorar) */}
            {statsDocked && !selectedEvent && (
              <div className="pointer-events-auto fixed right-3 top-28 md:top-28 z-[9999]">
                <div
                  className={[
                    "flex flex-col gap-2",
                    "transition-all duration-300 ease-out",
                    "opacity-100 translate-x-0",
                  ].join(" ")}
                >
                  <button
                    onClick={() => toggleStatsFromDock("live")}
                    className={[
                      "w-12 rounded-2xl px-0 py-2",
                      "border border-cyan-400/25 bg-cyan-400/12 backdrop-blur-md shadow-lg",
                      "grid place-items-center",
                      activeStatDock === "live" && statsExpanded ? "ring-2 ring-cyan-400/30" : "",
                    ].join(" ")}
                    aria-label="Live events"
                    title="Live events"
                  >
                    <Flame className="w-5 h-5 text-cyan-100" />
                    <div className="text-[11px] mt-1 text-cyan-100/90">{stats.total}</div>
                  </button>

                  <button
                    onClick={() => toggleStatsFromDock("critical")}
                    className={[
                      "w-12 rounded-2xl px-0 py-2",
                      "border border-cyan-400/25 bg-cyan-400/12 backdrop-blur-md shadow-lg",
                      "grid place-items-center",
                      activeStatDock === "critical" && statsExpanded ? "ring-2 ring-cyan-400/30" : "",
                    ].join(" ")}
                    aria-label="Critical"
                    title="Critical"
                  >
                    <AlertTriangle className="w-5 h-5 text-cyan-100" />
                    <div className="text-[11px] mt-1 text-cyan-100/90">{stats.critical}</div>
                  </button>

                  <button
                    onClick={() => toggleStatsFromDock("regions")}
                    className={[
                      "w-12 rounded-2xl px-0 py-2",
                      "border border-cyan-400/25 bg-cyan-400/12 backdrop-blur-md shadow-lg",
                      "grid place-items-center",
                      activeStatDock === "regions" && statsExpanded ? "ring-2 ring-cyan-400/30" : "",
                    ].join(" ")}
                    aria-label="Regions"
                    title="Regions"
                  >
                    <Globe2 className="w-5 h-5 text-cyan-100" />
                    <div className="text-[11px] mt-1 text-cyan-100/90">{stats.regions}</div>
                  </button>
                </div>
              </div>
            )}

            {/* Expand overlay: cuando tocás un pictograma se despliega el StatsPanel completo */}
            {statsDocked && statsExpanded && !selectedEvent && (
              <div className="pointer-events-auto fixed inset-0 z-[9998]">
                {/* backdrop suave: tocás afuera y se vuelve a meter */}
                <div
                  className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
                  onClick={() => setStatsExpanded(false)}
                />
                <div
                  className={[
                    "absolute",
                    "left-4 right-16",
                    isMobile ? "top-24" : "top-28",
                    "rounded-2xl border border-white/10 bg-[#0a0f1a]/95 shadow-2xl",
                    "p-3",
                  ].join(" ")}
                  onClick={(e) => e.stopPropagation()}
                >
                  <StatsPanel
                    totalEvents={stats.total}
                    criticalEvents={stats.critical}
                    affectedRegions={stats.regions}
                  />
                </div>
              </div>
            )}

            {/* Timeline (como estaba) */}
            <div className="pointer-events-auto">
              <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} />
            </div>

            {/* Scan Active (como estaba) */}
            <div className="pointer-events-auto absolute left-4 md:left-6 bottom-4 md:bottom-6 px-4 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
              <div className="text-white/70 text-sm font-medium">Scan active</div>
              <div className="text-white/45 text-xs mt-1">
                {selectedCategory?.toUpperCase()} • {selectedRegion?.label ?? "Region"}
              </div>
              <div className="text-white/30 text-[11px] mt-1">events loaded: {events.length}</div>
            </div>

            {/* Volver (solo si zoom-in y NO hay panel abierto y NO hay stats desplegados) */}
            <div
              className={[
                "fixed right-4 md:right-6 top-1/2 -translate-y-1/2 z-[9999]",
                "transition-all duration-300 ease-out will-change-transform",
                shouldShowZoomOut
                  ? "opacity-100 translate-x-0 pointer-events-auto"
                  : "opacity-0 translate-x-4 pointer-events-none",
              ].join(" ")}
            >
              <button
                onClick={() => setResetKey((k) => k + 1)}
                className={[
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
                ⤴ Volver
              </button>
            </div>

            {/* AlertPanel modal */}
            <div className="pointer-events-auto">
              <AlertPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
