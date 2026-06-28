import type { EnvironmentalEvent } from "@/data/events";
import type {
  AccessRoutesResponse,
  CriticalInfrastructureResponse,
  NearbyCommunitiesResponse,
} from "@/app/lib/contextObservationTypes";
import type { Observation, ObservationLocation } from "@/app/lib/observations";

const ADAPTER_ID = "biopulse.human-context-observation-adapter.v1";

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

export function criticalInfrastructureToObservation(args: {
  event: EnvironmentalEvent;
  context: CriticalInfrastructureResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.context) return null;

  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const facilities = Array.isArray(args.context.facilities) ? args.context.facilities : [];
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "facilityCount", facilities.length);
  addMeasurement(
    measurements,
    "healthcareCount",
    facilities.filter((facility) => facility.category === "healthcare").length
  );
  addMeasurement(
    measurements,
    "schoolCount",
    facilities.filter((facility) => facility.category === "school").length
  );
  addMeasurement(
    measurements,
    "fireStationCount",
    facilities.filter((facility) => facility.category === "fire_station").length
  );
  addMeasurement(
    measurements,
    "shelterCount",
    facilities.filter((facility) => facility.category === "shelter").length
  );
  addMeasurement(measurements, "radiusKm", args.context.radiusKm);

  return {
    schema: "biopulse.observation.v1",
    id: `critical-infrastructure:${eventIdentity(args.event)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "impact_context",
    },
    type: "infrastructure_context",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: args.context.source.name,
    },
    source: {
      id: "critical-infrastructure-context",
      name: "Infraestructura crítica cercana",
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
        facilities.length > 0
          ? `${facilities.length} punto${facilities.length === 1 ? "" : "s"} de infraestructura crítica cercano${
              facilities.length === 1 ? "" : "s"
            } al evento.`
          : "No se detectaron puntos de infraestructura crítica cercanos en la fuente conectada.",
      artifacts: facilities
        .slice(0, 5)
        .map((facility) => ({ kind: "link" as const, url: facility.mapUrl, label: facility.name }))
        .filter((item) => Boolean(item.url)),
      measurements,
      limitations: [
        "Contexto de proximidad; no confirma afectación, evacuación, disponibilidad operativa ni necesidad de asistencia.",
        "La fuente abierta puede estar incompleta o desactualizada.",
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
      notes: "Contexto geográfico de infraestructura; requiere verificación oficial/local para impacto real.",
    },
    provenance: {
      chain: ["critical_infrastructure_context", args.context.source.name, ADAPTER_ID],
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
      role: "impact",
      caution: "Usar como contexto de exposición humana potencial; no presentar como daño o evacuación confirmada.",
    },
  };
}

export function nearbyCommunitiesToObservation(args: {
  event: EnvironmentalEvent;
  context: NearbyCommunitiesResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.context) return null;

  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const communities = Array.isArray(args.context.communities) ? args.context.communities : [];
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "communityCount", communities.length);
  addMeasurement(measurements, "radiusKm", args.context.radiusKm);
  addMeasurement(measurements, "sourceName", args.context.source.name);

  return {
    schema: "biopulse.observation.v1",
    id: `nearby-communities:${eventIdentity(args.event)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "impact_context",
    },
    type: "community_context",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: args.context.source.name,
    },
    source: {
      id: "nearby-communities-context",
      name: "Comunidades cercanas",
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
        communities.length > 0
          ? `${communities.length} comunidad${communities.length === 1 ? "" : "es"} cercana${
              communities.length === 1 ? "" : "s"
            } al evento.`
          : "No se detectaron comunidades cercanas en la fuente conectada.",
      artifacts: communities
        .slice(0, 5)
        .map((community) => ({ kind: "link" as const, url: community.mapUrl, label: community.name }))
        .filter((item) => Boolean(item.url)),
      measurements,
      limitations: [
        "Contexto de comunidades cercanas; no confirma población afectada, evacuación ni solicitudes de ayuda.",
        "Las comunidades listadas dependen de la fuente abierta consultada.",
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
      notes: "Contexto geográfico de comunidades cercanas; requiere verificación local para exposición o impacto real.",
    },
    provenance: {
      chain: ["nearby_communities_context", args.context.source.name, ADAPTER_ID],
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
      role: "impact",
      caution: "Usar como contexto humano potencial; no presentar como población afectada confirmada.",
    },
  };
}

export function accessRoutesToObservation(args: {
  event: EnvironmentalEvent;
  context: AccessRoutesResponse | null;
  normalizedAt?: string;
}): Observation | null {
  if (!args.context) return null;

  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const routes = Array.isArray(args.context.routes) ? args.context.routes : [];
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "routeCount", routes.length);
  addMeasurement(measurements, "radiusKm", args.context.radiusKm);
  addMeasurement(measurements, "sourceName", args.context.source.name);

  return {
    schema: "biopulse.observation.v1",
    id: `access-routes:${eventIdentity(args.event)}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "impact_context",
    },
    type: "infrastructure_context",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: args.context.source.name,
    },
    source: {
      id: "road-access-context",
      name: "Rutas y accesos cercanos",
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
        routes.length > 0
          ? `${routes.length} ruta${routes.length === 1 ? "" : "s"} o acceso${routes.length === 1 ? "" : "s"} cartografiado${routes.length === 1 ? "" : "s"} cerca del evento.`
          : "No se detectaron rutas o accesos principales en la fuente conectada.",
      artifacts: routes
        .slice(0, 5)
        .map((route) => ({ kind: "link" as const, url: route.sourceUrl, label: route.name }))
        .filter((item) => Boolean(item.url)),
      measurements,
      limitations: [
        "Contexto vial cartografiado; no confirma cortes, transitabilidad, congestión, evacuación ni estado operativo.",
        "La fuente abierta puede estar incompleta o desactualizada.",
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
      notes: "Contexto geográfico de rutas cercanas; requiere fuente oficial o verificación local para estado real de acceso.",
    },
    provenance: {
      chain: ["road_access_context", args.context.source.name, ADAPTER_ID],
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
      role: "impact",
      caution: "Usar como contexto vial potencial; no presentar como corte, evacuación ni vía segura confirmada.",
    },
  };
}

export function humanContextsToObservations(args: {
  event: EnvironmentalEvent;
  criticalInfrastructure?: CriticalInfrastructureResponse | null;
  nearbyCommunities?: NearbyCommunitiesResponse | null;
  accessRoutes?: AccessRoutesResponse | null;
  normalizedAt?: string;
}): Observation[] {
  return [
    criticalInfrastructureToObservation({
      event: args.event,
      context: args.criticalInfrastructure ?? null,
      normalizedAt: args.normalizedAt,
    }),
    nearbyCommunitiesToObservation({
      event: args.event,
      context: args.nearbyCommunities ?? null,
      normalizedAt: args.normalizedAt,
    }),
    accessRoutesToObservation({
      event: args.event,
      context: args.accessRoutes ?? null,
      normalizedAt: args.normalizedAt,
    }),
  ].filter((observation): observation is Observation => Boolean(observation));
}
