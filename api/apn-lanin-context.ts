export const config = {
  runtime: "edge",
};

type ApnProductStatus = "linked" | "manual" | "archived";
type ApnProductCategory =
  | "official_home"
  | "visit_planning"
  | "protected_area_profile"
  | "access"
  | "map"
  | "activities"
  | "fire_rule";

type ApnProduct = {
  id: string;
  label: string;
  category: ApnProductCategory;
  status: ApnProductStatus;
  sourceUrl: string;
  description: string;
  useInBiopulse: "official_context" | "protected_area_context" | "manual_verification";
};

type ApnAreaPoint = {
  id: string;
  name: string;
  zone: "north" | "center" | "south" | "administrative";
  lat: number;
  lon: number;
  sourceUrl: string;
};

type RankedAreaPoint = ApnAreaPoint & {
  distanceKm: number;
};

type FireRestrictionStatus = "active" | "expired";

const APN_LANIN_HOME = "https://www.argentina.gob.ar/parquesnacionales/regionpatagonia/parque-nacional-lanin";
const APN_LANIN_PLAN = "https://www.argentina.gob.ar/parquesnacionales/regionpatagonia/parque-nacional-lanin/planea-tu-visita";
const APN_LANIN_PROFILE =
  "https://www.argentina.gob.ar/parquesnacionales/regionpatagonia/parque-nacional-lanin/ficha-del-area-protegida";
const APN_LANIN_ACTIVITIES =
  "https://www.argentina.gob.ar/parquesnacionales/regionpatagonia/parque-nacional-lanin/actividades";
const APN_LANIN_ACCESS =
  "https://www.argentina.gob.ar/parquesnacionales/regionpatagonia/parque-nacional-lanin/horarios-como-llegar";
const APN_LANIN_MAP =
  "https://www.argentina.gob.ar/parquesnacionales/regionpatagonia/parque-nacional-lanin/mapa-del-area-protegida";
const APN_FIRE_RESOLUTION_390_2025 =
  "https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-390-2025-421037";

const PRODUCTS: ApnProduct[] = [
  {
    id: "apn-lanin-home",
    label: "Parque Nacional Lanin",
    category: "official_home",
    status: "linked",
    sourceUrl: APN_LANIN_HOME,
    description: "Pagina oficial del Parque Nacional Lanin en Argentina.gob.ar.",
    useInBiopulse: "official_context",
  },
  {
    id: "apn-lanin-profile",
    label: "Ficha del area protegida",
    category: "protected_area_profile",
    status: "linked",
    sourceUrl: APN_LANIN_PROFILE,
    description: "Superficie, ecorregiones, biodiversidad y contexto oficial del area protegida.",
    useInBiopulse: "protected_area_context",
  },
  {
    id: "apn-lanin-map",
    label: "Mapa del area protegida",
    category: "map",
    status: "linked",
    sourceUrl: APN_LANIN_MAP,
    description: "Mapa oficial con limites, infraestructura, caminos, excursiones y senderos de uso publico.",
    useInBiopulse: "protected_area_context",
  },
  {
    id: "apn-lanin-access",
    label: "Horarios y como llegar",
    category: "access",
    status: "linked",
    sourceUrl: APN_LANIN_ACCESS,
    description: "Informacion oficial de accesos, portales, horarios y pasos vinculados al area protegida.",
    useInBiopulse: "official_context",
  },
  {
    id: "apn-lanin-activities",
    label: "Actividades y senderos",
    category: "activities",
    status: "linked",
    sourceUrl: APN_LANIN_ACTIVITIES,
    description: "Zonas, senderos, travesias, circuitos vehiculares y recomendaciones de uso publico.",
    useInBiopulse: "protected_area_context",
  },
  {
    id: "apn-lanin-plan-visit",
    label: "Planea tu visita",
    category: "visit_planning",
    status: "linked",
    sourceUrl: APN_LANIN_PLAN,
    description: "Indice oficial de informacion para visitantes, servicios y contacto.",
    useInBiopulse: "official_context",
  },
  {
    id: "apn-resolution-390-2025",
    label: "Resolucion APN 390/2025 sobre uso de fuego",
    category: "fire_rule",
    status: "archived",
    sourceUrl: APN_FIRE_RESOLUTION_390_2025,
    description:
      "Antecedente normativo que prohibio el uso de fuego en Lanin y otros parques hasta el 30 de abril de 2026.",
    useInBiopulse: "manual_verification",
  },
];

const LANIN_POINTS: ApnAreaPoint[] = [
  {
    id: "lanin-admin-san-martin",
    name: "Intendencia San Martin de los Andes",
    zone: "administrative",
    lat: -40.1579,
    lon: -71.3534,
    sourceUrl: APN_LANIN_HOME,
  },
  {
    id: "lanin-volcan-tromen",
    name: "Volcan Lanin / Tromen",
    zone: "center",
    lat: -39.637,
    lon: -71.502,
    sourceUrl: APN_LANIN_ACTIVITIES,
  },
  {
    id: "lanin-huechulafquen",
    name: "Huechulafquen / Paimun",
    zone: "center",
    lat: -39.77,
    lon: -71.28,
    sourceUrl: APN_LANIN_ACTIVITIES,
  },
  {
    id: "lanin-curruhue",
    name: "Curruhue / Laguna Verde",
    zone: "center",
    lat: -39.85,
    lon: -71.55,
    sourceUrl: APN_LANIN_ACTIVITIES,
  },
  {
    id: "lanin-rucachoroy",
    name: "Rucachoroy",
    zone: "north",
    lat: -39.27,
    lon: -71.17,
    sourceUrl: APN_LANIN_ACTIVITIES,
  },
  {
    id: "lanin-quillen",
    name: "Quillen",
    zone: "north",
    lat: -39.38,
    lon: -71.3,
    sourceUrl: APN_LANIN_ACTIVITIES,
  },
  {
    id: "lanin-lolog",
    name: "Lolog",
    zone: "south",
    lat: -40.04,
    lon: -71.45,
    sourceUrl: APN_LANIN_ACTIVITIES,
  },
  {
    id: "lanin-lacar-quila-quina",
    name: "Lacar / Quila Quina",
    zone: "south",
    lat: -40.16,
    lon: -71.55,
    sourceUrl: APN_LANIN_ACTIVITIES,
  },
  {
    id: "lanin-hua-hum",
    name: "Hua Hum / Nonthue",
    zone: "south",
    lat: -40.12,
    lon: -71.68,
    sourceUrl: APN_LANIN_ACTIVITIES,
  },
];

const LANIN_APPROX_BBOX = {
  minLat: -40.45,
  maxLat: -38.9,
  minLon: -71.9,
  maxLon: -70.75,
};

const LANIN_CONTEXT_RADIUS_KM = 120;
const FIRE_RESTRICTION_VALID_UNTIL = "2026-04-30";

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

function inApproxLaninBBox(lat: number, lon: number) {
  return (
    lat >= LANIN_APPROX_BBOX.minLat &&
    lat <= LANIN_APPROX_BBOX.maxLat &&
    lon >= LANIN_APPROX_BBOX.minLon &&
    lon <= LANIN_APPROX_BBOX.maxLon
  );
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

function nearestAreaPoints(lat: number, lon: number): RankedAreaPoint[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  return LANIN_POINTS.map((point) => ({
    ...point,
    distanceKm: Math.round(haversineKm(lat, lon, point.lat, point.lon) * 10) / 10,
  }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);
}

function fireRestrictionStatus(now: Date): FireRestrictionStatus {
  const validUntil = new Date(`${FIRE_RESTRICTION_VALID_UNTIL}T23:59:59-03:00`);
  return now.getTime() <= validUntil.getTime() ? "active" : "expired";
}

function scopeLabelFor(nearest: RankedAreaPoint | null, inBbox: boolean) {
  if (!nearest) return "Parque Nacional Lanin";
  if (inBbox || nearest.distanceKm <= 40) return `area Lanin / zona ${nearest.zone}`;
  if (nearest.distanceKm <= LANIN_CONTEXT_RADIUS_KM) return `referencia regional Lanin / zona ${nearest.zone}`;
  return "fuera del area aproximada de Lanin";
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
  const hasCoordinates = latParam !== null || lonParam !== null;

  if (hasCoordinates && (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180))) {
    return errorJson({ error: "Invalid lat/lon" }, 400);
  }

  const areaMatches = hasCoordinates ? nearestAreaPoints(lat, lon) : [];
  const nearest = areaMatches[0] ?? null;
  const inBbox = hasCoordinates ? inApproxLaninBBox(lat, lon) : false;
  const withinContext = Boolean(nearest && nearest.distanceKm <= LANIN_CONTEXT_RADIUS_KM);
  const status = !hasCoordinates || inBbox || withinContext ? "ok" : "out_of_scope";
  const now = new Date();
  const restrictionStatus = fireRestrictionStatus(now);

  return json({
    provider: "Administracion de Parques Nacionales",
    source: "Parque Nacional Lanin",
    status,
    query: {
      lat: hasCoordinates ? lat : null,
      lon: hasCoordinates ? lon : null,
      scopeLabel: scopeLabelFor(nearest, inBbox),
      nearestDistanceKm: nearest?.distanceKm ?? null,
      inApproximateArea: inBbox,
      contextRadiusKm: LANIN_CONTEXT_RADIUS_KM,
      scopeHintSource: hasCoordinates ? "rough_area_points_and_bbox" : "not_provided",
    },
    nearestAreas: areaMatches,
    products: PRODUCTS,
    currentFireRestriction: {
      id: "apn-resolution-390-2025",
      label: "Prohibicion de uso de fuego en Parques Nacionales de Patagonia Norte",
      status: restrictionStatus,
      validFrom: "2025-12-05",
      validUntil: FIRE_RESTRICTION_VALID_UNTIL,
      sourceUrl: APN_FIRE_RESOLUTION_390_2025,
      description:
        restrictionStatus === "active"
          ? "Restriccion normativa vigente segun la fecha de consulta."
          : "Antecedente normativo vencido; no debe mostrarse como restriccion activa sin una fuente posterior.",
    },
    contact: {
      address: "Perito Moreno 1006, San Martin de los Andes (8370), Neuquen",
      phones: ["02972-427233", "02972-420664 Int. 109"],
      emails: ["lanin@apn.gob.ar", "informeslanin@apn.gob.ar"],
      sourceUrl: APN_LANIN_HOME,
    },
    attributionText: "Administracion de Parques Nacionales / Argentina.gob.ar",
    sourceUrl: APN_LANIN_HOME,
    limitations: [
      "BioPulse enlaza APN Lanin como contexto oficial de area protegida; no lo convierte en orden de evacuacion.",
      "La cercania se estima con puntos y caja aproximada; no reemplaza limites oficiales ni analisis GIS detallado.",
      "Avisos de acceso, senderos, fuego o cierre deben verificarse en la fuente oficial vigente antes de actuar.",
    ],
    fetchedAt: now.toISOString(),
  });
}
