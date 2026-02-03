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
function formatTimeUTC(d: Date) {
  const date = d instanceof Date ? d : new Date(d as any);
  return date.toUTCString();
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

function fallbackSummary(ev: EnvironmentalEvent) {
  const cat = categoryLabels[ev.category] ?? ev.category;
  const sev = ev.severity;
  const parts: string[] = [];
  parts.push(
    `A ${sev} intensity ${cat.toLowerCase()} event was detected in ${ev.location}.`
  );

  const cond: string[] = [];
  if (typeof ev.windSpeed === "number") cond.push(`wind ${Math.round(ev.windSpeed)} km/h`);
  if (typeof ev.humidity === "number") cond.push(`humidity ${Math.round(ev.humidity)}%`);
  if (typeof ev.temperature === "number") cond.push(`temperature ${Math.round(ev.temperature)}°C`);
  if (typeof ev.waterLevel === "number") cond.push(`river level ${ev.waterLevel} m`);
  if (typeof ev.airQualityIndex === "number") cond.push(`AQI ${ev.airQualityIndex}`);

  if (cond.length) {
    parts.push(`Current conditions: ${cond.join(" • ")}.`);
  }

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

  const summary = (event.description && event.description.trim().length > 0)
    ? event.description
    : fallbackSummary(event);

  const utc = formatTimeUTC(event.timestamp);

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
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* top accent */}
        <div
          className="h-1.5"
          style={{
            background: `linear-gradient(90deg, ${header.color}CC, ${header.color}14, transparent)`,
          }}
        />

        <div className="relative p-5 md:p-6">
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
            <div className="text-white/55 text-xs uppercase tracking-wider">
              {header.cat} • {utc}
            </div>

            {/* Título + Seguir */}
            <div className="mt-2 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-white text-2xl md:text-3xl font-semibold leading-tight">
                  {event.title}
                </div>

                {/* ✅ Lugar visible (lo que pediste) */}
                <div className="mt-2 text-white/80 text-sm md:text-base font-medium">
                  {event.location}
                </div>

                {/* Coordenadas visibles para técnicos */}
                <div className="mt-1 text-white/45 text-xs">
                  {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
                </div>
              </div>

              {/* ✅ Seguir alerta (botón pequeño al lado del título) */}
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

            {/* Severidad */}
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
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

              {/* Estado con pulso */}
              <span className="ml-3 inline-flex items-center gap-2 text-white/65 text-sm">
                <span className="pulse-dot h-2 w-2 rounded-full bg-cyan-300/80" />
                {statusLabel(event.status)}
              </span>
            </div>

            {/* acciones livianas */}
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
            {/* 2) Resumen claro */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">Qué está pasando</div>
              <div className="mt-2 text-white/85 text-sm leading-relaxed">{summary}</div>
            </section>

            {/* 8) Estado / Evacuación */}
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
              </div>
            </section>

            {/* 3) Impacto humano */}
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

              {event.nearbyInfrastructure?.length ? (
                <div className="mt-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Infraestructura cercana</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {event.nearbyInfrastructure.slice(0, 10).map((x) => (
                      <span
                        key={x}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/75"
                      >
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {/* 4) Impacto ambiental */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">Impacto ambiental</div>

              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Ecosistemas</div>
                  <div className="mt-1 text-white/85 text-sm">
                    {event.ecosystems?.length ? event.ecosystems.join(" • ") : "—"}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-white/40 text-xs uppercase tracking-wider">Especies en riesgo</div>
                  <div className="mt-1 text-white/85 text-sm">
                    {event.speciesAtRisk?.length ? event.speciesAtRisk.join(" • ") : "—"}
                  </div>
                </div>
              </div>
            </section>

            {/* 5) Condiciones */}
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

              {/* indicador narrativo simple */}
              {(typeof event.windSpeed === "number" ||
                typeof event.humidity === "number" ||
                typeof event.temperature === "number") && (
                <div className="mt-3 text-white/60 text-xs">
                  → Condiciones{" "}
                  {(event.severity === "critical" || event.severity === "high") ? "potencialmente favorables para escalamiento." : "en observación."}
                </div>
              )}
            </section>

            {/* 6) Fuentes visuales */}
            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-white/45 text-xs uppercase tracking-wider">Observación directa</div>

              {event.satelliteImageUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                  <img
                    src={event.satelliteImageUrl}
                    alt=""
                    className="h-40 w-full object-cover opacity-90"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="mt-3 text-white/50 text-sm">—</div>
              )}

              <div className="mt-3">
                <div className="text-white/40 text-xs uppercase tracking-wider">Cámaras / feeds</div>
                <div className="mt-2">
                  {event.liveFeedUrl && /^https?:\/\//.test(event.liveFeedUrl) ? (
                    <a
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                      href={event.liveFeedUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir live feed
                      <span className="text-white/40 text-xs">(externo)</span>
                    </a>
                  ) : (
                    <div className="text-white/50 text-sm">
                      {event.liveFeedUrl ? event.liveFeedUrl : "—"}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* 7) Indicadores de riesgo (sección full width) */}
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

          {/* 9) AI Insight */}
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
