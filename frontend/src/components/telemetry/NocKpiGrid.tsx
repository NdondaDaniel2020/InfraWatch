import React from "react";
import { Link } from "react-router-dom";
import { Clock, Activity, AlertOctagon } from "lucide-react";
import type { NocKpiStats } from "../../types/telemetry";

export type { NocKpiStats };

export interface NocKpiGridProps {
  stats: NocKpiStats;
  availabilityPct?: number;
  slaTargetPct?: number;
  mttrFormatted?: string;
  mttrDiff?: string;
  aggregatedTrafficGbps?: number;
  trafficIngressGbps?: number;
  trafficEgressGbps?: number;
}

interface KpiCardItemProps {
  testId: string;
  headerLabel: string;
  headerRight: React.ReactNode;
  bodyContent: React.ReactNode;
  footerLeft: React.ReactNode;
  footerRight: React.ReactNode;
}

/**
 * Subcomponente unificado que expressa a anatomia compartilhada dos indicadores chave (State-Driven).
 */
const NocKpiCard: React.FC<KpiCardItemProps> = ({
  testId,
  headerLabel,
  headerRight,
  bodyContent,
  footerLeft,
  footerRight,
}) => (
  <div
    data-testid={testId}
    className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 flex flex-col justify-between shadow-sm"
  >
    <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
      <span>{headerLabel}</span>
      {headerRight}
    </div>
    <div className="my-2 flex items-baseline gap-2">
      {bodyContent}
    </div>
    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-obsidian-800/60 pt-2">
      <span>{footerLeft}</span>
      <span>{footerRight}</span>
    </div>
  </div>
);

export const NocKpiGrid: React.FC<NocKpiGridProps> = ({
  stats,
  availabilityPct = 99.98,
  slaTargetPct = 99.50,
  mttrFormatted = "18m 42s",
  mttrDiff = "-04m 12s",
  aggregatedTrafficGbps = 98.2,
  trafficIngressGbps = 48.2,
  trafficEgressGbps = 50.0,
}) => {
  return (
    <section
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      aria-label="Indicadores Chave do Cluster"
    >
      {/* KPI 1: Uptime */}
      <NocKpiCard
        testId="kpi-uptime"
        headerLabel="Disponibilidade Global"
        headerRight={<span className="w-2 h-2 rounded-full bg-emerald-400" />}
        bodyContent={
          <>
            <span className="text-2xl font-bold font-display text-white tracking-tight">
              {(availabilityPct ?? 99.98).toFixed(2)}%
            </span>
            <span className="text-xs font-mono text-emerald-400 tabular-nums font-semibold">+0.04%</span>
          </>
        }
        footerLeft={`Meta SLA: ${(slaTargetPct ?? 99.50).toFixed(2)}%`}
        footerRight={<span className="text-emerald-400">Conforme ADR-009</span>}
      />

      {/* KPI 2: MTTR Médio */}
      <NocKpiCard
        testId="kpi-mttr"
        headerLabel="MTTR Médio (Mês)"
        headerRight={<Clock size={18} className="text-emerald-400" />}
        bodyContent={
          <>
            <span className="text-2xl font-bold font-display text-white tracking-tight tabular-nums">
              {mttrFormatted}
            </span>
            <span className="text-xs font-mono text-emerald-400 tabular-nums font-semibold">{mttrDiff}</span>
          </>
        }
        footerLeft="Meta: < 30m"
        footerRight={<span className="text-slate-300">Resolução Rápida</span>}
      />

      {/* KPI 3: Throughput Agregado */}
      <NocKpiCard
        testId="kpi-throughput"
        headerLabel="Tráfego Agregado"
        headerRight={<Activity size={18} className="text-sky-400" />}
        bodyContent={
          <span className="text-2xl font-bold font-display text-white tracking-tight tabular-nums">
            {(aggregatedTrafficGbps ?? 98.2).toFixed(1)} <span className="text-sm font-normal text-slate-400">Gbps</span>
          </span>
        }
        footerLeft={`${(trafficIngressGbps ?? 48.2).toFixed(1)}G Ingress`}
        footerRight={<span className="text-sky-400">{(trafficEgressGbps ?? 50.0).toFixed(1)}G Egress</span>}
      />

      {/* KPI 4: Alarmes de NOC */}
      <NocKpiCard
        testId="kpi-alarms"
        headerLabel="Alarmes de NOC"
        headerRight={<AlertOctagon size={18} className="text-rose-400 animate-pulse" />}
        bodyContent={
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold font-display text-rose-400 tracking-tight tabular-nums">
              {stats.down} CRIT
            </span>
            <span className="text-base font-bold font-display text-amber-400 tracking-tight tabular-nums">
              {stats.deg} DEG
            </span>
          </div>
        }
        footerLeft={`${stats.up} Nominais`}
        footerRight={
          <Link to="/incidents" className="text-rose-400 hover:underline">
            Ver Fila ↗
          </Link>
        }
      />
    </section>
  );
};
