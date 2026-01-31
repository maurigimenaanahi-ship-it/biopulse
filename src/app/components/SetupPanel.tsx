import type { EventCategory } from "@/data/events";

type Region = {
  key: string;
  label: string;
  bbox: string; // "west,south,east,north"
};

type RegionGroup = {
  key: string;
  label: string;
  regions: Region[];
};

const CATEGORY_OPTIONS: { key: EventCategory; label: string; subtitle: string }[] = [
  { key: "fire", label: "Incendios en vivo", subtitle: "Detecciones satelitales (FIRMS/VIIRS)" },
  { key: "flood", label: "Inundaciones en vivo", subtitle: "Eventos hidrológicos y riesgo (MVP luego)" },
  { key: "storm", label: "Tormentas en vivo", subtitle: "Tormentas severas y trayectorias (MVP luego)" },
  { key: "heatwave", label: "Olas de calor", subtitle: "Anomalías térmicas regionales (MVP luego)" },
  { key: "air-pollution", label: "Contaminación del aire", subtitle: "AQI y plumas (MVP luego)" },
  { key: "ocean-anomaly", label: "Anomalías oceánicas", subtitle: "Temperatura superficial y corrientes (MVP luego)" },
];

// MVP: arrancamos con América (como recomendación)
// Después sumamos continentes sin tocar UI: solo agregás grupos/regions.
export const REGION_GROUPS: RegionGroup[] = [
  {
    key: "america",
    label: "América",
    regions: [
      { key: "north-america", label: "América del Norte", bbox: "-168,5,-52,83" },
      { key: "central-america", label: "América Central", bbox: "-118,5,-60,33" },
      { key: "south-america", label: "América del Sur", bbox: "-82,-56,-34,13" }, // ✅ la que venimos usando
    ],
  },
];

export function SetupPanel(props: {
  category: EventCategory | null;
  regionKey: string | null;
  onChangeCategory: (c: EventCategory) => void;
  onChangeRegion: (regionKey: string) => void;
  onStart: (args: { category: EventCategory; region: Region }) => void;
}) {
  const selectedRegion =
    REGION_GROUPS.flatMap((g) => g.regions).find((r) => r.key === props.regionKey) ?? null;

  const canStart = props.category && selectedRegion;

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1a] shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-cyan-300/80 via-cyan-300/10 to-transparent" />

        <div className="p-8 overflow-y-auto max-h-[85vh]">
          <div className="mb-6">
            <div className="text-white text-2xl font-semibold">Configurar escaneo</div>
            <div className="text-white/55 mt-1">
              Elegí una categoría y una región para mantener el sistema liviano y enfocado.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Category */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="text-white/40 text-xs uppercase tracking-wider mb-4">
                ¿Qué querés observar?
              </div>

              <div className="space-y-3">
                {CATEGORY_OPTIONS.map((opt) => {
                  const active = props.category === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => props.onChangeCategory(opt.key)}
                      className="w-full text-left p-4 rounded-xl border transition"
                      style={{
                        borderColor: active ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.10)",
                        backgroundColor: active ? "rgba(34,211,238,0.10)" : "rgba(0,0,0,0.18)",
                      }}
                    >
                      <div className="text-white/85 font-medium">{opt.label}</div>
                      <div className="text-white/45 text-sm mt-1">{opt.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Region */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="text-white/40 text-xs uppercase tracking-wider mb-4">
                ¿Dónde querés observar?
              </div>

              {REGION_GROUPS.map((group) => (
                <div key={group.key} className="mb-5">
                  <div className="text-white/70 font-medium mb-3">{group.label}</div>
                  <div className="grid grid-cols-1 gap-3">
                    {group.regions.map((r) => {
                      const active = props.regionKey === r.key;
                      return (
                        <button
                          key={r.key}
                          onClick={() => props.onChangeRegion(r.key)}
                          className="w-full text-left p-4 rounded-xl border transition"
                          style={{
                            borderColor: active ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.10)",
                            backgroundColor: active ? "rgba(34,211,238,0.10)" : "rgba(0,0,0,0.18)",
                          }}
                        >
                          <div className="text-white/85 font-medium">{r.label}</div>
                          <div className="text-white/45 text-sm mt-1">bbox: {r.bbox}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 mt-8 pt-6 border-t border-white/10 bg-[#0a0f1a]">
            <div className="flex items-center justify-between gap-4">
              <div className="text-white/45 text-sm">
                {canStart
                  ? "Configuración lista. Iniciá el escaneo para cargar eventos en la región seleccionada."
                  : "Seleccioná una categoría y una región para iniciar."}
              </div>

              <button
                disabled={!canStart}
                onClick={() => {
                  if (!props.category || !selectedRegion) return;
                  props.onStart({ category: props.category, region: selectedRegion });
                }}
                className="px-8 py-4 rounded-xl text-lg font-medium transition"
                style={{
                  border: "1px solid",
                  borderColor: canStart ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.12)",
                  background: canStart
                    ? "linear-gradient(135deg, rgba(34,211,238,0.25), rgba(34,211,238,0.06))"
                    : "rgba(255,255,255,0.04)",
                  color: canStart ? "#e0fbff" : "rgba(255,255,255,0.35)",
                  boxShadow: canStart ? "0 0 30px rgba(34,211,238,0.25)" : "none",
                  cursor: canStart ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                }}
              >
                Iniciar escaneo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}