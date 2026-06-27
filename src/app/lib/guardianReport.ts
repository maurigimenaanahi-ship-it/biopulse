import type { EnvironmentalEvent } from "@/data/events";
import type { GuardianEventMemory, GuardianMission, GuardianObservation } from "@/app/lib/guardianStore";
import { buildGuardianTimeline } from "@/app/lib/guardianTimeline";

const CATEGORY_LABELS: Record<EnvironmentalEvent["category"], string> = {
  fire: "Incendio",
  flood: "Inundación",
  storm: "Tormenta",
  heatwave: "Ola de calor",
  "air-pollution": "Contaminación del aire",
  "ocean-anomaly": "Anomalía oceánica",
};

const SOURCE_LABELS: Record<GuardianObservation["sourceType"], string> = {
  satellite: "Satélite",
  camera: "Cámara",
  news: "Noticia",
  official_document: "Documento oficial",
  physical_observation: "Observación física",
  other: "Otra fuente",
  none: "Sin fuente identificada",
};

const MISSION_STATUS_LABELS: Record<GuardianMission["status"], string> = {
  active: "Activa",
  completed: "Completada",
  insufficient_information: "Información insuficiente",
};

const LOCATION_LABELS: Record<GuardianObservation["locationPrecision"], string> = {
  event_area: "Zona general del evento",
  approximate: "Ubicación aproximada",
  protected: "Ubicación protegida",
  unknown: "Ubicación desconocida",
};

const SENSITIVITY_LABELS: Record<GuardianObservation["sensitivity"], string> = {
  none: "Sin contenido sensible identificado",
  sensitive: "Contenido sensible",
  unknown: "Sin evaluar",
};

const REVIEW_LABELS: Record<GuardianObservation["reviewStatus"], string> = {
  unreviewed: "Sin revisar",
  source_reviewed: "Fuente revisada sin segunda fuente independiente",
  source_agreement: "Coincidencia entre fuentes",
  source_conflict: "Contradicción entre fuentes",
  inconclusive: "No concluyente",
};

const SOURCE_ORDER: GuardianObservation["sourceType"][] = [
  "satellite",
  "camera",
  "news",
  "official_document",
  "physical_observation",
  "other",
  "none",
];

const REVIEW_ORDER: GuardianObservation["reviewStatus"][] = [
  "unreviewed",
  "source_reviewed",
  "source_agreement",
  "source_conflict",
  "inconclusive",
];

function utc(value: string | Date | null | undefined) {
  if (!value) return "No disponible";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "No disponible";
}

function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function guardianReportFileName(event: EnvironmentalEvent) {
  const slug = singleLine(event.location || event.title || event.id)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `biopulse-guardian-${slug || "evento"}.md`;
}

export type GuardianReportSummary = {
  totalObservations: number;
  totalMissions: number;
  closedMissions: number;
  activeMissions: number;
  bySource: Array<{ sourceType: GuardianObservation["sourceType"]; label: string; count: number }>;
  byReview: Array<{ status: GuardianObservation["reviewStatus"]; label: string; count: number }>;
  integrityCount: number;
  reviewedCount: number;
  sensitiveCount: number;
  sourceReferenceCount: number;
};

export function buildGuardianReportSummary({
  missions,
  observations,
}: {
  missions: GuardianMission[];
  observations: GuardianObservation[];
}): GuardianReportSummary {
  const bySource = SOURCE_ORDER.map((sourceType) => ({
    sourceType,
    label: SOURCE_LABELS[sourceType],
    count: observations.filter((observation) => observation.sourceType === sourceType).length,
  }));
  const byReview = REVIEW_ORDER.map((status) => ({
    status,
    label: REVIEW_LABELS[status],
    count: observations.filter((observation) => observation.reviewStatus === status).length,
  }));

  return {
    totalObservations: observations.length,
    totalMissions: missions.length,
    closedMissions: missions.filter((mission) => mission.status !== "active").length,
    activeMissions: missions.filter((mission) => mission.status === "active").length,
    bySource,
    byReview,
    integrityCount: observations.filter((observation) => Boolean(observation.integrity)).length,
    reviewedCount: observations.filter((observation) => observation.reviewStatus !== "unreviewed").length,
    sensitiveCount: observations.filter((observation) => observation.sensitivity === "sensitive").length,
    sourceReferenceCount: observations.filter((observation) => Boolean(observation.sourceReference)).length,
  };
}

export function buildGuardianReport({
  event,
  memory,
  missions,
  observations,
  generatedAt = new Date(),
}: {
  event: EnvironmentalEvent;
  memory?: GuardianEventMemory | null;
  missions: GuardianMission[];
  observations: GuardianObservation[];
  generatedAt?: Date;
}) {
  const orderedMissions = [...missions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  const orderedObservations = [...observations].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );
  const summary = buildGuardianReportSummary({ missions, observations });
  const timelineEntries = memory ? buildGuardianTimeline(memory, orderedMissions, orderedObservations) : [];

  const lines = [
    "# Informe Guardian local de BioPulse",
    "",
    "> Documento privado generado en este dispositivo. No constituye confirmación oficial, certificación de autenticidad ni cadena de custodia.",
    "",
    "## Evento",
    "",
    `- ID BioPulse: ${event.id}`,
    `- Título: ${singleLine(event.title)}`,
    `- Categoría: ${CATEGORY_LABELS[event.category]}`,
    `- Ubicación informada: ${singleLine(event.location)}`,
    `- Coordenadas: ${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}`,
    `- Observación del evento: ${utc(event.lastSeen ?? event.timestamp)}`,
    `- Informe generado: ${utc(generatedAt)}`,
    "",
    "## Resumen de procedencia",
    "",
    `- Misiones registradas: ${summary.totalMissions}`,
    `- Misiones cerradas: ${summary.closedMissions}`,
    `- Misiones activas: ${summary.activeMissions}`,
    `- Observaciones preservadas: ${summary.totalObservations}`,
    `- Observaciones con fuente declarada: ${summary.sourceReferenceCount}`,
    `- Observaciones revisadas: ${summary.reviewedCount}`,
    `- Observaciones con huella local SHA-256: ${summary.integrityCount}`,
    `- Observaciones marcadas como sensibles: ${summary.sensitiveCount}`,
    "",
    "### Fuentes declaradas",
    "",
    ...summary.bySource.map((item) => `- ${item.label}: ${item.count}`),
    "",
    "### Revisión de procedencia",
    "",
    ...summary.byReview.map((item) => `- ${item.label}: ${item.count}`),
    "",
    "## Cronología Guardian",
    "",
  ];

  if (timelineEntries.length === 0) {
    lines.push("No hay una cronología Guardian disponible para este informe.", "");
  } else {
    lines.push("Entradas ordenadas desde la más reciente hasta la más antigua.", "");
    timelineEntries.forEach((entry, index) => {
      lines.push(
        `### ${index + 1}. ${entry.title}`,
        "",
        `- Momento: ${utc(entry.at)}`,
        `- Tipo: ${entry.kind}`,
        `- Detalle: ${entry.detail ? singleLine(entry.detail) : "No informado"}`,
        ""
      );
    });
  }

  lines.push(
    "## Misiones Guardian",
    "",
  );

  if (orderedMissions.length === 0) {
    lines.push("No se registraron misiones Guardian para este evento.", "");
  } else {
    orderedMissions.forEach((mission, index) => {
      const linkedCount = orderedObservations.filter((observation) => observation.missionId === mission.id).length;
      lines.push(
        `### ${index + 1}. ${singleLine(mission.title)}`,
        "",
        `- Estado: ${MISSION_STATUS_LABELS[mission.status]}`,
        `- Pregunta: ${singleLine(mission.question)}`,
        `- Inicio: ${utc(mission.startedAt)}`,
        `- Cierre: ${utc(mission.closedAt)}`,
        `- Observaciones vinculadas: ${linkedCount}`,
        ""
      );
    });
  }

  lines.push("## Observaciones preservadas", "");
  if (orderedObservations.length === 0) {
    lines.push("No se registraron observaciones Guardian para este evento.", "");
  } else {
    orderedObservations.forEach((observation, index) => {
      const mission = observation.missionId
        ? orderedMissions.find((candidate) => candidate.id === observation.missionId)
        : null;
      lines.push(
        `### Observación ${index + 1}`,
        "",
        `- Dato observado: ${singleLine(observation.observedText)}`,
        `- Fuente declarada: ${SOURCE_LABELS[observation.sourceType]}`,
        `- Referencia: ${observation.sourceReference ? singleLine(observation.sourceReference) : "No informada"}`,
        `- Momento observado: ${utc(observation.observedAt)}`,
        `- Momento registrado: ${utc(observation.recordedAt)}`,
        `- Misión vinculada: ${mission ? singleLine(mission.title) : "Ninguna"}`,
        `- Precisión de ubicación declarada: ${LOCATION_LABELS[observation.locationPrecision]}`,
        `- Sensibilidad declarada: ${SENSITIVITY_LABELS[observation.sensitivity]}`,
        `- Revisión de procedencia: ${REVIEW_LABELS[observation.reviewStatus]}`,
        `- Fuente de contraste: ${observation.reviewSourceReference ? singleLine(observation.reviewSourceReference) : "No informada"}`,
        `- Notas de revisión: ${observation.reviewNote ? singleLine(observation.reviewNote) : "No informadas"}`,
        `- Momento de revisión: ${utc(observation.reviewedAt)}`,
        `- Integridad local: ${observation.integrity ? "Huella disponible" : "Sin huella"}`,
        `- Algoritmo: ${observation.integrity?.algorithm ?? "No disponible"}`,
        `- Huella: ${observation.integrity?.digest ?? "No disponible"}`,
        `- Huella generada: ${utc(observation.integrity?.generatedAt)}`,
        `- Interpretación Guardian: ${observation.interpretation ? singleLine(observation.interpretation) : "No informada"}`,
        `- Limitaciones: ${observation.limitations ? singleLine(observation.limitations) : "No informadas"}`,
        ""
      );
    });
  }

  lines.push(
    "## Alcance y límites",
    "",
    "Este informe reproduce datos declarados y conservados localmente por la persona usuaria. BioPulse mantiene separados los datos observados de las interpretaciones. La exportación no verifica fuentes, no certifica integridad forense y no reemplaza comunicaciones de autoridades u organismos competentes.",
    ""
  );

  return lines.join("\n");
}
