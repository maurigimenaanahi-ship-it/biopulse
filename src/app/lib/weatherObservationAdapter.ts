import type { EnvironmentalEvent } from "@/data/events";
import type { Observation, ObservationLocation } from "@/app/lib/observations";
import type { WeatherCurrent } from "@/app/lib/weatherTypes";

const ADAPTER_ID = "biopulse.weather-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function fallbackObservedAt(event: EnvironmentalEvent) {
  return validIso(event.timestamp) ?? new Date(0).toISOString();
}

function addMeasurement(target: Record<string, MeasurementValue>, key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) target[key] = value;
    return;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    target[key] = value;
  }
}

function locationForEvent(event: EnvironmentalEvent): ObservationLocation {
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { kind: "unknown", precision: "unknown" };
  }

  return {
    kind: "point",
    latitude,
    longitude,
    precision: "approximate",
  };
}

function summaryFor(weather: WeatherCurrent, event: EnvironmentalEvent) {
  const parts = [
    weather.temperature_2m != null ? `${weather.temperature_2m.toFixed(1)}°C` : null,
    weather.relative_humidity_2m != null ? `${weather.relative_humidity_2m.toFixed(0)}% humedad` : null,
    weather.wind_speed_10m != null ? `viento ${weather.wind_speed_10m.toFixed(0)} km/h` : null,
    weather.precipitation != null ? `precipitación ${weather.precipitation.toFixed(1)} mm` : null,
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0
    ? `Condiciones meteorológicas actuales cerca de ${event.location}: ${parts.join(", ")}.`
    : `Condiciones meteorológicas actuales cerca de ${event.location}.`;
}

export function weatherCurrentToObservation(args: {
  event: EnvironmentalEvent;
  weather: WeatherCurrent | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.weather) return null;

  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const observedAt = validIso(args.weather.time) ?? fallbackObservedAt(args.event);
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "temperature_2m_c", args.weather.temperature_2m);
  addMeasurement(measurements, "relative_humidity_2m_pct", args.weather.relative_humidity_2m);
  addMeasurement(measurements, "precipitation_mm", args.weather.precipitation);
  addMeasurement(measurements, "wind_speed_10m_kmh", args.weather.wind_speed_10m);
  addMeasurement(measurements, "wind_direction_10m_deg", args.weather.wind_direction_10m);
  addMeasurement(measurements, "time", args.weather.time);

  return {
    schema: "biopulse.observation.v1",
    id: `weather:${eventIdentity(args.event)}:${observedAt}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "nearby_context",
    },
    type: "weather_reading",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: "Open-Meteo",
    },
    source: {
      id: "open-meteo",
      name: "Open-Meteo",
      provider: "Open-Meteo",
      url: "https://open-meteo.com/",
      attribution: "Weather data by Open-Meteo.",
    },
    timestamp: {
      observedAt,
      recordedAt: normalizedAt,
    },
    location: locationForEvent(args.event),
    evidence: {
      summary: summaryFor(args.weather, args.event),
      artifacts: [{ kind: "link", url: "https://open-meteo.com/", label: "Fuente Open-Meteo" }],
      measurements,
      limitations: [
        "Lectura meteorológica contextual cercana al evento; no confirma causa, daño ni evolución del evento por sí sola.",
      ],
    },
    raw: {
      providerPayload: args.weather,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: "medium",
      basis: "direct_measurement",
      notes: "Dato meteorológico automatizado de una fuente abierta; requiere contexto local para interpretación operacional.",
    },
    provenance: {
      chain: ["open_meteo", ADAPTER_ID],
      fetchedBy: "open_meteo",
      transformedBy: ADAPTER_ID,
      attributionRequired: true,
    },
    status: "recorded",
    verification: {
      status: "source_reviewed",
    },
    narrativeUse: {
      eligible: true,
      role: "context",
      caution: "Usar como contexto ambiental; no presentar como explicación causal ni confirmación oficial.",
    },
  };
}
