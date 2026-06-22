export const GUARDIAN_STORAGE_KEY = "biopulse:guardian:local:v1";

export type GuardianExposurePreference =
  | "data_only"
  | "general_images"
  | "ask_first"
  | "hide_sensitive";

export type GuardianEventMemory = {
  eventId: string;
  firstEnteredAt: string;
  lastOpenedAt: string;
};

export type GuardianLocalStore = {
  schema: "biopulse.guardian.local.v1";
  preferences: {
    exposure: GuardianExposurePreference;
  };
  events: Record<string, GuardianEventMemory>;
};

const DEFAULT_EXPOSURE: GuardianExposurePreference = "ask_first";

function emptyStore(): GuardianLocalStore {
  return {
    schema: "biopulse.guardian.local.v1",
    preferences: { exposure: DEFAULT_EXPOSURE },
    events: {},
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
  return { eventId, firstEnteredAt, lastOpenedAt };
}

export function readGuardianLocalStore(): GuardianLocalStore {
  if (typeof window === "undefined") return emptyStore();

  try {
    const raw = localStorage.getItem(GUARDIAN_STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<GuardianLocalStore>;
    if (parsed?.schema !== "biopulse.guardian.local.v1") return emptyStore();

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
  delete events[eventId];
  const next: GuardianLocalStore = { ...store, events };
  writeGuardianLocalStore(next);
  return next;
}
