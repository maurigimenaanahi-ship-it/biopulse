// src/app/lib/clusterFires.ts
export type FirePoint = {
  id: string;
  latitude: number;
  longitude: number;
  frp?: number;
  confidence?: string; // "h" | "n" | "l" (depende del feed)
  acq_date?: string;
  acq_time?: string;
};

function toRad(v: number) {
  return (v * Math.PI) / 180;
}

// Distancia haversine en KM
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

export type ClusteredFireEvent = {
  id: string;
  latitude: number;
  longitude: number;
  focusCount: number;
  frpSum: number;
  frpMax: number;
  severity: "low" | "moderate" | "high" | "critical";
  members: FirePoint[];
};

function severityFrom(frps: number[], confidences: (string | undefined)[]) {
  const frpMax = frps.length ? Math.max(...frps) : 0;
  const frpSum = frps.reduce((a, b) => a + b, 0);
  const hasHighConf = confidences.some((c) => c === "h");

  const severity =
    hasHighConf || frpMax >= 50 || frpSum >= 200
      ? "critical"
      : frpMax >= 20 || frpSum >= 80
      ? "high"
      : frpMax >= 5 || frpSum >= 20
      ? "moderate"
      : "low";

  return { severity, frpMax, frpSum };
}

export function clusterFiresDBSCAN(
  points: FirePoint[],
  epsKm = 8,     // radio de agrupación en KM (8–12 suele ir bien)
  minPts = 4,    // mínimo de puntos para formar cluster
  includeNoiseAsSingleEvents = true
): ClusteredFireEvent[] {
  const visited = new Set<number>();
  const assigned = new Array(points.length).fill(false);

  const clusters: number[][] = [];
  const noise: number[] = [];

  function regionQuery(idx: number) {
    const neighbors: number[] = [];
    const p = points[idx];
    for (let j = 0; j < points.length; j++) {
      const q = points[j];
      const d = haversineKm(p.latitude, p.longitude, q.latitude, q.longitude);
      if (d <= epsKm) neighbors.push(j);
    }
    return neighbors;
  }

  function expandCluster(idx: number, neighbors: number[], cluster: number[]) {
    cluster.push(idx);
    assigned[idx] = true;

    for (let i = 0; i < neighbors.length; i++) {
      const nIdx = neighbors[i];

      if (!visited.has(nIdx)) {
        visited.add(nIdx);
        const nNeighbors = regionQuery(nIdx);
        if (nNeighbors.length >= minPts) {
          neighbors = neighbors.concat(nNeighbors);
        }
      }

      if (!assigned[nIdx]) {
        assigned[nIdx] = true;
        cluster.push(nIdx);
      }
    }
  }

  for (let i = 0; i < points.length; i++) {
    if (visited.has(i)) continue;
    visited.add(i);

    const neighbors = regionQuery(i);

    if (neighbors.length < minPts) {
      noise.push(i);
      continue;
    }

    const cluster: number[] = [];
    expandCluster(i, neighbors, cluster);
    clusters.push(cluster);
  }

  function makeEventFromMembers(members: FirePoint[], id: string): ClusteredFireEvent {
    const lat = members.reduce((s, m) => s + m.latitude, 0) / members.length;
    const lon = members.reduce((s, m) => s + m.longitude, 0) / members.length;

    const frps = members.map((m) => Number(m.frp ?? 0));
    const confidences = members.map((m) => m.confidence);

    const { severity, frpMax, frpSum } = severityFrom(frps, confidences);

    return {
      id,
      latitude: lat,
      longitude: lon,
      focusCount: members.length,
      frpSum,
      frpMax,
      severity,
      members,
    };
  }

  const events: ClusteredFireEvent[] = [];

  clusters.forEach((idxs, k) => {
    const members = idxs.map((i) => points[i]);
    events.push(makeEventFromMembers(members, `cluster-${k}`));
  });

  if (includeNoiseAsSingleEvents) {
    noise.forEach((idx, k) => {
      events.push(makeEventFromMembers([points[idx]], `single-${k}`));
    });
  }

  return events;
}
