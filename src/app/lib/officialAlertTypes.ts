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
};

export type OfficialAlertsResponse = {
  provider: "GDACS";
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
  fallback?: "gdacs_rss";
  attributionText: string;
  sourceUrl: string;
  apiSourceUrl?: string;
  limitations: string[];
  fetchedAt: string;
};
