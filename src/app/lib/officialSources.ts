export type OfficialSourceStatus = "connected" | "partial" | "planned" | "local";

export type OfficialSourceKind =
  | "satellite_detection"
  | "satellite_visual"
  | "weather"
  | "environmental_context"
  | "fire_risk"
  | "official_alert"
  | "humanitarian_coordination"
  | "guardian";

export type OfficialSourceAuthority =
  | "official_scientific"
  | "official_government"
  | "open_public_data"
  | "human_local"
  | "biopulse";

export type OfficialSourceRecord = {
  id: string;
  name: string;
  provider: string;
  kind: OfficialSourceKind;
  authority: OfficialSourceAuthority;
  status: OfficialSourceStatus;
  url?: string;
  attribution: string;
  provides: string[];
  doesNotProvide: string[];
  currentUse: string;
  nextStep?: string;
};

export const OFFICIAL_SOURCE_KIND_LABELS: Record<OfficialSourceKind, string> = {
  satellite_detection: "Deteccion satelital",
  satellite_visual: "Visualizacion satelital",
  weather: "Clima",
  environmental_context: "Contexto territorial",
  fire_risk: "Riesgo de incendio",
  official_alert: "Alerta oficial",
  humanitarian_coordination: "Coordinacion humanitaria",
  guardian: "Observacion humana",
};

export const OFFICIAL_SOURCE_STATUS_LABELS: Record<OfficialSourceStatus, string> = {
  connected: "Conectada",
  partial: "Parcial",
  planned: "Planificada",
  local: "Local",
};

export const OFFICIAL_SOURCE_REGISTRY: OfficialSourceRecord[] = [
  {
    id: "nasa-firms",
    name: "NASA FIRMS",
    provider: "NASA Earthdata / LANCE FIRMS",
    kind: "satellite_detection",
    authority: "official_scientific",
    status: "connected",
    url: "https://www.earthdata.nasa.gov/data/tools/firms",
    attribution: "NASA FIRMS active fire data",
    provides: [
      "Focos termicos activos y recientes",
      "FRP, sensor, fecha y posicion de deteccion cuando el producto lo informa",
      "Historial consultable por zona y ventana temporal",
    ],
    doesNotProvide: [
      "Ordenes de evacuacion",
      "Causa confirmada del incendio",
      "Perimetro final o dano humano confirmado",
    ],
    currentUse: "BioPulse ya usa FIRMS para deteccion actual e historial de senales termicas.",
    nextStep: "Normalizar cada senal FIRMS como Observation y sumar estado de disponibilidad por producto.",
  },
  {
    id: "nasa-gibs",
    name: "NASA GIBS",
    provider: "NASA Earthdata GIBS / Worldview",
    kind: "satellite_visual",
    authority: "official_scientific",
    status: "connected",
    url: "https://www.earthdata.nasa.gov/data/tools/worldview",
    attribution: "NASA GIBS satellite imagery",
    provides: [
      "Capas satelitales visuales por fecha y coordenadas",
      "Contexto territorial para observar nubes, humo, agua, vegetacion o superficie",
    ],
    doesNotProvide: [
      "Confirmacion operativa del evento",
      "Lectura automatica completa de impacto",
      "Imagen limpia garantizada para cada punto",
    ],
    currentUse: "BioPulse muestra un visor interactivo centrado en el evento con capas NASA GIBS.",
    nextStep: "Permitir guardar la capa observada como evidencia Guardian y como Observation de tipo satellite_layer.",
  },
  {
    id: "open-meteo",
    name: "Open-Meteo",
    provider: "Open-Meteo",
    kind: "weather",
    authority: "open_public_data",
    status: "connected",
    url: "https://open-meteo.com/",
    attribution: "Open-Meteo weather data",
    provides: ["Clima actual o estimado por coordenadas", "Temperatura, humedad, viento y variables disponibles"],
    doesNotProvide: ["Alerta oficial", "Pronostico de propagacion del evento", "Confirmacion de impacto"],
    currentUse: "BioPulse lo usa en la seccion Clima y como dato observado para Insight.",
    nextStep: "Separar lectura actual, pronostico y condiciones de riesgo en observaciones distintas.",
  },
  {
    id: "openstreetmap-overpass",
    name: "OpenStreetMap / Overpass",
    provider: "OpenStreetMap contributors",
    kind: "environmental_context",
    authority: "open_public_data",
    status: "partial",
    url: "https://www.openstreetmap.org/",
    attribution: "OpenStreetMap contributors",
    provides: [
      "Comunidades, rutas, servicios, agua, areas protegidas y coberturas cartografiadas cuando existen",
    ],
    doesNotProvide: [
      "Cobertura oficial completa",
      "Estado operativo de rutas o servicios",
      "Confirmacion de afectacion directa",
    ],
    currentUse: "BioPulse consulta contexto ambiental, humano, vial y territorial desde endpoints propios.",
    nextStep: "Agregar fuentes oficiales nacionales/provinciales donde existan y usar OSM como contexto complementario.",
  },
  {
    id: "gwis",
    name: "GWIS",
    provider: "GEO / Copernicus / European Commission",
    kind: "fire_risk",
    authority: "official_scientific",
    status: "partial",
    url: "https://gwis.jrc.ec.europa.eu/",
    attribution: "Global Wildfire Information System",
    provides: [
      "Peligro de incendio",
      "Focos activos y contexto global",
      "Estadisticas e historial de regimenes de fuego",
    ],
    doesNotProvide: ["Orden local de evacuacion", "Verificacion comunitaria en territorio"],
    currentUse: "BioPulse consulta Fire Weather Index por coordenada desde el servicio GWIS/EFFIS.",
    nextStep: "Sumar capas WMS, areas quemadas, emisiones e historial regional sin mezclarlo con alertas oficiales.",
  },
  {
    id: "effis",
    name: "EFFIS",
    provider: "Copernicus Emergency Management Service / JRC",
    kind: "fire_risk",
    authority: "official_scientific",
    status: "planned",
    url: "https://forest-fire.emergency.copernicus.eu/",
    attribution: "European Forest Fire Information System",
    provides: [
      "Peligro, riesgo, dano rapido, severidad, emisiones y estadisticas para Europa/Mediterraneo",
    ],
    doesNotProvide: ["Cobertura global completa", "Alertas locales fuera de su area de cobertura"],
    currentUse: "Aun no conectado en BioPulse.",
    nextStep: "Mantenerlo como fuente regional futura y referencia tecnica para otros sistemas nacionales.",
  },
  {
    id: "gdacs-ercc",
    name: "GDACS / ERCC",
    provider: "United Nations / European Commission",
    kind: "humanitarian_coordination",
    authority: "official_government",
    status: "partial",
    url: "https://www.gdacs.org/",
    attribution: "GDACS disaster information",
    provides: ["Eventos multi-catastrofe", "Estimaciones automaticas de impacto", "Coordinacion y mapas humanitarios"],
    doesNotProvide: [
      "Verdad final sin verificacion adicional",
      "Alerta local exhaustiva para todas las jurisdicciones",
      "Orden local de evacuacion",
    ],
    currentUse: "BioPulse consulta GDACS por categoria y distancia como referencia internacional estructurada.",
    nextStep: "Sumar fuentes CAP/locales para separar alerta oficial local de referencia humanitaria internacional.",
  },
  {
    id: "cap-official-alerts",
    name: "CAP / Defensa Civil",
    provider: "Autoridades publicas segun jurisdiccion",
    kind: "official_alert",
    authority: "official_government",
    status: "planned",
    attribution: "Fuente oficial de alerta publica segun jurisdiccion",
    provides: ["Alertas oficiales", "Ordenes, recomendaciones, vigencia, areas afectadas y actualizaciones"],
    doesNotProvide: ["Observacion satelital directa", "Memoria comunitaria", "Contexto historico completo"],
    currentUse: "BioPulse todavia no tiene canal CAP/oficial estructurado conectado.",
    nextStep: "Mapear fuentes CAP y defensa civil por pais/provincia antes de activar prioridad visual maxima.",
  },
  {
    id: "guardian-local",
    name: "Guardian Local",
    provider: "BioPulse",
    kind: "guardian",
    authority: "human_local",
    status: "local",
    attribution: "Observacion privada del usuario en este dispositivo",
    provides: ["Observacion humana", "Contexto territorial", "Evidencia conservada localmente", "Memoria del evento"],
    doesNotProvide: ["Confirmacion oficial", "Sincronizacion publica", "Verificacion por otros Guardianes"],
    currentUse: "BioPulse ya permite crear observaciones locales vinculadas al evento.",
    nextStep: "Evolucionar a verificacion colaborativa con consentimiento, seguridad y procedencia fuerte.",
  },
];

export function officialSourceRecordsByStatus(status: OfficialSourceStatus) {
  return OFFICIAL_SOURCE_REGISTRY.filter((source) => source.status === status);
}
