import { useEffect, useMemo, useState } from "react";
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

// lucide icons
import { BarChart3, Clock3, Radio, Settings2 } from "lucide-react";

const FIRMS_PROXY = "https://square-frost-5487.maurigimenaanahi.workers.dev";

type AppStage = "splash" | "setup" | "dashboard";

// panel ids para mobile dock
type MobilePanel = "none" | "stats" | "timeline" | "status" | "setup";

export default function App() {
  const [stage, setStage] = useState<AppStage>("splash");
  const [activeView, setActiveView] = useState("home");

  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);

  const [events, setEvents] = useState<EnvironmentalEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EnvironmentalEvent | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [resetKey, setResetKey] = useState(0);
  const [showZoomOut, setShowZoomOut] = useState(false);

  // ✅ mobile detection
  const [isMobile, setIsMobile] = useState(false);

  // ✅ “colapsado” = panels ocultos y solo dock visible
  const [mobileCollapsed, setMobileCollapsed] = useState(false);

  // ✅ cuál panel está abierto desde el dock
  const [mobileOpenPanel, setMobileOpenPanel] = useState<MobilePanel>("none");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const selectedRegion =
    REGION_GROUPS.flatMap((g) => g.regions).find((r) => r.key === selectedRegionKey) ?? null;

  const openSetup = () => {
    setSelectedEvent(null);
    setShowZoomOut(false);
    setMobileOpenPanel("none");
    setMobileCollapsed(false);
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

        // ✅ mobile: arrancamos sin colapsar
        setMobileCollapsed(false);
        setMobileOpenPanel("none");
        return;
      } catch (error) {
        console.error("Error fetching FIRMS data:", error);
        const filtered = mockEvents.filter((e) => e.category === "fire");
        setEvents(filtered);
        setSelectedEvent(null);
        setStage("dashboard");
        setResetKey((k) => k + 1);
        setShowZoomOut(false);
        setMobileCollapsed(false);
        setMobileOpenPanel("none");
        return;
      }
    }

    const filtered = mockEvents.filter((e) => e.category === args.category);
    setEvents(filtered);
    setSelectedEvent(null);
    setStage("dashboard");
    setResetKey((k) => k + 1);
    setShowZoomOut(false);
    setMobileCollapsed(false);
    setMobileOpenPanel("none");
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

  const headerOverlayActive = !!selectedEvent || stage === "setup";

  // ✅ si se abre modal, no colapses y cerrá panel dock
  useEffect(() => {
    if (selectedEvent) {
      setMobileCollapsed(false);
      setMobileOpenPanel("none");
    }
  }, [selectedEvent]);

  // ✅ cuando el usuario interactúa con el mapa: colapsa UI en mobile
  const handleMapInteracting = () => {
    if (!isMobile) return;
    if (selectedEvent) return;

    // si estaba abierto algún panel desde dock, lo cerramos y colapsamos
    setMobileOpenPanel("none");
    setMobileCollapsed(true);
  };

  // en mobile, si está colapsado, escondemos paneles
  const showPanels = !(isMobile && mobileCollapsed);

  // ✅ abrir/cerrar panel desde dock
  const toggleMobilePanel = (id: MobilePanel) => {
    // si abrís panel: expandimos UI (no colapsada)
    setMobileCollapsed(false);
    setMobileOpenPanel((cur) => (cur === id ? "none" : id));
  };

  // ✅ si tocás “afuera” en mobile (sobre el mapa), colapsamos
  const collapseMobile = () => {
    if (!isMobile) return;
    if (selectedEvent) return;
    setMobileOpenPanel("none");
    setMobileCollapsed(true);
  };

  return (
    <div className="w-screen h-screen bg-[#050a14] relative">
      <SplashScreen open={stage === "splash"} onStart={() => setStage("setup")} />

      <Header
        activeView={activeView}
        onViewChange={setActiveView}
        overlayActive={headerOverlayActive}
      />

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
          {/* MAP */}
          <div className="absolute inset-0 z-0">
            {/* “tap outside” para colapsar en mobile */}
            <div className="absolute inset-0" onClick={collapseMobile} />
            <MapScene
              events={events}
              bbox={selectedRegion?.bbox ?? null}
              onEventClick={setSelectedEvent}
              resetKey={resetKey}
              onZoomedInChange={setShowZoomOut}
              onUserInteracting={handleMapInteracting}
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
            {/* ✅ Mobile Dock (solo mobile, y no cuando hay modal) */}
            {isMobile && !selectedEvent && (
              <div className="pointer-events-auto fixed right-3 top-1/2 -translate-y-1/2 z-[9999]">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => toggleMobilePanel("stats")}
                    className={[
                      "w-12 h-12 rounded-2xl shadow-lg",
                      "backdrop-blur-md border border-cyan-400/25 bg-cyan-400/12",
                      "grid place-items-center",
                      "transition-transform active:scale-95",
                      mobileOpenPanel === "stats" ? "ring-2 ring-cyan-400/35" : "",
                    ].join(" ")}
                    aria-label="Estadísticas"
                    title="Estadísticas"
                  >
                    <BarChart3 className="w-5 h-5 text-cyan-100" />
                  </button>

                  <button
                    onClick={() => toggleMobilePanel("timeline")}
                    className={[
                      "w-12 h-12 rounded-2xl shadow-lg",
                      "backdrop-blur-md border border-cyan-400/25 bg-cyan-400/12",
                      "grid place-items-center",
                      "transition-transform active:scale-95",
                      mobileOpenPanel === "timeline" ? "ring-2 ring-cyan-400/35" : "",
                    ].join(" ")}
                    aria-label="Timeline"
                    title="Timeline"
                  >
                    <Clock3 className="w-5 h-5 text-cyan-100" />
                  </button>

                  <button
                    onClick={() => toggleMobilePanel("status")}
                    className={[
                      "w-12 h-12 rounded-2xl shadow-lg",
                      "backdrop-blur-md border border-cyan-400/25 bg-cyan-400/12",
                      "grid place-items-center",
                      "transition-transform active:scale-95",
                      mobileOpenPanel === "status" ? "ring-2 ring-cyan-400/35" : "",
                    ].join(" ")}
                    aria-label="Estado"
                    title="Estado"
                  >
                    <Radio className="w-5 h-5 text-cyan-100" />
                  </button>

                  <button
                    onClick={() => toggleMobilePanel("setup")}
                    className={[
                      "w-12 h-12 rounded-2xl shadow-lg",
                      "backdrop-blur-md border border-cyan-400/25 bg-cyan-400/12",
                      "grid place-items-center",
                      "transition-transform active:scale-95",
                      mobileOpenPanel === "setup" ? "ring-2 ring-cyan-400/35" : "",
                    ].join(" ")}
                    aria-label="Cambiar categoría o región"
                    title="Cambiar categoría o región"
                  >
                    <Settings2 className="w-5 h-5 text-cyan-100" />
                  </button>
                </div>
              </div>
            )}

            {/* ✅ Panels (desktop normal, mobile controlado por dock/collapse) */}
            <div
              className={[
                "transition-all duration-300 ease-out",
                showPanels ? "opacity-100" : "opacity-0 pointer-events-none",
              ].join(" ")}
            >
              {/* Desktop: botón Cambiar */}
              {!isMobile && (
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
              )}

              {/* Desktop: Stats normal */}
              {!isMobile && (
                <div className="pointer-events-auto">
                  <StatsPanel
                    totalEvents={stats.total}
                    criticalEvents={stats.critical}
                    affectedRegions={stats.regions}
                  />
                </div>
              )}

              {/* Desktop: Timeline normal */}
              {!isMobile && (
                <div className="pointer-events-auto">
                  <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} />
                </div>
              )}

              {/* Desktop: status card */}
              {!isMobile && (
                <div className="pointer-events-auto absolute left-4 md:left-6 bottom-4 md:bottom-6 px-4 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
                  <div className="text-white/70 text-sm font-medium">Scan active</div>
                  <div className="text-white/45 text-xs mt-1">
                    {selectedCategory?.toUpperCase()} • {selectedRegion?.label ?? "Region"}
                  </div>
                  <div className="text-white/30 text-[11px] mt-1">
                    events loaded: {events.length}
                  </div>
                </div>
              )}

              {/* Zoom-out (desktop + mobile, pero se controla con selectedEvent) */}
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
            </div>

            {/* ✅ Mobile “opened panel” overlays from dock */}
            {isMobile && !selectedEvent && mobileOpenPanel !== "none" && (
              <div className="pointer-events-auto fixed inset-0 z-[9998]" onClick={collapseMobile}>
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                  aria-hidden="true"
                />
                <div
                  className="absolute left-3 right-16 top-20 bottom-20 rounded-2xl border border-white/10 bg-[#0a0f1a]/95 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Panel header */}
                  <div className="px-5 py-4 border-b border-white/10 text-white/85 font-medium">
                    {mobileOpenPanel === "stats" && "Estadísticas"}
                    {mobileOpenPanel === "timeline" && "Timeline"}
                    {mobileOpenPanel === "status" && "Estado"}
                    {mobileOpenPanel === "setup" && "Cambiar"}
                  </div>

                  {/* Panel content */}
                  <div className="p-4 overflow-y-auto h-[calc(100%-56px)]">
                    {mobileOpenPanel === "stats" && (
                      <StatsPanel
                        totalEvents={stats.total}
                        criticalEvents={stats.critical}
                        affectedRegions={stats.regions}
                      />
                    )}

                    {mobileOpenPanel === "timeline" && (
                      <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} />
                    )}

                    {mobileOpenPanel === "status" && (
                      <div className="px-4 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
                        <div className="text-white/70 text-sm font-medium">Scan active</div>
                        <div className="text-white/45 text-xs mt-1">
                          {selectedCategory?.toUpperCase()} • {selectedRegion?.label ?? "Region"}
                        </div>
                        <div className="text-white/30 text-[11px] mt-1">
                          events loaded: {events.length}
                        </div>
                      </div>
                    )}

                    {mobileOpenPanel === "setup" && (
                      <div className="space-y-3">
                        <div className="text-white/60 text-sm">
                          Volvés a elegir categoría o región.
                        </div>
                        <button
                          onClick={openSetup}
                          className={[
                            "w-full px-5 py-4 rounded-xl text-lg font-medium transition",
                            "border border-cyan-400/30 bg-cyan-400/12 text-cyan-100",
                            "hover:bg-cyan-400/18",
                          ].join(" ")}
                        >
                          Abrir configuración
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Alert modal */}
            <div className="pointer-events-auto">
              <AlertPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
