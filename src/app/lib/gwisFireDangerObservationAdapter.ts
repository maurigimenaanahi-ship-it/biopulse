import type { EnvironmentalEvent } from "@/data/events";
import type { GwisFireDangerResponse } from "@/app/lib/gwisTypes";
import type { Observation, ObservationLocation } from "@/app/lib/observations";

const ADAPTER_ID = "biopulse.gwis-fire-danger-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function fallbackObservedAt(event: EnvironmentalEvent, danger: GwisFireDangerResponse) {
  return (
    validIso(danger.current?.date) ??
    validIso(danger.fetchedAt) ??
    validIso(event.lastSeen) ??
    validIso(event.timestamp) ??
    new Date(0).toISOString()
  );
}

function locationForDanger(danger: GwisFireDangerResponse): ObservationLocation {
  const latitude = Number(danger.query.lat);
  const longitude = Number(danger.query.lon);

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

function summaryFor(event: EnvironmentalEvent, danger: GwisFireDangerResponse) {
  const current = danger.current;
  if (!current) {
    return `La fuente de peligro meteorologico no devolvio un valor vigente cerca de ${event.location}.`;
  }

  const fwi = current.fwi == null ? "FWI no disponible" : `FWI ${current.fwi.toFixed(1)}`;
  return `La fuente de peligro meteorologico estima peligro de incendio ${current.classLabel.toLowerCase()} cerca de ${event.location} (${fwi}).`;
}

export function gwisFireDangerToObservation(args: {
  event: EnvironmentalEvent;
  danger: GwisFireDangerResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.danger || !args.danger.current) return null;

  const danger = args.danger;
  const current = danger.current;
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const observedAt = fallbackObservedAt(args.event, danger);
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "model", danger.query.model);
  addMeasurement(measurements, "source", danger.source);
  addMeasurement(measurements, "fwi", current.fwi);
  addMeasurement(measurements, "classCode", current.classCode);
  addMeasurement(measurements, "classLabel", current.classLabel);
  addMeasurement(measurements, "ffmc", current.ffmc);
  addMeasurement(measurements, "dmc", current.dmc);
  addMeasurement(measurements, "dc", current.dc);
  addMeasurement(measurements, "isi", current.isi);
  addMeasurement(measurements, "bui", current.bui);
  addMeasurement(measurements, "anomaly", current.anomaly);
  addMeasurement(measurements, "ranking", current.ranking);
  addMeasurement(measurements, "seriesPoints", danger.series.length);

  return {
    schema: "biopulse.observation.v1",
    id: `gwis-fire-danger:${eventIdentity(args.event)}:${current.date}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "nearby_context",
    },
    type: "fire_danger_forecast",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: "Peligro meteorologico",
    },
    source: {
      id: "gwis-fire-danger",
      name: "Peligro meteorologico de incendio",
      provider: danger.attributionText,
      url: danger.sourceUrl,
      license: danger.licenseUrl,
      attribution: danger.attributionText,
    },
    timestamp: {
      observedAt,
      receivedAt: validIso(danger.fetchedAt) ?? undefined,
      recordedAt: normalizedAt,
    },
    location: locationForDanger(danger),
    evidence: {
      summary: summaryFor(args.event, danger),
      artifacts: undefined,
      measurements,
      limitations: danger.limitations,
    },
    raw: {
      providerPayload: danger,
      rawRef: danger.source,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: "medium",
      basis: "official_source",
      notes:
        "Pronostico/modelo de peligro meteorologico de incendio de una fuente cientifica oficial; requiere contraste con condiciones locales y autoridades.",
    },
    provenance: {
      chain: ["gwis", danger.source, ADAPTER_ID],
      fetchedBy: "GWIS/EFFIS",
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
      caution:
        "Usar como contexto de peligro meteorologico. No presentar como incendio confirmado, dano observado ni alerta oficial.",
    },
  };
}
