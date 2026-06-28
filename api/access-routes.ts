export const config = {
  runtime: "edge",
};

type AccessRouteKind = "motorway" | "trunk" | "primary" | "secondary" | "tertiary" | "unclassified";

type OverpassElement = {
  type?: "way";
  id?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

const ROUTE_KIND_LABEL: Record<AccessRouteKind, string> = {
  motorway: "Autopista",
  trunk: "Ruta troncal",
  primary: "Ruta principal",
  secondary: "Ruta secundaria",
  tertiary: "Acceso terciario",
  unclassified: "Camino local",
};

const ROUTE_KIND_RANK: Record<AccessRouteKind, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      ...(init.headers ?? {}),
    },
  });
}

function validCoordinate(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function cleanText(value?: string, maxLength = 240) {
  const text = value?.trim();
  return text ? text.slice(0, maxLength) : null;
}

function classifyRoute(value?: string): AccessRouteKind | null {
  if (
    value === "motorway" ||
    value === "trunk" ||
    value === "primary" ||
    value === "secondary" ||
    value === "tertiary" ||
    value === "unclassified"
  ) {
    return value;
  }
  return null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? "25");

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return json({ error: "Invalid lat/lon" }, { status: 400 });
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) {
    return json({ error: "Invalid radiusKm; expected a value from 1 to 50" }, { status: 400 });
  }

  const radiusMeters = Math.round(radiusKm * 1000);
  const query = `[out:json][timeout:20];
(
  way(around:${radiusMeters},${lat},${lon})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified)$"];
);
out center tags 80;`;

  try {
    const upstream = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "BioPulse/1.0 (road access context prototype)",
      },
      body: new URLSearchParams({ data: query }),
    });

    if (!upstream.ok) {
      return json({ error: "Road-access source temporarily unavailable", status: upstream.status }, { status: 502 });
    }

    const raw = (await upstream.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const routes = (Array.isArray(raw.elements) ? raw.elements : [])
      .map((element) => {
        const type = element.type;
        const id = element.id;
        const tags = element.tags ?? {};
        const kind = classifyRoute(tags.highway);
        const routeLat = Number(element.center?.lat);
        const routeLon = Number(element.center?.lon);

        if (!type || !Number.isFinite(id) || !kind || !validCoordinate(routeLat, -90, 90) || !validCoordinate(routeLon, -180, 180)) {
          return null;
        }

        const key = `${type}/${id}`;
        if (seen.has(key)) return null;
        seen.add(key);

        const ref = cleanText(tags.ref, 80);
        const name = cleanText(tags["name:es"]) ?? cleanText(tags.name) ?? ref ?? ROUTE_KIND_LABEL[kind];
        const distanceKm = haversineKm(lat, lon, routeLat, routeLon);

        return {
          id: key,
          kind,
          label: ROUTE_KIND_LABEL[kind],
          name,
          ref,
          distanceKm: Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : null,
          lat: routeLat,
          lon: routeLon,
          surface: cleanText(tags.surface, 80),
          access: cleanText(tags.access, 80),
          bridge: cleanText(tags.bridge, 80),
          tunnel: cleanText(tags.tunnel, 80),
          oneway: cleanText(tags.oneway, 80),
          sourceUrl: `https://www.openstreetmap.org/${type}/${id}`,
        };
      })
      .filter((route): route is NonNullable<typeof route> => route !== null)
      .sort((a, b) => {
        const rankDelta = ROUTE_KIND_RANK[a.kind] - ROUTE_KIND_RANK[b.kind];
        if (rankDelta !== 0) return rankDelta;
        return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
      })
      .slice(0, 20);

    return json({
      center: { lat, lon },
      radiusKm,
      routes,
      source: {
        name: "OpenStreetMap",
        attribution: "OpenStreetMap contributors",
        attributionUrl: "https://www.openstreetmap.org/copyright",
      },
      interpretation: "Nearby mapped roads and accesses; traffic status, closures and passability are not confirmed.",
    });
  } catch {
    return json({ error: "Unable to query road-access context" }, { status: 502 });
  }
}
