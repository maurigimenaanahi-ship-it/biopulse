import type { EnvironmentalEvent } from "@/data/events";
import type { GuardianMission, GuardianObservation } from "@/app/lib/guardianStore";

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

export function buildGuardianReport({
  event,
  missions,
  observations,
  generatedAt = new Date(),
}: {
  event: EnvironmentalEvent;
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
    "## Misiones Guardian",
    "",
  ];

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
