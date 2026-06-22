import { useEffect, useState } from "react";
import { Fingerprint, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import {
  sealGuardianObservation,
  verifyGuardianObservationIntegrity,
  type GuardianIntegrityCheck,
  type GuardianLocalStore,
  type GuardianObservation,
} from "@/app/lib/guardianStore";

export function GuardianObservationIntegrity({
  observation,
  onStoreChange,
}: {
  observation: GuardianObservation;
  onStoreChange: (store: GuardianLocalStore) => void;
}) {
  const [check, setCheck] = useState<GuardianIntegrityCheck>(
    observation.integrity ? "unsupported" : "unavailable"
  );
  const [checking, setChecking] = useState(Boolean(observation.integrity));
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!observation.integrity) {
      setCheck("unavailable");
      setChecking(false);
      return () => {
        active = false;
      };
    }
    setChecking(true);
    void verifyGuardianObservationIntegrity(observation).then((result) => {
      if (!active) return;
      setCheck(result);
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [observation]);

  const seal = async () => {
    setSealing(true);
    try {
      onStoreChange(await sealGuardianObservation(observation.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la huella local.");
    } finally {
      setSealing(false);
    }
  };

  const status = checking
    ? { label: "Comprobando huella…", className: "text-white/45", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> }
    : check === "valid"
    ? { label: "El contenido coincide con la huella local", className: "text-emerald-100/65", icon: <ShieldCheck className="h-3.5 w-3.5" /> }
    : check === "changed"
    ? { label: "El contenido no coincide con la huella guardada", className: "text-red-100/75", icon: <ShieldX className="h-3.5 w-3.5" /> }
    : check === "unsupported"
    ? { label: "Este navegador no pudo comprobar SHA-256", className: "text-amber-100/65", icon: <Fingerprint className="h-3.5 w-3.5" /> }
    : { label: "Observación anterior sin huella local", className: "text-white/40", icon: <Fingerprint className="h-3.5 w-3.5" /> };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="text-[10px] uppercase tracking-wide text-emerald-100/45">Integridad local</div>
      <div className={`mt-1.5 flex items-center gap-2 text-xs ${status.className}`}>
        {status.icon}
        <span>{status.label}</span>
      </div>
      {observation.integrity ? (
        <div className="mt-2 break-all font-mono text-[10px] leading-relaxed text-white/30">
          SHA-256 · {observation.integrity.digest}
        </div>
      ) : (
        <button
          type="button"
          onClick={seal}
          disabled={sealing}
          className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-300/15 bg-emerald-400/[0.06] px-3 py-1.5 text-xs font-medium text-emerald-100/65 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
          {sealing ? "Generando…" : "Generar huella actual"}
        </button>
      )}
      <div className="mt-2 text-[11px] leading-relaxed text-white/30">
        Comprueba cambios en el contenido base desde que se generó la huella. No demuestra autoría, autenticidad de la fuente ni cadena de custodia.
      </div>
      {error ? <div className="mt-2 text-xs text-red-100/70">{error}</div> : null}
    </div>
  );
}
