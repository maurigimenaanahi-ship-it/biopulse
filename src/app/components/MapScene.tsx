import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Map, { Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { EnvironmentalEvent } from "@/data/events";

type MapSceneProps = {
  events: EnvironmentalEvent[];
  bbox?: string | null; // "west,south,east,north"
  onEventClick: (e: EnvironmentalEvent) => void;
};

// estilo oscuro sin keys
const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function parseBbox(bbox: string) {
  const [w, s, e, n] = bbox.split(",").map((v) => Number(v.trim()));
  return { w, s, e, n };
}

function bboxToBounds(bbox: string) {
  const { w, s, e, n } = parseBbox(bbox);
  return [
    [w, s],
    [e, n],
  ] as [[number, number], [number, number]];
}

export function MapScene({ events, bbox, onEventClick }: MapSceneProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [hovered, setHovered] = useState<EnvironmentalEvent | null>(null);

  const initialViewState = useMemo(() => {
    if (!bbox) return { longitude: 0, latitude: 10, zoom: 1.2 };
    const { w, s, e, n } = parseBbox(bbox);
    return { longitude: (w + e) / 2, latitude: (s + n) / 2, zoom: 3 };
  }, [bbox]);

  const fitToBbox = useCallback(() => {
    if (!bbox || !mapRef.current) return;
    mapRef.current.fitBounds(bboxToBounds(bbox), {
      padding: 100,
      duration: 700,
    });
  }, [bbox]);

  // Importante: cuando se monta, forzamos resize (soluciona “markers flotando” por layout)
  useEffect(() => {
    const t = setTimeout(() => {
      mapRef.current?.resize();
      fitToBbox();
    }, 50);
    return () => clearTimeout(t);
  }, [fitToBbox]);

  // Cuando cambia bbox, resize + fit
  useEffect(() => {
    const t = setTimeout(() => {
      mapRef.current?.resize();
      fitToBbox();
    }, 50);
    return () => clearTimeout(t);
  }, [bbox, fitToBbox]);

  return (
    // Nota: el wrapper NO debe tener transform. Mantenerlo “normal”.
    <div className="absolute inset-0 z-0">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={DARK_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        minZoom={1}
        maxZoom={10}
        dragRotate={false}
        pitchWithRotate={false}
        onLoad={() => {
          // al cargar, resize + fit (clave)
          mapRef.current?.resize();
          fitToBbox();
        }}
      >
        {events.map((ev) => (
          <Marker
            key={ev.id}
            longitude={Number(ev.longitude)}
            latitude={Number(ev.latitude)}
            anchor="center"
          >
            <button
              type="button"
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHovered(ev)}
              onMouseLeave={() => setHovered(null)}
              className="relative"
              style={{ width: 16, height: 16 }}
              aria-label={`Open alert: ${ev.title}`}
            >
              <span
                className="absolute inset-0 rounded-full blur-md opacity-70"
                style={{
                  background:
                    ev.severity === "critical"
                      ? "rgba(255, 0, 68, 0.65)"
                      : ev.severity === "high"
                      ? "rgba(255, 102, 0, 0.55)"
                      : ev.severity === "moderate"
                      ? "rgba(255, 170, 0, 0.45)"
                      : "rgba(0, 255, 136, 0.35)",
                }}
              />
              <span
                className="absolute inset-[4px] rounded-full"
                style={{
                  background:
                    ev.severity === "critical"
                      ? "rgb(255,0,68)"
                      : ev.severity === "high"
                      ? "rgb(255,102,0)"
                      : ev.severity === "moderate"
                      ? "rgb(255,170,0)"
                      : "rgb(0,255,136)",
                  boxShadow: "0 0 12px rgba(0,0,0,0.35)",
                }}
              />
            </button>
          </Marker>
        ))}

        {hovered && (
          <div className="absolute left-4 top-4 max-w-sm rounded-xl border border-white/10 bg-black/60 backdrop-blur-md px-4 py-3">
            <div className="text-white/85 font-medium">{hovered.title}</div>
            <div className="text-white/45 text-xs mt-1">
              {hovered.location} • {hovered.severity.toUpperCase()}
            </div>
            <div className="text-white/35 text-xs mt-1">
              {hovered.latitude.toFixed(2)}, {hovered.longitude.toFixed(2)}
            </div>
          </div>
        )}
      </Map>
    </div>
  );
}
