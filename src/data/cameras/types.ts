// src/data/cameras/types.ts

export type ISODateString = string; // "2026-02-05T18:22:10Z"

export type CameraMediaType = "snapshot" | "stream" | "embed";
export type StreamProtocol = "hls" | "dash" | "webrtc" | "rtsp" | "unknown";

export type CameraStatus = "active" | "degraded" | "down" | "unknown" | "retired";
export type ValidationStatus = "pending" | "verified" | "rejected";

export type FetchKind =
  | { kind: "image_url"; url: string }
  | { kind: "html_embed"; url: string; selectorHint?: string }
  | { kind: "stream_url"; url: string; protocol: StreamProtocol }
  | { kind: "provider_api"; provider: string; cameraKey: string; endpoint?: string };

export type UsagePolicy = {
  isPublic: boolean;
  termsUrl?: string;
  attributionText?: string;
  allowRedistribution?: boolean;
};

export type GeoPoint = {
  lat: number;
  lon: number;
  elevationM?: number;
};

export type Coverage = {
  countryISO2: string; // "AR", "CL", "US", etc.
  admin1?: string;    // provincia / estado
  admin2?: string;    // departamento / condado
  locality?: string;  // ciudad / paraje
  timezone?: string;
};

export type UpdateCadence = {
  expectedIntervalSec?: number;
  observedIntervalSec?: number;
  notes?: string;
};

export type Health = {
  status: CameraStatus;
  lastOkAt?: ISODateString;
  lastFailAt?: ISODateString;
  consecutiveFails?: number;
  lastLatencyMs?: number;
  lastHttpStatus?: number;
  staleAfterSec?: number;
};

export type CameraRecordV1 = {
  schema: "biopulse.camera.v1";
  id: string;                // global unique, estable
  providerId: string;        // referencia a provider
  providerCameraId?: string;

  title: string;
  description?: string;

  geo: GeoPoint;
  coverage: Coverage;

  mediaType: CameraMediaType;
  fetch: FetchKind;

  update?: UpdateCadence;
  usage: UsagePolicy;

  tags?: string[];
  reliabilityScore?: number; // 0..1
  priority?: number;

  validation: {
    status: ValidationStatus;
    verifiedBy?: string;
    verifiedAt?: ISODateString;
    rejectionReason?: string;
    evidenceUrls?: string[];
  };

  health?: Health;

  createdAt: ISODateString;
  updatedAt: ISODateString;
};
