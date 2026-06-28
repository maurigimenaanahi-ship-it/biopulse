import type { GuardianEventMemory, GuardianObservation } from "@/app/lib/guardianStore";
import type {
  InferenceRecord,
  Observation,
  ObservationConfidence,
  ObservationLocation,
  ObservationVerificationStatus,
} from "@/app/lib/observations";

const ADAPTER_ID = "biopulse.guardian-observation-adapter.v1";

export type GuardianObservationNormalization = {
  observation: Observation;
  inference: InferenceRecord | null;
};

function observationIdForGuardian(observationId: string) {
  return `guardian:${observationId}`;
}

function inferenceIdForGuardian(observationId: string) {
  return `guardian-inference:${observationId}`;
}

function reviewedAtFor(observation: GuardianObservation) {
  return observation.reviewedAt ?? undefined;
}

function verificationStatusFor(observation: GuardianObservation): ObservationVerificationStatus {
  switch (observation.reviewStatus) {
    case "source_reviewed":
      return "source_reviewed";
    case "source_agreement":
      return "corroborated";
    case "source_conflict":
      return "conflicted";
    case "inconclusive":
      return "inconclusive";
    case "unreviewed":
    default:
      return "unreviewed";
  }
}

function confidenceFor(observation: GuardianObservation): ObservationConfidence {
  switch (observation.reviewStatus) {
    case "source_agreement":
      return {
        level: "medium",
        basis: "multiple_sources",
        notes: "Observación Guardian con coincidencia declarada entre fuentes.",
      };
    case "source_reviewed":
      return {
        level: "medium",
        basis: observation.sourceReference ? "visual_evidence" : "single_human_report",
        notes: "La fuente fue revisada, pero no hay confirmación oficial estructurada.",
      };
    case "source_conflict":
      return {
        level: "low",
        basis: "single_human_report",
        notes: "La revisión Guardian marcó contradicción entre fuentes.",
      };
    case "inconclusive":
      return {
        level: "unknown",
        basis: "single_human_report",
        notes: "La revisión Guardian no llegó a una conclusión.",
      };
    case "unreviewed":
    default:
      return {
        level: "unknown",
        basis: "single_human_report",
        notes: "Observación humana local todavía no revisada.",
      };
  }
}

function locationFor(memory?: GuardianEventMemory | null): ObservationLocation {
  const snapshot = memory?.snapshot;
  if (!snapshot) return { kind: "unknown", precision: "unknown" };

  return {
    kind: "event_area",
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    precision: "approximate",
  };
}

function sourceTypeLabel(sourceType: GuardianObservation["sourceType"]) {
  switch (sourceType) {
    case "satellite":
      return "Satélite";
    case "camera":
      return "Cámara";
    case "news":
      return "Noticias";
    case "official_document":
      return "Documento oficial";
    case "physical_observation":
      return "Observación física";
    case "other":
      return "Otra fuente";
    case "none":
    default:
      return "Sin fuente declarada";
  }
}

function narrativeCautionFor(observation: GuardianObservation) {
  if (observation.reviewStatus === "source_conflict") {
    return "Usar como memoria humana en disputa; no presentar como confirmación.";
  }
  if (observation.reviewStatus === "unreviewed") {
    return "Usar como observación humana no revisada.";
  }
  if (observation.sensitivity !== "none") {
    return "Revisar sensibilidad antes de usar en una narrativa pública.";
  }
  return "Observación humana local; no constituye confirmación oficial por sí sola.";
}

export function guardianObservationToObservation(
  observation: GuardianObservation,
  memory?: GuardianEventMemory | null
): Observation {
  const artifacts = [];

  if (observation.sourceReference) {
    artifacts.push({
      kind: "link" as const,
      url: observation.sourceReference,
      label: `Fuente declarada: ${sourceTypeLabel(observation.sourceType)}`,
    });
  }

  if (observation.integrity) {
    artifacts.push({
      kind: "text" as const,
      label: "Huella local SHA-256",
      hash: observation.integrity.digest,
    });
  }

  const limitations = [
    observation.limitations,
    observation.sensitivity !== "none" ? "La observación fue marcada con sensibilidad o sensibilidad desconocida." : null,
    observation.interpretation
      ? "La interpretación Guardian se conserva como inferencia separada, no como evidencia observada."
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    schema: "biopulse.observation.v1",
    id: observationIdForGuardian(observation.id),
    relatedEvent: {
      eventId: observation.eventId,
      category: memory?.snapshot?.category,
      relation: "human_report",
    },
    type: "guardian_report",
    origin: {
      kind: "human",
      actorType: "guardian",
      displayName: "Guardian local",
    },
    source: {
      id: "guardian-local",
      name: "Guardian Local",
      provider: "BioPulse",
    },
    timestamp: {
      observedAt: observation.observedAt,
      recordedAt: observation.recordedAt,
    },
    location: locationFor(memory),
    evidence: {
      summary: observation.observedText,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      limitations: limitations.length > 0 ? limitations : undefined,
    },
    raw: {
      providerPayload: observation,
      normalizedBy: ADAPTER_ID,
      normalizedAt: new Date().toISOString(),
    },
    confidence: confidenceFor(observation),
    provenance: {
      chain: ["guardian_local", observation.sourceType, ADAPTER_ID],
      transformedBy: ADAPTER_ID,
      integrityHash: observation.integrity?.digest,
      attributionRequired: false,
    },
    status: observation.reviewStatus === "source_conflict" ? "disputed" : "recorded",
    verification: {
      status: verificationStatusFor(observation),
      reviewedBy: observation.reviewedAt ? ["guardian_local"] : undefined,
      reviewedAt: reviewedAtFor(observation),
    },
    narrativeUse: {
      eligible: true,
      role: "human_memory",
      caution: narrativeCautionFor(observation),
    },
  };
}

export function guardianObservationToInference(observation: GuardianObservation): InferenceRecord | null {
  const statement = observation.interpretation?.trim();
  if (!statement) return null;

  return {
    schema: "biopulse.inference.v1",
    id: inferenceIdForGuardian(observation.id),
    relatedEventId: observation.eventId,
    derivedFromObservationIds: [observationIdForGuardian(observation.id)],
    kind: "summary",
    statement,
    confidence: confidenceFor(observation).level,
    caution: "Interpretación humana registrada por un Guardián. No constituye confirmación oficial.",
    generatedBy: "human_guardian",
    generatedAt: observation.reviewedAt ?? observation.recordedAt,
  };
}

export function normalizeGuardianObservation(
  observation: GuardianObservation,
  memory?: GuardianEventMemory | null
): GuardianObservationNormalization {
  return {
    observation: guardianObservationToObservation(observation, memory),
    inference: guardianObservationToInference(observation),
  };
}
