// src/data/cameras/index.ts
import registry from "./cameraRegistry.sample.json";
import type { CameraRecordV1 } from "./types";

export const cameraRegistry = registry as CameraRecordV1[];
