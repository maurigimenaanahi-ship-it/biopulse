import { useEffect, useMemo, useRef } from "react";
import Map, { Layer, Source } from "react-map-gl/maplibre";
import type { MapRef, MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { EnvironmentalEvent } from "@/data/events";

type MapSceneProps = {
  events: EnvironmentalEvent[];
  bbox?: string | null; // "west,south,east,north"
  onEventClick: (e: EnvironmentalEvent) => void;

  // extras que ya veníamos usando
  resetKey?: number;
  onZoomedInChange?: (v: boolean) => void;

  // ✅ nuevo: para “dockear” stats antes
  onZoomChange?: (zoom: number) => void;
};

// Mapa oscuro (sin keys)
const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function bboxToBounds(bbox: string) {
  const [w, s, e, n] = bbox.split(",").map(Number);
  return [
    [w, s],
    [e, n],
  ] as [[number, number], [number, number]];
}

function sevRank(sev: EnvironmentalEvent["severity"]) {
  switch (sev) {
    case "critical":
      return 3;
    case "high":
      return 2;
    case "moderate":
      return 1;
    default:
      return 0;
  }
}

export function MapScene({
  events,
  bbox,
  onEventClick,
  resetKey,
  onZoomedInChange,
  onZoomChange,
}: MapSceneProps) {
  const mapRef = useRef<MapRef | null>(null);

  // Ajustar vista al bbox elegido
  useEffect(() => {
    if (!bbox || !mapRef.current) return;
    mapRef.current.fitBounds(bboxToBounds(bbox), {
      padding: 80,
      duration: 800,
    });
  }, [bbox]);

  // ✅ Reset “Volver” (fitBounds al bbox)
  useEffect(() => {
    if (!resetKey) return;
    if (!bbox || !mapRef.current) return;

    mapRef.current.fitBounds(bboxToBounds(bbox), {
      padding: 80,
      duration: 800,
    });

    // también informamos que ya no estamos “zoom-in”
    onZoomedInChange?.(false);
  }, [resetKey, bbox, onZoomedInChange]);

  const geojson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: events.map((ev) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [ev.longitude, ev.latitude],
        },
        properties: {
          id: String(ev.id),
          title: ev.title,
          location: ev.location,
          severity: ev.severity,
          sevRank: sevRank(ev.severity),
        },
      })),
    };
  }, [events]);

  // Layer IDs
  const CLUSTERS_LAYER_ID = "clusters";
  const CLUSTER_COUNT_LAYER_ID = "cluster-count";
  const UNCLUSTERED_LAYER_ID = "unclustered-point";

  const clusterLayer: any = {
    id: CLUSTERS_LAYER_ID,
    type: "circle",
    source: "events",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "case",
        [">=", ["get", "maxSev"], 3],
        "#ff0044",
        [">=", ["get", "maxSev"], 2],
        "#ff6600",
        [">=", ["get", "maxSev"], 1],
        "#ffaa00",
        "#00ff88",
      ],
      "circle-radius": ["step", ["get", "point_count"], 14, 50, 18, 200, 22, 800, 28],
      "circle-opacity": 0.85,
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.15)",
      "circle-blur": 0.2,
    },
  };

  const clusterCountLayer: any = {
    id: CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: "events",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-size": 12,
    },
    paint: {
      "text-color": "rgba(255,255,255,0.92)",
    },
  };

  const unclusteredLayer: any = {
    id: UNCLUSTERED_LAYER_ID,
    type: "circle",
    source: "events",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        [">=", ["get", "sevRank"], 3],
        "#ff0044",
        [">=", ["get", "sevRank"], 2],
        "#ff6600",
        [">=", ["get", "sevRank"], 1],
        "#ffaa00",
        "#00ff88",
      ],
      "circle-radius": ["case", [">=", ["get", "sevRank"], 3], 7, [">=", ["get", "sevRank"], 2], 6, 5],
      "circle-opacity": 0.95,
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(0,0,0,0.35)",
      "circle-blur": 0.15,
    },
  };

  const handleClick = (e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const features = map.queryRenderedFeatures(e.point, {
      layers: [CLUSTERS_LAYER_ID, UNCLUSTERED_LAYER_ID],
    });

    if (!features?.length) return;

    const f: any = features[0];
    const props = f.properties || {};

    // cluster => zoom
    if (props.cluster) {
      const clusterId = props.cluster_id;
      const source: any = map.getSource("events");
      if (!source?.getClusterExpansionZoom) return;

      source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
        if (err) return;
        map.easeTo({
          center: f.geometry.coordinates,
          zoom: Math.min(zoom, 10),
          duration: 650,
        });
      });

      return;
    }

    // point => open panel
    const id = String(props.id ?? "");
    const ev = events.find((x) => String(x.id) === id);
    if (ev) onEventClick(ev);
  };

  return (
    <div className="absolute inset-0 z-0">
      <Map
        ref={(r) => (mapRef.current = r)}
        initialViewState={{ longitude: 0, latitude: 10, zoom: 1.2 }}
        mapStyle={DARK_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        minZoom={1}
        maxZoom={10}
        dragRotate={false}
        pitchWithRotate={false}
        interactiveLayerIds={[CLUSTERS_LAYER_ID, UNCLUSTERED_LAYER_ID]}
        onClick={handleClick}
        onMove={(evt) => {
          const z = evt.viewState.zoom;

          // ✅ avisa zoom siempre
          onZoomChange?.(z);

          // ✅ tu lógica previa: “cuando estás explorando”
          // umbral para mostrar “Volver” (no tan temprano)
          onZoomedInChange?.(z >= 2.8);
        }}
      >
        <Source
          id="events"
          type="geojson"
          data={geojson as any}
          cluster={true}
          clusterRadius={50}
          clusterMaxZoom={8}
          clusterProperties={{
            maxSev: ["max", ["get", "sevRank"]],
          }}
        >
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredLayer} />
        </Source>
      </Map>
    </div>
  );
}
