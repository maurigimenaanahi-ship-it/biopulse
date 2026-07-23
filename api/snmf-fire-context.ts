export const config = {
  runtime: "edge",
};

type SnmfProductStatus = "linked" | "manual" | "limited";
type SnmfProductCategory =
  | "official_home"
  | "daily_report"
  | "fire_danger_map"
  | "monthly_forecast"
  | "occurrence_report"
  | "seasonality"
  | "sinagir_notice";

type SnmfProduct = {
  id: string;
  label: string;
  category: SnmfProductCategory;
  status: SnmfProductStatus;
  sourceUrl: string;
  cadence: string;
  description: string;
  useInBiopulse: "official_context" | "technical_context" | "manual_verification";
};

const SNMF_HOME =
  "https://www.argentina.gob.ar/servicio-nacional-de-manejo-del-fuego/que-es-y-como-funciona-el-servicio-nacional-de-manejo-del-fuego";
const SNMF_FIRE_DANGER_MAP =
  "https://www.argentina.gob.ar/seguridad/servicio-nacional-de-manejo-del-fuego/evaluacion-de-peligro-y-alerta-temprana/mapa-de";
const SNMF_MONTHLY_EARLY_WARNING =
  "https://www.argentina.gob.ar/servicio-nacional-de-manejo-del-fuego/reporte-mensual-de-alerta-temprana";
const SNMF_OCCURRENCE_REPORT =
  "https://www.argentina.gob.ar/seguridad/servicio-nacional-de-manejo-del-fuego/evaluacion-de-peligro-y-alerta-temprana/reporte";
const SNMF_SEASON_CALENDAR =
  "https://www.argentina.gob.ar/seguridad/servicio-nacional-de-manejo-del-fuego/que-es-y-como-funciona-el-servicio-nacional-de-8";
const SINAGIR_FIRE_DANGER = "https://www.argentina.gob.ar/sinagir/peligro-incendios-forestales";
const SMN_FIRE_DANGER = "https://www.smn.gob.ar/indices_peligro_fuego";

const PRODUCTS: SnmfProduct[] = [
  {
    id: "snmf-home",
    label: "SNMF: funcionamiento y reportes",
    category: "official_home",
    status: "linked",
    sourceUrl: SNMF_HOME,
    cadence: "referencia",
    description:
      "Marco oficial del organismo nacional que coordina recursos para incendios forestales, rurales o de interfase.",
    useInBiopulse: "official_context",
  },
  {
    id: "snmf-fire-danger-map",
    label: "Mapa de peligro de incendio",
    category: "fire_danger_map",
    status: "linked",
    sourceUrl: SNMF_FIRE_DANGER_MAP,
    cadence: "24, 48 y 72 hs",
    description:
      "Indice meteorologico nacional para estimar ignicion, propagacion, dificultad de control e impacto potencial.",
    useInBiopulse: "technical_context",
  },
  {
    id: "smn-fire-danger-index",
    label: "SMN: estimaciones de peligro de fuego",
    category: "fire_danger_map",
    status: "limited",
    sourceUrl: SMN_FIRE_DANGER,
    cadence: "24, 48 y 72 hs",
    description:
      "Destino enlazado por SNMF para las estimaciones calculadas con estaciones meteorologicas y GFS-NCEP.",
    useInBiopulse: "technical_context",
  },
  {
    id: "snmf-monthly-early-warning",
    label: "Reporte mensual de alerta temprana",
    category: "monthly_forecast",
    status: "linked",
    sourceUrl: SNMF_MONTHLY_EARLY_WARNING,
    cadence: "mensual",
    description:
      "Analisis integrado de condiciones estacionales, ocurrencia, focos de calor, indices de peligro y proyecciones.",
    useInBiopulse: "technical_context",
  },
  {
    id: "snmf-occurrence-report",
    label: "Reporte tecnico de ocurrencia",
    category: "occurrence_report",
    status: "linked",
    sourceUrl: SNMF_OCCURRENCE_REPORT,
    cadence: "historico / tecnico",
    description:
      "Indice de reportes tecnicos de ocurrencia elaborados a partir de incendios informados por jurisdicciones.",
    useInBiopulse: "official_context",
  },
  {
    id: "snmf-season-calendar",
    label: "Calendario de temporadas altas",
    category: "seasonality",
    status: "linked",
    sourceUrl: SNMF_SEASON_CALENDAR,
    cadence: "referencia estacional",
    description:
      "Referencia oficial de temporadas altas por region para interpretar estacionalidad del riesgo.",
    useInBiopulse: "technical_context",
  },
  {
    id: "sinagir-fire-danger-alerts",
    label: "SINAGIR: avisos de peligro de incendios",
    category: "sinagir_notice",
    status: "limited",
    sourceUrl: SINAGIR_FIRE_DANGER,
    cadence: "semanal / segun vigencia",
    description:
      "SNMF indica que los avisos con condiciones criticas se cargan en SINAGIR; BioPulse lo conserva como verificacion manual.",
    useInBiopulse: "manual_verification",
  },
  {
    id: "snmf-daily-report",
    label: "Reporte diario de incendios",
    category: "daily_report",
    status: "manual",
    sourceUrl: SNMF_HOME,
    cadence: "diario",
    description:
      "Producto oficial mencionado por SNMF, con estado de situacion y recursos desplegados. No se expone aun como feed estable.",
    useInBiopulse: "manual_verification",
  },
];

const ARGENTINA_BBOX = {
  minLat: -56,
  maxLat: -21,
  minLon: -74,
  maxLon: -53,
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

function inArgentinaBBox(lat: number, lon: number) {
  return (
    lat >= ARGENTINA_BBOX.minLat &&
    lat <= ARGENTINA_BBOX.maxLat &&
    lon >= ARGENTINA_BBOX.minLon &&
    lon <= ARGENTINA_BBOX.maxLon
  );
}

function regionHintFor(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inArgentinaBBox(lat, lon)) return null;
  if (lat <= -36) return "Patagonia";
  if (lat <= -30 && lon <= -64) return "Cuyo / centro oeste";
  if (lat <= -30) return "Centro";
  if (lon <= -63) return "NOA";
  return "NEA / Litoral";
}

function provinceHintFor(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inArgentinaBBox(lat, lon)) return null;

  if (lat <= -36.1 && lat >= -41.2 && lon >= -71.7 && lon <= -67) return "Neuquen / Rio Negro";
  if (lat <= -41 && lon <= -65) return "Patagonia sur";
  if (lat <= -34 && lon <= -67) return "Mendoza / Neuquen";
  if (lat <= -31 && lon <= -63) return "Cuyo / Centro";
  if (lat > -31 && lon <= -63) return "Noroeste argentino";
  return "Argentina";
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

  const countryHint = hasCoordinates && inArgentinaBBox(lat, lon) ? "AR" : "unknown";
  const status = !hasCoordinates || countryHint === "AR" ? "ok" : "out_of_scope";
  const regionHint = hasCoordinates ? regionHintFor(lat, lon) : null;
  const provinceHint = hasCoordinates ? provinceHintFor(lat, lon) : null;

  return json({
    provider: "Servicio Nacional de Manejo del Fuego",
    source: "SNMF",
    status,
    query: {
      lat: hasCoordinates ? lat : null,
      lon: hasCoordinates ? lon : null,
      countryHint,
      provinceHint,
      regionHint,
      regionHintSource: hasCoordinates ? "rough_coordinate_bbox" : "not_provided",
    },
    products: PRODUCTS,
    attributionText: "Servicio Nacional de Manejo del Fuego / Argentina.gob.ar",
    sourceUrl: SNMF_HOME,
    limitations: [
      "BioPulse enlaza productos oficiales de contexto nacional; no los convierte en orden de evacuacion.",
      "El reporte diario y SINAGIR se conservan como verificacion manual hasta contar con un feed publico estable.",
      "Las decisiones operativas y evacuaciones deben confirmarse con autoridades provinciales, municipales o de proteccion civil.",
    ],
    fetchedAt: new Date().toISOString(),
  });
}
