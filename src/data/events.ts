// src/data/events.ts

export type EventCategory =
  | "flood"
  | "fire"
  | "storm"
  | "heatwave"
  | "air-pollution"
  | "ocean-anomaly";

export type EvacuationLevel = "none" | "recommended" | "mandatory";
export type EventStatus = "active" | "contained" | "escalating" | "stabilizing" | "resolved";
export type EventTrend = "rising" | "stable" | "falling";

export interface AIInsight {
  probabilityNext12h?: number; // 0..100
  narrative?: string; // texto narrativo
  recommendations?: string[]; // bullets cortos
}

/** Punto histórico (para comparar “antes vs ahora”) */
export interface EventHistoryPoint {
  t: Date; // timestamp de observación
  focusCount?: number; // detecciones (para fire)
  frpSum?: number; // fire radiative power sum
  frpMax?: number; // fire radiative power max
  severity?: EnvironmentalEvent["severity"];
}

export interface EnvironmentalEvent {
  id: string;
  category: EventCategory;

  // ✅ lugar (lo que querés que se vea fuerte)
  location: string;

  latitude: number;
  longitude: number;

  severity: "low" | "moderate" | "high" | "critical";

  // ✅ identidad
  title: string;
  description: string;

  // Date (como ya lo tenías)
  timestamp: Date;

  // ✅ condiciones
  temperature?: number;
  windSpeed?: number;
  humidity?: number;
  airQualityIndex?: number;
  waterLevel?: number;

  // ✅ impacto básico
  affectedArea: number; // km²
  affectedPopulation?: number;

  // ✅ riesgo
  riskIndicators: string[];

  // ✅ visual sources
  satelliteImageUrl?: string;
  liveFeedUrl?: string; // idealmente URL real

  // ====== PRO (opción B) ======
  status?: EventStatus;
  evacuationLevel?: EvacuationLevel;

  nearbyInfrastructure?: string[]; // ciudades, rutas, centrales, reservas
  ecosystems?: string[]; // humedales, bosques, selva...
  speciesAtRisk?: string[]; // especies

  aiInsight?: AIInsight; // “inteligencia viva”

  // ====== MEMORIA / HISTORIA ======
  /** Primer vez que el sistema lo vio */
  firstSeen?: Date;
  /** Última vez que el sistema lo vio (si después desaparece, queda guardado acá) */
  lastSeen?: Date;
  /** Si no apareció en el último escaneo, lo marcamos como “stale” */
  stale?: boolean;

  /** Series temporal mínima para comparar cambios */
  history?: EventHistoryPoint[];

  /** ID estable entre scans (para “vida del evento”) */
  eventId?: string;

  /** Cuántas veces fue visto en distintos scans */
  scanCount?: number;

  /** Tendencia según cambios (FRP / detecciones) */
  trend?: EventTrend;

  // ====== MÉTRICAS FIRE (para clusters DBSCAN) ======
  focusCount?: number;
  frpSum?: number;
  frpMax?: number;
}

export const categoryColors: Record<EventCategory, string> = {
  flood: "#00d4ff",
  fire: "#ff4400",
  storm: "#9d00ff",
  heatwave: "#ffaa00",
  "air-pollution": "#88ff00",
  "ocean-anomaly": "#00ffaa",
};

export const categoryLabels: Record<EventCategory, string> = {
  flood: "Floods",
  fire: "Fires",
  storm: "Storms",
  heatwave: "Heatwaves",
  "air-pollution": "Air Pollution",
  "ocean-anomaly": "Ocean Anomalies",
};

// Mock environmental events data (enriquecido para panel PRO)
export const mockEvents: EnvironmentalEvent[] = [
  {
    id: "1",
    category: "fire",
    location: "California, USA",
    latitude: 36.7783,
    longitude: -119.4179,
    severity: "critical",
    title: "Wildfire Outbreak",
    description:
      "Satellite sensors detected multiple high-intensity fire fronts. Strong winds and very low humidity increase the risk of rapid spread toward populated zones.",
    timestamp: new Date("2026-01-30T14:30:00Z"),
    temperature: 42,
    windSpeed: 45,
    humidity: 12,
    affectedArea: 2500,
    affectedPopulation: 15000,
    riskIndicators: ["Rapid spread", "High winds", "Dense smoke", "Evacuation zones"],
    satelliteImageUrl: "https://images.unsplash.com/photo-1615092296061-e2ccfeb2f3d6?w=800",
    liveFeedUrl: "https://www.youtube.com",
    status: "escalating",
    evacuationLevel: "mandatory",
    nearbyInfrastructure: ["Highway corridors", "Power lines", "Protected areas"],
    ecosystems: ["Dry forests", "Shrublands"],
    speciesAtRisk: ["Raptors", "Small mammals"],
    aiInsight: {
      probabilityNext12h: 78,
      narrative:
        "BioPulse estimates a high probability of expansion in the next 12 hours if wind conditions persist. Continuous monitoring and readiness for evacuation are recommended.",
      recommendations: ["Maintain evacuation readiness", "Prioritize air quality alerts", "Monitor wind changes"],
    },
  },
  {
    id: "2",
    category: "flood",
    location: "Bangladesh",
    latitude: 23.685,
    longitude: 90.3563,
    severity: "high",
    title: "Monsoon Flooding",
    description:
      "Persistent monsoon rainfall is raising river levels across multiple districts. Low-lying areas show signs of overflow and infrastructure disruption.",
    timestamp: new Date("2026-01-30T08:15:00Z"),
    temperature: 28,
    humidity: 95,
    waterLevel: 4.5,
    affectedArea: 1800,
    affectedPopulation: 500000,
    riskIndicators: ["Rising water levels", "Infrastructure damage", "Disease risk"],
    satelliteImageUrl: "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=800",
    status: "active",
    evacuationLevel: "recommended",
    nearbyInfrastructure: ["River crossings", "Primary roads", "Hospitals (regional)"],
    ecosystems: ["River floodplains", "Wetlands"],
    speciesAtRisk: ["Aquatic birds", "Fish nurseries"],
    aiInsight: {
      probabilityNext12h: 62,
      narrative:
        "BioPulse projects continued flooding pressure over the next 12 hours. Risk is concentrated in low elevation districts; prioritize safe routes and health advisories.",
      recommendations: ["Monitor water level trends", "Prepare temporary shelters", "Issue health & sanitation alerts"],
    },
  },
  {
    id: "3",
    category: "storm",
    location: "Atlantic Ocean",
    latitude: 25.7617,
    longitude: -80.1918,
    severity: "critical",
    title: "Hurricane Formation",
    description:
      "A Category 4 system is intensifying while approaching coastal areas. Expect extreme winds, heavy rainfall, and storm surge conditions.",
    timestamp: new Date("2026-01-30T12:00:00Z"),
    temperature: 29,
    windSpeed: 220,
    humidity: 88,
    affectedArea: 5000,
    affectedPopulation: 2000000,
    riskIndicators: ["Extreme winds", "Storm surge", "Heavy rainfall", "Power outages"],
    satelliteImageUrl: "https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=800",
    liveFeedUrl: "https://www.noaa.gov",
    status: "escalating",
    evacuationLevel: "recommended",
    nearbyInfrastructure: ["Coastal cities", "Ports", "Power grid nodes"],
    ecosystems: ["Coastal wetlands", "Reefs"],
    speciesAtRisk: ["Sea turtles", "Coastal birds"],
    aiInsight: {
      probabilityNext12h: 81,
      narrative:
        "BioPulse indicates a very high chance of intensification and coastline impact. Prepare for storm surge and widespread outages.",
      recommendations: ["Prioritize coastal warnings", "Secure critical infrastructure", "Monitor surge models"],
    },
  },
  {
    id: "4",
    category: "heatwave",
    location: "New Delhi, India",
    latitude: 28.6139,
    longitude: 77.209,
    severity: "critical",
    title: "Extreme Heatwave",
    description:
      "Record-breaking temperatures are triggering a health emergency. Heat stress risk is elevated, especially for vulnerable populations and outdoor workers.",
    timestamp: new Date("2026-01-30T11:00:00Z"),
    temperature: 48,
    humidity: 35,
    affectedArea: 800,
    affectedPopulation: 20000000,
    riskIndicators: ["Heat exhaustion", "Power grid stress", "Water shortage"],
    satelliteImageUrl: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800",
    status: "active",
    evacuationLevel: "none",
    nearbyInfrastructure: ["Urban districts", "Hospitals", "Power grid"],
    ecosystems: ["Urban heat islands"],
    speciesAtRisk: ["Urban wildlife"],
    aiInsight: {
      probabilityNext12h: 55,
      narrative:
        "BioPulse projects sustained extreme heat in the next 12 hours. Focus on hydration guidance and power demand management.",
      recommendations: ["Issue hydration advisories", "Monitor grid demand", "Open cooling centers"],
    },
  },
  {
    id: "5",
    category: "air-pollution",
    location: "Beijing, China",
    latitude: 39.9042,
    longitude: 116.4074,
    severity: "high",
    title: "Severe Air Quality Crisis",
    description:
      "Air quality levels are hazardous. Reduced visibility and elevated particulate concentrations increase respiratory risk across the metropolitan area.",
    timestamp: new Date("2026-01-30T09:30:00Z"),
    temperature: 8,
    humidity: 45,
    airQualityIndex: 387,
    affectedArea: 1200,
    affectedPopulation: 21000000,
    riskIndicators: ["Respiratory hazard", "Visibility < 200m", "School closures"],
    satelliteImageUrl: "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=800",
    status: "stabilizing",
    evacuationLevel: "none",
    nearbyInfrastructure: ["Urban core", "Schools", "Hospitals"],
    ecosystems: ["Urban air basin"],
    speciesAtRisk: ["Bird populations (urban)"],
    aiInsight: {
      probabilityNext12h: 44,
      narrative:
        "BioPulse indicates a moderate chance of improvement if wind dispersal increases. Avoid outdoor activity until AQI drops.",
      recommendations: ["Limit outdoor exposure", "Promote mask usage", "Monitor AQI hourly"],
    },
  },
  {
    id: "6",
    category: "ocean-anomaly",
    location: "Great Barrier Reef, Australia",
    latitude: -18.2871,
    longitude: 147.6992,
    severity: "high",
    title: "Coral Bleaching Event",
    description:
      "Elevated sea surface temperatures are causing widespread coral stress. Bleaching risk is high across sensitive reef zones.",
    timestamp: new Date("2026-01-30T06:00:00Z"),
    temperature: 32,
    affectedArea: 3500,
    riskIndicators: ["Marine ecosystem stress", "Temperature anomaly +3°C", "Biodiversity loss"],
    satelliteImageUrl: "https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=800",
    status: "active",
    evacuationLevel: "none",
    nearbyInfrastructure: ["Marine protected areas"],
    ecosystems: ["Coral reef"],
    speciesAtRisk: ["Corals", "Reef fish"],
    aiInsight: {
      probabilityNext12h: 49,
      narrative:
        "BioPulse expects continued thermal stress over the next 12 hours. Prioritize reef monitoring and temperature anomaly tracking.",
      recommendations: ["Track SST anomalies", "Increase observation frequency", "Coordinate with marine teams"],
    },
  },
];
