import { useState } from "react";
import { Check, Copy, Download, FileText } from "lucide-react";
import type { EnvironmentalEvent } from "@/data/events";
import type { GuardianMission, GuardianObservation } from "@/app/lib/guardianStore";
import { buildGuardianReport, guardianReportFileName } from "@/app/lib/guardianReport";

async function writeLocalClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    previouslyFocused?.focus();
    if (!copied) throw new Error("No se pudo copiar el informe.");
  }
}

export function GuardianReportPanel({
  event,
  missions,
  observations,
}: {
  event: EnvironmentalEvent;
  missions: GuardianMission[];
  observations: GuardianObservation[];
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const closedMissionCount = missions.filter((mission) => mission.status !== "active").length;
  const hasGuardianWork = observations.length > 0 || closedMissionCount > 0;

  const copyReport = async () => {
    try {
      await writeLocalClipboard(buildGuardianReport({ event, missions, observations }));
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
    }
  };

  const downloadReport = () => {
    const blob = new Blob([buildGuardianReport({ event, missions, observations })], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = guardianReportFileName(event);
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-violet-200/75" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white/85">Informe Guardian local</div>
          <div className="mt-1 text-xs leading-relaxed text-white/40">
            Reúne misiones, observaciones, fuentes declaradas y limitaciones en un documento Markdown privado.
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="border-l-2 border-violet-300/20 pl-3">
          <div className="text-white/35">Misiones cerradas</div>
          <div className="mt-1 font-semibold text-white/70">{closedMissionCount}</div>
        </div>
        <div className="border-l-2 border-emerald-300/20 pl-3">
          <div className="text-white/35">Observaciones</div>
          <div className="mt-1 font-semibold text-white/70">{observations.length}</div>
        </div>
      </div>

      <div className="mt-3 text-[11px] leading-relaxed text-white/35">
        La exportación no certifica autenticidad ni constituye una cadena de custodia o confirmación oficial.
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={copyReport}
          disabled={!hasGuardianWork}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/65 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copyState === "copied" ? <Check className="h-4 w-4 text-emerald-200" /> : <Copy className="h-4 w-4" />}
          {copyState === "copied" ? "Copiado" : "Copiar informe"}
        </button>
        <button
          type="button"
          onClick={downloadReport}
          disabled={!hasGuardianWork}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-sm font-semibold text-violet-100/80 hover:bg-violet-400/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Descargar .md
        </button>
      </div>

      {!hasGuardianWork ? (
        <div className="mt-3 text-xs text-white/35">
          Cerrá una misión o registrá una observación para habilitar el informe.
        </div>
      ) : copyState === "error" ? (
        <div className="mt-3 text-xs text-amber-100/65">No se pudo acceder al portapapeles. Podés descargar el archivo.</div>
      ) : null}
    </div>
  );
}
