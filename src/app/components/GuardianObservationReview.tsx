import { useState } from "react";
import { Save, Search, X } from "lucide-react";
import {
  reviewGuardianObservation,
  type GuardianLocalStore,
  type GuardianObservation,
  type GuardianReviewStatus,
} from "@/app/lib/guardianStore";

const REVIEW_OPTIONS: Array<{ value: GuardianReviewStatus; label: string; description: string }> = [
  {
    value: "unreviewed",
    label: "Sin revisar",
    description: "Todavía no se registró un intento de contraste.",
  },
  {
    value: "source_reviewed",
    label: "Fuente revisada",
    description: "Se revisó la procedencia disponible, sin una segunda fuente independiente.",
  },
  {
    value: "source_agreement",
    label: "Coincidencia entre fuentes",
    description: "Otra fuente consultada muestra información compatible.",
  },
  {
    value: "source_conflict",
    label: "Contradicción entre fuentes",
    description: "Las fuentes consultadas no coinciden y la diferencia debe conservarse.",
  },
  {
    value: "inconclusive",
    label: "No concluyente",
    description: "La revisión no alcanzó para sostener ni descartar la observación.",
  },
];

export function guardianReviewLabel(status: GuardianReviewStatus) {
  return REVIEW_OPTIONS.find((option) => option.value === status)?.label ?? "Sin revisar";
}

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-cyan-300/30";

export function GuardianObservationReview({
  observation,
  onSaved,
}: {
  observation: GuardianObservation;
  onSaved: (store: GuardianLocalStore) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GuardianReviewStatus>(observation.reviewStatus);
  const [sourceReference, setSourceReference] = useState(observation.reviewSourceReference ?? "");
  const [note, setNote] = useState(observation.reviewNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const selected = REVIEW_OPTIONS.find((option) => option.value === status) ?? REVIEW_OPTIONS[0];
  const requiresContrastSource = status === "source_agreement" || status === "source_conflict";

  const save = () => {
    try {
      onSaved(
        reviewGuardianObservation(observation.id, {
          status,
          sourceReference,
          note,
        })
      );
      if (status === "unreviewed") {
        setSourceReference("");
        setNote("");
      }
      setError(null);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la revisión.");
    }
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-cyan-100/45">Revisión de procedencia</div>
          <div className="mt-1 text-xs font-medium text-white/55">{guardianReviewLabel(observation.reviewStatus)}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (open) {
              setStatus(observation.reviewStatus);
              setSourceReference(observation.reviewSourceReference ?? "");
              setNote(observation.reviewNote ?? "");
            }
            setOpen(!open);
            setError(null);
          }}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10"
        >
          {open ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          {open ? "Cancelar" : "Revisar"}
        </button>
      </div>

      {observation.reviewStatus !== "unreviewed" && !open ? (
        <div className="mt-2 text-[11px] leading-relaxed text-white/35">
          {observation.reviewSourceReference ? `Contraste: ${observation.reviewSourceReference}` : "Sin fuente adicional declarada."}
          {observation.reviewNote ? ` · ${observation.reviewNote}` : ""}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-400/[0.03] p-3">
          <label className="text-xs font-medium text-white/60">
            Resultado de la revisión
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as GuardianReviewStatus)}
              className={fieldClass}
            >
              {REVIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 text-[11px] leading-relaxed text-white/35">{selected.description}</div>

          <label className="mt-3 block text-xs font-medium text-white/60">
            Fuente de contraste {requiresContrastSource ? "· obligatoria" : "· opcional"}
            <input
              type="text"
              value={sourceReference}
              onChange={(event) => setSourceReference(event.target.value)}
              maxLength={1000}
              placeholder="URL, documento, cámara u otra referencia independiente"
              className={fieldClass}
            />
          </label>

          <label className="mt-3 block text-xs font-medium text-white/60">
            Notas de revisión
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={3000}
              placeholder="Qué se comparó, qué coincide, qué difiere o qué sigue faltando"
              className={fieldClass}
            />
          </label>

          <div className="mt-3 text-[11px] leading-relaxed text-white/35">
            Esta revisión registra un contraste Guardian. No constituye confirmación oficial ni certificación de autenticidad.
          </div>
          {error ? <div className="mt-2 text-xs text-red-100/75">{error}</div> : null}
          <button
            type="button"
            onClick={save}
            disabled={requiresContrastSource && !sourceReference.trim()}
            className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100/75 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            Guardar revisión
          </button>
        </div>
      ) : null}
    </div>
  );
}
