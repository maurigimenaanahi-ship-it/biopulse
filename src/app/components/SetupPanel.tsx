import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Source } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { EventCategory } from "@/data/events";
import { categoryColors, categoryLabels } from "@/data/events";

type Region = {
  key: string;
  label: string;
  bbox: string; // "west,south,east,north"
};

type RegionGroup = {
  key: string;
  label: string;
  regions: Region[];
};

const CATEGORY_OPTIONS: { key: EventCategory; label: string; subtitle: string }[] = [
  { key: "fire", label: "Incendios en vivo", subtitle: "Detecciones satelitales FIRMS/VIIRS" },
  { key: "flood", label: "Inundaciones en vivo", subtitle: "Eventos hidrologicos y riesgo, proximo MVP" },
  { key: "storm", label: "Tormentas en vivo", subtitle: "Tormentas severas y trayectorias, proximo MVP" },
  { key: "heatwave", label: "Olas de calor", subtitle: "Anomalias termicas regionales, proximo MVP" },
  { key: "air-pollution", label: "Contaminacion del aire", subtitle: "AQI y plumas, proximo MVP" },
  { key: "ocean-anomaly", label: "Anomalias oceanicas", subtitle: "Temperatura superficial y corrientes, proximo MVP" },
];

// MVP: arrancamos con America.
export const REGION_GROUPS: RegionGroup[] = [
  {
    key: "america",
    label: "America",
    regions: [
      { key: "north-america", label: "America del Norte", bbox: "-168,5,-52,83" },
      { key: "central-america", label: "America Central", bbox: "-118,5,-60,33" },
      { key: "south-america", label: "America del Sur", bbox: "-82,-56,-34,13" },
    ],
  },
];

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function parseBbox(bbox: string) {
  const [w, s, e, n] = bbox.split(",").map(Number);
  return { w, s, e, n };
}

function bboxToBounds(bbox: string) {
  const { w, s, e, n } = parseBbox(bbox);
  return [
    [w, s],
    [e, n],
  ] as [[number, number], [number, number]];
}

function bboxToPolygon(bbox: string) {
  const { w, s, e, n } = parseBbox(bbox);
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
        },
        properties: {},
      },
    ],
  };
}

function MiniMap(props: { bbox: string | null; tint: string }) {
  const mapRef = useRef<MapRef | null>(null);

  const bboxGeo = useMemo(() => {
    if (!props.bbox) return null;
    return bboxToPolygon(props.bbox);
  }, [props.bbox]);

  useEffect(() => {
    if (!props.bbox || !mapRef.current) return;
    mapRef.current.fitBounds(bboxToBounds(props.bbox), { padding: 24, duration: 650 });
  }, [props.bbox]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <div className="h-[116px]">
        <Map
          ref={(r) => (mapRef.current = r)}
          initialViewState={{ longitude: -30, latitude: 10, zoom: 1.1 }}
          mapStyle={DARK_STYLE}
          style={{ width: "100%", height: "100%" }}
          attributionControl={false}
          dragPan={false}
          scrollZoom={false}
          doubleClickZoom={false}
          touchZoomRotate={false}
          keyboard={false}
          cooperativeGestures={false}
          onLoad={() => {
            if (props.bbox) mapRef.current?.fitBounds(bboxToBounds(props.bbox), { padding: 24, duration: 650 });
          }}
        >
          {bboxGeo && (
            <Source id="bbox" type="geojson" data={bboxGeo as any}>
              <Layer
                id="bbox-line"
                type="line"
                paint={{
                  "line-color": props.tint,
                  "line-width": 3,
                  "line-opacity": 0.9,
                }}
              />
              <Layer
                id="bbox-fill"
                type="fill"
                paint={{
                  "fill-color": props.tint,
                  "fill-opacity": 0.08,
                }}
              />
            </Source>
          )}
        </Map>
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${props.tint}22, transparent 55%)`,
        }}
      />

      <div className="pointer-events-none absolute bottom-3 left-4 text-xs text-white/62">
        Territorio inicial
      </div>
    </div>
  );
}

type SetupStep = "signal" | "region";

export function SetupPanel(props: {
  category: EventCategory | null;
  regionKey: string | null;
  onChangeCategory: (c: EventCategory) => void;
  onChangeRegion: (regionKey: string) => void;
  onStart: (args: { category: EventCategory; region: Region }) => void;
  isStarting?: boolean;
  onClose?: () => void;
  canClose?: boolean;
}) {
  const [step, setStep] = useState<SetupStep>(() => (props.category ? "region" : "signal"));
  const selectedRegion =
    REGION_GROUPS.flatMap((g) => g.regions).find((r) => r.key === props.regionKey) ?? null;

  const canStart = props.category && selectedRegion;
  const tint =
    (props.category ? (categoryColors as any)[props.category] : null) ?? "rgba(34,211,238,1)";
  const selectedCategoryLabel = props.category
    ? (categoryLabels as any)[props.category] ?? props.category
    : null;

  const goToRegion = () => {
    if (!props.category) return;
    setStep("region");
  };

  const startDisabled = !canStart || props.isStarting;

  return (
    <div className="pointer-events-none absolute inset-0 z-[70] flex items-end justify-center p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-black/10 backdrop-blur-[0.5px]" />

      <div className="pointer-events-auto relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-cyan-200/12 bg-[#04111a]/48 shadow-[0_0_90px_rgba(34,211,238,0.09)] backdrop-blur-md">
        <div className="p-4 md:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/50">
                Entrada al mapa · {step === "signal" ? "01" : "02"} / 02
              </div>
              <div className="mt-1 text-xl font-semibold text-white md:text-2xl">
                {step === "signal" ? "¿Que latido queres observar?" : "¿Donde empezamos a mirar?"}
              </div>
              <div className="mt-1 max-w-xl text-sm leading-relaxed text-white/52">
                {step === "signal"
                  ? "Elegi una senal inicial del planeta. BioPulse va a preparar el mapa alrededor de esa lectura."
                  : "Elegi una region de trabajo. Mas adelante este paso podra ser mundial y mucho mas preciso."}
              </div>
            </div>

            {props.canClose && props.onClose && (
              <button
                onClick={props.onClose}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/62 transition hover:bg-white/[0.08] hover:text-white"
              >
                Volver
              </button>
            )}
          </div>

          <div className="mt-4">
            {step === "signal" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CATEGORY_OPTIONS.map((opt) => {
                  const active = props.category === opt.key;
                  const c = (categoryColors as any)[opt.key] ?? "rgba(34,211,238,1)";
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        props.onChangeCategory(opt.key);
                        setStep("region");
                      }}
                      className="min-h-[78px] rounded-2xl border p-3 text-left transition"
                      style={{
                        borderColor: active ? `${c}66` : "rgba(255,255,255,0.10)",
                        backgroundColor: active ? `${c}1A` : "rgba(0,0,0,0.16)",
                        boxShadow: active ? `0 0 26px ${c}1F` : "none",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: c, boxShadow: `0 0 18px ${c}66` }}
                        />
                        <div className="font-medium text-white/86">{opt.label}</div>
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-white/43">{opt.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-[0.95fr_1fr]">
                <div>
                  <MiniMap bbox={selectedRegion?.bbox ?? null} tint={tint} />
                  <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-white/48">
                    Señal: <span className="text-white/76">{selectedCategoryLabel ?? "sin elegir"}</span>
                    <span className="mx-2 text-white/25">•</span>
                    Territorio: <span className="text-white/76">{selectedRegion?.label ?? "sin elegir"}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {REGION_GROUPS.map((group) => (
                    <div key={group.key}>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/38">
                        {group.label}
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {group.regions.map((region) => {
                          const active = props.regionKey === region.key;
                          return (
                            <button
                              key={region.key}
                              onClick={() => props.onChangeRegion(region.key)}
                              className="rounded-xl border p-3 text-left transition"
                              style={{
                                borderColor: active ? `${tint}66` : "rgba(255,255,255,0.10)",
                                backgroundColor: active ? `${tint}1A` : "rgba(0,0,0,0.16)",
                              }}
                            >
                              <div className="font-medium text-white/86">{region.label}</div>
                              <div className="mt-1 text-xs text-white/42">
                                Marco de observacion inicial para el escaneo.
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm leading-relaxed text-white/44">
              {props.isStarting
                ? "Escaneando senales satelitales y preparando el mapa."
                : step === "signal"
                ? "Selecciona una senal para continuar."
                : canStart
                ? "Listo. BioPulse puede entrar al mapa operativo."
                : "Selecciona un territorio para iniciar."}
            </div>

            <div className="flex items-center gap-2">
              {step === "region" ? (
                <button
                  type="button"
                  onClick={() => setStep("signal")}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-white/56 transition hover:bg-white/[0.07] hover:text-white/78"
                >
                  Cambiar señal
                </button>
              ) : null}

              {step === "signal" ? (
                <button
                  type="button"
                  disabled={!props.category}
                  onClick={goToRegion}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/10 px-5 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-200/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Elegir territorio
                </button>
              ) : (
                <button
                  disabled={startDisabled}
                  aria-busy={props.isStarting ? "true" : undefined}
                  onClick={() => {
                    if (startDisabled || !props.category || !selectedRegion) return;
                    props.onStart({ category: props.category, region: selectedRegion });
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-3 rounded-full px-5 text-sm font-semibold transition"
                  style={{
                    border: "1px solid",
                    borderColor: canStart ? `${tint}66` : "rgba(255,255,255,0.12)",
                    background: canStart
                      ? `linear-gradient(135deg, ${tint}33, ${tint}0F)`
                      : "rgba(255,255,255,0.04)",
                    color: canStart ? "#e0fbff" : "rgba(255,255,255,0.35)",
                    boxShadow: canStart ? `0 0 30px ${tint}33` : "none",
                    cursor: startDisabled ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {props.isStarting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-100/30 border-t-cyan-100" />
                  ) : null}
                  {props.isStarting ? "Escaneando..." : "Entrar al mapa"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
