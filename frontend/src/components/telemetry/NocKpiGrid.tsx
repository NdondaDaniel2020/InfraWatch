import React from "react";
import { Link } from "react-router-dom";
import { Clock, Activity, AlertOctagon } from "lucide-react";

export interface NocKpiStats {
  total: number;
  up: number;
  deg: number;
  down: number;
}

export interface NocKpiGridProps {
  stats: NocKpiStats;
}

export const NocKpiGrid: React.FC<NocKpiGridProps> = ({ stats }) => {
  return (
    <section
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      aria-label="Indicadores Chave do Cluster"
    >
      {/* KPI 1: Uptime */}
      <div
        data-testid="kpi-uptime"
        className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 flex flex-col justify-between shadow-sm"
      >
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
          <span>Disponibilidade Global</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        <div className="my-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-display text-white tracking-tight">99.98%</span>
          <span className="text-xs font-mono text-emerald-400 tabular-nums font-semibold">+0.04%</span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-obsidian-800/60 pt-2">
          <span>Meta SLA: 99.50%</span>
          <span className="text-emerald-400">Conforme ADR-009</span>
        </div>
      </div>

      {/* KPI 2: MTTR Médio */}
      <div
        data-testid="kpi-mttr"
        className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 flex flex-col justify-between shadow-sm"
      >
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
          <span>MTTR Médio (Mês)</span>
          <Clock size={18} className="text-emerald-400" />
        </div>
        <div className="my-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-display text-white tracking-tight tabular-nums">18m 42s</span>
          <span className="text-xs font-mono text-emerald-400 tabular-nums font-semibold">-04m 12s</span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-obsidian-800/60 pt-2">
          <span>Meta: &lt; 30m</span>
          <span className="text-slate-300">Resolução Rápida</span>
        </div>
      </div>

      {/* KPI 3: Throughput Agregado */}
      <div
        data-testid="kpi-throughput"
        className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 flex flex-col justify-between shadow-sm"
      >
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
          <span>Tráfego Agregado</span>
          <Activity size={18} className="text-sky-400" />
        </div>
        <div className="my-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-display text-white tracking-tight tabular-nums">
            98.2 <span className="text-sm font-normal text-slate-400">Gbps</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-obsidian-800/60 pt-2">
          <span>48.2G Ingress</span>
          <span className="text-sky-400">50.0G Egress</span>
        </div>
      </div>

      {/* KPI 4: Alarmes de NOC */}
      <div
        data-testid="kpi-alarms"
        className="bg-obsidian-900 border border-obsidian-800 rounded-xl p-4 flex flex-col justify-between shadow-sm"
      >
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
          <span>Alarmes de NOC</span>
          <AlertOctagon size={18} className="text-rose-400 animate-pulse" />
        </div>
        <div className="my-2 flex items-baseline gap-3">
          <span className="text-2xl font-bold font-display text-rose-400 tracking-tight tabular-nums">
            {stats.down} CRIT
          </span>
          <span className="text-base font-bold font-display text-amber-400 tracking-tight tabular-nums">
            {stats.deg} DEG
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-obsidian-800/60 pt-2">
          <span>{stats.up} Nominais</span>
          <Link to="/incidents" className="text-rose-400 hover:underline">
            Ver Fila ↗
          </Link>
        </div>
      </div>
    </section>
  );
};
