import type { EnvironmentalEvent } from "@/data/events";
import type {
  EcosystemContextResponse,
  ProtectedContextResponse,
  WaterContextResponse,
} from "@/app/lib/contextObservationTypes";
import type { Observation, ObservationLocation } from "@/app/lib/observations";

const ADAPTER_ID = "biopulse.environmental-context-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function observedAtFor(event: EnvironmentalEvent) {
  return validIso(event.lastSeen) ?? validIso(event.timestamp) ?? new Date(0).toISOString();
}

function eventLocation(event: EnvironmentalEvent): ObservationLocation {
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);

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

export function protectedContextToObservation(args: {
  event: EnvironmentalEvent;
  context: ProtectedContextResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.context) return null;

  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const areas = Array.isArray(args.context.areas) ? args.context.areas : [];
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "protectedAreaCount", areas.length);
  addMeasurement(measurements, "radiusKm", args.context.radiusKm);
  addMeasurement(measurements, "sourceName", args.context.source.name);

  return {
    schema: "biopulse.observation.v1",
    id: `protected-context:${eventIdentity(args.event)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "nearby_context",
    },
    type: "environmental_context",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: args.context.source.name,
    },
    source: {
      id: "protected-planet-context",
      name: "Contexto de áreas protegidas",
      provider: args.context.source.name,
      url: args.context.source.licenseUrl,
      attribution: args.context.source.attribution,
    },
    timestamp: {
      observedAt: observedAtFor(args.event),
      recordedAt: normalizedAt,
    },
    location: eventLocation(args.event),
    evidence: {
      summary:
        areas.length > 0
          ? `${areas.length} área${areas.length === 1 ? "" : "s"} protegida${
              areas.length === 1 ? "" : "s"
            } cercana${areas.length === 1 ? "" : "s"} al evento.`
          : "No se detectaron áreas protegidas cercanas en la fuente conectada.",
      artifacts: areas
        .slice(0, 5)
        .map((area) => ({ kind: "link" as const, url: area.sourceUrl, label: area.name }))
        .filter((item) => Boolean(item.url)),
      measurements,
      limitations: [
        "Contexto ambiental cercano al evento; no confirma impacto directo sobre el área protegida.",
        "La cobertura depende de la fuente conectada y puede estar incompleta o desactualizada.",
      ],
    },
    raw: {
      providerPayload: args.context,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: "medium",
      basis: "direct_measurement",
      notes: "Contexto geográfico consultado en fuente externa abierta; requiere validación local para impacto directo.",
    },
    provenance: {
      chain: ["protected_context", args.context.source.name, ADAPTER_ID],
      fetchedBy: args.context.source.name,
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
      caution: "Usar como contexto de lo que podría protegerse; no presentar como daño ambiental confirmado.",
    },
  };
}

export function waterContextToObservation(args: {
  event: EnvironmentalEvent;
  context: WaterContextResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.context) return null;

  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const resources = Array.isArray(args.context.resources) ? args.context.resources : [];
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "waterResourceCount", resources.length);
  addMeasurement(measurements, "radiusKm", args.context.radiusKm);
  addMeasurement(measurements, "sourceName", args.context.source.name);

  return {
    schema: "biopulse.observation.v1",
    id: `water-context:${eventIdentity(args.event)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "nearby_context",
    },
    type: "environmental_context",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: args.context.source.name,
    },
    source: {
      id: "water-context",
      name: "Contexto hídrico cercano",
      provider: args.context.source.name,
      url: args.context.source.attributionUrl,
      attribution: args.context.source.attribution,
    },
    timestamp: {
      observedAt: observedAtFor(args.event),
      recordedAt: normalizedAt,
    },
    location: eventLocation(args.event),
    evidence: {
      summary:
        resources.length > 0
          ? `${resources.length} recurso${resources.length === 1 ? "" : "s"} hídrico${
              resources.length === 1 ? "" : "s"
            } cercano${resources.length === 1 ? "" : "s"} al evento.`
          : "No se detectaron recursos hídricos cercanos en la fuente conectada.",
      artifacts: resources
        .slice(0, 5)
        .map((resource) => ({ kind: "link" as const, url: resource.mapUrl, label: resource.name }))
        .filter((item) => Boolean(item.url)),
      measurements,
      limitations: [
        "Contexto hídrico cercano; no confirma contaminación, afectación ni cambio de caudal.",
        "La presencia de recursos depende de la fuente abierta consultada y puede no representar todos los cuerpos de agua.",
      ],
    },
    raw: {
      providerPayload: args.context,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: "medium",
      basis: "direct_measurement",
      notes: "Contexto de recursos hídricos consultado en fuente abierta; requiere verificación local para impacto directo.",
    },
    provenance: {
      chain: ["water_context", args.context.source.name, ADAPTER_ID],
      fetchedBy: args.context.source.name,
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
      caution: "Usar como contexto ambiental; no presentar como daño hídrico confirmado.",
    },
  };
}

export function ecosystemContextToObservation(args: {
  event: EnvironmentalEvent;
  context: EcosystemContextResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.context) return null;

  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const features = Array.isArray(args.context.features) ? args.context.features : [];
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "ecosystemFeatureCount", features.length);
  addMeasurement(measurements, "radiusKm", args.context.radiusKm);
  addMeasurement(measurements, "sourceName", args.context.source.name);

  return {
    schema: "biopulse.observation.v1",
    id: `ecosystem-context:${eventIdentity(args.event)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "nearby_context",
    },
    type: "environmental_context",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: args.context.source.name,
    },
    source: {
      id: "ecosystem-context",
      name: "Coberturas ambientales cercanas",
      provider: args.context.source.name,
      url: args.context.source.attributionUrl,
      attribution: args.context.source.attribution,
    },
    timestamp: {
      observedAt: observedAtFor(args.event),
      recordedAt: normalizedAt,
    },
    location: eventLocation(args.event),
    evidence: {
      summary:
        features.length > 0
          ? `${features.length} cobertura${features.length === 1 ? "" : "s"} ambiental${features.length === 1 ? "" : "es"} cartografiada${features.length === 1 ? "" : "s"} cerca del evento.`
          : "No se detectaron coberturas ambientales cercanas en la fuente conectada.",
      artifacts: features
        .slice(0, 5)
        .map((feature) => ({ kind: "link" as const, url: feature.sourceUrl, label: feature.name }))
        .filter((item) => Boolean(item.url)),
      measurements,
      limitations: [
        "Contexto ambiental cartográfico; no confirma ecosistema científico, estado ecológico, daño ni exposición directa.",
        "La cobertura depende de la fuente abierta consultada y puede estar incompleta o desactualizada.",
      ],
    },
    raw: {
      providerPayload: args.context,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: "medium",
      basis: "direct_measurement",
      notes: "Coberturas ambientales cercanas consultadas en fuente abierta; requiere fuente ecológica o validación local para clasificación científica.",
    },
    provenance: {
      chain: ["ecosystem_context", args.context.source.name, ADAPTER_ID],
      fetchedBy: args.context.source.name,
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
      caution: "Usar como contexto ambiental cartográfico; no presentar como daño ecológico confirmado.",
    },
  };
}

export function environmentalContextsToObservations(args: {
  event: EnvironmentalEvent;
  ecosystemContext?: EcosystemContextResponse | null;
  protectedContext?: ProtectedContextResponse | null;
  waterContext?: WaterContextResponse | null;
  normalizedAt?: string;
}): Observation[] {
  return [
    ecosystemContextToObservation({
      event: args.event,
      context: args.ecosystemContext ?? null,
      normalizedAt: args.normalizedAt,
    }),
    protectedContextToObservation({
      event: args.event,
      context: args.protectedContext ?? null,
      normalizedAt: args.normalizedAt,
    }),
    waterContextToObservation({
      event: args.event,
      context: args.waterContext ?? null,
      normalizedAt: args.normalizedAt,
    }),
  ].filter((observation): observation is Observation => Boolean(observation));
}
