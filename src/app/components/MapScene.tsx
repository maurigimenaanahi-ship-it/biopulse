import { useMemo, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { EnvironmentalEvent } from "@/data/events";

type MapSceneProps = {
  events: EnvironmentalEvent[];
  bbox?: string | null; // "west,south,east,north"
  onEventClick: (e: EnvironmentalEvent) => void;
};

// Mapa oscuro (sin keys)
const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function bboxToView(bbox: string) {
  const [w, s, e, n] = bbox.split(",").map(Number);
  return { w, s, e, n };
}

export function MapScene({ events, bbox, onEventClick }: MapSceneProps) {
  const mapRef = useRef<MapRef | null>(null);

  const initialViewState = useMemo(() => {
    // Si no hay bbox todavía, caemos en una vista global neutra
    if (!bbox) {
      return { longitude: 0, latitude: 10, zoom: 1.2 };
    }
    const { w, s, e, n } = bboxToView(bbox);
    const lon = (w + e) / 2;
    const lat = (s + n) / 2;

    // Zoom aproximado por tamaño del bbox (simple pero funciona bien)
    const spanLon = Math.abs(e - w);
    const spanLat = Math.abs(n - s);
    const span = Math.max(spanLon, spanLat);

    // Ajuste heurístico
    const zoom =
      span > 140 ? 1.4 :
      span > 90 ? 2.0 :
      span > 60 ? 2.5 :
      span > 40 ? 3.0 :
      span > 25 ? 3.4 :
      3.8;

    return { longitude: lon, latitude: lat, zoom };
  }, [bbox]);

  // Hover simple (opcional)
  const [hovered, setHovered] = useState<EnvironmentalEvent | null>(null);

  return (
    <div className="absolute inset-0 z-0">
      <Map
        ref={(r) => (mapRef.current = r)}
        initialViewState={initialViewState}
        mapStyle={DARK_STYLE}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        // Limites suaves para que no se vaya a cualquier lado
        minZoom={1}
        maxZoom={8}
        // UX
        dragRotate={false}
        pitchWithRotate={false}
      >
        {/* Nodos glow */}
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
              style={{ width: 18, height: 18 }}
              aria-label={`Open alert: ${ev.title}`}
            >
              {/* halo */}
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
              {/* core */}
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

        {/* Tooltip simple */}
        {hovered && (
          <div className="absolute left-6 top-24 max-w-sm rounded-xl border border-white/10 bg-black/50 backdrop-blur-md px-4 py-3">
            <div className="text-white/85 font-medium">{hovered.title}</div>
            <div className="text-white/45 text-xs mt-1">
              {hovered.location} • {hovered.severity.toUpperCase()}
            </div>
          </div>
        )}
      </Map>
    </div>
  );
}
