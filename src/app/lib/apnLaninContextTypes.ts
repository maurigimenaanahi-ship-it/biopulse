export type ApnProductStatus = "linked" | "manual" | "archived";

export type ApnProductCategory =
  | "official_home"
  | "visit_planning"
  | "protected_area_profile"
  | "access"
  | "map"
  | "activities"
  | "fire_rule";

export type ApnLaninProduct = {
  id: string;
  label: string;
  category: ApnProductCategory;
  status: ApnProductStatus;
  sourceUrl: string;
  description: string;
  useInBiopulse: "official_context" | "protected_area_context" | "manual_verification";
};

export type ApnLaninAreaPoint = {
  id: string;
  name: string;
  zone: "north" | "center" | "south" | "administrative";
  lat: number;
  lon: number;
  sourceUrl: string;
  distanceKm: number;
};

export type ApnLaninFireRestriction = {
  id: string;
  label: string;
  status: "active" | "expired";
  validFrom: string;
  validUntil: string;
  sourceUrl: string;
  description: string;
};

export type ApnLaninContact = {
  address: string;
  phones: string[];
  emails: string[];
  sourceUrl: string;
};

export type ApnLaninContextResponse = {
  provider: string;
  source: string;
  status: "ok" | "out_of_scope";
  query: {
    lat: number | null;
    lon: number | null;
    scopeLabel: string;
    nearestDistanceKm: number | null;
    inApproximateArea: boolean;
    contextRadiusKm: number;
    scopeHintSource: string;
  };
  nearestAreas: ApnLaninAreaPoint[];
  products: ApnLaninProduct[];
  currentFireRestriction: ApnLaninFireRestriction;
  contact: ApnLaninContact;
  attributionText: string;
  sourceUrl: string;
  limitations: string[];
  fetchedAt: string;
};
