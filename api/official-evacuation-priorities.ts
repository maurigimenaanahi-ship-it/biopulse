import type { OfficialAlertRecord } from "../src/app/lib/officialAlertTypes";
import { officialAlertMentionsEvacuation, textMentionsEvacuation } from "../src/app/lib/officialEvacuationSignals";
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

type NeuquenOfficialPost = {
  id: number;
  date?: string;
  date_gmt?: string;
  modified_gmt?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
};

type KnownNoticeLocation = {
  label: string;
  lat: number;
  lon: number;
  aliases: string[];
};

const ALERT_HUB_ARGENTINA_RSS_URL = "https://cap-alerts.s3.amazonaws.com/country-ar-lang-en/rss.xml";
const SMN_ALERTS_URL = "https://www.smn.gob.ar/alertas";
const NEUQUEN_SECURITY_POSTS_API_URL = "https://seguridad.neuquen.gob.ar/wp-json/wp/v2/posts";
const NEUQUEN_SECURITY_SOURCE_URL = "https://seguridad.neuquen.gob.ar/";
const DEFAULT_DAYS = 180;
const MAX_DAYS = 730;
const DEFAULT_MAX_ITEMS = 80;
const MAX_CAP_ITEMS = 120;
const LOCAL_NOTICE_ACTIVE_DAYS = 21;

const NEUQUEN_NOTICE_SEARCH_TERMS = [
  "evacuacion",
  "evacuación",
  "evacuar",
  "evacuados",
  "evacuadas",
  "incendio",
  "alerta meteorologica",
  "alerta meteorológica",
];

const EMERGENCY_CONTEXT_KEYWORDS = [
  "alerta",
  "emergencia",
  "incendio",
  "fuego",
  "igne",
  "forestal",
  "rural",
  "temporal",
  "lluvia",
  "inundacion",
  "inundación",
  "desborde",
  "crecida",
  "viento",
  "nevadas",
  "riesgo",
  "explosion",
  "explosión",
  "gas",
  "derrame",
  "proteccion civil",
  "protección civil",
  "defensa civil",
  "bomberos",
  "brigadistas",
];

const NEUQUEN_KNOWN_LOCATIONS: KnownNoticeLocation[] = [
  {
    label: "Añelo, Neuquén",
    lat: -38.354,
    lon: -68.789,
    aliases: ["añelo", "anelo", "departamento añelo", "departamento anelo"],
  },
  {
    label: "Rincón de los Sauces, Neuquén",
    lat: -37.3906,
    lon: -68.9268,
    aliases: ["rincon de los sauces", "rincón de los sauces"],
  },
  {
    label: "San Patricio del Chañar, Neuquén",
    lat: -38.6297,
    lon: -68.3014,
    aliases: ["san patricio del chañar", "san patricio del chanar", "el chañar", "el chanar"],
  },
  {
    label: "Neuquén capital",
    lat: -38.9516,
    lon: -68.0591,
    aliases: ["neuquen capital", "neuquén capital", "ciudad de neuquen", "ciudad de neuquén"],
  },
  {
    label: "Cutral Co, Neuquén",
    lat: -38.9367,
    lon: -69.2417,
    aliases: ["cutral co", "cutral-co"],
  },
  {
    label: "Plaza Huincul, Neuquén",
    lat: -38.926,
    lon: -69.2086,
    aliases: ["plaza huincul"],
  },
  {
    label: "Zapala, Neuquén",
    lat: -38.8992,
    lon: -70.0544,
    aliases: ["zapala", "departamento zapala"],
  },
  {
    label: "San Martín de los Andes, Neuquén",
    lat: -40.1579,
    lon: -71.3534,
    aliases: ["san martin de los andes", "san martín de los andes"],
  },
  {
    label: "Villa La Angostura, Neuquén",
    lat: -40.7624,
    lon: -71.6463,
    aliases: ["villa la angostura"],
  },
  {
    label: "Aluminé, Neuquén",
    lat: -39.2364,
    lon: -70.9197,
    aliases: ["alumine", "aluminé"],
  },
  {
    label: "Chos Malal, Neuquén",
    lat: -37.3783,
    lon: -70.2709,
    aliases: ["chos malal"],
  },
  {
    label: "Caviahue-Copahue, Neuquén",
    lat: -37.8695,
    lon: -71.0543,
    aliases: ["caviahue", "copahue", "caviahue-copahue"],
  },
];

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

function stripHtml(value: unknown, max = 1200): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  return cleanText(decodeXml(String(value).replace(/<[^>]+>/g, " ")), max);
}

function normalizedSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function addDays(value: string, days: number) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
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

function noticeHasEmergencyContext(text: string) {
  const normalized = normalizedSearchText(text);
  return EMERGENCY_CONTEXT_KEYWORDS.some((keyword) => normalized.includes(normalizedSearchText(keyword)));
}

function noticeLooksLikeEvacuationPriority(text: string) {
  return textMentionsEvacuation(text) && noticeHasEmergencyContext(text);
}

function findKnownNoticeLocation(text: string): KnownNoticeLocation | null {
  const normalized = normalizedSearchText(text);
  return (
    NEUQUEN_KNOWN_LOCATIONS.find((location) =>
      location.aliases.some((alias) => normalized.includes(normalizedSearchText(alias)))
    ) ?? null
  );
}

function postDateIso(post: NeuquenOfficialPost): string | null {
  return (
    validIso(post.date_gmt ? `${post.date_gmt}Z` : null) ??
    validIso(post.date) ??
    validIso(post.modified_gmt ? `${post.modified_gmt}Z` : null)
  );
}

function priorityFromNeuquenPost(
  post: NeuquenOfficialPost,
  fetchedAt: string,
  now: Date,
  maxAgeDays: number
): OfficialEvacuationPriority | null {
  const title = stripHtml(post.title?.rendered, 180);
  const excerpt = stripHtml(post.excerpt?.rendered, 600);
  const content = stripHtml(post.content?.rendered, 1200);
  const text = [title, excerpt, content].filter(Boolean).join(" ");
  if (!noticeLooksLikeEvacuationPriority(text)) return null;

  const observedAt = postDateIso(post);
  if (!isWithinDays(observedAt, now, maxAgeDays)) return null;

  const location = findKnownNoticeLocation(text);
  if (!location) return null;

  return {
    id: `official-evacuation:neuquen-security:${post.id}`,
    sourceAlertId: String(post.id),
    sourceId: "neuquen-security-wp",
    provider: "Ministerio de Seguridad de Neuquen",
    title: title || "Comunicado oficial de evacuacion",
    source: "Ministerio de Seguridad de Neuquen",
    detail: excerpt || content || undefined,
    lat: location.lat,
    lon: location.lon,
    observedAt: observedAt || fetchedAt,
    expiresAt: observedAt ? addDays(observedAt, LOCAL_NOTICE_ACTIVE_DAYS) : null,
    reportUrl: post.link ?? NEUQUEN_SECURITY_SOURCE_URL,
    detailsUrl: post.link ?? NEUQUEN_SECURITY_SOURCE_URL,
    areaDesc: location.label,
    alertLevel: "Official local notice",
    urgency: "Immediate",
    certainty: "Observed",
  };
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

async function fetchNeuquenSecurityEvacuationPriorities(args: {
  days: number;
  maxItems: number;
  now: Date;
}) {
  const fetchedAt = args.now.toISOString();
  const activeDays = Math.min(args.days, LOCAL_NOTICE_ACTIVE_DAYS);
  const perPage = Math.min(20, args.maxItems);
  const postMap = new Map<number, NeuquenOfficialPost>();

  await Promise.all(
    NEUQUEN_NOTICE_SEARCH_TERMS.map(async (term) => {
      const url = new URL(NEUQUEN_SECURITY_POSTS_API_URL);
      url.searchParams.set("search", term);
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("orderby", "date");
      url.searchParams.set("order", "desc");
      url.searchParams.set("_fields", "id,date,date_gmt,modified_gmt,link,title,excerpt,content");

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.6",
          "User-Agent": CAP_REQUEST_HEADERS["User-Agent"],
        },
      });

      if (!response.ok) return;
      const posts = (await response.json().catch(() => [])) as NeuquenOfficialPost[];
      if (!Array.isArray(posts)) return;

      posts.forEach((post) => {
        if (typeof post?.id === "number") postMap.set(post.id, post);
      });
    })
  );

  const priorities = Array.from(postMap.values())
    .map((post) => priorityFromNeuquenPost(post, fetchedAt, args.now, activeDays))
    .filter((priority): priority is OfficialEvacuationPriority => Boolean(priority));

  return {
    priorities,
    upstreamCount: postMap.size,
    fetchedPostCount: postMap.size,
  };
}

function dedupePriorities(priorities: OfficialEvacuationPriority[]) {
  const seen = new Set<string>();
  return priorities
    .filter((priority) => {
      const key = `${priority.sourceId}:${priority.sourceAlertId}:${priority.expiresAt ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.observedAt).getTime();
      const bTime = new Date(b.observedAt).getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
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
      limitations: ["This MVP endpoint currently normalizes Argentina official CAP alerts and selected public official local notices only."],
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
    const capResult = await fetchArgentinaEvacuationPriorities({
      days: Math.floor(days),
      maxItems: Math.floor(maxItems),
      now,
    });

    const localResult = await fetchNeuquenSecurityEvacuationPriorities({
      days: Math.floor(days),
      maxItems: Math.floor(maxItems),
      now,
    }).catch(() => ({ priorities: [] as OfficialEvacuationPriority[], upstreamCount: 0, fetchedPostCount: 0 }));

    if (!capResult.ok && localResult.priorities.length === 0) {
      return errorJson(
        {
          error: "Official evacuation source temporarily unavailable",
          status: capResult.status,
          message: capResult.message,
        },
        502
      );
    }

    const priorities = dedupePriorities([
      ...(capResult.ok ? capResult.priorities : []),
      ...localResult.priorities,
    ]);

    const response: OfficialEvacuationPrioritiesResponse = {
      provider: "BioPulse official evacuation priorities",
      status: priorities.length > 0 ? "ok" : "no_active_evacuation_priorities",
      country: "AR",
      priorities,
      count: priorities.length,
      upstreamCount: (capResult.ok ? capResult.upstreamCount : 0) + localResult.upstreamCount,
      fetchedCapCount: capResult.ok ? capResult.fetchedCapCount : 0,
      supplementalCount: localResult.priorities.length,
      fetchedOfficialNoticeCount: localResult.fetchedPostCount,
      attributionText: "Servicio Meteorologico Nacional via Alert-Hub; Ministerio de Seguridad de Neuquen",
      sourceUrl: SMN_ALERTS_URL,
      apiSourceUrl: ALERT_HUB_ARGENTINA_RSS_URL,
      supplementalSourceUrls: [NEUQUEN_SECURITY_SOURCE_URL, NEUQUEN_SECURITY_POSTS_API_URL],
      limitations: [
        "BioPulse normalizes public CAP alerts from Argentina through Alert-Hub and filters only explicit evacuation language.",
        "BioPulse also checks selected public official local notices from the Ministerio de Seguridad de Neuquen and only promotes recent posts with evacuation language, emergency context and a recognized location.",
        "This endpoint is a priority signal for the map, not a replacement for local authorities, Defensa Civil, firefighters or emergency services.",
        "The marker position is derived from official CAP geometry or a local-notice location match and can be approximate.",
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
