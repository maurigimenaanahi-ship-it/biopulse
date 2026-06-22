import type { EnvironmentalEvent, EventCategory, EventStatus, EventTrend, EvacuationLevel } from "@/data/events";

export const GUARDIAN_STORAGE_KEY = "biopulse:guardian:local:v1";

export type GuardianExposurePreference =
  | "data_only"
  | "general_images"
  | "ask_first"
  | "hide_sensitive";

export type GuardianObservationSource =
  | "satellite"
  | "camera"
  | "news"
  | "official_document"
  | "physical_observation"
  | "other"
  | "none";

export type GuardianLocationPrecision = "event_area" | "approximate" | "protected" | "unknown";
export type GuardianSensitivity = "none" | "sensitive" | "unknown";
export type GuardianReviewStatus =
  | "unreviewed"
  | "source_reviewed"
  | "source_agreement"
  | "source_conflict"
  | "inconclusive";

export type GuardianObservationIntegrity = {
  algorithm: "SHA-256";
  canonicalVersion: "biopulse.guardian.observation.v1";
  digest: string;
  generatedAt: string;
};
export type GuardianMissionKind =
  | "review_satellite"
  | "review_cameras"
  | "review_weather"
  | "document_source"
  | "compare_changes"
  | "identify_gaps";
export type GuardianMissionStatus = "active" | "completed" | "insufficient_information";

export type GuardianEventSnapshot = {
  id: string;
  category: EventCategory;
  title: string;
  location: string;
  latitude: number;
  longitude: number;
  severity: EnvironmentalEvent["severity"];
  description: string;
  timestamp: string;
  lastSeen: string | null;
  liveFeedUrl: string | null;
  status: EventStatus | null;
  trend: EventTrend | null;
  evacuationLevel: EvacuationLevel | null;
  focusCount: number | null;
  frpMax: number | null;
  frpSum: number | null;
};

export type GuardianMission = {
  id: string;
  eventId: string;
  kind: GuardianMissionKind;
  title: string;
  question: string;
  status: GuardianMissionStatus;
  startedAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type GuardianObservation = {
  id: string;
  eventId: string;
  observedText: string;
  interpretation: string | null;
  sourceType: GuardianObservationSource;
  sourceReference: string | null;
  observedAt: string;
  recordedAt: string;
  limitations: string | null;
  locationPrecision: GuardianLocationPrecision;
  sensitivity: GuardianSensitivity;
  missionId: string | null;
  reviewStatus: GuardianReviewStatus;
  reviewNote: string | null;
  reviewSourceReference: string | null;
  reviewedAt: string | null;
  integrity: GuardianObservationIntegrity | null;
  visibility: "private";
  status: "recorded";
};

export type GuardianEventMemory = {
  eventId: string;
  snapshot: GuardianEventSnapshot | null;
  firstEnteredAt: string;
  lastOpenedAt: string;
  observationIds: string[];
  missionIds: string[];
  activeMissionId: string | null;
};

export type GuardianLocalStore = {
  schema: "biopulse.guardian.local.v1";
  preferences: {
    exposure: GuardianExposurePreference;
  };
  events: Record<string, GuardianEventMemory>;
  observations: Record<string, GuardianObservation>;
  missions: Record<string, GuardianMission>;
};

const DEFAULT_EXPOSURE: GuardianExposurePreference = "ask_first";

function emptyStore(): GuardianLocalStore {
  return {
    schema: "biopulse.guardian.local.v1",
    preferences: { exposure: DEFAULT_EXPOSURE },
    events: {},
    observations: {},
    missions: {},
  };
}

function isExposurePreference(value: unknown): value is GuardianExposurePreference {
  return (
    value === "data_only" ||
    value === "general_images" ||
    value === "ask_first" ||
    value === "hide_sensitive"
  );
}

function optionalFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isEventCategory(value: unknown): value is EventCategory {
  return ["flood", "fire", "storm", "heatwave", "air-pollution", "ocean-anomaly"].includes(String(value));
}

function isEventSeverity(value: unknown): value is EnvironmentalEvent["severity"] {
  return ["low", "moderate", "high", "critical"].includes(String(value));
}

function isEventStatus(value: unknown): value is EventStatus {
  return ["active", "contained", "escalating", "stabilizing", "resolved"].includes(String(value));
}

function isEvacuationLevel(value: unknown): value is EvacuationLevel {
  return ["none", "recommended", "mandatory"].includes(String(value));
}

function isEventTrend(value: unknown): value is EventTrend {
  return ["rising", "stable", "falling"].includes(String(value));
}

function snapshotFromEvent(event: EnvironmentalEvent): GuardianEventSnapshot {
  const timestamp = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
  const lastSeen = event.lastSeen instanceof Date ? event.lastSeen : event.lastSeen ? new Date(event.lastSeen) : null;
  return {
    id: event.id,
    category: event.category,
    title: event.title,
    location: event.location,
    latitude: event.latitude,
    longitude: event.longitude,
    severity: event.severity,
    description: event.description,
    timestamp: Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date().toISOString(),
    lastSeen: lastSeen && Number.isFinite(lastSeen.getTime()) ? lastSeen.toISOString() : null,
    liveFeedUrl: optionalText(event.liveFeedUrl, 2000),
    status: isEventStatus(event.status) ? event.status : null,
    trend: isEventTrend(event.trend) ? event.trend : null,
    evacuationLevel: isEvacuationLevel(event.evacuationLevel) ? event.evacuationLevel : null,
    focusCount: optionalFiniteNumber(event.focusCount),
    frpMax: optionalFiniteNumber(event.frpMax),
    frpSum: optionalFiniteNumber(event.frpSum),
  };
}

function normalizeEventSnapshot(value: unknown): GuardianEventSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<GuardianEventSnapshot>;
  const id = optionalText(record.id, 200);
  const title = optionalText(record.title, 500);
  const location = optionalText(record.location, 500);
  const description = optionalText(record.description, 4000) ?? "";
  const timestamp = optionalText(record.timestamp, 80);
  const latitude = optionalFiniteNumber(record.latitude);
  const longitude = optionalFiniteNumber(record.longitude);
  if (
    !id ||
    !title ||
    !location ||
    !timestamp ||
    latitude == null ||
    longitude == null ||
    !Number.isFinite(new Date(timestamp).getTime()) ||
    !isEventCategory(record.category) ||
    !isEventSeverity(record.severity)
  ) {
    return null;
  }
  const lastSeen = optionalText(record.lastSeen, 80);
  return {
    id,
    category: record.category,
    title,
    location,
    latitude,
    longitude,
    severity: record.severity,
    description,
    timestamp,
    lastSeen: lastSeen && Number.isFinite(new Date(lastSeen).getTime()) ? lastSeen : null,
    liveFeedUrl: optionalText(record.liveFeedUrl, 2000),
    status: isEventStatus(record.status) ? record.status : null,
    trend: isEventTrend(record.trend) ? record.trend : null,
    evacuationLevel: isEvacuationLevel(record.evacuationLevel) ? record.evacuationLevel : null,
    focusCount: optionalFiniteNumber(record.focusCount),
    frpMax: optionalFiniteNumber(record.frpMax),
    frpSum: optionalFiniteNumber(record.frpSum),
  };
}

function deg2rad(value: number) {
  return (value * Math.PI) / 180;
}

export function guardianSnapshotDistanceKm(snapshot: GuardianEventSnapshot, event: EnvironmentalEvent) {
  const earthRadiusKm = 6371;
  const dLat = deg2rad(event.latitude - snapshot.latitude);
  const dLon = deg2rad(event.longitude - snapshot.longitude);
  const lat1 = deg2rad(snapshot.latitude);
  const lat2 = deg2rad(event.latitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function findGuardianEventRecord(
  store: GuardianLocalStore,
  event: EnvironmentalEvent,
  maxDistanceKm = 30
): { recordId: string; memory: GuardianEventMemory } | null {
  let best: { recordId: string; memory: GuardianEventMemory; distanceKm: number } | null = null;
  for (const [recordId, memory] of Object.entries(store.events)) {
    if (!memory.snapshot || memory.snapshot.category !== event.category) continue;
    const distanceKm = guardianSnapshotDistanceKm(memory.snapshot, event);
    if (distanceKm > maxDistanceKm || (best && best.distanceKm <= distanceKm)) continue;
    best = { recordId, memory, distanceKm };
  }
  return best ? { recordId: best.recordId, memory: best.memory } : null;
}

function normalizeEventMemory(eventId: string, value: unknown): GuardianEventMemory | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<GuardianEventMemory> & { firstObservedAt?: string };
  const firstEnteredAt =
    typeof record.firstEnteredAt === "string"
      ? record.firstEnteredAt
      : typeof record.firstObservedAt === "string"
      ? record.firstObservedAt
      : null;
  const lastOpenedAt = typeof record.lastOpenedAt === "string" ? record.lastOpenedAt : null;
  if (!firstEnteredAt || !lastOpenedAt) return null;
  if (!Number.isFinite(new Date(firstEnteredAt).getTime()) || !Number.isFinite(new Date(lastOpenedAt).getTime())) {
    return null;
  }
  const observationIds = Array.isArray(record.observationIds)
    ? record.observationIds.filter((id): id is string => typeof id === "string")
    : [];
  const missionIds = Array.isArray(record.missionIds)
    ? record.missionIds.filter((id): id is string => typeof id === "string")
    : [];
  const activeMissionId = typeof record.activeMissionId === "string" ? record.activeMissionId : null;
  return {
    eventId,
    snapshot: normalizeEventSnapshot(record.snapshot),
    firstEnteredAt,
    lastOpenedAt,
    observationIds,
    missionIds,
    activeMissionId,
  };
}

function isMissionKind(value: unknown): value is GuardianMissionKind {
  return [
    "review_satellite",
    "review_cameras",
    "review_weather",
    "document_source",
    "compare_changes",
    "identify_gaps",
  ].includes(String(value));
}

function isMissionStatus(value: unknown): value is GuardianMissionStatus {
  return ["active", "completed", "insufficient_information"].includes(String(value));
}

function isObservationSource(value: unknown): value is GuardianObservationSource {
  return ["satellite", "camera", "news", "official_document", "physical_observation", "other", "none"].includes(
    String(value)
  );
}

function isLocationPrecision(value: unknown): value is GuardianLocationPrecision {
  return ["event_area", "approximate", "protected", "unknown"].includes(String(value));
}

function isSensitivity(value: unknown): value is GuardianSensitivity {
  return ["none", "sensitive", "unknown"].includes(String(value));
}

function isReviewStatus(value: unknown): value is GuardianReviewStatus {
  return ["unreviewed", "source_reviewed", "source_agreement", "source_conflict", "inconclusive"].includes(
    String(value)
  );
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeObservationIntegrity(value: unknown): GuardianObservationIntegrity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<GuardianObservationIntegrity>;
  if (
    record.algorithm !== "SHA-256" ||
    record.canonicalVersion !== "biopulse.guardian.observation.v1" ||
    typeof record.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.digest) ||
    typeof record.generatedAt !== "string" ||
    !Number.isFinite(new Date(record.generatedAt).getTime())
  ) {
    return null;
  }
  return {
    algorithm: "SHA-256",
    canonicalVersion: "biopulse.guardian.observation.v1",
    digest: record.digest,
    generatedAt: record.generatedAt,
  };
}

function normalizeObservation(id: string, value: unknown): GuardianObservation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<GuardianObservation>;
  const eventId = optionalText(record.eventId, 200);
  const observedText = optionalText(record.observedText, 4000);
  const observedAt = optionalText(record.observedAt, 80);
  const recordedAt = optionalText(record.recordedAt, 80);
  if (!eventId || !observedText || !observedAt || !recordedAt) return null;
  if (!Number.isFinite(new Date(observedAt).getTime()) || !Number.isFinite(new Date(recordedAt).getTime())) return null;

  return {
    id,
    eventId,
    observedText,
    interpretation: optionalText(record.interpretation, 4000),
    sourceType: isObservationSource(record.sourceType) ? record.sourceType : "none",
    sourceReference: optionalText(record.sourceReference, 1000),
    observedAt,
    recordedAt,
    limitations: optionalText(record.limitations, 2000),
    locationPrecision: isLocationPrecision(record.locationPrecision) ? record.locationPrecision : "unknown",
    sensitivity: isSensitivity(record.sensitivity) ? record.sensitivity : "unknown",
    missionId: optionalText(record.missionId, 200),
    reviewStatus: isReviewStatus(record.reviewStatus) ? record.reviewStatus : "unreviewed",
    reviewNote: optionalText(record.reviewNote, 3000),
    reviewSourceReference: optionalText(record.reviewSourceReference, 1000),
    reviewedAt:
      typeof record.reviewedAt === "string" && Number.isFinite(new Date(record.reviewedAt).getTime())
        ? record.reviewedAt
        : null,
    integrity: normalizeObservationIntegrity(record.integrity),
    visibility: "private",
    status: "recorded",
  };
}

function normalizeMission(id: string, value: unknown): GuardianMission | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<GuardianMission>;
  const eventId = optionalText(record.eventId, 200);
  const title = optionalText(record.title, 200);
  const question = optionalText(record.question, 500);
  const startedAt = optionalText(record.startedAt, 80);
  const updatedAt = optionalText(record.updatedAt, 80);
  if (!eventId || !title || !question || !startedAt || !updatedAt || !isMissionKind(record.kind)) return null;
  if (!Number.isFinite(new Date(startedAt).getTime()) || !Number.isFinite(new Date(updatedAt).getTime())) return null;
  const closedAt = optionalText(record.closedAt, 80);
  return {
    id,
    eventId,
    kind: record.kind,
    title,
    question,
    status: isMissionStatus(record.status) ? record.status : "active",
    startedAt,
    updatedAt,
    closedAt: closedAt && Number.isFinite(new Date(closedAt).getTime()) ? closedAt : null,
  };
}

export function readGuardianLocalStore(): GuardianLocalStore {
  if (typeof window === "undefined") return emptyStore();

  try {
    const raw = localStorage.getItem(GUARDIAN_STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<GuardianLocalStore>;
    if (parsed?.schema !== "biopulse.guardian.local.v1") return emptyStore();

    const missions: Record<string, GuardianMission> = {};
    if (parsed.missions && typeof parsed.missions === "object") {
      for (const [id, value] of Object.entries(parsed.missions)) {
        const normalized = normalizeMission(id, value);
        if (normalized) missions[id] = normalized;
      }
    }

    const observations: Record<string, GuardianObservation> = {};
    if (parsed.observations && typeof parsed.observations === "object") {
      for (const [id, value] of Object.entries(parsed.observations)) {
        const normalized = normalizeObservation(id, value);
        if (normalized) observations[id] = normalized;
      }
    }

    const events: Record<string, GuardianEventMemory> = {};
    if (parsed.events && typeof parsed.events === "object") {
      for (const [eventId, value] of Object.entries(parsed.events)) {
        const normalized = normalizeEventMemory(eventId, value);
        if (normalized) events[eventId] = normalized;
      }
    }

    return {
      schema: "biopulse.guardian.local.v1",
      preferences: {
        exposure: isExposurePreference(parsed.preferences?.exposure)
          ? parsed.preferences.exposure
          : DEFAULT_EXPOSURE,
      },
      events,
      observations,
      missions,
    };
  } catch {
    return emptyStore();
  }
}

function writeGuardianLocalStore(store: GuardianLocalStore) {
  if (typeof window === "undefined") throw new Error("El almacenamiento local no está disponible.");
  localStorage.setItem(GUARDIAN_STORAGE_KEY, JSON.stringify(store));
}

export function prepareGuardianEvent(eventOrId: EnvironmentalEvent | string, now = new Date()): GuardianLocalStore {
  const store = readGuardianLocalStore();
  const matched = typeof eventOrId === "string" ? null : findGuardianEventRecord(store, eventOrId);
  const eventId =
    typeof eventOrId === "string"
      ? eventOrId
      : matched?.recordId ?? `guardian-event-${createLocalId()}`;
  const snapshot = typeof eventOrId === "string" ? null : snapshotFromEvent(eventOrId);
  const timestamp = now.toISOString();
  const previous = matched?.memory ?? store.events[eventId];
  const next: GuardianLocalStore = {
    ...store,
    events: {
      ...store.events,
      [eventId]: {
        eventId,
        snapshot: snapshot ?? previous?.snapshot ?? null,
        firstEnteredAt: previous?.firstEnteredAt ?? timestamp,
        lastOpenedAt: timestamp,
        observationIds: previous?.observationIds ?? [],
        missionIds: previous?.missionIds ?? [],
        activeMissionId: previous?.activeMissionId ?? null,
      },
    },
  };
  writeGuardianLocalStore(next);
  return next;
}

export function setGuardianExposurePreference(exposure: GuardianExposurePreference): GuardianLocalStore {
  const store = readGuardianLocalStore();
  const next: GuardianLocalStore = {
    ...store,
    preferences: { ...store.preferences, exposure },
  };
  writeGuardianLocalStore(next);
  return next;
}

export function removeGuardianEvent(eventId: string): GuardianLocalStore {
  const store = readGuardianLocalStore();
  const events = { ...store.events };
  const observations = { ...store.observations };
  const missions = { ...store.missions };
  delete events[eventId];
  for (const [id, observation] of Object.entries(observations)) {
    if (observation.eventId === eventId) delete observations[id];
  }
  for (const [id, mission] of Object.entries(missions)) {
    if (mission.eventId === eventId) delete missions[id];
  }
  const next: GuardianLocalStore = { ...store, events, observations, missions };
  writeGuardianLocalStore(next);
  return next;
}

export type CreateGuardianObservationInput = {
  eventId: string;
  observedText: string;
  interpretation?: string;
  sourceType: GuardianObservationSource;
  sourceReference?: string;
  observedAt: string;
  limitations?: string;
  locationPrecision: GuardianLocationPrecision;
  sensitivity: GuardianSensitivity;
  missionId?: string;
};

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `guardian-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function canonicalObservationContent(observation: GuardianObservation) {
  return JSON.stringify([
    "biopulse.guardian.observation.v1",
    observation.id,
    observation.eventId,
    observation.observedText,
    observation.interpretation,
    observation.sourceType,
    observation.sourceReference,
    observation.observedAt,
    observation.recordedAt,
    observation.limitations,
    observation.locationPrecision,
    observation.sensitivity,
    observation.missionId,
    observation.visibility,
    observation.status,
  ]);
}

async function sha256Hex(value: string) {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("SHA-256 no está disponible en este navegador.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createObservationIntegrity(observation: GuardianObservation, generatedAt = new Date()) {
  return {
    algorithm: "SHA-256",
    canonicalVersion: "biopulse.guardian.observation.v1",
    digest: await sha256Hex(canonicalObservationContent(observation)),
    generatedAt: generatedAt.toISOString(),
  } satisfies GuardianObservationIntegrity;
}

export type GuardianIntegrityCheck = "valid" | "changed" | "unavailable" | "unsupported";

export async function verifyGuardianObservationIntegrity(
  observation: GuardianObservation
): Promise<GuardianIntegrityCheck> {
  if (!observation.integrity) return "unavailable";
  try {
    const digest = await sha256Hex(canonicalObservationContent(observation));
    return digest === observation.integrity.digest ? "valid" : "changed";
  } catch {
    return "unsupported";
  }
}

export async function createGuardianObservation(
  input: CreateGuardianObservationInput,
  now = new Date()
): Promise<{ store: GuardianLocalStore; observation: GuardianObservation }> {
  const eventId = optionalText(input.eventId, 200);
  const observedText = optionalText(input.observedText, 4000);
  const observedAtDate = new Date(input.observedAt);
  if (!eventId || !observedText) throw new Error("La observación y el evento son obligatorios.");
  if (!Number.isFinite(observedAtDate.getTime())) throw new Error("La fecha observada no es válida.");

  const store = readGuardianLocalStore();
  const prepared = store.events[eventId];
  if (!prepared) throw new Error("Prepará el espacio Guardian antes de registrar una observación.");

  const id = createLocalId();
  const observation: GuardianObservation = {
    id,
    eventId,
    observedText,
    interpretation: optionalText(input.interpretation, 4000),
    sourceType: isObservationSource(input.sourceType) ? input.sourceType : "none",
    sourceReference: optionalText(input.sourceReference, 1000),
    observedAt: observedAtDate.toISOString(),
    recordedAt: now.toISOString(),
    limitations: optionalText(input.limitations, 2000),
    locationPrecision: isLocationPrecision(input.locationPrecision) ? input.locationPrecision : "unknown",
    sensitivity: isSensitivity(input.sensitivity) ? input.sensitivity : "unknown",
    missionId:
      input.missionId &&
      prepared.activeMissionId === input.missionId &&
      store.missions[input.missionId]?.eventId === eventId &&
      store.missions[input.missionId]?.status === "active"
        ? input.missionId
        : null,
    reviewStatus: "unreviewed",
    reviewNote: null,
    reviewSourceReference: null,
    reviewedAt: null,
    integrity: null,
    visibility: "private",
    status: "recorded",
  };

  try {
    observation.integrity = await createObservationIntegrity(observation, now);
  } catch {
    observation.integrity = null;
  }

  const latestStore = readGuardianLocalStore();
  const latestPrepared = latestStore.events[eventId];
  if (!latestPrepared) throw new Error("El espacio Guardian dejó de estar disponible antes de guardar.");

  const next: GuardianLocalStore = {
    ...latestStore,
    events: {
      ...latestStore.events,
      [eventId]: {
        ...latestPrepared,
        lastOpenedAt: now.toISOString(),
        observationIds: [...latestPrepared.observationIds, id],
      },
    },
    observations: { ...latestStore.observations, [id]: observation },
  };
  writeGuardianLocalStore(next);
  return { store: next, observation };
}

export async function sealGuardianObservation(
  observationId: string,
  now = new Date()
): Promise<GuardianLocalStore> {
  const store = readGuardianLocalStore();
  const observation = store.observations[observationId];
  if (!observation) throw new Error("La observación ya no está disponible.");
  if (observation.integrity) return store;
  const canonicalBefore = canonicalObservationContent(observation);
  const integrity = await createObservationIntegrity(observation, now);
  const latestStore = readGuardianLocalStore();
  const latestObservation = latestStore.observations[observationId];
  if (!latestObservation) throw new Error("La observación fue eliminada antes de generar la huella.");
  if (canonicalObservationContent(latestObservation) !== canonicalBefore) {
    throw new Error("La observación cambió durante el proceso. Intentá nuevamente.");
  }
  const next: GuardianLocalStore = {
    ...latestStore,
    observations: {
      ...latestStore.observations,
      [observationId]: { ...latestObservation, integrity },
    },
  };
  writeGuardianLocalStore(next);
  return next;
}

export function removeGuardianObservation(observationId: string): GuardianLocalStore {
  const store = readGuardianLocalStore();
  const observation = store.observations[observationId];
  if (!observation) return store;

  const observations = { ...store.observations };
  delete observations[observationId];
  const eventMemory = store.events[observation.eventId];
  const events = eventMemory
    ? {
        ...store.events,
        [observation.eventId]: {
          ...eventMemory,
          observationIds: eventMemory.observationIds.filter((id) => id !== observationId),
        },
      }
    : store.events;
  const next: GuardianLocalStore = { ...store, events, observations };
  writeGuardianLocalStore(next);
  return next;
}

export type ReviewGuardianObservationInput = {
  status: GuardianReviewStatus;
  note?: string;
  sourceReference?: string;
};

export function reviewGuardianObservation(
  observationId: string,
  input: ReviewGuardianObservationInput,
  now = new Date()
): GuardianLocalStore {
  const store = readGuardianLocalStore();
  const observation = store.observations[observationId];
  if (!observation) throw new Error("La observación ya no está disponible.");
  if (!isReviewStatus(input.status)) throw new Error("El estado de revisión no es válido.");

  const sourceReference = optionalText(input.sourceReference, 1000);
  if (
    (input.status === "source_agreement" || input.status === "source_conflict") &&
    !sourceReference
  ) {
    throw new Error("Registrá la fuente utilizada para el contraste.");
  }

  const reset = input.status === "unreviewed";
  const next: GuardianLocalStore = {
    ...store,
    observations: {
      ...store.observations,
      [observationId]: {
        ...observation,
        reviewStatus: input.status,
        reviewNote: reset ? null : optionalText(input.note, 3000),
        reviewSourceReference: reset ? null : sourceReference,
        reviewedAt: reset ? null : now.toISOString(),
      },
    },
  };
  writeGuardianLocalStore(next);
  return next;
}

export type StartGuardianMissionInput = {
  eventId: string;
  kind: GuardianMissionKind;
  title: string;
  question: string;
};

export function startGuardianMission(
  input: StartGuardianMissionInput,
  now = new Date()
): { store: GuardianLocalStore; mission: GuardianMission } {
  const store = readGuardianLocalStore();
  const eventMemory = store.events[input.eventId];
  if (!eventMemory) throw new Error("Prepará el espacio Guardian antes de iniciar una misión.");
  if (eventMemory.activeMissionId && store.missions[eventMemory.activeMissionId]?.status === "active") {
    throw new Error("Ya existe una misión activa para este evento.");
  }

  const title = optionalText(input.title, 200);
  const question = optionalText(input.question, 500);
  if (!title || !question || !isMissionKind(input.kind)) throw new Error("La misión no es válida.");
  const id = createLocalId();
  const timestamp = now.toISOString();
  const mission: GuardianMission = {
    id,
    eventId: input.eventId,
    kind: input.kind,
    title,
    question,
    status: "active",
    startedAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
  };
  const next: GuardianLocalStore = {
    ...store,
    events: {
      ...store.events,
      [input.eventId]: {
        ...eventMemory,
        lastOpenedAt: timestamp,
        missionIds: [...eventMemory.missionIds, id],
        activeMissionId: id,
      },
    },
    missions: { ...store.missions, [id]: mission },
  };
  writeGuardianLocalStore(next);
  return { store: next, mission };
}

export function closeGuardianMission(
  missionId: string,
  status: Extract<GuardianMissionStatus, "completed" | "insufficient_information">,
  now = new Date()
): GuardianLocalStore {
  const store = readGuardianLocalStore();
  const mission = store.missions[missionId];
  if (!mission || mission.status !== "active") return store;
  if (
    status === "completed" &&
    !Object.values(store.observations).some((observation) => observation.missionId === missionId)
  ) {
    throw new Error("Guardá al menos una observación vinculada antes de completar la misión.");
  }
  const timestamp = now.toISOString();
  const eventMemory = store.events[mission.eventId];
  const next: GuardianLocalStore = {
    ...store,
    events: eventMemory
      ? {
          ...store.events,
          [mission.eventId]: {
            ...eventMemory,
            activeMissionId: eventMemory.activeMissionId === missionId ? null : eventMemory.activeMissionId,
          },
        }
      : store.events,
    missions: {
      ...store.missions,
      [missionId]: { ...mission, status, updatedAt: timestamp, closedAt: timestamp },
    },
  };
  writeGuardianLocalStore(next);
  return next;
}
