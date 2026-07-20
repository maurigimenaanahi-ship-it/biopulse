import { ChevronRight, ExternalLink, Siren, X } from "lucide-react";
import type { EnvironmentalEvent } from "@/data/events";
import type { OfficialPriorityMarker } from "@/app/lib/officialPriorityMarkers";

type Props = {
  marker: OfficialPriorityMarker | null;
  linkedEvent?: EnvironmentalEvent | null;
  index: number;
  count: number;
  onClose: () => void;
  onNext?: () => void;
  onOpenLinkedEvent?: (event: EnvironmentalEvent) => void;
};

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function OfficialPriorityPanel({
  marker,
  linkedEvent,
  index,
  count,
  onClose,
  onNext,
  onOpenLinkedEvent,
}: Props) {
  if (!marker) return null;

  const observedAt = formatDate(marker.observedAt);
  const expiresAt = formatDate(marker.expiresAt);

  return (
    <aside className="fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+88px)] z-[9999] max-w-[420px] md:left-auto md:right-[324px] md:top-24">
      <div className="border border-red-300/25 bg-red-950/55 text-red-50 shadow-2xl shadow-red-950/25 backdrop-blur-md rounded-lg">
        <div className="flex items-start justify-between gap-3 border-b border-red-200/10 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200/20 bg-red-500/15">
              <Siren className="h-5 w-5 text-red-100" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wider text-red-100/65">EVACUACION OFICIAL</div>
              <h2 className="mt-1 text-sm font-semibold leading-snug text-white">{marker.title}</h2>
              <div className="mt-1 text-xs text-red-50/60">
                {marker.source}
                {count > 1 ? ` - ${index + 1}/${count}` : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Cerrar alerta oficial"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {marker.detail ? <p className="text-sm leading-relaxed text-red-50/82">{marker.detail}</p> : null}

          <div className="grid gap-2 text-xs text-red-50/62">
            {observedAt ? (
              <div>
                <span className="text-red-50/40">Detectada: </span>
                {observedAt}
              </div>
            ) : null}
            {expiresAt ? (
              <div>
                <span className="text-red-50/40">Vigente hasta: </span>
                {expiresAt}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {marker.reportUrl ? (
              <a
                href={marker.reportUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-red-100/20 bg-red-100/10 px-3 py-2 text-xs font-medium text-red-50 transition-colors hover:bg-red-100/15"
              >
                <ExternalLink className="h-4 w-4" />
                Fuente oficial
              </a>
            ) : null}

            {linkedEvent && onOpenLinkedEvent ? (
              <button
                type="button"
                onClick={() => onOpenLinkedEvent(linkedEvent)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-medium text-white/78 transition-colors hover:bg-white/[0.12] hover:text-white"
              >
                Evento cercano
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}

            {count > 1 && onNext ? (
              <button
                type="button"
                onClick={onNext}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-medium text-white/78 transition-colors hover:bg-white/[0.12] hover:text-white"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
