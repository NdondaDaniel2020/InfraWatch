import React from "react";
import { CheckCircle2, Gauge, Headphones } from "lucide-react";
import { IncidentsKpiSummary } from "../../services/incidentsApi";

export interface IncidentKpiCardsProps {
  kpiSummary: IncidentsKpiSummary | null;
  isLoading?: boolean;
}

/**
 * Grade de 4 Cards de Indicadores Chave de Incidentes (Issue #32).
 * Fiel a telas_mockups/06_IncidentsPage.
 */
export const IncidentKpiCards: React.FC<IncidentKpiCardsProps> = ({
  kpiSummary,
  isLoading = false,
}) => {
  return (
    <section
      data-testid="kpi-cards"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      aria-label="Indicadores Chave de Incidentes"
    >
      {isLoading ? (
        <>
          <div className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl h-28 animate-pulse" />
          <div className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl h-28 animate-pulse" />
          <div className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl h-28 animate-pulse" />
          <div className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl h-28 animate-pulse" />
        </>
      ) : (
        <>
          {/* Card 1: Críticos P1 */}
          <article className="bg-obsidian-900 border border-rose-500/40 p-4 rounded-xl relative overflow-hidden shadow-lg">
            <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
            <div className="flex justify-between items-start">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Incidentes P1 (Crítico)
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" aria-hidden="true" />
            </div>
            <div
              data-testid="kpi-critical-count"
              className="font-display font-bold text-2xl text-rose-400 mt-1 tabular-nums"
            >
              {kpiSummary?.p1_critical_count ?? 1} Crítico
            </div>
            <div className="text-xs text-slate-400 mt-1">Interrupção total de serviço</div>
            <div className="mt-3 pt-2 border-t border-obsidian-800/80 flex items-center justify-between text-xs font-mono text-rose-400">
              <span>
                Duração:{" "}
                <strong data-testid="kpi-p1-duration" className="tabular-nums">
                  {kpiSummary?.p1_duration_str ?? "08m 12s"}
                </strong>
              </span>
              <span className="font-bold bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/30">
                RISCO SLA
              </span>
            </div>
          </article>

          {/* Card 2: Em Atendimento P2 */}
          <article className="bg-obsidian-900 border border-amber-500/40 p-4 rounded-xl relative overflow-hidden shadow-lg">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <div className="flex justify-between items-start">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Incidentes P2 (Alto)
              </span>
              <Headphones size={18} className="text-amber-400 shrink-0" aria-hidden="true" />
            </div>
            <div
              data-testid="kpi-degraded-count"
              className="font-display font-bold text-2xl text-amber-400 mt-1 tabular-nums"
            >
              {kpiSummary?.p2_degraded_count ?? 2} Degradados
            </div>
            <div className="text-xs text-slate-400 mt-1">Operadores atuando no NOC</div>
            <div className="mt-3 pt-2 border-t border-obsidian-800/80 text-xs font-mono text-slate-400 truncate">
              {kpiSummary?.p2_summary_str ?? "API Gateway & POP Benguela"}
            </div>
          </article>

          {/* Card 3: Resolvidos Hoje P3 */}
          <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-lg">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <div className="flex justify-between items-start">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Resolvidos Hoje
              </span>
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" aria-hidden="true" />
            </div>
            <div
              data-testid="kpi-resolved-count"
              className="font-display font-bold text-2xl text-emerald-400 mt-1 tabular-nums"
            >
              {kpiSummary?.resolved_today_count ?? 14} Incidentes
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Recuperação em SLA: {kpiSummary?.sla_recovery_pct ?? 98.2}%
            </div>
            <div className="mt-3 pt-2 border-t border-obsidian-800/80 text-xs font-mono text-slate-400 flex items-center justify-between">
              <span>Sincronizados GLPI</span>
              <span className="text-emerald-400 font-bold">{kpiSummary?.glpi_sync_pct ?? 100}% OK</span>
            </div>
          </article>

          {/* Card 4: MTTR Médio */}
          <article className="bg-obsidian-900 border border-obsidian-800 p-4 rounded-xl relative overflow-hidden shadow-lg">
            <div className="flex justify-between items-start">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                MTTR Médio (Mês)
              </span>
              <Gauge size={18} className="text-sky-400 shrink-0" aria-hidden="true" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <div
                data-testid="kpi-mttr-average"
                className="font-display font-bold text-2xl text-white tabular-nums"
              >
                {kpiSummary?.mttr_average_str ?? "6m 45s"}
              </div>
              <span className="text-xs font-mono text-emerald-400 font-semibold tabular-nums">
                ▼ {kpiSummary?.mttr_diff_pct ?? "-12%"}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Meta Contratual MTTR: &lt; 15 min</div>
            <div className="mt-3 pt-2 border-t border-obsidian-800/80 text-xs font-mono text-emerald-400">
              Dentro dos parâmetros contratuais
            </div>
          </article>
        </>
      )}
    </section>
  );
};
