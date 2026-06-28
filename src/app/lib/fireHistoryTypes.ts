export type FireHistoryYearSummary = {
  year: number;
  detections: number;
  frpSum: number | null;
  frpMax: number | null;
  latestDetection: string | null;
};

export type FireHistoryResponse = {
  provider: string;
  source: string;
  query: {
    lat: number;
    lon: number;
    radiusKm: number;
    bbox: string;
    years: number;
    sampledMonth: number;
    sampledYears: number[];
  };
  summary: {
    totalDetections: number;
    yearsWithDetections: number;
    peakYear: FireHistoryYearSummary | null;
    latestDetection: string | null;
  };
  years: FireHistoryYearSummary[];
  attributionText: string;
  limitations: string[];
  fetchedAt: string;
};
