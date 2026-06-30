import type { EnvironmentalEvent } from "@/data/events";
import type { Observation, ObservationLocation, ObservationStatus } from "@/app/lib/observations";
import type { OfficialAlertRecord, OfficialAlertsResponse } from "@/app/lib/officialAlertTypes";

const ADAPTER_ID = "biopulse.official-alert-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function locationForAlert(alert: OfficialAlertRecord): ObservationLocation {
  const latitude = Number(alert.lat);
  const longitude = Number(alert.lon);

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

function observationStatus(alert: OfficialAlertRecord): ObservationStatus {
  return alert.status === "active" ? "active" : "archived";
}

function summaryFor(event: EnvironmentalEvent, alert: OfficialAlertRecord) {
  const distance = Number.isFinite(alert.distanceKm) ? `${alert.distanceKm.toFixed(1)} km` : "distancia no disponible";
  const country = alert.country ? ` en ${alert.country}` : "";
  return `${alert.provider} registra ${alert.eventTypeLabel.toLowerCase()} nivel ${alert.alertLevel}${country}, a ${distance} de ${event.location}.`;
}

export function officialAlertToObservation(args: {
  event: EnvironmentalEvent;
  alert: OfficialAlertRecord;
  response: OfficialAlertsResponse;
  normalizedAt?: string;
}): Observation {
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const observedAt =
    validIso(args.alert.fromDate) ??
    validIso(args.alert.toDate) ??
    validIso(args.response.fetchedAt) ??
    validIso(args.event.lastSeen) ??
    validIso(args.event.timestamp) ??
    new Date(0).toISOString();
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "eventType", args.alert.eventType);
  addMeasurement(measurements, "eventTypeLabel", args.alert.eventTypeLabel);
  addMeasurement(measurements, "alertLevel", args.alert.alertLevel);
  addMeasurement(measurements, "country", args.alert.country);
  addMeasurement(measurements, "distanceKm", args.alert.distanceKm);
  addMeasurement(measurements, "officialAlertEventId", args.alert.eventId);
  addMeasurement(measurements, "officialAlertEpisodeId", args.alert.episodeId);
  addMeasurement(measurements, "isLocalOfficialOrder", args.alert.isLocalOfficialOrder);
  addMeasurement(measurements, "status", args.alert.status);
  addMeasurement(measurements, "senderName", args.alert.senderName);
  addMeasurement(measurements, "urgency", args.alert.urgency);
  addMeasurement(measurements, "certainty", args.alert.certainty);
  addMeasurement(measurements, "areaDesc", args.alert.areaDesc);

  const artifacts = [
    args.alert.reportUrl ? { kind: "link" as const, url: args.alert.reportUrl, label: "Abrir fuente oficial" } : null,
    args.alert.detailsUrl ? { kind: "link" as const, url: args.alert.detailsUrl, label: "Abrir copia preservada" } : null,
    args.alert.geometryUrl ? { kind: "link" as const, url: args.alert.geometryUrl, label: "Abrir geometria" } : null,
  ].filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact));

  return {
    schema: "biopulse.observation.v1",
    id: `official-alert:${eventIdentity(args.event)}:${args.alert.id}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "official_status",
    },
    type: "official_alert",
    origin: {
      kind: "official",
      actorType: "agency",
      displayName: args.alert.provider,
    },
    source: {
      id: args.alert.sourceId,
      name: args.alert.provider,
      provider: args.response.attributionText,
      url: args.alert.reportUrl ?? args.response.sourceUrl,
      attribution: args.response.attributionText,
    },
    timestamp: {
      observedAt,
      receivedAt: validIso(args.response.fetchedAt) ?? undefined,
      recordedAt: normalizedAt,
    },
    location: locationForAlert(args.alert),
    evidence: {
      summary: summaryFor(args.event, args.alert),
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      measurements,
      limitations: [
        ...args.response.limitations,
        "BioPulse conserva esta alerta con fuente y procedencia; no debe presentarse automaticamente como orden local de evacuacion.",
      ],
    },
    raw: {
      providerPayload: args.alert,
      rawRef: args.response.apiSourceUrl ?? args.response.sourceUrl,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: args.alert.sourceId === "smn-cap-alert-hub" ? "high" : "medium",
      basis: "official_source",
      notes: "Fuente oficial con procedencia clara. BioPulse conserva la alerta sin convertirla automaticamente en decision operativa local.",
    },
    provenance: {
      chain: [args.alert.sourceId, args.alert.eventType, ADAPTER_ID],
      fetchedBy: args.response.provider,
      transformedBy: ADAPTER_ID,
      attributionRequired: true,
    },
    status: observationStatus(args.alert),
    verification: {
      status: "source_reviewed",
    },
    narrativeUse: {
      eligible: true,
      role: "response",
      caution:
        "Alerta oficial con procedencia clara. No presentar como evacuacion local, decision gubernamental local ni confirmacion final de impacto salvo que la fuente lo indique explicitamente.",
    },
  };
}

export function officialAlertsToObservations(args: {
  event: EnvironmentalEvent;
  response: OfficialAlertsResponse | null;
  normalizedAt?: string;
}): Observation[] {
  if (!args.response || !Array.isArray(args.response.alerts)) return [];
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  return args.response.alerts.map((alert) =>
    officialAlertToObservation({ event: args.event, alert, response: args.response!, normalizedAt })
  );
}
