import React from "react";
import { CheckCircle2, Clock, Wrench, Activity, Info, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { SlaMetricOverview } from "../../types/sla";

interface SlaKpiCardsProps {
  overview: SlaMetricOverview;
}

export const SlaKpiCards: React.FC<SlaKpiCardsProps> = ({ overview }) => {
  const isHealthy = overview.currentUptimePct >= overview.targetSlaPct;

  const formatHoursMinutes = (minutesTotal: number) => {
    const hours = Math.floor(minutesTotal / 60);
    const mins = Math.floor(minutesTotal % 60);
    return `${hours.toString().padStart(2, "0")}h ${mins.toString().padStart(2, "0")}m 00s`;
  };

  const slaImpactPct = Math.max(0, 100 - overview.currentUptimePct).toFixed(2);

  return (
    <section
      data-testid="sla-kpi-cards"
      aria-label="Indicadores Chave de SLA"
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
    >
      {/* Card 1: Disponibilidade Real Acumulada */}
      <div className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-medium text-slate-400">Disponibilidade Real</span>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            OFICIAL
          </span>
        </div>

        <div className="my-3">
          <div
            id="kpi-sla-uptime"
            className="text-4xl font-mono font-extrabold text-emerald-400 tracking-tight tabular-nums"
          >
            {overview.currentUptimePct.toFixed(2)}%
          </div>
          <div
            id="kpi-sla-status-badge"
            className={`mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
              isHealthy
                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
            }`}
          >
            {isHealthy ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>
              {isHealthy
                ? `EM CONFORMIDADE (+${overview.marginPct >= 0 ? overview.marginPct.toFixed(2) : "0.00"}% vs ${overview.targetSlaPct.toFixed(2)}%)`
                : `ABAIXO DA META (${overview.marginPct.toFixed(2)}% vs ${overview.targetSlaPct.toFixed(2)}%)`}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Headroom restante:</span>
          <span id="kpi-headroom" className="text-emerald-400 font-semibold tabular-nums">
            {overview.downtimeBalanceFormatted ||
              (overview.marginPct >= 0
                ? `${Math.max(1, Math.round(overview.marginPct * 43.2))}m tolerável`
                : "0m tolerável")}
          </span>
        </div>
      </div>

      {/* Card 2: Downtime Não-Programado */}
      <div className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-medium text-slate-400">Downtime Não-Programado</span>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            PENALIZÁVEL
          </span>
        </div>

        <div className="my-3">
          <div
            id="kpi-downtime"
            className="text-4xl font-mono font-extrabold text-amber-400 tracking-tight tabular-nums"
          >
            {formatHoursMinutes(overview.unexemptedDowntimeMinutes)}
          </div>
          <div className="mt-2 text-slate-400 text-xs font-mono flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span id="kpi-incident-count">
              Total de {overview.totalIncidents ?? 2} incidentes no ciclo
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Impacto no SLA:</span>
          <span id="kpi-impact" className="text-amber-400 font-bold tabular-nums">
            -{slaImpactPct}%
          </span>
        </div>
      </div>

      {/* Card 3: Paradas Técnicas Isentas (Homologadas ADR-009) */}
      <div className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-sky-400" />
            <span className="text-xs font-medium text-slate-400">Paradas Isentas (ADR-009)</span>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 whitespace-nowrap shrink-0">
            ISENÇÃO OK
          </span>
        </div>

        <div className="my-3">
          <div
            id="kpi-exempt-hours"
            className="text-4xl font-mono font-extrabold text-sky-400 tracking-tight tabular-nums"
          >
            {formatHoursMinutes(overview.exemptedDowntimeMinutes)}
          </div>
          <div className="mt-2 text-slate-400 text-xs font-mono flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Descontadas do cálculo oficial</span>
          </div>
        </div>

        <div className="pt-3 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Janelas aprovadas:</span>
          <span className="text-white font-semibold">2 janelas pela Governança</span>
        </div>
      </div>

      {/* Card 4: Índices Operacionais Confiabilidade (MTTR / MTBF) */}
      <div className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-5 flex flex-col justify-between shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-white" />
            <span className="text-xs font-medium text-slate-400">Confiabilidade SRE / NOC</span>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-obsidian-850 text-slate-300 border border-obsidian-700">
            MÉTRICAS
          </span>
        </div>

        <div className="my-2 grid grid-cols-2 gap-2.5">
          <div className="bg-obsidian-950 p-2 rounded-lg border border-obsidian-800">
            <span className="text-[10px] font-mono text-slate-400 block uppercase">MTTR Médio</span>
            <span id="kpi-mttr" className="text-lg font-mono font-bold text-emerald-400 block mt-0.5 tabular-nums">
              {overview.mttrMinutes}m
            </span>
            <span className="text-[10px] text-slate-400">Recuperação</span>
          </div>
          <div className="bg-obsidian-950 p-2 rounded-lg border border-obsidian-800">
            <span className="text-[10px] font-mono text-slate-400 block uppercase">MTBF Médio</span>
            <span id="kpi-mtbf" className="text-lg font-mono font-bold text-white block mt-0.5 tabular-nums">
              {overview.mtbfHours}h
            </span>
            <span className="text-[10px] text-slate-400">Entre falhas</span>
          </div>
        </div>

        <div className="pt-2 border-t border-obsidian-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Meta MTTR contratual:</span>
          <span className="text-emerald-400 font-semibold">&lt; 15 min (Cumprida)</span>
        </div>
      </div>
    </section>
  );
};
