import React from "react";
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
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      aria-label="Indicadores Chave do Cluster"
    >
      {/* KPI 1: Uptime */}
      <div
        data-testid="kpi-uptime"
        className="bg-[#0d1424] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm"
      >
        <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          <span>Disponibilidade</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
        <div className="my-2.5 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight text-white">99.98%</span>
          <span className="text-xs font-mono text-emerald-400 font-semibold">+0.04%</span>
        </div>
        <div className="border-t border-white/5 pt-2 flex justify-between text-[11px] font-mono text-slate-500">
          <span>Meta SLA: 99.50%</span>
          <span className="text-emerald-400">ADR-009 OK</span>
        </div>
      </div>

      {/* KPI 2: MTTR Médio */}
      <div
        data-testid="kpi-mttr"
        className="bg-[#0d1424] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm"
      >
        <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          <span>MTTR Médio</span>
          <Clock size={16} className="text-amber-400" />
        </div>
        <div className="my-2.5 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold font-mono text-white">18m 42s</span>
          <span className="text-xs font-mono text-emerald-400 font-semibold">-04m 12s</span>
        </div>
        <div className="border-t border-white/5 pt-2 flex justify-between text-[11px] font-mono text-slate-500">
          <span>Meta: &lt; 30m</span>
          <span className="text-slate-300">Resolução Rápida</span>
        </div>
      </div>

      {/* KPI 3: Throughput Agregado */}
      <div
        data-testid="kpi-throughput"
        className="bg-[#0d1424] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm"
      >
        <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          <span>Tráfego Agregado</span>
          <Activity size={16} className="text-sky-400" />
        </div>
        <div className="my-2.5 flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold font-mono text-white">98.2</span>
          <span className="text-sm font-mono text-slate-400">Gbps</span>
        </div>
        <div className="border-t border-white/5 pt-2 flex justify-between text-[11px] font-mono text-slate-500">
          <span>48.2G Ingress</span>
          <span className="text-sky-400">50.0G Egress</span>
        </div>
      </div>

      {/* KPI 4: Alarmes de NOC */}
      <div
        data-testid="kpi-alarms"
        className="bg-[#0d1424] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-sm"
      >
        <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          <span>Alarmes de NOC</span>
          <AlertOctagon size={16} className="text-rose-400" />
        </div>
        <div className="my-2.5 flex items-baseline gap-2.5 font-mono">
          <span className="text-3xl font-extrabold text-rose-400">
            {stats.down} CRIT
          </span>
          <span className="text-lg font-bold text-amber-400">
            {stats.deg} DEG
          </span>
        </div>
        <div className="border-t border-white/5 pt-2 flex justify-between text-[11px] font-mono text-slate-500">
          <span>{stats.up} Nominais</span>
          <span className="text-rose-400 font-semibold">Fila ↗</span>
        </div>
      </div>
    </section>
  );
};
