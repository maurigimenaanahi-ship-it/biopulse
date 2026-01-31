import { useEffect, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { EnvironmentalEvent } from "@/data/events";

type MapSceneProps = {
  events: EnvironmentalEvent[];
  bbox?: string | null; // "west,south,east,north"
  onEventClick: (e: EnvironmentalEvent) => void;
};

// Mapa oscuro (sin keys)
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
  const [mapReady, setMapReady] = useState(false);

  // 1) Esperamos a que el mapa esté cargado (onLoad)
  // 2) Recién ahí hacemos fitBounds (y cada vez que cambia bbox)
  useEffect(() => {
    if (!mapReady) return;
    if (!bbox) return;
    if (!mapRef.current) return;

    const bounds = bboxToBounds(bbox);

    // fitBounds seguro cuando el mapa ya cargó
    mapRef.current.fitBounds(bounds, {
      padding: 120,
      duration: 700,
    });
  }, [mapReady, bbox]);

  return (
    <div className="absolute inset-0 z-0">
      <Map
        ref={mapRef}
        onLoad={() => setMapReady(true)}
        mapStyle={DARK_STYLE}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        // Vista inicial neutra (después la bbox manda)
        initialViewState={{ longitude: -60, latitude: -15, zoom: 3 }}
        minZoom={1}
        maxZoom={10}
        dragRotate={false}
        pitchWithRotate={false}
      >
        {events.map((ev) => (
          <Marker
            key={ev.id}
            longitude={ev.longitude}
            latitude={ev.latitude}
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
                      ? "rgba(255, 0, 68, 0.75)"
                      : ev.severity === "high"
                      ? "rgba(255, 102, 0, 0.65)"
                      : ev.severity === "moderate"
                      ? "rgba(255, 170, 0, 0.55)"
                      : "rgba(0, 255, 136, 0.45)",
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
                      : ev.severity === "moderate"
                      ? "#ffaa00"
                      : "#00ff88",
                }}
              />
            </button>
          </Marker>
        ))}

        {hovered && (
          <div className="absolute left-6 top-24 max-w-sm rounded-xl border border-white/10 bg-black/60 backdrop-blur-md px-4 py-3">
            <div className="text-white/85 font-medium">{hovered.title}</div>
            <div className="text-white/45 text-xs mt-1">
              {hovered.location} • {hovered.severity.toUpperCase()}
            </div>
            <div className="text-white/35 text-[11px] mt-1">
              {hovered.latitude.toFixed(2)}, {hovered.longitude.toFixed(2)}
            </div>
          </div>
        )}
      </Map>
    </div>
  );
}
