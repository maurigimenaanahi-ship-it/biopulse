import { useEffect, useMemo, useRef, useState } from "react";
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

  // para UI adaptativa
  onZoomChange?: (zoom: number) => void;

  // ✅ NUEVO: foco externo (deep link / watchlist)
  focus?: { lng: number; lat: number; zoom?: number; id?: string; sevRank?: number } | null;
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

function getExploreZoomThreshold(width: number) {
  if (width <= 480) return 2.05;
  if (width <= 768) return 2.2;
  if (width <= 1024) return 2.55;
  return 2.8;
}

export function MapScene({
  events,
  bbox,
  onEventClick,
  resetKey,
  onZoomedInChange,
  onZoomChange,
  focus,
}: MapSceneProps) {
  const mapRef = useRef<MapRef | null>(null);

  // ✅ Estado para micro-interacciones
  const [hovered, setHovered] = useState<{
    lng: number;
    lat: number;
    sev: number;
    isCluster: boolean;
  } | null>(null);

  const [active, setActive] = useState<{
    lng: number;
    lat: number;
    sev: number;
    id: string;
  } | null>(null);

  const [ripple, setRipple] = useState<{
    lng: number;
    lat: number;
    t: number;
    sev: number;
  } | null>(null);

  // ✅ Responsive: umbral “exploring” según viewport
  const [exploreThreshold, setExploreThreshold] = useState<number>(() =>
    typeof window === "undefined" ? 2.8 : getExploreZoomThreshold(window.innerWidth)
  );

  useEffect(() => {
    const onResize = () => setExploreThreshold(getExploreZoomThreshold(window.innerWidth));
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const exploreExitThreshold = useMemo(
    () => Math.max(1.5, exploreThreshold - 0.25),
    [exploreThreshold]
  );
  const [isExploring, setIsExploring] = useState(false);

  // ✅ FlyTo externo (deep link / watchlist)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !focus) return;

    map.easeTo({
      center: [focus.lng, focus.lat],
      zoom: typeof focus.zoom === "number" ? focus.zoom : Math.max(5.2, map.getZoom()),
      duration: 850,
    });

    // marcar halo activo si hay id
    if (focus.id) {
      setActive({
        lng: focus.lng,
        lat: focus.lat,
        sev: Number(focus.sevRank ?? 0),
        id: String(focus.id),
      });
    }
  }, [focus?.lng, focus?.lat, focus?.zoom, focus?.id, focus?.sevRank]);

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

    // apagar estados visuales
    setActive(null);
    setHovered(null);
    setRipple(null);

    setIsExploring(false);
    onZoomedInChange?.(false);
  }, [resetKey, bbox, onZoomedInChange]);

  // GeoJSON eventos
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

  // GeoJSON hover/active/ripple
  const hoverGeo = useMemo(() => {
    if (!hovered) return { type: "FeatureCollection" as const, features: [] as any[] };
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [hovered.lng, hovered.lat] },
          properties: { sevRank: hovered.sev, isCluster: hovered.isCluster ? 1 : 0 },
        },
      ],
    };
  }, [hovered]);

  const activeGeo = useMemo(() => {
    if (!active) return { type: "FeatureCollection" as const, features: [] as any[] };
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [active.lng, active.lat] },
          properties: { sevRank: active.sev },
        },
      ],
    };
  }, [active]);

  const rippleGeo = useMemo(() => {
    if (!ripple) return { type: "FeatureCollection" as const, features: [] as any[] };
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [ripple.lng, ripple.lat] },
          properties: { sevRank: ripple.sev, p: Math.min(1, (Date.now() - ripple.t) / 1100) },
        },
      ],
    };
  }, [ripple]);

  // Animación del ripple
  useEffect(() => {
    if (!ripple) return;
    let raf = 0;
    const tick = () => {
      setRipple((r) => (r ? { ...r } : r));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = setTimeout(() => {
      cancelAnimationFrame(raf);
      setRipple(null);
    }, 1200);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stop);
    };
  }, [ripple?.t]);

  // Layer IDs base
  const CLUSTERS_LAYER_ID = "clusters";
  const CLUSTER_COUNT_LAYER_ID = "cluster-count";
  const UNCLUSTERED_LAYER_ID = "unclustered-point";

  // Layers IDs fx
  const FX_HOVER_ID = "fx-hover";
  const FX_ACTIVE_ID = "fx-active";
  const FX_RIPPLE_ID = "fx-ripple";

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

  const hoverLayer: any = {
    id: FX_HOVER_ID,
    type: "circle",
    source: "fx-hover",
    paint: {
      "circle-color": [
        "case",
        [">=", ["get", "sevRank"], 3],
        "rgba(255,0,68,0.22)",
        [">=", ["get", "sevRank"], 2],
        "rgba(255,102,0,0.20)",
        [">=", ["get", "sevRank"], 1],
        "rgba(255,170,0,0.18)",
        "rgba(0,255,136,0.16)",
      ],
      "circle-radius": ["case", ["==", ["get", "isCluster"], 1], 34, 22],
      "circle-blur": 0.6,
      "circle-opacity": 1,
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.18)",
    },
  };

  const activeLayer: any = {
    id: FX_ACTIVE_ID,
    type: "circle",
    source: "fx-active",
    paint: {
      "circle-color": [
        "case",
        [">=", ["get", "sevRank"], 3],
        "rgba(255,0,68,0.20)",
        [">=", ["get", "sevRank"], 2],
        "rgba(255,102,0,0.18)",
        [">=", ["get", "sevRank"], 1],
        "rgba(255,170,0,0.16)",
        "rgba(0,255,136,0.14)",
      ],
      "circle-radius": 26,
      "circle-blur": 0.75,
      "circle-opacity": 1,
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.16)",
    },
  };

  const rippleLayer: any = {
    id: FX_RIPPLE_ID,
    type: "circle",
    source: "fx-ripple",
    paint: {
      "circle-color": [
        "case",
        [">=", ["get", "sevRank"], 3],
        "rgba(255,0,68,0.18)",
        [">=", ["get", "sevRank"], 2],
        "rgba(255,102,0,0.16)",
        [">=", ["get", "sevRank"], 1],
        "rgba(255,170,0,0.14)",
        "rgba(0,255,136,0.12)",
      ],
      "circle-radius": ["+", 12, ["*", 48, ["get", "p"]]],
      "circle-opacity": ["-", 1, ["get", "p"]],
      "circle-stroke-width": 2,
      "circle-stroke-color": "rgba(255,255,255,0.14)",
      "circle-blur": 0.25,
    },
  };

  const pickFeature = (e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return null;

    const feats = map.queryRenderedFeatures(e.point, {
      layers: [CLUSTERS_LAYER_ID, UNCLUSTERED_LAYER_ID],
    });

    if (!feats?.length) return null;
    return feats[0] as any;
  };

  const handleClick = (e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const f = pickFeature(e);
    if (!f) return;

    const props = f.properties || {};
    const coords = f.geometry?.coordinates as [number, number] | undefined;
    if (!coords) return;

    const lng = coords[0];
    const lat = coords[1];

    // ripple siempre
    const sev = Number(props.maxSev ?? props.sevRank ?? 0);
    setRipple({ lng, lat, t: Date.now(), sev });

    // cluster => zoom
    if (props.cluster) {
      const clusterId = props.cluster_id;
      const source: any = map.getSource("events");
      if (!source?.getClusterExpansionZoom) return;

      source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
        if (err) return;
        map.easeTo({
          center: coords,
          zoom: Math.min(zoom, 10),
          duration: 650,
        });
      });

      return;
    }

    // point => open panel + active halo
    const id = String(props.id ?? "");
    const ev = events.find((x) => String(x.id) === id);
    if (ev) {
      setActive({ lng, lat, sev: Number(props.sevRank ?? 0), id });
      onEventClick(ev);
    }
  };

  const handleMove = (e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const pt: any = (e as any).originalEvent?.pointerType;
    if (pt && pt !== "mouse") return;

    const f = pickFeature(e);
    if (!f) {
      if (hovered) setHovered(null);
      return;
    }

    const props = f.properties || {};
    const coords = f.geometry?.coordinates as [number, number] | undefined;
    if (!coords) return;

    const isCluster = !!props.cluster;
    const sev = Number(props.maxSev ?? props.sevRank ?? 0);

    setHovered({ lng: coords[0], lat: coords[1], sev, isCluster });
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
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(null)}
        onMove={(evt) => {
          const z = evt.viewState.zoom;

          onZoomChange?.(z);

          if (!isExploring && z >= exploreThreshold) {
            setIsExploring(true);
            onZoomedInChange?.(true);
          } else if (isExploring && z <= exploreExitThreshold) {
            setIsExploring(false);
            onZoomedInChange?.(false);
          }
        }}
      >
        {/* FX: Ripple */}
        <Source id="fx-ripple" type="geojson" data={rippleGeo as any}>
          <Layer {...rippleLayer} />
        </Source>

        {/* FX: Hover */}
        <Source id="fx-hover" type="geojson" data={hoverGeo as any}>
          <Layer {...hoverLayer} />
        </Source>

        {/* FX: Active */}
        <Source id="fx-active" type="geojson" data={activeGeo as any}>
          <Layer {...activeLayer} />
        </Source>

        {/* Eventos base + clustering */}
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
