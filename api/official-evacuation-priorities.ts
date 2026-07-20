import type { OfficialAlertRecord } from "../src/app/lib/officialAlertTypes";
import { officialAlertMentionsEvacuation } from "../src/app/lib/officialEvacuationSignals";
import type {
  OfficialEvacuationPrioritiesResponse,
  OfficialEvacuationPriority,
} from "../src/app/lib/officialEvacuationPriorityTypes";

export const config = {
  runtime: "edge",
};

type OfficialAlertStatus = "active" | "archived";

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

const ALERT_HUB_ARGENTINA_RSS_URL = "https://cap-alerts.s3.amazonaws.com/country-ar-lang-en/rss.xml";
const SMN_ALERTS_URL = "https://www.smn.gob.ar/alertas";
const DEFAULT_DAYS = 180;
const MAX_DAYS = 730;
const DEFAULT_MAX_ITEMS = 80;
const MAX_CAP_ITEMS = 120;

const CAP_REQUEST_HEADERS = {
  Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.6",
  "User-Agent": "BioPulse/1.0 (official evacuation priorities; https://biopulse-weld.vercel.app)",
};

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

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCoordinate(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
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

function rssItems(xml: string) {
  return xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
}

function validIso(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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

function alertStatus(toDate: string | null, now: Date): OfficialAlertStatus {
  if (!toDate) return "active";
  const date = new Date(toDate);
  if (!Number.isFinite(date.getTime())) return "active";
  const graceMs = 48 * 60 * 60 * 1000;
  return date.getTime() + graceMs >= now.getTime() ? "active" : "archived";
}

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

function severityScore(value: string | null) {
  const severity = String(value ?? "").toLowerCase();
  if (severity === "extreme") return 4;
  if (severity === "severe") return 3;
  if (severity === "moderate") return 2;
  if (severity === "minor") return 1;
  return null;
}

function providerLabel(alert: OfficialAlertRecord) {
  if (alert.sourceId === "smn-cap-alert-hub") return "Servicio Meteorologico Nacional";
  return alert.provider || "Fuente oficial";
}

function priorityFromAlert(alert: OfficialAlertRecord, fetchedAt: string): OfficialEvacuationPriority {
  return {
    id: `official-evacuation:${alert.id}`,
    sourceAlertId: alert.id,
    sourceId: alert.sourceId,
    provider: alert.provider,
    title: alert.title || "Alerta oficial de evacuacion",
    source: providerLabel(alert),
    detail: alert.instruction?.trim() || alert.description?.trim() || undefined,
    lat: alert.lat,
    lon: alert.lon,
    observedAt: alert.fromDate || fetchedAt,
    expiresAt: alert.toDate ?? null,
    reportUrl: alert.reportUrl ?? alert.detailsUrl ?? null,
    detailsUrl: alert.detailsUrl ?? null,
    areaDesc: alert.areaDesc ?? null,
    alertLevel: alert.alertLevel ?? null,
    urgency: alert.urgency ?? null,
    certainty: alert.certainty ?? null,
  };
}

async function normalizeCapCandidate(args: {
  candidate: CapCandidate;
  now: Date;
}): Promise<OfficialAlertRecord | null> {
  const capUrl = args.candidate.preservationCopy ?? args.candidate.link;
  const response = await fetch(capUrl, { headers: CAP_REQUEST_HEADERS });
  if (!response.ok) return null;

  const xml = await response.text();
  const status = tagValue(xml, "status", 40);
  const scope = tagValue(xml, "scope", 40);
  if (status !== "Actual" || scope !== "Public") return null;

  const polygons = tagValues(xml, "polygon", 20000).map(parseCapPolygon).filter((polygon) => polygon.length >= 3);
  const circles = tagValues(xml, "circle", 2000).map(parseCapCircle).filter((circle): circle is NonNullable<typeof circle> => Boolean(circle));
  const representativePoint =
    polygons.map(centroid).find((point): point is CapPoint => Boolean(point)) ?? circles[0]?.center ?? null;

  if (!representativePoint) return null;

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

  const alert: OfficialAlertRecord = {
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
    distanceKm: 0,
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

  if (alert.status !== "active") return null;
  if (!officialAlertMentionsEvacuation(alert)) return null;

  return alert;
}

async function fetchArgentinaEvacuationPriorities(args: { days: number; maxItems: number; now: Date }) {
  const response = await fetch(ALERT_HUB_ARGENTINA_RSS_URL, { headers: CAP_REQUEST_HEADERS });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    return {
      ok: false as const,
      status: response.status,
      message: message.slice(0, 240),
      priorities: [] as OfficialEvacuationPriority[],
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
      if (sourceFeed !== "ar-smn-es" && !link.includes("smn.gob.ar")) return null;

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
    .slice(0, args.maxItems);

  const normalized = await Promise.all(
    candidates.map((candidate) => normalizeCapCandidate({ candidate, now: args.now }).catch(() => null))
  );

  const fetchedAt = args.now.toISOString();
  const seen = new Set<string>();
  const priorities = normalized
    .filter((alert): alert is OfficialAlertRecord => Boolean(alert))
    .map((alert) => priorityFromAlert(alert, fetchedAt))
    .filter((priority) => {
      const key = `${priority.sourceId}:${priority.sourceAlertId}:${priority.expiresAt ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? "") || b.observedAt.localeCompare(a.observedAt));

  return {
    ok: true as const,
    status: response.status,
    message: null,
    priorities,
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
  const country = String(url.searchParams.get("country") ?? "AR").trim().toUpperCase();
  const days = Number(url.searchParams.get("days") ?? String(DEFAULT_DAYS));
  const maxItems = Number(url.searchParams.get("maxItems") ?? String(DEFAULT_MAX_ITEMS));
  const now = new Date();

  if (country !== "AR") {
    const response: OfficialEvacuationPrioritiesResponse = {
      provider: "BioPulse official evacuation priorities",
      status: "unsupported_country",
      country,
      priorities: [],
      count: 0,
      attributionText: "BioPulse",
      sourceUrl: "",
      limitations: ["This MVP endpoint currently normalizes Argentina official CAP alerts only."],
      fetchedAt: now.toISOString(),
    };
    return json(response);
  }

  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
    return errorJson({ error: `Invalid days; expected 1-${MAX_DAYS}` }, 400);
  }

  if (!Number.isFinite(maxItems) || maxItems < 1 || maxItems > MAX_CAP_ITEMS) {
    return errorJson({ error: `Invalid maxItems; expected 1-${MAX_CAP_ITEMS}` }, 400);
  }

  try {
    const result = await fetchArgentinaEvacuationPriorities({
      days: Math.floor(days),
      maxItems: Math.floor(maxItems),
      now,
    });

    if (!result.ok) {
      return errorJson(
        {
          error: "Official evacuation source temporarily unavailable",
          status: result.status,
          message: result.message,
        },
        502
      );
    }

    const response: OfficialEvacuationPrioritiesResponse = {
      provider: "BioPulse official evacuation priorities",
      status: result.priorities.length > 0 ? "ok" : "no_active_evacuation_priorities",
      country: "AR",
      priorities: result.priorities,
      count: result.priorities.length,
      upstreamCount: result.upstreamCount,
      fetchedCapCount: result.fetchedCapCount,
      attributionText: "Servicio Meteorologico Nacional, via Alert-Hub",
      sourceUrl: SMN_ALERTS_URL,
      apiSourceUrl: ALERT_HUB_ARGENTINA_RSS_URL,
      limitations: [
        "BioPulse normalizes public CAP alerts from Argentina through Alert-Hub and filters only explicit evacuation language.",
        "This endpoint is a priority signal for the map, not a replacement for local authorities, Defensa Civil, firefighters or emergency services.",
        "The marker position is derived from the official CAP geometry centroid or circle center and can be approximate.",
        "Absence of a marker means BioPulse did not detect explicit evacuation language in the connected feed; it does not prove absence of risk.",
      ],
      fetchedAt: now.toISOString(),
    };

    return json(response);
  } catch (error) {
    return errorJson(
      {
        error: "Unable to query official evacuation priorities",
        message: error instanceof Error ? error.message : String(error),
      },
      502
    );
  }
}
