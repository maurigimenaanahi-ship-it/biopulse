import {
  X,
  MapPin,
  AlertTriangle,
  ThermometerSun,
  Wind,
  Droplets,
  Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { EnvironmentalEvent, categoryColors, categoryLabels } from "@/data/events";
import { format } from "date-fns";
import { SatelliteMiniMap } from "@/app/components/SatelliteMiniMap";

interface AlertPanelProps {
  event: EnvironmentalEvent | null;
  onClose: () => void;
}

export function AlertPanel({ event, onClose }: AlertPanelProps) {
  const severityConfig = {
    low: { label: "Low", color: "#00ff88" },
    moderate: { label: "Moderate", color: "#ffaa00" },
    high: { label: "High", color: "#ff6600" },
    critical: { label: "Critical", color: "#ff0044" },
  };

  return (
    <AnimatePresence>
      {event && (
        <AlertPanelInner
          key={String(event.id)}
          event={event}
          onClose={onClose}
          severityConfig={severityConfig}
        />
      )}
    </AnimatePresence>
  );
}

function AlertPanelInner({
  event,
  onClose,
  severityConfig,
}: {
  event: EnvironmentalEvent;
  onClose: () => void;
  severityConfig: Record<
    EnvironmentalEvent["severity"],
    { label: string; color: string }
  >;
}) {
  const color = categoryColors[event.category];
  const severityInfo = severityConfig[event.severity];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // 🔥 clave: estar por arriba del Header y cualquier overlay
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-auto"
      // ✅ usar mouseDown es más confiable que click
      onMouseDown={() => onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-0" />

      {/* Panel */}
      <motion.div
        initial={{ scale: 0.96, y: 18, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 18, opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        // ✅ evita cerrar si clickeas dentro del panel
        onMouseDown={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border bg-[#0a0f1a] shadow-2xl"
        style={{
          borderColor: `${color}40`,
          boxShadow: `0 0 60px ${color}30`,
        }}
      >
        {/* Header accent */}
        <div
          className="relative h-2"
          style={{
            background: `linear-gradient(90deg, ${color}, ${color}00)`,
          }}
        />

        {/* Close button */}
        <button
          // ✅ mouseDown + stopPropagation = cierre garantizado
          onMouseDown={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-6 right-6 z-20 p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          aria-label="Cerrar"
          title="Cerrar"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-0.5rem)]">
          <div className="p-8">
            {/* Title Section */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{
                    backgroundColor: color,
                    boxShadow: `0 0 20px ${color}`,
                  }}
                />
                <span className="text-xs uppercase tracking-wider" style={{ color }}>
                  {categoryLabels[event.category]}
                </span>
                <span className="text-white/30">•</span>
                <span className="text-white/40 text-xs">
                  {format(event.timestamp, "MMM d, yyyy • HH:mm")} UTC
                </span>
              </div>

              <h2 className="text-3xl text-white mb-2">{event.title}</h2>

              <div className="flex items-center gap-2 text-white/60">
                <MapPin className="w-4 h-4" />
                <span>{event.location}</span>
                <span className="text-white/30 mx-2">•</span>
                <span className="text-xs">
                  {event.latitude.toFixed(4)}°, {event.longitude.toFixed(4)}°
                </span>
              </div>
            </div>

            {/* Severity Badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-6 border"
              style={{
                backgroundColor: `${severityInfo.color}15`,
                borderColor: `${severityInfo.color}40`,
              }}
            >
              <AlertTriangle className="w-4 h-4" style={{ color: severityInfo.color }} />
              <span className="text-sm" style={{ color: severityInfo.color }}>
                {severityInfo.label} Severity
              </span>
            </div>

            {/* Description */}
            <p className="text-white/70 text-lg mb-8 leading-relaxed">
              {event.description}
            </p>

            {/* Grid Layout */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Left Column - Metrics */}
              <div className="space-y-4">
                <div className="text-white/40 text-xs uppercase tracking-wider mb-3">
                  Environmental Data
                </div>

                {event.temperature !== undefined && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <ThermometerSun className="w-5 h-5 text-orange-400" />
                      <span className="text-white/70">Temperature</span>
                    </div>
                    <span className="text-white text-xl">{event.temperature}°C</span>
                  </div>
                )}

                {event.windSpeed !== undefined && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <Wind className="w-5 h-5 text-cyan-400" />
                      <span className="text-white/70">Wind Speed</span>
                    </div>
                    <span className="text-white text-xl">{event.windSpeed} km/h</span>
                  </div>
                )}

                {event.humidity !== undefined && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <Droplets className="w-5 h-5 text-blue-400" />
                      <span className="text-white/70">Humidity</span>
                    </div>
                    <span className="text-white text-xl">{event.humidity}%</span>
                  </div>
                )}

                {event.waterLevel !== undefined && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <Droplets className="w-5 h-5 text-blue-400" />
                      <span className="text-white/70">Water Level</span>
                    </div>
                    <span className="text-white text-xl">{event.waterLevel}m</span>
                  </div>
                )}

                {event.airQualityIndex !== undefined && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5 text-green-400" />
                      <span className="text-white/70">Air Quality Index</span>
                    </div>
                    <span className="text-white text-xl">{event.airQualityIndex}</span>
                  </div>
                )}
              </div>

              {/* Right Column - Impact */}
              <div className="space-y-4">
                <div className="text-white/40 text-xs uppercase tracking-wider mb-3">
                  Impact Assessment
                </div>

                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-white/50 text-xs uppercase tracking-wider mb-2">
                    Affected Area
                  </div>
                  <div className="text-white text-2xl">
                    {event.affectedArea.toLocaleString()} km²
                  </div>
                </div>

                {event.affectedPopulation && (
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-2">
                      Population at Risk
                    </div>
                    <div className="text-white text-2xl">
                      {event.affectedPopulation.toLocaleString()}
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-white/50 text-xs uppercase tracking-wider mb-2">
                    Event Status
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white">Active & Developing</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Satellite Imagery */}
            <div className="mb-8">
              <div className="text-white/40 text-xs uppercase tracking-wider mb-3">
                Satellite Imagery
              </div>

              <div className="relative rounded-lg overflow-hidden border border-white/10">
                <SatelliteMiniMap
                  lat={event.latitude}
                  lon={event.longitude}
                  date={event.timestamp}
                  zoom={8}
                  height={260}
                />

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="pointer-events-none absolute bottom-4 left-4 text-white/60 text-xs">
                  NASA GIBS satellite tiles • {format(event.timestamp, "HH:mm")} UTC
                </div>
              </div>

              {event.satelliteImageUrl && (
                <div className="mt-3 text-white/40 text-xs">
                  Additional image source available
                </div>
              )}
            </div>

            {/* Risk Indicators */}
            <div>
              <div className="text-white/40 text-xs uppercase tracking-wider mb-3">
                Risk Indicators
              </div>
              <div className="grid grid-cols-2 gap-3">
                {event.riskIndicators.map((risk, index) => (
                  <div
                    key={index}
                    className="px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm flex items-center gap-2"
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {risk}
                  </div>
                ))}
              </div>
            </div>

            {/* Live Feed */}
            {event.liveFeedUrl && (
              <div className="mt-8 p-6 rounded-lg border border-white/10 bg-white/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white">Live Feed Available</span>
                </div>
                <p className="text-white/60 text-sm">{event.liveFeedUrl}</p>
              </div>
            )}

            {/* AI Summary */}
            <div
              className="mt-8 p-6 rounded-lg border"
              style={{
                backgroundColor: `${color}08`,
                borderColor: `${color}20`,
              }}
            >
              <div className="text-white/40 text-xs uppercase tracking-wider mb-3">
                AI-Generated Summary
              </div>
              <p className="text-white/80 leading-relaxed">
                This {categoryLabels[event.category].toLowerCase()} event is showing{" "}
                {event.severity} severity levels with significant environmental impact.
                The affected region spans approximately{" "}
                {event.affectedArea.toLocaleString()} square kilometers
                {event.affectedPopulation &&
                  ` with ${event.affectedPopulation.toLocaleString()} people at risk`}
                . Continuous monitoring is in effect, and real-time data is being
                collected from multiple sensors and satellite systems.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
