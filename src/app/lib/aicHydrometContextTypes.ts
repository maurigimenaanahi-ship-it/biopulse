export type AicProductStatus = "linked" | "manual" | "limited";

export type AicProductCategory = "official_home" | "forecast" | "stations" | "station_detail" | "news";

export type AicHydrometProduct = {
  id: string;
  label: string;
  category: AicProductCategory;
  status: AicProductStatus;
  sourceUrl: string;
  cadence: string;
  description: string;
  useInBiopulse: "official_context" | "technical_context" | "manual_verification";
};

export type AicHydrometStation = {
  id: string;
  name: string;
  kind: "hydromet_station" | "meteorological_station" | "river_station";
  lat: number;
  lon: number;
  province: string;
  basin: string;
  sourceUrl: string;
  distanceKm: number;
};

export type AicHydrometContextResponse = {
  provider: string;
  source: string;
  status: "ok" | "out_of_scope";
  query: {
    lat: number | null;
    lon: number | null;
    scopeLabel: string;
    scopeHintSource: string;
  };
  nearestStations: AicHydrometStation[];
  products: AicHydrometProduct[];
  attributionText: string;
  sourceUrl: string;
  limitations: string[];
  fetchedAt: string;
};
