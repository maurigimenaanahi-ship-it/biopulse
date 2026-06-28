import type { InferenceRecord, NarrativeFragment, NarrativeRole, Observation } from "@/app/lib/observations";

type BuildNarrativeFragmentsInput = {
  eventId: string;
  observations: Observation[];
  inferences?: InferenceRecord[];
  generatedAt?: string;
  maxFragments?: number;
};

function validTime(value: string | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function observationTime(observation: Observation) {
  return validTime(observation.timestamp.observedAt) || validTime(observation.timestamp.recordedAt);
}

function compactText(text: string, max = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function sourceLabel(observation: Observation) {
  return [observation.source.name, observation.source.provider].filter(Boolean).join(" / ");
}

function observedAtLabel(observation: Observation) {
  const time = observationTime(observation);
  if (!time) return "momento no disponible";
  return `${new Date(time).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function fragmentId(eventId: string, role: NarrativeRole, suffix: string) {
  return `narrative:${eventId}:${role}:${suffix}`;
}

function makeFragment(args: {
  eventId: string;
  role: NarrativeRole;
  text: string;
  observationIds: string[];
  inferenceIds?: string[];
  generatedAt: string;
  caution?: string;
}): NarrativeFragment {
  const fragment: NarrativeFragment = {
    schema: "biopulse.narrative-fragment.v1",
    id: fragmentId(args.eventId, args.role, args.observationIds.join("-") || args.inferenceIds?.join("-") || "system"),
    relatedEventId: args.eventId,
    observationIds: args.observationIds,
    role: args.role,
    text: args.text,
    generatedAt: args.generatedAt,
  };

  if (args.inferenceIds) fragment.inferenceIds = args.inferenceIds;
  if (args.caution) fragment.caution = args.caution;

  return fragment;
}

function latestOf(observations: Observation[]) {
  return [...observations].sort((a, b) => observationTime(b) - observationTime(a))[0] ?? null;
}

function firstOf(observations: Observation[]) {
  return [...observations].sort((a, b) => observationTime(a) - observationTime(b))[0] ?? null;
}

export function buildNarrativeFragments(input: BuildNarrativeFragmentsInput): NarrativeFragment[] {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const maxFragments = input.maxFragments ?? 6;
  const eligible = input.observations.filter((observation) => observation.narrativeUse.eligible);
  const fragments: NarrativeFragment[] = [];

  const firstDetection =
    firstOf(eligible.filter((observation) => observation.narrativeUse.role === "first_detection")) ??
    firstOf(eligible.filter((observation) => observation.type === "satellite_detection"));

  if (firstDetection) {
    fragments.push(
      makeFragment({
        eventId: input.eventId,
        role: "first_detection",
        observationIds: [firstDetection.id],
        generatedAt,
        text: `Primera señal conservada: ${compactText(firstDetection.evidence.summary)} Fuente: ${sourceLabel(
          firstDetection
        ) || "no disponible"}; observada en ${observedAtLabel(firstDetection)}.`,
        caution: firstDetection.narrativeUse.caution,
      })
    );
  }

  const latestInstrumental = latestOf(
    eligible.filter((observation) => observation.type === "satellite_detection" && observation.id !== firstDetection?.id)
  );

  if (latestInstrumental) {
    fragments.push(
      makeFragment({
        eventId: input.eventId,
        role: "escalation",
        observationIds: [latestInstrumental.id],
        generatedAt,
        text: `Actualización instrumental: ${compactText(latestInstrumental.evidence.summary)} Registrada por ${
          sourceLabel(latestInstrumental) || "fuente no disponible"
        } en ${observedAtLabel(latestInstrumental)}.`,
        caution: latestInstrumental.narrativeUse.caution,
      })
    );
  }

  const contextObservations = eligible.filter((observation) =>
    ["camera_snapshot", "weather_reading", "news_report", "official_reference", "environmental_context"].includes(
      observation.type
    )
  );

  if (contextObservations.length > 0) {
    const counts = {
      cameras: contextObservations.filter((observation) => observation.type === "camera_snapshot").length,
      weather: contextObservations.filter((observation) => observation.type === "weather_reading").length,
      news: contextObservations.filter(
        (observation) => observation.type === "news_report" || observation.type === "official_reference"
      ).length,
      environmental: contextObservations.filter((observation) => observation.type === "environmental_context").length,
    };
    const parts = [
      counts.cameras ? `${counts.cameras} referencia${counts.cameras === 1 ? "" : "s"} visual${counts.cameras === 1 ? "" : "es"}` : null,
      counts.weather ? "1 lectura meteorológica" : null,
      counts.news ? `${counts.news} referencia${counts.news === 1 ? "" : "s"} informativa${counts.news === 1 ? "" : "s"}` : null,
      counts.environmental
        ? `${counts.environmental} antecedente${counts.environmental === 1 ? "" : "s"} ambiental${
            counts.environmental === 1 ? "" : "es"
          }`
        : null,
    ].filter((item): item is string => Boolean(item));
    const contextVerb = parts.length === 1 ? "ayuda" : "ayudan";

    fragments.push(
      makeFragment({
        eventId: input.eventId,
        role: "context",
        observationIds: contextObservations.map((observation) => observation.id),
        generatedAt,
        text: `Contexto conservado: ${parts.join(", ")} ${contextVerb} a comprender el evento sin convertirlo en confirmación oficial.`,
        caution: "El contexto visual, meteorológico o periodístico debe contrastarse con fuentes oficiales y observación local.",
      })
    );
  }

  const guardianObservations = eligible.filter((observation) => observation.type === "guardian_report");
  const latestGuardian = latestOf(guardianObservations);

  if (latestGuardian) {
    fragments.push(
      makeFragment({
        eventId: input.eventId,
        role: "human_memory",
        observationIds: guardianObservations.map((observation) => observation.id),
        generatedAt,
        text: `Memoria Guardian: ${guardianObservations.length} observación${
          guardianObservations.length === 1 ? "" : "es"
        } humana${guardianObservations.length === 1 ? "" : "s"} local${
          guardianObservations.length === 1 ? "" : "es"
        } vinculada${guardianObservations.length === 1 ? "" : "s"} al evento. Última: ${compactText(
          latestGuardian.evidence.summary
        )}`,
        caution: latestGuardian.narrativeUse.caution,
      })
    );
  }

  if ((input.inferences ?? []).length > 0) {
    const inferences = input.inferences ?? [];
    fragments.push(
      makeFragment({
        eventId: input.eventId,
        role: "uncertainty",
        observationIds: [],
        inferenceIds: inferences.map((inference) => inference.id),
        generatedAt,
        text: `BioPulse conserva ${inferences.length} inferencia${
          inferences.length === 1 ? "" : "s"
        } separada${inferences.length === 1 ? "" : "s"} de la evidencia para no transformar interpretaciones en hechos.`,
        caution: "Las inferencias son lectura interpretativa; no constituyen confirmación oficial.",
      })
    );
  }

  const cautionedObservationIds = eligible
    .filter(
      (observation) =>
        observation.narrativeUse.caution ||
        observation.evidence.limitations?.length ||
        observation.verification.status === "unreviewed" ||
        observation.verification.status === "conflicted"
    )
    .map((observation) => observation.id);

  if (cautionedObservationIds.length > 0) {
    fragments.push(
      makeFragment({
        eventId: input.eventId,
        role: "uncertainty",
        observationIds: cautionedObservationIds,
        generatedAt,
        text: `Incertidumbre conservada: ${cautionedObservationIds.length} observación${
          cautionedObservationIds.length === 1 ? "" : "es"
        } incluye${cautionedObservationIds.length === 1 ? "" : "n"} cautelas, limitaciones o verificación pendiente.`,
        caution:
          "BioPulse conserva la incertidumbre junto a la evidencia para evitar presentar datos parciales como verdad cerrada.",
      })
    );
  }

  return fragments.slice(0, maxFragments);
}
