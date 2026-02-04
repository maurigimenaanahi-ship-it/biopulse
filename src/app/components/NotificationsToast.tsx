import { useEffect } from "react";

export type ToastItem = {
  id: string;
  title: string;
  message: string;
  tone?: "info" | "warn" | "danger";
  createdAt: number;
};

export function NotificationsToast(props: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const { items, onDismiss } = props;

  // Auto-dismiss (6s)
  useEffect(() => {
    if (!items.length) return;
    const timers = items.map((t) =>
      window.setTimeout(() => onDismiss(t.id), 6000)
    );
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [items, onDismiss]);

  if (!items.length) return null;

  return (
    <div className="fixed right-4 bottom-4 md:right-6 md:bottom-6 z-[99999] pointer-events-none">
      <div className="flex flex-col gap-2 w-[320px] md:w-[360px]">
        {items.map((t) => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto",
              "rounded-2xl border shadow-2xl",
              "backdrop-blur-md",
              "px-4 py-3",
              "bg-[#0a0f1a]/90",
              t.tone === "danger"
                ? "border-red-400/20"
                : t.tone === "warn"
                ? "border-amber-300/20"
                : "border-white/10",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "inline-block h-2 w-2 rounded-full",
                      t.tone === "danger"
                        ? "bg-red-500"
                        : t.tone === "warn"
                        ? "bg-amber-400"
                        : "bg-cyan-300",
                    ].join(" ")}
                  />
                  <div className="text-white/90 text-sm font-semibold truncate">
                    {t.title}
                  </div>
                </div>

                <div className="mt-1 text-white/70 text-sm leading-snug">
                  {t.message}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                className="h-8 w-8 rounded-xl border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center"
                aria-label="Cerrar notificación"
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 text-white/35 text-[11px]">
              {new Date(t.createdAt).toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
