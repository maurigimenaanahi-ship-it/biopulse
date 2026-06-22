import { useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, Upload, X } from "lucide-react";
import {
  createGuardianBackup,
  parseGuardianBackup,
  restoreGuardianBackup,
  type GuardianBackupPreview,
} from "@/app/lib/guardianBackup";
import type { GuardianLocalStore } from "@/app/lib/guardianStore";

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

function localDate(value: string) {
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GuardianBackupControls({
  onRestore,
}: {
  onRestore: (store: GuardianLocalStore) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<GuardianBackupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const downloadBackup = () => {
    const content = createGuardianBackup();
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `biopulse-guardian-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setError(null);
  };

  const inspectBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPreview(null);
    setRestored(false);
    if (file.size > MAX_BACKUP_BYTES) {
      setError("El archivo supera el límite local de 5 MB.");
      return;
    }
    try {
      setPreview(parseGuardianBackup(await file.text()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el respaldo.");
    }
  };

  const confirmRestore = () => {
    if (!preview) return;
    try {
      const store = restoreGuardianBackup(preview);
      onRestore(store);
      setPreview(null);
      setRestored(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar la memoria Guardian.");
    }
  };

  return (
    <section className="border-t border-white/10 px-5 py-4 md:px-6" aria-labelledby="guardian-backup-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="guardian-backup-title" className="text-sm font-semibold text-white/75">
            Respaldo local
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/40">
            Conservá una copia fuera del navegador o restaurá una anterior. El archivo no se envía a BioPulse.
          </p>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-amber-100/45">
            Puede contener observaciones sensibles y ubicaciones. Guardalo como información privada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadBackup}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-300/15 bg-emerald-400/[0.06] px-3 py-1.5 text-xs font-semibold text-emerald-100/70 hover:bg-emerald-400/10"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10"
          >
            <Upload className="h-3.5 w-3.5" />
            Restaurar
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={inspectBackup}
            aria-label="Seleccionar respaldo Guardian"
          />
        </div>
      </div>

      {preview ? (
        <div className="mt-4 border-l-2 border-amber-300/25 bg-amber-400/[0.03] py-3 pl-4 pr-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-100/75">
                <AlertTriangle className="h-4 w-4" />
                Respaldo listo para restaurar
              </div>
              <div className="mt-2 text-xs leading-relaxed text-white/45">
                Exportado: {localDate(preview.exportedAt)} · {preview.counts.events} eventos · {preview.counts.missions} misiones · {preview.counts.observations} observaciones
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-amber-100/50">
                Reemplazará toda la memoria Guardian actual de este navegador.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/5 hover:text-white/65"
              aria-label="Cancelar restauración"
              title="Cancelar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={confirmRestore}
            className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100/75 hover:bg-amber-400/15"
          >
            Confirmar reemplazo
          </button>
        </div>
      ) : null}

      {restored ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-100/65">
          <CheckCircle2 className="h-4 w-4" />
          Memoria Guardian restaurada en este dispositivo.
        </div>
      ) : null}
      {error ? <div className="mt-3 text-xs leading-relaxed text-red-100/70">{error}</div> : null}
    </section>
  );
}
