import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LogOut, ShieldCheck } from "lucide-react";
import {
  closeGuardianSession,
  type GuardianLocalStore,
  type GuardianMission,
  type GuardianObservation,
  type GuardianSessionClosure,
} from "@/app/lib/guardianStore";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-emerald-300/30";

export function GuardianSessionClosePanel({
  eventId,
  observations,
  missions,
  sessionClosures,
  onStoreChange,
  onSessionClosed,
}: {
  eventId: string;
  observations: GuardianObservation[];
  missions: GuardianMission[];
  sessionClosures: GuardianSessionClosure[];
  onStoreChange: (store: GuardianLocalStore) => void;
  onSessionClosed?: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justClosed, setJustClosed] = useState(false);
  const activeMissionCount = missions.filter((mission) => mission.status === "active").length;
  const sensitiveCount = observations.filter((observation) => observation.sensitivity === "sensitive").length;
  const reviewedCount = observations.filter((observation) => observation.reviewStatus !== "unreviewed").length;
  const sourceCount = new Set(
    observations
      .filter((observation) => observation.sourceType !== "none")
      .map((observation) => observation.sourceType)
  ).size;
  const latestClosure = useMemo(
    () =>
      [...sessionClosures].sort(
        (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
      )[0] ?? null,
    [sessionClosures]
  );

  const closeSession = () => {
    try {
      const store = closeGuardianSession(eventId, note);
      onStoreChange(store);
      setNote("");
      setError(null);
      setJustClosed(true);
      onSessionClosed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la sesión Guardian.");
    }
  };

  return (
    <section className="border-t border-white/10 px-4 py-4" aria-labelledby="guardian-close-title">
      <div className="flex items-start gap-3">
        <LogOut className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200/70" />
        <div className="min-w-0">
          <h4 id="guardian-close-title" className="text-sm font-semibold text-white/85">
            Cerrar sesión Guardian
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-white/40">
            Cerrá la observación con un resumen local. Esto no publica información ni modifica el evento.
          </p>
        </div>
      </div>

      {justClosed && latestClosure ? (
        <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.07] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-50/85">
            <CheckCircle2 className="h-4 w-4" />
            Tu sesión de observación finalizó
          </div>
          <div className="mt-1 text-xs leading-relaxed text-emerald-50/55">
            Cierre guardado el {formatDate(latestClosure.closedAt)} en este dispositivo.
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <div className="text-[10px] uppercase tracking-wide text-white/35">Observaciones</div>
          <div className="mt-1 text-xl font-semibold text-white/85">{observations.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <div className="text-[10px] uppercase tracking-wide text-white/35">Fuentes</div>
          <div className="mt-1 text-xl font-semibold text-white/85">{sourceCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <div className="text-[10px] uppercase tracking-wide text-white/35">Revisadas</div>
          <div className="mt-1 text-xl font-semibold text-white/85">{reviewedCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <div className="text-[10px] uppercase tracking-wide text-white/35">Sensibles</div>
          <div className="mt-1 text-xl font-semibold text-white/85">{sensitiveCount}</div>
        </div>
      </div>

      {activeMissionCount > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-relaxed text-amber-50/75">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200/75" />
          <span>
            Hay {activeMissionCount} misión{activeMissionCount === 1 ? "" : "es"} activa
            {activeMissionCount === 1 ? "" : "s"}. Podés cerrar la sesión igual, pero el pendiente quedará visible.
          </span>
        </div>
      ) : null}

      <label className="mt-4 block text-xs font-medium text-white/60">
        Nota privada de cierre opcional
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={1200}
          placeholder="Ej.: Revisé cámaras y clima. No encontré cambios visibles suficientes para concluir."
          className={fieldClass}
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-[11px] leading-relaxed text-white/35">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-200/45" />
          <span>El cierre queda guardado como memoria privada local. No equivale a publicación ni verificación externa.</span>
        </div>
        <button
          type="button"
          onClick={closeSession}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15"
        >
          <CheckCircle2 className="h-4 w-4" />
          Cerrar sesión Guardian
        </button>
      </div>

      {error ? <div className="mt-3 text-xs text-red-100/75">{error}</div> : null}
    </section>
  );
}
