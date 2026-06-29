export const config = {
  runtime: "edge",
};

type FireDangerClass = "low" | "moderate" | "high" | "very_high" | "extreme" | "very_extreme" | "unknown";

type GwisUpstreamPayload = {
  x_data?: unknown;
  y_data?: Record<string, unknown>;
};

const GWIS_API_URL = "https://api.effis.emergency.copernicus.eu/rest/2/burntareas/charts/wms";
const ALLOWED_MODELS = new Set(["ecmwf", "mf", "nasageos5"]);

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400",
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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberSeries(payload: GwisUpstreamPayload, key: string): Array<number | null> {
  const value = payload.y_data?.[key];
  if (!Array.isArray(value)) return [];
  return value.map(finiteNumber);
}

function dangerClass(fwi: number | null): { classCode: FireDangerClass; classLabel: string } {
  if (fwi === null) return { classCode: "unknown", classLabel: "Sin dato" };
  if (fwi < 11.2) return { classCode: "low", classLabel: "Bajo" };
  if (fwi < 21.3) return { classCode: "moderate", classLabel: "Moderado" };
  if (fwi < 38) return { classCode: "high", classLabel: "Alto" };
  if (fwi < 50) return { classCode: "very_high", classLabel: "Muy alto" };
  if (fwi < 70) return { classCode: "extreme", classLabel: "Extremo" };
  return { classCode: "very_extreme", classLabel: "Muy extremo" };
}

function buildSeries(payload: GwisUpstreamPayload) {
  const dates = Array.isArray(payload.x_data)
    ? payload.x_data.map((value) => (typeof value === "string" ? value : null))
    : [];
  const fwi = numberSeries(payload, "fwi");
  const ffmc = numberSeries(payload, "ffmc");
  const dmc = numberSeries(payload, "dmc");
  const dc = numberSeries(payload, "dc");
  const isi = numberSeries(payload, "isi");
  const bui = numberSeries(payload, "bui");
  const anomaly = numberSeries(payload, "anomaly index");
  const ranking = numberSeries(payload, "ranking index");

  return dates
    .map((date, index) => {
      if (!date) return null;
      const fwiValue = fwi[index] ?? null;
      const classification = dangerClass(fwiValue);
      return {
        date,
        fwi: fwiValue,
        classCode: classification.classCode,
        classLabel: classification.classLabel,
        ffmc: ffmc[index] ?? null,
        dmc: dmc[index] ?? null,
        dc: dc[index] ?? null,
        isi: isi[index] ?? null,
        bui: bui[index] ?? null,
        anomaly: anomaly[index] ?? null,
        ranking: ranking[index] ?? null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function selectCurrent(series: ReturnType<typeof buildSeries>, today: string) {
  return (
    series.find((point) => point.date.slice(0, 10) === today) ??
    series.find((point) => point.date.slice(0, 10) > today) ??
    series[series.length - 1] ??
    null
  );
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
  const model = String(url.searchParams.get("model") ?? "ecmwf").trim().toLowerCase();
  const days = Number(url.searchParams.get("days") ?? "6");

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return errorJson({ error: "Invalid lat/lon" }, 400);
  }

  if (!ALLOWED_MODELS.has(model)) {
    return errorJson({ error: "Invalid model; expected ecmwf, mf or nasageos5" }, 400);
  }

  if (!Number.isFinite(days) || days < 1 || days > 9) {
    return errorJson({ error: "Invalid days; expected a value from 1 to 9" }, 400);
  }

  const now = new Date();
  const from = isoDay(addDays(now, -2));
  const to = isoDay(addDays(now, Math.floor(days)));
  const upstream = new URL(GWIS_API_URL);
  upstream.searchParams.set("model", model);
  upstream.searchParams.set("day_gte", from);
  upstream.searchParams.set("day_lte", to);
  upstream.searchParams.set("point", `(${lon} ${lat})`);

  try {
    const response = await fetch(upstream.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      return errorJson(
        { error: "GWIS fire danger source temporarily unavailable", status: response.status, message: message.slice(0, 240) },
        502
      );
    }

    const payload = (await response.json()) as GwisUpstreamPayload;
    const series = buildSeries(payload);
    const current = selectCurrent(series, isoDay(now));

    return json({
      provider: "GWIS",
      source: model.toUpperCase(),
      status: current ? "ok" : "no_data",
      query: { lat, lon, model, from, to },
      current,
      series,
      attributionText: "Global Wildfire Information System (GWIS) / European Commission",
      sourceUrl: "https://gwis.jrc.ec.europa.eu/",
      licenseUrl: "https://gwis.jrc.ec.europa.eu/about-gwis/data-license",
      limitations: [
        "GWIS Fire Danger Forecast estimates meteorological fire danger; it is not an official evacuation order.",
        "FWI classes describe potential fire weather conditions, not observed damage or confirmed spread.",
        "Use local authorities and official alert channels for public safety decisions.",
      ],
      fetchedAt: now.toISOString(),
    });
  } catch (error) {
    return errorJson(
      {
        error: "Unable to query GWIS fire danger",
        message: error instanceof Error ? error.message : String(error),
      },
      502
    );
  }
}
