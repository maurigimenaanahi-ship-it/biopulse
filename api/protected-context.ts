export const config = {
  runtime: "edge",
};

type OverpassElement = {
  type?: "way" | "relation";
  id?: number;
  tags?: Record<string, string | undefined>;
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

function cleanText(value?: string) {
  const text = value?.trim();
  return text ? text.slice(0, 240) : null;
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
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? "50");

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return json({ error: "Invalid lat/lon" }, { status: 400 });
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100) {
    return json({ error: "Invalid radiusKm; expected a value from 1 to 100" }, { status: 400 });
  }

  const radiusMeters = Math.round(radiusKm * 1000);
  const query = `[out:json][timeout:20];
(
  way(around:${radiusMeters},${lat},${lon})["boundary"="protected_area"];
  relation(around:${radiusMeters},${lat},${lon})["boundary"="protected_area"];
  way(around:${radiusMeters},${lat},${lon})["leisure"="nature_reserve"];
  relation(around:${radiusMeters},${lat},${lon})["leisure"="nature_reserve"];
);
out center tags;`;

  try {
    const upstream = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "BioPulse/1.0 (environmental context prototype)",
      },
      body: new URLSearchParams({ data: query }),
    });

    if (!upstream.ok) {
      return json({ error: "Protected-area source temporarily unavailable", status: upstream.status }, { status: 502 });
    }

    const raw = (await upstream.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const areas = (Array.isArray(raw.elements) ? raw.elements : [])
      .map((element) => {
        const type = element.type;
        const id = element.id;
        const tags = element.tags ?? {};
        if (!type || !Number.isFinite(id)) return null;

        const key = `${type}/${id}`;
        if (seen.has(key)) return null;
        seen.add(key);

        const name = cleanText(tags["name:es"]) ?? cleanText(tags.name) ?? cleanText(tags.official_name);
        if (!name) return null;

        return {
          id: key,
          name,
          designation: cleanText(tags.designation),
          protectClass: cleanText(tags.protect_class),
          operator: cleanText(tags.operator),
          website: cleanText(tags.website),
          sourceUrl: `https://www.openstreetmap.org/${type}/${id}`,
        };
      })
      .filter((area): area is NonNullable<typeof area> => area !== null)
      .slice(0, 12);

    return json({
      center: { lat, lon },
      radiusKm,
      areas,
      source: {
        name: "OpenStreetMap",
        attribution: "OpenStreetMap contributors",
        licenseUrl: "https://www.openstreetmap.org/copyright",
      },
      interpretation: "Nearby map records; presence does not confirm exposure or damage.",
    });
  } catch {
    return json({ error: "Unable to query protected-area context" }, { status: 502 });
  }
}
