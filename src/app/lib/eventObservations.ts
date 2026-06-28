import type { EnvironmentalEvent } from "@/data/events";
import type { GuardianEventMemory, GuardianObservation } from "@/app/lib/guardianStore";
import { camerasToObservations, type CameraObservationInput } from "@/app/lib/cameraObservationAdapter";
import type {
  AccessRoutesResponse,
  CriticalInfrastructureResponse,
  NearbyCommunitiesResponse,
  ProtectedContextResponse,
  WaterContextResponse,
} from "@/app/lib/contextObservationTypes";
import { environmentalContextsToObservations } from "@/app/lib/environmentalContextObservationAdapter";
import { fireHistoryToObservation } from "@/app/lib/fireHistoryObservationAdapter";
import type { FireHistoryResponse } from "@/app/lib/fireHistoryTypes";
import { eventToFirmsObservations } from "@/app/lib/firmsObservationAdapter";
import { normalizeGuardianObservation } from "@/app/lib/guardianObservationAdapter";
import { humanContextsToObservations } from "@/app/lib/humanContextObservationAdapter";
import { buildNarrativeFragments } from "@/app/lib/narrativeFragments";
import { newsItemsToObservations, type NewsObservationClassification } from "@/app/lib/newsObservationAdapter";
import type { NewsItem } from "@/app/lib/newsTypes";
import { weatherCurrentToObservation } from "@/app/lib/weatherObservationAdapter";
import type { WeatherCurrent } from "@/app/lib/weatherTypes";
import type { InferenceRecord, NarrativeFragment, Observation, ObservationType } from "@/app/lib/observations";

export type EventObservationSourceCounts = {
  firms: number;
  guardian: number;
  news: number;
  officialReferences: number;
  weather: number;
  cameras: number;
  environmental: number;
  humanContext: number;
};

export type EventObservationTypeCount = {
  type: ObservationType;
  count: number;
};

export type EventObservationBundle = {
  eventId: string;
  generatedAt: string;
  observations: Observation[];
  inferences: InferenceRecord[];
  narrativeFragments: NarrativeFragment[];
  sourceCounts: EventObservationSourceCounts;
  typeCounts: EventObservationTypeCount[];
};

export type BuildEventObservationsInput = {
  event: EnvironmentalEvent;
  guardianMemory?: GuardianEventMemory | null;
  guardianObservations?: GuardianObservation[];
  newsItems?: Array<{ item: NewsItem; classification: NewsObservationClassification }>;
  weather?: WeatherCurrent | null;
  cameras?: CameraObservationInput[];
  fireHistory?: FireHistoryResponse | null;
  protectedContext?: ProtectedContextResponse | null;
  waterContext?: WaterContextResponse | null;
  criticalInfrastructure?: CriticalInfrastructureResponse | null;
  nearbyCommunities?: NearbyCommunitiesResponse | null;
  accessRoutes?: AccessRoutesResponse | null;
  generatedAt?: string;
};

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function isRelatedGuardianObservation(event: EnvironmentalEvent, observation: GuardianObservation) {
  return observation.eventId === event.id || observation.eventId === event.eventId;
}

function sortObservations(observations: Observation[]) {
  return [...observations].sort((a, b) => {
    const aTime = new Date(a.timestamp.observedAt || a.timestamp.recordedAt).getTime();
    const bTime = new Date(b.timestamp.observedAt || b.timestamp.recordedAt).getTime();

    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return a.id.localeCompare(b.id);
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;

    return aTime - bTime || a.id.localeCompare(b.id);
  });
}

function sortInferences(inferences: InferenceRecord[]) {
  return [...inferences].sort((a, b) => {
    const aTime = new Date(a.generatedAt).getTime();
    const bTime = new Date(b.generatedAt).getTime();

    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return a.id.localeCompare(b.id);
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;

    return aTime - bTime || a.id.localeCompare(b.id);
  });
}

function countByType(observations: Observation[]): EventObservationTypeCount[] {
  const counts = new Map<ObservationType, number>();

  for (const observation of observations) {
    counts.set(observation.type, (counts.get(observation.type) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

export function buildEventObservations(input: BuildEventObservationsInput): EventObservationBundle {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const eventId = eventIdentity(input.event);
  const firmsObservations = eventToFirmsObservations(input.event, { normalizedAt: generatedAt });
  const fireHistoryObservation = fireHistoryToObservation({
    event: input.event,
    history: input.fireHistory ?? null,
    normalizedAt: generatedAt,
  });
  const fireHistoryObservations = fireHistoryObservation ? [fireHistoryObservation] : [];
  const newsObservations = newsItemsToObservations({
    event: input.event,
    items: input.newsItems ?? [],
    normalizedAt: generatedAt,
  });
  const weatherObservation = weatherCurrentToObservation({
    event: input.event,
    weather: input.weather ?? null,
    normalizedAt: generatedAt,
  });
  const weatherObservations = weatherObservation ? [weatherObservation] : [];
  const cameraObservations = camerasToObservations({
    event: input.event,
    cameras: input.cameras ?? [],
    normalizedAt: generatedAt,
  });
  const environmentalObservations = environmentalContextsToObservations({
    event: input.event,
    protectedContext: input.protectedContext ?? null,
    waterContext: input.waterContext ?? null,
    normalizedAt: generatedAt,
  });
  const humanContextObservations = humanContextsToObservations({
    event: input.event,
    criticalInfrastructure: input.criticalInfrastructure ?? null,
    nearbyCommunities: input.nearbyCommunities ?? null,
    accessRoutes: input.accessRoutes ?? null,
    normalizedAt: generatedAt,
  });
  const guardianNormalizations = (input.guardianObservations ?? [])
    .filter((observation) => isRelatedGuardianObservation(input.event, observation))
    .map((observation) => normalizeGuardianObservation(observation, input.guardianMemory));

  const guardianObservations = guardianNormalizations.map((item) => item.observation);
  const guardianInferences = guardianNormalizations
    .map((item) => item.inference)
    .filter((item): item is InferenceRecord => Boolean(item));

  const observations = sortObservations([
    ...firmsObservations,
    ...fireHistoryObservations,
    ...weatherObservations,
    ...cameraObservations,
    ...newsObservations,
    ...environmentalObservations,
    ...humanContextObservations,
    ...guardianObservations,
  ]);
  const inferences = sortInferences(guardianInferences);
  const narrativeFragments = buildNarrativeFragments({
    eventId,
    observations,
    inferences,
    generatedAt,
  });

  return {
    eventId,
    generatedAt,
    observations,
    inferences,
    narrativeFragments,
    sourceCounts: {
      firms: firmsObservations.length + fireHistoryObservations.length,
      guardian: guardianObservations.length,
      news: newsObservations.filter((observation) => observation.type === "news_report").length,
      officialReferences: newsObservations.filter((observation) => observation.type === "official_reference").length,
      weather: weatherObservations.length,
      cameras: cameraObservations.length,
      environmental: environmentalObservations.length,
      humanContext: humanContextObservations.length,
    },
    typeCounts: countByType(observations),
  };
}
