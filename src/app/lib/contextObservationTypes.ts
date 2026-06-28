export type ProtectedArea = {
  id: string;
  name: string;
  designation: string | null;
  protectClass: string | null;
  operator: string | null;
  website: string | null;
  sourceUrl: string;
};

export type ProtectedContextResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  areas: ProtectedArea[];
  source: { name: string; attribution: string; licenseUrl: string };
  interpretation: string;
};

export type CriticalFacility = {
  id: string;
  category: "healthcare" | "fire_station" | "shelter" | "school";
  name: string;
  address: string | null;
  distanceKm: number | null;
  lat: number;
  lon: number;
  mapUrl: string;
};

export type CriticalInfrastructureResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  facilities: CriticalFacility[];
  source: { name: string; attribution: string; attributionUrl: string };
  interpretation: string;
};

export type NearbyCommunity = {
  id: string;
  kind: "city" | "town" | "village" | "hamlet" | "municipality" | "township";
  name: string;
  state: string | null;
  country: string | null;
  address: string | null;
  distanceKm: number | null;
  lat: number;
  lon: number;
  mapUrl: string;
};

export type NearbyCommunitiesResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  communities: NearbyCommunity[];
  source: { name: string; attribution: string; attributionUrl: string };
  interpretation: string;
};

export type WaterResource = {
  id: string;
  kind: "river" | "waterbody" | "wetland" | "bay" | "spring";
  name: string;
  state: string | null;
  country: string | null;
  distanceKm: number | null;
  lat: number;
  lon: number;
  mapUrl: string;
};

export type WaterContextResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  resources: WaterResource[];
  source: { name: string; attribution: string; attributionUrl: string };
  interpretation: string;
};
