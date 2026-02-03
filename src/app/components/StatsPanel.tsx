import { useMemo, useState } from "react";
import { Activity, AlertTriangle, MapPin } from "lucide-react";

type Props = {
  totalEvents: number;
  criticalEvents: number;
  affectedRegions: number;
  collapsed?: boolean; // ✅ nuevo
};

export function StatsPanel({ totalEvents, criticalEvents, affectedRegions, collapsed = false }: Props) {
  // si el usuario toca un pictograma, puede “expandir” momentáneamente aun estando colapsado
  const [manualOpen, setManualOpen] = useState<null | "total" | "critical" | "regions">(null);

  const isCollapsed = collapsed && manualOpen === null;

  const items = useMemo(
    () => [
      {
        key: "total" as const,
        title: "ACTIVE EVENTS",
        value: totalEvents,
        icon: Activity,
        color: "text-cyan-300",
      },
      {
        key: "critical" as const,
        title: "CRITICAL ALERTS",
        value: criticalEvents,
        icon: AlertTriangle,
        color: "text-rose-400",
      },
      {
        key: "regions" as const,
        title: "AFFECTED REGIONS",
        value: affectedRegions,
        icon: MapPin,
        color: "text-amber-300",
      },
    ],
    [totalEvents, criticalEvents, affectedRegions]
  );

  const Card = (p: {
    title: string;
    value: number;
    icon: any;
    color: string;
    onClick?: () => void;
  }) => {
    const Icon = p.icon;
    return (
      <div
        onClick={p.onClick}
        className={[
          "rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md",
          "shadow-xl",
          "px-5 py-4",
          p.onClick ? "cursor-pointer hover:bg-black/45 transition-colors" : "",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-white/45 text-[11px] tracking-wider">{p.title}</div>
            <div className={["mt-2 text-4xl font-semibold", p.color].join(" ")}>{p.value}</div>
          </div>
          <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
            <Icon className={["h-5 w-5", p.color].join(" ")} />
          </div>
        </div>
      </div>
    );
  };

  const Pict = (p: { key: "total" | "critical" | "regions"; value: number; icon: any; color: string }) => {
    const Icon = p.icon;
    return (
      <button
        onClick={() => setManualOpen(p.key)}
        className={[
          "w-[54px] rounded-2xl border border-white/10",
          "bg-black/40 backdrop-blur-md shadow-lg",
          "px-2 py-3",
          "hover:bg-black/55 transition-colors",
          "flex flex-col items-center justify-center gap-1",
        ].join(" ")}
        aria-label={`Open ${p.key} panel`}
        title="Ver detalle"
      >
        <Icon className={["h-5 w-5", p.color].join(" ")} />
        <div className={["text-sm font-semibold leading-none", p.color].join(" ")}>{p.value}</div>
      </button>
    );
  };

  return (
    <div className="fixed right-4 md:right-6 z-[9998] top-[calc(env(safe-area-inset-top)+72px)] md:top-24 pointer-events-auto">
      {/* estado online */}
      <div className="mb-3 flex justify-end">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/35 border border-white/10 backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/70">System Online</span>
        </div>
      </div>

      {/* ✅ Colapsado: pictogramas */}
      {isCollapsed ? (
        <div className="flex flex-col gap-3 items-end">
          {items.map((it) => (
            <Pict key={it.key} key={it.key} value={it.value} icon={it.icon} color={it.color} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 w-[280px]">
          {/* si abrimos manual en modo colapsado, mostramos solo esa tarjeta + botón de cerrar */}
          {manualOpen ? (
            <>
              <Card
                title={items.find((x) => x.key === manualOpen)!.title}
                value={items.find((x) => x.key === manualOpen)!.value}
                icon={items.find((x) => x.key === manualOpen)!.icon}
                color={items.find((x) => x.key === manualOpen)!.color}
              />
              <button
                onClick={() => setManualOpen(null)}
                className="ml-auto px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 transition-colors"
              >
                Ocultar
              </button>
            </>
          ) : (
            <>
              {items.map((it) => (
                <Card
                  key={it.key}
                  title={it.title}
                  value={it.value}
                  icon={it.icon}
                  color={it.color}
                  onClick={collapsed ? () => setManualOpen(it.key) : undefined}
                />
              ))}
              <div className="rounded-full border border-white/10 bg-black/35 backdrop-blur-md px-4 py-2 text-xs text-white/65 w-fit">
                <span className="text-green-400">●</span> Live data • Updates every 30s
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
