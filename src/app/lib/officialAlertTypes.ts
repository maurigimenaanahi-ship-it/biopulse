export type OfficialAlertStatus = "active" | "archived";

export type OfficialAlertRecord = {
  id: string;
  sourceId: string;
  provider: string;
  eventType: string;
  eventTypeLabel: string;
  eventId: string;
  episodeId: string;
  title: string;
  alertLevel: string;
  country: string | null;
  fromDate: string | null;
  toDate: string | null;
  status: OfficialAlertStatus;
  lat: number;
  lon: number;
  distanceKm: number;
  severity: number | null;
  reportUrl: string | null;
  detailsUrl: string | null;
  geometryUrl: string | null;
  isLocalOfficialOrder: boolean;
  senderName?: string | null;
  sender?: string | null;
  urgency?: string | null;
  certainty?: string | null;
  description?: string | null;
  instruction?: string | null;
  areaDesc?: string | null;
};

export type OfficialAlertsResponse = {
  provider: "GDACS" | "Servicio Meteorologico Nacional";
  status: "ok" | "no_nearby_alerts" | "unsupported_category";
  query: {
    lat: number;
    lon: number;
    radiusKm: number;
    days: number;
    category: string;
    eventlist?: string;
  };
  alerts: OfficialAlertRecord[];
  count: number;
  upstreamCount?: number;
  upstreamStatus?: number;
  fetchedCapCount?: number;
  fallback?: "gdacs_rss";
  attributionText: string;
  sourceUrl: string;
  apiSourceUrl?: string;
  limitations: string[];
  fetchedAt: string;
};
