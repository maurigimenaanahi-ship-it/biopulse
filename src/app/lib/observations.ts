import type { EventCategory } from "@/data/events";

export type ObservationSchema = "biopulse.observation.v1";

export type ObservationRelation =
  | "detects_event"
  | "updates_event"
  | "nearby_context"
  | "impact_context"
  | "official_status"
  | "human_report"
  | "corroborates"
  | "contradicts"
  | "background";

export type ObservationType =
  | "satellite_detection"
  | "satellite_layer"
  | "fire_danger_forecast"
  | "camera_snapshot"
  | "weather_reading"
  | "news_report"
  | "official_reference"
  | "official_alert"
  | "guardian_report"
  | "infrastructure_context"
  | "environmental_context"
  | "community_context";

export type ObservationOriginKind = "human" | "official" | "automated" | "media" | "system";

export type ObservationActorType =
  | "guardian"
  | "agency"
  | "sensor"
  | "provider"
  | "journalist"
  | "biopulse";

export type ObservationLocationKind = "point" | "bbox" | "polygon" | "event_area" | "unknown";
export type ObservationLocationPrecision = "exact" | "approximate" | "protected" | "unknown";

export type EvidenceArtifactKind = "image" | "snapshot" | "link" | "document" | "measurement" | "text";

export type ObservationConfidenceLevel = "high" | "medium" | "low" | "unknown";

export type ObservationConfidenceBasis =
  | "official_source"
  | "direct_measurement"
  | "visual_evidence"
  | "single_human_report"
  | "multiple_sources"
  | "unverified_media"
  | "heuristic";

export type ObservationStatus =
  | "recorded"
  | "active"
  | "stale"
  | "superseded"
  | "disputed"
  | "retracted"
  | "confirmed"
  | "archived";

export type ObservationVerificationStatus =
  | "unreviewed"
  | "source_reviewed"
  | "corroborated"
  | "conflicted"
  | "official_confirmed"
  | "inconclusive";

export type NarrativeRole =
  | "first_detection"
  | "escalation"
  | "impact"
  | "response"
  | "context"
  | "human_memory"
  | "closure"
  | "uncertainty";

export type InferenceKind = "trend" | "risk" | "gap" | "possible_impact" | "source_conflict" | "summary";

export type InferenceGeneratedBy =
  | "biopulse_heuristic"
  | "human_guardian"
  | "official_interpretation"
  | "future_model";

export type ObservationRelatedEvent = {
  eventId: string;
  category?: EventCategory;
  relation: ObservationRelation;
};

export type ObservationOrigin = {
  kind: ObservationOriginKind;
  actorType: ObservationActorType;
  actorId?: string;
  displayName?: string;
};

export type ObservationSource = {
  id?: string;
  name: string;
  provider?: string;
  url?: string;
  license?: string;
  attribution?: string;
};

export type ObservationTimestamp = {
  observedAt: string;
  receivedAt?: string;
  recordedAt: string;
};

export type ObservationLocation = {
  kind: ObservationLocationKind;
  latitude?: number;
  longitude?: number;
  bbox?: [number, number, number, number];
  precision?: ObservationLocationPrecision;
};

export type EvidenceArtifact = {
  kind: EvidenceArtifactKind;
  url?: string;
  label?: string;
  hash?: string;
  mimeType?: string;
};

export type ObservationEvidence = {
  summary: string;
  artifacts?: EvidenceArtifact[];
  measurements?: Record<string, number | string | boolean | null>;
  limitations?: string[];
};

export type ObservationRawData = {
  providerPayload?: unknown;
  rawRef?: string;
  normalizedBy?: string;
  normalizedAt?: string;
};

export type ObservationConfidence = {
  level: ObservationConfidenceLevel;
  basis: ObservationConfidenceBasis;
  notes?: string;
};

export type ObservationProvenance = {
  chain: string[];
  fetchedBy?: string;
  transformedBy?: string;
  integrityHash?: string;
  attributionRequired?: boolean;
};

export type ObservationVerification = {
  status: ObservationVerificationStatus;
  reviewedBy?: string[];
  reviewedAt?: string;
  discussionIds?: string[];
};

export type ObservationNarrativeUse = {
  eligible: boolean;
  role?: NarrativeRole;
  caution?: string;
};

export type Observation = {
  schema: ObservationSchema;
  id: string;
  relatedEvent: ObservationRelatedEvent;
  type: ObservationType;
  origin: ObservationOrigin;
  source: ObservationSource;
  timestamp: ObservationTimestamp;
  location: ObservationLocation;
  evidence: ObservationEvidence;
  raw: ObservationRawData;
  confidence: ObservationConfidence;
  provenance: ObservationProvenance;
  status: ObservationStatus;
  verification: ObservationVerification;
  narrativeUse: ObservationNarrativeUse;
};

export type InferenceRecord = {
  schema: "biopulse.inference.v1";
  id: string;
  relatedEventId: string;
  derivedFromObservationIds: string[];
  kind: InferenceKind;
  statement: string;
  confidence: ObservationConfidenceLevel;
  caution: string;
  generatedBy: InferenceGeneratedBy;
  generatedAt: string;
};

export type NarrativeFragment = {
  schema: "biopulse.narrative-fragment.v1";
  id: string;
  relatedEventId: string;
  observationIds: string[];
  inferenceIds?: string[];
  role: NarrativeRole;
  text: string;
  generatedAt: string;
  caution?: string;
};
