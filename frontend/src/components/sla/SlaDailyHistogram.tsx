import React from "react";
import type { OrganizationDailySlaData } from "../../types/sla";

interface SlaDailyHistogramProps {
  data?: OrganizationDailySlaData | null;
  isLoading?: boolean;
  targetSlaPct?: number;
  periodLabel?: string;
}

interface RenderDayItem {
  day: string;
  pct: number | null;
  height: number;
  type: "nominal" | "maint" | "incident" | "today" | "future";
  note: string;
}

/**
 * Mapeia o percentual apurado para a altura da barra em %, alinhando a meta (ex: 99.50%)
 * com a linha tracejada no topo do container (top-14 / ~65% de altura).
 */
function computeBarHeight(pct: number | null, targetPct = 99.5): number {
  if (pct === null) return 75; // Dias futuros planejados (barras translúcidas)
  if (pct >= 100.0) return 98; // 100% nominal
  if (pct >= targetPct) {
    // Escala linear suave entre a linha mandatória (~65%) e o topo 100% (~98%)
    const ratio = (pct - targetPct) / Math.max(0.001, 100.0 - targetPct);
    return Math.min(98, Math.max(65, Math.round(65 + ratio * (98 - 65))));
  }
  // Penalidade por incidente abaixo da meta (entre 15% e 65%)
  const diff = targetPct - pct;
  const height = 65 - (diff / 0.5) * 50;
  return Math.min(65, Math.max(15, Math.round(height)));
}

export const SlaDailyHistogram: React.FC<SlaDailyHistogramProps> = ({
  data,
  isLoading = false,
  targetSlaPct = 99.5,
  periodLabel = "Mês Vigente",
}) => {
  const effectiveTarget = data?.targetPct ?? targetSlaPct;
  const effectivePeriodLabel = data?.periodLabel || periodLabel;
  const totalDays = data?.totalDays ?? (data?.days ? data.days.length : 31);

  // Mapeia os dias vindos da API com cálculo analítico de altura
  const daysData: RenderDayItem[] = data?.days
    ? data.days.map((d) => ({
        day: d.day,
        pct: d.uptimePct,
        height: computeBarHeight(d.uptimePct, effectiveTarget),
        type: d.type,
        note: d.note,
      }))
    : Array.from({ length: 31 }, (_, i) => {
        const dayNum = i + 1;
        const dayStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
        return {
          day: dayStr,
          pct: null,
          height: 75,
          type: "future" as const,
          note: `Dia ${dayStr} (Aguardando telemetria)`,
        };
      });

  return (
    <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 flex flex-col gap-4 shadow-lg">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-obsidian-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-display font-bold text-white">
              Disponibilidade Diária — {effectivePeriodLabel}
            </h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-obsidian-950 text-slate-400 border border-obsidian-800">
              {totalDays} DIAS CALENDÁRIO
            </span>
            {isLoading && (
              <span className="text-[11px] font-mono text-emerald-400 animate-pulse">
                Sincronizando telemetria...
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Acompanhamento diário contínuo com linha mandatória de corte SLA a {effectiveTarget.toFixed(3)}%.
          </p>
        </div>

        {/* Legenda do Gráfico */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500"></span>
            <span>Conforme (≥{effectiveTarget.toFixed(2)}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-400"></span>
            <span>Incidente Registrado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-sky-400"></span>
            <span>Parada Técnica Isenta</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-rose-500"></span>
            <span>Meta Contratual ({effectiveTarget.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      {/* Área das Barras */}
      <div className="pt-2">
        <div className="relative w-full">
          <div className="relative w-full h-44">
            {/* Linha Tracejada de Corte 99.50% */}
            <div className="absolute left-0 right-0 top-14 border-t border-dashed border-rose-500/80 flex items-center justify-between pointer-events-none z-10">
              <span className="font-mono text-[10px] bg-rose-950 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded shadow">
                Linha de Corte Mandatória SLA: {effectiveTarget.toFixed(2)}%
              </span>
              <span className="font-mono text-[11px] text-rose-400 font-bold pr-2">
                {effectiveTarget.toFixed(3)}%
              </span>
            </div>

            {/* Linha 100% */}
            <div className="absolute left-0 right-0 top-2 border-t border-obsidian-800 flex items-center justify-end pointer-events-none">
              <span className="font-mono text-[10px] text-slate-500 pr-2">100.00%</span>
            </div>

            {/* Linha 99.00% */}
            <div className="absolute left-0 right-0 bottom-2 border-t border-obsidian-800 flex items-center justify-end pointer-events-none">
              <span className="font-mono text-[10px] text-slate-500 pr-2">99.00%</span>
            </div>

            {/* Grid com Barras em Flexbox */}
            <div className={`flex items-end gap-1 w-full h-full relative z-0 pt-4 ${isLoading ? "animate-pulse opacity-60" : ""}`}>
              {daysData.map((d) => {
                if (d.type === "future") {
                  return (
                    <div
                      key={d.day}
                      className="flex-1 min-w-0 flex flex-col items-center h-full justify-end cursor-default"
                      title={d.note}
                    >
                      <div
                        className="w-full border-t border-x border-dashed border-obsidian-800 bg-obsidian-950/20 rounded-t-sm"
                        style={{ height: `${d.height}%` }}
                      ></div>
                    </div>
                  );
                }

                const isMaint = d.type === "maint";
                const isIncident = d.type === "incident";
                const isToday = d.type === "today";

                const barColor = isIncident
                  ? "bg-amber-400 group-hover:bg-amber-300"
                  : isMaint
                  ? "bg-sky-400 group-hover:bg-sky-300"
                  : "bg-emerald-500 group-hover:bg-emerald-400";

                return (
                  <div
                    key={d.day}
                    className="flex-1 min-w-0 group relative flex flex-col items-center h-full justify-end cursor-pointer"
                  >
                    <div
                      className={`w-full ${barColor} transition-colors rounded-t-sm relative`}
                      style={{ height: `${d.height}%` }}
                    >
                      {isToday && (
                        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping"></span>
                      )}
                      {isIncident && (
                        <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-300"></span>
                      )}
                    </div>

                    {/* Tooltip Dinâmico */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-2 flex flex-col items-center bg-obsidian-950 border border-obsidian-700 px-2.5 py-1.5 rounded shadow-2xl z-30 pointer-events-none whitespace-nowrap -translate-x-1/2 left-1/2">
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          isIncident
                            ? "text-amber-400"
                            : isMaint
                            ? "text-sky-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {isToday ? "HOJE • " : ""}DIA {d.day} ({d.pct?.toFixed(2)}%)
                      </span>
                      <span className="text-[10px] text-slate-300 leading-tight text-center">
                        {d.note}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rótulos dos Dias */}
          <div className="flex gap-1 w-full pt-2 border-t border-obsidian-800 text-center font-mono text-[10px] text-slate-400">
            {daysData.map((d) => (
              <span
                key={d.day}
                className={`flex-1 min-w-0 ${
                  d.type === "today" ? "text-emerald-400 font-bold" : ""
                }`}
              >
                {d.day}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
