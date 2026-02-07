import { useEffect, useMemo, useState } from "react";
import type { EnvironmentalEvent } from "@/data/events";
import { categoryLabels, categoryColors } from "@/data/events";

// ===== cameras registry + matching =====
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

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtCoord(x: unknown, digits = 4) {
  return isFiniteNumber(x) ? x.toFixed(digits) : "—";
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

  const mTrend = desc.match(/Trend:\s*([A-Za-z]+)/i);
  if (mTrend?.[1]) out.trendLabel = mTrend[1].trim();

  const mFrp = desc.match(/FRP\s*max\s*([0-9]+(?:\.[0-9]+)?)\s*.*FRP\s*sum\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (mFrp?.[1]) out.frpMax = Number(mFrp[1]);
  if (mFrp?.[2]) out.frpSum = Number(mFrp[2]);

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

// ===== Breaking (auto) =====
type BreakingLevel = "urgent" | "warning";
type BreakingInfo = {
  active: boolean;
  level?: BreakingLevel;
  headline?: string;
  detail?: string;
  reasons?: string[];
};

function computeBreaking(ev: EnvironmentalEvent, ops: ExtractedOps): BreakingInfo {
  const reasons: string[] = [];

  const sev = (ev.severity ?? "").toLowerCase();
  const status = (ev.status ?? "").toLowerCase();
  const evac = (ev.evacuationLevel ?? "").toLowerCase();
  const trend = (ops.trendLabel ?? "").toLowerCase();

  const evacSeria = evac === "mandatory" || evac === "ordered";
  const isCritical = sev === "critical";
  const isHigh = sev === "high";
  const escalando = status === "escalating" || trend === "intensifying";
  const pocoContenible =
    (typeof ops.frpMax === "number" && ops.frpMax >= 40) || (typeof ops.detections === "number" && ops.detections >= 12);

  if (evacSeria) reasons.push("Evacuación");
  if (isCritical) reasons.push("Severidad crítica");
  if (escalando) reasons.push("En expansión");
  if (pocoContenible) reasons.push("Señal alta");

  const urgent = evacSeria || isCritical;
  const warning = !urgent && (isHigh || escalando);

  if (!urgent && !warning) return { active: false };

  let headline = urgent ? "BREAKING • URGENTE" : "ALERTA • ATENCIÓN";
  let detail = "";

  if (evacSeria) {
    headline = "EVACUACIÓN • URGENTE";
    detail = "Hay indicios de evacuación en curso/ordenada. Seguí fuentes oficiales y evitá la zona.";
  } else if (isCritical && escalando) {
    headline = "RIESGO INMINENTE";
    detail = "Evento crítico con señales de expansión. Monitoreo prioritario recomendado.";
  } else if (isCritical) {
    headline = "SITUACIÓN CRÍTICA";
    detail = "Evento crítico detectado. Puede haber cambios rápidos por viento/combustible.";
  } else if (escalando) {
    headline = "INCIDENTE EN EXPANSIÓN";
    detail = "La tendencia indica intensificación. Revisá cámaras/noticias y reportes guardianes.";
  } else if (isHigh) {
    headline = "SEVERIDAD ALTA";
    detail = "Señal fuerte. Mantener seguimiento y verificar información local.";
  } else {
    detail = "Seguimiento prioritario recomendado.";
  }

  return {
    active: true,
    level: urgent ? "urgent" : "warning",
    headline,
    detail,
    reasons,
  };
}

function BreakingBar(props: { info: BreakingInfo; onGoNews?: () => void }) {
  const { info, onGoNews } = props;
  if (!info.active) return null;

  const urgent = info.level === "urgent";
  const border = urgent ? "border-red-400/35" : "border-amber-400/35";
  const bg = urgent ? "bg-red-400/12" : "bg-amber-400/12";
  const text1 = urgent ? "text-red-100" : "text-amber-100";
  const text2 = urgent ? "text-red-100/80" : "text-amber-100/80";

  return (
    <div className={["rounded-2xl border", border, bg, "p-4"].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={["text-xs uppercase tracking-wider", text1].join(" ")}>{info.headline ?? "BREAKING"}</div>
          <div className={["mt-2 text-sm leading-relaxed", text2].join(" ")}>{info.detail ?? "Situación relevante detectada."}</div>

          {info.reasons?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {info.reasons.slice(0, 4).map((r) => (
                <span
                  key={r}
                  className={[
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    urgent ? "border-red-400/25 bg-black/20 text-red-100/80" : "border-amber-400/25 bg-black/20 text-amber-100/80",
                  ].join(" ")}
                >
                  {r}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {onGoNews ? (
          <button
            type="button"
            onClick={onGoNews}
            className={[
              "shrink-0",
              "rounded-xl border border-white/10 bg-black/20 hover:bg-black/30",
              "px-3 py-2 text-xs text-white/85 transition-colors",
            ].join(" ")}
            title="Ver noticias y redes"
          >
            Ver noticias →
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ===== News model (cable-ready) =====
type NewsSourceGroup = "government" | "fire" | "media" | "social";
type NewsPriority = "breaking" | "normal";
type NewsMedia =
  | { kind: "none" }
  | { kind: "image"; thumbUrl: string; mediaUrl?: string }
  | { kind: "video"; thumbUrl: string; mediaUrl?: string };

type NewsItem = {
  id: string;
  sourceGroup: NewsSourceGroup;
  priority: NewsPriority;
  publisherName: string;
  title: string;
  summary: string;
  content?: string;
  publishedAt: Date;
  url?: string;
  media: NewsMedia;
};

function groupLabel(g: NewsSourceGroup) {
  if (g === "government") return "Gobierno";
  if (g === "fire") return "Bomberos";
  if (g === "media") return "Medios";
  return "Redes";
}

function groupStyle(g: NewsSourceGroup) {
  if (g === "government") return { border: "border-emerald-400/25", bg: "bg-emerald-400/10", text: "text-emerald-100" };
  if (g === "fire") return { border: "border-red-400/25", bg: "bg-red-400/10", text: "text-red-100" };
  if (g === "media") return { border: "border-cyan-400/25", bg: "bg-cyan-400/10", text: "text-cyan-100" };
  return { border: "border-white/10", bg: "bg-white/5", text: "text-white/85" };
}

// Thumbnails: usamos placeholders estables (no dependen de internet). Luego se reemplazan por URLs reales.
const PLACEHOLDER_GOV =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%2310643a'/><stop offset='1' stop-color='%230a0f1a'/></linearGradient></defs><rect width='100%25' height='100%25' fill='url(%23g)'/><text x='50%25' y='50%25' fill='rgba(255,255,255,0.75)' font-size='28' font-family='Arial' text-anchor='middle'>COMUNICADO OFICIAL</text></svg>";
const PLACEHOLDER_FIRE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%23b91c1c'/><stop offset='1' stop-color='%230a0f1a'/></linearGradient></defs><rect width='100%25' height='100%25' fill='url(%23g)'/><text x='50%25' y='50%25' fill='rgba(255,255,255,0.75)' font-size='28' font-family='Arial' text-anchor='middle'>PARTE OPERATIVO</text></svg>";
const PLACEHOLDER_MEDIA =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%230ea5e9'/><stop offset='1' stop-color='%230a0f1a'/></linearGradient></defs><rect width='100%25' height='100%25' fill='url(%23g)'/><text x='50%25' y='50%25' fill='rgba(255,255,255,0.75)' font-size='28' font-family='Arial' text-anchor='middle'>COBERTURA</text></svg>";

function buildMockNews(ev: EnvironmentalEvent, ops: ExtractedOps): NewsItem[] {
  const now = Date.now();
  const loc = ev.location || "zona afectada";
  const st = statusLabel(ev.status);
  const sev = (ev.severity ?? "").toUpperCase();
  const trend = ops.trendLabel ? ops.trendLabel.toUpperCase() : "—";
  const evac = ev.evacuationLevel ? ev.evacuationLevel.toUpperCase() : "—";

  const mkId = (g: NewsSourceGroup, i: number) => `${ev.id}:${g}:${i}`;

  const gov: NewsItem[] = [
    {
      id: mkId("government", 1),
      sourceGroup: "government",
      priority: ev.evacuationLevel ? "breaking" : "normal",
      publisherName: "Autoridad local / Protección Civil",
      title: ev.evacuationLevel ? `Evacuación ${evac} en ${loc}` : `Actualización oficial: situación ${st} en ${loc}`,
      summary: ev.evacuationLevel
        ? `Se informa evacuación ${evac} en áreas cercanas. Seguir canales oficiales y evitar circular.`
        : `Se emite actualización oficial: estado ${st}, severidad ${sev}, tendencia ${trend}.`,
      content:
        `Resumen:\n` +
        `• Ubicación: ${loc}\n` +
        `• Estado: ${st}\n` +
        `• Severidad: ${sev}\n` +
        `• Tendencia: ${trend}\n` +
        `• Evacuación: ${evac}\n\n` +
        `Recomendaciones:\n` +
        `• Evitar acercarse al área.\n` +
        `• Preparar documentación/medicación si corresponde.\n` +
        `• Priorizar información verificada.\n`,
      publishedAt: new Date(now - 22 * 60 * 1000),
      url: undefined,
      media: { kind: "image", thumbUrl: PLACEHOLDER_GOV },
    },
    {
      id: mkId("government", 2),
      sourceGroup: "government",
      priority: "normal",
      publisherName: "Municipio / Gobierno",
      title: `Puntos de información y líneas de asistencia para ${loc}`,
      summary: `Se difunden canales de consulta, horarios de atención y recomendaciones preventivas.`,
      content:
        `Información útil:\n` +
        `• Líneas de consulta (placeholder)\n` +
        `• Centros de evacuación (placeholder)\n` +
        `• Estado de rutas (placeholder)\n\n` +
        `Nota: esta sección se conectará a fuentes reales por región.\n`,
      publishedAt: new Date(now - 58 * 60 * 1000),
      url: undefined,
      media: { kind: "image", thumbUrl: PLACEHOLDER_GOV },
    },
  ];

  const fire: NewsItem[] = [
    {
      id: mkId("fire", 1),
      sourceGroup: "fire",
      priority: (ev.severity === "critical" || ev.status === "escalating") ? "breaking" : "normal",
      publisherName: "Bomberos / Brigada",
      title: `Parte operativo: ${st} (${sev}) • ${loc}`,
      summary: `Reporte operativo: recursos desplegados, perímetro preliminar y condiciones relevantes (viento/humedad).`,
      content:
        `Parte operativo (placeholder):\n` +
        `• Recursos: dotaciones + logística (placeholder)\n` +
        `• Perímetro: preliminar (placeholder)\n` +
        `• Condiciones: viento ${metric(ev.windSpeed, " km/h")} • humedad ${metric(ev.humidity, "%")}\n` +
        `• Observación: tendencia ${trend}\n\n` +
        `Este feed se conectará a partes oficiales cuando estén disponibles.\n`,
      publishedAt: new Date(now - 15 * 60 * 1000),
      url: undefined,
      media: { kind: "image", thumbUrl: PLACEHOLDER_FIRE },
    },
    {
      id: mkId("fire", 2),
      sourceGroup: "fire",
      priority: "normal",
      publisherName: "Coordinación operativa",
      title: `Recomendaciones de seguridad para la población en ${loc}`,
      summary: `Cómo actuar ante humo, cenizas, cortes y desplazamientos. Recomendaciones prácticas.`,
      content:
        `Recomendaciones (placeholder):\n` +
        `• Evitar exposición al humo.\n` +
        `• Mantener ventanas cerradas si hay ceniza.\n` +
        `• Preparar kit básico.\n` +
        `• Verificar rutas habilitadas.\n`,
      publishedAt: new Date(now - 1 * 60 * 60 * 1000 - 12 * 60 * 1000),
      url: undefined,
      media: { kind: "image", thumbUrl: PLACEHOLDER_FIRE },
    },
  ];

  const media: NewsItem[] = [
    {
      id: mkId("media", 1),
      sourceGroup: "media",
      priority: "normal",
      publisherName: "Medio regional",
      title: `Incidente en ${loc}: qué se sabe hasta ahora`,
      summary: `Síntesis de situación, zonas afectadas y evolución reciente. (Bajada corta para consumo rápido).`,
      content:
        `Resumen ampliado (placeholder):\n` +
        `• Detección satelital reciente: ${typeof ops.detections === "number" ? ops.detections : "—"} señales\n` +
        `• FRP max: ${typeof ops.frpMax === "number" ? ops.frpMax.toFixed(2) : "—"}\n` +
        `• FRP sum: ${typeof ops.frpSum === "number" ? ops.frpSum.toFixed(2) : "—"}\n\n` +
        `BioPulse muestra un extracto para evitar que la persona “abandone” la app.\n`,
      publishedAt: new Date(now - 36 * 60 * 1000),
      url: undefined,
      media: { kind: "image", thumbUrl: PLACEHOLDER_MEDIA },
    },
    {
      id: mkId("media", 2),
      sourceGroup: "media",
      priority: "normal",
      publisherName: "Cobertura audiovisual",
      title: `Video: imágenes desde zonas cercanas (placeholder)`,
      summary: `Contenido audiovisual referencial. En el futuro se integrarán videos embebibles o proxyeados.`,
      content:
        `Video (placeholder):\n` +
        `• En esta etapa no embebemos iframes externos por CORS/seguridad.\n` +
        `• Cuando conectemos fuentes, intentaremos embed seguro o proxy con Worker.\n`,
      publishedAt: new Date(now - 2 * 60 * 60),
      url: undefined,
      media: { kind: "video", thumbUrl: PLACEHOLDER_MEDIA, mediaUrl: undefined },
    },
  ];

  // Social (no es “noticia” formal): lo usamos en bloque aparte, pero lo dejamos como NewsItem cable-ready.
  const social: NewsItem[] = [
    {
      id: mkId("social", 1),
      sourceGroup: "social",
      priority: "normal",
      publisherName: "@vecina_alerta",
      title: `“Se ve humo hacia el oeste, cambió el viento”`,
      summary: `Testimonio breve (no verificado). Sirve como señal social, no como verdad.`,
      publishedAt: new Date(now - 8 * 60 * 1000),
      url: undefined,
      media: { kind: "none" },
    },
    {
      id: mkId("social", 2),
      sourceGroup: "social",
      priority: "normal",
      publisherName: "@ruta_info",
      title: `“Tránsito lento en acceso principal”`,
      summary: `Reporte ciudadano (no verificado). Se validará con guardianes + fuentes oficiales.`,
      publishedAt: new Date(now - 18 * 60 * 1000),
      url: undefined,
      media: { kind: "none" },
    },
  ];

  return [...gov, ...fire, ...media, ...social];
}

function byGroup(items: NewsItem[], g: NewsSourceGroup) {
  return items.filter((x) => x.sourceGroup === g).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

function pickBreakingFromNews(items: NewsItem[]) {
  return items.filter((x) => x.priority === "breaking").sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

function NewsThumb(props: { item: NewsItem }) {
  const { item } = props;
  const hasThumb = item.media.kind !== "none" && !!item.media.thumbUrl;

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
      {hasThumb ? (
        <img src={item.media.thumbUrl} alt="" className="h-28 w-full object-cover opacity-90" loading="lazy" />
      ) : (
        <div className="h-28 w-full bg-white/5" />
      )}

      {item.media.kind === "video" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-white/90 text-xs">▶ VIDEO</div>
        </div>
      ) : null}
    </div>
  );
}

function NewsCard(props: { item: NewsItem; onOpen: (id: string) => void }) {
  const { item, onOpen } = props;
  const badge = groupStyle(item.sourceGroup);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <NewsThumb item={item} />

      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-white/90 font-semibold text-sm leading-snug">{item.title}</div>
          <div className="mt-1 text-white/60 text-xs line-clamp-2">{item.summary}</div>
        </div>

        <span className={["shrink-0 rounded-full border px-2 py-0.5 text-[11px]", badge.border, badge.bg, badge.text].join(" ")}>
          {groupLabel(item.sourceGroup)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-white/35 text-[11px]">
          {item.publisherName} • {timeAgoFrom(item.publishedAt)}
        </div>

        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className="rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 px-3 py-2 text-xs text-white/85 transition-colors"
        >
          Ver más
        </button>
      </div>
    </div>
  );
}

function NewsDetail(props: { item: NewsItem; onBack: () => void }) {
  const { item, onBack } = props;
  const badge = groupStyle(item.sourceGroup);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 px-3 py-2 text-xs text-white/85 transition-colors"
        >
          ← Volver a noticias
        </button>

        <span className={["rounded-full border px-2 py-0.5 text-[11px]", badge.border, badge.bg, badge.text].join(" ")}>
          {groupLabel(item.sourceGroup)}
        </span>
      </div>

      <div className="mt-3 text-white/90 font-semibold text-lg leading-snug">{item.title}</div>
      <div className="mt-1 text-white/45 text-xs">
        {item.publisherName} • {formatTimeUTC(item.publishedAt)}
      </div>

      {item.media.kind !== "none" ? (
        <div className="mt-4">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
            <img src={item.media.thumbUrl} alt="" className="h-60 w-full object-cover opacity-95" loading="lazy" />
          </div>

          {item.media.kind === "video" ? (
            <div className="mt-2 text-white/40 text-xs">
              Video: (por ahora no embebemos fuentes externas por CORS/seguridad). Cuando conectemos fuentes reales, intentaremos embed seguro o proxy con Worker.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-white/60 text-xs uppercase tracking-wider">Resumen</div>
        <div className="mt-2 text-white/85 text-sm leading-relaxed">{item.summary}</div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-white/60 text-xs uppercase tracking-wider">Detalle</div>
        <div className="mt-2 text-white/80 text-sm leading-relaxed whitespace-pre-line">
          {item.content ?? "Contenido completo no disponible en esta etapa."}
        </div>
      </div>

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-white/85 transition-colors"
        >
          Abrir fuente externa
          <span className="text-white/35">(opcional)</span>
        </a>
      ) : (
        <div className="mt-3 text-white/35 text-xs">Fuente externa: (se conectará cuando estén las APIs / RSS por región).</div>
      )}
    </div>
  );
}

// ===== Lectura del evento (humana) =====
type Trend = "intensifying" | "stable" | "weakening" | string;

function intensityHuman(frpMax?: number) {
  if (typeof frpMax !== "number" || !Number.isFinite(frpMax)) return "—";
  if (frpMax >= 80) return "Muy alta";
  if (frpMax >= 40) return "Alta";
  if (frpMax >= 15) return "Moderada";
  return "Baja";
}

function activityHuman(detections?: number, trend?: Trend, status?: any) {
  const t = (trend ?? "").toLowerCase();
  const s = (status ?? "").toLowerCase();

  if (s === "escalating" || t === "intensifying") return "En expansión";
  if (s === "stabilizing" || t === "stable") return "Sostenida";
  if (t === "weakening") return "En retroceso";

  if (typeof detections === "number" && Number.isFinite(detections)) {
    if (detections >= 20) return "Muy activa";
    if (detections >= 8) return "Activa";
    if (detections >= 3) return "Leve";
    return "Débil";
  }
  return "—";
}

function stateHuman(status?: any) {
  const s = (status ?? "").toLowerCase();
  if (s === "escalating") return "Escalando";
  if (s === "stabilizing") return "Estabilizándose";
  if (s === "contained") return "Contenido";
  if (s === "resolved") return "Resuelto";
  if (s === "active") return "Activo";
  return "Activo";
}

// ===== Gauge (Microsoft-ish) =====
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct(value?: number, maxForScale = 1) {
  if (typeof value !== "number" || !Number.isFinite(value) || maxForScale <= 0) return 0;
  return clamp((value / maxForScale) * 100, 0, 100);
}

function ringTone(p: number) {
  if (p >= 80) return { stroke: "rgba(248,113,113,0.85)", glow: "rgba(248,113,113,0.20)" };
  if (p >= 55) return { stroke: "rgba(251,146,60,0.85)", glow: "rgba(251,146,60,0.18)" };
  if (p >= 30) return { stroke: "rgba(250,204,21,0.75)", glow: "rgba(250,204,21,0.12)" };
  return { stroke: "rgba(110,231,183,0.75)", glow: "rgba(110,231,183,0.12)" };
}

function GaugeRing(props: {
  label: string;
  value?: number;
  max: number;
  valueFmt: (v?: number) => string;
  hint?: string;
  humanLine?: string;
}) {
  const { label, value, max, valueFmt, hint, humanLine } = props;
  const p = pct(value, max);
  const deg = (p / 100) * 270;
  const tone = ringTone(p);

  const bg = `conic-gradient(from 225deg, ${tone.stroke} 0deg ${deg}deg, rgba(255,255,255,0.10) ${deg}deg 270deg, rgba(255,255,255,0) 270deg 360deg)`;

  const markerDeg = 225 + deg;
  const rad = (markerDeg * Math.PI) / 180;
  const r = 42;
  const cx = 52;
  const cy = 52;
  const mx = cx + r * Math.cos(rad);
  const my = cy + r * Math.sin(rad);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-white/75 text-xs uppercase tracking-wider">{label}</div>
        {hint ? <div className="text-white/35 text-[11px]">{hint}</div> : null}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-[104px] w-[104px] shrink-0">
          <div className="absolute inset-0 rounded-full" style={{ background: bg, filter: `drop-shadow(0 0 18px ${tone.glow})` }} />
          <div className="absolute inset-[10px] rounded-full bg-[#0a0f1a]/95 border border-white/10" />

          <div
            className="absolute h-2.5 w-2.5 rounded-full border border-white/30"
            style={{
              left: mx - 5,
              top: my - 5,
              background: "rgba(255,255,255,0.85)",
              boxShadow: "0 0 10px rgba(255,255,255,0.12)",
            }}
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-white/90 text-lg font-semibold leading-none">{Math.round(p)}</div>
            <div className="text-white/35 text-[11px]">nivel</div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-white/90 text-xl font-semibold">{valueFmt(value)}</div>
          {humanLine ? <div className="mt-1 text-white/70 text-sm">{humanLine}</div> : null}
          <div className="mt-2 text-white/35 text-[11px]">Base: señal satelital + escala operativa (0–{max}).</div>
        </div>
      </div>
    </div>
  );
}

// ===== Weather (contexto operativo) =====
type WeatherOps = {
  windowLabel: string;
  rainProbMaxPct?: number;
  windMaxKmh?: number;
  humidityMinPct?: number;
  tempAvgC?: number;
  narrative: string;
};

function round1(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined;
}

function safeMax(arr?: Array<number | null>) {
  const xs = (arr ?? []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return undefined;
  return Math.max(...xs);
}

function safeMin(arr?: Array<number | null>) {
  const xs = (arr ?? []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return undefined;
  return Math.min(...xs);
}

function safeAvg(arr?: Array<number | null>) {
  const xs = (arr ?? []).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return undefined;
  const s = xs.reduce((a, b) => a + b, 0);
  return s / xs.length;
}

function formatPct(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)}%` : "—";
}
function formatKmh(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)} km/h` : "—";
}
function formatC(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)}°C` : "—";
}

function weatherNarrative(input: {
  rainProbMaxPct?: number;
  windMaxKmh?: number;
  humidityMinPct?: number;
  tempAvgC?: number;
  trendLabel?: string;
}) {
  const r = input.rainProbMaxPct;
  const w = input.windMaxKmh;
  const h = input.humidityMinPct;

  const hasRain = typeof r === "number";
  const hasWind = typeof w === "number";
  const hasHum = typeof h === "number";

  const rainHelp =
    hasRain && r >= 60
      ? "Se esperan lluvias con probabilidad alta: podrían ayudar a frenar el avance del fuego."
      : hasRain && r >= 30
      ? "Hay chances moderadas de lluvia: podrían aliviar parcialmente, pero no garantizan contención."
      : hasRain
      ? "Baja probabilidad de lluvia: el incendio podría sostenerse si las condiciones siguen secas."
      : "Sin datos de lluvia por ahora.";

  const windRisk =
    hasWind && w >= 35
      ? "Vientos fuertes: aumentan el riesgo de propagación y cambios bruscos de dirección."
      : hasWind && w >= 20
      ? "Viento moderado: puede favorecer el avance del frente si el combustible está seco."
      : hasWind
      ? "Viento débil: menor empuje para la propagación, aunque el fuego puede persistir."
      : "Sin datos de viento por ahora.";

  const dryness =
    hasHum && h <= 25
      ? "Aire muy seco: el entorno favorece ignición y reactivaciones."
      : hasHum && h <= 40
      ? "Humedad baja: condiciones favorables para mantener actividad del fuego."
      : hasHum
      ? "Humedad relativamente alta: podría ayudar a moderar la actividad."
      : "Sin datos de humedad por ahora.";

  const t = (input.trendLabel ?? "").toLowerCase();
  const trendHint =
    t === "intensifying"
      ? "Además, la tendencia indica intensificación: conviene monitorear con más frecuencia."
      : t === "weakening"
      ? "La tendencia indica debilitamiento: aun así, pueden ocurrir rebrotes."
      : t === "stable"
      ? "La tendencia se mantiene estable: atención a cambios por viento/combustible."
      : "";

  return `${rainHelp} ${windRisk} ${dryness}${trendHint ? " " + trendHint : ""}`.trim();
}

async function fetchWeatherOps(lat: number, lon: number): Promise<WeatherOps | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&hourly=precipitation_probability,windspeed_10m,relativehumidity_2m,temperature_2m` +
    `&forecast_days=2` +
    `&timezone=UTC`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const hourly = data?.hourly;
  const times: string[] = hourly?.time ?? [];
  const now = Date.now();

  let i0 = 0;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (Number.isFinite(t) && t >= now) {
      i0 = i;
      break;
    }
  }
  const i1 = clamp(i0 + 12, i0, times.length);

  const slice = (arr: Array<number | null> | undefined) => (arr ? arr.slice(i0, i1) : undefined);

  const rainProbMaxPct = safeMax(slice(hourly?.precipitation_probability));
  const windMaxKmh = round1(safeMax(slice(hourly?.windspeed_10m)));
  const humidityMinPct = safeMin(slice(hourly?.relativehumidity_2m));
  const tempAvgC = round1(safeAvg(slice(hourly?.temperature_2m)));

  return {
    windowLabel: "Próximas 12 h (UTC)",
    rainProbMaxPct,
    windMaxKmh,
    humidityMinPct,
    tempAvgC,
    narrative: "",
  };
}

// ===== Visual (cámaras) =====
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

function badgeStyle(kind: "live" | "periodic" | "snapshot") {
  if (kind === "live") return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
  if (kind === "periodic") return "border-cyan-400/30 bg-cyan-400/15 text-cyan-100";
  return "border-white/10 bg-white/5 text-white/80";
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

type PanelView = "main" | "ops" | "satellite" | "cameras" | "environment" | "impact" | "insight" | "guardian" | "news";

export function AlertPanel(props: { event: EnvironmentalEvent | null; onClose: () => void; shareUrl?: string }) {
  const { event, onClose, shareUrl } = props;

  const [copied, setCopied] = useState(false);
  const [followed, setFollowed] = useState<string[]>([]);
  const [view, setView] = useState<PanelView>("main");

  // Weather state
  const [weatherOps, setWeatherOps] = useState<WeatherOps | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // News state (sub-vista interna)
  const [newsSelectedId, setNewsSelectedId] = useState<string | null>(null);

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
    setWeatherOps(null);
    setWeatherLoading(false);
    setNewsSelectedId(null);
  }, [event?.id]);

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
    return findNearestCameras(cameraRegistry, point, { maxResults: 3, requireVerified: false });
  }, [event?.id]);

  const ops = useMemo(() => extractOpsFromDescription(event?.description), [event?.id]);
  const breaking = useMemo(
    () => (event ? computeBreaking(event, ops) : { active: false }),
    [event?.id, ops.trendLabel, ops.frpMax, ops.frpSum, ops.detections]
  );

  // News (mock hoy, real mañana)
  const newsItems = useMemo(() => (event ? buildMockNews(event, ops) : []), [event?.id, ops.trendLabel, ops.frpMax, ops.frpSum, ops.detections]);
  const newsGov = useMemo(() => byGroup(newsItems, "government"), [newsItems]);
  const newsFire = useMemo(() => byGroup(newsItems, "fire"), [newsItems]);
  const newsMedia = useMemo(() => byGroup(newsItems, "media"), [newsItems]);
  const socialItems = useMemo(() => byGroup(newsItems, "social"), [newsItems]);
  const newsBreaking = useMemo(() => pickBreakingFromNews(newsItems), [newsItems]);

  const newsSelected = useMemo(() => {
    if (!newsSelectedId) return null;
    return newsItems.find((x) => x.id === newsSelectedId) ?? null;
  }, [newsSelectedId, newsItems]);

  // Weather fetch
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!event) return;
      const lat = (event as any).latitude;
      const lon = (event as any).longitude;
      if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
        setWeatherOps(null);
        return;
      }

      setWeatherLoading(true);
      try {
        const base = await fetchWeatherOps(lat, lon);
        if (!alive) return;

        if (!base) {
          setWeatherOps(null);
          return;
        }

        const narrative = weatherNarrative({
          rainProbMaxPct: base.rainProbMaxPct,
          windMaxKmh: base.windMaxKmh,
          humidityMinPct: base.humidityMinPct,
          tempAvgC: base.tempAvgC,
          trendLabel: ops.trendLabel,
        });

        setWeatherOps({ ...base, narrative });
      } catch {
        if (!alive) return;
        setWeatherOps(null);
      } finally {
        if (!alive) return;
        setWeatherLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [event?.id, ops.trendLabel]);

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
  const lastSignalAgo = timeAgoFrom(event.timestamp);

  const opsBadge = ops.trendLabel ? { text: `TREND: ${ops.trendLabel}`, className: trendBadgeStyle(ops.trendLabel) } : null;

  const isCompact = view !== "main";

  // scales
  const frpScale = 120;
  const detScale = 25;
  const sumScale = 250;

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 z-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          "absolute z-10 left-1/2 -translate-x-1/2",
          "bottom-4 md:bottom-6",
          "w-[calc(100%-24px)] md:w-[900px]",
          "max-h-[88vh]",
          "rounded-2xl border border-white/10 bg-[#0a0f1a]/95 shadow-2xl",
          "backdrop-blur-md",
          "flex flex-col overflow-hidden",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="h-1.5 shrink-0"
          style={{ background: `linear-gradient(90deg, ${header.color}CC, ${header.color}14, transparent)` }}
        />

        {/* HEADER */}
        <div className={["relative border-b border-white/10 bg-black/10 shrink-0", isCompact ? "px-4 py-3 md:px-5 md:py-3" : "p-5 md:p-6"].join(" ")}>
          <div className="flex items-center justify-between gap-2">
            {isCompact ? (
              <button
                type="button"
                onClick={() => {
                  setView("main");
                  setNewsSelectedId(null);
                }}
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

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6">
          {/* Breaking visible en HOME y en NOTICIAS */}
          {(view === "main" || view === "news") && breaking.active ? (
            <div className="mb-4">
              <BreakingBar info={breaking} onGoNews={view !== "news" ? () => setView("news") : undefined} />
            </div>
          ) : null}

          {view === "main" ? (
            <>
              <div className="grid grid-cols-1 gap-3">
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
                  title="Observación satelital"
                  subtitle={event.satelliteImageUrl ? "Imagen asociada + métricas VIIRS/FRP. (Timeline después)." : "Aún sin imagen asociada."}
                  icon="🛰️"
                  rightBadge={event.satelliteImageUrl ? { text: timeAgoFrom(event.timestamp), className: badgeStyle("snapshot") } : null}
                  onClick={() => setView("satellite")}
                />

                <CardButton
                  title="Cámaras públicas cercanas"
                  subtitle={
                    cameraCandidates.length
                      ? `Cámaras registradas cerca: ${cameraCandidates.length}. (Streams/snapshots según fuente).`
                      : "No hay cámaras públicas registradas cerca por ahora."
                  }
                  icon="🎥"
                  rightBadge={cameraCandidates.length ? { text: `${cameraCandidates.length} cerca`, className: badgeStyle("periodic") } : null}
                  onClick={() => setView("cameras")}
                />

                <CardButton
                  title="Contexto ambiental"
                  subtitle={event.ecosystems?.length || event.speciesAtRisk?.length ? "Ecosistemas/especies disponibles para este evento." : "Aún sin datos ambientales asociados."}
                  icon="🌱"
                  rightBadge={null}
                  onClick={() => setView("environment")}
                />

                <CardButton
                  title="Impacto humano"
                  subtitle={`Población: ${
                    typeof event.affectedPopulation === "number" ? `≈ ${event.affectedPopulation.toLocaleString("es-AR")}` : "—"
                  } • Área: ${km2(event.affectedArea)}`}
                  icon="👥"
                  rightBadge={null}
                  onClick={() => setView("impact")}
                />

                <CardButton
                  title="Indicadores + BioPulse Insight"
                  subtitle={event.aiInsight?.narrative ? "Insight disponible + indicadores de riesgo." : "Sin Insight por ahora."}
                  icon="🧠"
                  rightBadge={null}
                  onClick={() => setView("insight")}
                />

                <CardButton
                  title="Herramientas del guardián"
                  subtitle="Reportar observación • Confirmar datos • Escalar situación (próximo: feed de reportes)."
                  icon="🛡️"
                  rightBadge={{ text: "BETA", className: "border-cyan-400/30 bg-cyan-400/15 text-cyan-100" }}
                  onClick={() => setView("guardian")}
                />

                <CardButton
                  title="Noticias + redes"
                  subtitle="Cards con imagen + bajada • “Ver más” abre noticia completa adentro."
                  icon="📰"
                  rightBadge={{ text: "BETA", className: "border-white/10 bg-white/5 text-white/80" }}
                  onClick={() => setView("news")}
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
                    <div className="text-white/45 text-sm mt-1">Lectura operativa basada en señales satelitales recientes, tendencia y estado estimado.</div>
                  </div>

                  {opsBadge ? (
                    <span className={["rounded-full border px-2 py-0.5 text-[11px]", opsBadge.className].join(" ")}>
                      {opsBadge.text}
                    </span>
                  ) : null}
                </div>

                {(() => {
                  const t = (ops.trendLabel?.toLowerCase() || "") as Trend;
                  const intensityText = intensityHuman(ops.frpMax);
                  const activityText = activityHuman(ops.detections, t, event.status as any);
                  const stateText = stateHuman(event.status as any);

                  return (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-white/60 text-xs uppercase tracking-wider">🔥 Lectura del evento</div>

                      <div className="mt-3 space-y-2 text-sm leading-relaxed">
                        <p>
                          <span className="text-white/85 font-semibold">Intensidad:</span> <span className="text-white/75">{intensityText}</span>
                        </p>
                        <p>
                          <span className="text-white/85 font-semibold">Actividad:</span> <span className="text-white/75">{activityText}</span>
                        </p>
                        <p>
                          <span className="text-white/85 font-semibold">Estado:</span> <span className="text-white/75">{stateText}</span>
                        </p>
                      </div>

                      <div className="mt-3 text-white/35 text-[11px]">Interpretación basada en detecciones VIIRS + FRP. Puede haber retrasos o falsos positivos.</div>
                    </div>
                  );
                })()}

                <div className="mt-4">
                  <div className="text-white/85 text-sm font-semibold">Indicadores operativos</div>
                  <div className="text-white/45 text-xs mt-0.5">Visual + número + explicación. Esto traduce la señal, no la “inventa”.</div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <GaugeRing
                      label="Intensidad"
                      value={ops.frpMax}
                      max={120}
                      valueFmt={(v) => (typeof v === "number" ? `${v.toFixed(2)} FRP max` : "—")}
                      hint="Radiative Power"
                      humanLine={typeof ops.frpMax === "number" ? `Lectura: ${intensityHuman(ops.frpMax)}` : "Sin FRP max disponible"}
                    />
                    <GaugeRing
                      label="Actividad"
                      value={ops.detections}
                      max={25}
                      valueFmt={(v) => (typeof v === "number" ? `${v} detections` : "—")}
                      hint="Señales VIIRS"
                      humanLine={
                        typeof ops.detections === "number"
                          ? `Lectura: ${activityHuman(ops.detections, ops.trendLabel as any, event.status as any)}`
                          : "Sin detections disponibles"
                      }
                    />
                    <GaugeRing
                      label="Energía total"
                      value={ops.frpSum}
                      max={250}
                      valueFmt={(v) => (typeof v === "number" ? `${v.toFixed(2)} FRP sum` : "—")}
                      hint="Acumulado"
                      humanLine={
                        typeof ops.frpSum === "number"
                          ? "Aprox. energía radiativa acumulada del cluster (no es “bomberos”, es del fuego)."
                          : "Sin FRP sum disponible"
                      }
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/85 text-sm font-semibold">Condiciones</div>
                  <div className="text-white/45 text-xs mt-0.5">Condiciones que pueden cambiar la dinámica del evento (no es pronóstico general).</div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Lluvia</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatPct(weatherOps?.rainProbMaxPct)}</div>
                      <div className="mt-1 text-white/35 text-[11px]">{weatherOps ? weatherOps.windowLabel : "—"}</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Viento</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatKmh(weatherOps?.windMaxKmh)}</div>
                      <div className="mt-1 text-white/35 text-[11px]">máx. estimado</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Humedad</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatPct(weatherOps?.humidityMinPct)}</div>
                      <div className="mt-1 text-white/35 text-[11px]">mín. estimado</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Temp.</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{weatherLoading ? "…" : formatC(weatherOps?.tempAvgC)}</div>
                      <div className="mt-1 text-white/35 text-[11px]">promedio</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/60 text-xs uppercase tracking-wider">🌦 Ventana operativa</div>
                    <div className="mt-2 text-white/80 text-sm leading-relaxed">
                      {weatherLoading ? "Cargando condiciones locales…" : weatherOps?.narrative ?? "Sin datos meteorológicos disponibles por ahora."}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Status</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{statusLabel(event.status)}</div>
                    <div className="mt-2 text-white/45 text-xs">
                      Última señal: <span className="text-white/70">{lastSignalAgo}</span>
                    </div>
                    <div className="mt-0.5 text-white/35 text-[11px]">Last detection: {utc}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Evacuación</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}</div>
                    <div className="mt-1 text-white/45 text-xs">Fuente: (a definir cuando conectemos datos oficiales)</div>
                  </div>
                </div>

                <div className="mt-3 text-white/35 text-xs">Nota: esto no sustituye fuentes locales. Es una lectura de señal satelital.</div>
              </div>
            </>
          ) : view === "satellite" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">🛰️ Observación satelital</div>
                <div className="text-white/45 text-sm mt-1">Fuente: VIIRS / FIRMS (por ahora). Después sumamos capas + timeline.</div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  {event.satelliteImageUrl ? (
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <img src={event.satelliteImageUrl} alt="" className="h-56 w-full object-cover opacity-90" loading="lazy" />
                    </div>
                  ) : (
                    <div className="text-white/50 text-sm">No hay imagen satelital asociada para este evento.</div>
                  )}

                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Detections</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{typeof ops.detections === "number" ? ops.detections : "—"}</div>
                      <div className="mt-1 text-white/35 text-[11px]">señales</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">FRP max</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{typeof ops.frpMax === "number" ? ops.frpMax.toFixed(2) : "—"}</div>
                      <div className="mt-1 text-white/35 text-[11px]">pico</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">FRP sum</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">{typeof ops.frpSum === "number" ? ops.frpSum.toFixed(2) : "—"}</div>
                      <div className="mt-1 text-white/35 text-[11px]">acumulado</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white/40 text-xs uppercase tracking-wider">Centro</div>
                      <div className="mt-1 text-white/85 text-sm font-medium">
                        {fmtCoord((event as any).latitude)}, {fmtCoord((event as any).longitude)}
                      </div>
                      <div className="mt-1 text-white/35 text-[11px]">estimado</div>
                    </div>
                  </div>

                  <div className="mt-3 text-white/35 text-xs">Próximo: timeline + capas (hotspots, viento, humedad, combustible).</div>
                </div>
              </div>
            </>
          ) : view === "cameras" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">📹 Cámaras públicas cercanas</div>
                <div className="text-white/45 text-sm mt-1">No prometemos LIVE salvo stream real del proveedor. Mostramos streams/snapshots según fuente.</div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-white/85 text-sm font-semibold">Registry (curado)</div>
                      <div className="text-white/45 text-xs mt-0.5">Fuente curada por BioPulse. Próximo: “Proponer cámara” + validación guardianes.</div>
                    </div>
                    <span className={["shrink-0 rounded-full border px-2 py-0.5 text-[11px]", badgeStyle("periodic")].join(" ")}>
                      {cameraCandidates.length ? `${cameraCandidates.length} cerca` : "0"}
                    </span>
                  </div>

                  <div className="mt-3">
                    {cameraCandidates.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-white/80 text-sm font-medium">No hay cámaras públicas registradas cerca</div>
                        <div className="text-white/45 text-xs mt-1">Próximo: botón para “Proponer una cámara” (guardianes) y validación.</div>
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
                                  title={cam.mediaType === "stream" ? "Stream (no necesariamente “en vivo”)" : "Actualización periódica / snapshot"}
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
                                  <div className="text-white/45 text-xs">{link.hint ?? "Sin enlace directo (se resolverá vía Worker/proxy)."}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 text-white/35 text-xs">Próximo: proxy vía Worker (CORS + cache) para no depender de enlaces externos.</div>
                </div>
              </div>
            </>
          ) : view === "environment" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">🌱 Contexto ambiental</div>
                <div className="text-white/45 text-sm mt-1">Ecosistemas afectados + especies en riesgo (cuando estén conectadas fuentes).</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-white/60 text-xs uppercase tracking-wider">Ecosistemas</div>
                    <div className="mt-2 text-white/80 text-sm">
                      {event.ecosystems?.length ? (
                        <ul className="space-y-1">
                          {event.ecosystems.map((e, i) => (
                            <li key={i}>• {e}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-white/60 text-xs uppercase tracking-wider">Especies en riesgo</div>
                    <div className="mt-2 text-white/80 text-sm">
                      {event.speciesAtRisk?.length ? (
                        <ul className="space-y-1">
                          {event.speciesAtRisk.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/60 text-xs uppercase tracking-wider">Próximo</div>
                  <div className="mt-2 text-white/80 text-sm">Conectar áreas protegidas, biomas, corredores y UICN por región.</div>
                </div>
              </div>
            </>
          ) : view === "impact" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">👥 Impacto humano</div>
                <div className="text-white/45 text-sm mt-1">Población estimada + infraestructura crítica (cuando conectemos fuentes).</div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Población</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">
                      {typeof event.affectedPopulation === "number" ? `≈ ${event.affectedPopulation.toLocaleString("es-AR")}` : "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Área</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{km2(event.affectedArea)}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Evacuación</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{event.evacuationLevel ? event.evacuationLevel.toUpperCase() : "—"}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-white/40 text-xs uppercase tracking-wider">Última señal</div>
                    <div className="mt-1 text-white/90 text-base font-semibold">{lastSignalAgo}</div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/60 text-xs uppercase tracking-wider">Próximo</div>
                  <div className="mt-2 text-white/80 text-sm">Hospitales, rutas, escuelas, refugios, puntos de encuentro, cortes y perímetros oficiales.</div>
                </div>
              </div>
            </>
          ) : view === "insight" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">🧠 Indicadores + BioPulse Insight</div>
                <div className="text-white/45 text-sm mt-1">Explicación y trazabilidad del “por qué” (sin humo).</div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/60 text-xs uppercase tracking-wider">Insight</div>
                  <div className="mt-2 text-white/85 text-sm leading-relaxed">
                    {event.aiInsight?.narrative ? event.aiInsight.narrative : "BioPulse Insight aún no está disponible para este evento."}
                  </div>

                  {typeof event.aiInsight?.confidence === "number" ? (
                    <div className="mt-3 text-white/40 text-xs">Confianza del modelo: {Math.round(event.aiInsight.confidence * 100)}%</div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/60 text-xs uppercase tracking-wider">Próximo</div>
                  <div className="mt-2 text-white/80 text-sm">Mapa de riesgo + explicaciones por factor (viento, humedad, combustible, topografía, cercanía a población).</div>
                </div>
              </div>
            </>
          ) : view === "guardian" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">🛡️ Herramientas del guardián</div>
                <div className="text-white/45 text-sm mt-1">Tu observación fortalece el sistema. (Prototipo UI, backend después).</div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/80 text-sm">Sos parte de la red. Podés reportar evidencia, confirmar datos y ayudar a priorizar.</div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button type="button" className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/15 p-4 text-left transition-colors">
                      <div className="text-cyan-100 font-semibold mb-1">📍 Reportar observación</div>
                      <div className="text-cyan-200/60 text-sm">Foto, ubicación, humo, viento, avance. (Luego: validación y reputación).</div>
                    </button>

                    <button type="button" className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/15 p-4 text-left transition-colors">
                      <div className="text-cyan-100 font-semibold mb-1">✅ Confirmar datos</div>
                      <div className="text-cyan-200/60 text-sm">¿La ubicación/estado coincide con lo que ves? Ayudanos a verificar.</div>
                    </button>
                  </div>

                  <button type="button" className="mt-3 w-full rounded-xl border border-red-400/30 bg-red-400/10 hover:bg-red-400/15 p-4 text-left transition-colors">
                    <div className="text-red-100 font-semibold mb-1">🚨 Solicitar ayuda / escalar</div>
                    <div className="text-red-200/60 text-sm">CTA a fuentes oficiales (por ahora placeholder, luego datos por región).</div>
                  </button>

                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-white/60 text-xs uppercase tracking-wider mb-2">Reportes recientes</div>
                    <div className="text-white/50 text-sm">Próximamente: feed en tiempo real de reportes guardianes + mapa.</div>
                  </div>
                </div>
              </div>
            </>
          ) : view === "news" ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-white/90 font-semibold text-lg">📰 Noticias + redes</div>
                <div className="text-white/45 text-sm mt-1">
                  Cards con imagen + bajada. <span className="text-white/60">“Ver más”</span> abre noticia completa adentro (sin abandonar BioPulse).
                </div>

                {/* Breaking interno del feed (si hay items breaking) */}
                {newsBreaking.length ? (
                  <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-400/10 p-4">
                    <div className="text-red-100 text-xs uppercase tracking-wider">BREAKING / Urgente (desde fuentes)</div>
                    <div className="mt-2 text-red-100/90 text-sm">
                      {newsBreaking[0].title}
                    </div>
                    <div className="mt-1 text-red-100/70 text-xs">
                      {newsBreaking[0].publisherName} • {timeAgoFrom(newsBreaking[0].publishedAt)}
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setNewsSelectedId(newsBreaking[0].id)}
                        className="rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 px-3 py-2 text-xs text-white/85 transition-colors"
                      >
                        Ver más
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  {newsSelected ? (
                    <NewsDetail item={newsSelected} onBack={() => setNewsSelectedId(null)} />
                  ) : (
                    <>
                      {/* 3 columnas en desktop */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-white/85 font-semibold text-sm">Gobierno</div>
                            <span className="text-white/35 text-xs">{newsGov.length}</span>
                          </div>
                          <div className="mt-3 space-y-3">
                            {newsGov.map((it) => (
                              <NewsCard key={it.id} item={it} onOpen={setNewsSelectedId} />
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-white/85 font-semibold text-sm">Bomberos</div>
                            <span className="text-white/35 text-xs">{newsFire.length}</span>
                          </div>
                          <div className="mt-3 space-y-3">
                            {newsFire.map((it) => (
                              <NewsCard key={it.id} item={it} onOpen={setNewsSelectedId} />
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-white/85 font-semibold text-sm">Medios</div>
                            <span className="text-white/35 text-xs">{newsMedia.length}</span>
                          </div>
                          <div className="mt-3 space-y-3">
                            {newsMedia.map((it) => (
                              <NewsCard key={it.id} item={it} onOpen={setNewsSelectedId} />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Social */}
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-white/85 font-semibold text-sm">Sensación en redes</div>
                          <span className="text-white/35 text-xs">menciones (placeholder): {Math.max(12, socialItems.length * 9)}</span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {socialItems.map((s) => (
                            <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <div className="text-white/80 text-sm leading-relaxed">“{s.title}”</div>
                              <div className="mt-2 text-white/35 text-xs">
                                {s.publisherName} • {timeAgoFrom(s.publishedAt)} • <span className="text-white/40">no verificado</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="text-white/60 text-xs uppercase tracking-wider">Próximo</div>
                          <div className="mt-1 text-white/70 text-sm">
                            Contador real + mapa de calor social (por región) + validación por guardianes.
                          </div>
                        </div>
                      </div>
                    </>
                  )}
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
