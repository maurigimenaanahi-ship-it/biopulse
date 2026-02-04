import { useEffect, useMemo, useState } from "react";
import type { EnvironmentalEvent } from "@/data/events";
import { categoryLabels, categoryColors } from "@/data/events";

// ===== favorites (seguir alerta) =====
const FAV_KEY = "biopulse:followed-alerts";
function readFollowed(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function toggleFollow(id: string): string[] {
  const curr = new Set(readFollowed());
  if (curr.has(id)) curr.delete(id);
  else curr.add(id);
  const next = Array.from(curr);
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next;
}

// ===== helpers =====
function toDateSafe(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatTimeUTC(d: Date) {
  const date = d instanceof Date ? d : new Date(d as any);
  return date.toUTCString();
}

function formatShortUTC(d: Date) {
  const dt = d instanceof Date ? d : new Date(d as any);
  return dt.toUTCString().replace(" GMT", "").replace(", ", " • ");
}

function relAge(d: Date | null) {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / (1000 * 60));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function km2(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `≈ ${(n / 1000).toFixed(1)}k km²`;
  return `≈ ${Math.round(n)} km²`;
}

function metric(value?: number, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}${suffix}`;
}

function statusLabel(s?: EnvironmentalEvent["status"]) {
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

function trendLabel(t?: EnvironmentalEvent["trend"]) {
  switch (t) {
    case "rising":
      return { text: "Rising", icon: "↗" };
    case "falling":
      return { text: "Falling", icon: "↘" };
    case "stable":
      return { text: "Stable", icon: "→" };
    default:
      return { text: "—", icon: "•" };
  }
}

function fallbackSummary(ev: EnvironmentalEvent) {
  const cat = categoryLabels[ev.category] ?? ev.category;
  const sev = ev.severity;

  const parts: string[] = [];
  parts.push(`A ${sev} intensity ${cat.toLowerCase()} event was detected in ${ev.location}.`);

  const cond: string[] = [];
  if (typeof ev.windSpeed === "number") cond.push(`wind ${Math.round(ev.windSpeed)} km/h`);
  if (typeof ev.humidity === "number") cond.push(`humidity ${Math.round(ev.humidity)}%`);
  if (typeof ev.temperature === "number") cond.push(`temperature ${Math.round(ev.temperature)}°C`);
  if (typeof ev.waterLevel === "number") cond.push(`river level ${ev.waterLevel} m`);
  if (typeof ev.airQualityIndex === "number") cond.push(`AQI ${ev.airQualityIndex}`);

  if (cond.length) parts.push(`Current conditions: ${cond.join(" • ")}.`);

  if (ev.severity === "critical" || ev.severity === "high") {
    parts.push(`Risk of escalation is elevated. Continuous monitoring is recommended.`);
  } else {
    parts.push(`Monitoring continues as conditions evolve.`);
  }

  return parts.join(" ");
}

export function AlertPanel(props: {
  event: EnvironmentalEvent | null;
  onClose: () => void;
  shareUrl?: string;
}) {
  const { event, onClose, shareUrl } = props;

  const [copied, setCopied] = useState(false);
  const [followed, setFollowed] = useState<string[]>([]);

  // ESC para cerrar
  useEffect(() => {
    if (!event) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [event, onClose]);

  // leer favoritos + reset del "copiado" cada vez que cambia el evento
  useEffect(() => {
    if (typeof window === "undefined") return;
    setFollowed(readFollowed());
    setCopied(false);
  }, [event?.id]);

  const isFollowed = event ? followed.includes(event.id) : false;

  const header = useMemo(() => {
    if (!event) return null;
    const cat = categoryLabels[event.category] ?? event.category;
    const color = categoryColors[event.category] ?? "#7dd3fc";
    return { cat, color };
  }, [event?.id]);

  if (!event || !header) return null;

  async function handleCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Copiá el link:", shareUrl);
    }
  }

  const summary =
    event.description && event.description.trim().length > 0 ? event.description : fallbackSummary(event);

  const utc = formatTimeUTC(event.timestamp);

  // ✅ LIVE vs SNAPSHOT (lo marca App cuando abre desde link y no existe live)
  const isSnapshot = event.riskIndicators?.includes("Snapshot link");

  // ✅ vida (eventLife)
  const firstSeen = toDateSafe((event as any).firstSeen);
  const lastSeen = toDateSafe((event as any).lastSeen) ?? toDateSafe(event.timestamp);
  const scans = typeof (event as any).scanCount === "number" ? (event as any).scanCount : undefined;
  const trend = trendLabel((event as any).trend);
  const isStale = Boolean((event as any).stale);

  const history = Array.isArray((event as any).history) ? (event as any).history : [];
  const historyTail = history.slice(-6).reverse(); // últimos 6, más reciente primero

  const summaryHasAmerica = /am[eé]rica/i.test(summary);
  const showResolvedLocationHint = summaryHasAmerica && event.location && event.location.length > 3;

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          "absolute left-1/2 -translate-x-1/2",
          "bottom-4 md:bottom-6",
          "w-[calc(100%-24px)] md:w-[860px]",
          "max-h-[82vh] overflow-hidden",
          "rounded-2xl border border-white/10 bg-[#0a0f1a]/95 shadow-2xl",
          "backdrop-blur-md",
          "flex flex-col", // ✅ para poder scrollear contenido interno
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* top accent */}
        <div
          className="h-1.5 shrink-0"
          style={{
            background: `linear-gradient(90deg, ${header.color}CC, ${header.color}14, transparent)`,
          }}
        />

        {/* ✅ SCROLL AREA */}
        <div className="relative p-5 md:p-6 overflow-y-auto pr-2 md:pr-3">
          {/* Close */}
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

          {/* ===== Identity ===== */}
          <div className="pr-12">
            <div className="text-white/55 text-xs uppercase tracking-wider flex flex-wrap items-center gap-2">
              <span>
                {header.cat} • {utc}
              </span>

              {isSnapshot ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
                  SNAPSHOT
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
                  LIVE
                </span>
              )}

              {isStale ? (
                <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100/80">
                  STALE • not detected this scan
                </span>
              ) : (
                <span className="rounded-full border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-100/75">
                  DETECTED • this scan
                </span>
              )}
            </div>

            {/* Título + Seguir */}
            <div className="mt-2 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-white text-2xl md:text-3xl font-semibold leading-tight">
                  {event.title}
                </div>

                <div className="mt-2 text-white/80 text-sm md:text-base font-medium">{event.location}</div>

                <div className="mt-1 text-white/45 text-xs">
                  {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = toggleFollow(event.id);
                  setFollowed(next);
                }}
                className={[
                  "shrink-0",
                  "rounded-xl border border-white/10",
                  "bg-white/5 hover:bg-white/10",
                  "px-3 py-2 text-xs md:text-sm",
                  "text-white/85 transition-colors",
                ].join(" ")}
                aria-pressed={isFollowed}
                title="Seguir esta alerta (futuro: notificaciones)"
              >
                {isFollowed ? "Siguiendo ✓" : "Seguir alerta"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
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
                <span className="text-white/80 text-sm">{event.severity.toUpperCase()} Severity</span>

                <span className="ml-3 inline-flex items-center gap-2 text-white/65 text-sm">
                  <span className="pulse-dot h-2 w-2 rounded-full bg-cyan-300/80" />
                  {statusLabel(event.status)}
                </span>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white/55 text-xs uppercase tracking-wider">Trend</span>
                <span className="ml-1 text-sm font-medium text-white/80">
                  {trend.icon} {trend.text}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 text-sm transition-colors"
                onClick={handleCopyLink}
                disabled={!shareUrl}
                title={shareUrl ? "Copiar link" : "Link no disponible"}
              >
                {copied ? "Link copiado" : "Copiar link"}
              </button>
            </div>
          </div>

          {/* ===== Layout ===== */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">Qué está pasando</div>
              <div className="mt-2 text-white/85 text-sm leading-relaxed">{summary}</div>

              {showResolvedLocationHint ? (
                <div className="mt-3 text-white/55 text-xs">
                  Location resolved to: <span className="text-white/75 font-medium">{event.location}</span>
                </div>
              ) : null}
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">Estado operativo</div>

              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Event Status</div>
                  <div className="mt-1 text-white/85 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <span className="pulse-dot h-2 w-2 rounded-full bg-cyan-300/80" />
                      {statusLabel(event.status)}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Evacuación</div>
                  <div className="mt-1 text-white/85 text-sm">
                    {event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Event Life</div>

                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-white/35 text-[11px] uppercase tracking-wider">First seen</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {firstSeen ? formatShortUTC(firstSeen) : "—"}
                      </div>
                      <div className="text-white/40 text-[11px] mt-0.5">{relAge(firstSeen)}</div>
                    </div>

                    <div>
                      <div className="text-white/35 text-[11px] uppercase tracking-wider">Last seen</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {lastSeen ? formatShortUTC(lastSeen) : "—"}
                      </div>
                      <div className="text-white/40 text-[11px] mt-0.5">{relAge(lastSeen)}</div>
                    </div>

                    <div>
                      <div className="text-white/35 text-[11px] uppercase tracking-wider">Scans</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {typeof scans === "number" ? scans : "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-white/35 text-[11px] uppercase tracking-wider">Trend</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {trend.icon} {trend.text}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Impacto humano */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">Impacto humano</div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Población en riesgo</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">
                    {typeof event.affectedPopulation === "number"
                      ? `≈ ${event.affectedPopulation.toLocaleString("es-AR")} personas`
                      : "—"}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Área afectada</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">{km2(event.affectedArea)}</div>
                </div>
              </div>
            </section>

            {/* Condiciones */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">Condiciones</div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Viento</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">{metric(event.windSpeed, " km/h")}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Humedad</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">{metric(event.humidity, "%")}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Temperatura</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">{metric(event.temperature, "°C")}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">AQI / Río</div>
                  <div className="mt-1 text-white/85 text-sm font-medium">
                    {typeof event.airQualityIndex === "number"
                      ? `AQI ${event.airQualityIndex}`
                      : typeof event.waterLevel === "number"
                      ? `${event.waterLevel} m`
                      : "—"}
                  </div>
                </div>
              </div>
            </section>

            {/* Actividad reciente */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">Actividad reciente</div>

              {historyTail.length ? (
                <div className="mt-3 space-y-2">
                  {historyTail.map((h: any, idx: number) => {
                    const t = toDateSafe(h.t);
                    const fc = typeof h.focusCount === "number" ? h.focusCount : undefined;
                    const sum = typeof h.frpSum === "number" ? h.frpSum : undefined;
                    const mx = typeof h.frpMax === "number" ? h.frpMax : undefined;

                    return (
                      <div
                        key={`${t?.toISOString?.() ?? idx}-${idx}`}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-white/80 text-sm font-medium">
                            {t ? t.toUTCString().slice(17, 25) : "—"} UTC
                          </div>
                          <div className="text-white/45 text-[11px] mt-0.5">
                            {fc != null ? `${fc} detections` : "—"} •{" "}
                            {sum != null ? `FRP Σ ${sum.toFixed(1)}` : "FRP Σ —"} •{" "}
                            {mx != null ? `max ${mx.toFixed(1)}` : "max —"}
                          </div>
                        </div>

                        <div className="text-white/45 text-[11px] shrink-0">
                          {h.severity ? String(h.severity).toUpperCase() : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 text-white/50 text-sm">—</div>
              )}
            </section>
          </div>

          {/* Indicadores de riesgo */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-white/45 text-xs uppercase tracking-wider">Indicadores de riesgo</div>
            {event.riskIndicators?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {event.riskIndicators.slice(0, 14).map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/75"
                  >
                    {r}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-white/50 text-sm">—</div>
            )}
          </div>

          {/* AI Insight */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-white/45 text-xs uppercase tracking-wider">BioPulse Insight</div>

            <div className="mt-2 text-white/85 text-sm leading-relaxed">
              {event.aiInsight?.narrative
                ? event.aiInsight.narrative
                : "BioPulse is analyzing this event. Continuous monitoring is recommended."}
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">Prob. expansión (12h)</div>
                <div className="mt-1 text-white/85 text-sm font-medium">
                  {typeof event.aiInsight?.probabilityNext12h === "number"
                    ? `${event.aiInsight.probabilityNext12h}%`
                    : "—"}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">Recomendaciones</div>
                {event.aiInsight?.recommendations?.length ? (
                  <ul className="mt-1 text-white/80 text-sm list-disc pl-4 space-y-1">
                    {event.aiInsight.recommendations.slice(0, 4).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-white/50 text-sm">—</div>
                )}
              </div>
            </div>
          </div>

          {/* Footer hint */}
          <div className="mt-5 text-white/35 text-xs">
            Tip: presioná <span className="text-white/55">Esc</span> o tocá afuera para cerrar.
          </div>
        </div>

        <style>{`
          .pulse-dot{
            animation: pulse 1.25s ease-in-out infinite;
          }
          @keyframes pulse{
            0%{ transform: scale(1); opacity: 0.35; }
            50%{ transform: scale(1.35); opacity: 0.95; }
            100%{ transform: scale(1); opacity: 0.35; }
          }
        `}</style>
      </div>
    </div>
  );
}
