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

// 🔥 FIRMS Proxy URL (verificado)
const FIRMS_PROXY = "https://square-frost-5487.maurigimenaanahi.workers.dev";

type AppStage = "splash" | "setup" | "dashboard";

export default function App() {
  const [stage, setStage] = useState<AppStage>("splash");
  const [activeView, setActiveView] = useState('home');

  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);

  const [events, setEvents] = useState<EnvironmentalEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EnvironmentalEvent | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const selectedRegion =
    REGION_GROUPS.flatMap(g => g.regions).find(r => r.key === selectedRegionKey) ?? null;

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

        const fires: EnvironmentalEvent[] = (data.features ?? [])
          .map((f: any, i: number) => ({
            id: f.id || `fire-${i}`,
            category: "fire" as EventCategory,
            severity:
              f.confidence === "h" ? "critical" :
              f.confidence === "n" ? "high" :
              "moderate",
            title: "Active Fire",
            description: `FRP ${f.frp ?? "n/a"} • Confidence ${f.confidence ?? "n/a"}`,
            latitude: Number(f.latitude),
            longitude: Number(f.longitude),
            location: args.region.label,
            timestamp: new Date(`${f.acq_date}T00:00:00Z`), // opcional pero más real que "now"
            affectedArea: 1,
            riskIndicators: [],
          }))
          .filter((ev: any) => Number.isFinite(ev.latitude) && Number.isFinite(ev.longitude));

        setEvents(fires);
        setStage("dashboard");
        return;
      } catch (error) {
        console.error("Error fetching FIRMS data:", error);
        // fallback
        const filtered = mockEvents.filter((e) => e.category === "fire");
        setEvents(filtered);
        setStage("dashboard");
        return;
      }
    }

    // Otras categorías: por ahora mock (MVP)
    const filtered = mockEvents.filter((e) => e.category === args.category);
    setEvents(filtered);
    setStage("dashboard");
  };

  // (no usado aún, pero lo dejamos)
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

  const activeCategories = useMemo(() => {
    return new Set<EventCategory>(selectedCategory ? [selectedCategory] : []);
  }, [selectedCategory]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#050a14] relative">
      <SplashScreen
        open={stage === "splash"}
        onStart={() => setStage("setup")}
      />

      <div className="absolute inset-0 bg-gradient-radial from-cyan-950/20 via-transparent to-transparent opacity-30" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />

      <Header activeView={activeView} onViewChange={setActiveView} />

      {stage === "setup" && (
        <SetupPanel
          category={selectedCategory}
          regionKey={selectedRegionKey}
          onChangeCategory={(c) => setSelectedCategory(c)}
          onChangeRegion={(rk) => setSelectedRegionKey(rk)}
          onStart={startMonitoring}
        />
      )}

      {stage === "dashboard" && (
        <>
          <StatsPanel
            totalEvents={stats.total}
            criticalEvents={stats.critical}
            affectedRegions={stats.regions}
          />

          <MapScene
            events={events}
            bbox={selectedRegion?.bbox ?? null}
            onEventClick={setSelectedEvent}
          />

          <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} />

          <AlertPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />

          <div className="absolute left-6 bottom-6 px-4 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
            <div className="text-white/70 text-sm font-medium">Scan active</div>
            <div className="text-white/45 text-xs mt-1">
              {selectedCategory?.toUpperCase()} • {selectedRegion?.label ?? "Region"} • bbox {selectedRegion?.bbox}
            </div>
            <div className="text-white/30 text-[11px] mt-1">
              events loaded: {events.length}
            </div>
          </div>
        </>
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,212,255,0.03),transparent_50%)]" />
    </div>
  );
}
