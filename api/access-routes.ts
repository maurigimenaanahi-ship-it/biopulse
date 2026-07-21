export const config = {
  runtime: "edge",
};

type AccessRouteKind = "motorway" | "trunk" | "primary" | "secondary" | "tertiary" | "unclassified";

type OverpassElement = {
  type?: "way";
  id?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

type DpvRoadStatusRecord = {
  codigoTramo?: number;
  rutaNumero?: number;
  rutaProvincial?: boolean;
  rutaTramo?: string;
  rutaTipo?: string;
  rutaLongitud?: number;
  rutaEstado?: string;
  rutaSeccion?: string;
  rutaObservacion?: string;
};

type DpvRoadStatusResponse = {
  fecha?: string;
  hora?: string;
  tramoRutaList?: DpvRoadStatusRecord[];
};

type NearbyRoute = {
  id: string;
  kind: AccessRouteKind;
  label: string;
  name: string;
  ref: string | null;
  distanceKm: number | null;
  lat: number;
  lon: number;
  surface: string | null;
  access: string | null;
  bridge: string | null;
  tunnel: string | null;
  oneway: string | null;
  sourceUrl: string;
};

type OfficialRoadStatus = {
  id: string;
  routeNumber: number;
  routeLabel: string;
  segment: string;
  statusCode: string;
  statusLabel: string;
  section: string | null;
  observation: string | null;
  lengthKm: number | null;
  surface: string | null;
  sourceUrl: string;
};

const ROUTE_KIND_LABEL: Record<AccessRouteKind, string> = {
  motorway: "Autopista",
  trunk: "Ruta troncal",
  primary: "Ruta principal",
  secondary: "Ruta secundaria",
  tertiary: "Acceso terciario",
  unclassified: "Camino local",
};

const ROUTE_KIND_RANK: Record<AccessRouteKind, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
};

const NEUQUEN_BOUNDS = {
  minLat: -41.4,
  maxLat: -36.7,
  minLon: -72.4,
  maxLon: -67.4,
};

const DPV_DAILY_ROAD_STATUS_API_URL = "https://w2.dpvneuquen.gov.ar/parteopendata/api/parte";
const DPV_DAILY_ROAD_STATUS_URL = "https://w2.dpvneuquen.gov.ar/estadorutas.php";

const DPV_STATUS_LABEL: Record<string, string> = {
  I: "Intransitable",
  "S/I": "Sin informacion actualizada",
  T: "Transitable",
  TCP: "Transitable con precaucion",
  TP: "Transitable pesado",
};

const DPV_STATUS_RANK: Record<string, number> = {
  I: 0,
  "S/I": 1,
  TCP: 2,
  TP: 3,
  T: 4,
};

const NEUQUEN_ROAD_STATUS_LOCATIONS = [
  { lat: -38.354, lon: -68.789, aliases: ["anelo", "departamento anelo"] },
  { lat: -37.3906, lon: -68.9268, aliases: ["rincon de los sauces"] },
  { lat: -38.6297, lon: -68.3014, aliases: ["san patricio del chanar", "el chanar"] },
  { lat: -38.9516, lon: -68.0591, aliases: ["neuquen", "centenario", "plottier"] },
  { lat: -38.9367, lon: -69.2417, aliases: ["cutral co", "plaza huincul"] },
  { lat: -38.8992, lon: -70.0544, aliases: ["zapala"] },
  { lat: -40.1579, lon: -71.3534, aliases: ["san martin de los andes"] },
  { lat: -40.7624, lon: -71.6463, aliases: ["villa la angostura"] },
  { lat: -39.2364, lon: -70.9197, aliases: ["alumine"] },
  { lat: -37.3783, lon: -70.2709, aliases: ["chos malal"] },
];

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

function cleanText(value?: string, maxLength = 240) {
  const text = value?.trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizedSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function classifyRoute(value?: string): AccessRouteKind | null {
  if (
    value === "motorway" ||
    value === "trunk" ||
    value === "primary" ||
    value === "secondary" ||
    value === "tertiary" ||
    value === "unclassified"
  ) {
    return value;
  }
  return null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isInsideNeuquen(lat: number, lon: number) {
  return (
    lat >= NEUQUEN_BOUNDS.minLat &&
    lat <= NEUQUEN_BOUNDS.maxLat &&
    lon >= NEUQUEN_BOUNDS.minLon &&
    lon <= NEUQUEN_BOUNDS.maxLon
  );
}

function extractRouteNumbers(...values: Array<string | null | undefined>) {
  const numbers = new Set<number>();
  const text = normalizedSearchText(values.filter(Boolean).join(" "));
  const patterns = [
    /\b(?:rp|r\.?\s*p\.?|ruta provincial|provincial)\s*\.?\s*(\d{1,3})\b/g,
    /\b(?:ruta|rta)\s*\.?\s*(\d{1,3})\b/g,
  ];

  patterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const number = Number(match[1]);
      if (Number.isInteger(number) && number > 0 && number < 1000) numbers.add(number);
    }
  });

  return numbers;
}

function statusLabelFor(code: string | null) {
  if (!code) return "Sin informacion";
  return DPV_STATUS_LABEL[code] ?? code;
}

function normalizeDpvStatus(record: DpvRoadStatusRecord): OfficialRoadStatus | null {
  const codigoTramo = Number(record.codigoTramo);
  const routeNumber = Number(record.rutaNumero);
  if (!Number.isFinite(codigoTramo) || !Number.isFinite(routeNumber)) return null;

  const segment = cleanText(record.rutaTramo, 260);
  const statusCode = cleanText(record.rutaEstado, 40);
  if (!segment || !statusCode) return null;

  return {
    id: `dpv-neuquen:${codigoTramo}`,
    routeNumber,
    routeLabel: `${record.rutaProvincial === false ? "RN" : "RP"} ${routeNumber}`,
    segment,
    statusCode,
    statusLabel: statusLabelFor(statusCode),
    section: cleanText(record.rutaSeccion, 240),
    observation: cleanText(record.rutaObservacion, 420),
    lengthKm: Number.isFinite(Number(record.rutaLongitud)) ? Number(record.rutaLongitud) : null,
    surface: cleanText(record.rutaTipo, 80),
    sourceUrl: DPV_DAILY_ROAD_STATUS_URL,
  };
}

function nearbyRoadStatusAliases(lat: number, lon: number) {
  return NEUQUEN_ROAD_STATUS_LOCATIONS.filter(
    (location) => haversineKm(lat, lon, location.lat, location.lon) <= 75
  ).flatMap((location) => location.aliases);
}

function statusText(status: OfficialRoadStatus) {
  return normalizedSearchText([status.segment, status.section, status.observation].filter(Boolean).join(" "));
}

function statusAliasRank(status: OfficialRoadStatus, aliases: string[]) {
  if (aliases.length === 0) return 1;
  const text = statusText(status);
  return aliases.some((alias) => text.includes(normalizedSearchText(alias))) ? 0 : 1;
}

function statusOperationalRank(status: OfficialRoadStatus) {
  return DPV_STATUS_RANK[status.statusCode] ?? 5;
}

async function fetchNeuquenOfficialRoadStatuses(args: { routes: NearbyRoute[]; lat: number; lon: number }) {
  if (!isInsideNeuquen(args.lat, args.lon)) {
    return {
      statuses: [] as OfficialRoadStatus[],
      source: null,
      unavailable: false,
    };
  }

  const routeNumbers = new Set<number>();
  args.routes.forEach((route) => {
    extractRouteNumbers(route.ref, route.name).forEach((number) => routeNumbers.add(number));
  });

  const baseSource = {
    name: "Direccion Provincial de Vialidad de Neuquen",
    attribution: "Estado de rutas DPV Neuquen",
    attributionUrl: DPV_DAILY_ROAD_STATUS_URL,
    apiUrl: DPV_DAILY_ROAD_STATUS_API_URL,
    matchedRouteNumbers: Array.from(routeNumbers).sort((a, b) => a - b),
  };

  if (routeNumbers.size === 0) {
    return {
      statuses: [] as OfficialRoadStatus[],
      source: baseSource,
      unavailable: false,
    };
  }

  try {
    const upstream = await fetch(DPV_DAILY_ROAD_STATUS_API_URL, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.6",
        "User-Agent": "BioPulse/1.0 (Neuquen official road status context)",
      },
    });

    if (!upstream.ok) throw new Error(`DPV status ${upstream.status}`);

    const raw = (await upstream.json()) as DpvRoadStatusResponse;
    const aliases = nearbyRoadStatusAliases(args.lat, args.lon);
    const statuses = (Array.isArray(raw.tramoRutaList) ? raw.tramoRutaList : [])
      .map(normalizeDpvStatus)
      .filter((status): status is OfficialRoadStatus => Boolean(status))
      .filter((status) => routeNumbers.has(status.routeNumber))
      .sort((a, b) => {
        const aliasDelta = statusAliasRank(a, aliases) - statusAliasRank(b, aliases);
        if (aliasDelta !== 0) return aliasDelta;
        const operationalDelta = statusOperationalRank(a) - statusOperationalRank(b);
        if (operationalDelta !== 0) return operationalDelta;
        return a.routeNumber - b.routeNumber || a.segment.localeCompare(b.segment);
      })
      .slice(0, 12);

    return {
      statuses,
      source: {
        ...baseSource,
        observedAt: raw.fecha && raw.hora ? `${raw.fecha} ${raw.hora}` : raw.fecha ?? null,
      },
      unavailable: false,
    };
  } catch {
    return {
      statuses: [] as OfficialRoadStatus[],
      source: baseSource,
      unavailable: true,
    };
  }
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
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? "25");

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    return json({ error: "Invalid lat/lon" }, { status: 400 });
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) {
    return json({ error: "Invalid radiusKm; expected a value from 1 to 50" }, { status: 400 });
  }

  const radiusMeters = Math.round(radiusKm * 1000);
  const query = `[out:json][timeout:20];
(
  way(around:${radiusMeters},${lat},${lon})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified)$"];
);
out center tags 80;`;

  try {
    const upstream = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "BioPulse/1.0 (road access context prototype)",
      },
      body: new URLSearchParams({ data: query }),
    });

    if (!upstream.ok) {
      return json({ error: "Road-access source temporarily unavailable", status: upstream.status }, { status: 502 });
    }

    const raw = (await upstream.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const routes = (Array.isArray(raw.elements) ? raw.elements : [])
      .map((element) => {
        const type = element.type;
        const id = element.id;
        const tags = element.tags ?? {};
        const kind = classifyRoute(tags.highway);
        const routeLat = Number(element.center?.lat);
        const routeLon = Number(element.center?.lon);

        if (!type || !Number.isFinite(id) || !kind || !validCoordinate(routeLat, -90, 90) || !validCoordinate(routeLon, -180, 180)) {
          return null;
        }

        const key = `${type}/${id}`;
        if (seen.has(key)) return null;
        seen.add(key);

        const ref = cleanText(tags.ref, 80);
        const name = cleanText(tags["name:es"]) ?? cleanText(tags.name) ?? ref ?? ROUTE_KIND_LABEL[kind];
        const distanceKm = haversineKm(lat, lon, routeLat, routeLon);

        return {
          id: key,
          kind,
          label: ROUTE_KIND_LABEL[kind],
          name,
          ref,
          distanceKm: Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : null,
          lat: routeLat,
          lon: routeLon,
          surface: cleanText(tags.surface, 80),
          access: cleanText(tags.access, 80),
          bridge: cleanText(tags.bridge, 80),
          tunnel: cleanText(tags.tunnel, 80),
          oneway: cleanText(tags.oneway, 80),
          sourceUrl: `https://www.openstreetmap.org/${type}/${id}`,
        };
      })
      .filter((route): route is NearbyRoute => route !== null)
      .sort((a, b) => {
        const rankDelta = ROUTE_KIND_RANK[a.kind] - ROUTE_KIND_RANK[b.kind];
        if (rankDelta !== 0) return rankDelta;
        return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
      })
      .slice(0, 20);

    const officialRoadStatus = await fetchNeuquenOfficialRoadStatuses({ routes, lat, lon });

    return json({
      center: { lat, lon },
      radiusKm,
      routes,
      officialRoadStatuses: officialRoadStatus.statuses,
      officialRoadStatusSource: officialRoadStatus.source,
      officialRoadStatusUnavailable: officialRoadStatus.unavailable,
      source: {
        name: "OpenStreetMap",
        attribution: "OpenStreetMap contributors",
        attributionUrl: "https://www.openstreetmap.org/copyright",
      },
      interpretation:
        "Nearby mapped roads and accesses. In Neuquen, BioPulse also attaches matching DPV official daily road status by route number when available; this does not confirm evacuation routes or safe passage.",
    });
  } catch {
    return json({ error: "Unable to query road-access context" }, { status: 502 });
  }
}
