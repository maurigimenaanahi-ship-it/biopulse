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
  visibility: "private";
  status: "recorded";
};

export type GuardianEventMemory = {
  eventId: string;
  firstEnteredAt: string;
  lastOpenedAt: string;
  observationIds: string[];
};

export type GuardianLocalStore = {
  schema: "biopulse.guardian.local.v1";
  preferences: {
    exposure: GuardianExposurePreference;
  };
  events: Record<string, GuardianEventMemory>;
  observations: Record<string, GuardianObservation>;
};

const DEFAULT_EXPOSURE: GuardianExposurePreference = "ask_first";

function emptyStore(): GuardianLocalStore {
  return {
    schema: "biopulse.guardian.local.v1",
    preferences: { exposure: DEFAULT_EXPOSURE },
    events: {},
    observations: {},
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
  return { eventId, firstEnteredAt, lastOpenedAt, observationIds };
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

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
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
    visibility: "private",
    status: "recorded",
  };
}

export function readGuardianLocalStore(): GuardianLocalStore {
  if (typeof window === "undefined") return emptyStore();

  try {
    const raw = localStorage.getItem(GUARDIAN_STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<GuardianLocalStore>;
    if (parsed?.schema !== "biopulse.guardian.local.v1") return emptyStore();

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
    };
  } catch {
    return emptyStore();
  }
}

function writeGuardianLocalStore(store: GuardianLocalStore) {
  if (typeof window === "undefined") throw new Error("El almacenamiento local no está disponible.");
  localStorage.setItem(GUARDIAN_STORAGE_KEY, JSON.stringify(store));
}

export function prepareGuardianEvent(eventId: string, now = new Date()): GuardianLocalStore {
  const store = readGuardianLocalStore();
  const timestamp = now.toISOString();
  const previous = store.events[eventId];
  const next: GuardianLocalStore = {
    ...store,
    events: {
      ...store.events,
      [eventId]: {
        eventId,
        firstEnteredAt: previous?.firstEnteredAt ?? timestamp,
        lastOpenedAt: timestamp,
        observationIds: previous?.observationIds ?? [],
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
  delete events[eventId];
  for (const [id, observation] of Object.entries(observations)) {
    if (observation.eventId === eventId) delete observations[id];
  }
  const next: GuardianLocalStore = { ...store, events, observations };
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
};

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `guardian-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createGuardianObservation(
  input: CreateGuardianObservationInput,
  now = new Date()
): { store: GuardianLocalStore; observation: GuardianObservation } {
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
    visibility: "private",
    status: "recorded",
  };

  const next: GuardianLocalStore = {
    ...store,
    events: {
      ...store.events,
      [eventId]: {
        ...prepared,
        lastOpenedAt: now.toISOString(),
        observationIds: [...prepared.observationIds, id],
      },
    },
    observations: { ...store.observations, [id]: observation },
  };
  writeGuardianLocalStore(next);
  return { store: next, observation };
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
