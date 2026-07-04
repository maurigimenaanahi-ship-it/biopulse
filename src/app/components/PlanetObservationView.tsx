import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Clock, Flame, Map as MapIcon, MapPin, RadioTower, X, ZoomIn } from "lucide-react";
import type { EnvironmentalEvent } from "@/data/events";
import { BioPulsePlanet, type PlanetSignal, type PlanetSignalDensity } from "./BioPulsePlanet";

const DENSITY_COPY: Record<PlanetSignalDensity, { label: string; hint: string }> = {
  global: {
    label: "Vista global",
    hint: "BioPulse concentra las senales para que el planeta respire y no se sature.",
  },
  regional: {
    label: "Vista regional",
    hint: "Los grupos empiezan a separarse en areas mas precisas.",
  },
  local: {
    label: "Vista local",
    hint: "Las senales se abren con mayor detalle al acercarte.",
  },
};

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function eventToPlanetSignal(event: EnvironmentalEvent): PlanetSignal {
  const severityIntensity =
    event.severity === "critical"
      ? 1
      : event.severity === "high"
      ? 0.82
      : event.severity === "moderate"
      ? 0.58
      : 0.36;

  return {
    id: event.id,
    kind:
      event.category === "fire"
        ? "fire"
        : event.category === "storm"
        ? "storm"
        : event.category === "flood"
        ? "flood"
        : "generic",
    latitude: event.latitude,
    longitude: event.longitude,
    intensity: severityIntensity,
    label: event.title,
  };
}

function formatEventDate(value: EnvironmentalEvent["timestamp"]) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "sin fecha";
  return date.toLocaleDateString();
}

function cellSizeForDensity(density: PlanetSignalDensity, total: number) {
  if (total <= 160) return 0;
  if (density === "global") return 10;
  if (density === "regional") return 4;
  return 1.35;
}

function signalWeight(signal: PlanetSignal) {
  return (signal.count ?? 1) * (signal.intensity ?? 0.4);
}

function clusterEventsIntoPlanetSignals(events: EnvironmentalEvent[], density: PlanetSignalDensity): PlanetSignal[] {
  const cellSize = cellSizeForDensity(density, events.length);
  if (!cellSize) return events.map(eventToPlanetSignal);

  const buckets = new Map<
    string,
    {
      count: number;
      eventIds: string[];
      intensitySum: number;
      latitudeSum: number;
      longitudeSum: number;
      strongest: EnvironmentalEvent;
    }
  >();

  events.forEach((event) => {
    const signal = eventToPlanetSignal(event);
    const latCell = Math.floor((event.latitude + 90) / cellSize);
    const lonCell = Math.floor((event.longitude + 180) / cellSize);
    const key = `${signal.kind}:${latCell}:${lonCell}`;
    const existing = buckets.get(key);

    if (!existing) {
      buckets.set(key, {
        count: 1,
        eventIds: [event.id],
        intensitySum: signal.intensity ?? 0.4,
        latitudeSum: event.latitude,
        longitudeSum: event.longitude,
        strongest: event,
      });
      return;
    }

    existing.count += 1;
    existing.eventIds.push(event.id);
    existing.intensitySum += signal.intensity ?? 0.4;
    existing.latitudeSum += event.latitude;
    existing.longitudeSum += event.longitude;

    const currentWeight = SEVERITY_WEIGHT[existing.strongest.severity] ?? 1;
    const nextWeight = SEVERITY_WEIGHT[event.severity] ?? 1;
    if (nextWeight > currentWeight) {
      existing.strongest = event;
    }
  });

  return Array.from(buckets.entries())
    .map(([key, bucket]) => {
      if (bucket.count === 1) return eventToPlanetSignal(bucket.strongest);

      const strongestSignal = eventToPlanetSignal(bucket.strongest);
      return {
        id: `cluster:${density}:${key}`,
        kind: strongestSignal.kind,
        latitude: bucket.latitudeSum / bucket.count,
        longitude: bucket.longitudeSum / bucket.count,
        intensity: clamp(bucket.intensitySum / bucket.count + Math.log10(bucket.count + 1) * 0.12, 0.28, 1),
        label: `${bucket.count} senales agrupadas`,
        count: bucket.count,
        eventIds: bucket.eventIds,
      };
    })
    .sort((a, b) => signalWeight(b) - signalWeight(a));
}

export function PlanetObservationView({
  events,
  onClose,
  onOpenEvent,
}: {
  events: EnvironmentalEvent[];
  onClose: () => void;
  onOpenEvent: (event: EnvironmentalEvent) => void;
}) {
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [signalDensity, setSignalDensity] = useState<PlanetSignalDensity>("regional");
  const signals = useMemo(() => clusterEventsIntoPlanetSignals(events, signalDensity), [events, signalDensity]);
  const selectedSignal = signals.find((signal) => signal.id === selectedSignalId) ?? null;
  const selectedEvent =
    selectedSignal && (selectedSignal.count ?? 1) === 1
      ? events.find((event) => event.id === (selectedSignal.eventIds?.[0] ?? selectedSignal.id)) ?? null
      : null;
  const selectedClusterEvents =
    selectedSignal && !selectedEvent && selectedSignal.eventIds
      ? selectedSignal.eventIds.map((id) => events.find((event) => event.id === id)).filter(Boolean)
      : [];
  const fireCount = events.filter((event) => event.category === "fire").length;
  const criticalCount = events.filter((event) => event.severity === "critical").length;
  const groupedCount = signals.filter((signal) => (signal.count ?? 1) > 1).length;

  useEffect(() => {
    if (selectedSignalId && !signals.some((signal) => signal.id === selectedSignalId)) {
      setSelectedSignalId(null);
    }
  }, [selectedSignalId, signals]);

  const selectedTitle = selectedEvent?.title ?? selectedSignal?.label ?? "";
  const selectedLocation =
    selectedEvent?.location ??
    (selectedSignal ? `Area aproximada ${selectedSignal.latitude.toFixed(2)}, ${selectedSignal.longitude.toFixed(2)}` : "");
  const selectedDescription =
    selectedEvent?.description ??
    (selectedSignal
      ? `BioPulse agrupa estas ${selectedSignal.count ?? 0} senales cercanas para evitar ruido visual. Acercate al planeta para separarlas en lecturas mas especificas.`
      : "");

  return (
    <div className="absolute inset-0 z-[65] overflow-hidden bg-[#020712]">
      <BioPulsePlanet
        signals={signals}
        selectedSignalId={selectedSignalId}
        onSignalSelect={(signal) => setSelectedSignalId(signal.id)}
        onSignalDensityChange={setSignalDensity}
      />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-4 top-[calc(env(safe-area-inset-top)+88px)] max-w-sm md:left-6 md:top-24">
          <div className="pointer-events-auto rounded-[28px] border border-orange-200/12 bg-[#06111a]/48 p-4 shadow-[0_0_80px_rgba(251,146,60,0.08)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-100/54">
                  Planeta vivo
                </div>
                <div className="mt-1 text-xl font-semibold text-white/92">Senales sobre la Tierra</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/58 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Volver al mapa operativo"
                title="Volver al mapa operativo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 text-sm leading-relaxed text-white/52">
              Vista experimental. Los eventos cargados se proyectan por coordenadas sobre el planeta para explorar
              sus latidos antes de entrar al detalle operativo.
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <Activity className="h-4 w-4 text-cyan-200/75" />
                <div className="mt-2 text-lg font-semibold text-white/90">{events.length}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-white/36">eventos</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <Flame className="h-4 w-4 text-orange-200/75" />
                <div className="mt-2 text-lg font-semibold text-white/90">{fireCount}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-white/36">incendios</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                <MapIcon className="h-4 w-4 text-emerald-200/75" />
                <div className="mt-2 text-lg font-semibold text-white/90">{signals.length}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-white/36">visibles</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-orange-200/10 bg-orange-300/[0.045] px-3 py-2 text-xs leading-relaxed text-white/48">
              <span className="font-semibold text-orange-100/70">{DENSITY_COPY[signalDensity].label}</span>
              {" · "}
              {DENSITY_COPY[signalDensity].hint}
              {groupedCount > 0 ? ` ${groupedCount} grupos visibles.` : ""}
            </div>
          </div>
        </div>

        {selectedSignal ? (
          <div className="absolute bottom-4 left-4 right-4 mx-auto max-w-xl md:bottom-6">
            <div className="pointer-events-auto rounded-[28px] border border-orange-200/16 bg-[#06111a]/62 p-4 shadow-[0_0_90px_rgba(251,146,60,0.1)] backdrop-blur-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/16 bg-orange-300/[0.07] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-100/66">
                    <RadioTower className="h-3.5 w-3.5" />
                    {(selectedSignal.count ?? 1) > 1 ? "Grupo de senales" : "Senal seleccionada"}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold leading-tight text-white/92">{selectedTitle}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/44">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {selectedLocation}
                    </span>
                    <span>-</span>
                    <span>{selectedEvent?.severity ?? DENSITY_COPY[signalDensity].label}</span>
                    <span>-</span>
                    <span>{selectedEvent?.category ?? selectedSignal.kind}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSignalId(null)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/54 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Cerrar lectura de senal"
                  title="Cerrar lectura de senal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/56">{selectedDescription}</p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">lat</div>
                  <div className="mt-1 text-sm font-semibold text-white/82">{selectedSignal.latitude.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">lon</div>
                  <div className="mt-1 text-sm font-semibold text-white/82">{selectedSignal.longitude.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">intensidad</div>
                  <div className="mt-1 text-sm font-semibold text-white/82">
                    {Math.round((selectedSignal.intensity ?? 0) * 100)}%
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
                  {selectedEvent ? (
                    <>
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
                        <Clock className="h-3 w-3" />
                        obs.
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white/82">
                        {formatEventDate(selectedEvent.timestamp)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">senales</div>
                      <div className="mt-1 text-sm font-semibold text-white/82">
                        {selectedSignal.count ?? selectedClusterEvents.length}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                {selectedEvent ? (
                  <button
                    type="button"
                    onClick={() => onOpenEvent(selectedEvent)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-orange-200/24 bg-orange-300/12 px-5 text-sm font-semibold text-orange-50 transition hover:bg-orange-300/18"
                  >
                    Abrir centro de comando
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-white/58">
                    <ZoomIn className="h-4 w-4" />
                    Acercate para separar senales
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
