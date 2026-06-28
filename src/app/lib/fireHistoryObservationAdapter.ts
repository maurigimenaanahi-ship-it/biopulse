import type { EnvironmentalEvent } from "@/data/events";
import type { FireHistoryResponse } from "@/app/lib/fireHistoryTypes";
import type { Observation, ObservationLocation } from "@/app/lib/observations";

const ADAPTER_ID = "biopulse.fire-history-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function fallbackObservedAt(event: EnvironmentalEvent, history: FireHistoryResponse) {
  return (
    validIso(history.summary.latestDetection) ??
    validIso(history.fetchedAt) ??
    validIso(event.lastSeen) ??
    validIso(event.timestamp) ??
    new Date(0).toISOString()
  );
}

function locationForHistory(history: FireHistoryResponse): ObservationLocation {
  const latitude = Number(history.query.lat);
  const longitude = Number(history.query.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { kind: "unknown", precision: "unknown" };
  }

  return {
    kind: "event_area",
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

function summaryFor(event: EnvironmentalEvent, history: FireHistoryResponse) {
  const total = history.summary.totalDetections;
  const yearsWithDetections = history.summary.yearsWithDetections;
  const peak = history.summary.peakYear;
  const radius = history.query.radiusKm;

  const peakText = peak
    ? ` El año con más señales en esta muestra fue ${peak.year} (${peak.detections}).`
    : "";

  return `Historial FIRMS multianual cerca de ${event.location}: ${total} señal${
    total === 1 ? "" : "es"
  } térmica${total === 1 ? "" : "s"} en ${yearsWithDetections} de ${
    history.query.years
  } año${history.query.years === 1 ? "" : "s"} consultado${history.query.years === 1 ? "" : "s"} dentro de ${radius} km.${peakText}`;
}

export function fireHistoryToObservation(args: {
  event: EnvironmentalEvent;
  history: FireHistoryResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.history) return null;

  const history = args.history;
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "totalDetections", history.summary.totalDetections);
  addMeasurement(measurements, "yearsWithDetections", history.summary.yearsWithDetections);
  addMeasurement(measurements, "queryYears", history.query.years);
  addMeasurement(measurements, "sampledMonth", history.query.sampledMonth);
  addMeasurement(measurements, "radiusKm", history.query.radiusKm);
  addMeasurement(measurements, "source", history.source);
  addMeasurement(measurements, "peakYear", history.summary.peakYear?.year);
  addMeasurement(measurements, "peakYearDetections", history.summary.peakYear?.detections);
  addMeasurement(measurements, "latestDetection", history.summary.latestDetection);

  return {
    schema: "biopulse.observation.v1",
    id: `firms-history:${eventIdentity(args.event)}:${history.query.sampledMonth}:${history.query.years}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "background",
    },
    type: "environmental_context",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: history.provider || "NASA FIRMS",
    },
    source: {
      id: "nasa-firms-history",
      name: "NASA FIRMS histórico",
      provider: history.provider || "NASA FIRMS",
      attribution: history.attributionText,
    },
    timestamp: {
      observedAt: fallbackObservedAt(args.event, history),
      receivedAt: validIso(history.fetchedAt) ?? undefined,
      recordedAt: normalizedAt,
    },
    location: locationForHistory(history),
    evidence: {
      summary: summaryFor(args.event, history),
      measurements,
      limitations: history.limitations,
    },
    raw: {
      providerPayload: history,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: "medium",
      basis: "direct_measurement",
      notes: "Resumen histórico derivado de señales FIRMS consultadas por BioPulse; es contexto, no confirmación de impacto actual.",
    },
    provenance: {
      chain: ["nasa_firms", history.source, ADAPTER_ID],
      fetchedBy: history.provider,
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
        "Usar como antecedente satelital histórico. No implica que el evento actual tenga la misma causa, escala o impacto.",
    },
  };
}
