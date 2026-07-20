import type { OfficialAlertRecord } from "./officialAlertTypes";

const EVACUATION_ALERT_KEYWORDS = [
  "evacuacion",
  "orden de evacuacion",
  "evacuacion obligatoria",
  "evacuacion preventiva",
  "evacuacion inmediata",
  "alerta de evacuacion",
  "evacuar",
  "evacue",
  "evacuen",
  "evacuado",
  "evacuada",
  "evacuados",
  "evacuadas",
  "autoevacuado",
  "autoevacuados",
  "auto evacuado",
  "auto evacuados",
  "desalojo preventivo",
  "desalojar",
  "centro de evacuados",
  "centros de evacuados",
  "refugio para evacuados",
  "albergue de evacuados",
];

const MANDATORY_EVACUATION_KEYWORDS = [
  "orden de evacuacion",
  "evacuacion obligatoria",
  "evacuacion inmediata",
  "evacuar",
  "evacue",
  "evacuen",
  "desalojar",
];

function normalizedSearchText(s: string | null | undefined) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function blobFrom(values: Array<string | null | undefined>) {
  return values.map((value) => normalizedSearchText(value)).join(" ").trim();
}

export function textMentionsEvacuation(...values: Array<string | null | undefined>) {
  const blob = blobFrom(values);
  if (!blob) return false;
  return EVACUATION_ALERT_KEYWORDS.some((keyword) => blob.includes(keyword));
}

export function officialAlertMentionsEvacuation(alert: OfficialAlertRecord) {
  if (alert.isLocalOfficialOrder) return true;
  return textMentionsEvacuation(
    alert.title,
    alert.eventTypeLabel,
    alert.description,
    alert.instruction,
    alert.areaDesc,
    alert.urgency,
    alert.certainty
  );
}

export function officialAlertLooksMandatoryEvacuation(alert: OfficialAlertRecord) {
  if (alert.isLocalOfficialOrder) return true;
  const blob = blobFrom([
    alert.title,
    alert.eventTypeLabel,
    alert.description,
    alert.instruction,
    alert.areaDesc,
  ]);
  if (!blob) return false;
  return MANDATORY_EVACUATION_KEYWORDS.some((keyword) => blob.includes(keyword));
}
