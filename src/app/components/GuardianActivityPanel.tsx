import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Fingerprint, MapPin, SearchCheck, ShieldCheck, X } from "lucide-react";
import { GuardianBackupControls } from "@/app/components/GuardianBackupControls";
import type { EnvironmentalEvent } from "@/data/events";
import {
  readGuardianLocalStore,
  guardianSnapshotDistanceKm,
  type GuardianEventSnapshot,
  type GuardianLocalStore,
  type GuardianMission,
  type GuardianObservation,
} from "@/app/lib/guardianStore";

function eventFromSnapshot(snapshot: GuardianEventSnapshot): EnvironmentalEvent {
  return {
    id: snapshot.id,
    category: snapshot.category,
    title: snapshot.title,
    location: snapshot.location,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    severity: snapshot.severity,
    description: snapshot.description,
    timestamp: new Date(snapshot.timestamp),
    lastSeen: snapshot.lastSeen ? new Date(snapshot.lastSeen) : undefined,
    liveFeedUrl: snapshot.liveFeedUrl ?? undefined,
    status: snapshot.status ?? undefined,
    trend: snapshot.trend ?? undefined,
    evacuationLevel: snapshot.evacuationLevel ?? undefined,
    focusCount: snapshot.focusCount ?? undefined,
    frpMax: snapshot.frpMax ?? undefined,
    frpSum: snapshot.frpSum ?? undefined,
    stale: true,
    affectedArea: 0,
    riskIndicators: ["Memoria Guardian local; no presente en el escaneo actual"],
  };
}

function localDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GuardianActivityPanel({
  open,
  events,
  onClose,
  onSelect,
}: {
  open: boolean;
  events: EnvironmentalEvent[];
  onClose: () => void;
  onSelect: (event: EnvironmentalEvent) => void;
}) {
  const [store, setStore] = useState<GuardianLocalStore>(() => readGuardianLocalStore());

  useEffect(() => {
    if (!open) return;
    setStore(readGuardianLocalStore());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  const rows = useMemo(() => {
    return Object.values(store.events)
      .map((memory) => {
        const liveEvent = memory.snapshot
          ? events
              .filter((event) => event.category === memory.snapshot!.category)
              .map((event) => ({ event, distanceKm: guardianSnapshotDistanceKm(memory.snapshot!, event) }))
              .filter((candidate) => candidate.distanceKm <= 30)
              .sort((a, b) => a.distanceKm - b.distanceKm)[0]?.event ?? null
          : null;
        const event = liveEvent ?? (memory.snapshot ? eventFromSnapshot(memory.snapshot) : null);
        const missions = memory.missionIds
          .map((id) => store.missions[id])
          .filter((mission): mission is GuardianMission => Boolean(mission));
        const observations = memory.observationIds
          .map((id) => store.observations[id])
          .filter((observation): observation is GuardianObservation => Boolean(observation));
        return {
          memory,
          event,
          isLive: Boolean(liveEvent),
          missionCount: missions.length,
          activeMissionCount: missions.filter((mission) => mission.status === "active").length,
          closedMissionCount: missions.filter((mission) => mission.status !== "active").length,
          observationCount: observations.length,
          reviewedObservationCount: observations.filter((observation) => observation.reviewStatus !== "unreviewed").length,
          integrityCount: observations.filter((observation) => Boolean(observation.integrity)).length,
          sensitiveCount: observations.filter((observation) => observation.sensitivity === "sensitive").length,
          sourceReferenceCount: observations.filter((observation) => Boolean(observation.sourceReference)).length,
          latestObservationAt:
            observations
              .map((observation) => observation.recordedAt)
              .filter((value) => Number.isFinite(new Date(value).getTime()))
              .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null,
        };
      })
      .sort((a, b) => new Date(b.memory.lastOpenedAt).getTime() - new Date(a.memory.lastOpenedAt).getTime());
  }, [events, store]);

  if (!open) return null;

  const totalObservations = rows.reduce((sum, row) => sum + row.observationCount, 0);
  const totalMissions = rows.reduce((sum, row) => sum + row.missionCount, 0);
  const activeMissions = rows.reduce((sum, row) => sum + row.activeMissionCount, 0);
  const reviewedObservations = rows.reduce((sum, row) => sum + row.reviewedObservationCount, 0);
  const integrityObservations = rows.reduce((sum, row) => sum + row.integrityCount, 0);
  const liveRows = rows.filter((row) => row.isLive).length;

  return (
    <div className="fixed inset-0 z-[99998] pointer-events-auto">
      <button
        type="button"
        aria-label="Cerrar Mi actividad Guardian"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Mi actividad Guardian"
        className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+72px)] flex max-h-[78vh] w-[calc(100%-24px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#09111b]/95 shadow-2xl backdrop-blur-md md:top-20 md:w-[760px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 md:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-lg font-semibold text-white md:text-xl">
              <ShieldCheck className="h-5 w-5 text-emerald-200/80" />
              Mi actividad Guardian
            </div>
            <div className="mt-1 text-xs text-white/40">Memoria privada conservada en este dispositivo</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-px border-b border-white/10 bg-white/10 text-center md:grid-cols-6">
          <div className="bg-[#09111b] px-3 py-3">
            <div className="text-lg font-semibold text-white/80">{rows.length}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/35">Eventos</div>
          </div>
          <div className="bg-[#09111b] px-3 py-3">
            <div className="text-lg font-semibold text-white/80">{totalMissions}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/35">Misiones</div>
          </div>
          <div className="bg-[#09111b] px-3 py-3">
            <div className="text-lg font-semibold text-white/80">{totalObservations}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/35">Observaciones</div>
          </div>
          <div className="bg-[#09111b] px-3 py-3">
            <div className="text-lg font-semibold text-white/80">{activeMissions}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/35">Activas</div>
          </div>
          <div className="bg-[#09111b] px-3 py-3">
            <div className="text-lg font-semibold text-white/80">{reviewedObservations}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/35">Revisadas</div>
          </div>
          <div className="bg-[#09111b] px-3 py-3">
            <div className="text-lg font-semibold text-white/80">{integrityObservations}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/35">Huellas</div>
          </div>
        </div>

        <div className="overflow-y-auto p-4 md:p-6">
          {rows.length === 0 ? (
            <div className="border-l-2 border-emerald-300/20 py-2 pl-4">
              <div className="text-sm font-medium text-white/70">Todavía no preparaste ningún espacio Guardian.</div>
              <div className="mt-1 text-xs leading-relaxed text-white/40">
                Abrí un evento y prepará su espacio privado para comenzar a construir memoria local.
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
                  <ShieldCheck className="h-4 w-4 text-emerald-200/75" />
                  Tablero local
                </div>
                <div className="mt-2 grid gap-2 text-[11px] leading-relaxed text-white/40 sm:grid-cols-2">
                  <div>{liveRows} evento{liveRows === 1 ? "" : "s"} vinculado{liveRows === 1 ? "" : "s"} al escaneo actual.</div>
                  <div>{reviewedObservations} {reviewedObservations === 1 ? "observación" : "observaciones"} con revisión de procedencia.</div>
                  <div>{integrityObservations} {integrityObservations === 1 ? "observación" : "observaciones"} con huella local.</div>
                  <div>La memoria sigue siendo privada y local en este dispositivo.</div>
                </div>
              </div>

              <div className="divide-y divide-white/10 border-y border-white/10">
              {rows.map((row) => (
                <div key={row.memory.eventId} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-300/15 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/70">
                          {row.isLive ? "En escaneo" : "Memoria local"}
                        </span>
                        {row.activeMissionCount > 0 ? (
                          <span className="text-[10px] font-medium text-cyan-100/65">Misión activa</span>
                        ) : null}
                        {row.reviewedObservationCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/15 bg-cyan-400/[0.06] px-2 py-0.5 text-[10px] font-medium text-cyan-100/65">
                            <SearchCheck className="h-3 w-3" />
                            Revisada
                          </span>
                        ) : null}
                        {row.integrityCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/15 bg-emerald-400/[0.06] px-2 py-0.5 text-[10px] font-medium text-emerald-100/65">
                            <Fingerprint className="h-3 w-3" />
                            Huella local
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-white/85">
                        {row.event?.title ?? `Evento ${row.memory.eventId}`}
                      </div>
                      <div className="mt-1 flex items-start gap-1.5 text-xs text-white/45">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{row.event?.location ?? "Resumen del evento todavía no recuperado"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!row.event}
                      onClick={() => {
                        if (!row.event) return;
                        onSelect(row.event);
                        onClose();
                      }}
                      className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-400/[0.06] px-3 py-1.5 text-xs font-semibold text-cyan-100/70 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Abrir
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/35">
                    <span className="inline-flex items-center gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5" />
                      {row.missionCount} {row.missionCount === 1 ? "misión" : "misiones"}
                    </span>
                    <span>{row.observationCount} {row.observationCount === 1 ? "observación" : "observaciones"}</span>
                    <span>Última apertura: {localDate(row.memory.lastOpenedAt)}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/35">
                    <span>{row.sourceReferenceCount} con fuente declarada</span>
                    <span>{row.closedMissionCount} cerradas</span>
                    {row.latestObservationAt ? <span>Última observación: {localDate(row.latestObservationAt)}</span> : null}
                  </div>

                  {row.observationCount > 0 && row.integrityCount < row.observationCount ? (
                    <div className="mt-2 text-[11px] leading-relaxed text-amber-100/55">
                      {row.observationCount - row.integrityCount} observación{row.observationCount - row.integrityCount === 1 ? "" : "es"} sin huella local.
                    </div>
                  ) : null}

                  {row.sensitiveCount > 0 ? (
                    <div className="mt-2 text-[11px] leading-relaxed text-amber-100/55">
                      {row.sensitiveCount} observación{row.sensitiveCount === 1 ? "" : "es"} marcada{row.sensitiveCount === 1 ? "" : "s"} como sensible.
                    </div>
                  ) : null}

                  {!row.event ? (
                    <div className="mt-2 text-[11px] leading-relaxed text-amber-100/55">
                      Este registro fue creado antes del resumen recuperable. Abrí el evento desde el mapa y tocá Registrar apertura para actualizarlo.
                    </div>
                  ) : null}
                </div>
              ))}
              </div>
            </>
          )}
        </div>

        <GuardianBackupControls onRestore={setStore} />

        <div className="border-t border-white/10 px-5 py-3 text-[11px] leading-relaxed text-white/35 md:px-6">
          Esta actividad no está sincronizada ni publicada. Borrar los datos del navegador puede eliminarla.
        </div>
      </section>
    </div>
  );
}
