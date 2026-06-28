export const config = {
  runtime: "edge",
};

type EcosystemFeatureKind =
  | "forest"
  | "wetland"
  | "grassland"
  | "scrub"
  | "heath"
  | "farmland"
  | "orchard"
  | "vineyard"
  | "water"
  | "sand"
  | "rock"
  | "park"
  | "other";

type OverpassElement = {
  type?: "way" | "relation";
  id?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

const FEATURE_KIND_LABEL: Record<EcosystemFeatureKind, string> = {
  forest: "Bosque / cobertura arbórea",
  wetland: "Humedal",
  grassland: "Pastizal / pradera",
  scrub: "Matorral",
  heath: "Brezal / monte bajo",
  farmland: "Área agrícola",
  orchard: "Monte frutal",
  vineyard: "Viñedo",
  water: "Cuerpo de agua",
  sand: "Arena / playa",
  rock: "Roca expuesta",
  park: "Parque",
  other: "Cobertura ambiental",
};

const FEATURE_KIND_RANK: Record<EcosystemFeatureKind, number> = {
  wetland: 0,
  forest: 1,
  grassland: 2,
  scrub: 3,
  heath: 4,
  water: 5,
  park: 6,
  farmland: 7,
  orchard: 8,
  vineyard: 9,
  sand: 10,
  rock: 11,
  other: 12,
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

function classifyFeature(tags: Record<string, string | undefined>): EcosystemFeatureKind | null {
  const natural = tags.natural;
  const landuse = tags.landuse;
  const leisure = tags.leisure;

  if (natural === "wetland") return "wetland";
  if (natural === "wood" || landuse === "forest") return "forest";
  if (natural === "grassland" || landuse === "meadow" || landuse === "grass") return "grassland";
  if (natural === "scrub") return "scrub";
  if (natural === "heath") return "heath";
  if (natural === "water") return "water";
  if (natural === "sand" || natural === "beach") return "sand";
  if (natural === "bare_rock") return "rock";
  if (landuse === "farmland") return "farmland";
  if (landuse === "orchard") return "orchard";
  if (landuse === "vineyard") return "vineyard";
  if (leisure === "park") return "park";
  if (landuse === "conservation") return "other";
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
  way(around:${radiusMeters},${lat},${lon})["natural"~"^(wood|wetland|grassland|scrub|heath|water|sand|beach|bare_rock)$"];
  relation(around:${radiusMeters},${lat},${lon})["natural"~"^(wood|wetland|grassland|scrub|heath|water|sand|beach|bare_rock)$"];
  way(around:${radiusMeters},${lat},${lon})["landuse"~"^(forest|meadow|grass|farmland|orchard|vineyard|conservation)$"];
  relation(around:${radiusMeters},${lat},${lon})["landuse"~"^(forest|meadow|grass|farmland|orchard|vineyard|conservation)$"];
  way(around:${radiusMeters},${lat},${lon})["leisure"="park"];
  relation(around:${radiusMeters},${lat},${lon})["leisure"="park"];
);
out center tags 100;`;

  try {
    const upstream = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "BioPulse/1.0 (ecosystem context prototype)",
      },
      body: new URLSearchParams({ data: query }),
    });

    if (!upstream.ok) {
      return json({ error: "Ecosystem source temporarily unavailable", status: upstream.status }, { status: 502 });
    }

    const raw = (await upstream.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const features = (Array.isArray(raw.elements) ? raw.elements : [])
      .map((element) => {
        const type = element.type;
        const id = element.id;
        const tags = element.tags ?? {};
        const kind = classifyFeature(tags);
        const featureLat = Number(element.center?.lat);
        const featureLon = Number(element.center?.lon);

        if (!type || !Number.isFinite(id) || !kind || !validCoordinate(featureLat, -90, 90) || !validCoordinate(featureLon, -180, 180)) {
          return null;
        }

        const key = `${type}/${id}`;
        if (seen.has(key)) return null;
        seen.add(key);

        const name =
          cleanText(tags["name:es"]) ??
          cleanText(tags.name) ??
          cleanText(tags.description) ??
          FEATURE_KIND_LABEL[kind];
        const distanceKm = haversineKm(lat, lon, featureLat, featureLon);

        return {
          id: key,
          kind,
          label: FEATURE_KIND_LABEL[kind],
          name,
          distanceKm: Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : null,
          lat: featureLat,
          lon: featureLon,
          sourceUrl: `https://www.openstreetmap.org/${type}/${id}`,
        };
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null)
      .sort((a, b) => {
        const rankDelta = FEATURE_KIND_RANK[a.kind] - FEATURE_KIND_RANK[b.kind];
        if (rankDelta !== 0) return rankDelta;
        return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
      })
      .slice(0, 20);

    return json({
      center: { lat, lon },
      radiusKm,
      features,
      source: {
        name: "OpenStreetMap",
        attribution: "OpenStreetMap contributors",
        attributionUrl: "https://www.openstreetmap.org/copyright",
      },
      interpretation: "Nearby mapped environmental covers and land uses; ecological condition and event impact are not confirmed.",
    });
  } catch {
    return json({ error: "Unable to query ecosystem context" }, { status: 502 });
  }
}
