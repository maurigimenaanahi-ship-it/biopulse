export const config = {
  runtime: "edge",
};

type SupportedCategory = "fire" | "flood" | "storm";
type OfficialAlertStatus = "active" | "archived";

type GdacsFeature = {
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: {
    eventtype?: unknown;
    eventid?: unknown;
    episodeid?: unknown;
    eventname?: unknown;
    alertlevel?: unknown;
    country?: unknown;
    fromdate?: unknown;
    todate?: unknown;
    severity?: unknown;
    url?: {
      report?: unknown;
      details?: unknown;
      geometry?: unknown;
    };
  };
};

type GdacsPayload = {
  type?: string;
  features?: GdacsFeature[];
};

const GDACS_SEARCH_URL = "https://www.gdacs.org/gdacsapi/api/Events/geteventlist/search";
const DEFAULT_RADIUS_KM = 250;
const DEFAULT_DAYS = 180;
const MAX_RADIUS_KM = 2000;
const MAX_DAYS = 730;

const GDACS_EVENTLIST_BY_CATEGORY: Record<SupportedCategory, string> = {
  fire: "WF",
  flood: "FL",
  storm: "TC",
};

const GDACS_TYPE_LABELS: Record<string, string> = {
  WF: "Wildfire",
  FL: "Flood",
  TC: "Tropical cyclone",
  EQ: "Earthquake",
  VO: "Volcano",
  DR: "Drought",
};

const GDACS_REQUEST_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.8",
  "User-Agent": "BioPulse/1.0 (disaster observation prototype; https://biopulse-weld.vercel.app)",
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
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

function cleanText(value: unknown, max = 220): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function validIso(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const earthRadiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function categoryFrom(value: string | null): SupportedCategory | null {
  const category = String(value ?? "fire").trim().toLowerCase();
  if (category === "fire" || category === "flood" || category === "storm") return category;
  return null;
}

function alertStatus(toDate: string | null, now: Date): OfficialAlertStatus {
  if (!toDate) return "active";
  const date = new Date(toDate);
  if (!Number.isFinite(date.getTime())) return "active";
  const graceMs = 48 * 60 * 60 * 1000;
  return date.getTime() + graceMs >= now.getTime() ? "active" : "archived";
}

function coordinates(feature: GdacsFeature): { lat: number; lon: number } | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = finiteNumber(coordinates[0]);
  const lat = finiteNumber(coordinates[1]);
  if (lat === null || lon === null || !validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return null;
  }
  return { lat, lon };
}

function normalizeFeature(args: {
  feature: GdacsFeature;
  queryLat: number;
  queryLon: number;
  radiusKm: number;
  now: Date;
}) {
  const point = coordinates(args.feature);
  if (!point) return null;

  const distanceKm = haversineKm(args.queryLat, args.queryLon, point.lat, point.lon);
  if (distanceKm > args.radiusKm) return null;

  const properties = args.feature.properties ?? {};
  const eventType = cleanText(properties.eventtype, 12) ?? "unknown";
  const alertLevel = cleanText(properties.alertlevel, 40) ?? "Unknown";
  const country = cleanText(properties.country, 80);
  const eventId = cleanText(properties.eventid, 40) ?? "unknown";
  const episodeId = cleanText(properties.episodeid, 40) ?? "unknown";
  const fromDate = validIso(properties.fromdate);
  const toDate = validIso(properties.todate);
  const eventName = cleanText(properties.eventname, 120);
  const typeLabel = GDACS_TYPE_LABELS[eventType] ?? eventType;
  const reportUrl = cleanText(properties.url?.report, 500);
  const detailsUrl = cleanText(properties.url?.details, 500);
  const geometryUrl = cleanText(properties.url?.geometry, 500);
  const title = eventName || `${typeLabel} ${alertLevel}${country ? ` - ${country}` : ""}`;

  return {
    id: `gdacs:${eventType}:${eventId}:${episodeId}`,
    sourceId: "gdacs-ercc",
    provider: "GDACS / ERCC",
    eventType,
    eventTypeLabel: typeLabel,
    eventId,
    episodeId,
    title,
    alertLevel,
    country,
    fromDate,
    toDate,
    status: alertStatus(toDate, args.now),
    lat: point.lat,
    lon: point.lon,
    distanceKm: Number(distanceKm.toFixed(1)),
    severity: finiteNumber(properties.severity),
    reportUrl,
    detailsUrl,
    geometryUrl,
    isLocalOfficialOrder: false,
  };
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
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? String(DEFAULT_RADIUS_KM));
  const days = Number(url.searchParams.get("days") ?? String(DEFAULT_DAYS));
  const category = categoryFrom(url.searchParams.get("category"));

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return errorJson({ error: "Invalid lat/lon" }, 400);
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    return errorJson({ error: `Invalid radiusKm; expected 1-${MAX_RADIUS_KM}` }, 400);
  }

  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
    return errorJson({ error: `Invalid days; expected 1-${MAX_DAYS}` }, 400);
  }

  const now = new Date();

  if (!category) {
    return json({
      provider: "GDACS",
      status: "unsupported_category",
      query: { lat, lon, radiusKm, days, category: url.searchParams.get("category") ?? "fire" },
      alerts: [],
      count: 0,
      attributionText: "Global Disaster Alert and Coordination System (GDACS)",
      sourceUrl: "https://www.gdacs.org/",
      limitations: [
        "This BioPulse MVP currently maps GDACS only for fire, flood and storm categories.",
        "GDACS references are international disaster information, not local evacuation orders.",
      ],
      fetchedAt: now.toISOString(),
    });
  }

  const upstream = new URL(GDACS_SEARCH_URL);
  upstream.searchParams.set("eventlist", GDACS_EVENTLIST_BY_CATEGORY[category]);
  upstream.searchParams.set("fromDate", isoDay(addDays(now, -Math.floor(days))));
  upstream.searchParams.set("pageSize", "100");
  upstream.searchParams.set("pageNumber", "1");
  upstream.searchParams.set("caller", "BioPulse");

  try {
    const response = await fetch(upstream.toString(), {
      headers: GDACS_REQUEST_HEADERS,
    });

    if (response.status === 204) {
      return json({
        provider: "GDACS",
        status: "no_nearby_alerts",
        query: { lat, lon, radiusKm, days, category, eventlist: GDACS_EVENTLIST_BY_CATEGORY[category] },
        alerts: [],
        count: 0,
        upstreamStatus: response.status,
        attributionText: "Global Disaster Alert and Coordination System (GDACS)",
        sourceUrl: "https://www.gdacs.org/",
        limitations: [
          "GDACS returned no records for this category and window.",
          "No GDACS reference means BioPulse did not find an international GDACS event nearby; it does not prove absence of local danger.",
          "GDACS references are international disaster information, not local evacuation orders.",
        ],
        fetchedAt: now.toISOString(),
      });
    }

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      return errorJson(
        { error: "GDACS source temporarily unavailable", status: response.status, message: message.slice(0, 240) },
        502
      );
    }

    const payload = (await response.json()) as GdacsPayload;
    const features = Array.isArray(payload.features) ? payload.features : [];
    const alerts = features
      .map((feature) => normalizeFeature({ feature, queryLat: lat, queryLon: lon, radiusKm, now }))
      .filter((alert): alert is NonNullable<typeof alert> => Boolean(alert))
      .sort((a, b) => a.distanceKm - b.distanceKm || (b.toDate ?? "").localeCompare(a.toDate ?? ""));

    return json({
      provider: "GDACS",
      status: alerts.length > 0 ? "ok" : "no_nearby_alerts",
      query: { lat, lon, radiusKm, days, category, eventlist: GDACS_EVENTLIST_BY_CATEGORY[category] },
      alerts,
      count: alerts.length,
      upstreamCount: features.length,
      attributionText: "Global Disaster Alert and Coordination System (GDACS)",
      sourceUrl: "https://www.gdacs.org/",
      apiSourceUrl: upstream.toString(),
      limitations: [
        "GDACS references are international disaster information and automated impact estimates, not local evacuation orders.",
        "Distance filtering is performed by BioPulse from GDACS event coordinates and may miss polygons or local jurisdictions.",
        "Use local civil protection, emergency services and official CAP/local channels for public safety decisions.",
      ],
      fetchedAt: now.toISOString(),
    });
  } catch (error) {
    return errorJson(
      {
        error: "Unable to query GDACS",
        message: error instanceof Error ? error.message : String(error),
      },
      502
    );
  }
}
