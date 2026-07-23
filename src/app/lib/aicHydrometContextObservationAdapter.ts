import type { EnvironmentalEvent } from "@/data/events";
import type { Observation, ObservationLocation } from "@/app/lib/observations";
import type { AicHydrometContextResponse } from "@/app/lib/aicHydrometContextTypes";

const ADAPTER_ID = "biopulse.aic-hydromet-context-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function locationForContext(context: AicHydrometContextResponse): ObservationLocation {
  const latitude = Number(context.query.lat);
  const longitude = Number(context.query.lon);

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

function summaryFor(event: EnvironmentalEvent, context: AicHydrometContextResponse) {
  const nearest = context.nearestStations[0];
  const stationText = nearest ? ` Estacion cercana: ${nearest.name}, a ${nearest.distanceKm.toFixed(1)} km.` : "";
  return `AIC queda disponible como contexto hidrometeorologico oficial para ${event.location}; alcance sugerido: ${context.query.scopeLabel}.${stationText}`;
}

export function aicHydrometContextToObservation(args: {
  event: EnvironmentalEvent;
  context: AicHydrometContextResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.context || args.context.status !== "ok") return null;

  const context = args.context;
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const observedAt =
    validIso(context.fetchedAt) ??
    validIso(args.event.lastSeen) ??
    validIso(args.event.timestamp) ??
    new Date(0).toISOString();
  const linkedProducts = context.products.filter((product) => product.status === "linked");
  const manualProducts = context.products.filter((product) => product.status !== "linked");
  const measurements: Record<string, MeasurementValue> = {};
  const nearest = context.nearestStations[0] ?? null;

  addMeasurement(measurements, "scopeLabel", context.query.scopeLabel);
  addMeasurement(measurements, "linkedProducts", linkedProducts.length);
  addMeasurement(measurements, "manualOrLimitedProducts", manualProducts.length);
  addMeasurement(measurements, "nearestStation", nearest?.name);
  addMeasurement(measurements, "nearestStationDistanceKm", nearest?.distanceKm);
  addMeasurement(measurements, "nearestStationBasin", nearest?.basin);

  const productArtifacts = context.products.slice(0, 4).map((product) => ({
    kind: "link" as const,
    url: product.sourceUrl,
    label: `${product.label} (${product.status})`,
  }));
  const stationArtifacts = context.nearestStations.slice(0, 2).map((station) => ({
    kind: "link" as const,
    url: station.sourceUrl,
    label: `${station.name} (${station.distanceKm.toFixed(1)} km)`,
  }));

  return {
    schema: "biopulse.observation.v1",
    id: `aic-hydromet-context:${eventIdentity(args.event)}:${observedAt.slice(0, 10)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "nearby_context",
    },
    type: "official_reference",
    origin: {
      kind: "official",
      actorType: "agency",
      displayName: "Autoridad Interjurisdiccional de Cuencas",
    },
    source: {
      id: "aic-hydromet",
      name: "Autoridad Interjurisdiccional de Cuencas",
      provider: context.attributionText,
      url: context.sourceUrl,
      attribution: context.attributionText,
    },
    timestamp: {
      observedAt,
      receivedAt: validIso(context.fetchedAt) ?? undefined,
      recordedAt: normalizedAt,
    },
    location: locationForContext(context),
    evidence: {
      summary: summaryFor(args.event, context),
      artifacts: [...productArtifacts, ...stationArtifacts],
      measurements,
      limitations: context.limitations,
    },
    raw: {
      providerPayload: context,
      rawRef: context.sourceUrl,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: "high",
      basis: "official_source",
      notes:
        "Fuente oficial regional usada como contexto hidrometeorologico. No representa una orden local ni una alerta operativa parseada automaticamente.",
    },
    provenance: {
      chain: ["aic-hydromet", "official-hydromet-context", ADAPTER_ID],
      fetchedBy: "/api/aic-hydromet-context",
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
        "Usar como contexto hidrometeorologico regional. No narrar como evacuacion, afectacion confirmada ni instruccion operativa.",
    },
  };
}
