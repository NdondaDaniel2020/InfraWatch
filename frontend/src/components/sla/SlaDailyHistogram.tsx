import React from "react";

interface SlaDailyHistogramProps {
  targetSlaPct?: number;
  periodLabel?: string;
}

export const SlaDailyHistogram: React.FC<SlaDailyHistogramProps> = ({
  targetSlaPct = 99.5,
  periodLabel = "Mês Vigente",
}) => {
  // Dados representativos dos 31 dias para o histograma com base na especificação de telemetria
  const daysData = [
    { day: "01", pct: 100.0, height: 98, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "02", pct: 100.0, height: 97, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "03", pct: 100.0, height: 99, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "04", pct: 100.0, height: 96, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "05", pct: 99.85, height: 94, type: "maint", note: "Janela RFC-2026-04 Isenta (ADR-009)" },
    { day: "06", pct: 100.0, height: 98, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "07", pct: 100.0, height: 99, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "08", pct: 100.0, height: 97, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "09", pct: 100.0, height: 98, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "10", pct: 100.0, height: 99, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "11", pct: 100.0, height: 96, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "12", pct: 99.88, height: 95, type: "maint", note: "Upgrade Core Router RFC-08 Isento" },
    { day: "13", pct: 100.0, height: 98, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "14", pct: 100.0, height: 99, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "15", pct: 100.0, height: 97, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "16", pct: 100.0, height: 98, type: "nominal", note: "Nominal • 0 incidentes" },
    { day: "17", pct: 99.45, height: 58, type: "incident", note: "Incidente mitigado em 8m 12s" },
    { day: "18", pct: 99.98, height: 97, type: "today", note: "Operação nominal em tempo real" },
    // Dias 19 a 31: Futuros planejados
    { day: "19", pct: null, height: 75, type: "future", note: "Dia 19 (Planejado)" },
    { day: "20", pct: null, height: 75, type: "future", note: "Dia 20 (Planejado)" },
    { day: "21", pct: null, height: 75, type: "future", note: "Dia 21 (Planejado)" },
    { day: "22", pct: null, height: 75, type: "future", note: "Dia 22 (Planejado)" },
    { day: "23", pct: null, height: 75, type: "future", note: "Dia 23 (Planejado)" },
    { day: "24", pct: null, height: 75, type: "future", note: "Dia 24 (Planejado)" },
    { day: "25", pct: null, height: 75, type: "future", note: "Dia 25 (Planejado)" },
    { day: "26", pct: null, height: 75, type: "future", note: "Dia 26 (Planejado)" },
    { day: "27", pct: null, height: 75, type: "future", note: "Dia 27 (Planejado)" },
    { day: "28", pct: null, height: 75, type: "future", note: "Dia 28 (Planejado)" },
    { day: "29", pct: null, height: 75, type: "future", note: "Dia 29 (Planejado)" },
    { day: "30", pct: null, height: 75, type: "future", note: "Dia 30 (Planejado)" },
    { day: "31", pct: null, height: 75, type: "future", note: "Dia 31 (Planejado)" },
  ];

  return (
    <section className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 flex flex-col gap-4 shadow-lg">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-obsidian-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-display font-bold text-white">
              Disponibilidade Diária — {periodLabel}
            </h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-obsidian-950 text-slate-400 border border-obsidian-800">
              31 DIAS CALENDÁRIO
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Acompanhamento diário contínuo com linha mandatória de corte SLA a {targetSlaPct.toFixed(3)}%.
          </p>
        </div>

        {/* Legenda do Gráfico */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500"></span>
            <span>Conforme (≥{targetSlaPct.toFixed(2)}%)</span>
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
            <span>Meta Contratual ({targetSlaPct.toFixed(2)}%)</span>
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
                Linha de Corte Mandatória SLA: {targetSlaPct.toFixed(2)}%
              </span>
              <span className="font-mono text-[11px] text-rose-400 font-bold pr-2">
                {targetSlaPct.toFixed(3)}%
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

            {/* Grid com 31 Barras em Flexbox */}
            <div className="flex items-end gap-1 w-full h-full relative z-0 pt-4">
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

          {/* Rótulos dos Dias 01 a 31 */}
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
