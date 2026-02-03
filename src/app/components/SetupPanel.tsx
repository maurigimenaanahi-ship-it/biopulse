import { useEffect, useMemo, useRef } from "react";
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
  { key: "fire", label: "Incendios en vivo", subtitle: "Detecciones satelitales (FIRMS/VIIRS)" },
  { key: "flood", label: "Inundaciones en vivo", subtitle: "Eventos hidrológicos y riesgo (MVP luego)" },
  { key: "storm", label: "Tormentas en vivo", subtitle: "Tormentas severas y trayectorias (MVP luego)" },
  { key: "heatwave", label: "Olas de calor", subtitle: "Anomalías térmicas regionales (MVP luego)" },
  { key: "air-pollution", label: "Contaminación del aire", subtitle: "AQI y plumas (MVP luego)" },
  { key: "ocean-anomaly", label: "Anomalías oceánicas", subtitle: "Temperatura superficial y corrientes (MVP luego)" },
];

// MVP: arrancamos con América
export const REGION_GROUPS: RegionGroup[] = [
  {
    key: "america",
    label: "América",
    regions: [
      { key: "north-america", label: "América del Norte", bbox: "-168,5,-52,83" },
      { key: "central-america", label: "América Central", bbox: "-118,5,-60,33" },
      { key: "south-america", label: "América del Sur", bbox: "-82,-56,-34,13" },
    ],
  },
];

// Mapa oscuro (sin keys)
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
    mapRef.current.fitBounds(bboxToBounds(props.bbox), { padding: 30, duration: 650 });
  }, [props.bbox]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/20">
      <div className="h-[180px] md:h-[220px]">
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
            if (props.bbox) mapRef.current?.fitBounds(bboxToBounds(props.bbox), { padding: 30, duration: 650 });
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

      {/* Tint overlay por categoría */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${props.tint}22, transparent 55%)`,
        }}
      />

      {/* Etiqueta */}
      <div className="pointer-events-none absolute left-4 bottom-3 text-white/70 text-xs md:text-sm">
        Vista previa
      </div>
    </div>
  );
}

export function SetupPanel(props: {
  category: EventCategory | null;
  regionKey: string | null;
  onChangeCategory: (c: EventCategory) => void;
  onChangeRegion: (regionKey: string) => void;
  onStart: (args: { category: EventCategory; region: Region }) => void;

  // opcional: para volver al dashboard sin cambiar nada
  onClose?: () => void;
  canClose?: boolean;
}) {
  const selectedRegion =
    REGION_GROUPS.flatMap((g) => g.regions).find((r) => r.key === props.regionKey) ?? null;

  const canStart = props.category && selectedRegion;

  const tint =
    (props.category ? (categoryColors as any)[props.category] : null) ?? "rgba(34,211,238,1)";

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center p-4 md:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1a] shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-cyan-300/80 via-cyan-300/10 to-transparent" />

        <div className="p-5 md:p-8 overflow-y-auto max-h-[90vh]">
          <div className="mb-5 md:mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="text-white text-xl md:text-2xl font-semibold">Configurar escaneo</div>
              <div className="text-white/55 mt-1 text-sm md:text-base">
                Elegí una categoría y una región. Vas a ver una vista previa para hacerlo más intuitivo.
              </div>
            </div>

            {props.canClose && props.onClose && (
              <button
                onClick={props.onClose}
                className="shrink-0 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition"
              >
                Volver
              </button>
            )}
          </div>

          {/* Mini mapa / preview */}
          <div className="mb-6">
            <MiniMap bbox={selectedRegion?.bbox ?? null} tint={tint} />
            <div className="mt-3 text-white/55 text-sm">
              {props.category ? (
                <>
                  Categoría:{" "}
                  <span className="text-white/85 font-medium">
                    {(categoryLabels as any)[props.category] ?? props.category}
                  </span>
                </>
              ) : (
                "Elegí una categoría para ver el color del escaneo."
              )}
              <span className="text-white/30 mx-2">•</span>
              {selectedRegion ? (
                <>
                  Región: <span className="text-white/85 font-medium">{selectedRegion.label}</span>
                </>
              ) : (
                "Elegí una región para enmarcarla en el mapa."
              )}
            </div>
          </div>

          {/* Responsive: 1 col en mobile, 2 en desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            {/* Category */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="text-white/40 text-xs uppercase tracking-wider mb-4">
                ¿Qué querés observar?
              </div>

              <div className="space-y-3">
                {CATEGORY_OPTIONS.map((opt) => {
                  const active = props.category === opt.key;
                  const c = (categoryColors as any)[opt.key] ?? "rgba(34,211,238,1)";
                  return (
                    <button
                      key={opt.key}
                      onClick={() => props.onChangeCategory(opt.key)}
                      className="w-full text-left p-4 rounded-xl border transition"
                      style={{
                        borderColor: active ? `${c}55` : "rgba(255,255,255,0.10)",
                        backgroundColor: active ? `${c}1A` : "rgba(0,0,0,0.18)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: c, boxShadow: `0 0 18px ${c}66` }}
                        />
                        <div className="text-white/85 font-medium">{opt.label}</div>
                      </div>

                      <div className="text-white/45 text-sm mt-1">{opt.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Region */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="text-white/40 text-xs uppercase tracking-wider mb-4">
                ¿Dónde querés observar?
              </div>

              {REGION_GROUPS.map((group) => (
                <div key={group.key} className="mb-5">
                  <div className="text-white/70 font-medium mb-3">{group.label}</div>
                  <div className="grid grid-cols-1 gap-3">
                    {group.regions.map((r) => {
                      const active = props.regionKey === r.key;
                      return (
                        <button
                          key={r.key}
                          onClick={() => props.onChangeRegion(r.key)}
                          className="w-full text-left p-4 rounded-xl border transition"
                          style={{
                            borderColor: active ? `${tint}55` : "rgba(255,255,255,0.10)",
                            backgroundColor: active ? `${tint}1A` : "rgba(0,0,0,0.18)",
                          }}
                        >
                          <div className="text-white/85 font-medium">{r.label}</div>
                          <div className="text-white/45 text-sm mt-1">bbox: {r.bbox}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 mt-7 pt-6 border-t border-white/10 bg-[#0a0f1a]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-white/45 text-sm">
                {canStart
                  ? "Configuración lista. Iniciá el escaneo para cargar eventos en la región seleccionada."
                  : "Seleccioná una categoría y una región para iniciar."}
              </div>

              <button
                disabled={!canStart}
                onClick={() => {
                  if (!props.category || !selectedRegion) return;
                  props.onStart({ category: props.category, region: selectedRegion });
                }}
                className="px-7 py-4 rounded-xl text-lg font-medium transition"
                style={{
                  border: "1px solid",
                  borderColor: canStart ? `${tint}66` : "rgba(255,255,255,0.12)",
                  background: canStart
                    ? `linear-gradient(135deg, ${tint}33, ${tint}0F)`
                    : "rgba(255,255,255,0.04)",
                  color: canStart ? "#e0fbff" : "rgba(255,255,255,0.35)",
                  boxShadow: canStart ? `0 0 30px ${tint}33` : "none",
                  cursor: canStart ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                }}
              >
                Iniciar escaneo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
