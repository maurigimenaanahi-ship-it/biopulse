export const config = {
  runtime: "edge",
};

type FacilityCategory = "healthcare" | "fire_station" | "shelter";

type GeoapifyFeature = {
  properties?: {
    place_id?: string;
    name?: string;
    address_line1?: string;
    formatted?: string;
    categories?: string[];
    distance?: number;
    lat?: number;
    lon?: number;
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

function classify(categories: string[]): FacilityCategory | null {
  if (categories.some((category) => category === "service.fire_station")) return "fire_station";
  if (
    categories.some(
      (category) =>
        category === "service.social_facility.shelter" ||
        category === "emergency.assembly_point" ||
        category === "emergency.disaster_help_point"
    )
  ) {
    return "shelter";
  }
  if (categories.some((category) => category.startsWith("healthcare."))) return "healthcare";
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
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? "25");

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return errorJson({ error: "Invalid lat/lon" }, 400);
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) {
    return errorJson({ error: "Invalid radiusKm; expected a value from 1 to 50" }, 400);
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return errorJson({ error: "Missing GEOAPIFY_API_KEY" }, 500);

  const categories = [
    "healthcare.hospital",
    "healthcare.clinic_or_praxis",
    "service.fire_station",
    "service.social_facility.shelter",
    "emergency.assembly_point",
    "emergency.disaster_help_point",
  ];
  const radiusMeters = Math.round(radiusKm * 1000);
  const upstreamUrl = new URL("https://api.geoapify.com/v2/places");
  upstreamUrl.searchParams.set("categories", categories.join(","));
  upstreamUrl.searchParams.set("filter", `circle:${lon},${lat},${radiusMeters}`);
  upstreamUrl.searchParams.set("bias", `proximity:${lon},${lat}`);
  upstreamUrl.searchParams.set("limit", "40");
  upstreamUrl.searchParams.set("apiKey", apiKey);

  try {
    const upstream = await fetch(upstreamUrl, { headers: { Accept: "application/json" } });
    if (!upstream.ok) {
      return errorJson({ error: "Infrastructure source temporarily unavailable", status: upstream.status }, 502);
    }

    const raw = (await upstream.json()) as { features?: GeoapifyFeature[] };
    const seen = new Set<string>();
    const facilities = (Array.isArray(raw.features) ? raw.features : [])
      .map((feature, index) => {
        const properties = feature.properties ?? {};
        const categories = Array.isArray(properties.categories) ? properties.categories : [];
        const category = classify(categories);
        const facilityLat = Number(properties.lat);
        const facilityLon = Number(properties.lon);
        if (!category || !validCoordinate(facilityLat, -90, 90) || !validCoordinate(facilityLon, -180, 180)) {
          return null;
        }

        const id = cleanText(properties.place_id, 160) ?? `${category}-${facilityLat}-${facilityLon}-${index}`;
        if (seen.has(id)) return null;
        seen.add(id);

        const name =
          cleanText(properties.name) ?? cleanText(properties.address_line1) ?? cleanText(properties.formatted) ??
          "Servicio sin nombre informado";
        const distanceMeters = Number(properties.distance);

        return {
          id,
          category,
          name,
          address: cleanText(properties.formatted),
          distanceKm: Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters / 1000) : null,
          lat: facilityLat,
          lon: facilityLon,
          mapUrl: `https://www.openstreetmap.org/?mlat=${facilityLat}&mlon=${facilityLon}#map=16/${facilityLat}/${facilityLon}`,
        };
      })
      .filter((facility): facility is NonNullable<typeof facility> => facility !== null)
      .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));

    return json({
      center: { lat, lon },
      radiusKm,
      facilities,
      source: {
        name: "Geoapify Places API",
        attribution: "Powered by Geoapify",
        attributionUrl: "https://www.geoapify.com/",
      },
      interpretation: "Nearby mapped services; operational status and event impact are not confirmed.",
    });
  } catch {
    return errorJson({ error: "Unable to query critical infrastructure" }, 502);
  }
}
