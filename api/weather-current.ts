export const config = {
  runtime: "edge",
};

type OpenMeteoPayload = {
  latitude?: unknown;
  longitude?: unknown;
  current?: {
    time?: unknown;
    temperature_2m?: unknown;
    relative_humidity_2m?: unknown;
    precipitation?: unknown;
    wind_speed_10m?: unknown;
    wind_direction_10m?: unknown;
  };
};

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=900, stale-while-revalidate=1800",
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

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return errorJson({ error: "Invalid lat/lon" }, 400);
  }

  const upstream = new URL(OPEN_METEO_URL);
  upstream.searchParams.set("latitude", String(lat));
  upstream.searchParams.set("longitude", String(lon));
  upstream.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m"
  );
  upstream.searchParams.set("timezone", "UTC");

  try {
    const response = await fetch(upstream.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      return errorJson(
        { error: "Weather source temporarily unavailable", status: response.status, message: message.slice(0, 240) },
        502
      );
    }

    const payload = (await response.json()) as OpenMeteoPayload;
    const current = payload.current ?? {};

    return json({
      provider: "Open-Meteo",
      status: current ? "ok" : "no_data",
      query: { lat, lon },
      current: {
        time: typeof current.time === "string" ? current.time : null,
        temperature_2m: finiteNumber(current.temperature_2m),
        relative_humidity_2m: finiteNumber(current.relative_humidity_2m),
        precipitation: finiteNumber(current.precipitation),
        wind_speed_10m: finiteNumber(current.wind_speed_10m),
        wind_direction_10m: finiteNumber(current.wind_direction_10m),
      },
      attributionText: "Weather data by Open-Meteo",
      sourceUrl: "https://open-meteo.com/",
      limitations: [
        "Open-Meteo provides weather context for the event point; it is not an official alert.",
        "Weather readings help interpret risk and conditions, but do not confirm event cause or impact.",
      ],
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorJson(
      {
        error: "Unable to query weather source",
        message: error instanceof Error ? error.message : String(error),
      },
      502
    );
  }
}
