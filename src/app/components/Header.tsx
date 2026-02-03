import { Activity } from "lucide-react";
import { motion } from "motion/react";

interface HeaderProps {
  activeView: string;
  onViewChange: (view: string) => void;

  // ✅ NUEVO: cuando hay modal abierto, el header queda atrás/atenuado
  overlayActive?: boolean;
}

export function Header({ activeView, onViewChange, overlayActive = false }: HeaderProps) {
  const navItems = [
    { id: "home", label: "Live Planet" },
    { id: "events", label: "Events" },
    { id: "timeline", label: "Timeline" },
    { id: "alerts", label: "Alerts" },
    { id: "data-layers", label: "Data Layers" },
    { id: "learn", label: "Learn" },
    { id: "dashboard", label: "Dashboard" },
  ];

  return (
    <header
      className={[
        "absolute top-0 left-0 right-0",
        // ✅ normal: arriba de la UI, pero por debajo de modals (que usan z-50)
        "z-20",
        // ✅ si hay overlay (AlertPanel), baja de prioridad + se vuelve no-interactivo
        overlayActive ? "z-[5] pointer-events-none" : "pointer-events-auto",
      ].join(" ")}
    >
      <div
        className={[
          "flex items-center justify-between",
          "px-4 py-3 md:px-8 md:py-6",
          "transition-all duration-300 ease-out",
          overlayActive ? "opacity-30 blur-[1px]" : "opacity-100 blur-0",
        ].join(" ")}
      >
        {/* Logo */}
        <motion.div
          className="flex items-center gap-3 min-w-0"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="relative shrink-0">
            <Activity className="w-7 h-7 md:w-8 md:h-8 text-cyan-400" />
            <div className="absolute inset-0 blur-xl bg-cyan-400 opacity-50" />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl text-white tracking-tight truncate">
              BioPulse
            </h1>
            <p className="text-[10px] md:text-xs text-white/40 tracking-wider truncate">
              Planetary Monitoring System
            </p>
          </div>
        </motion.div>

        {/* Navigation (mobile-safe horizontal scroll) */}
        <nav className="flex-1 mx-3 md:mx-6">
          <div
            className={[
              "flex items-center gap-1",
              "overflow-x-auto whitespace-nowrap",
              "no-scrollbar",
            ].join(" ")}
          >
            {navItems.map((item, index) => (
              <motion.button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={[
                  "relative px-3 md:px-4 py-2",
                  "text-sm text-white/70 hover:text-white transition-colors",
                  "shrink-0",
                ].join(" ")}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                {item.label}
                {activeView === item.id && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                    layoutId="activeTab"
                    style={{ boxShadow: "0 0 10px #00d4ff" }}
                  />
                )}
              </motion.button>
            ))}
          </div>
        </nav>

        {/* Status indicator */}
        <motion.div
          className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-black/30 border border-white/10 backdrop-blur-sm shrink-0"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/70">System Online</span>
        </motion.div>
      </div>

      {/* ✅ helper: estilo para ocultar scrollbar en la barra de tabs */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </header>
  );
}
