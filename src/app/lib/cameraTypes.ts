export type CameraRegistryItem = {
  schema: "biopulse.camera.v1";
  id: string;
  providerId?: string;
  title?: string;
  description?: string;
  geo: { lat: number; lon: number };
  coverage?: { countryISO2?: string; admin1?: string; locality?: string };
  mediaType?: "snapshot" | "video" | "stream" | "embed";
  fetch:
    | { kind: "image_url"; url: string }
    | { kind: "provider_api"; provider: string; cameraKey: string; endpoint?: string }
    | { kind: string; [key: string]: unknown };
  update?: { expectedIntervalSec?: number };
  usage?: { isPublic?: boolean; attributionText?: string; termsUrl?: string };
  tags?: string[];
  priority?: number;
  validation?: { status?: "pending" | "verified" | "rejected"; verifiedBy?: string; verifiedAt?: string };
  createdAt?: string;
  updatedAt?: string;
};

export type LoadedCamera = CameraRegistryItem & { distanceKm: number };

export type ProviderCameraSnapshot = {
  status: "loading" | "ready" | "error";
  snapshotUrl?: string | null;
  detailUrl?: string | null;
  attributionText?: string | null;
  message?: string;
};
