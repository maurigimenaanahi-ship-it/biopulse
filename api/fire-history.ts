export const config = {
  runtime: "edge",
};

type FireHistoryYearSummary = {
  year: number;
  detections: number;
  frpSum: number | null;
  frpMax: number | null;
  latestDetection: string | null;
};

type FireDetection = {
  latitude: number | null;
  longitude: number | null;
  acq_date: string | null;
  acq_time: string | null;
  frp: number | null;
  confidence: string | null;
  satellite: string | null;
  instrument: string | null;
  daynight: string | null;
};

const FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const DEFAULT_SOURCE = "VIIRS_SNPP_SP";
const ALLOWED_SOURCES = new Set([
  "MODIS_SP",
  "VIIRS_SNPP_SP",
  "VIIRS_NOAA20_SP",
  "VIIRS_NOAA21_NRT",
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
]);

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function monthDays(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function bboxAround(lat: number, lon: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  const lonScale = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const lonDelta = radiusKm / (111.32 * lonScale);
  const west = clamp(lon - lonDelta, -180, 180);
  const south = clamp(lat - latDelta, -90, 90);
  const east = clamp(lon + lonDelta, -180, 180);
  const north = clamp(lat + latDelta, -90, 90);
  return [west, south, east, north].map((value) => Number(value.toFixed(4))).join(",");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseFirmsCsv(text: string): FireDetection[] {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0] ?? "").map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = new Map<string, string>();
    headers.forEach((header, index) => row.set(header, cells[index] ?? ""));
    const numberOrNull = (key: string) => {
      const value = Number(row.get(key));
      return Number.isFinite(value) ? value : null;
    };
    const textOrNull = (key: string) => {
      const value = row.get(key)?.trim();
      return value ? value : null;
    };

    return {
      latitude: numberOrNull("latitude"),
      longitude: numberOrNull("longitude"),
      acq_date: textOrNull("acq_date"),
      acq_time: textOrNull("acq_time"),
      frp: numberOrNull("frp"),
      confidence: textOrNull("confidence"),
      satellite: textOrNull("satellite"),
      instrument: textOrNull("instrument"),
      daynight: textOrNull("daynight"),
    };
  });
}

function detectionIso(detection: FireDetection) {
  if (!detection.acq_date) return null;
  const time = (detection.acq_time ?? "").padStart(4, "0");
  const iso = /^\d{4}$/.test(time)
    ? `${detection.acq_date}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`
    : `${detection.acq_date}T00:00:00Z`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function summarizeYear(year: number, detections: FireDetection[]): FireHistoryYearSummary {
  const frps = detections.map((detection) => detection.frp).filter((value): value is number => Number.isFinite(value));
  const latestDetection = detections
    .map(detectionIso)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    year,
    detections: detections.length,
    frpSum: frps.length ? Number(frps.reduce((sum, value) => sum + value, 0).toFixed(2)) : null,
    frpMax: frps.length ? Number(Math.max(...frps).toFixed(2)) : null,
    latestDetection,
  };
}

async function fetchFirmsChunk(args: {
  mapKey: string;
  source: string;
  bbox: string;
  dayRange: number;
  date: string;
}) {
  const upstreamUrl =
    `${FIRMS_BASE_URL}/${encodeURIComponent(args.mapKey)}` +
    `/${args.source}/${args.bbox}/${args.dayRange}/${args.date}`;

  const res = await fetch(upstreamUrl, { headers: { Accept: "text/csv" } });
  if (!res.ok) {
    throw new Error(`FIRMS history source error ${res.status}`);
  }

  return parseFirmsCsv(await res.text());
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
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? "25");
  const years = Number(url.searchParams.get("years") ?? "5");
  const month = Number(url.searchParams.get("month") ?? String(new Date().getUTCMonth() + 1));
  const source = (url.searchParams.get("source") ?? DEFAULT_SOURCE).trim().toUpperCase();

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return errorJson({ error: "Invalid lat/lon" }, 400);
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100) {
    return errorJson({ error: "Invalid radiusKm; expected a value from 1 to 100" }, 400);
  }
  if (!Number.isInteger(years) || years < 1 || years > 6) {
    return errorJson({ error: "Invalid years; expected an integer from 1 to 6" }, 400);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return errorJson({ error: "Invalid month; expected an integer from 1 to 12" }, 400);
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return errorJson({ error: "Invalid source" }, 400);
  }

  const mapKey = process.env.NASA_FIRMS_MAP_KEY || process.env.FIRMS_MAP_KEY;
  if (!mapKey) {
    return errorJson({ error: "Missing NASA_FIRMS_MAP_KEY or FIRMS_MAP_KEY" }, 500);
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const bbox = bboxAround(lat, lon, radiusKm);
  const targetYears = Array.from({ length: years }, (_, index) => currentYear - index - 1);

  try {
    const yearSummaries = await Promise.all(
      targetYears.map(async (year) => {
        const days = monthDays(year, month);
        const chunks = [];
        for (let day = 1; day <= days; day += 5) {
          const dayRange = Math.min(5, days - day + 1);
          const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          chunks.push(fetchFirmsChunk({ mapKey, source, bbox, dayRange, date }));
        }
        const detections = (await Promise.all(chunks)).flat();
        return summarizeYear(year, detections);
      })
    );

    const yearsWithDetections = yearSummaries.filter((item) => item.detections > 0);
    const peakYear =
      yearsWithDetections.length > 0
        ? [...yearsWithDetections].sort((a, b) => b.detections - a.detections || b.year - a.year)[0]
        : null;
    const latestDetection =
      yearsWithDetections
        .map((item) => item.latestDetection)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    return json({
      provider: "NASA FIRMS",
      source,
      query: {
        lat,
        lon,
        radiusKm,
        bbox,
        years,
        sampledMonth: month,
        sampledYears: targetYears,
      },
      summary: {
        totalDetections: yearSummaries.reduce((sum, item) => sum + item.detections, 0),
        yearsWithDetections: yearsWithDetections.length,
        peakYear,
        latestDetection,
      },
      years: yearSummaries,
      attributionText: "NASA FIRMS fire detection data",
      limitations: [
        "Consulta histórica inicial por mes calendario y radio aproximado; no representa todavía un archivo anual completo.",
        "FIRMS detecta anomalías térmicas satelitales; no confirma por sí solo causa, perímetro, daño ni impacto humano.",
        "La disponibilidad depende del producto FIRMS y puede variar por sensor, nubes, humo, cobertura y procesamiento.",
      ],
      fetchedAt: now.toISOString(),
    });
  } catch (err: any) {
    return errorJson(
      {
        error: "Unable to query FIRMS history",
        message: err?.message ? String(err.message) : "Unknown error",
      },
      502
    );
  }
}
