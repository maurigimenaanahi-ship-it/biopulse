import { useEffect, useMemo, useState } from "react";
import type { EnvironmentalEvent } from "@/data/events";

const FAV_KEY = "biopulse:followed-alerts";
const MEMORY_KEY = "biopulse:eventsMemory:v1";

function readFollowedIds(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFollowedIds(ids: string[]) {
  localStorage.setItem(FAV_KEY, JSON.stringify(ids));
}

function removeFollow(id: string) {
  const curr = new Set(readFollowedIds());
  curr.delete(id);
  const next = Array.from(curr);
  writeFollowedIds(next);
  return next;
}

function readMemory(): Record<string, any> {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function toDateSafe(x: any): Date | null {
  if (!x) return null;
  if (x instanceof Date) return x;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d : null;
}

function sevChip(sev: EnvironmentalEvent["severity"]) {
  const label = sev.toUpperCase();
  const cls =
    sev === "critical"
      ? "border-red-400/20 bg-red-500/10 text-red-100/85"
      : sev === "high"
      ? "border-amber-300/20 bg-amber-500/10 text-amber-100/85"
      : sev === "moderate"
      ? "border-yellow-300/20 bg-yellow-500/10 text-yellow-100/85"
      : "border-emerald-300/20 bg-emerald-500/10 text-emerald-100/85";

  return { label, cls };
}

function trendLabel(t?: any) {
  if (t === "rising") return "↗ Rising";
  if (t === "falling") return "↘ Falling";
  if (t === "stable") return "→ Stable";
  return "—";
}

function statusLabel(s?: any) {
  switch (s) {
    case "active":
      return "Active";
    case "contained":
      return "Contained";
    case "escalating":
      return "Escalating";
    case "stabilizing":
      return "Stabilizing";
    case "resolved":
      return "Resolved";
    default:
      return "Active";
  }
}

function fmtLocalTime(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSnapshotFromMemory(id: string, mem: any): EnvironmentalEvent {
  const lat = Number(mem?.latitude ?? mem?.lat ?? 0);
  const lon = Number(mem?.longitude ?? mem?.lon ?? 0);
  const location = String(mem?.location ?? "Unknown location");
  const title = String(mem?.title ?? "Followed alert");
  const severity = (mem?.severity as EnvironmentalEvent["severity"]) ?? "moderate";

  const lastSeen = toDateSafe(mem?.lastSeen) ?? toDateSafe(mem?.timestamp) ?? new Date();

  return {
    id,
    category: (mem?.category as any) ?? "fire",
    location,
    latitude: Number.isFinite(lat) ? lat : 0,
    longitude: Number.isFinite(lon) ? lon : 0,
    severity,
    title,
    description: String(mem?.description ?? ""),
    timestamp: lastSeen,
    affectedArea: Number(mem?.affectedArea ?? 1),
    affectedPopulation: typeof mem?.affectedPopulation === "number" ? mem.affectedPopulation : undefined,
    riskIndicators: Array.isArray(mem?.riskIndicators) ? mem.riskIndicators : ["Snapshot link"],
    liveFeedUrl: typeof mem?.liveFeedUrl === "string" ? mem.liveFeedUrl : undefined,

    status: mem?.status,
    evacuationLevel: mem?.evacuationLevel,

    nearbyInfrastructure: Array.isArray(mem?.nearbyInfrastructure) ? mem.nearbyInfrastructure : undefined,
    ecosystems: Array.isArray(mem?.ecosystems) ? mem.ecosystems : undefined,
    speciesAtRisk: Array.isArray(mem?.speciesAtRisk) ? mem.speciesAtRisk : undefined,
    aiInsight: mem?.aiInsight,

    // vida
    firstSeen: toDateSafe(mem?.firstSeen) ?? undefined,
    lastSeen: toDateSafe(mem?.lastSeen) ?? undefined,
    stale: Boolean(mem?.stale),
    history: Array.isArray(mem?.history) ? mem.history : undefined,

    // métricas fire
    focusCount: typeof mem?.focusCount === "number" ? mem.focusCount : undefined,
    frpSum: typeof mem?.frpSum === "number" ? mem.frpSum : undefined,
    frpMax: typeof mem?.frpMax === "number" ? mem.frpMax : undefined,
  };
}

export function FollowedAlertsPanel(props: {
  open: boolean;
  events: EnvironmentalEvent[];
  onClose: () => void;
  onSelect: (ev: EnvironmentalEvent) => void;
}) {
  const { open, events, onClose, onSelect } = props;

  const [ids, setIds] = useState<string[]>([]);
  const [memory, setMemory] = useState<Record<string, any>>({});

  // cargar ids + memoria cuando abre
  useEffect(() => {
    if (!open) return;
    setIds(readFollowedIds());
    setMemory(readMemory());
  }, [open]);

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const rows = useMemo(() => {
    return ids.map((id) => {
      const live = byId.get(id) ?? null;
      const mem = memory?.[id] ?? null;

      const ev: EnvironmentalEvent | null = live
        ? live
        : mem
        ? buildSnapshotFromMemory(id, mem)
        : null;

      const isLive = Boolean(live);
      const isStale = Boolean((ev as any)?.stale) && !isLive;

      const sev = ev?.severity ?? "moderate";
      const sevUI = sevChip(sev);

      const trend = trendLabel((ev as any)?.trend);
      const status = statusLabel((ev as any)?.status);

      const lastSeen = toDateSafe((ev as any)?.lastSeen) ?? toDateSafe(ev?.timestamp) ?? null;

      return {
        id,
        ev,
        isLive,
        isStale,
        sevUI,
        trend,
        status,
        lastSeen,
      };
    });
  }, [ids, byId, memory]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99998] pointer-events-auto">
      {/* backdrop */}
      <button
        type="button"
        aria-label="Cerrar Mis alertas"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* panel */}
      <div
        className={[
          "absolute left-1/2 -translate-x-1/2",
          "top-[calc(env(safe-area-inset-top)+84px)] md:top-20",
          "w-[calc(100%-24px)] md:w-[720px]",
          "max-h-[72vh] overflow-hidden",
          "rounded-2xl border border-white/10 bg-[#0a0f1a]/95 shadow-2xl",
          "backdrop-blur-md",
          "flex flex-col",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="px-5 md:px-6 py-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white text-lg md:text-xl font-semibold">Mis alertas</div>
            <div className="text-white/45 text-xs mt-0.5">
              Seguidas: <span className="text-white/70 font-medium">{ids.length}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
            aria-label="Cerrar"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* body scroll */}
        <div className="p-4 md:p-6 overflow-y-auto">
          {!rows.length ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/70 text-sm">
              Todavía no estás siguiendo ninguna alerta.
              <div className="text-white/45 text-xs mt-2">
                Abrí una alerta y tocá <span className="text-white/70 font-medium">“Seguir alerta”</span>.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/7 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => {
                        if (r.ev) onSelect(r.ev);
                        onClose();
                      }}
                      title="Abrir alerta"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full border px-2 py-0.5 text-[10px]",
                            r.isLive
                              ? "border-emerald-300/15 bg-emerald-500/10 text-emerald-100/80"
                              : "border-white/10 bg-white/5 text-white/70",
                          ].join(" ")}
                        >
                          {r.isLive ? "LIVE" : "SNAPSHOT"}
                        </span>

                        {r.isStale ? (
                          <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100/80">
                            STALE
                          </span>
                        ) : null}

                        <span className={["rounded-full border px-2 py-0.5 text-[10px]", r.sevUI.cls].join(" ")}>
                          {r.sevUI.label}
                        </span>

                        <span className="text-white/55 text-[11px]">
                          {r.trend} • {r.status}
                        </span>
                      </div>

                      <div className="mt-2 text-white/90 text-sm font-semibold truncate">
                        {r.ev?.title ?? r.id}
                      </div>

                      <div className="mt-1 text-white/70 text-sm truncate">
                        {r.ev?.location ?? "Unknown location"}
                      </div>

                      <div className="mt-1 text-white/35 text-[11px]">
                        Last seen: <span className="text-white/55">{fmtLocalTime(r.lastSeen)}</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const next = removeFollow(r.id);
                        setIds(next);
                      }}
                      className="shrink-0 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 px-3 py-2 text-xs transition-colors"
                      title="Dejar de seguir"
                    >
                      Dejar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 text-white/30 text-[11px]">
            Tip: presioná <span className="text-white/50">Esc</span> o tocá afuera para cerrar.
          </div>
        </div>
      </div>
    </div>
  );
}
