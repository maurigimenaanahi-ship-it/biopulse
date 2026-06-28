export const config = {
  runtime: "edge",
};

type SettlementKind =
  | "city"
  | "town"
  | "village"
  | "hamlet"
  | "municipality"
  | "township"
  | "locality"
  | "isolated_dwelling";

type OverpassElement = {
  type?: "node" | "way" | "relation";
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

const SETTLEMENT_KIND_LABEL: Record<SettlementKind, string> = {
  city: "Ciudad",
  town: "Localidad",
  village: "Pueblo",
  hamlet: "Paraje",
  municipality: "Municipio",
  township: "Municipio/localidad",
  locality: "Localidad menor",
  isolated_dwelling: "Vivienda aislada",
};

const SETTLEMENT_KIND_RANK: Record<SettlementKind, number> = {
  city: 0,
  town: 1,
  municipality: 2,
  township: 3,
  village: 4,
  hamlet: 5,
  locality: 6,
  isolated_dwelling: 7,
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

function classifySettlement(value?: string): SettlementKind | null {
  if (
    value === "city" ||
    value === "town" ||
    value === "village" ||
    value === "hamlet" ||
    value === "municipality" ||
    value === "township" ||
    value === "locality" ||
    value === "isolated_dwelling"
  ) {
    return value;
  }
  return null;
}

function parsePopulation(value?: string) {
  if (!value) return null;
  const cleaned = value.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
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
  node(around:${radiusMeters},${lat},${lon})["place"~"^(city|town|village|hamlet|municipality|township|locality|isolated_dwelling)$"];
);
out tags 100;`;

  try {
    const upstream = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "BioPulse/1.0 (population context prototype)",
      },
      body: new URLSearchParams({ data: query }),
    });

    if (!upstream.ok) {
      return json({ error: "Population source temporarily unavailable", status: upstream.status }, { status: 502 });
    }

    const raw = (await upstream.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const settlements = (Array.isArray(raw.elements) ? raw.elements : [])
      .map((element) => {
        const type = element.type;
        const id = element.id;
        const tags = element.tags ?? {};
        const kind = classifySettlement(tags.place);
        const settlementLat = Number(element.lat ?? element.center?.lat);
        const settlementLon = Number(element.lon ?? element.center?.lon);

        if (!type || !Number.isFinite(id) || !kind || !validCoordinate(settlementLat, -90, 90) || !validCoordinate(settlementLon, -180, 180)) {
          return null;
        }

        const name = cleanText(tags["name:es"]) ?? cleanText(tags.name);
        if (!name) return null;

        const identity = `${kind}|${name.toLocaleLowerCase()}`;
        if (seen.has(identity)) return null;
        seen.add(identity);

        const population = parsePopulation(tags.population);
        const distanceKm = haversineKm(lat, lon, settlementLat, settlementLon);

        return {
          id: `${type}/${id}`,
          kind,
          label: SETTLEMENT_KIND_LABEL[kind],
          name,
          population,
          populationSource: cleanText(tags["population:source"]) ?? cleanText(tags.source),
          populationDate: cleanText(tags["population:date"]) ?? cleanText(tags["census:date"]),
          distanceKm: Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : null,
          lat: settlementLat,
          lon: settlementLon,
          sourceUrl: `https://www.openstreetmap.org/${type}/${id}`,
        };
      })
      .filter((settlement): settlement is NonNullable<typeof settlement> => settlement !== null)
      .sort((a, b) => {
        const rankDelta = SETTLEMENT_KIND_RANK[a.kind] - SETTLEMENT_KIND_RANK[b.kind];
        if (rankDelta !== 0) return rankDelta;
        return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
      })
      .slice(0, 25);

    const settlementsWithPopulation = settlements.filter((settlement) => settlement.population != null);
    const knownPopulationSum = settlementsWithPopulation.reduce((sum, settlement) => sum + (settlement.population ?? 0), 0);

    return json({
      center: { lat, lon },
      radiusKm,
      settlements,
      knownPopulationSum,
      knownPopulationCount: settlementsWithPopulation.length,
      source: {
        name: "OpenStreetMap",
        attribution: "OpenStreetMap contributors",
        attributionUrl: "https://www.openstreetmap.org/copyright",
      },
      interpretation: "Nearby mapped settlements and available population tags; this is not exposed or affected population.",
    });
  } catch {
    return json({ error: "Unable to query population context" }, { status: 502 });
  }
}
