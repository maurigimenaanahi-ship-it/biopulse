import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, HeartHandshake, ShieldCheck, X } from "lucide-react";
import type { GuardianExposurePreference } from "@/app/lib/guardianStore";

const EXPOSURE_OPTIONS: Array<{
  value: GuardianExposurePreference;
  label: string;
  description: string;
}> = [
  {
    value: "ask_first",
    label: "Preguntar antes",
    description: "BioPulse pide confirmación antes de revelar material visual.",
  },
  {
    value: "data_only",
    label: "Solo datos",
    description: "Prioriza métricas, texto y enlaces sin mostrar imágenes.",
  },
  {
    value: "general_images",
    label: "Imágenes generales",
    description: "Permite imágenes generales; el contenido marcado sensible continúa protegido.",
  },
  {
    value: "hide_sensitive",
    label: "Ocultar sensibles",
    description: "Mantiene oculto cualquier material identificado como sensible.",
  },
];

export function GuardianPreparationDialog({
  open,
  initialExposure,
  onClose,
  onComplete,
}: {
  open: boolean;
  initialExposure: GuardianExposurePreference;
  onClose: () => void;
  onComplete: (exposure: GuardianExposurePreference) => void;
}) {
  const [exposure, setExposure] = useState(initialExposure);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExposure(initialExposure);
    setAcknowledged(false);
  }, [initialExposure, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100001] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Cerrar preparación Guardian"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Preparación Guardian"
        className="relative flex max-h-[calc(100vh-24px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-emerald-300/15 bg-[#09111b] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <ShieldCheck className="h-5 w-5 text-emerald-200/80" />
              Preparación Guardian
            </div>
            <div className="mt-1 text-xs leading-relaxed text-white/45">
              Observar con propósito también implica cuidarte y reconocer los límites de tu rol.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border-l-2 border-emerald-300/25 pl-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <HeartHandshake className="h-4 w-4 text-emerald-200/70" />
                Tu propósito
              </div>
              <div className="mt-2 text-xs leading-relaxed text-white/45">
                Observar, documentar y preservar información con cuidado. No necesitás ser autoridad ni rescatista para aportar, pero nunca debés exponerte físicamente para hacerlo.
              </div>
            </div>
            <div className="border-l-2 border-amber-300/20 pl-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <Eye className="h-4 w-4 text-amber-200/70" />
                Lo que podrías encontrar
              </div>
              <div className="mt-2 text-xs leading-relaxed text-white/45">
                Una catástrofe puede incluir imágenes o relatos difíciles. Podés detenerte, cerrar el evento o elegir trabajar únicamente con datos en cualquier momento.
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="text-sm font-semibold text-white/80">Elegí tu nivel de exposición</div>
            <div className="mt-1 text-xs text-white/40">Podrás cambiarlo más adelante desde cada evento.</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {EXPOSURE_OPTIONS.map((option) => {
                const selected = exposure === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setExposure(option.value)}
                    aria-pressed={selected}
                    className={`min-h-[76px] rounded-xl border px-3 py-3 text-left transition-colors ${
                      selected
                        ? "border-emerald-300/30 bg-emerald-400/10 text-white/85"
                        : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-white/40">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-5">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-400"
              />
              <span className="text-xs leading-relaxed text-white/55">
                Comprendo que puedo encontrar contenido difícil, que puedo detenerme cuando lo necesite y que BioPulse no reemplaza a servicios de emergencia ni autoridades oficiales.
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-[11px] leading-relaxed text-white/35">Esta elección se guarda únicamente en este dispositivo.</div>
          <button
            type="button"
            disabled={!acknowledged}
            onClick={() => onComplete(exposure)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShieldCheck className="h-4 w-4" />
            Continuar como Guardián
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
