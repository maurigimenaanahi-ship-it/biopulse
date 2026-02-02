import { useEffect, useMemo, useRef, useCallback } from "react";
import Map, { Layer, Source } from "react-map-gl/maplibre";
import type { MapRef, MapLayerMouseEvent, MapLayerTouchEvent } from "react-map-gl/maplibre";
import type { EnvironmentalEvent } from "@/data/events";

type MapSceneProps = {
  events: EnvironmentalEvent[];
  bbox?: string | null; // "west,south,east,north"
  onEventClick: (e: EnvironmentalEvent) => void;

  // ya los estabas usando desde App
  resetKey?: number;
  onZoomedInChange?: (v: boolean) => void;
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
}: MapSceneProps) {
  const mapRef = useRef<MapRef | null>(null);

  // Track hover/selected feature ids for feature-state
  const hoveredIdRef = useRef<string | number | null>(null);
  const selectedIdRef = useRef<string | number | null>(null);

  // Layer IDs
  const CLUSTERS_LAYER_ID = "clusters";
  const CLUSTER_COUNT_LAYER_ID = "cluster-count";
  const UNCLUSTERED_LAYER_ID = "unclustered-point";
  const UNCLUSTERED_HOVER_LAYER_ID = "unclustered-hover";
  const CLUSTER_HOVER_LAYER_ID = "cluster-hover";
  const PING_LAYER_ID = "selection-ping";

  // GeoJSON: IMPORTANTE -> setear `id` para usar feature-state
  const geojson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: events.map((ev) => ({
        type: "Feature" as const,
        id: String(ev.id), // 👈 clave para feature-state
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

  // Ajustar vista al bbox elegido
  useEffect(() => {
    if (!bbox || !mapRef.current) return;
    mapRef.current.fitBounds(bboxToBounds(bbox), {
      padding: 80,
      duration: 800,
    });
  }, [bbox]);

  // Reset de vista (por botón Volver)
  useEffect(() => {
    if (!resetKey || !bbox || !mapRef.current) return;
    mapRef.current.fitBounds(bboxToBounds(bbox), {
      padding: 80,
      duration: 650,
    });
  }, [resetKey, bbox]);

  // Avisar a App si estás “muy adentro”
  const handleMove = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !onZoomedInChange) return;
    const z = map.getZoom();
    // umbral: ajustalo si querés
    onZoomedInChange(z >= 4.2);
  }, [onZoomedInChange]);

  // Helpers feature-state
  const clearHover = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const prev = hoveredIdRef.current;
    if (prev == null) return;

    try {
      map.setFeatureState({ source: "events", id: prev }, { hover: false });
    } catch {
      // ignore
    }
    hoveredIdRef.current = null;
    map.getCanvas().style.cursor = "";
  }, []);

  const setHover = useCallback((id: string | number | null) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // reset anterior
    const prev = hoveredIdRef.current;
    if (prev != null && prev !== id) {
      try {
        map.setFeatureState({ source: "events", id: prev }, { hover: false });
      } catch {
        // ignore
      }
    }

    if (id == null) {
      hoveredIdRef.current = null;
      map.getCanvas().style.cursor = "";
      return;
    }

    hoveredIdRef.current = id;
    try {
      map.setFeatureState({ source: "events", id }, { hover: true });
    } catch {
      // ignore (clusters a veces no aceptan id como esperás)
    }
    map.getCanvas().style.cursor = "pointer";
  }, []);

  const pulseSelect = useCallback((id: string | number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // limpiar selección previa
    const prev = selectedIdRef.current;
    if (prev != null && prev !== id) {
      try {
        map.setFeatureState({ source: "events", id: prev }, { selected: false });
      } catch {
        // ignore
      }
    }

    selectedIdRef.current = id;

    // activar ping breve
    try {
      map.setFeatureState({ source: "events", id }, { selected: true });
    } catch {
      // ignore
    }

    window.setTimeout(() => {
      const map2 = mapRef.current?.getMap();
      if (!map2) return;
      try {
        map2.setFeatureState({ source: "events", id }, { selected: false });
      } catch {
        // ignore
      }
      if (selectedIdRef.current === id) selectedIdRef.current = null;
    }, 420);
  }, []);

  // Hover handler
  const handleHover = useCallback(
    (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const features = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTERS_LAYER_ID, UNCLUSTERED_LAYER_ID],
      });

      if (!features?.length) {
        setHover(null);
        return;
      }

      const f: any = features[0];

      // Para clusters, usualmente el id puede venir como cluster_id
      const props = f.properties || {};
      if (props.cluster) {
        const cid = props.cluster_id ?? f.id;
        if (cid != null) setHover(cid);
        return;
      }

      const id = f.id ?? props.id;
      if (id != null) setHover(id);
    },
    [setHover]
  );

  const handleLeave = useCallback(() => {
    clearHover();
  }, [clearHover]);

  // Click handler: cluster => zoom, punto => ping + abrir panel
  const handleClick = (e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const features = map.queryRenderedFeatures(e.point, {
      layers: [CLUSTERS_LAYER_ID, UNCLUSTERED_LAYER_ID],
    });

    if (!features?.length) return;

    const f: any = features[0];
    const props = f.properties || {};

    // Cluster: zoom de expansión
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

    // Punto individual: ping visual + abrir panel
    const id = String(props.id ?? f.id ?? "");
    if (id) pulseSelect(id);

    const ev = events.find((x) => String(x.id) === id);
    if (ev) onEventClick(ev);
  };

  // Layers
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

  // Hover overlay para clusters (micro-interacción visual)
  const clusterHoverLayer: any = {
    id: CLUSTER_HOVER_LAYER_ID,
    type: "circle",
    source: "events",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": [
        "+",
        ["step", ["get", "point_count"], 14, 50, 18, 200, 22, 800, 28],
        ["case", ["boolean", ["feature-state", "hover"], false], 3, 0],
      ],
      "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0],
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.22)",
      "circle-color": "rgba(255,255,255,0.06)",
      "circle-blur": 0.25,
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
      "circle-radius": [
        "case",
        [">=", ["get", "sevRank"], 3],
        7,
        [">=", ["get", "sevRank"], 2],
        6,
        5,
      ],
      "circle-opacity": 0.95,
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(0,0,0,0.35)",
      "circle-blur": 0.15,
    },
  };

  // Hover overlay para puntos (glow + un poquito más grande)
  const unclusteredHoverLayer: any = {
    id: UNCLUSTERED_HOVER_LAYER_ID,
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
      "circle-radius": [
        "+",
        [
          "case",
          [">=", ["get", "sevRank"], 3],
          7,
          [">=", ["get", "sevRank"], 2],
          6,
          5,
        ],
        ["case", ["boolean", ["feature-state", "hover"], false], 3, 0],
      ],
      "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0],
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.28)",
      "circle-blur": 0.35,
    },
  };

  // Ping breve al seleccionar (halo)
  const pingLayer: any = {
    id: PING_LAYER_ID,
    type: "circle",
    source: "events",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "rgba(255,255,255,0.12)",
      "circle-radius": [
        "+",
        [
          "case",
          [">=", ["get", "sevRank"], 3],
          14,
          [">=", ["get", "sevRank"], 2],
          12,
          10,
        ],
        ["case", ["boolean", ["feature-state", "selected"], false], 0, 0],
      ],
      "circle-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0],
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.35)",
      "circle-blur": 0.7,
    },
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
        onMove={handleMove}
        onMouseMove={handleHover}
        onTouchMove={handleHover}
        onMouseLeave={handleLeave}
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
          {/* Hover overlays first so glow queda “atrás” */}
          <Layer {...clusterHoverLayer} />
          <Layer {...unclusteredHoverLayer} />
          <Layer {...pingLayer} />

          {/* Base layers */}
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...unclusteredLayer} />
        </Source>
      </Map>
    </div>
  );
}
