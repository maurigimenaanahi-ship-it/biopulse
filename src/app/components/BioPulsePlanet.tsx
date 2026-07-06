import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type PlanetSignalKind = "fire" | "storm" | "flood" | "earthquake" | "camera" | "satellite" | "generic";
export type PlanetSignalDensity = "global" | "regional" | "local";

export type PlanetSignal = {
  id: string;
  kind: PlanetSignalKind;
  latitude: number;
  longitude: number;
  intensity?: number;
  severity?: "critical" | "high" | "moderate" | "low" | string;
  label?: string;
  count?: number;
  eventIds?: string[];
};

type ProjectedPlanetSignal = {
  id: string;
  label: string;
  signal: PlanetSignal;
  color: string;
  count: number;
  size: number;
  x: number;
  y: number;
};

type ProjectedSignalStats = {
  visible: number;
  groups: number;
};

const CITY_COORDINATES = [
  [-34.6, -58.38],
  [-23.55, -46.63],
  [4.71, -74.07],
  [19.43, -99.13],
  [40.71, -74],
  [51.5, -0.12],
  [35.68, 139.69],
  [28.61, 77.2],
  [-33.86, 151.2],
  [30.04, 31.23],
  [1.35, 103.82],
  [48.85, 2.35],
  [-1.29, 36.82],
  [-26.2, 28.04],
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function densityFromCameraDistance(distance: number): PlanetSignalDensity {
  if (distance > 5.45) return "global";
  if (distance > 4.1) return "regional";
  return "local";
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

function screenClusterRadius(density: PlanetSignalDensity) {
  if (density === "global") return 54;
  if (density === "regional") return 34;
  return 18;
}

function makeCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.08)";

  for (let i = 0; i < 90; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const w = 35 + Math.random() * 90;
    const h = 5 + Math.random() * 18;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.7);
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeDayNightTexture(date = new Date()) {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const declination = THREE.MathUtils.degToRad(-23.44 * Math.cos((Math.PI * 2 * (dayOfYear + 10)) / 365));
  const subsolarLon = THREE.MathUtils.degToRad((12 - utcHours) * 15);

  for (let y = 0; y < height; y++) {
    const lat = THREE.MathUtils.degToRad(90 - (y / (height - 1)) * 180);
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let x = 0; x < width; x++) {
      const lon = THREE.MathUtils.degToRad((x / (width - 1)) * 360 - 180);
      const cosZenith =
        sinLat * Math.sin(declination) +
        cosLat * Math.cos(declination) * Math.cos(lon - subsolarLon);
      const night = clamp((-cosZenith + 0.1) / 0.36, 0, 1);
      const index = (y * width + x) * 4;
      image.data[index] = 2;
      image.data[index + 1] = 8;
      image.data[index + 2] = 18;
      image.data[index + 3] = Math.round(night * 132);
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function latLonToVector3(lat: number, lon: number, radius = 2.08) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function EarthCameraControls({
  onSignalDensityChange,
}: {
  onSignalDensityChange?: (density: PlanetSignalDensity) => void;
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<ThreeOrbitControls | null>(null);
  const densityRef = useRef<PlanetSignalDensity>(densityFromCameraDistance(camera.position.length()));

  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 2.34;
    controls.maxDistance = 8.6;
    controls.rotateSpeed = 0.46;
    controls.zoomSpeed = 0.5;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.32;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    const stopAutoRotate = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener("start", stopAutoRotate);
    controlsRef.current = controls;
    onSignalDensityChange?.(densityRef.current);

    return () => {
      controls.removeEventListener("start", stopAutoRotate);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, onSignalDensityChange]);

  useFrame(() => {
    const controls = controlsRef.current;
    controls?.update();
    if (controls && camera.position.length() < 5.25) {
      controls.autoRotate = false;
    }
    const nextDensity = densityFromCameraDistance(camera.position.length());
    if (nextDensity !== densityRef.current) {
      densityRef.current = nextDensity;
      onSignalDensityChange?.(nextDensity);
    }
  });

  return null;
}

function EarthScene({
  signals = [],
  onSignalDensityChange,
  onProjectedSignalsChange,
}: {
  signals?: PlanetSignal[];
  onSignalDensityChange?: (density: PlanetSignalDensity) => void;
  onProjectedSignalsChange?: (signals: ProjectedPlanetSignal[]) => void;
}) {
  const earthGroup = useRef<THREE.Group>(null);
  const orbitGroup = useRef<THREE.Group>(null);
  const projectionFrame = useRef(0);
  const dragState = useRef<{ active: boolean; moved: boolean; x: number; y: number }>({
    active: false,
    moved: false,
    x: 0,
    y: 0,
  });
  const earthTexture = useLoader(THREE.TextureLoader, "/earth/blue-marble-2048.jpg");
  const nightTexture = useLoader(THREE.TextureLoader, "/earth/black-marble-3600.jpg");
  const configuredEarthTexture = useMemo(() => {
    earthTexture.colorSpace = THREE.SRGBColorSpace;
    earthTexture.anisotropy = 8;
    earthTexture.needsUpdate = true;
    return earthTexture;
  }, [earthTexture]);
  const configuredNightTexture = useMemo(() => {
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.anisotropy = 8;
    nightTexture.needsUpdate = true;
    return nightTexture;
  }, [nightTexture]);
  const cloudTexture = useMemo(makeCloudTexture, []);
  const dayNightTexture = useMemo(makeDayNightTexture, []);
  const cityPoints = useMemo(() => {
    const positions = new Float32Array(CITY_COORDINATES.length * 3);
    CITY_COORDINATES.forEach(([lat, lon], index) => {
      const v = latLonToVector3(lat, lon);
      positions[index * 3] = v.x;
      positions[index * 3 + 1] = v.y;
      positions[index * 3 + 2] = v.z;
    });
    return positions;
  }, []);
  const stars = useMemo(() => {
    const positions = new Float32Array(1200);
    for (let i = 0; i < positions.length; i += 3) {
      const radius = 9 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i + 1] = radius * Math.cos(phi);
      positions[i + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return positions;
  }, []);

  useEffect(() => {
    return () => onProjectedSignalsChange?.([]);
  }, [onProjectedSignalsChange]);

  useFrame((state, delta) => {
    if (earthGroup.current) {
      earthGroup.current.rotation.x = -0.16;
    }
    if (orbitGroup.current) {
      orbitGroup.current.rotation.y += delta * 0.18;
      orbitGroup.current.rotation.z += delta * 0.025;
    }

    if (!earthGroup.current || !onProjectedSignalsChange) return;

    projectionFrame.current += 1;
    if (projectionFrame.current % 10 !== 0) return;

    earthGroup.current.updateMatrixWorld();
    const earthQuaternion = new THREE.Quaternion();
    earthGroup.current.getWorldQuaternion(earthQuaternion);

    const density = densityFromCameraDistance(state.camera.position.length());
    const radius = screenClusterRadius(density);
    const radiusSq = radius * radius;

    const projectedPoints = signals
      .map((signal) => {
        const localPoint = latLonToVector3(signal.latitude, signal.longitude, 2.105);
        const worldPoint = earthGroup.current!.localToWorld(localPoint.clone());
        const normal = latLonToVector3(signal.latitude, signal.longitude, 1).normalize().applyQuaternion(earthQuaternion);
        const toCamera = state.camera.position.clone().sub(worldPoint).normalize();

        if (normal.dot(toCamera) < 0.03) return null;

        const projected = worldPoint.clone().project(state.camera);
        const x = (projected.x * 0.5 + 0.5) * state.size.width;
        const y = (-projected.y * 0.5 + 0.5) * state.size.height;

        if (
          projected.z < -1 ||
          projected.z > 1 ||
          x < -radius ||
          y < -radius ||
          x > state.size.width + radius ||
          y > state.size.height + radius
        ) {
          return null;
        }

        const count = signal.count ?? 1;
        return {
          signal,
          x,
          y,
          count,
          weight: Math.max(1, count),
        };
      })
      .filter(
        (
          point
        ): point is {
          signal: PlanetSignal;
          x: number;
          y: number;
          count: number;
          weight: number;
        } => Boolean(point)
      )
      .sort((a, b) => {
        const severityDelta = signalSeverityWeight(b.signal) - signalSeverityWeight(a.signal);
        if (severityDelta) return severityDelta;
        return b.weight - a.weight;
      });

    const clusters: Array<{
      x: number;
      y: number;
      weight: number;
      count: number;
      eventIds: string[];
      latitudeSum: number;
      longitudeSum: number;
      intensitySum: number;
      strongest: PlanetSignal;
    }> = [];

    projectedPoints.forEach((point) => {
      let nearest:
        | {
            x: number;
            y: number;
            weight: number;
            count: number;
            eventIds: string[];
            latitudeSum: number;
            longitudeSum: number;
            intensitySum: number;
            strongest: PlanetSignal;
          }
        | null = null;
      let nearestDistance = radiusSq;

      clusters.forEach((cluster) => {
        const dx = point.x - cluster.x;
        const dy = point.y - cluster.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = cluster;
        }
      });

      const eventIds = point.signal.eventIds ?? [point.signal.id];
      if (!nearest) {
        clusters.push({
          x: point.x,
          y: point.y,
          weight: point.weight,
          count: point.count,
          eventIds: [...eventIds],
          latitudeSum: point.signal.latitude * point.weight,
          longitudeSum: point.signal.longitude * point.weight,
          intensitySum: (point.signal.intensity ?? 0.4) * point.weight,
          strongest: point.signal,
        });
        return;
      }

      const nextWeight = nearest.weight + point.weight;
      nearest.x = (nearest.x * nearest.weight + point.x * point.weight) / nextWeight;
      nearest.y = (nearest.y * nearest.weight + point.y * point.weight) / nextWeight;
      nearest.weight = nextWeight;
      nearest.count += point.count;
      nearest.eventIds.push(...eventIds);
      nearest.latitudeSum += point.signal.latitude * point.weight;
      nearest.longitudeSum += point.signal.longitude * point.weight;
      nearest.intensitySum += (point.signal.intensity ?? 0.4) * point.weight;

      const currentRank = signalSeverityWeight(nearest.strongest);
      const nextRank = signalSeverityWeight(point.signal);
      if (nextRank > currentRank || (nextRank === currentRank && point.weight > (nearest.strongest.count ?? 1))) {
        nearest.strongest = point.signal;
      }
    });

    const projectedSignals = clusters
      .map((cluster) => {
        const uniqueEventIds = Array.from(new Set(cluster.eventIds));
        const isSingle = cluster.count === 1 && uniqueEventIds.length === 1;
        const signal = isSingle
          ? cluster.strongest
          : {
              id: `screen-cluster:${density}:${uniqueEventIds.slice(0, 8).join(":")}:${uniqueEventIds.length}`,
              kind: cluster.strongest.kind,
              latitude: cluster.latitudeSum / cluster.weight,
              longitude: cluster.longitudeSum / cluster.weight,
              intensity: clamp(cluster.intensitySum / cluster.weight + Math.log10(cluster.count + 1) * 0.08, 0.25, 1),
              severity: cluster.strongest.severity,
              label: `${cluster.count} señales agrupadas`,
              count: cluster.count,
              eventIds: uniqueEventIds,
            };

        const count = signal.count ?? 1;
        const size = count > 1 ? clamp(15 + Math.log10(count + 1) * 5.8, 18, 30) : 9;
        return {
          id: signal.id,
          label: signal.label ?? "Señal del planeta",
          signal,
          color: signalColor(signal),
          count,
          size,
          x: cluster.x,
          y: cluster.y,
        };
      })
      .sort((a, b) => b.count - a.count);

    onProjectedSignalsChange(projectedSignals);
  });

  const startDrag = (event: any) => {
    dragState.current = {
      active: true,
      moved: false,
      x: event.clientX ?? 0,
      y: event.clientY ?? 0,
    };
    event.stopPropagation();
    event.target?.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: any) => {
    if (!dragState.current.active || !earthGroup.current) return;
    const x = event.clientX ?? dragState.current.x;
    const y = event.clientY ?? dragState.current.y;
    const deltaX = x - dragState.current.x;
    const deltaY = y - dragState.current.y;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragState.current.moved = true;
    }
    earthGroup.current.rotation.y += deltaX * 0.006;
    dragState.current.x = x;
    dragState.current.y = y;
    event.stopPropagation();
  };

  const endDrag = (event: any) => {
    dragState.current.active = false;
    event.target?.releasePointerCapture?.(event.pointerId);
  };

  return (
    <>
      <color attach="background" args={["#020712"]} />
      <ambientLight intensity={0.34} />
      <hemisphereLight args={["#d9f7ff", "#07111f", 0.58]} />
      <directionalLight position={[4.5, 2.6, 4]} intensity={2.8} color="#f8fbff" />
      <pointLight position={[-3.5, -1.5, -2.2]} intensity={0.8} color="#22d3ee" />

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={stars.length / 3} array={stars} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial color="#bdefff" size={0.022} transparent opacity={0.7} sizeAttenuation />
      </points>

      <group
        ref={earthGroup}
        position={[0, -0.08, 0]}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <mesh>
          <sphereGeometry args={[2.05, 128, 128]} />
          <meshStandardMaterial
            map={configuredEarthTexture}
            roughness={0.78}
            metalness={0.02}
            emissive="#06111f"
            emissiveIntensity={0.05}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.075, 128, 128]} />
          <meshStandardMaterial map={cloudTexture} transparent opacity={0.32} roughness={1} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.082, 128, 128]} />
          <meshBasicMaterial map={dayNightTexture} transparent opacity={0.92} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.087, 128, 128]} />
          <meshBasicMaterial
            map={configuredNightTexture}
            transparent
            opacity={0.42}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.092, 128, 128]} />
          <meshStandardMaterial
            color="#3bbcf6"
            transparent
            opacity={0.045}
            roughness={0.18}
            metalness={0.18}
            depthWrite={false}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.16, 96, 96]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.1} side={THREE.BackSide} />
        </mesh>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={cityPoints.length / 3} array={cityPoints} itemSize={3} />
          </bufferGeometry>
          <pointsMaterial color="#fef08a" size={0.05} transparent opacity={0.72} sizeAttenuation />
        </points>
      </group>

      <group ref={orbitGroup}>
        {[
          [0.65, 0.25, 0.1, "#67e8f9"],
          [-0.35, 0.8, 0.4, "#a7f3d0"],
          [1.05, -0.15, -0.32, "#fde68a"],
        ].map(([rx, ry, rz, color], index) => (
          <group key={index} rotation={[rx as number, ry as number, rz as number]}>
            <mesh>
              <torusGeometry args={[2.88 + index * 0.18, 0.004, 8, 180]} />
              <meshBasicMaterial color={color as string} transparent opacity={0.18} />
            </mesh>
            <mesh position={[2.88 + index * 0.18, 0, 0]}>
              <boxGeometry args={[0.1, 0.035, 0.035]} />
              <meshBasicMaterial color={color as string} transparent opacity={0.92} />
            </mesh>
          </group>
        ))}
      </group>

      <EarthCameraControls onSignalDensityChange={onSignalDensityChange} />
    </>
  );
}

export function BioPulsePlanet({
  className = "",
  signals = [],
  selectedSignalId,
  onSignalSelect,
  onSignalDensityChange,
  onProjectedSignalStatsChange,
}: {
  className?: string;
  signals?: PlanetSignal[];
  selectedSignalId?: string | null;
  onSignalSelect?: (signal: PlanetSignal) => void;
  onSignalDensityChange?: (density: PlanetSignalDensity) => void;
  onProjectedSignalStatsChange?: (stats: ProjectedSignalStats) => void;
}) {
  const [projectedSignals, setProjectedSignals] = useState<ProjectedPlanetSignal[]>([]);
  const handleProjectedSignalsChange = useCallback(
    (nextSignals: ProjectedPlanetSignal[]) => {
      setProjectedSignals(nextSignals);
      onProjectedSignalStatsChange?.({
        visible: nextSignals.length,
        groups: nextSignals.filter((signal) => signal.count > 1).length,
      });
    },
    [onProjectedSignalStatsChange]
  );

  return (
    <div className={`absolute inset-0 overflow-hidden bg-[#020712] ${className}`}>
      <Canvas
        className="cursor-grab active:cursor-grabbing"
        camera={{ position: [0, 0, 6.1], fov: 45 }}
        dpr={[1, 1.7]}
        gl={{ antialias: true }}
      >
        <EarthScene
          signals={signals}
          onSignalDensityChange={onSignalDensityChange}
          onProjectedSignalsChange={handleProjectedSignalsChange}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0,rgba(2,7,18,0.05)_28%,rgba(2,7,18,0.74)_88%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#020712]/34 via-transparent to-[#020712]/58" />
      <div className="pointer-events-none absolute inset-0">
        {projectedSignals.map((projected) => {
          const isCluster = projected.count > 1;
          const selected = projected.signal.id === selectedSignalId;
          const color = projected.color;
          const countLabel = projected.count > 99 ? "99+" : String(projected.count);

          return (
            <button
              key={projected.id}
              type="button"
              aria-label={projected.label}
              title={projected.label}
              onClick={(event) => {
                event.stopPropagation();
                onSignalSelect?.(projected.signal);
              }}
              className={[
                "pointer-events-auto absolute flex items-center justify-center border text-[9px] font-bold leading-none",
                "transition-transform duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/45",
                selected ? "scale-110 border-white/60" : "border-white/15",
                isCluster ? "rounded-full text-white/90 shadow-lg" : "text-transparent",
              ].join(" ")}
              style={{
                left: projected.x,
                top: projected.y,
                width: projected.size,
                height: projected.size,
                transform: `translate(-50%, -50%) ${isCluster ? "" : "rotate(45deg)"}`,
                background: isCluster
                  ? `radial-gradient(circle at 42% 35%, rgba(255,255,255,0.48), ${color}96 42%, ${color}2f 76%, transparent 100%)`
                  : `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.58), ${color}bf 46%, ${color}35 78%, transparent 100%)`,
                boxShadow: selected
                  ? `0 0 0 2px rgba(255,255,255,0.28), 0 0 22px ${color}72`
                  : `0 0 ${isCluster ? 10 : 8}px ${color}38`,
                borderRadius: isCluster ? "9999px" : "58% 58% 58% 18%",
              }}
            >
              {isCluster ? <span style={{ transform: "none" }}>{countLabel}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
