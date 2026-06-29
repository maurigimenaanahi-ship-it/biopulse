export type GwisFireDangerClass =
  | "low"
  | "moderate"
  | "high"
  | "very_high"
  | "extreme"
  | "very_extreme"
  | "unknown";

export type GwisFireDangerPoint = {
  date: string;
  fwi: number | null;
  classCode: GwisFireDangerClass;
  classLabel: string;
  ffmc: number | null;
  dmc: number | null;
  dc: number | null;
  isi: number | null;
  bui: number | null;
  anomaly: number | null;
  ranking: number | null;
};

export type GwisFireDangerResponse = {
  provider: "GWIS";
  source: string;
  status: "ok" | "no_data";
  query: {
    lat: number;
    lon: number;
    model: string;
    from: string;
    to: string;
  };
  current: GwisFireDangerPoint | null;
  series: GwisFireDangerPoint[];
  attributionText: string;
  sourceUrl: string;
  licenseUrl: string;
  limitations: string[];
  fetchedAt: string;
};

