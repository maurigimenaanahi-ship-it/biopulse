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
const GDACS_RSS_URL = "https://www.gdacs.org/xml/rss.xml";
const ALERT_HUB_ARGENTINA_RSS_URL = "https://cap-alerts.s3.amazonaws.com/country-ar-lang-en/rss.xml";
const SMN_ALERTS_URL = "https://www.smn.gob.ar/alertas";
const DEFAULT_RADIUS_KM = 250;
const DEFAULT_DAYS = 180;
const MAX_RADIUS_KM = 2000;
const MAX_DAYS = 730;
const MAX_CAP_ITEMS = 50;

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

const CAP_REQUEST_HEADERS = {
  Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.6",
  "User-Agent": "BioPulse/1.0 (official alert context; https://biopulse-weld.vercel.app)",
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

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagValue(block: string, tag: string, max = 500): string | null {
  const escaped = escapeRegExp(tag);
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  if (!match?.[1]) return null;
  return cleanText(decodeXml(match[1].replace(/<[^>]+>/g, " ")), max);
}

function tagValues(block: string, tag: string, max = 500): string[] {
  const escaped = escapeRegExp(tag);
  const matches = block.matchAll(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi"));
  return Array.from(matches)
    .map((match) => (match[1] ? cleanText(decodeXml(match[1].replace(/<[^>]+>/g, " ")), max) : null))
    .filter((value): value is string => Boolean(value));
}

function tagAttribute(block: string, tag: string, attribute: string): string | null {
  const escapedTag = escapeRegExp(tag);
  const escapedAttribute = escapeRegExp(attribute);
  const match = block.match(new RegExp(`<${escapedTag}\\b[^>]*\\s${escapedAttribute}=["']([^"']*)["'][^>]*>`, "i"));
  return match?.[1] ? cleanText(decodeXml(match[1]), 160) : null;
}

function rssItems(xml: string) {
  return xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
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

type CapPoint = {
  lat: number;
  lon: number;
};

type CapCandidate = {
  item: string;
  link: string;
  preservationCopy: string | null;
  alertId: string | null;
  publishedAt: string | null;
};

function parseCapPoint(value: string): CapPoint | null {
  const [latText, lonText] = value.split(",").map((part) => part.trim());
  const lat = finiteNumber(latText);
  const lon = finiteNumber(lonText);
  if (lat === null || lon === null || !validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return null;
  }
  return { lat, lon };
}

function parseCapPolygon(value: string | null): CapPoint[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map(parseCapPoint)
    .filter((point): point is CapPoint => Boolean(point));
}

function parseCapCircle(value: string | null): { center: CapPoint; radiusKm: number } | null {
  if (!value) return null;
  const [centerText, radiusText] = value.split(/\s+/);
  const center = parseCapPoint(centerText);
  const radiusKm = finiteNumber(radiusText);
  if (!center || radiusKm === null || radiusKm < 0) return null;
  return { center, radiusKm };
}

function pointInPolygon(point: CapPoint, polygon: CapPoint[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon;
    const yi = polygon[i].lat;
    const xj = polygon[j].lon;
    const yj = polygon[j].lat;
    const intersects = yi > point.lat !== yj > point.lat && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function centroid(points: CapPoint[]): CapPoint | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, point) => {
      acc.lat += point.lat;
      acc.lon += point.lon;
      return acc;
    },
    { lat: 0, lon: 0 }
  );
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}

function distanceToPolygonKm(point: CapPoint, polygon: CapPoint[]) {
  if (polygon.length === 0) return Number.POSITIVE_INFINITY;
  if (pointInPolygon(point, polygon)) return 0;
  return polygon.reduce(
    (closest, vertex) => Math.min(closest, haversineKm(point.lat, point.lon, vertex.lat, vertex.lon)),
    Number.POSITIVE_INFINITY
  );
}

function severityScore(value: string | null) {
  const severity = String(value ?? "").toLowerCase();
  if (severity === "extreme") return 4;
  if (severity === "severe") return 3;
  if (severity === "moderate") return 2;
  if (severity === "minor") return 1;
  return null;
}

function sourceFeedFrom(item: string) {
  return tagValue(item, "capcol:sourceFeed", 80);
}

function isWithinDays(value: string | null, now: Date, days: number) {
  if (!value) return true;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return true;
  const maxAgeMs = Math.max(1, days) * 24 * 60 * 60 * 1000;
  return now.getTime() - date.getTime() <= maxAgeMs;
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

function normalizeRssItem(args: {
  item: string;
  eventlist: string;
  queryLat: number;
  queryLon: number;
  radiusKm: number;
  now: Date;
}) {
  const eventType = tagValue(args.item, "gdacs:eventtype", 12) ?? "unknown";
  if (eventType !== args.eventlist) return null;

  const lat = finiteNumber(tagValue(args.item, "geo:lat", 40));
  const lon = finiteNumber(tagValue(args.item, "geo:long", 40));
  if (lat === null || lon === null || !validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return null;
  }

  const distanceKm = haversineKm(args.queryLat, args.queryLon, lat, lon);
  if (distanceKm > args.radiusKm) return null;

  const typeLabel = GDACS_TYPE_LABELS[eventType] ?? eventType;
  const eventId = tagValue(args.item, "gdacs:eventid", 40) ?? "unknown";
  const episodeId = tagValue(args.item, "gdacs:episodeid", 40) ?? "unknown";
  const alertLevel = tagValue(args.item, "gdacs:alertlevel", 40) ?? "Unknown";
  const country = tagValue(args.item, "gdacs:country", 120);
  const fromDate = validIso(tagValue(args.item, "gdacs:fromdate", 80));
  const toDate = validIso(tagValue(args.item, "gdacs:todate", 80));
  const eventName = tagValue(args.item, "gdacs:eventname", 120);
  const title = eventName || tagValue(args.item, "title", 180) || `${typeLabel} ${alertLevel}${country ? ` - ${country}` : ""}`;
  const isCurrent = String(tagValue(args.item, "gdacs:iscurrent", 20) ?? "").toLowerCase() === "true";
  const reportUrl = tagValue(args.item, "link", 500);
  const capUrl = tagValue(args.item, "gdacs:cap", 500);

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
    status: isCurrent ? "active" : alertStatus(toDate, args.now),
    lat,
    lon,
    distanceKm: Number(distanceKm.toFixed(1)),
    severity: finiteNumber(tagAttribute(args.item, "gdacs:severity", "value")),
    reportUrl,
    detailsUrl: capUrl,
    geometryUrl: null,
    isLocalOfficialOrder: false,
  };
}

async function fetchGdacsRssFallback(args: {
  eventlist: string;
  queryLat: number;
  queryLon: number;
  radiusKm: number;
  now: Date;
}) {
  const response = await fetch(GDACS_RSS_URL, {
    headers: {
      ...GDACS_REQUEST_HEADERS,
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    return {
      ok: false as const,
      status: response.status,
      message: message.slice(0, 240),
      alerts: [],
      upstreamCount: 0,
    };
  }

  const xml = await response.text();
  const items = rssItems(xml);
  const alerts = items
    .map((item) =>
      normalizeRssItem({
        item,
        eventlist: args.eventlist,
        queryLat: args.queryLat,
        queryLon: args.queryLon,
        radiusKm: args.radiusKm,
        now: args.now,
      })
    )
    .filter((alert): alert is NonNullable<typeof alert> => Boolean(alert))
    .sort((a, b) => a.distanceKm - b.distanceKm || (b.toDate ?? "").localeCompare(a.toDate ?? ""));

  return {
    ok: true as const,
    status: response.status,
    message: null,
    alerts,
    upstreamCount: items.length,
  };
}

async function normalizeCapCandidate(args: {
  candidate: CapCandidate;
  queryLat: number;
  queryLon: number;
  radiusKm: number;
  now: Date;
}) {
  const capUrl = args.candidate.preservationCopy ?? args.candidate.link;
  const response = await fetch(capUrl, { headers: CAP_REQUEST_HEADERS });
  if (!response.ok) return null;

  const xml = await response.text();
  const status = tagValue(xml, "status", 40);
  const scope = tagValue(xml, "scope", 40);
  if (status !== "Actual" || scope !== "Public") return null;

  const polygons = tagValues(xml, "polygon", 20000).map(parseCapPolygon).filter((polygon) => polygon.length >= 3);
  const circles = tagValues(xml, "circle", 2000).map(parseCapCircle).filter((circle): circle is NonNullable<typeof circle> => Boolean(circle));
  const eventPoint = { lat: args.queryLat, lon: args.queryLon };

  const polygonDistances = polygons.map((polygon) => distanceToPolygonKm(eventPoint, polygon));
  const circleDistances = circles.map((circle) =>
    Math.max(0, haversineKm(eventPoint.lat, eventPoint.lon, circle.center.lat, circle.center.lon) - circle.radiusKm)
  );
  const distances = [...polygonDistances, ...circleDistances];
  const distanceKm = distances.length > 0 ? Math.min(...distances) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(distanceKm) || distanceKm > args.radiusKm) return null;

  const representativePoint =
    polygons.map(centroid).find((point): point is CapPoint => Boolean(point)) ?? circles[0]?.center ?? eventPoint;

  const identifier = tagValue(xml, "identifier", 180) ?? args.candidate.alertId ?? args.candidate.link;
  const sender = tagValue(xml, "sender", 120);
  const sent = validIso(tagValue(xml, "sent", 80)) ?? args.candidate.publishedAt;
  const msgType = tagValue(xml, "msgType", 40) ?? "Actual";
  const eventType = tagValue(xml, "category", 40) ?? "Met";
  const eventTypeLabel = tagValue(xml, "event", 120) ?? tagValue(args.candidate.item, "title", 180) ?? "Alerta oficial";
  const alertLevel = tagValue(xml, "severity", 40) ?? "Unknown";
  const urgency = tagValue(xml, "urgency", 40);
  const certainty = tagValue(xml, "certainty", 40);
  const fromDate = validIso(tagValue(xml, "onset", 80)) ?? sent;
  const toDate = validIso(tagValue(xml, "expires", 80));
  const senderName = tagValue(xml, "senderName", 160) ?? "Servicio Meteorologico Nacional";
  const headline = tagValue(xml, "headline", 180);
  const description = tagValue(xml, "description", 900);
  const instruction = tagValue(xml, "instruction", 900);
  const areaDesc = tagValue(xml, "areaDesc", 260);

  return {
    id: `cap-smn:${identifier}`,
    sourceId: "smn-cap-alert-hub",
    provider: "Servicio Meteorologico Nacional",
    eventType,
    eventTypeLabel,
    eventId: identifier,
    episodeId: args.candidate.alertId ?? msgType,
    title: headline ?? eventTypeLabel,
    alertLevel,
    country: "Argentina",
    fromDate,
    toDate,
    status: alertStatus(toDate, args.now),
    lat: representativePoint.lat,
    lon: representativePoint.lon,
    distanceKm: Number(distanceKm.toFixed(1)),
    severity: severityScore(alertLevel),
    reportUrl: args.candidate.link,
    detailsUrl: args.candidate.preservationCopy,
    geometryUrl: null,
    isLocalOfficialOrder: false,
    senderName,
    sender,
    urgency,
    certainty,
    description,
    instruction,
    areaDesc,
  };
}

async function fetchArgentinaCapAlerts(args: {
  queryLat: number;
  queryLon: number;
  radiusKm: number;
  days: number;
  now: Date;
}) {
  const response = await fetch(ALERT_HUB_ARGENTINA_RSS_URL, { headers: CAP_REQUEST_HEADERS });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    return {
      ok: false as const,
      status: response.status,
      message: message.slice(0, 240),
      alerts: [],
      upstreamCount: 0,
      fetchedCapCount: 0,
    };
  }

  const xml = await response.text();
  const items = rssItems(xml);
  const candidates: CapCandidate[] = items
    .map((item) => {
      const sourceFeed = sourceFeedFrom(item);
      const link = tagValue(item, "link", 600);
      if (!link) return null;
      if (sourceFeed !== "ar-smn-es" && !link?.includes("smn.gob.ar")) return null;
      const publishedAt = validIso(tagValue(item, "capcol:isoPubDate", 80) ?? tagValue(item, "pubDate", 80));
      if (!isWithinDays(publishedAt, args.now, args.days)) return null;

      return {
        item,
        link,
        preservationCopy: tagValue(item, "capcol:preservationCopy", 600),
        alertId: tagValue(item, "capcol:alertId", 120),
        publishedAt,
      };
    })
    .filter((candidate): candidate is CapCandidate => Boolean(candidate))
    .slice(0, MAX_CAP_ITEMS);

  const normalized = await Promise.all(
    candidates.map((candidate) =>
      normalizeCapCandidate({
        candidate,
        queryLat: args.queryLat,
        queryLon: args.queryLon,
        radiusKm: args.radiusKm,
        now: args.now,
      }).catch(() => null)
    )
  );

  const seen = new Set<string>();
  const alerts = normalized
    .filter((alert): alert is NonNullable<typeof alert> => Boolean(alert))
    .filter((alert) => {
      if (seen.has(alert.id)) return false;
      seen.add(alert.id);
      return true;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || (b.fromDate ?? "").localeCompare(a.fromDate ?? ""));

  return {
    ok: true as const,
    status: response.status,
    message: null,
    alerts,
    upstreamCount: items.length,
    fetchedCapCount: candidates.length,
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

  const capAlerts = await fetchArgentinaCapAlerts({
    queryLat: lat,
    queryLon: lon,
    radiusKm,
    days,
    now,
  });

  if (capAlerts.ok) {
    return json({
      provider: "Servicio Meteorologico Nacional",
      status: capAlerts.alerts.length > 0 ? "ok" : "no_nearby_alerts",
      query: { lat, lon, radiusKm, days, category, eventlist: "country-ar-lang-en" },
      alerts: capAlerts.alerts,
      count: capAlerts.alerts.length,
      upstreamCount: capAlerts.upstreamCount,
      fetchedCapCount: capAlerts.fetchedCapCount,
      attributionText: "Servicio Meteorologico Nacional, via Alert-Hub",
      sourceUrl: SMN_ALERTS_URL,
      apiSourceUrl: ALERT_HUB_ARGENTINA_RSS_URL,
      limitations: [
        "BioPulse consulta el canal publico nacional de alertas de Argentina agregado por Alert-Hub y normaliza items del Servicio Meteorologico Nacional.",
        "Estas alertas meteorologicas oficiales pueden aportar contexto de riesgo, pero no equivalen por si mismas a una orden local de evacuacion.",
        "El filtrado geografico se realiza con areas oficiales cuando estan disponibles; la distancia a esas areas es aproximada en este MVP.",
        "Usar defensa civil, bomberos, autoridades locales y canales oficiales jurisdiccionales para decisiones de seguridad.",
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

      const fallback = await fetchGdacsRssFallback({
        eventlist: GDACS_EVENTLIST_BY_CATEGORY[category],
        queryLat: lat,
        queryLon: lon,
        radiusKm,
        now,
      });

      if (fallback.ok) {
        return json({
          provider: "GDACS",
          status: fallback.alerts.length > 0 ? "ok" : "no_nearby_alerts",
          query: { lat, lon, radiusKm, days, category, eventlist: GDACS_EVENTLIST_BY_CATEGORY[category] },
          alerts: fallback.alerts,
          count: fallback.alerts.length,
          upstreamCount: fallback.upstreamCount,
          upstreamStatus: response.status,
          fallback: "gdacs_rss",
          attributionText: "Global Disaster Alert and Coordination System (GDACS)",
          sourceUrl: "https://www.gdacs.org/",
          apiSourceUrl: GDACS_RSS_URL,
          limitations: [
            "GDACS JSON API was unavailable to BioPulse, so this response uses the public GDACS RSS feed.",
            "GDACS references are international disaster information and automated impact estimates, not local evacuation orders.",
            "Distance filtering is performed by BioPulse from GDACS event coordinates and may miss polygons or local jurisdictions.",
            "Use local civil protection, emergency services and official CAP/local channels for public safety decisions.",
          ],
          fetchedAt: now.toISOString(),
        });
      }

      return errorJson(
        {
          error: "GDACS source temporarily unavailable",
          status: response.status,
          message: message.slice(0, 240),
          fallbackStatus: fallback.status,
          fallbackMessage: fallback.message,
        },
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
