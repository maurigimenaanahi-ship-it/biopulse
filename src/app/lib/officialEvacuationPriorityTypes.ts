export type OfficialEvacuationPriority = {
  id: string;
  sourceAlertId: string;
  sourceId: string;
  provider: string;
  title: string;
  source: string;
  detail?: string;
  lat: number;
  lon: number;
  observedAt: string;
  expiresAt?: string | null;
  reportUrl?: string | null;
  detailsUrl?: string | null;
  areaDesc?: string | null;
  alertLevel?: string | null;
  urgency?: string | null;
  certainty?: string | null;
};

export type OfficialEvacuationPrioritiesResponse = {
  provider: string;
  status: "ok" | "no_active_evacuation_priorities" | "unsupported_country";
  country: string;
  priorities: OfficialEvacuationPriority[];
  count: number;
  upstreamCount?: number;
  fetchedCapCount?: number;
  sourceUrl: string;
  apiSourceUrl?: string;
  attributionText: string;
  limitations: string[];
  fetchedAt: string;
};
