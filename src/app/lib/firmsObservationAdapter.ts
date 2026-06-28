import type { EnvironmentalEvent, FireSatelliteObservation } from "@/data/events";
import type {
  Observation,
  ObservationConfidence,
  ObservationLocation,
  ObservationRelation,
  ObservationStatus,
} from "@/app/lib/observations";

const ADAPTER_ID = "biopulse.firms-observation-adapter.v1";
const SOURCE_ID = "nasa-firms";
const SOURCE_NAME = "NASA FIRMS";

type MeasurementValue = number | string | boolean | null;

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function fallbackObservedAt(event: EnvironmentalEvent) {
  return validIso(event.lastSeen) ?? validIso(event.timestamp) ?? new Date(0).toISOString();
}

function firmsAcquisitionIso(obs: FireSatelliteObservation, fallback: string) {
  const date = typeof obs.acq_date === "string" ? obs.acq_date.trim() : "";
  const time = typeof obs.acq_time === "string" ? obs.acq_time.trim().padStart(4, "0") : "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{4}$/.test(time)) {
    const iso = `${date}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`;
    return validIso(iso) ?? fallback;
  }

  return fallback;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function confidenceFor(value: string | undefined): ObservationConfidence {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "h" || normalized === "high") {
    return {
      level: "high",
      basis: "direct_measurement",
      notes: "Detección instrumental FIRMS con confianza alta informada por la fuente.",
    };
  }

  if (normalized === "n" || normalized === "nominal" || normalized === "medium") {
    return {
      level: "medium",
      basis: "direct_measurement",
      notes: "Detección instrumental FIRMS con confianza nominal/media informada por la fuente.",
    };
  }

  if (normalized === "l" || normalized === "low") {
    return {
      level: "low",
      basis: "direct_measurement",
      notes: "Detección instrumental FIRMS con confianza baja informada por la fuente.",
    };
  }

  return {
    level: "unknown",
    basis: "direct_measurement",
    notes: "Detección instrumental FIRMS sin confianza normalizada disponible.",
  };
}

function eventStatusFor(event: EnvironmentalEvent): ObservationStatus {
  if (event.stale) return "stale";
  if (event.status === "resolved" || event.status === "contained") return "archived";
  return "active";
}

function locationForDetection(obs: FireSatelliteObservation): ObservationLocation {
  const latitude = finiteNumber(obs.latitude);
  const longitude = finiteNumber(obs.longitude);

  if (latitude == null || longitude == null) {
    return { kind: "unknown", precision: "unknown" };
  }

  return {
    kind: "point",
    latitude,
    longitude,
    precision: "approximate",
  };
}

function locationForEvent(event: EnvironmentalEvent): ObservationLocation {
  const latitude = finiteNumber(event.latitude);
  const longitude = finiteNumber(event.longitude);

  if (latitude == null || longitude == null) {
    return { kind: "unknown", precision: "unknown" };
  }

  return {
    kind: "event_area",
    latitude,
    longitude,
    precision: "approximate",
  };
}

function sourceUrlFor(event: EnvironmentalEvent) {
  return event.liveFeedUrl || undefined;
}

function detectionObservationId(event: EnvironmentalEvent, obs: FireSatelliteObservation, index: number) {
  const eventId = event.eventId || event.id;
  return `firms:${eventId}:${obs.id || index}`;
}

function summaryObservationId(event: EnvironmentalEvent) {
  return `firms-summary:${event.eventId || event.id}`;
}

function sourceChain(event: EnvironmentalEvent) {
  return [
    SOURCE_ID,
    event.satelliteSource?.provider || "NASA",
    event.satelliteSource?.product || "FIRMS",
    ADAPTER_ID,
  ];
}

export function firmsDetectionToObservation(
  event: EnvironmentalEvent,
  detection: FireSatelliteObservation,
  index = 0,
  options: { relation?: ObservationRelation; normalizedAt?: string } = {}
): Observation {
  const normalizedAt = options.normalizedAt ?? new Date().toISOString();
  const observedAt = firmsAcquisitionIso(detection, fallbackObservedAt(event));
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "frp", detection.frp);
  addMeasurement(measurements, "confidence", detection.confidence);
  addMeasurement(measurements, "bright_ti4", detection.bright_ti4);
  addMeasurement(measurements, "bright_ti5", detection.bright_ti5);
  addMeasurement(measurements, "daynight", detection.daynight);
  addMeasurement(measurements, "satellite", detection.satellite);
  addMeasurement(measurements, "instrument", detection.instrument);
  addMeasurement(measurements, "version", detection.version);

  return {
    schema: "biopulse.observation.v1",
    id: detectionObservationId(event, detection, index),
    relatedEvent: {
      eventId: event.eventId || event.id,
      category: event.category,
      relation: options.relation ?? "updates_event",
    },
    type: "satellite_detection",
    origin: {
      kind: "automated",
      actorType: "sensor",
      displayName: "NASA FIRMS / VIIRS",
    },
    source: {
      id: SOURCE_ID,
      name: SOURCE_NAME,
      provider: detection.satellite || event.satelliteSource?.provider || "NASA",
      url: sourceUrlFor(event),
      attribution: "NASA FIRMS / VIIRS cuando esté disponible.",
    },
    timestamp: {
      observedAt,
      receivedAt: event.satelliteSource?.fetchedAt,
      recordedAt: normalizedAt,
    },
    location: locationForDetection(detection),
    evidence: {
      summary: `Detección satelital FIRMS asociada a ${event.location}.`,
      artifacts: event.liveFeedUrl
        ? [{ kind: "link", url: event.liveFeedUrl, label: "Abrir observación FIRMS/NASA" }]
        : undefined,
      measurements: Object.keys(measurements).length > 0 ? measurements : undefined,
      limitations: [
        "Una detección FIRMS indica una anomalía térmica observada por satélite; no describe por sí sola el perímetro completo ni el impacto humano.",
      ],
    },
    raw: {
      providerPayload: detection,
      rawRef: event.satelliteSource?.product,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: confidenceFor(detection.confidence),
    provenance: {
      chain: sourceChain(event),
      fetchedBy: event.satelliteSource?.provider,
      transformedBy: ADAPTER_ID,
      attributionRequired: true,
    },
    status: eventStatusFor(event),
    verification: {
      status: "source_reviewed",
    },
    narrativeUse: {
      eligible: true,
      role: options.relation === "detects_event" ? "first_detection" : "escalation",
      caution: "Usar como evidencia instrumental de anomalía térmica, no como confirmación oficial de daños o evacuaciones.",
    },
  };
}

export function firmsEventSummaryToObservation(
  event: EnvironmentalEvent,
  options: { normalizedAt?: string } = {}
): Observation | null {
  const hasSummaryEvidence =
    Number.isFinite(event.focusCount) || Number.isFinite(event.frpMax) || Number.isFinite(event.frpSum);

  if (!hasSummaryEvidence) return null;

  const normalizedAt = options.normalizedAt ?? new Date().toISOString();
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "focusCount", event.focusCount);
  addMeasurement(measurements, "frpMax", event.frpMax);
  addMeasurement(measurements, "frpSum", event.frpSum);
  addMeasurement(measurements, "scanCount", event.scanCount);
  addMeasurement(measurements, "stale", event.stale ?? null);
  addMeasurement(measurements, "sourceProduct", event.satelliteSource?.product);
  addMeasurement(measurements, "sourceBbox", event.satelliteSource?.bbox);

  return {
    schema: "biopulse.observation.v1",
    id: summaryObservationId(event),
    relatedEvent: {
      eventId: event.eventId || event.id,
      category: event.category,
      relation: "detects_event",
    },
    type: "satellite_detection",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: "NASA FIRMS",
    },
    source: {
      id: SOURCE_ID,
      name: SOURCE_NAME,
      provider: event.satelliteSource?.provider || "NASA",
      url: sourceUrlFor(event),
      attribution: "NASA FIRMS / VIIRS cuando esté disponible.",
    },
    timestamp: {
      observedAt: fallbackObservedAt(event),
      receivedAt: event.satelliteSource?.fetchedAt,
      recordedAt: normalizedAt,
    },
    location: locationForEvent(event),
    evidence: {
      summary: `Resumen instrumental FIRMS para ${event.location}.`,
      artifacts: event.liveFeedUrl
        ? [{ kind: "link", url: event.liveFeedUrl, label: "Abrir visor FIRMS/NASA" }]
        : undefined,
      measurements,
      limitations: [
        "Resumen derivado de detecciones satelitales agregadas por BioPulse; no reemplaza una evaluación oficial en terreno.",
      ],
    },
    raw: {
      providerPayload: {
        focusCount: event.focusCount,
        frpMax: event.frpMax,
        frpSum: event.frpSum,
        satelliteSource: event.satelliteSource,
      },
      rawRef: event.satelliteSource?.product,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: "medium",
      basis: "direct_measurement",
      notes: "Resumen agregado desde mediciones instrumentales disponibles en el evento.",
    },
    provenance: {
      chain: sourceChain(event),
      fetchedBy: event.satelliteSource?.provider,
      transformedBy: ADAPTER_ID,
      attributionRequired: true,
    },
    status: eventStatusFor(event),
    verification: {
      status: "source_reviewed",
    },
    narrativeUse: {
      eligible: true,
      role: "first_detection",
      caution: "Usar como contexto instrumental; no presentar como orden oficial ni como evaluación de daños.",
    },
  };
}

export function eventToFirmsObservations(
  event: EnvironmentalEvent,
  options: { normalizedAt?: string } = {}
): Observation[] {
  const normalizedAt = options.normalizedAt ?? new Date().toISOString();
  const detections = Array.isArray(event.satelliteObservations) ? event.satelliteObservations : [];
  const observations = detections.map((detection, index) =>
    firmsDetectionToObservation(event, detection, index, {
      normalizedAt,
      relation: index === 0 ? "detects_event" : "updates_event",
    })
  );
  const summary = firmsEventSummaryToObservation(event, { normalizedAt });

  return summary ? [summary, ...observations] : observations;
}
