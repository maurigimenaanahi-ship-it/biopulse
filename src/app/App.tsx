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
import { SlidersHorizontal, Activity, AlertTriangle, MapPin } from "lucide-react";

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

  // Mobile UX: stats expand/collapse
  const [statsExpandedMobile, setStatsExpandedMobile] = useState(true);

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
        setStatsExpandedMobile(true);
        return;
      } catch (error) {
        console.error("Error fetching FIRMS data:", error);
        const filtered = mockEvents.filter((e) => e.category === "fire");
        setEvents(filtered);
        setSelectedEvent(null);
        setStage("dashboard");
        setResetKey((k) => k + 1);
        setShowZoomOut(false);
        setStatsExpandedMobile(true);
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
    setStatsExpandedMobile(true);
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

  // Volver aparece cuando hay zoom y NO hay panel abierto
  const shouldShowZoomOut = showZoomOut && !selectedEvent;

  // ✅ Regla: apenas hay zoom en mobile, colapsamos stats automáticamente
  useEffect(() => {
    // solo colapsamos si hay zoom y no hay alerta abierta
    if (showZoomOut && !selectedEvent) {
      setStatsExpandedMobile(false);
    }
    // cuando volvés a vista general, expandimos de nuevo
    if (!showZoomOut && !selectedEvent) {
      setStatsExpandedMobile(true);
    }
  }, [showZoomOut, selectedEvent]);

  // ✅ Dock compacto (mobile) – aparece cuando stats están colapsados
  const showMobileDock = !statsExpandedMobile && !selectedEvent;

  const timelineSafeBottomMobile = "bottom-[12.75rem]"; // evita pisar la timeline + playback
  const timelineSafeBottomMobileVolver = "bottom-[18.25rem]"; // un poco más arriba que el botón Cambiar

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
            {/* Botón "Cambiar búsqueda" */}
            <div
              className={[
                "pointer-events-auto fixed z-[9999]",
                // MOBILE: abajo, pero arriba de la timeline
                `left-4 ${timelineSafeBottomMobile}`,
                // DESKTOP: arriba
                "md:left-6 md:bottom-auto md:top-24",
              ].join(" ")}
            >
              <button
                onClick={openSetup}
                className={[
                  "px-4 py-3 rounded-2xl shadow-lg",
                  "backdrop-blur-md border border-cyan-400/25",
                  "bg-cyan-400/15 hover:bg-cyan-400/22",
                  "text-white/90 hover:text-white",
                  "transition-colors",
                  "min-w-[12.5rem] md:min-w-[16rem]",
                ].join(" ")}
                title="Cambiar categoría o región"
                aria-label="Cambiar categoría o región"
              >
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-cyan-200" />
                  <div className="font-medium leading-none">
                    <span className="md:hidden">Cambiar</span>
                    <span className="hidden md:inline">Cambiar búsqueda</span>
                  </div>
                </div>
                <div className="hidden md:block text-white/55 text-xs mt-1">
                  Categoría • Región
                </div>
              </button>
            </div>

            {/* ✅ Stats: en mobile se pueden colapsar */}
            <div className="pointer-events-auto">
              <div className={statsExpandedMobile ? "block" : "hidden md:block"}>
                <StatsPanel
                  totalEvents={stats.total}
                  criticalEvents={stats.critical}
                  affectedRegions={stats.regions}
                />
              </div>
            </div>

            {/* ✅ Dock compacto (solo mobile cuando colapsado) */}
            {showMobileDock && (
              <div className="pointer-events-auto fixed right-4 top-24 z-[9999] md:hidden">
                <div className="flex flex-col gap-3">
                  {[
                    {
                      icon: <Activity className="w-5 h-5" />,
                      value: stats.total,
                      pill: "bg-cyan-400/15 border-cyan-400/25 text-cyan-100",
                      label: "Active events",
                    },
                    {
                      icon: <AlertTriangle className="w-5 h-5" />,
                      value: stats.critical,
                      pill: "bg-rose-400/15 border-rose-400/25 text-rose-100",
                      label: "Critical alerts",
                    },
                    {
                      icon: <MapPin className="w-5 h-5" />,
                      value: stats.regions,
                      pill: "bg-amber-400/15 border-amber-400/25 text-amber-100",
                      label: "Affected regions",
                    },
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setStatsExpandedMobile(true)}
                      className={[
                        "w-[3.25rem] h-[3.25rem] rounded-2xl",
                        "border shadow-lg backdrop-blur-md",
                        "flex flex-col items-center justify-center gap-1",
                        "transition-colors",
                        item.pill,
                      ].join(" ")}
                      aria-label={`Expandir panel: ${item.label}`}
                      title={`Mostrar ${item.label}`}
                    >
                      <div className="opacity-90">{item.icon}</div>
                      <div className="text-[11px] leading-none font-semibold tabular-nums">
                        {item.value}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
              <div className="text-white/30 text-[11px] mt-1">
                events loaded: {events.length}
              </div>
            </div>

            {/* Botón "Volver" */}
            <div
              className={[
                "fixed z-[9999] transition-all duration-300 ease-out will-change-transform",
                // DESKTOP: al centro derecha
                "md:right-6 md:top-1/2 md:-translate-y-1/2",
                // MOBILE: lo bajamos para que no se pegue al dock/paneles
                `right-4 ${timelineSafeBottomMobileVolver} md:bottom-auto md:translate-y-0`,
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
        </div>
      )}
    </div>
  );
}
