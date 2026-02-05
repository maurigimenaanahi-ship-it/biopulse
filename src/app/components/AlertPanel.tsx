import { useEffect, useMemo, useState } from "react";
import type { EnvironmentalEvent } from "@/data/events";
import { categoryLabels, categoryColors } from "@/data/events";

// ===== cameras registry + matching (Fase B - módulo visual) =====
import { cameraRegistry } from "@/data/cameras";
import { findNearestCameras } from "@/app/lib/findNearestCameras";
import type { CameraRecordV1 } from "@/data/cameras/types";

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

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtCoord(x: unknown, digits = 4) {
  return isFiniteNumber(x) ? x.toFixed(digits) : "—";
}

// ===== Extract helpers (Trend / FRP / detections) =====
type ExtractedOps = {
  trendLabel?: string;
  frpMax?: number;
  frpSum?: number;
  detections?: number;
};

function extractOpsFromDescription(desc?: string): ExtractedOps {
  const out: ExtractedOps = {};
  if (!desc || typeof desc !== "string") return out;

  // Trend: Intensifying / Stable / Weakening
  const mTrend = desc.match(/Trend:\s*([A-Za-z]+)/i);
  if (mTrend?.[1]) out.trendLabel = mTrend[1].trim();

  // FRP max 45.37 • FRP sum 105.00
  const mFrp = desc.match(/FRP\s*max\s*([0-9]+(?:\.[0-9]+)?)\s*.*FRP\s*sum\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (mFrp?.[1]) out.frpMax = Number(mFrp[1]);
  if (mFrp?.[2]) out.frpSum = Number(mFrp[2]);

  // detected 5 fire signals
  const mDet = desc.match(/detected\s+([0-9]+)\s+fire\s+signals?/i);
  if (mDet?.[1]) out.detections = Number(mDet[1]);

  return out;
}

function trendBadgeStyle(label?: string) {
  const t = (label ?? "").toLowerCase();
  if (t === "intensifying") return "border-red-400/30 bg-red-400/15 text-red-100";
  if (t === "weakening") return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
  if (t === "stable") return "border-amber-400/30 bg-amber-400/15 text-amber-100";
  return "border-white/10 bg-white/5 text-white/75";
}

// ===== Visual Observation (Módulo 1) =====
type VisualSource = {
  kind: "live" | "periodic" | "snapshot";
  title: string;
  subtitle?: string;
  freshnessLabel: string;
  href?: string;
  imageUrl?: string;
};

function buildVisualSources(ev: EnvironmentalEvent): VisualSource[] {
  const sources: VisualSource[] = [];

  if (ev.liveFeedUrl && /^https?:\/\//.test(ev.liveFeedUrl)) {
    sources.push({
      kind: "live",
      title: "Live feed (externo)",
      subtitle: "Fuente: enlace del evento",
      freshnessLabel: "LIVE",
      href: ev.liveFeedUrl,
    });
  }

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

function formatDistanceKm(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n < 10) return `${n.toFixed(1)} km`;
  return `${Math.round(n)} km`;
}

function cadenceLabel(cam: CameraRecordV1) {
  const sec = cam.update?.expectedIntervalSec;
  if (typeof sec === "number" && Number.isFinite(sec) && sec > 0) {
    const min = Math.max(1, Math.round(sec / 60));
    return `≈ cada ${min} min`;
  }
  return cam.mediaType === "stream" ? "STREAM" : "snapshot";
}

function cameraHref(cam: CameraRecordV1): { href?: string; label?: string; hint?: string } {
  const f = cam.fetch;
  if (f.kind === "image_url") return { href: f.url, label: "Abrir imagen", hint: "externo" };
  if (f.kind === "stream_url") return { href: f.url, label: "Abrir stream", hint: "externo" };
  if (f.kind === "html_embed") return { href: f.url, label: "Abrir fuente", hint: "externo" };
  if (f.kind === "provider_api") return { href: undefined, label: undefined, hint: "Proveedor API (sin enlace directo)" };
  return { href: undefined, label: undefined };
}

type PanelView = "main" | "ops" | "visual";

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

function SeverityDot({ sev }: { sev: EnvironmentalEvent["severity"] }) {
  return (
    <span
      className={[
        "inline-block h-2 w-2 rounded-full",
        sev === "critical"
          ? "bg-red-500"
          : sev === "high"
          ? "bg-orange-500"
          : sev === "moderate"
          ? "bg-yellow-500"
          : "bg-emerald-400",
      ].join(" ")}
    />
  );
}

export function AlertPanel(props: { event: EnvironmentalEvent | null; onClose: () => void; shareUrl?: string }) {
  const { event, onClose, shareUrl } = props;

  const [copied, setCopied] = useState(false);
  const [followed, setFollowed] = useState<string[]>([]);
  const [view, setView] = useState<PanelView>("main");

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
    setView("main");
  }, [event?.id]);

  // ✅ Hooks SIEMPRE arriba, sin returns antes
  const header = useMemo(() => {
    if (!event) return null;
    const cat = categoryLabels[event.category] ?? event.category;
    const color = categoryColors[event.category] ?? "#7dd3fc";
    return { cat, color };
  }, [event?.id]);

  const cameraCandidates = useMemo(() => {
    if (!event) return [];
    if (!isFiniteNumber((event as any).latitude) || !isFiniteNumber((event as any).longitude)) return [];

    const point = { lat: (event as any).latitude as number, lon: (event as any).longitude as number };
    return findNearestCameras(cameraRegistry, point, {
      maxResults: 3,
      requireVerified: false,
    });
  }, [event?.id]);

  // ✅ Extract ops info (trend/frp/detections) from description safely
  const ops = useMemo(() => extractOpsFromDescription(event?.description), [event?.id]);

  // ✅ Recién acá hacemos el return temprano
  if (!event || !header) return null;

  const isFollowed = followed.includes(event.id);

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

  const visualBadge = (() => {
    const live = visuals.find((v) => v.kind === "live");
    if (live) return { text: "LIVE", className: badgeStyle("live") };
    const periodic = visuals.find((v) => v.kind === "periodic");
    if (periodic) return { text: periodic.freshnessLabel, className: badgeStyle("periodic") };
    const snap = visuals.find((v) => v.kind === "snapshot");
    if (snap) return { text: snap.freshnessLabel, className: badgeStyle("snapshot") };
    return null;
  })();

  const opsBadge =
    ops.trendLabel
      ? { text: `TREND: ${ops.trendLabel}`, className: trendBadgeStyle(ops.trendLabel) }
      : null;

  const isCompact = view !== "main";

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

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
        <div
          className="h-1.5"
          style={{
            background: `linear-gradient(90deg, ${header.color}CC, ${header.color}14, transparent)`,
          }}
        />

        {/* HEADER */}
        <div
          className={[
            "relative border-b border-white/10 bg-black/10",
            isCompact ? "px-4 py-3 md:px-5 md:py-3" : "p-5 md:p-6",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-2">
            {isCompact ? (
              <button
                type="button"
                onClick={() => setView("main")}
                className={[
                  "h-9 px-3 rounded-xl",
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
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className={[
                "h-9 w-9 rounded-xl",
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
          </div>

          {isCompact ? (
            <>
              <div className="mt-2 text-white/55 text-[11px] uppercase tracking-wider">
                {header.cat} • {utc}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="text-white/90 font-semibold text-base md:text-lg">{event.title}</div>

                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                  <SeverityDot sev={event.severity} />
                  <span className="text-white/75 text-xs">{event.severity.toUpperCase()}</span>
                </span>

                <span className="inline-flex items-center gap-2 text-white/60 text-xs">
                  <span className="pulse-dot h-2 w-2 rounded-full bg-cyan-300/80" />
                  {statusLabel(event.status)}
                </span>

                {opsBadge ? (
                  <span className={["rounded-full border px-2 py-0.5 text-[11px]", opsBadge.className].join(" ")}>
                    {opsBadge.text}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <>
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
                    {fmtCoord((event as any).latitude)}, {fmtCoord((event as any).longitude)}
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
                  <SeverityDot sev={event.severity} />
                  <span className="text-white/80 text-sm">{event.severity.toUpperCase()} Severity</span>

                  <span className="ml-3 inline-flex items-center gap-2 text-white/65 text-sm">
                    <span className="pulse-dot h-2 w-2 rounded-full bg-cyan-300/80" />
                    {statusLabel(event.status)}
                  </span>

                  {opsBadge ? (
                    <span className={["ml-2 rounded-full border px-2 py-0.5 text-[11px]", opsBadge.className].join(" ")}>
                      {opsBadge.text}
                    </span>
                  ) : null}
                </div>

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
            </>
          )}
        </div>

        {/* Content area */}
        <div className="p-5 md:p-6 overflow-y-auto max-h-[calc(82vh-120px)]">
          {view === "main" ? (
            <>
              <div className="grid grid-cols-1 gap-3">
                {/* ✅ Estado operativo primero */}
                <CardButton
                  title="Estado operativo"
                  subtitle={[
                    `Status: ${statusLabel(event.status)}`,
                    ops.trendLabel ? `Trend: ${ops.trendLabel}` : null,
                    `Evacuación: ${event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}`,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                  icon="⚠️"
                  rightBadge={opsBadge}
                  onClick={() => setView("ops")}
                />

                <CardButton
                  title="Observación visual"
                  subtitle={
                    visuals.length
                      ? `Fuentes disponibles: ${visuals.length}. Se prioriza LIVE; luego actualizaciones y snapshots con timestamp.`
                      : cameraCandidates.length
                      ? `Hay cámaras cercanas registradas: ${cameraCandidates.length}. (Sin prometer LIVE: snapshots/streams según fuente).`
                      : "No hay fuentes visuales asociadas a este evento por ahora."
                  }
                  icon="🎥"
                  rightBadge={visualBadge}
                  onClick={() => setView("visual")}
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
                  subtitle={
                    event.ecosystems?.length || event.speciesAtRisk?.length
                      ? "Ecosistemas/especies disponibles en este evento."
                      : "Aún sin datos ambientales asociados."
                  }
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
          ) : view === "ops" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-white/90 font-semibold text-lg">⚠️ Estado operativo</div>
                    <div className="text-white/45 text-sm mt-1">
                      Vista de validación: status + tendencia + señales satelitales. Sin prometer información “en vivo”.
                    </div>
                  </div>

                  {opsBadge ? (
                    <span className={["rounded-full border px-2 py-0.5 text-[11px]", opsBadge.className].join(" ")}>
                      {opsBadge.text}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Status</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{statusLabel(event.status)}</div>
                    <div className="mt-1 text-white/45 text-xs">Actualizado: {utc}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Evacuación</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">
                      {event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}
                    </div>
                    <div className="mt-1 text-white/45 text-xs">Fuente: (a definir cuando conectemos datos oficiales)</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 md:col-span-2">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Tendencia</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {ops.trendLabel ? (
                        <span className={["rounded-full border px-2 py-0.5 text-[11px]", trendBadgeStyle(ops.trendLabel)].join(" ")}>
                          {ops.trendLabel}
                        </span>
                      ) : (
                        <span className="text-white/70 text-sm">—</span>
                      )}
                      <span className="text-white/45 text-xs">
                        Interpretación conservadora en base a detecciones/FRP. Próximo: mostrar “por qué” con métricas.
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-white/40 text-xs uppercase tracking-wider">Detections</div>
                        <div className="mt-1 text-white/85 text-sm font-medium">
                          {typeof ops.detections === "number" && Number.isFinite(ops.detections) ? ops.detections : "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-white/40 text-xs uppercase tracking-wider">FRP max</div>
                        <div className="mt-1 text-white/85 text-sm font-medium">
                          {typeof ops.frpMax === "number" && Number.isFinite(ops.frpMax) ? ops.frpMax.toFixed(2) : "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-white/40 text-xs uppercase tracking-wider">FRP sum</div>
                        <div className="mt-1 text-white/85 text-sm font-medium">
                          {typeof ops.frpSum === "number" && Number.isFinite(ops.frpSum) ? ops.frpSum.toFixed(2) : "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-white/40 text-xs uppercase tracking-wider">Ubicación</div>
                        <div className="mt-1 text-white/85 text-sm font-medium">
                          {fmtCoord((event as any).latitude)}, {fmtCoord((event as any).longitude)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-white/35 text-xs">
                      Nota: esto no sustituye fuentes locales. Es una lectura de señal satelital.
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : view === "visual" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-white/90 font-semibold text-lg">🎥 Observación visual</div>
                    <div className="text-white/45 text-sm mt-1">
                      BioPulse prioriza LIVE real. Si no hay, muestra fuentes con timestamp (cada X min / snapshot).
                    </div>
                  </div>

                  {visualBadge ? (
                    <span className={["rounded-full border px-2 py-0.5 text-[11px]", visualBadge.className].join(" ")}>
                      {visualBadge.text}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-white/85 text-sm font-semibold">Cámaras cercanas (registry)</div>
                      <div className="text-white/45 text-xs mt-0.5">
                        Fuente curada por BioPulse. No se promete “LIVE” salvo stream real del proveedor.
                      </div>
                    </div>
                    <span className={["shrink-0 rounded-full border px-2 py-0.5 text-[11px]", badgeStyle("periodic")].join(" ")}>
                      {cameraCandidates.length ? `${cameraCandidates.length} cerca` : "0"}
                    </span>
                  </div>

                  <div className="mt-3">
                    {cameraCandidates.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-white/80 text-sm font-medium">No hay cámaras públicas registradas cerca</div>
                        <div className="text-white/45 text-xs mt-1">
                          Próximo: botón para “Proponer una cámara” (guardianes) y validación.
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {cameraCandidates.map((c) => {
                          const cam = c.camera as CameraRecordV1;
                          const dist = formatDistanceKm(c.distanceKm);
                          const attrib = cam.usage?.attributionText ?? `Provider: ${cam.providerId}`;
                          const cadence = cadenceLabel(cam);
                          const link = cameraHref(cam);

                          return (
                            <div key={cam.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-white/85 text-sm font-semibold truncate">{cam.title}</div>
                                  <div className="text-white/45 text-xs mt-0.5 line-clamp-2">
                                    {attrib} • {cam.coverage.countryISO2}
                                    {cam.coverage.admin1 ? ` • ${cam.coverage.admin1}` : ""}
                                    {cam.coverage.locality ? ` • ${cam.coverage.locality}` : ""}
                                  </div>
                                  <div className="text-white/40 text-xs mt-1">
                                    A {dist} • {cam.mediaType === "stream" ? "Stream" : "Snapshot"} • {cadence}
                                  </div>
                                </div>

                                <span
                                  className={[
                                    "shrink-0 rounded-full border px-2 py-0.5 text-[11px]",
                                    cam.mediaType === "stream" ? badgeStyle("live") : badgeStyle("periodic"),
                                  ].join(" ")}
                                  title={
                                    cam.mediaType === "stream"
                                      ? "Stream (no necesariamente “en vivo”)"
                                      : "Actualización periódica / snapshot"
                                  }
                                >
                                  {cam.mediaType === "stream" ? "STREAM" : cadence}
                                </span>
                              </div>

                              <div className="mt-3">
                                {link.href ? (
                                  <a
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 hover:bg-black/30"
                                    href={link.href}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {link.label ?? "Abrir fuente"}
                                    <span className="text-white/40 text-xs">({link.hint ?? "externo"})</span>
                                  </a>
                                ) : (
                                  <div className="text-white/45 text-xs">
                                    {link.hint ?? "Sin enlace directo (se resolverá vía Worker/proxy)."}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  {visuals.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-white/80 text-sm font-medium">No hay observación visual del evento</div>
                      <div className="text-white/45 text-xs mt-1">
                        Se usarán cámaras cercanas y snapshots con timestamp cuando haya fuentes conectadas.
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
                              <img
                                src={v.imageUrl}
                                alt=""
                                className="h-40 w-full object-cover opacity-90"
                                loading="lazy"
                              />
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
                  Nota: lo próximo es proxyear snapshots/streams vía Worker (CORS + cache) para no depender de enlaces externos.
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
