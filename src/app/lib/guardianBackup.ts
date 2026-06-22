import {
  normalizeGuardianLocalStore,
  readGuardianLocalStore,
  replaceGuardianLocalStore,
  type GuardianLocalStore,
} from "@/app/lib/guardianStore";

export const GUARDIAN_BACKUP_FORMAT = "biopulse.guardian.backup.v1" as const;

export type GuardianBackupPreview = {
  exportedAt: string;
  store: GuardianLocalStore;
  counts: {
    events: number;
    missions: number;
    observations: number;
  };
};

type GuardianBackupEnvelope = {
  format: typeof GUARDIAN_BACKUP_FORMAT;
  exportedAt: string;
  store: GuardianLocalStore;
};

function backupCounts(store: GuardianLocalStore) {
  return {
    events: Object.keys(store.events).length,
    missions: Object.keys(store.missions).length,
    observations: Object.keys(store.observations).length,
  };
}

function recordSize(value: unknown) {
  return value && typeof value === "object" ? Object.keys(value).length : 0;
}

function hasConsistentRelationships(store: GuardianLocalStore) {
  for (const [eventId, memory] of Object.entries(store.events)) {
    if (memory.eventId !== eventId) return false;
    if (
      memory.observationIds.some((id) => {
        const observation = store.observations[id];
        return !observation || observation.eventId !== eventId;
      })
    ) {
      return false;
    }
    if (
      memory.missionIds.some((id) => {
        const mission = store.missions[id];
        return !mission || mission.eventId !== eventId;
      })
    ) {
      return false;
    }
    if (memory.activeMissionId) {
      const activeMission = store.missions[memory.activeMissionId];
      if (!activeMission || activeMission.eventId !== eventId || activeMission.status !== "active") return false;
    }
  }
  for (const observation of Object.values(store.observations)) {
    const memory = store.events[observation.eventId];
    if (!memory || !memory.observationIds.includes(observation.id)) return false;
    if (observation.missionId) {
      const mission = store.missions[observation.missionId];
      if (!mission || mission.eventId !== observation.eventId) return false;
    }
  }
  for (const mission of Object.values(store.missions)) {
    const memory = store.events[mission.eventId];
    if (!memory || !memory.missionIds.includes(mission.id)) return false;
  }
  return true;
}

export function createGuardianBackup(now = new Date()) {
  const envelope: GuardianBackupEnvelope = {
    format: GUARDIAN_BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    store: readGuardianLocalStore(),
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseGuardianBackup(raw: string): GuardianBackupPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("El archivo no contiene JSON válido.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("El archivo no contiene un respaldo Guardian.");
  }
  const envelope = parsed as Partial<GuardianBackupEnvelope>;
  if (envelope.format !== GUARDIAN_BACKUP_FORMAT) {
    throw new Error("El formato del respaldo no es compatible con esta versión de BioPulse.");
  }
  if (
    typeof envelope.exportedAt !== "string" ||
    !Number.isFinite(new Date(envelope.exportedAt).getTime())
  ) {
    throw new Error("El respaldo no contiene una fecha de exportación válida.");
  }
  const store = normalizeGuardianLocalStore(envelope.store);
  if (!store) throw new Error("La memoria Guardian del respaldo no es válida.");
  const sourceStore = envelope.store as Partial<GuardianLocalStore>;
  if (
    recordSize(sourceStore.events) !== Object.keys(store.events).length ||
    recordSize(sourceStore.missions) !== Object.keys(store.missions).length ||
    recordSize(sourceStore.observations) !== Object.keys(store.observations).length ||
    !hasConsistentRelationships(store)
  ) {
    throw new Error("El respaldo contiene registros incompletos o relaciones inválidas.");
  }
  return { exportedAt: envelope.exportedAt, store, counts: backupCounts(store) };
}

export function restoreGuardianBackup(preview: GuardianBackupPreview) {
  return replaceGuardianLocalStore(preview.store);
}
