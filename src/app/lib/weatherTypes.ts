export type WeatherCurrent = {
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  precipitation: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
  time: string | null;
};

export type WeatherResponse = {
  provider?: string;
  status?: "ok" | "no_data";
  latitude?: number;
  longitude?: number;
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  attributionText?: string;
  sourceUrl?: string;
  fetchedAt?: string;
};
