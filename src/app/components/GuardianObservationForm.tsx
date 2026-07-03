import { useEffect, useState } from "react";
import { AlertTriangle, Link2, Save, ShieldCheck } from "lucide-react";
import {
  createGuardianObservation,
  type GuardianExposurePreference,
  type GuardianLocalStore,
  type GuardianLocationPrecision,
  type GuardianObservationSource,
  type GuardianSensitivity,
} from "@/app/lib/guardianStore";

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-emerald-300/30";

export type GuardianObservationDraft = {
  id: string;
  label: string;
  sourceType: GuardianObservationSource;
  sourceReference: string;
  observedAt: string;
  limitations: string;
};

export function GuardianObservationForm({
  eventId,
  exposure,
  missionId,
  missionTitle,
  draft,
  onSaved,
  onDraftConsumed,
}: {
  eventId: string;
  exposure: GuardianExposurePreference;
  missionId?: string | null;
  missionTitle?: string | null;
  draft?: GuardianObservationDraft | null;
  onSaved: (store: GuardianLocalStore) => void;
  onDraftConsumed?: () => void;
}) {
  const [observedText, setObservedText] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [sourceType, setSourceType] = useState<GuardianObservationSource>("none");
  const [sourceReference, setSourceReference] = useState("");
  const [observedAt, setObservedAt] = useState(() => localDateTimeValue());
  const [limitations, setLimitations] = useState("");
  const [locationPrecision, setLocationPrecision] = useState<GuardianLocationPrecision>("event_area");
  const [sensitivity, setSensitivity] = useState<GuardianSensitivity>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sensitiveTextPattern =
    /\b(niñ[oa]s?|menor(?:es)?|persona(?:s)?|víctima(?:s)?|victima(?:s)?|herid[oa]s?|desaparecid[oa]s?|refugio|hospital|rostro|cara|nombre|dni|tel[eé]fono|direcci[oó]n|domicilio)\b/i;
  const sensitiveHint = sensitiveTextPattern.test(
    `${observedText} ${interpretation} ${sourceReference} ${limitations}`
  );

  useEffect(() => {
    if (!draft) return;
    const date = new Date(draft.observedAt);
    setSourceType(draft.sourceType);
    setSourceReference(draft.sourceReference);
    setObservedAt(Number.isFinite(date.getTime()) ? localDateTimeValue(date) : localDateTimeValue());
    setLimitations(draft.limitations);
    setError(null);
  }, [draft]);

  const submit = async () => {
    setSaving(true);
    try {
      const result = await createGuardianObservation({
        eventId,
        observedText,
        interpretation,
        sourceType,
        sourceReference,
        observedAt,
        limitations,
        locationPrecision,
        sensitivity,
        missionId: missionId ?? undefined,
      });
      onSaved(result.store);
      setObservedText("");
      setInterpretation("");
      setSourceType("none");
      setSourceReference("");
      setLimitations("");
      setObservedAt(localDateTimeValue());
      setError(null);
      onDraftConsumed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la observación.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="text-sm font-semibold text-white/85">Registrar observación privada</div>
      <div className="mt-1 text-xs leading-relaxed text-white/40">
        Describí algo concreto. Las conclusiones pertenecen al campo de interpretación.
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          "Observación: lo visible o consultado.",
          "Evidencia: fuente, enlace o referencia.",
          "Interpretación: separada y opcional.",
        ].map((item) => (
          <div
            key={item}
            className="flex items-start gap-2 rounded-xl border border-emerald-300/10 bg-emerald-400/[0.035] px-3 py-2 text-[11px] leading-relaxed text-white/48"
          >
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-200/55" />
            <span>{item}</span>
          </div>
        ))}
      </div>
      {missionId && missionTitle ? (
        <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.04] px-3 py-2 text-xs text-cyan-100/65">
          Misión activa: {missionTitle}
        </div>
      ) : null}
      {draft ? (
        <div className="mt-3 flex items-start gap-2 border-l-2 border-emerald-300/25 bg-emerald-400/[0.03] py-2 pl-3 pr-2 text-xs text-emerald-100/65">
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Fuente precargada: {draft.label}. Describí únicamente lo que observaste antes de guardar.
          </span>
        </div>
      ) : null}

      <div className="mt-4">
        <label className="text-xs font-medium text-white/60" htmlFor={`guardian-observed-${eventId}`}>
          Qué observé
        </label>
        <textarea
          id={`guardian-observed-${eventId}`}
          value={observedText}
          onChange={(event) => setObservedText(event.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Ej.: La cámara muestra una columna de humo gris. No se observan llamas desde este ángulo."
          className={fieldClass}
        />
        <div className="mt-1.5 text-[11px] leading-relaxed text-white/32">
          Evitá identificar personas o afirmar causas. Si no se ve con claridad, registrá esa limitación.
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-white/60">
          Fuente
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value as GuardianObservationSource)}
            className={fieldClass}
          >
            <option value="none">Sin fuente identificada</option>
            <option value="satellite">Satélite</option>
            <option value="camera">Cámara</option>
            <option value="news">Noticia</option>
            <option value="official_document">Documento oficial</option>
            <option value="physical_observation">Observación física</option>
            <option value="other">Otra fuente</option>
          </select>
        </label>
        <label className="text-xs font-medium text-white/60">
          Momento observado
          <input
            type="datetime-local"
            value={observedAt}
            onChange={(event) => setObservedAt(event.target.value)}
            className={fieldClass}
          />
        </label>
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-white/60" htmlFor={`guardian-source-${eventId}`}>
          Referencia de fuente
        </label>
        <input
          id={`guardian-source-${eventId}`}
          type="text"
          value={sourceReference}
          onChange={(event) => setSourceReference(event.target.value)}
          maxLength={1000}
          placeholder="URL, nombre del documento, cámara u otra referencia"
          className={fieldClass}
        />
        <div className="mt-1.5 text-[11px] leading-relaxed text-white/32">
          Esta referencia funciona como evidencia local. BioPulse no la convierte en confirmación oficial.
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-white/60">
          Tratamiento de ubicación
          <select
            value={locationPrecision}
            onChange={(event) => setLocationPrecision(event.target.value as GuardianLocationPrecision)}
            className={fieldClass}
          >
            <option value="event_area">Zona general del evento</option>
            <option value="approximate">Ubicación aproximada</option>
            <option value="protected">Ubicación protegida</option>
            <option value="unknown">Ubicación desconocida</option>
          </select>
        </label>
        <label className="text-xs font-medium text-white/60">
          Sensibilidad
          <select
            value={sensitivity}
            onChange={(event) => setSensitivity(event.target.value as GuardianSensitivity)}
            className={fieldClass}
          >
            <option value="unknown">Sin evaluar</option>
            <option value="none">Sin contenido sensible identificado</option>
            <option value="sensitive">Contenido sensible</option>
          </select>
        </label>
      </div>

      {sensitiveHint && sensitivity !== "sensitive" ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-relaxed text-amber-50/75">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200/75" />
          <span>
            Tu texto parece mencionar personas, identidad, refugios o información sensible. Revisá si corresponde marcar
            la observación como sensible o proteger la ubicación antes de guardar.
          </span>
        </div>
      ) : null}

      <div className="mt-3">
        <label className="text-xs font-medium text-white/60" htmlFor={`guardian-interpretation-${eventId}`}>
          Interpretación opcional
        </label>
        <textarea
          id={`guardian-interpretation-${eventId}`}
          value={interpretation}
          onChange={(event) => setInterpretation(event.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Ej.: Podría indicar viento hacia un sector, pero no conozco la orientación exacta de la cámara."
          className={fieldClass}
        />
        <div className="mt-1.5 text-[11px] leading-relaxed text-white/32">
          Usá lenguaje prudente: “podría”, “parece”, “no permite concluir”. No presentes inferencias como hechos.
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-white/60" htmlFor={`guardian-limitations-${eventId}`}>
          Limitaciones
        </label>
        <textarea
          id={`guardian-limitations-${eventId}`}
          value={limitations}
          onChange={(event) => setLimitations(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Visibilidad, retraso, orientación de cámara, precisión, fuente caída u otras limitaciones"
          className={fieldClass}
        />
      </div>

      {error ? <div className="mt-3 text-xs text-red-100/75">{error}</div> : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] leading-relaxed text-white/35">
          Visibilidad: privada · Exposición: {exposure.replaceAll("_", " ")}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!observedText.trim() || saving}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {saving ? "Generando huella local…" : "Guardar observación privada"}
        </button>
      </div>
    </div>
  );
}
