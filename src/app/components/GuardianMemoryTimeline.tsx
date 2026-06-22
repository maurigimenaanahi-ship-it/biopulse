import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Fingerprint,
  History,
  Search,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { GuardianEventMemory, GuardianMission, GuardianObservation } from "@/app/lib/guardianStore";
import { buildGuardianTimeline, type GuardianTimelineKind } from "@/app/lib/guardianTimeline";

const SUMMARY_LIMIT = 8;

function TimelineIcon({ kind }: { kind: GuardianTimelineKind }) {
  const className = "h-3.5 w-3.5";
  if (kind === "space_prepared") return <ShieldCheck className={className} />;
  if (kind === "mission_started") return <Target className={className} />;
  if (kind === "mission_closed") return <CheckCircle2 className={className} />;
  if (kind === "observation_recorded") return <FileText className={className} />;
  if (kind === "provenance_reviewed") return <Search className={className} />;
  return <Fingerprint className={className} />;
}

function formatTimelineDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function GuardianMemoryTimeline({
  memory,
  missions,
  observations,
}: {
  memory: GuardianEventMemory;
  missions: GuardianMission[];
  observations: GuardianObservation[];
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(
    () => buildGuardianTimeline(memory, missions, observations),
    [memory, missions, observations]
  );
  const visibleEntries = expanded ? entries : entries.slice(0, SUMMARY_LIMIT);
  const canExpand = entries.length > SUMMARY_LIMIT;

  return (
    <section className="border-t border-white/10 px-4 py-4" aria-labelledby="guardian-memory-title">
      <div className="flex items-start gap-3">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200/65" />
        <div className="min-w-0">
          <h4 id="guardian-memory-title" className="text-sm font-semibold text-white/85">
            Memoria Guardian
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-white/40">
            Cronología privada reconstruida desde las acciones guardadas en este dispositivo.
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-0">
        {visibleEntries.map((entry, index) => (
          <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < visibleEntries.length - 1 ? (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-white/10" aria-hidden="true" />
            ) : null}
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-100/60">
              <TimelineIcon kind={entry.kind} />
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="text-xs font-semibold leading-relaxed text-white/70">{entry.title}</div>
              {entry.detail ? <div className="mt-0.5 text-xs leading-relaxed text-white/40">{entry.detail}</div> : null}
              <time dateTime={entry.at} className="mt-1 block text-[10px] text-white/30">
                {formatTimelineDate(entry.at)}
              </time>
            </div>
          </li>
        ))}
      </ol>

      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/55 hover:bg-white/10 hover:text-white/70"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Ver resumen" : `Ver toda la memoria (${entries.length})`}
        </button>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-white/30">
        Los tiempos reflejan registros locales. Esta cronología no constituye verificación externa ni cadena de custodia.
      </p>
    </section>
  );
}
