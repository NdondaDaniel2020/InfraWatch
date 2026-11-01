import React from "react";
import { Download, History } from "lucide-react";
import type { ClientSlaSummary } from "../../types/clientPortal";

export interface SlaKpiCardsProps {
  summary: ClientSlaSummary;
  onDownloadPdf?: () => void;
  onViewHistory?: () => void;
  isDownloadingPdf?: boolean;
}

export const SlaKpiCards: React.FC<SlaKpiCardsProps> = ({
  summary,
  onDownloadPdf,
  onViewHistory,
  isDownloadingPdf = false,
}) => {
  const currentUptime = summary.uptimeCurrentMonthPct;
  const targetUptime = summary.slaTargetPct;
  const excessPct = (currentUptime - targetUptime).toFixed(2);
  const isTargetMet = currentUptime >= targetUptime;
  const circumference = 2 * Math.PI * 50;
  const strokeDashoffset =
    circumference * (1 - Math.min(Math.max(currentUptime, 0), 100) / 100);

  return (
    <section
      data-testid="sla-banner"
      aria-label="Banner Executivo de Acordo de Nível de Serviço (SLA)"
      className="rounded-3xl bg-[#0d1424] border border-white/10 p-6 lg:p-8 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-8 relative overflow-hidden shadow-2xl backdrop-blur-xl"
    >
      {/* Lado Esquerdo: Gauge SVG & Resumo Executivo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 lg:gap-8">
        {/* Gauge Circular SVG */}
        <div
          data-testid="sla-gauge"
          className="relative w-36 h-36 shrink-0 flex items-center justify-center"
        >
          <svg
            className="w-36 h-36 transform -rotate-90"
            viewBox="0 0 120 120"
            role="img"
            aria-label={`Indicador circular de SLA atingindo ${summary.uptimeCurrentMonthPct}% de disponibilidade`}
          >
            <circle
              cx="60"
              cy="60"
              fill="transparent"
              r="50"
              className="stroke-[#1b2640]"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              fill="transparent"
              r="50"
              className="stroke-emerald-400 transition-all duration-1000"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              strokeWidth="8"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-mono font-extrabold text-emerald-400 tabular-nums">
              {summary.uptimeCurrentMonthPct}%
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Disponibilidade
            </span>
          </div>
        </div>

        {/* Descrição Executiva */}
        <div className="flex flex-col gap-2 max-w-xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2.5 py-0.5 rounded-full border text-xs font-mono font-semibold ${
                isTargetMet
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}
            >
              {isTargetMet ? "Meta Contratual Atingida" : "Meta Contratual Não Atingida"}
            </span>
            <span className="text-xs font-mono text-slate-400">
              Ciclo Mensal: {summary.cycleMonthLabel}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight m-0">
            Meta Acordada: {targetUptime.toFixed(2)}%{" "}
            <span
              className={`font-mono tabular-nums text-base font-semibold ${
                isTargetMet ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              ({isTargetMet ? "+" : ""}
              {excessPct}% face à meta)
            </span>
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed m-0">
            Disponibilidade apurada com base nos últimos 30 dias de telemetria contínua. As paradas
            preventivas de infraestrutura foram homologadas conforme SLA Aditivo Nº 4 (ADR-009).
          </p>
        </div>
      </div>

      {/* Lado Direito: KPIs & Ações Executivas */}
      <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-start sm:items-center lg:items-end xl:items-center gap-6 border-t lg:border-t-0 lg:border-l border-white/10 pt-6 lg:pt-0 lg:pl-8">
        {/* Pílulas de Métrica */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-3 w-full sm:w-auto">
          <div className="p-3.5 rounded-2xl bg-[#080c14] border border-white/5 flex flex-col">
            <span className="text-xs font-mono text-slate-400">Margem Downtime</span>
            <span className="text-lg font-mono font-bold text-white mt-1 tabular-nums">
              {summary.downtimeBalanceFormatted}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Saldo contratual</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#080c14] border border-white/5 flex flex-col">
            <span className="text-xs font-mono text-slate-400">MTTR Médio</span>
            <span className="text-lg font-mono font-bold text-white mt-1 tabular-nums">
              {summary.mttrMinutesAvg} min
            </span>
            <span className="text-[11px] text-slate-400 font-medium">MTTR apurado</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#080c14] border border-white/5 flex flex-col">
            <span className="text-xs font-mono text-slate-400">Próxima Janela</span>
            <span className="text-lg font-mono font-bold text-sky-400 mt-1 tabular-nums">
              {summary.nextMaintenanceWindow}
            </span>
            <span className="text-[11px] text-slate-400">Isenta de SLA</span>
          </div>
        </div>

        {/* Botões de Ação Executiva */}
        <div className="flex flex-row sm:flex-col xl:flex-col gap-2.5 w-full sm:w-auto shrink-0">
          <button
            type="button"
            data-testid="download-pdf-btn"
            onClick={onDownloadPdf}
            disabled={isDownloadingPdf}
            className="h-10 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
          >
            <Download size={16} />
            <span>{isDownloadingPdf ? "Gerando PDF..." : "Baixar Relatório (PDF)"}</span>
          </button>
          <button
            type="button"
            data-testid="history-sla-btn"
            onClick={onViewHistory}
            className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <History size={15} />
            <span>Histórico de SLA</span>
          </button>
        </div>
      </div>
    </section>
  );
};
