export const config = {
  runtime: "edge",
};

type CommunityKind = "city" | "town" | "village" | "hamlet" | "municipality" | "township";

type GeoapifyFeature = {
  properties?: {
    place_id?: string;
    name?: string;
    formatted?: string;
    categories?: string[];
    distance?: number;
    lat?: number;
    lon?: number;
    state?: string;
    country?: string;
  };
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

function errorJson(data: unknown, status: number) {
  return json(data, { status, headers: { "cache-control": "no-store" } });
}

function validCoordinate(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function cleanText(value?: string, maxLength = 240) {
  const text = value?.trim();
  return text ? text.slice(0, maxLength) : null;
}

function classify(categories: string[]): CommunityKind | null {
  const kinds: CommunityKind[] = ["city", "town", "village", "hamlet", "municipality", "township"];
  return kinds.find((kind) => categories.includes(`populated_place.${kind}`)) ?? null;
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

  if (req.method !== "GET") return errorJson({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const latParam = url.searchParams.get("lat");
  const lonParam = url.searchParams.get("lon");
  const lat = latParam === null ? Number.NaN : Number(latParam);
  const lon = lonParam === null ? Number.NaN : Number(lonParam);
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? "50");

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return errorJson({ error: "Invalid lat/lon" }, 400);
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100) {
    return errorJson({ error: "Invalid radiusKm; expected a value from 1 to 100" }, 400);
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return errorJson({ error: "Missing GEOAPIFY_API_KEY" }, 500);

  const categories = [
    "populated_place.city",
    "populated_place.town",
    "populated_place.village",
    "populated_place.hamlet",
    "populated_place.municipality",
    "populated_place.township",
  ];
  const radiusMeters = Math.round(radiusKm * 1000);
  const upstreamUrl = new URL("https://api.geoapify.com/v2/places");
  upstreamUrl.searchParams.set("categories", categories.join(","));
  upstreamUrl.searchParams.set("filter", `circle:${lon},${lat},${radiusMeters}`);
  upstreamUrl.searchParams.set("bias", `proximity:${lon},${lat}`);
  upstreamUrl.searchParams.set("limit", "15");
  upstreamUrl.searchParams.set("apiKey", apiKey);

  try {
    const upstream = await fetch(upstreamUrl, { headers: { Accept: "application/json" } });
    if (!upstream.ok) {
      return errorJson({ error: "Community source temporarily unavailable", status: upstream.status }, 502);
    }

    const raw = (await upstream.json()) as { features?: GeoapifyFeature[] };
    const seen = new Set<string>();
    const communities = (Array.isArray(raw.features) ? raw.features : [])
      .map((feature, index) => {
        const properties = feature.properties ?? {};
        const categories = Array.isArray(properties.categories) ? properties.categories : [];
        const kind = classify(categories);
        const communityLat = Number(properties.lat);
        const communityLon = Number(properties.lon);
        if (!kind || !validCoordinate(communityLat, -90, 90) || !validCoordinate(communityLon, -180, 180)) {
          return null;
        }

        const name = cleanText(properties.name);
        if (!name) return null;
        const id = cleanText(properties.place_id, 160) ?? `${kind}-${communityLat}-${communityLon}-${index}`;
        if (seen.has(id)) return null;
        seen.add(id);

        const distanceMeters = Number(properties.distance);
        return {
          id,
          kind,
          name,
          state: cleanText(properties.state),
          country: cleanText(properties.country),
          address: cleanText(properties.formatted),
          distanceKm: Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters / 1000) : null,
          lat: communityLat,
          lon: communityLon,
          mapUrl: `https://www.openstreetmap.org/?mlat=${communityLat}&mlon=${communityLon}#map=12/${communityLat}/${communityLon}`,
        };
      })
      .filter((community): community is NonNullable<typeof community> => community !== null)
      .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));

    return json({
      center: { lat, lon },
      radiusKm,
      communities,
      source: {
        name: "Geoapify Places API",
        attribution: "Powered by Geoapify",
        attributionUrl: "https://www.geoapify.com/",
      },
      interpretation: "Nearby mapped settlements; population exposure and event impact are not confirmed.",
    });
  } catch {
    return errorJson({ error: "Unable to query nearby communities" }, 502);
  }
}
