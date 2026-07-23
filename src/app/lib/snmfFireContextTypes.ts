export type SnmfProductStatus = "linked" | "manual" | "limited";

export type SnmfProductCategory =
  | "official_home"
  | "daily_report"
  | "fire_danger_map"
  | "monthly_forecast"
  | "occurrence_report"
  | "seasonality"
  | "sinagir_notice";

export type SnmfFireProduct = {
  id: string;
  label: string;
  category: SnmfProductCategory;
  status: SnmfProductStatus;
  sourceUrl: string;
  cadence: string;
  description: string;
  useInBiopulse: "official_context" | "technical_context" | "manual_verification";
};

export type SnmfFireContextResponse = {
  provider: string;
  source: string;
  status: "ok" | "out_of_scope";
  query: {
    lat: number | null;
    lon: number | null;
    countryHint: "AR" | "unknown";
    provinceHint: string | null;
    regionHint: string | null;
    regionHintSource: string;
  };
  products: SnmfFireProduct[];
  attributionText: string;
  sourceUrl: string;
  limitations: string[];
  fetchedAt: string;
};
