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

function timeAgoFrom(d: Date) {
  const t = d instanceof Date ? d.getTime() : new Date(d as any).getTime();
  const diff = Date.now() - t;
  const sec = Math.max(0, Math.floor(diff / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day > 0) return `hace ${day} d`;
  if (hr > 0) return `hace ${hr} h`;
  if (min > 0) return `hace ${min} min`;
  return `recién`;
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

// ===== Visual Observation (Módulo 1) =====
type VisualSource = {
  kind: "live" | "periodic" | "snapshot";
  title: string;
  subtitle?: string; // fuente / distancia / etc
  freshnessLabel: string; // LIVE / hace X min / etc
  href?: string;
  imageUrl?: string;
};

function buildVisualSources(ev: EnvironmentalEvent): VisualSource[] {
  const sources: VisualSource[] = [];

  // 1) LIVE (hoy: liveFeedUrl)
  if (ev.liveFeedUrl && /^https?:\/\//.test(ev.liveFeedUrl)) {
    sources.push({
      kind: "live",
      title: "Live feed (externo)",
      subtitle: "Fuente: enlace del evento",
      freshnessLabel: "LIVE",
      href: ev.liveFeedUrl,
    });
  }

  // 2) SNAPSHOT (hoy: satelliteImageUrl)
  if (ev.satelliteImageUrl && /^https?:\/\//.test(ev.satelliteImageUrl)) {
    sources.push({
      kind: "snapshot",
      title: "Snapshot satelital",
      subtitle: "Fuente: imagen asociada",
      freshnessLabel: timeAgoFrom(ev.timestamp),
      imageUrl: ev.satelliteImageUrl,
      href: ev.satelliteImageUrl,
    });
  }

  return sources;
}

function badgeStyle(kind: VisualSource["kind"]) {
  if (kind === "live") return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
  if (kind === "periodic") return "border-cyan-400/30 bg-cyan-400/15 text-cyan-100";
  return "border-white/10 bg-white/5 text-white/80";
}

type PanelView = "main" | "visual";

function CardButton(props: {
  title: string;
  subtitle: string;
  icon: string;
  rightBadge?: { text: string; className: string } | null;
  onClick: () => void;
}) {
  const { title, subtitle, icon, rightBadge, onClick } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left",
        "rounded-2xl border border-white/10 bg-white/5",
        "px-4 py-4",
        "hover:bg-white/7 transition-colors",
        "flex items-start justify-between gap-4",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-10 w-10 rounded-xl border border-white/10 bg-black/20 flex items-center justify-center shrink-0">
          <span className="text-white/85">{icon}</span>
        </div>
        <div className="min-w-0">
          <div className="text-white/90 font-semibold">{title}</div>
          <div className="text-white/50 text-sm mt-0.5 line-clamp-2">{subtitle}</div>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {rightBadge ? (
          <span className={["rounded-full border px-2 py-0.5 text-[11px]", rightBadge.className].join(" ")}>
            {rightBadge.text}
          </span>
        ) : null}
        <span className="text-white/40 text-sm">›</span>
      </div>
    </button>
  );
}

export function AlertPanel(props: { event: EnvironmentalEvent | null; onClose: () => void; shareUrl?: string }) {
  const { event, onClose, shareUrl } = props;

  const [copied, setCopied] = useState(false);
  const [followed, setFollowed] = useState<string[]>([]);
  const [view, setView] = useState<PanelView>("main");

  // ESC para cerrar
  useEffect(() => {
    if (!event) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [event, onClose]);

  // reset al cambiar evento
  useEffect(() => {
    if (typeof window === "undefined") return;
    setFollowed(readFollowed());
    setCopied(false);
    setView("main");
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

  const summary = event.description && event.description.trim().length > 0 ? event.description : fallbackSummary(event);
  const utc = formatTimeUTC(event.timestamp);

  const visuals = buildVisualSources(event);

  // badge resumen para la card
  const visualBadge = (() => {
    const live = visuals.find((v) => v.kind === "live");
    if (live) return { text: "LIVE", className: badgeStyle("live") };
    const periodic = visuals.find((v) => v.kind === "periodic");
    if (periodic) return { text: periodic.freshnessLabel, className: badgeStyle("periodic") };
    const snap = visuals.find((v) => v.kind === "snapshot");
    if (snap) return { text: snap.freshnessLabel, className: badgeStyle("snapshot") };
    return null;
  })();

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      {/* Backdrop */}
      <button type="button" aria-label="Cerrar panel" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />

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

        {/* Header fijo (sirve para MAIN y subviews) */}
        <div className="relative p-5 md:p-6 border-b border-white/10 bg-black/10">
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

          {/* Back button en subviews */}
          {view !== "main" ? (
            <button
              type="button"
              onClick={() => setView("main")}
              className={[
                "absolute left-4 top-4 md:left-5 md:top-5",
                "h-10 px-3 rounded-xl",
                "border border-white/10 bg-white/5",
                "text-white/80 hover:text-white hover:bg-white/10",
                "transition-colors",
                "flex items-center gap-2",
              ].join(" ")}
              aria-label="Volver"
              title="Volver"
            >
              <span className="text-white/80">←</span>
              <span className="text-sm">Volver</span>
            </button>
          ) : null}

          {/* identity line */}
          <div className="text-white/55 text-xs uppercase tracking-wider flex items-center gap-2">
            <span>
              {header.cat} • {utc}
            </span>
          </div>

          <div className="mt-2 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-white text-2xl md:text-3xl font-semibold leading-tight">{event.title}</div>
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

          {/* severity + status */}
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

            {/* actions */}
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

        {/* Content area */}
        <div className="p-5 md:p-6 overflow-y-auto max-h-[calc(82vh-120px)]">
          {view === "main" ? (
            <>
              {/* MAIN: cards resumen */}
              <div className="grid grid-cols-1 gap-3">
                <CardButton
                  title="Observación visual"
                  subtitle={
                    visuals.length
                      ? `Fuentes disponibles: ${visuals.length}. Se prioriza LIVE; luego actualizaciones y snapshots con timestamp.`
                      : "No hay fuentes visuales asociadas a este evento por ahora."
                  }
                  icon="🎥"
                  rightBadge={visualBadge}
                  onClick={() => setView("visual")}
                />

                {/* (placeholder cards para el resto; las implementamos después) */}
                <CardButton
                  title="Estado operativo"
                  subtitle={`Status: ${statusLabel(event.status)} • Evacuación: ${event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}`}
                  icon="⚠️"
                  rightBadge={null}
                  onClick={() => {
                    // por ahora no implementado, después hacemos view="ops"
                    window.alert("Próximo módulo: Estado operativo (por ahora solo diseño).");
                  }}
                />

                <CardButton
                  title="Impacto humano"
                  subtitle={`Población: ${
                    typeof event.affectedPopulation === "number" ? `≈ ${event.affectedPopulation.toLocaleString("es-AR")}` : "—"
                  } • Área: ${km2(event.affectedArea)}`}
                  icon="👥"
                  rightBadge={null}
                  onClick={() => window.alert("Próximo módulo: Impacto humano.")}
                />

                <CardButton
                  title="Contexto ambiental"
                  subtitle={event.ecosystems?.length || event.speciesAtRisk?.length ? "Ecosistemas/especies disponibles en este evento." : "Aún sin datos ambientales asociados."}
                  icon="🌱"
                  rightBadge={null}
                  onClick={() => window.alert("Próximo módulo: Contexto ambiental.")}
                />

                <CardButton
                  title="Observación satelital"
                  subtitle={event.satelliteImageUrl ? "Hay imagen asociada. (Más adelante: capas/timeline)." : "Aún sin capas satelitales."}
                  icon="🛰️"
                  rightBadge={event.satelliteImageUrl ? { text: timeAgoFrom(event.timestamp), className: badgeStyle("snapshot") } : null}
                  onClick={() => window.alert("Próximo módulo: Observación satelital (capas).")}
                />

                <CardButton
                  title="Indicadores + Insight"
                  subtitle={event.aiInsight?.narrative ? "BioPulse Insight disponible + indicadores de riesgo." : "Sin Insight por ahora."}
                  icon="🧠"
                  rightBadge={null}
                  onClick={() => window.alert("Próximo módulo: Insight + Risk.")}
                />
              </div>

              {/* Resumen “qué está pasando” (lo dejamos accesible también en MAIN) */}
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/45 text-xs uppercase tracking-wider">Qué está pasando</div>
                <div className="mt-2 text-white/85 text-sm leading-relaxed">{summary}</div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
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
              </div>

              <div className="mt-5 text-white/35 text-xs">
                Tip: presioná <span className="text-white/55">Esc</span> o tocá afuera para cerrar.
              </div>
            </>
          ) : view === "visual" ? (
            <>
              {/* VISUAL: full panel module */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-white/90 font-semibold text-lg">🎥 Observación visual</div>
                    <div className="text-white/45 text-sm mt-1">
                      BioPulse prioriza LIVE. Si no hay, muestra fuentes con timestamp (cada X min / snapshot).
                    </div>
                  </div>

                  {visualBadge ? (
                    <span className={["rounded-full border px-2 py-0.5 text-[11px]", visualBadge.className].join(" ")}>
                      {visualBadge.text}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4">
                  {visuals.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-white/80 text-sm font-medium">No hay observación visual disponible</div>
                      <div className="text-white/45 text-xs mt-1">
                        Cuando conectemos cámaras públicas/feeds, aparecerán acá con su timestamp.
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {visuals.map((v) => (
                        <div key={`${v.kind}:${v.title}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-white/85 text-sm font-semibold">{v.title}</div>
                              {v.subtitle ? <div className="text-white/45 text-xs mt-0.5">{v.subtitle}</div> : null}
                            </div>

                            <span className={["shrink-0 rounded-full border px-2 py-0.5 text-[11px]", badgeStyle(v.kind)].join(" ")}>
                              {v.kind === "live" ? "LIVE" : v.freshnessLabel}
                            </span>
                          </div>

                          {v.imageUrl ? (
                            <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                              <img src={v.imageUrl} alt="" className="h-40 w-full object-cover opacity-90" loading="lazy" />
                            </div>
                          ) : null}

                          <div className="mt-3">
                            {v.href ? (
                              <a
                                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                                href={v.href}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir fuente
                                <span className="text-white/40 text-xs">(externo)</span>
                              </a>
                            ) : (
                              <div className="text-white/50 text-sm">—</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 text-white/35 text-xs">
                  Nota: más adelante este módulo incluirá búsqueda de cámaras cercanas y feeds periódicos reales.
                </div>
              </div>
            </>
          ) : null}
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
          .line-clamp-2{
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
        `}</style>
      </div>
    </div>
  );
}
