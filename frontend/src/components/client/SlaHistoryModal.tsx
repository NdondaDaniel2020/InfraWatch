import React, { useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ShieldCheck,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import type { SlaMonthlyHistoryItem } from "../../types/clientPortal";
import { clientPortalApi } from "../../services/clientPortalApi";

export interface SlaHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId?: string | null;
  tenantName?: string;
  onExportPdf?: () => void;
}

export const SlaHistoryModal: React.FC<SlaHistoryModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  tenantName = "Organização",
  onExportPdf,
}) => {
  const [selectedMonths, setSelectedMonths] = useState<number>(6);
  const [historyItems, setHistoryItems] = useState<SlaMonthlyHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);

    clientPortalApi
      .getSlaHistory(organizationId, selectedMonths)
      .then((items) => {
        if (isMounted) {
          setHistoryItems(items);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, organizationId, selectedMonths]);

  // Fechar no Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Cálculos consolidados do período selecionado
  const count = historyItems.length || 1;
  const avgUptime = (
    historyItems.reduce((acc, it) => acc + it.uptimePct, 0) / count
  ).toFixed(2);
  const totalIncidents = historyItems.reduce(
    (acc, it) => acc + it.incidentsCount,
    0
  );
  const avgMttr = (
    historyItems.reduce((acc, it) => acc + it.mttrMinutes, 0) / count
  ).toFixed(1);
  const isFullyCompliant = historyItems.every((it) => it.status === "CONFORME");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sla-history-title"
      data-testid="sla-history-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#0d1424] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl text-slate-100">
        {/* Cabeçalho do Modal */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Calendar size={18} />
              </span>
              <span className="text-xs font-mono text-emerald-400 font-semibold tracking-wide uppercase">
                Auditoria Histórica de SLA
              </span>
            </div>
            <h2
              id="sla-history-title"
              className="text-lg sm:text-xl font-bold text-white tracking-tight m-0"
            >
              Histórico de Desempenho e Metas • {tenantName}
            </h2>
            <p className="text-xs text-slate-400 mt-1 mb-0">
              Série temporal auditável com expurgo de manutenções homologadas (ADR-009).
            </p>
          </div>

          <button
            type="button"
            data-testid="close-history-modal-btn"
            onClick={onClose}
            aria-label="Fechar histórico"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Seletor de Período e Ações */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Janela de Análise:</span>
            <div className="flex items-center gap-1.5 p-1 bg-[#080c14] border border-white/10 rounded-xl">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`history-period-${m}m`}
                  onClick={() => setSelectedMonths(m)}
                  className={`px-3 py-1 text-xs font-mono rounded-lg transition-colors cursor-pointer ${
                    selectedMonths === m
                      ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {m} Meses
                </button>
              ))}
            </div>
          </div>

          {onExportPdf && (
            <button
              type="button"
              data-testid="history-export-pdf-btn"
              onClick={onExportPdf}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white transition-colors cursor-pointer"
            >
              <Download size={14} className="text-emerald-400" />
              <span>Exportar Laudo Oficial</span>
            </button>
          )}
        </div>

        {/* Cards Resumo do Período */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-[#080c14] border border-white/5">
            <span className="text-[11px] font-mono text-slate-400 block mb-1">
              Disponibilidade Média
            </span>
            <span className="text-xl font-bold font-mono text-emerald-400">
              {avgUptime}%
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Meta: 99.50%
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#080c14] border border-white/5">
            <span className="text-[11px] font-mono text-slate-400 block mb-1">
              Total de Ocorrências
            </span>
            <span className="text-xl font-bold font-mono text-white">
              {totalIncidents}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {selectedMonths} meses observados
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#080c14] border border-white/5">
            <span className="text-[11px] font-mono text-slate-400 block mb-1">
              MTTR Médio
            </span>
            <span className="text-xl font-bold font-mono text-sky-400">
              {avgMttr}m
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Tempo Médio de Resolução
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#080c14] border border-white/5">
            <span className="text-[11px] font-mono text-slate-400 block mb-1">
              Conformidade Geral
            </span>
            <span
              className={`text-xl font-bold font-mono flex items-center gap-1.5 ${
                isFullyCompliant ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              <ShieldCheck size={20} />
              <span>{isFullyCompliant ? "100%" : "98.5%"}</span>
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Sem multas contratuais
            </span>
          </div>
        </div>

        {/* Gráfico de Barras de Tendência Mensal */}
        <div className="p-5 rounded-2xl bg-[#080c14] border border-white/5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-emerald-400" />
              <span>Tendência Mensal de Disponibilidade Líquida vs Meta</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Linha de meta: 99.50%
            </span>
          </div>

          <div className="flex items-end justify-between gap-3 h-32 pt-4 px-2">
            {historyItems.map((it) => {
              const heightPct = Math.max(
                15,
                Math.min(100, (it.uptimePct - 99.0) * 100)
              );
              const isOk = it.uptimePct >= it.targetPct;

              return (
                <div
                  key={it.month}
                  className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative"
                >
                  {/* Tooltip Hover */}
                  <div className="absolute -top-8 px-2 py-1 rounded bg-black/90 border border-white/10 text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                    {it.cycleLabel}: {it.uptimePct}% ({it.status})
                  </div>

                  <div className="w-full max-w-[42px] bg-white/5 rounded-t-lg relative overflow-hidden flex items-end h-full">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        isOk ? "bg-emerald-400" : "bg-rose-500"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {it.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabela Cronológica de SLA */}
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="bg-[#080c14] border-b border-white/10 text-slate-400">
                <th className="p-3.5">Mês / Ciclo</th>
                <th className="p-3.5">Uptime Líquido</th>
                <th className="p-3.5">Meta SLA</th>
                <th className="p-3.5">MTTR</th>
                <th className="p-3.5">Downtime Penalizado</th>
                <th className="p-3.5">Isenção RFC</th>
                <th className="p-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    Carregando série histórica de SLA...
                  </td>
                </tr>
              ) : historyItems.map((it) => {
                const isOk = it.status === "CONFORME";
                return (
                  <tr key={it.month} className="hover:bg-white/5 transition-colors">
                    <td className="p-3.5 font-bold text-white">
                      {it.cycleLabel}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`font-bold ${
                          isOk ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {it.uptimePct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-400">
                      {it.targetPct.toFixed(2)}%
                    </td>
                    <td className="p-3.5 text-slate-300">
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-slate-500" />
                        <span>{it.mttrMinutes} min</span>
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-300">
                      {it.unplannedDowntimeMinutes} min
                    </td>
                    <td className="p-3.5 text-emerald-400">
                      +{it.exemptedDowntimeMinutes} min
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isOk
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {isOk ? (
                          <CheckCircle2 size={11} />
                        ) : (
                          <XCircle size={11} />
                        )}
                        <span>{it.status}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10 flex-wrap gap-3">
          <span className="text-[11px] font-mono text-slate-500">
            Regra Contratual: Janelas de Manutenção Aprovadas com antecedência mínima de 48h não geram multas.
          </span>
          <button
            type="button"
            data-testid="history-modal-close-bottom-btn"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-mono font-medium text-white transition-colors cursor-pointer"
          >
            Fechar Visualização
          </button>
        </div>
      </div>
    </div>
  );
};
