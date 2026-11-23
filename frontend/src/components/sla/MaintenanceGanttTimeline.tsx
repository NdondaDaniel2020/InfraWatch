import React from "react";
import { Calendar, Clock } from "lucide-react";
import type { MaintenanceWindow } from "../../types/sla";

interface MaintenanceGanttTimelineProps {
  maintenances: MaintenanceWindow[];
}

export const MaintenanceGanttTimeline: React.FC<MaintenanceGanttTimelineProps> = ({
  maintenances = [],
}) => {
  const safeMaintenances = Array.isArray(maintenances) ? maintenances : [];

  const hours = [
    "00h", "02h", "04h", "06h", "08h", "10h",
    "12h", "14h", "16h", "18h", "20h", "22h",
  ];

  // Ativos únicos envolvidos nas manutenções
  const trackDevices = Array.from(
    new Set(safeMaintenances.flatMap((m) => m?.targetDeviceNames || []))
  );

  return (
    <section
      data-testid="maint-gantt-container"
      className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 space-y-4 shadow-md"
    >
      <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-sky-400" />
          <h3 className="font-display font-bold text-sm text-white">
            Linha do Tempo Gantt — 24 Horas
          </h3>
        </div>
        <span className="font-mono text-xs text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          Fuso: Luanda (WAT / UTC+1)
        </span>
      </div>

      <div className="space-y-3 font-mono text-xs">
        {/* Régua de Horas */}
        <div className="grid grid-cols-[160px_repeat(12,1fr)] gap-1 text-center text-[10px] text-slate-500 pb-1.5 border-b border-obsidian-800">
          <div className="text-left font-semibold text-slate-400 pl-1">Ativo / Host</div>
          {hours.map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>

        {/* Trilhos por Ativo */}
        {trackDevices.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Nenhum ativo associado a paradas técnicas no período.
          </div>
        ) : (
          trackDevices.map((device) => {
            const relatedMaints = safeMaintenances.filter((m) =>
              m?.targetDeviceNames?.includes(device)
            );

            return (
              <div
                key={device}
                className="grid grid-cols-[160px_1fr] items-center gap-3"
              >
                <span
                  className="text-xs font-semibold text-slate-300 truncate pl-1"
                  title={device}
                >
                  {device}
                </span>

                <div className="h-8 bg-obsidian-950 rounded-lg border border-obsidian-800 relative flex items-center overflow-hidden">
                  {relatedMaints.map((m) => {
                    const start = new Date(m.startTimeUtc).getUTCHours();
                    const leftPct = Math.min(Math.max((start / 24) * 100, 0), 90);
                    const widthPct = Math.max((m.durationMinutes / 1440) * 100, 10);

                    const styleConfig =
                      m.status === "APPROVED"
                        ? "bg-sky-500/20 border-sky-400 text-sky-300"
                        : m.status === "PENDING_APPROVAL"
                        ? "bg-amber-500/20 border-amber-400 text-amber-300"
                        : m.status === "IN_PROGRESS"
                        ? "bg-amber-500/30 border-amber-400 text-amber-300"
                        : m.status === "COMPLETED"
                        ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                        : "bg-rose-500/20 border-rose-400 text-rose-300";

                    return (
                      <div
                        key={m.id}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                        }}
                        className={`absolute h-6 rounded border px-2 flex items-center text-[10px] font-bold truncate transition-all shadow-sm ${styleConfig}`}
                        title={`${m.rfcNumber}: ${m.title} (${m.durationMinutes}m)`}
                      >
                        {m.rfcNumber} ({m.title})
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
