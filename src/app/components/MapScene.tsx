import { useEffect, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { EnvironmentalEvent } from "@/data/events";

type MapSceneProps = {
  events: EnvironmentalEvent[];
  bbox?: string | null;
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

  useEffect(() => {
    if (!bbox || !mapRef.current) return;
    mapRef.current.fitBounds(bboxToBounds(bbox), {
      padding: 80,
      duration: 800,
    });
  }, [bbox]);

  return (
    <div className="absolute inset-0 z-0">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: -60, latitude: -15, zoom: 3 }}
        mapStyle={DARK_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
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
              onClick={() => onEventClick(ev)}
              onMouseEnter={() => setHovered(ev)}
              onMouseLeave={() => setHovered(null)}
              className="relative w-4 h-4"
            >
              <span
                className="absolute inset-0 rounded-full blur-md opacity-70"
                style={{
                  background:
                    ev.severity === "critical"
                      ? "rgba(255,0,68,0.8)"
                      : ev.severity === "high"
                      ? "rgba(255,102,0,0.7)"
                      : "rgba(255,170,0,0.6)",
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
