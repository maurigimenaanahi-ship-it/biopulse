import { motion, AnimatePresence } from "motion/react";

type SplashScreenProps = {
  open: boolean;
  onStart: () => void;
};

export function SplashScreen({ open, onStart }: SplashScreenProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] bg-[#050a14] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-radial from-cyan-950/25 via-transparent to-transparent opacity-40" />
          <div className="absolute -top-24 left-1/3 w-[42rem] h-[42rem] bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 right-1/4 w-[36rem] h-[36rem] bg-purple-500/10 rounded-full blur-3xl" />

          <div className="relative h-full w-full flex items-center justify-center p-6">
            <motion.div
              className="w-full max-w-xl text-center"
              initial={{ y: 12, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 12, scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Animated "logo" */}
              <motion.div
                className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4"
                animate={{
                  boxShadow: [
                    "0 0 0px rgba(0,212,255,0)",
                    "0 0 40px rgba(0,212,255,0.25)",
                    "0 0 0px rgba(0,212,255,0)",
                  ],
                }}
                transition={{ duration: 2.2, repeat: Infinity }}
              >
                <motion.div
                  className="w-3 h-3 rounded-full bg-cyan-300"
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
                <div className="text-4xl font-semibold tracking-tight text-white">
                  BioPulse
                </div>
              </motion.div>

              <div className="mt-4 text-white/60">
                Planetary monitoring system • live signals • real-time analysis
              </div>

              <div className="mt-3 text-xs text-white/35">
                Synchronizing satellite layers • calibrating sensors • mapping events…
              </div>

              <motion.button
                onClick={onStart}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-10 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-6 py-4 text-cyan-200 hover:bg-cyan-300/15 transition"
              >
                Iniciar análisis
              </motion.button>

              <div className="mt-4 text-xs text-white/35">
                Entrás al modo planeta para explorar eventos activos por categoría.
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
