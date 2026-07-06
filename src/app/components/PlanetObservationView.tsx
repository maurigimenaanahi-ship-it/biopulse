import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Clock, Flame, Map as MapIcon, MapPin, RadioTower, X, ZoomIn } from "lucide-react";
import type { EnvironmentalEvent } from "@/data/events";
import type { PlanetSignal, PlanetSignalDensity } from "./BioPulsePlanet";

const LazyCesiumPlanet = lazy(() => import("./CesiumPlanet").then((module) => ({ default: module.CesiumPlanet })));

const DENSITY_COPY: Record<PlanetSignalDensity, { label: string; hint: string }> = {
  global: {
    label: "Vista global",
    hint: "BioPulse muestra latidos agrupados para que el planeta respire y no se sature.",
  },
  regional: {
    label: "Vista regional",
    hint: "Los grupos se separan por zonas. Cada latido puede contener varias señales cercanas.",
  },
  local: {
    label: "Vista local",
    hint: "Las señales se abren con mayor detalle. Tocá una señal individual para entrar al evento.",
  },
};

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
    severity: event.severity,
    label: event.title,
    eventIds: [event.id],
  };
}

function formatEventDate(value: EnvironmentalEvent["timestamp"]) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "sin fecha";
  return date.toLocaleDateString();
}

function PlanetLoadingState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#020712]" role="status" aria-live="polite">
      <div className="relative w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-cyan-200/12 bg-[#06111a]/72 px-5 py-5 text-center shadow-[0_0_90px_rgba(34,211,238,0.1)] backdrop-blur-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-cyan-200/18 bg-cyan-200/[0.055]">
          <Activity className="h-6 w-6 animate-pulse text-cyan-200/86" />
        </div>
        <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/48">
          Planeta vivo
        </div>
        <div className="mt-1 text-base font-semibold text-white/88">Sincronizando globo planetario</div>
        <div className="mt-2 text-xs leading-relaxed text-white/48">
          Estamos cargando el mapa satelital y las señales activas. En conexiones lentas puede tardar unos segundos.
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-200/55" />
        </div>
      </div>
    </div>
  );
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
  const [selectedSignal, setSelectedSignal] = useState<PlanetSignal | null>(null);
  const [planetSignalStats, setPlanetSignalStats] = useState({ visible: 0, groups: 0 });
  const [signalDensity, setSignalDensity] = useState<PlanetSignalDensity>("global");
  const signals = useMemo(() => events.map(eventToPlanetSignal), [events]);
  const selectedSignalId = selectedSignal?.id ?? null;
  const selectedEvent =
    selectedSignal && (selectedSignal.count ?? 1) === 1
      ? events.find((event) => event.id === (selectedSignal.eventIds?.[0] ?? selectedSignal.id)) ?? null
      : null;
  const selectedClusterEvents =
    selectedSignal && !selectedEvent && selectedSignal.eventIds
      ? selectedSignal.eventIds.map((id) => events.find((event) => event.id === id)).filter(Boolean)
      : [];
  const fireCount = events.filter((event) => event.category === "fire").length;
  const visibleSignalCount = planetSignalStats.visible || signals.length;
  const groupedCount = planetSignalStats.groups;
  const clearSelectedSignal = useCallback(() => setSelectedSignal(null), []);

  useEffect(() => {
    if (!selectedSignal) return;
    const selectedIds = selectedSignal.eventIds ?? [selectedSignal.id];
    if (!selectedIds.some((id) => events.some((event) => event.id === id))) {
      setSelectedSignal(null);
    }
  }, [selectedSignal, events]);

  const selectedTitle = selectedEvent?.title ?? selectedSignal?.label ?? "";
  const selectedLocation =
    selectedEvent?.location ??
    (selectedSignal ? `Área aproximada ${selectedSignal.latitude.toFixed(2)}, ${selectedSignal.longitude.toFixed(2)}` : "");
  const selectedDescription =
    selectedEvent?.description ??
    (selectedSignal
      ? `Estas ${selectedSignal.count ?? 0} señales cercanas se muestran como un solo latido para evitar ruido visual. Acercate al planeta para separarlas en lecturas más específicas.`
      : "");

  return (
    <div className="absolute inset-0 z-[65] overflow-hidden bg-[#020712]">
      <Suspense fallback={<PlanetLoadingState />}>
        <LazyCesiumPlanet
          signals={signals}
          selectedSignalId={selectedSignalId}
          onSignalSelect={setSelectedSignal}
          onSignalClear={clearSelectedSignal}
          onSignalDensityChange={setSignalDensity}
          onProjectedSignalStatsChange={setPlanetSignalStats}
        />
      </Suspense>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+76px)] w-[min(20rem,calc(100vw-1.5rem))] md:left-5 md:top-20 md:w-72">
          <div className="pointer-events-auto rounded-2xl border border-orange-200/12 bg-[#06111a]/42 p-3 shadow-[0_0_60px_rgba(251,146,60,0.07)] backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-orange-100/54">
                  Planeta vivo
                </div>
                <div className="mt-0.5 text-sm font-semibold text-white/92">Señales sobre la Tierra</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/58 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Volver al mapa operativo"
                title="Volver al mapa operativo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 text-xs leading-relaxed text-white/48">
              Explorá los latidos activos del planeta. Cuando hay demasiadas señales cercanas, BioPulse las agrupa
              y las abre gradualmente al acercarte.
            </div>

            <div className="mt-2 text-[10px] leading-relaxed text-white/38">
              Globo 3D con mapa satelital NASA GIBS y señales vivas agrupadas por proximidad.
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/82">
                  <Activity className="h-3 w-3 text-cyan-200/75" />
                  {events.length}
                </div>
                <div className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-white/34">eventos</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/82">
                  <Flame className="h-3 w-3 text-orange-200/75" />
                  {fireCount}
                </div>
                <div className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-white/34">incendios</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/82">
                  <MapIcon className="h-3 w-3 text-emerald-200/75" />
                  {visibleSignalCount}
                </div>
                <div className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-white/34">visibles</div>
              </div>
            </div>

            <div className="mt-2 rounded-xl border border-orange-200/10 bg-orange-300/[0.045] px-2.5 py-1.5 text-[10px] leading-relaxed text-white/46">
              <span className="font-semibold text-orange-100/70">{DENSITY_COPY[signalDensity].label}</span>
              {" - "}
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
                    {(selectedSignal.count ?? 1) > 1 ? "Grupo de señales" : "Señal seleccionada"}
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
                  onClick={() => setSelectedSignal(null)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/54 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Cerrar lectura de señal"
                  title="Cerrar lectura de señal"
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
                      <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">señales</div>
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
                    Acercate para separar señales
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
