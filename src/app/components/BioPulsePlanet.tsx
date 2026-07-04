import { useEffect, useMemo, useRef, useState } from "react";
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
  label?: string;
  count?: number;
  eventIds?: string[];
};

type ProjectedPlanetSignal = {
  id: string;
  label: string;
  signal: PlanetSignal;
  size: number;
  x: number;
  y: number;
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
  if (distance > 6.4) return "global";
  if (distance > 4.65) return "regional";
  return "local";
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
    controls.minDistance = 3.15;
    controls.maxDistance = 8.6;
    controls.rotateSpeed = 0.46;
    controls.zoomSpeed = 0.42;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.32;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controlsRef.current = controls;
    onSignalDensityChange?.(densityRef.current);

    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, onSignalDensityChange]);

  useFrame(() => {
    controlsRef.current?.update();
    const nextDensity = densityFromCameraDistance(camera.position.length());
    if (nextDensity !== densityRef.current) {
      densityRef.current = nextDensity;
      onSignalDensityChange?.(nextDensity);
    }
  });

  return null;
}

function PlanetSignalMarker({
  signal,
  selected,
  onSelect,
}: {
  signal: PlanetSignal;
  selected?: boolean;
  onSelect?: (signal: PlanetSignal) => void;
}) {
  const marker = useRef<THREE.Group>(null);
  const position = useMemo(() => latLonToVector3(signal.latitude, signal.longitude, 2.16), [
    signal.latitude,
    signal.longitude,
  ]);
  const color =
    signal.kind === "fire"
      ? "#fb923c"
      : signal.kind === "storm"
      ? "#fde047"
      : signal.kind === "flood"
      ? "#38bdf8"
      : signal.kind === "earthquake"
      ? "#f472b6"
      : "#a7f3d0";
  const signalCount = signal.count ?? 1;
  const isCluster = signalCount > 1;
  const countScale = isCluster ? clamp(Math.log10(signalCount + 1) * 0.28, 0.1, 0.48) : 0;
  const scale = (clamp((signal.intensity ?? 0.5) * 0.55, 0.18, 0.7) + countScale) * (selected ? 1.2 : 1);

  useFrame(({ camera }, delta) => {
    if (!marker.current) return;
    marker.current.lookAt(camera.position);
    marker.current.rotation.z += delta * 0.7;
  });

  return (
    <group
      ref={marker}
      position={position}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(signal);
      }}
    >
      <mesh>
        <sphereGeometry args={[isCluster ? 0.28 : 0.22, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.001} depthWrite={false} />
      </mesh>
      <mesh scale={[scale, scale, scale]}>
        <ringGeometry args={[0.07, 0.13, 28]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.98 : isCluster ? 0.64 : 0.78} side={THREE.DoubleSide} />
      </mesh>
      <mesh scale={[scale * 0.45, scale * 0.45, scale * 0.45]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      {isCluster ? (
        <mesh scale={[scale * 0.92, scale * 0.92, scale * 0.92]}>
          <ringGeometry args={[0.16, 0.19, 34]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {selected ? (
        <mesh scale={[scale * 1.35, scale * 1.35, scale * 1.35]}>
          <ringGeometry args={[0.12, 0.17, 36]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.28} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

function EarthScene({
  signals = [],
  selectedSignalId,
  onSignalSelect,
  onSignalDensityChange,
  onProjectedSignalsChange,
}: {
  signals?: PlanetSignal[];
  selectedSignalId?: string | null;
  onSignalSelect?: (signal: PlanetSignal) => void;
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
    if (projectionFrame.current % 5 !== 0) return;

    earthGroup.current.updateMatrixWorld();
    const earthQuaternion = new THREE.Quaternion();
    earthGroup.current.getWorldQuaternion(earthQuaternion);

    const projectedSignals = signals
      .map((signal) => {
        const localPoint = latLonToVector3(signal.latitude, signal.longitude, 2.16);
        const worldPoint = earthGroup.current!.localToWorld(localPoint.clone());
        const normal = latLonToVector3(signal.latitude, signal.longitude, 1).normalize().applyQuaternion(earthQuaternion);
        const toCamera = state.camera.position.clone().sub(worldPoint).normalize();

        if (normal.dot(toCamera) < 0.04) return null;

        const projected = worldPoint.clone().project(state.camera);
        const x = (projected.x * 0.5 + 0.5) * state.size.width;
        const y = (-projected.y * 0.5 + 0.5) * state.size.height;

        if (projected.z < -1 || projected.z > 1 || x < -20 || y < -20 || x > state.size.width + 20 || y > state.size.height + 20) {
          return null;
        }

        const count = signal.count ?? 1;
        return {
          id: signal.id,
          label: signal.label ?? "Seleccionar senal del planeta",
          signal,
          size: count > 1 ? 34 : 26,
          x,
          y,
        };
      })
      .filter((signal): signal is ProjectedPlanetSignal => Boolean(signal));

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
    const wasClick = dragState.current.active && !dragState.current.moved;
    if (wasClick && earthGroup.current && onSignalSelect && signals.length > 0 && event.point) {
      const clickedPoint = earthGroup.current.worldToLocal(event.point.clone()).normalize();
      let closestSignal: PlanetSignal | null = null;
      let closestAngle = Number.POSITIVE_INFINITY;

      signals.forEach((signal) => {
        const signalPoint = latLonToVector3(signal.latitude, signal.longitude, 1).normalize();
        const angle = clickedPoint.angleTo(signalPoint);
        if (angle < closestAngle) {
          closestAngle = angle;
          closestSignal = signal;
        }
      });

      if (closestSignal && closestAngle < 0.28) {
        onSignalSelect(closestSignal);
      }
    }
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
        {signals.map((signal) => (
          <PlanetSignalMarker
            key={signal.id}
            signal={signal}
            selected={signal.id === selectedSignalId}
            onSelect={onSignalSelect}
          />
        ))}
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
}: {
  className?: string;
  signals?: PlanetSignal[];
  selectedSignalId?: string | null;
  onSignalSelect?: (signal: PlanetSignal) => void;
  onSignalDensityChange?: (density: PlanetSignalDensity) => void;
}) {
  const [projectedSignals, setProjectedSignals] = useState<ProjectedPlanetSignal[]>([]);

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
          selectedSignalId={selectedSignalId}
          onSignalSelect={onSignalSelect}
          onSignalDensityChange={onSignalDensityChange}
          onProjectedSignalsChange={setProjectedSignals}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0">
        {projectedSignals.map((projected) => {
          const selected = projected.id === selectedSignalId;
          return (
            <button
              key={projected.id}
              type="button"
              aria-label={projected.label}
              title={projected.label}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSignalSelect?.(projected.signal);
              }}
              onClick={() => onSignalSelect?.(projected.signal)}
              className={[
                "pointer-events-auto absolute rounded-full border transition",
                selected
                  ? "border-white/45 bg-white/12 shadow-[0_0_22px_rgba(255,255,255,0.18)]"
                  : "border-orange-100/15 bg-orange-300/[0.025] hover:bg-orange-300/15",
              ].join(" ")}
              style={{
                left: projected.x,
                top: projected.y,
                width: projected.size,
                height: projected.size,
                transform: "translate(-50%, -50%)",
              }}
            />
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0,rgba(2,7,18,0.05)_28%,rgba(2,7,18,0.74)_88%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#020712]/34 via-transparent to-[#020712]/58" />
    </div>
  );
}
