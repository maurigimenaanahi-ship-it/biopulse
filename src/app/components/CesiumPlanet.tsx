import { useEffect, useRef } from "react";
import {
  Cartesian3,
  Color,
  Credit,
  CustomDataSource,
  EllipsoidTerrainProvider,
  Entity,
  JulianDate,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
  WebMapTileServiceImageryProvider,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { PlanetSignal, PlanetSignalDensity } from "./BioPulsePlanet";

const CESIUM_BASE_URL = "https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/";

type CesiumPlanetProps = {
  className?: string;
  signals?: PlanetSignal[];
  selectedSignalId?: string | null;
  onSignalSelect?: (signal: PlanetSignal) => void;
  onSignalClear?: () => void;
  onSignalDensityChange?: (density: PlanetSignalDensity) => void;
  onProjectedSignalStatsChange?: (stats: { visible: number; groups: number }) => void;
};

type ClusterPick = {
  biopulseCluster: true;
  signal: PlanetSignal;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function signalColor(signal: PlanetSignal) {
  if (signal.kind === "fire") {
    if (signal.severity === "critical") return "#ef4444";
    if (signal.severity === "high") return "#f97316";
    if (signal.severity === "moderate") return "#facc15";
    return "#fb923c";
  }
  if (signal.kind === "storm") return "#fde047";
  if (signal.kind === "flood") return "#38bdf8";
  if (signal.kind === "earthquake") return "#f472b6";
  return "#a7f3d0";
}

function signalSeverityWeight(signal: PlanetSignal) {
  if (signal.severity === "critical") return 4;
  if (signal.severity === "high") return 3;
  if (signal.severity === "moderate") return 2;
  if (signal.severity === "low") return 1;
  return 0;
}

function densityFromHeight(height: number): PlanetSignalDensity {
  if (height > 4_500_000) return "global";
  if (height > 1_100_000) return "regional";
  return "local";
}

function getEntitySignal(entity: Entity): PlanetSignal | null {
  return ((entity as any).biopulseSignal as PlanetSignal | undefined) ?? null;
}

function mergeSignals(signals: PlanetSignal[]): PlanetSignal {
  const strongest = signals.reduce((best, signal) => {
    const bestRank = signalSeverityWeight(best);
    const nextRank = signalSeverityWeight(signal);
    if (nextRank > bestRank) return signal;
    if (nextRank === bestRank && (signal.count ?? 1) > (best.count ?? 1)) return signal;
    return best;
  }, signals[0]);

  let total = 0;
  let latSum = 0;
  let lonSum = 0;
  let intensitySum = 0;
  const eventIds = new Set<string>();

  signals.forEach((signal) => {
    const count = signal.count ?? 1;
    total += count;
    latSum += signal.latitude * count;
    lonSum += signal.longitude * count;
    intensitySum += (signal.intensity ?? 0.4) * count;
    (signal.eventIds ?? [signal.id]).forEach((id) => eventIds.add(id));
  });

  return {
    id: `cesium-cluster:${Array.from(eventIds).slice(0, 8).join(":")}:${eventIds.size}`,
    kind: strongest.kind,
    latitude: latSum / total,
    longitude: lonSum / total,
    intensity: clamp(intensitySum / total + Math.log10(total + 1) * 0.08, 0.25, 1),
    severity: strongest.severity,
    label: `${total} señales agrupadas`,
    count: total,
    eventIds: Array.from(eventIds),
  };
}

function makeClusterImage(count: number, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  const label = count > 99 ? "99+" : String(count);

  const glow = ctx.createRadialGradient(48, 48, 4, 48, 48, 46);
  glow.addColorStop(0, "rgba(255,255,255,0.82)");
  glow.addColorStop(0.35, `${color}dd`);
  glow.addColorStop(0.78, `${color}55`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(48, 48, 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(2,7,18,0.62)";
  ctx.beginPath();
  ctx.arc(48, 48, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(48, 48, 25, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = `800 ${count > 99 ? 20 : 25}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 48, 49);

  return canvas.toDataURL("image/png");
}

export function CesiumPlanet({
  className = "",
  signals = [],
  selectedSignalId,
  onSignalSelect,
  onSignalClear,
  onSignalDensityChange,
  onProjectedSignalStatsChange,
}: CesiumPlanetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const selectedSignalIdRef = useRef<string | null | undefined>(selectedSignalId);

  useEffect(() => {
    selectedSignalIdRef.current = selectedSignalId;
  }, [selectedSignalId]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    (window as any).CESIUM_BASE_URL = CESIUM_BASE_URL;

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      terrainProvider: new EllipsoidTerrainProvider(),
    });

    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = 0.25;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(-60, -26, 14_000_000),
    });

    const imageryProvider = new WebMapTileServiceImageryProvider({
      url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi",
      layer: "BlueMarble_ShadedRelief_Bathymetry",
      style: "default",
      format: "image/jpeg",
      tileMatrixSetID: "GoogleMapsCompatible_Level8",
      maximumLevel: 8,
      credit: new Credit("NASA GIBS"),
    });
    viewer.imageryLayers.addImageryProvider(imageryProvider);

    const dataSource = new CustomDataSource("biopulse-signals");
    dataSource.clustering.enabled = true;
    dataSource.clustering.pixelRange = 46;
    dataSource.clustering.minimumClusterSize = 3;
    dataSource.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
      const clusterSignals = clusteredEntities.map(getEntitySignal).filter((signal): signal is PlanetSignal => Boolean(signal));
      if (!clusterSignals.length) return;

      const merged = mergeSignals(clusterSignals);
      const color = signalColor(merged);
      const size = clamp(30 + Math.log10((merged.count ?? 1) + 1) * 8, 32, 54);
      const pick: ClusterPick = { biopulseCluster: true, signal: merged };

      cluster.label.show = false;
      cluster.billboard.show = true;
      cluster.billboard.image = makeClusterImage(merged.count ?? clusterSignals.length, color);
      cluster.billboard.width = size;
      cluster.billboard.height = size;
      cluster.billboard.verticalOrigin = VerticalOrigin.CENTER;
      cluster.billboard.id = pick as any;
    });

    viewer.dataSources.add(dataSource);
    viewerRef.current = viewer;
    dataSourceRef.current = dataSource;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: any) => {
      const picked = viewer.scene.pick(movement.position);
      const pickedId = picked?.id;

      if (!pickedId) {
        onSignalClear?.();
        return;
      }

      if ((pickedId as ClusterPick | undefined)?.biopulseCluster) {
        const signal = (pickedId as ClusterPick).signal;
        onSignalSelect?.(signal);
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(signal.longitude, signal.latitude, Math.max(viewer.camera.positionCartographic.height * 0.55, 450_000)),
          duration: 0.6,
        });
        return;
      }

      const signal = pickedId instanceof Entity ? getEntitySignal(pickedId) : null;
      if (signal) {
        onSignalSelect?.(signal);
        return;
      }

      onSignalClear?.();
    }, ScreenSpaceEventType.LEFT_CLICK);

    const cameraListener = () => {
      onSignalDensityChange?.(densityFromHeight(viewer.camera.positionCartographic.height));
    };
    viewer.camera.changed.addEventListener(cameraListener);
    cameraListener();

    return () => {
      viewer.camera.changed.removeEventListener(cameraListener);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      dataSourceRef.current = null;
    };
  }, [onSignalClear, onSignalDensityChange, onSignalSelect]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;
    if (!viewer || !dataSource) return;

    dataSource.entities.removeAll();

    signals.forEach((signal) => {
      const color = Color.fromCssColorString(signalColor(signal)).withAlpha(selectedSignalIdRef.current === signal.id ? 1 : 0.86);
      const size = selectedSignalIdRef.current === signal.id ? 12 : 8;
      const entity = dataSource.entities.add({
        id: signal.id,
        position: Cartesian3.fromDegrees(signal.longitude, signal.latitude, 900),
        point: {
          pixelSize: size,
          color,
          outlineColor: Color.WHITE.withAlpha(0.44),
          outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          biopulseId: signal.id,
        },
      });
      (entity as any).biopulseSignal = signal;
    });

    onProjectedSignalStatsChange?.({ visible: signals.length, groups: 0 });
    viewer.scene.requestRender();
  }, [signals, onProjectedSignalStatsChange]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;
    if (!viewer || !dataSource) return;

    const now = JulianDate.now();
    dataSource.entities.values.forEach((entity) => {
      const signal = getEntitySignal(entity);
      if (!signal || !entity.point) return;
      const selected = signal.id === selectedSignalId;
      entity.point.pixelSize = selected ? 12 : 8;
      entity.point.color = Color.fromCssColorString(signalColor(signal)).withAlpha(selected ? 1 : 0.86);
      entity.point.outlineWidth = selected ? 2.4 : 1.5;
      entity.point.show = true;
      entity.point.getValue?.(now);
    });
    viewer.scene.requestRender();
  }, [selectedSignalId]);

  return (
    <div className={`absolute inset-0 overflow-hidden bg-[#020712] ${className}`}>
      <div ref={containerRef} className="absolute inset-0 [&_.cesium-widget-credits]:hidden" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0,rgba(2,7,18,0.02)_34%,rgba(2,7,18,0.58)_92%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#020712]/10 via-transparent to-[#020712]/50" />
    </div>
  );
}
