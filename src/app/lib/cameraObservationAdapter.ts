import type { EnvironmentalEvent } from "@/data/events";
import type { LoadedCamera, ProviderCameraSnapshot } from "@/app/lib/cameraTypes";
import type { Observation, ObservationLocation, ObservationStatus } from "@/app/lib/observations";

const ADAPTER_ID = "biopulse.camera-observation-adapter.v1";

type MeasurementValue = number | string | boolean | null;

export type CameraObservationInput = {
  camera: LoadedCamera;
  providerSnapshot?: ProviderCameraSnapshot | null;
};

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function fallbackObservedAt(event: EnvironmentalEvent) {
  return validIso(event.lastSeen) ?? validIso(event.timestamp) ?? new Date(0).toISOString();
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

function locationForCamera(camera: LoadedCamera): ObservationLocation {
  const latitude = Number(camera.geo?.lat);
  const longitude = Number(camera.geo?.lon);

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

function providerName(camera: LoadedCamera) {
  if (camera.fetch.kind === "provider_api" && typeof camera.fetch.provider === "string") {
    return camera.fetch.provider;
  }
  return camera.providerId || "camera_registry";
}

function directSnapshotUrl(camera: LoadedCamera) {
  return camera.fetch.kind === "image_url" && typeof camera.fetch.url === "string" ? camera.fetch.url : null;
}

function providerDetailUrl(camera: LoadedCamera, providerSnapshot?: ProviderCameraSnapshot | null) {
  if (providerSnapshot?.detailUrl) return providerSnapshot.detailUrl;
  if (camera.fetch.kind === "provider_api" && camera.fetch.provider === "windy" && camera.fetch.cameraKey) {
    return `https://www.windy.com/webcams/${camera.fetch.cameraKey}`;
  }
  return null;
}

function externalUrl(camera: LoadedCamera, providerSnapshot?: ProviderCameraSnapshot | null) {
  return directSnapshotUrl(camera) ?? providerDetailUrl(camera, providerSnapshot);
}

function snapshotUrl(camera: LoadedCamera, providerSnapshot?: ProviderCameraSnapshot | null) {
  return directSnapshotUrl(camera) ?? providerSnapshot?.snapshotUrl ?? null;
}

function statusFor(providerSnapshot?: ProviderCameraSnapshot | null): ObservationStatus {
  if (providerSnapshot?.status === "error") return "stale";
  return "recorded";
}

function summaryFor(camera: LoadedCamera, providerSnapshot?: ProviderCameraSnapshot | null) {
  const title = camera.title || camera.id;
  const distance = Number.isFinite(camera.distanceKm) ? `${camera.distanceKm.toFixed(1)} km` : "distancia no disponible";
  const state =
    snapshotUrl(camera, providerSnapshot) != null
      ? "con snapshot disponible"
      : providerSnapshot?.status === "loading"
      ? "con snapshot en consulta"
      : providerSnapshot?.status === "error"
      ? "con snapshot no disponible"
      : "con fuente externa disponible";

  return `Cámara cercana a ${distance} del evento: ${title}, ${state}.`;
}

export function cameraToObservation(args: {
  event: EnvironmentalEvent;
  camera: LoadedCamera;
  providerSnapshot?: ProviderCameraSnapshot | null;
  normalizedAt?: string;
}): Observation {
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const snapshot = snapshotUrl(args.camera, args.providerSnapshot);
  const detail = externalUrl(args.camera, args.providerSnapshot);
  const measurements: Record<string, MeasurementValue> = {};

  addMeasurement(measurements, "distanceKm", args.camera.distanceKm);
  addMeasurement(measurements, "provider", providerName(args.camera));
  addMeasurement(measurements, "mediaType", args.camera.mediaType);
  addMeasurement(measurements, "fetchKind", args.camera.fetch.kind);
  addMeasurement(measurements, "snapshotStatus", args.providerSnapshot?.status ?? (snapshot ? "ready" : "unknown"));
  addMeasurement(measurements, "cameraKey", args.camera.fetch.kind === "provider_api" ? args.camera.fetch.cameraKey : null);
  addMeasurement(measurements, "locality", args.camera.coverage?.locality);
  addMeasurement(measurements, "admin1", args.camera.coverage?.admin1);
  addMeasurement(measurements, "countryISO2", args.camera.coverage?.countryISO2);

  return {
    schema: "biopulse.observation.v1",
    id: `camera:${eventIdentity(args.event)}:${args.camera.id}`,
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: "nearby_context",
    },
    type: "camera_snapshot",
    origin: {
      kind: "automated",
      actorType: "provider",
      displayName: providerName(args.camera),
    },
    source: {
      id: args.camera.id,
      name: args.camera.title || args.camera.id,
      provider: providerName(args.camera),
      url: detail ?? undefined,
      attribution: args.providerSnapshot?.attributionText ?? args.camera.usage?.attributionText,
      license: args.camera.usage?.termsUrl,
    },
    timestamp: {
      observedAt: fallbackObservedAt(args.event),
      recordedAt: normalizedAt,
    },
    location: locationForCamera(args.camera),
    evidence: {
      summary: summaryFor(args.camera, args.providerSnapshot),
      artifacts: [
        snapshot ? { kind: "snapshot" as const, url: snapshot, label: "Snapshot de cámara" } : null,
        detail ? { kind: "link" as const, url: detail, label: "Abrir fuente externa" } : null,
      ].filter((item): item is { kind: "snapshot" | "link"; url: string; label: string } => Boolean(item)),
      measurements,
      limitations: [
        "Una cámara cercana muestra una perspectiva visual limitada; no confirma por sí sola el alcance, causa o impacto del evento.",
        args.providerSnapshot?.status === "error"
          ? "El snapshot del proveedor no está disponible en este momento; conservar sólo como fuente externa contextual."
          : null,
      ].filter((item): item is string => Boolean(item)),
    },
    raw: {
      providerPayload: { camera: args.camera, providerSnapshot: args.providerSnapshot ?? null },
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: {
      level: snapshot ? "medium" : "low",
      basis: snapshot ? "visual_evidence" : "unverified_media",
      notes: snapshot
        ? "Cámara cercana con snapshot o imagen disponible; requiere interpretación humana para describir lo visible."
        : "Cámara cercana sin snapshot disponible; se conserva como referencia externa contextual.",
    },
    provenance: {
      chain: ["camera_registry", providerName(args.camera), ADAPTER_ID],
      transformedBy: ADAPTER_ID,
      attributionRequired: Boolean(args.camera.usage?.attributionText || args.providerSnapshot?.attributionText),
    },
    status: statusFor(args.providerSnapshot),
    verification: {
      status: args.camera.validation?.status === "verified" ? "source_reviewed" : "unreviewed",
    },
    narrativeUse: {
      eligible: true,
      role: "context",
      caution: "Usar como evidencia visual contextual; no presentar como confirmación oficial del evento.",
    },
  };
}

export function camerasToObservations(args: {
  event: EnvironmentalEvent;
  cameras: CameraObservationInput[];
  normalizedAt?: string;
}): Observation[] {
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  return args.cameras.map(({ camera, providerSnapshot }) =>
    cameraToObservation({ event: args.event, camera, providerSnapshot, normalizedAt })
  );
}
