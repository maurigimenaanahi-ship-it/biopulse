import { useState, useMemo } from 'react';
import { MapScene } from './components/MapScene';
import { Header } from './components/Header';
import { AlertPanel } from './components/AlertPanel';
import { Timeline } from './components/Timeline';
import { StatsPanel } from './components/StatsPanel';
import { SplashScreen } from './components/SplashScreen';
import { SetupPanel, REGION_GROUPS } from './components/SetupPanel';
import { mockEvents } from '@/data/events';
import type { EnvironmentalEvent, EventCategory } from '@/data/events';

// 🔥 FIRMS Proxy URL
const FIRMS_PROXY = "https://square-frost-5487.maurigimenaanahi.workers.dev";

type AppStage = "splash" | "setup" | "dashboard";

export default function App() {
  // 🔒 Estado sólido anti-despelote
  const [stage, setStage] = useState<AppStage>("splash");

  // (Header tabs por ahora no definen pantallas; después lo conectamos a panel derecho real)
  const [activeView, setActiveView] = useState('home');

  // 1 categoría activa (como recomendás)
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);

  // región activa por key
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);

  // Eventos cargados (por ahora mock; después reemplazamos por FIRMS real)
  const [events, setEvents] = useState<EnvironmentalEvent[]>([]);

  const [selectedEvent, setSelectedEvent] = useState<EnvironmentalEvent | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const selectedRegion =
    REGION_GROUPS.flatMap(g => g.regions).find(r => r.key === selectedRegionKey) ?? null;

  // Iniciar monitoreo: acá es donde luego vamos a hacer fetch FIRMS por bbox + categoría
  const startMonitoring = async (args: { category: EventCategory; region: { key: string; label: string; bbox: string } }) => {
    setSelectedCategory(args.category);
    setSelectedRegionKey(args.region.key);

    // 🔥 MVP REAL: fetch FIRMS usando args.region.bbox
    if (args.category === "fire") {
      try {
        const url = `${FIRMS_PROXY}/fires?bbox=${args.region.bbox}&days=1&source=VIIRS_SNPP_NRT`;
        
        const res = await fetch(url);
        const data = await res.json();

        const fires = data.features.map((f: any, i: number) => ({
          id: f.id || `fire-${i}`,
          category: "fire" as EventCategory,
          severity:
            f.confidence === "h" ? "critical" :
            f.confidence === "n" ? "high" :
            "moderate",
          title: "Active Fire",
          description: `FRP ${f.frp ?? "n/a"} • Confidence ${f.confidence ?? "n/a"}`,
          latitude: f.latitude,
          longitude: f.longitude,
          location: args.region.label,
          timestamp: new Date(),
          affectedArea: 1,
          riskIndicators: [],
        }));

        setEvents(fires);
      } catch (error) {
        console.error("Error fetching FIRMS data:", error);
        // Fallback to mock data on error
        const filtered = mockEvents.filter((e) => e.category === args.category);
        setEvents(filtered);
      }
    } else {
      // Para otras categorías (MVP luego), usamos mock data
      const filtered = mockEvents.filter((e) => e.category === args.category);
      setEvents(filtered);
    }

    setStage("dashboard");
  };

  // counts / stats ya no usan mockEvents globales, sino los events cargados
  const eventCounts = useMemo(() => {
    const counts: Record<EventCategory, number> = {
      flood: 0,
      fire: 0,
      storm: 0,
      heatwave: 0,
      'air-pollution': 0,
      'ocean-anomaly': 0,
    };
    events.forEach((e) => counts[e.category]++);
    return counts;
  }, [events]);

  const stats = useMemo(() => {
    const criticalCount = events.filter((e) => e.severity === 'critical').length;
    const uniqueLocations = new Set(events.map((e) => e.location.split(',')[0]));
    return {
      total: events.length,
      critical: criticalCount,
      regions: uniqueLocations.size,
    };
  }, [events]);

  // ActiveCategories para Scene (compatibilidad con tu componente actual)
  const activeCategories = useMemo(() => {
    return new Set<EventCategory>(selectedCategory ? [selectedCategory] : []);
  }, [selectedCategory]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#050a14] relative">
      {/* Splash overlay (siempre al abrir) */}
      <SplashScreen
        open={stage === "splash"}
        onStart={() => setStage("setup")}
      />

      {/* Background gradient effects */}
      <div className="absolute inset-0 bg-gradient-radial from-cyan-950/20 via-transparent to-transparent opacity-30" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />

      {/* Header (puede quedar siempre visible) */}
      <Header activeView={activeView} onViewChange={setActiveView} />

      {/* Setup overlay (categoría + región) */}
      {stage === "setup" && (
        <SetupPanel
          category={selectedCategory}
          regionKey={selectedRegionKey}
          onChangeCategory={(c) => setSelectedCategory(c)}
          onChangeRegion={(rk) => setSelectedRegionKey(rk)}
          onStart={startMonitoring}
        />
      )}

      {/* Dashboard (solo cuando ya inició monitoreo) */}
      {stage === "dashboard" && (
        <>
          {/* Stats Panel */}
          <StatsPanel
            totalEvents={stats.total}
            criticalEvents={stats.critical}
            affectedRegions={stats.regions}
          />

          {/* Main Map Scene */}
          <MapScene
            events={events}
            bbox={selectedRegion?.bbox ?? null}
            onEventClick={setSelectedEvent}
          />

          {/* Timeline */}
          <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} />

          {/* Alert Panel */}
          <AlertPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />

          {/* Small context badge (opcional, pero súper útil) */}
          <div className="absolute left-6 bottom-6 px-4 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
            <div className="text-white/70 text-sm font-medium">Scan active</div>
            <div className="text-white/45 text-xs mt-1">
              {selectedCategory?.toUpperCase()} • {selectedRegion?.label ?? "Region"} • bbox {selectedRegion?.bbox}
            </div>
          </div>
        </>
      )}

      {/* Ambient particles overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,212,255,0.03),transparent_50%)]" />
    </div>
  );
}