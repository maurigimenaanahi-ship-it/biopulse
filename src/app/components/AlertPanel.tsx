import { useEffect } from "react";
import type { EnvironmentalEvent } from "@/data/events";

export function AlertPanel(props: {
  event: EnvironmentalEvent | null;
  onClose: () => void;
}) {
  const { event, onClose } = props;

  // ESC para cerrar (desktop)
  useEffect(() => {
    if (!event) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      {/* Backdrop (click afuera cierra) */}
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          "absolute left-1/2 -translate-x-1/2",
          "bottom-4 md:bottom-6",
          "w-[calc(100%-24px)] md:w-[760px]",
          "max-h-[78vh] overflow-hidden",
          "rounded-2xl border border-white/10 bg-[#0a0f1a]/95 shadow-2xl",
          "backdrop-blur-md",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* top accent */}
        <div className="h-1.5 bg-gradient-to-r from-cyan-300/80 via-cyan-300/10 to-transparent" />

        <div className="relative p-5 md:p-6">
          {/* Close X */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={[
              "absolute right-4 top-4 md:right-5 md:top-5",
              "h-10 w-10 rounded-xl",
              "border border-white/10 bg-white/5",
              "text-white/80 hover:text-white hover:bg-white/10",
              "transition-colors",
              "flex items-center justify-center",
            ].join(" ")}
            aria-label="Cerrar"
            title="Cerrar"
          >
            ✕
          </button>

          {/* Header */}
          <div className="pr-12">
            <div className="text-white/55 text-xs uppercase tracking-wider">
              {event.category} • {new Date(event.timestamp).toUTCString()}
            </div>

            <div className="mt-2 text-white text-2xl md:text-3xl font-semibold leading-tight">
              {event.title}
            </div>

            <div className="mt-2 text-white/55 text-sm">
              {event.location} • {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
            </div>

            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span
                className={[
                  "inline-block h-2 w-2 rounded-full",
                  event.severity === "critical"
                    ? "bg-red-500"
                    : event.severity === "high"
                    ? "bg-orange-500"
                    : event.severity === "moderate"
                    ? "bg-yellow-500"
                    : "bg-emerald-400",
                ].join(" ")}
              />
              <span className="text-white/80 text-sm">
                {event.severity.toUpperCase()} Severity
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">
                Environmental Data
              </div>
              <div className="mt-2 text-white/85 text-sm leading-relaxed">
                {event.description || "No additional description available."}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">
                Impact Assessment
              </div>

              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">
                    Affected Area
                  </div>
                  <div className="text-white/85 text-lg font-medium mt-1">
                    {event.affectedArea ?? 1} km²
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">
                    Event Status
                  </div>
                  <div className="text-white/80 text-sm mt-1">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Active & Developing
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer hint */}
          <div className="mt-5 text-white/35 text-xs">
            Tip: presioná <span className="text-white/55">Esc</span> o tocá afuera para cerrar.
          </div>
        </div>
      </div>
    </div>
  );
}
