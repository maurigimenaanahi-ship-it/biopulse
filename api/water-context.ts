export const config = {
  runtime: "edge",
};

type WaterKind = "river" | "waterbody" | "wetland" | "bay" | "spring";

type GeoapifyFeature = {
  properties?: {
    place_id?: string;
    name?: string;
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

function classify(categories: string[]): WaterKind | null {
  if (categories.some((category) => category === "waterway.river_system" || category === "natural.water.river_system")) {
    return "river";
  }
  if (categories.includes("natural.wetland")) return "wetland";
  if (categories.includes("natural.water.bay")) return "bay";
  if (categories.includes("natural.water.spring")) return "spring";
  if (categories.some((category) => category === "natural.water" || category.startsWith("natural.water."))) {
    return "waterbody";
  }
  return null;
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

  const categoryGroups = [
    { categories: ["waterway.river_system", "natural.water.river_system"], limit: 10 },
    { categories: ["natural.water", "natural.wetland"], limit: 15 },
  ];
  const radiusMeters = Math.round(radiusKm * 1000);

  try {
    const upstreamResponses = await Promise.all(
      categoryGroups.map(({ categories, limit }) => {
        const upstreamUrl = new URL("https://api.geoapify.com/v2/places");
        upstreamUrl.searchParams.set("categories", categories.join(","));
        upstreamUrl.searchParams.set("filter", `circle:${lon},${lat},${radiusMeters}`);
        upstreamUrl.searchParams.set("bias", `proximity:${lon},${lat}`);
        upstreamUrl.searchParams.set("limit", String(limit));
        upstreamUrl.searchParams.set("apiKey", apiKey);
        return fetch(upstreamUrl, { headers: { Accept: "application/json" } });
      })
    );
    const failedResponse = upstreamResponses.find((response) => !response.ok);
    if (failedResponse) {
      return errorJson({ error: "Water source temporarily unavailable", status: failedResponse.status }, 502);
    }

    const payloads = (await Promise.all(upstreamResponses.map((response) => response.json()))) as Array<{
      features?: GeoapifyFeature[];
    }>;
    const rawFeatures = payloads.flatMap((payload) => (Array.isArray(payload.features) ? payload.features : []));
    const seen = new Set<string>();
    const resources = rawFeatures
      .map((feature, index) => {
        const properties = feature.properties ?? {};
        const categories = Array.isArray(properties.categories) ? properties.categories : [];
        const kind = classify(categories);
        const resourceLat = Number(properties.lat);
        const resourceLon = Number(properties.lon);
        const name = cleanText(properties.name);
        if (!kind || !name || !validCoordinate(resourceLat, -90, 90) || !validCoordinate(resourceLon, -180, 180)) {
          return null;
        }

        const state = cleanText(properties.state);
        const country = cleanText(properties.country);
        const identity = `${kind}|${name.toLocaleLowerCase()}|${state?.toLocaleLowerCase() ?? ""}|${
          country?.toLocaleLowerCase() ?? ""
        }`;
        if (seen.has(identity)) return null;
        seen.add(identity);

        const distanceMeters = Number(properties.distance);
        return {
          id: cleanText(properties.place_id, 160) ?? `${kind}-${resourceLat}-${resourceLon}-${index}`,
          kind,
          name,
          state,
          country,
          distanceKm: Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters / 1000) : null,
          lat: resourceLat,
          lon: resourceLon,
          mapUrl: `https://www.openstreetmap.org/?mlat=${resourceLat}&mlon=${resourceLon}#map=13/${resourceLat}/${resourceLon}`,
        };
      })
      .filter((resource): resource is NonNullable<typeof resource> => resource !== null)
      .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));

    return json({
      center: { lat, lon },
      radiusKm,
      resources,
      source: {
        name: "Geoapify Places API",
        attribution: "Powered by Geoapify",
        attributionUrl: "https://www.geoapify.com/",
      },
      interpretation: "Nearby mapped water features; hydrological state and event impact are not confirmed.",
    });
  } catch {
    return errorJson({ error: "Unable to query water context" }, 502);
  }
}
