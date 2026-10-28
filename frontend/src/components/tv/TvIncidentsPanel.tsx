import React, { useMemo } from "react";
import { AlertOctagon, Activity, Clock, ShieldAlert } from "lucide-react";
import { TV_INCIDENTS } from "../../mocks/tvMocks";
import type { TvIncidentItem } from "../../types/telemetry";

export interface TvIncidentsPanelProps {
  incidents?: TvIncidentItem[];
  mttrFormatted?: string;
  slaMonthlyPct?: number;
}

interface IncidentVisualConfig {
  cardClass: string;
  iconBoxClass: string;
  badgeClass: string;
  slaTextClass: string;
}

const TV_INCIDENT_VISUALS: Record<TvIncidentItem["severity"], IncidentVisualConfig> = {
  CRITICAL: {
    cardClass: "bg-rose-950/30 border-rose-500/50",
    iconBoxClass: "bg-rose-500/20 text-rose-400 border border-rose-500/40",
    badgeClass: "bg-rose-500 text-white",
    slaTextClass: "text-rose-400",
  },
  HIGH: {
    cardClass: "bg-[#080c14] border-[#1b2640]",
    iconBoxClass: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
    badgeClass: "bg-amber-500 text-obsidian-950",
    slaTextClass: "text-amber-400",
  },
  MEDIUM: {
    cardClass: "bg-[#080c14] border-[#1b2640]",
    iconBoxClass: "bg-sky-500/20 text-sky-400 border border-sky-500/40",
    badgeClass: "bg-sky-500 text-obsidian-950",
    slaTextClass: "text-sky-400",
  },
};

interface TvKpiCardProps {
  borderClass: string;
  titleColorClass: string;
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  subtitle: string;
}

const TvKpiCard: React.FC<TvKpiCardProps> = ({
  borderClass,
  titleColorClass,
  icon,
  title,
  value,
  subtitle,
}) => (
  <div className={`bg-[#0e1524] border ${borderClass} rounded-xl p-4`}>
    <div className={`text-xs font-mono ${titleColorClass} font-bold flex items-center gap-1.5`}>
      {icon} {title}
    </div>
    <div className={`text-4xl font-extrabold font-mono ${titleColorClass} mt-2 tabular-nums`}>
      {value}
    </div>
    <div className="text-xs font-mono text-slate-400 mt-1">
      {subtitle}
    </div>
  </div>
);

export const TvIncidentsPanel: React.FC<TvIncidentsPanelProps> = ({
  incidents = TV_INCIDENTS,
  mttrFormatted = "18m",
  slaMonthlyPct = 99.88,
}) => {
  // Contadores derivados dinamicamente da prop de dados
  const { criticalCount, degradedCount, criticalSubtitle, degradedSubtitle } = useMemo(() => {
    const crit = incidents.filter((i) => i.severity === "CRITICAL");
    const deg = incidents.filter((i) => i.severity !== "CRITICAL");
    return {
      criticalCount: crit.length,
      degradedCount: deg.length,
      criticalSubtitle: crit.length > 0 ? `Falha em ${crit[0].device}` : "Nenhum incidente crítico ativo",
      degradedSubtitle: deg.length > 0 ? deg.map((i) => i.client.split(" ")[0]).join(" & ") : "Sem degradações",
    };
  }, [incidents]);

  return (
    <section
      data-testid="tv-panel-incidents"
      aria-label="Incidentes Ativos e Chamados GLPI em Andamento"
      className="flex-1 flex flex-col gap-4 overflow-hidden animate-fadeIn"
    >
      {/* Cabeçalho do Painel com KPIs de SLA & Incidentes (Unificados e Orientados a Dados) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <TvKpiCard
          borderClass="border-rose-500/40"
          titleColorClass="text-rose-400"
          icon={<AlertOctagon size={16} />}
          title="INCIDENTES CRÍTICOS (SEV-1)"
          value={criticalCount}
          subtitle={criticalSubtitle}
        />

        <TvKpiCard
          borderClass="border-amber-500/40"
          titleColorClass="text-amber-400"
          icon={<Activity size={16} />}
          title="DEGRADAÇÃO & LATÊNCIA (SEV-2)"
          value={degradedCount}
          subtitle={degradedSubtitle}
        />

        <TvKpiCard
          borderClass="border-[#1b2640]"
          titleColorClass="text-emerald-400"
          icon={<Clock size={16} className="text-emerald-400" />}
          title="MTTR MÉDIO DO DIA"
          value={mttrFormatted}
          subtitle="Meta SLA: < 60 minutos"
        />

        <TvKpiCard
          borderClass="border-[#1b2640]"
          titleColorClass="text-white"
          icon={<ShieldAlert size={16} className="text-sky-400" />}
          title="SLA MENSAL CONTRATUAL"
          value={`${(slaMonthlyPct ?? 99.5).toFixed(2)}%`}
          subtitle="Disponibilidade Agregada BNA / RCS"
        />
      </div>

      {/* Lista Expandida de Incidentes e Tickets GLPI */}
      <div className="flex-1 bg-[#0e1524] border border-[#1b2640] rounded-xl p-4 overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between pb-3 border-b border-[#1b2640]">
          <h2 className="text-sm font-bold font-mono text-white flex items-center gap-2">
            <AlertOctagon size={18} className="text-rose-500" />
            <span>FILA DE INCIDENTES DISPATCHADOS • GLPI RCS ANGOLA</span>
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Total de chamados ativos: <strong className="text-white">{incidents.length}</strong>
          </span>
        </div>

        <div className="flex-1 flex flex-col gap-3 py-3 overflow-hidden justify-around">
          {incidents.map((inc) => {
            const visual = TV_INCIDENT_VISUALS[inc.severity] || TV_INCIDENT_VISUALS.HIGH;

            return (
              <article
                key={inc.id}
                data-testid={`tv-incident-${inc.id}`}
                className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${visual.cardClass}`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${visual.iconBoxClass}`}
                  >
                    <AlertOctagon size={20} />
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-extrabold ${visual.badgeClass}`}
                      >
                        {inc.severity}
                      </span>
                      <span className="text-xs font-mono font-bold text-white">
                        {inc.device}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        ({inc.ip})
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-xs font-medium text-emerald-400 font-mono">
                        {inc.client}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-200 mt-1">
                      {inc.title}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 font-mono text-xs">
                  <div className="flex flex-col text-right">
                    <span className="text-[11px] text-slate-400">SLA RESTANTE</span>
                    <strong
                      className={`text-base font-bold tabular-nums ${visual.slaTextClass}`}
                    >
                      {inc.slaRemaining}
                    </strong>
                  </div>

                  <div className="flex flex-col text-right">
                    <span className="text-[11px] text-slate-400">CHAMADO GLPI</span>
                    <strong className="text-slate-200">{inc.glpiTicket}</strong>
                  </div>

                  <div className="flex flex-col text-right">
                    <span className="text-[11px] text-slate-400">RESPONSÁVEL</span>
                    <strong className="text-slate-300">{inc.assignee}</strong>
                  </div>

                  <span className="px-3 py-1 rounded bg-[#0e1524] border border-[#1b2640] text-emerald-400 text-xs font-bold">
                    {inc.status}
                  </span>
                </div>
              </article>
            );
          })}
        </div>

        <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-[#1b2640] flex justify-between">
          <span>Roteamento autônomo BGP ativo em todos os ASNs</span>
          <span>Tempo médio de primeira resposta L1: 42 segundos</span>
        </div>
      </div>
    </section>
  );
};
