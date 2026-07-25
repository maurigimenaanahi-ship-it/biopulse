import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Camera,
  CloudSun,
  Eye,
  HeartPulse,
  Orbit,
  Satellite,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BioPulsePlanet, type PlanetSignal } from "./BioPulsePlanet";
import {
  completeGuardianPreparation,
  readGuardianLocalStore,
  type GuardianExposurePreference,
} from "@/app/lib/guardianStore";

const EXPOSURE_OPTIONS: Array<{
  value: GuardianExposurePreference;
  label: string;
  description: string;
}> = [
  {
    value: "ask_first",
    label: "Preguntar antes",
    description: "BioPulse pide confirmacion antes de revelar material visual sensible.",
  },
  {
    value: "data_only",
    label: "Solo datos",
    description: "Prioriza senales, fuentes y contexto sin mostrar imagenes.",
  },
  {
    value: "general_images",
    label: "Imagenes generales",
    description: "Permiti imagenes generales; lo sensible continua protegido.",
  },
  {
    value: "hide_sensitive",
    label: "Ocultar sensibles",
    description: "Mantene oculto cualquier material identificado como sensible.",
  },
];

const GUARDIAN_STEPS = [
  {
    kicker: "Planeta vivo",
    title: "Estas por observar senales reales del planeta.",
    body:
      "BioPulse reune senales, fuentes y registros para comprender Eventos Vivos: incendios, inundaciones, tormentas, contaminacion y otras crisis que afectan vidas, territorios y ecosistemas.",
    keyIdea: "Antes de mirar una catastrofe, miramos el planeta completo.",
  },
  {
    kicker: "Observar",
    title: "Lo que se observa con cuidado deja de estar solo.",
    body:
      "Cuando una catastrofe ocurre lejos de la atencion publica, puede quedar ignorada, minimizada o fragmentada. Una observacion responsable ayuda a que una senal sea vista y encuentre contexto.",
    keyIdea: "Observar no es consumir dolor. Observar es cuidar.",
  },
  {
    kicker: "Registrar",
    title: "Lo que se registra puede convertirse en memoria.",
    body:
      "Un evento no termina cuando desaparece del mapa. Registrar hora, lugar, fuente y contexto ayuda a reconstruir como empezo, como evoluciono y que podemos aprender.",
    keyIdea: "Sin memoria, repetimos el dano.",
  },
  {
    kicker: "Informar",
    title: "Una senal bien registrada puede ayudar a otros a comprender y actuar.",
    body:
      "BioPulse no promete que una observacion resuelva una emergencia por si sola. Pero informacion precisa, ubicada y con procedencia puede ser util cuando se integra con otras fuentes.",
    keyIdea: "Informar bien tambien es una forma de cuidado.",
  },
  {
    kicker: "Proteger",
    title: "No todo lo visible debe ser mostrado.",
    body:
      "Personas heridas, ninos, domicilios, victimas, pedidos de ayuda o situaciones sensibles requieren proteccion. Ninguna evidencia vale mas que la dignidad de quienes estan afectados.",
    keyIdea: "La mirada Guardian protege antes de exponer.",
  },
  {
    kicker: "Tu limite",
    title: "Tambien importa como te cuidas vos.",
    body:
      "Observar catastrofes puede ser emocionalmente dificil. Podes elegir cuanta exposicion visual queres tener y detenerte cuando lo necesites.",
    keyIdea: "Tu tarea no es sostenerlo todo. Tu tarea es observar con humanidad.",
  },
];

const VITAL_SIGNS = [
  {
    icon: Activity,
    label: "Eventos",
    metric: "VIIRS",
    unit: "2 dias",
    status: "senales termicas conectadas",
    spark: [18, 34, 22, 42, 30, 50, 38],
    position: "left-[5vw] top-[18vh]",
  },
  {
    icon: Satellite,
    label: "Satelites",
    metric: "3",
    unit: "capas",
    status: "FIRMS / GIBS disponibles",
    spark: [26, 26, 46, 34, 54, 36, 48],
    position: "right-[5vw] top-[18vh]",
  },
  {
    icon: Camera,
    label: "Camaras",
    metric: "332",
    unit: "camaras",
    status: "API + streams conectados",
    spark: [20, 24, 28, 32, 28, 40, 44],
    position: "left-[7vw] bottom-[22vh]",
  },
  {
    icon: CloudSun,
    label: "Atmosfera",
    metric: "20.9%",
    unit: "O2 ref.",
    status: "signo vital de referencia",
    spark: [36, 35, 36, 34, 36, 35, 36],
    position: "right-[7vw] bottom-[22vh]",
  },
  {
    icon: HeartPulse,
    label: "Biosfera",
    metric: "pend.",
    unit: "especies",
    status: "fuente global futura",
    spark: [48, 40, 36, 28, 32, 24, 22],
    position: "left-[26vw] top-[7vh] hidden lg:block",
  },
  {
    icon: Orbit,
    label: "Ozono",
    metric: "DU",
    unit: "a conectar",
    status: "capa planetaria futura",
    spark: [30, 38, 34, 45, 40, 42, 37],
    position: "right-[27vw] top-[7vh] hidden lg:block",
  },
];

function BioPulseMark({ compact = false }: { compact?: boolean }) {
  return (
    <motion.div
      className="pointer-events-none inline-flex items-center gap-3"
      animate={{
        filter: [
          "drop-shadow(0 0 0 rgba(34,211,238,0))",
          "drop-shadow(0 0 18px rgba(34,211,238,0.28))",
          "drop-shadow(0 0 0 rgba(34,211,238,0))",
        ],
      }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <span className="relative flex items-center justify-center">
        <Activity className={compact ? "h-6 w-6 text-cyan-400" : "h-8 w-8 text-cyan-400 md:h-9 md:w-9"} />
        <span className="absolute inset-0 rounded-full bg-cyan-400/45 blur-xl" />
      </span>
      <span>
        <span
          className={
            compact
              ? "block text-lg font-semibold tracking-tight text-white/86"
              : "block text-3xl font-semibold tracking-tight text-white/92 md:text-4xl"
          }
        >
          BioPulse
        </span>
        {!compact ? (
          <span className="mt-1 hidden text-xs tracking-wider text-white/40 md:block">
            Planetary Monitoring System
          </span>
        ) : null}
      </span>
    </motion.div>
  );
}

function VitalSparkline({ values }: { values: number[] }) {
  return (
    <div className="flex h-6 items-end gap-1">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="w-1 rounded-full bg-cyan-200/45"
          style={{ height: `${Math.max(8, Math.min(24, value))}px` }}
        />
      ))}
    </div>
  );
}

function VitalSign(props: (typeof VITAL_SIGNS)[number]) {
  const Icon = props.icon;
  return (
    <div className={`pointer-events-none absolute ${props.position} w-[155px] text-white/78`}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/[0.06] text-cyan-100/82 shadow-[0_0_28px_rgba(34,211,238,0.08)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/38">{props.label}</div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold leading-none text-white/88">{props.metric}</span>
            <span className="text-[10px] text-white/42">{props.unit}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <VitalSparkline values={props.spark} />
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.85)]" />
      </div>
      <div className="mt-1 text-[10px] leading-tight text-white/38">{props.status}</div>
    </div>
  );
}

function PlanetVitalsHud() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {VITAL_SIGNS.map((item) => (
        <VitalSign key={item.label} {...item} />
      ))}
    </div>
  );
}

export function PlanetGatewayBackground({
  className = "",
  signals = [],
}: {
  className?: string;
  signals?: PlanetSignal[];
}) {
  return <BioPulsePlanet className={className} signals={signals} />;
}

export function PlanetGuardianGateway({ onComplete }: { onComplete: () => void }) {
  const [thresholdStarted, setThresholdStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [exposure, setExposure] = useState<GuardianExposurePreference>(() => {
    try {
      return readGuardianLocalStore().preferences.exposure;
    } catch {
      return "ask_first";
    }
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = GUARDIAN_STEPS[stepIndex];
  const isFinalStep = stepIndex === GUARDIAN_STEPS.length - 1;

  const continueToSetup = () => {
    try {
      completeGuardianPreparation(exposure);
      setError(null);
      onComplete();
    } catch {
      setError("No se pudo guardar la preparacion Guardian en este dispositivo.");
    }
  };

  const goNext = () => {
    if (!isFinalStep) {
      setStepIndex((current) => Math.min(current + 1, GUARDIAN_STEPS.length - 1));
      return;
    }
    continueToSetup();
  };

  return (
    <div className="absolute inset-0 z-[70] overflow-hidden bg-[#020712]">
      <BioPulsePlanet />
      <PlanetVitalsHud />

      <div className="pointer-events-none absolute left-1/2 top-8 z-10 -translate-x-1/2">
        <BioPulseMark compact={thresholdStarted} />
      </div>

      <AnimatePresence mode="wait">
        {!thresholdStarted ? (
          <motion.div
            key="contemplation"
            className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center px-4 pb-10 md:pb-12"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 max-w-md text-xs leading-relaxed text-white/42">
                Respira. Observa el planeta antes de entrar a observar sus eventos.
              </div>
              <motion.button
                type="button"
                onClick={() => setThresholdStarted(true)}
                className="pointer-events-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-cyan-100/16 bg-cyan-100/[0.055] px-5 text-sm font-semibold text-cyan-50/82 shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-md transition-colors hover:bg-cyan-100/[0.09]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.6 }}
              >
                <ShieldCheck className="h-4 w-4 text-emerald-100/75" />
                Iniciar preparacion Guardian
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="threshold"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4 py-8"
            initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <main className="pointer-events-auto w-full max-w-[500px] rounded-[26px] border border-emerald-100/10 bg-[#03111a]/32 p-4 shadow-[0_0_70px_rgba(16,185,129,0.07)] backdrop-blur-[10px] md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/14 bg-emerald-300/[0.055] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-50/68">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Umbral Guardian
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/32">
                  {String(stepIndex + 1).padStart(2, "0")} / {String(GUARDIAN_STEPS.length).padStart(2, "0")}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={stepIndex}
                  className="mt-4"
                  initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                  transition={{ duration: 0.42, ease: "easeOut" }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/50">
                    {step.kicker}
                  </div>
                  <h1 className="mt-2 text-lg font-semibold leading-tight text-white/92 md:text-xl">{step.title}</h1>
                  <p className="mt-3 text-sm leading-relaxed text-white/62">{step.body}</p>
                  <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2.5 text-xs leading-relaxed text-white/54">
                    <span className="font-semibold text-emerald-100/74">Idea clave: </span>
                    {step.keyIdea}
                  </div>

                  {isFinalStep ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">
                          Exposicion visual
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {EXPOSURE_OPTIONS.map((option) => {
                            const selected = exposure === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setExposure(option.value)}
                                aria-pressed={selected}
                                className={`min-h-[70px] rounded-2xl border px-3 py-3 text-left transition-colors ${
                                  selected
                                    ? "border-emerald-200/30 bg-emerald-300/10 text-white/86"
                                    : "border-white/10 bg-black/14 text-white/60 hover:bg-white/[0.05]"
                                }`}
                              >
                                <span className="block text-sm font-semibold">{option.label}</span>
                                <span className="mt-1 block text-[11px] leading-relaxed text-white/42">
                                  {option.description}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/18 p-3">
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          onChange={(event) => setAcknowledged(event.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-emerald-400"
                        />
                        <span className="text-xs leading-relaxed text-white/58">
                          Acepto observar con cuidado, separar evidencia de interpretacion, respetar la dignidad de las personas afectadas y usar BioPulse para cuidar, registrar e informar responsablemente.
                        </span>
                      </label>
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>

              {error ? <div className="mt-3 text-xs text-red-100/75">{error}</div> : null}

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
                  disabled={stepIndex === 0}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.028] px-4 text-xs font-semibold text-white/52 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Atras
                </button>

                <button
                  type="button"
                  disabled={isFinalStep && !acknowledged}
                  onClick={goNext}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 text-sm font-semibold text-emerald-50 transition-colors hover:bg-emerald-300/16 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isFinalStep ? (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Elegir region
                    </>
                  ) : (
                    <>
                      Siguiente
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/14 px-3 py-1.5 text-[10px] text-white/35 backdrop-blur-md">
        <Eye className="h-3.5 w-3.5 text-emerald-100/52" />
        Preparacion para observar con humanidad
      </div>
    </div>
  );
}
