import type {
  GuardianEventMemory,
  GuardianMission,
  GuardianObservation,
  GuardianReviewStatus,
} from "@/app/lib/guardianStore";

export type GuardianTimelineKind =
  | "space_prepared"
  | "mission_started"
  | "mission_closed"
  | "observation_recorded"
  | "provenance_reviewed"
  | "integrity_generated";

export type GuardianTimelineEntry = {
  id: string;
  at: string;
  kind: GuardianTimelineKind;
  title: string;
  detail: string | null;
};

const reviewLabels: Record<GuardianReviewStatus, string> = {
  unreviewed: "Sin revisar",
  source_reviewed: "Fuente revisada",
  source_agreement: "Coincidencia entre fuentes",
  source_conflict: "Contradicción entre fuentes",
  inconclusive: "Revisión no concluyente",
};

const sourceLabels: Record<GuardianObservation["sourceType"], string> = {
  satellite: "Satélite",
  camera: "Cámara",
  news: "Noticias",
  official_document: "Documento oficial",
  physical_observation: "Observación física",
  other: "Otra fuente",
  none: "Sin fuente declarada",
};

function validTimestamp(value: string | null | undefined) {
  return Boolean(value && Number.isFinite(new Date(value).getTime()));
}

function shortText(value: string, limit = 110) {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

export function buildGuardianTimeline(
  memory: GuardianEventMemory,
  missions: GuardianMission[],
  observations: GuardianObservation[]
): GuardianTimelineEntry[] {
  const entries: GuardianTimelineEntry[] = [];

  if (validTimestamp(memory.firstEnteredAt)) {
    entries.push({
      id: `space:${memory.eventId}`,
      at: memory.firstEnteredAt,
      kind: "space_prepared",
      title: "Espacio Guardian preparado",
      detail: "Comenzó la memoria privada de este evento en el dispositivo.",
    });
  }

  for (const mission of missions) {
    if (validTimestamp(mission.startedAt)) {
      entries.push({
        id: `mission-start:${mission.id}`,
        at: mission.startedAt,
        kind: "mission_started",
        title: "Misión iniciada",
        detail: mission.title,
      });
    }
    if (validTimestamp(mission.closedAt)) {
      entries.push({
        id: `mission-close:${mission.id}`,
        at: mission.closedAt!,
        kind: "mission_closed",
        title:
          mission.status === "insufficient_information"
            ? "Misión cerrada por información insuficiente"
            : "Misión completada",
        detail: mission.title,
      });
    }
  }

  for (const observation of observations) {
    if (validTimestamp(observation.recordedAt)) {
      entries.push({
        id: `observation:${observation.id}`,
        at: observation.recordedAt,
        kind: "observation_recorded",
        title: "Observación registrada",
        detail: `${sourceLabels[observation.sourceType]} · ${shortText(observation.observedText)}`,
      });
    }
    if (observation.reviewStatus !== "unreviewed" && validTimestamp(observation.reviewedAt)) {
      entries.push({
        id: `review:${observation.id}`,
        at: observation.reviewedAt!,
        kind: "provenance_reviewed",
        title: "Procedencia revisada",
        detail: reviewLabels[observation.reviewStatus],
      });
    }
    if (observation.integrity && validTimestamp(observation.integrity.generatedAt)) {
      const generatedAt = new Date(observation.integrity.generatedAt).getTime();
      const recordedAt = new Date(observation.recordedAt).getTime();
      if (!Number.isFinite(recordedAt) || generatedAt - recordedAt > 5000) {
        entries.push({
          id: `integrity:${observation.id}`,
          at: observation.integrity.generatedAt,
          kind: "integrity_generated",
          title: "Huella local generada",
          detail: "Se preservó una referencia SHA-256 del contenido base.",
        });
      }
    }
  }

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
