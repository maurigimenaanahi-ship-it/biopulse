export const config = {
  runtime: "edge",
};

type AicProductStatus = "linked" | "manual" | "limited";
type AicProductCategory = "official_home" | "forecast" | "stations" | "station_detail" | "news";

type AicProduct = {
  id: string;
  label: string;
  category: AicProductCategory;
  status: AicProductStatus;
  sourceUrl: string;
  cadence: string;
  description: string;
  useInBiopulse: "official_context" | "technical_context" | "manual_verification";
};

type AicStation = {
  id: string;
  name: string;
  kind: "hydromet_station" | "meteorological_station" | "river_station";
  lat: number;
  lon: number;
  province: string;
  basin: string;
  sourceUrl: string;
};

type RankedStation = AicStation & {
  distanceKm: number;
};

const AIC_HOME = "https://www.aic.gob.ar/Sitio/home";
const AIC_ABOUT = "https://www.aic.gob.ar/sitio/laaic";
const AIC_FORECAST_NEUQUEN = "https://www.aic.gob.ar/sitio/extendido?a=1014&z=1454457642";
const AIC_STATIONS = "https://www.aic.gob.ar/sitio/estaciones";
const AIC_NEWS = "https://www.aic.gob.ar/sitio/novedades-inicio";
const AIC_COMPENSADOR_EL_CHANAR = "https://www.aic.gob.ar/sitio/estaciones-detalle?a=37&z=1840266588";
const AIC_LA_HIGUERA = "https://www.aic.gob.ar/sitio/estaciones-detalle?a=34&z=1840266588";

const PRODUCTS: AicProduct[] = [
  {
    id: "aic-home",
    label: "AIC: portada oficial",
    category: "official_home",
    status: "linked",
    sourceUrl: AIC_HOME,
    cadence: "referencia",
    description: "Portada oficial de la Autoridad Interjurisdiccional de Cuencas con pronostico y novedades.",
    useInBiopulse: "official_context",
  },
  {
    id: "aic-about",
    label: "AIC: autoridad de cuencas",
    category: "official_home",
    status: "linked",
    sourceUrl: AIC_ABOUT,
    cadence: "referencia",
    description: "Marco institucional de la autoridad interjurisdiccional para los rios Limay, Neuquen y Negro.",
    useInBiopulse: "official_context",
  },
  {
    id: "aic-forecast-neuquen",
    label: "Pronostico extendido Neuquen",
    category: "forecast",
    status: "limited",
    sourceUrl: AIC_FORECAST_NEUQUEN,
    cadence: "diario / extendido",
    description: "Pronostico regional AIC util para viento, lluvia y condiciones que pueden modificar un incendio.",
    useInBiopulse: "technical_context",
  },
  {
    id: "aic-stations",
    label: "Estaciones hidrometeorologicas",
    category: "stations",
    status: "linked",
    sourceUrl: AIC_STATIONS,
    cadence: "segun estacion",
    description: "Listado oficial de estaciones AIC para observar cuencas, rios y condiciones hidrometeorologicas.",
    useInBiopulse: "technical_context",
  },
  {
    id: "aic-news",
    label: "Novedades y avisos AIC",
    category: "news",
    status: "manual",
    sourceUrl: AIC_NEWS,
    cadence: "segun publicacion",
    description: "Canal oficial de novedades que puede incluir avisos de lluvia, nieve, viento, caudales o tormentas.",
    useInBiopulse: "manual_verification",
  },
];

const AIC_STATIONS_CURATED: AicStation[] = [
  {
    id: "aic-compensador-el-chanar",
    name: "Compensador El Chanar",
    kind: "hydromet_station",
    lat: -38.6167,
    lon: -68.2833,
    province: "Neuquen",
    basin: "Rio Neuquen",
    sourceUrl: AIC_COMPENSADOR_EL_CHANAR,
  },
  {
    id: "aic-la-higuera",
    name: "La Higuera",
    kind: "hydromet_station",
    lat: -38.5833,
    lon: -69.3667,
    province: "Neuquen",
    basin: "Rio Neuquen",
    sourceUrl: AIC_LA_HIGUERA,
  },
  {
    id: "aic-portezuelo-grande",
    name: "Portezuelo Grande",
    kind: "hydromet_station",
    lat: -38.4667,
    lon: -68.9333,
    province: "Neuquen",
    basin: "Rio Neuquen",
    sourceUrl: AIC_STATIONS,
  },
  {
    id: "aic-dique-ballester",
    name: "Dique Ballester",
    kind: "river_station",
    lat: -38.8,
    lon: -68.0167,
    province: "Neuquen / Rio Negro",
    basin: "Rio Neuquen",
    sourceUrl: AIC_STATIONS,
  },
  {
    id: "aic-arroyito",
    name: "Arroyito",
    kind: "hydromet_station",
    lat: -39.0667,
    lon: -68.5833,
    province: "Neuquen",
    basin: "Rio Limay",
    sourceUrl: AIC_STATIONS,
  },
  {
    id: "aic-paso-limay",
    name: "Paso Limay",
    kind: "river_station",
    lat: -39.6833,
    lon: -70.6333,
    province: "Neuquen / Rio Negro",
    basin: "Rio Limay",
    sourceUrl: AIC_STATIONS,
  },
  {
    id: "aic-bariloche",
    name: "Bariloche",
    kind: "meteorological_station",
    lat: -41.1333,
    lon: -71.3167,
    province: "Rio Negro",
    basin: "Cuenca Limay / Nahuel Huapi",
    sourceUrl: AIC_STATIONS,
  },
  {
    id: "aic-chos-malal",
    name: "Chos Malal",
    kind: "meteorological_station",
    lat: -37.3667,
    lon: -70.2667,
    province: "Neuquen",
    basin: "Alto Neuquen",
    sourceUrl: AIC_STATIONS,
  },
];

const AIC_BBOX = {
  minLat: -42.5,
  maxLat: -36.4,
  minLon: -72.5,
  maxLon: -63.8,
};

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

function inAicBBox(lat: number, lon: number) {
  return (
    lat >= AIC_BBOX.minLat &&
    lat <= AIC_BBOX.maxLat &&
    lon >= AIC_BBOX.minLon &&
    lon <= AIC_BBOX.maxLon
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

function nearestStations(lat: number, lon: number): RankedStation[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  return AIC_STATIONS_CURATED.map((station) => ({
    ...station,
    distanceKm: Math.round(haversineKm(lat, lon, station.lat, station.lon) * 10) / 10,
  }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);
}

function scopeLabelFor(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "Cuencas Limay-Neuquen-Negro";
  if (!inAicBBox(lat, lon)) return "fuera del area AIC aproximada";
  if (lon < -70.3) return "cordillera / alta cuenca";
  if (lat < -39.2) return "Limay / Rio Negro";
  if (lon > -68.7) return "valle inferior del Neuquen";
  return "Neuquen medio / cuenca del Neuquen";
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

  const status = !hasCoordinates || inAicBBox(lat, lon) ? "ok" : "out_of_scope";
  const stationMatches = hasCoordinates ? nearestStations(lat, lon) : [];

  return json({
    provider: "Autoridad Interjurisdiccional de Cuencas",
    source: "AIC",
    status,
    query: {
      lat: hasCoordinates ? lat : null,
      lon: hasCoordinates ? lon : null,
      scopeLabel: hasCoordinates ? scopeLabelFor(lat, lon) : "Cuencas Limay-Neuquen-Negro",
      scopeHintSource: hasCoordinates ? "rough_coordinate_bbox" : "not_provided",
    },
    nearestStations: stationMatches,
    products: PRODUCTS,
    attributionText: "Autoridad Interjurisdiccional de Cuencas (AIC)",
    sourceUrl: AIC_HOME,
    limitations: [
      "BioPulse enlaza productos oficiales AIC como contexto hidrometeorologico regional; no los convierte en orden de evacuacion.",
      "Las estaciones cercanas son una lista curada inicial, no el inventario completo de AIC.",
      "Los enlaces de pronostico y detalle pueden requerir verificacion manual si AIC cambia parametros de navegacion.",
    ],
    fetchedAt: new Date().toISOString(),
  });
}
