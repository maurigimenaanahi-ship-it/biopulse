import { useState } from "react";
import { Save } from "lucide-react";
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

export function GuardianObservationForm({
  eventId,
  exposure,
  onSaved,
}: {
  eventId: string;
  exposure: GuardianExposurePreference;
  onSaved: (store: GuardianLocalStore) => void;
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

  const submit = () => {
    try {
      const result = createGuardianObservation({
        eventId,
        observedText,
        interpretation,
        sourceType,
        sourceReference,
        observedAt,
        limitations,
        locationPrecision,
        sensitivity,
      });
      onSaved(result.store);
      setObservedText("");
      setInterpretation("");
      setSourceReference("");
      setLimitations("");
      setObservedAt(localDateTimeValue());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la observación.");
    }
  };

  return (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="text-sm font-semibold text-white/85">Registrar observación privada</div>
      <div className="mt-1 text-xs leading-relaxed text-white/40">
        Describí algo concreto. Las conclusiones pertenecen al campo de interpretación.
      </div>

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
          placeholder="Descripción concreta de lo observado"
          className={fieldClass}
        />
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
          placeholder="Qué podría significar, separado de lo observado"
          className={fieldClass}
        />
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
          placeholder="Visibilidad, retraso, precisión u otras limitaciones"
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
          disabled={!observedText.trim()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          Guardar observación privada
        </button>
      </div>
    </div>
  );
}
