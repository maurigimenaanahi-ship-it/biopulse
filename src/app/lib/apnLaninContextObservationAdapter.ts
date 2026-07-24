import type { EnvironmentalEvent } from "@/data/events";
import type { Observation, ObservationLocation } from "@/app/lib/observations";
import type { ApnLaninContextResponse } from "@/app/lib/apnLaninContextTypes";

const ADAPTER_ID = "biopulse.apn-lanin-context-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function locationForContext(context: ApnLaninContextResponse): ObservationLocation {
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

function summaryFor(event: EnvironmentalEvent, context: ApnLaninContextResponse) {
  const nearest = context.nearestAreas[0];
  const nearestText = nearest ? ` Punto APN cercano: ${nearest.name}, a ${nearest.distanceKm.toFixed(1)} km.` : "";
  return `APN Lanin queda disponible como contexto oficial de area protegida para ${event.location}; alcance sugerido: ${context.query.scopeLabel}.${nearestText}`;
}

export function apnLaninContextToObservation(args: {
  event: EnvironmentalEvent;
  context: ApnLaninContextResponse | null;
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
  const nearest = context.nearestAreas[0] ?? null;
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "scopeLabel", context.query.scopeLabel);
  addMeasurement(measurements, "nearestDistanceKm", context.query.nearestDistanceKm);
  addMeasurement(measurements, "inApproximateArea", context.query.inApproximateArea);
  addMeasurement(measurements, "nearestArea", nearest?.name);
  addMeasurement(measurements, "nearestZone", nearest?.zone);
  addMeasurement(measurements, "linkedProducts", linkedProducts.length);
  addMeasurement(measurements, "manualOrArchivedProducts", manualProducts.length);
  addMeasurement(measurements, "fireRestrictionStatus", context.currentFireRestriction.status);
  addMeasurement(measurements, "fireRestrictionValidUntil", context.currentFireRestriction.validUntil);

  const productArtifacts = context.products.slice(0, 5).map((product) => ({
    kind: "link" as const,
    url: product.sourceUrl,
    label: `${product.label} (${product.status})`,
  }));
  const areaArtifacts = context.nearestAreas.slice(0, 2).map((area) => ({
    kind: "link" as const,
    url: area.sourceUrl,
    label: `${area.name} (${area.distanceKm.toFixed(1)} km)`,
  }));

  return {
    schema: "biopulse.observation.v1",
    id: `apn-lanin-context:${eventIdentity(args.event)}:${observedAt.slice(0, 10)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "nearby_context",
    },
    type: "official_reference",
    origin: {
      kind: "official",
      actorType: "agency",
      displayName: "Parque Nacional Lanin",
    },
    source: {
      id: "apn-lanin",
      name: "Parque Nacional Lanin",
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
      artifacts: [...productArtifacts, ...areaArtifacts],
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
        "Fuente oficial nacional usada como contexto de area protegida. No representa una orden local ni un aviso de cierre parseado automaticamente.",
    },
    provenance: {
      chain: ["apn-lanin", "official-protected-area-context", ADAPTER_ID],
      fetchedBy: "/api/apn-lanin-context",
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
        "Usar como contexto oficial de area protegida. No narrar como evacuacion, cierre activo ni afectacion confirmada sin otra fuente vigente.",
    },
  };
}
