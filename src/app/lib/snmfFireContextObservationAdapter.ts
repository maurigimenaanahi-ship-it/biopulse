import type { EnvironmentalEvent } from "@/data/events";
import type { Observation, ObservationLocation } from "@/app/lib/observations";
import type { SnmfFireContextResponse } from "@/app/lib/snmfFireContextTypes";

const ADAPTER_ID = "biopulse.snmf-fire-context-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function locationForContext(context: SnmfFireContextResponse): ObservationLocation {
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

function summaryFor(event: EnvironmentalEvent, context: SnmfFireContextResponse) {
  const scope = context.query.regionHint || context.query.provinceHint || "Argentina";
  return `SNMF queda disponible como contexto oficial nacional de fuego para ${event.location}; alcance sugerido: ${scope}.`;
}

export function snmfFireContextToObservation(args: {
  event: EnvironmentalEvent;
  context: SnmfFireContextResponse | null;
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

  addMeasurement(measurements, "countryHint", context.query.countryHint);
  addMeasurement(measurements, "provinceHint", context.query.provinceHint);
  addMeasurement(measurements, "regionHint", context.query.regionHint);
  addMeasurement(measurements, "linkedProducts", linkedProducts.length);
  addMeasurement(measurements, "manualOrLimitedProducts", manualProducts.length);

  const artifacts = context.products
    .slice(0, 6)
    .map((product) => ({
      kind: "link" as const,
      url: product.sourceUrl,
      label: `${product.label} (${product.status})`,
    }));

  return {
    schema: "biopulse.observation.v1",
    id: `snmf-fire-context:${eventIdentity(args.event)}:${observedAt.slice(0, 10)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "background",
    },
    type: "official_reference",
    origin: {
      kind: "official",
      actorType: "agency",
      displayName: "Servicio Nacional de Manejo del Fuego",
    },
    source: {
      id: "ar-snmf",
      name: "Servicio Nacional de Manejo del Fuego",
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
      artifacts,
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
        "Fuente oficial nacional usada como contexto de manejo del fuego. No representa una orden local ni un parte operativo parseado automaticamente.",
    },
    provenance: {
      chain: ["ar-snmf", "official-fire-context", ADAPTER_ID],
      fetchedBy: "/api/snmf-fire-context",
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
        "Usar solo como contexto oficial nacional. No narrar como evacuacion, fuego confirmado ni despacho de recursos sin otra fuente.",
    },
  };
}
