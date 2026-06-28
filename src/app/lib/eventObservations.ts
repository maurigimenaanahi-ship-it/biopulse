import type { EnvironmentalEvent } from "@/data/events";
import type { GuardianEventMemory, GuardianObservation } from "@/app/lib/guardianStore";
import { eventToFirmsObservations } from "@/app/lib/firmsObservationAdapter";
import { normalizeGuardianObservation } from "@/app/lib/guardianObservationAdapter";
import { newsItemsToObservations, type NewsObservationClassification } from "@/app/lib/newsObservationAdapter";
import type { NewsItem } from "@/app/lib/newsTypes";
import { weatherCurrentToObservation } from "@/app/lib/weatherObservationAdapter";
import type { WeatherCurrent } from "@/app/lib/weatherTypes";
import type { InferenceRecord, Observation, ObservationType } from "@/app/lib/observations";

export type EventObservationSourceCounts = {
  firms: number;
  guardian: number;
  news: number;
  officialReferences: number;
  weather: number;
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
  sourceCounts: EventObservationSourceCounts;
  typeCounts: EventObservationTypeCount[];
};

export type BuildEventObservationsInput = {
  event: EnvironmentalEvent;
  guardianMemory?: GuardianEventMemory | null;
  guardianObservations?: GuardianObservation[];
  newsItems?: Array<{ item: NewsItem; classification: NewsObservationClassification }>;
  weather?: WeatherCurrent | null;
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
  const firmsObservations = eventToFirmsObservations(input.event, { normalizedAt: generatedAt });
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
  const guardianNormalizations = (input.guardianObservations ?? [])
    .filter((observation) => isRelatedGuardianObservation(input.event, observation))
    .map((observation) => normalizeGuardianObservation(observation, input.guardianMemory));

  const guardianObservations = guardianNormalizations.map((item) => item.observation);
  const guardianInferences = guardianNormalizations
    .map((item) => item.inference)
    .filter((item): item is InferenceRecord => Boolean(item));

  const observations = sortObservations([
    ...firmsObservations,
    ...weatherObservations,
    ...newsObservations,
    ...guardianObservations,
  ]);
  const inferences = sortInferences(guardianInferences);

  return {
    eventId: eventIdentity(input.event),
    generatedAt,
    observations,
    inferences,
    sourceCounts: {
      firms: firmsObservations.length,
      guardian: guardianObservations.length,
      news: newsObservations.filter((observation) => observation.type === "news_report").length,
      officialReferences: newsObservations.filter((observation) => observation.type === "official_reference").length,
      weather: weatherObservations.length,
    },
    typeCounts: countByType(observations),
  };
}
