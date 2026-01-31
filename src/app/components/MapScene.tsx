import { useCallback, useEffect, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { EnvironmentalEvent } from "@/data/events";

type MapSceneProps = {
  events: EnvironmentalEvent[];
  bbox?: string | null; // "west,south,east,north"
  onEventClick: (e: EnvironmentalEvent) => void;
};

const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function bboxToBounds(bbox: string) {
  const [w, s, e, n] = bbox.split(",").map(Number);
  return [
    [w, s],
    [e, n],
  ] as [[number, number], [number, number]];
}

export function MapScene({ events, bbox, onEventClick }: MapSceneProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [hovered, setHovered] = useState<EnvironmentalEvent | null>(null);

  const fitToBbox = useCallback(() => {
    if (!bbox || !mapRef.current) return;

    // ⚠️ Importantísimo: asegurar que el map ya midió su contenedor
    mapRef.current.resize();

    mapRef.current.fitBounds(bboxToBounds(bbox), {
      padding: 120,
      duration: 600,
    });
  }, [bbox]);

  // Cuando cambia bbox, re-encuadramos (con raf para esperar layout)
  useEffect(() => {
    if (!bbox) return;
    const id = requestAnimationFrame(() => fitToBbox());
    return () => cancelAnimationFrame(id);
  }, [bbox, fitToBbox]);

  return (
    // ✅ contenedor real con tamaño (NO absolute acá)
    <div className="w-full h-full">
      <Map
        ref={mapRef}
        // un init neutral (después fitBounds lo acomoda)
        initialViewState={{ longitude: -60, latitude: -15, zoom: 3 }}
        mapStyle={DARK_STYLE}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        minZoom={1}
        maxZoom={10}
        dragRotate={false}
        pitchWithRotate={false}
        // ✅ encuadrar cuando terminó de cargar el mapa
        onLoad={() => fitToBbox()}
      >
        {events.map((ev) => (
          <Marker
            key={ev.id}
            longitude={ev.longitude}
            latitude={ev.latitude}
            anchor="center"
          >
            <button
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
                      ? "rgba(255,0,68,0.75)"
                      : ev.severity === "high"
                      ? "rgba(255,102,0,0.65)"
                      : "rgba(255,170,0,0.55)",
                }}
              />
              <span
                className="absolute inset-[3px] rounded-full"
                style={{
                  background:
                    ev.severity === "critical"
                      ? "#ff0044"
                      : ev.severity === "high"
                      ? "#ff6600"
                      : "#ffaa00",
                }}
              />
            </button>
          </Marker>
        ))}

        {hovered && (
          <div className="absolute left-4 top-4 max-w-sm rounded-lg bg-black/70 backdrop-blur-md px-4 py-3 text-white text-sm border border-white/10">
            <div className="font-medium">{hovered.title}</div>
            <div className="opacity-70 text-xs">
              {hovered.location} — {hovered.severity.toUpperCase()}
            </div>
            <div className="opacity-50 text-xs">
              {hovered.latitude.toFixed(2)}, {hovered.longitude.toFixed(2)}
            </div>
          </div>
        )}
      </Map>
    </div>
  );
}
