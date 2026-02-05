// src/app/lib/findNearestCameras.ts
import type { CameraRecordV1 } from "@/data/cameras/types";

type FindNearestOptions = {
  maxResults?: number;
  radiiKm?: number[];
  requireVerified?: boolean;
  allowCountries?: string[];
};

type CameraCandidate = {
  camera: CameraRecordV1;
  distanceKm: number;
  bucketKm: number;
};

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);

  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

function isEligible(cam: CameraRecordV1, opts: Required<FindNearestOptions>) {
  if (opts.requireVerified && cam.validation.status !== "verified") return false;
  if (opts.allowCountries.length && !opts.allowCountries.includes(cam.coverage.countryISO2)) return false;
  if (!cam.usage.isPublic) return false;
  return true;
}

export function findNearestCameras(
  cameras: CameraRecordV1[],
  point: { lat: number; lon: number },
  options: FindNearestOptions = {}
): CameraCandidate[] {
  const opts: Required<FindNearestOptions> = {
    maxResults: options.maxResults ?? 3,
    radiiKm: options.radiiKm ?? [5, 20, 50, 100],
    requireVerified: options.requireVerified ?? true,
    allowCountries: options.allowCountries ?? [],
  };

  const eligible = cameras.filter((c) => isEligible(c, opts));

  const scored = eligible.map((camera) => {
    const distanceKm = haversineKm(point.lat, point.lon, camera.geo.lat, camera.geo.lon);
    const bucketKm = opts.radiiKm.find((r) => distanceKm <= r) ?? Number.POSITIVE_INFINITY;
    return { camera, distanceKm, bucketKm };
  });

  return scored
    .filter((c) => c.bucketKm !== Number.POSITIVE_INFINITY)
    .sort((a, b) => {
      if (a.bucketKm !== b.bucketKm) return a.bucketKm - b.bucketKm;
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;

      const ap = a.camera.priority ?? 0;
      const bp = b.camera.priority ?? 0;
      if (ap !== bp) return bp - ap;

      const ar = a.camera.reliabilityScore ?? 0;
      const br = b.camera.reliabilityScore ?? 0;
      if (ar !== br) return br - ar;

      return a.camera.id.localeCompare(b.camera.id);
    })
    .slice(0, opts.maxResults);
}
