import React from "react";
import { ShieldCheck, Clock, HardDrive, Cloud } from "lucide-react";
import { BackupMetricsSummary } from "../../types/backup";

interface BackupMetricsCardsProps {
  metrics: BackupMetricsSummary;
}

export const BackupMetricsCards: React.FC<BackupMetricsCardsProps> = ({ metrics }) => {
  return (
    <div
      data-testid="backup-metrics-cards"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {/* 1. RPO (Recovery Point Objective) */}
      <div className="bg-obsidian-900 border border-obsidian-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase text-slate-400 font-semibold">
            RPO (OBJETIVO DE PONTO)
          </span>
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-mono tabular-nums font-bold text-white">
              {typeof metrics.rpoCurrentMinutes === "number"
                ? `${metrics.rpoCurrentMinutes}m`
                : "N/D"}
            </span>
            {typeof metrics.rpoTargetMinutes === "number" && (
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                / {metrics.rpoTargetMinutes}m máx
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Tempo decorrido desde o último snapshot</span>
          </div>
        </div>
      </div>

      {/* 2. RTO (Recovery Time Objective) */}
      <div className="bg-obsidian-900 border border-obsidian-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase text-slate-400 font-semibold">
            RTO (TEMPO DE RESTAURAÇÃO)
          </span>
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/30">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-mono tabular-nums font-bold text-white">
              {typeof metrics.rtoTargetMinutes === "number"
                ? `< ${metrics.rtoTargetMinutes}m`
                : "N/D"}
            </span>
            <span className="text-xs font-mono text-slate-400">Alvo de DR</span>
          </div>
          <p className="mt-1 text-[11px] font-mono text-slate-400 truncate">
            Métrica de restauração não exposta pelo backend
          </p>
        </div>
      </div>

      {/* 3. Último Ponto Consolidado */}
      <div className="bg-obsidian-900 border border-obsidian-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase text-slate-400 font-semibold">
            ÚLTIMO BACKUP ÍNTEGRO
          </span>
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2.5">
          <span className="text-base font-mono tabular-nums font-bold text-white block truncate">
            {metrics.lastBackupAt
              ? `${new Date(metrics.lastBackupAt).toLocaleString("pt-BR", {
                  timeZone: "UTC",
                  dateStyle: "short",
                  timeStyle: "short",
                })} UTC`
              : "N/D"}
          </span>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-slate-400">
            <span>
              {metrics.lastBackupAt
                ? "Snapshot mais recente no storage"
                : "Nenhum snapshot registrado"}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Armazenamento Dual-Cloud */}
      <div className="bg-obsidian-900 border border-obsidian-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase text-slate-400 font-semibold">
            ARMAZENAMENTO EM NUVEM
          </span>
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Cloud className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-mono tabular-nums font-bold text-white">
              {metrics.totalStorageUsed}
            </span>
            <span className="text-xs font-mono text-slate-400">
              ({metrics.totalBackupsCount} snapshots)
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
            <span className="text-slate-400">
              Volume e contagem derivados do histórico local
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
