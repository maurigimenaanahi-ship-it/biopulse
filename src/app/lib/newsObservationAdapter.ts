import type { EnvironmentalEvent } from "@/data/events";
import type { NewsItem } from "@/app/lib/newsTypes";
import type {
  Observation,
  ObservationConfidence,
  ObservationLocation,
  ObservationNarrativeUse,
  ObservationType,
} from "@/app/lib/observations";

const ADAPTER_ID = "biopulse.news-observation-adapter.v1";

export type NewsObservationClassification = "official_reference" | "regional_report";

function eventIdentity(event: EnvironmentalEvent) {
  return event.eventId || event.id;
}

function validIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function fallbackObservedAt(event: EnvironmentalEvent) {
  return validIso(event.timestamp) ?? new Date(0).toISOString();
}

function safeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function slugPart(value: string | null | undefined, fallback: string) {
  const text = safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return text || fallback;
}

function stableNewsObservationId(event: EnvironmentalEvent, item: NewsItem, classification: NewsObservationClassification) {
  return `news:${eventIdentity(event)}:${classification}:${item.id || slugPart(item.url, slugPart(item.title, "item"))}`;
}

function locationForEvent(event: EnvironmentalEvent): ObservationLocation {
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { kind: "unknown", precision: "unknown" };
  }

  return {
    kind: "event_area",
    latitude,
    longitude,
    precision: "approximate",
  };
}

function confidenceFor(classification: NewsObservationClassification, item: NewsItem): ObservationConfidence {
  if (classification === "official_reference") {
    return {
      level: item.domain ? "medium" : "low",
      basis: "unverified_media",
      notes:
        "Referencia clasificada operativamente como oficial desde dominio o texto. Requiere verificación de fuente original.",
    };
  }

  return {
    level: "low",
    basis: "unverified_media",
    notes: "Reporte informativo recuperado por fuente de noticias; debe contrastarse con fuentes independientes.",
  };
}

function observationTypeFor(classification: NewsObservationClassification): ObservationType {
  return classification === "official_reference" ? "official_reference" : "news_report";
}

function narrativeUseFor(classification: NewsObservationClassification): ObservationNarrativeUse {
  if (classification === "official_reference") {
    return {
      eligible: true,
      role: "response",
      caution:
        "Referencia con apariencia oficial. No tratar como alerta oficial estructurada hasta revisar la fuente original.",
    };
  }

  return {
    eligible: true,
    role: "context",
    caution: "Usar como contexto informativo, no como confirmación oficial ni evidencia directa del evento.",
  };
}

function summaryFor(item: NewsItem, classification: NewsObservationClassification) {
  const title = safeText(item.title);
  const summary = safeText(item.summary);

  if (title && summary) return `${title} — ${summary}`;
  if (title) return title;
  if (summary) return summary;

  return classification === "official_reference"
    ? "Referencia informativa clasificada operativamente como oficial."
    : "Referencia informativa relacionada con el evento.";
}

export function newsItemToObservation(args: {
  event: EnvironmentalEvent;
  item: NewsItem;
  classification: NewsObservationClassification;
  normalizedAt?: string;
}): Observation {
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  const observedAt = validIso(args.item.publishedAt) ?? fallbackObservedAt(args.event);
  const type = observationTypeFor(args.classification);

  return {
    schema: "biopulse.observation.v1",
    id: stableNewsObservationId(args.event, args.item, args.classification),
    relatedEvent: {
      eventId: eventIdentity(args.event),
      category: args.event.category,
      relation: args.classification === "official_reference" ? "official_status" : "nearby_context",
    },
    type,
    origin: {
      kind: args.classification === "official_reference" ? "media" : "media",
      actorType: "journalist",
      displayName: args.item.domain ?? "Fuente informativa",
    },
    source: {
      id: args.item.domain ?? undefined,
      name: args.item.domain ?? "Fuente informativa",
      provider: "News Worker / GDELT",
      url: args.item.url ?? undefined,
      attribution: "Referencia informativa recuperada por BioPulse; revisar fuente original.",
    },
    timestamp: {
      observedAt,
      recordedAt: normalizedAt,
    },
    location: locationForEvent(args.event),
    evidence: {
      summary: summaryFor(args.item, args.classification),
      artifacts: args.item.url
        ? [{ kind: "link", url: args.item.url, label: "Abrir fuente original" }]
        : undefined,
      measurements: {
        language: args.item.language,
        sourceCountry: args.item.sourceCountry,
        domain: args.item.domain,
        classification: args.classification,
      },
      limitations: [
        args.classification === "official_reference"
          ? "Clasificación operativa por dominio o texto; no equivale a canal oficial estructurado."
          : "Reporte informativo externo; puede estar incompleto, desactualizado o no verificado.",
      ],
    },
    raw: {
      providerPayload: args.item,
      normalizedBy: ADAPTER_ID,
      normalizedAt,
    },
    confidence: confidenceFor(args.classification, args.item),
    provenance: {
      chain: ["news_worker", "gdelt", args.classification, ADAPTER_ID],
      transformedBy: ADAPTER_ID,
      attributionRequired: true,
    },
    status: "recorded",
    verification: {
      status: args.classification === "official_reference" ? "source_reviewed" : "unreviewed",
    },
    narrativeUse: narrativeUseFor(args.classification),
  };
}

export function newsItemsToObservations(args: {
  event: EnvironmentalEvent;
  items: Array<{ item: NewsItem; classification: NewsObservationClassification }>;
  normalizedAt?: string;
}): Observation[] {
  const normalizedAt = args.normalizedAt ?? new Date().toISOString();
  return args.items.map(({ item, classification }) =>
    newsItemToObservation({ event: args.event, item, classification, normalizedAt })
  );
}
