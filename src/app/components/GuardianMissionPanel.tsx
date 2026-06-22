import { useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, Play, Target } from "lucide-react";
import {
  closeGuardianMission,
  startGuardianMission,
  type GuardianLocalStore,
  type GuardianMission,
  type GuardianMissionKind,
} from "@/app/lib/guardianStore";

export type GuardianMissionTemplate = {
  kind: GuardianMissionKind;
  title: string;
  question: string;
  available: boolean;
  unavailableReason?: string;
};

function missionStatusLabel(status: GuardianMission["status"]) {
  if (status === "completed") return "Completada";
  if (status === "insufficient_information") return "Información insuficiente";
  return "Activa";
}

export function GuardianMissionPanel({
  eventId,
  templates,
  activeMission,
  linkedObservationCount,
  recentMissions,
  onStoreChange,
}: {
  eventId: string;
  templates: GuardianMissionTemplate[];
  activeMission: GuardianMission | null;
  linkedObservationCount: number;
  recentMissions: GuardianMission[];
  onStoreChange: (store: GuardianLocalStore) => void;
}) {
  const firstAvailable = templates.find((template) => template.available)?.kind ?? templates[0]?.kind ?? "identify_gaps";
  const [selectedKind, setSelectedKind] = useState<GuardianMissionKind>(firstAvailable);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templates.some((template) => template.kind === selectedKind && template.available)) {
      setSelectedKind(firstAvailable);
    }
  }, [firstAvailable, selectedKind, templates]);

  const selected = templates.find((template) => template.kind === selectedKind) ?? null;

  const begin = () => {
    if (!selected?.available) return;
    try {
      onStoreChange(
        startGuardianMission({
          eventId,
          kind: selected.kind,
          title: selected.title,
          question: selected.question,
        }).store
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la misión.");
    }
  };

  const close = (status: "completed" | "insufficient_information") => {
    if (!activeMission) return;
    try {
      onStoreChange(closeGuardianMission(activeMission.id, status));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la misión.");
    }
  };

  return (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="flex items-start gap-3">
        <Target className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200/70" />
        <div>
          <div className="text-sm font-semibold text-white/85">Mi misión</div>
          <div className="mt-1 text-xs leading-relaxed text-white/40">
            Una pregunta concreta orienta la observación. No encontrar información suficiente también es un resultado válido.
          </div>
        </div>
      </div>

      {activeMission ? (
        <div className="mt-4 border-l-2 border-cyan-300/25 pl-4">
          <div className="text-[10px] uppercase tracking-wide text-cyan-100/50">Misión activa</div>
          <div className="mt-1 text-sm font-semibold text-white/80">{activeMission.title}</div>
          <div className="mt-1 text-xs leading-relaxed text-white/50">{activeMission.question}</div>
          <div className="mt-2 text-[11px] text-white/35">
            {linkedObservationCount} {linkedObservationCount === 1 ? "observación vinculada" : "observaciones vinculadas"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => close("completed")}
              disabled={linkedObservationCount === 0}
              title={linkedObservationCount === 0 ? "Guardá al menos una observación para completar la misión." : undefined}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100/80 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Marcar completada
            </button>
            <button
              type="button"
              onClick={() => close("insufficient_information")}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Información insuficiente
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <label className="text-xs font-medium text-white/60">
            Elegir misión
            <select
              value={selectedKind}
              onChange={(event) => setSelectedKind(event.target.value as GuardianMissionKind)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white/80 outline-none focus:border-cyan-300/30"
            >
              {templates.map((template) => (
                <option key={template.kind} value={template.kind} disabled={!template.available}>
                  {template.title}{template.available ? "" : " · no disponible"}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="mt-3 text-xs leading-relaxed text-white/45">
              {selected.available ? selected.question : selected.unavailableReason}
            </div>
          ) : null}
          <button
            type="button"
            onClick={begin}
            disabled={!selected?.available}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100/85 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            Iniciar misión
          </button>
        </div>
      )}

      {error ? <div className="mt-3 text-xs text-red-100/75">{error}</div> : null}

      {recentMissions.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="text-[10px] uppercase tracking-wide text-white/35">Misiones anteriores</div>
          <div className="mt-2 space-y-2">
            {recentMissions.slice(0, 3).map((mission) => (
              <div key={mission.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="min-w-0 text-white/50">{mission.title}</span>
                <span className="shrink-0 text-white/35">{missionStatusLabel(mission.status)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
