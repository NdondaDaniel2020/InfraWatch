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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    clientPortalApi
      .getSlaHistory(organizationId, selectedMonths)
      .then((items) => {
        if (isMounted) {
          setHistoryItems(items);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setHistoryItems([]);
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar o histórico de SLA."
          );
          setIsLoading(false);
        }
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
  const hasHistory = historyItems.length > 0;
  const count = historyItems.length;
  const avgUptime = hasHistory
    ? (historyItems.reduce((acc, it) => acc + it.uptimePct, 0) / count).toFixed(2)
    : null;
  const totalIncidents = historyItems.reduce(
    (acc, it) => acc + it.incidentsCount,
    0
  );
  const avgMttr = hasHistory
    ? (historyItems.reduce((acc, it) => acc + it.mttrMinutes, 0) / count).toFixed(1)
    : null;
  const compliantCycles = historyItems.filter((it) => it.status === "CONFORME").length;
  const compliancePct = hasHistory
    ? ((compliantCycles / count) * 100).toFixed(1)
    : null;
  const isFullyCompliant = hasHistory && compliantCycles === count;
  const targetPct = historyItems[0]?.targetPct;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sla-history-title"
      data-testid="sla-history-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl max-h-[94vh] overflow-y-auto bg-[#0d1424] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 flex flex-col gap-4 sm:gap-5 shadow-2xl text-slate-100 custom-scrollbar">
        {/* Cabeçalho do Modal */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-white/10 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Calendar size={16} />
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-semibold tracking-wide uppercase">
                Auditoria Histórica de SLA
              </span>
            </div>
            <h2
              id="sla-history-title"
              className="text-lg sm:text-xl font-bold text-white tracking-tight m-0"
            >
              Histórico de Desempenho e Metas • {tenantName}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 mb-0">
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
        <div className="flex items-center justify-between flex-wrap gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Janela de Análise:</span>
            <div className="flex items-center gap-1 p-1 bg-[#080c14] border border-white/10 rounded-xl">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 flex-shrink-0">
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#080c14] border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 block mb-0.5">
              Disponibilidade Média
            </span>
            <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400">
              {avgUptime !== null ? `${avgUptime}%` : "—"}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {targetPct !== undefined ? `Meta: ${targetPct.toFixed(2)}%` : "Meta indisponível"}
            </span>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-[#080c14] border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 block mb-0.5">
              Total de Ocorrências
            </span>
            <span className="text-lg sm:text-xl font-bold font-mono text-white">
              {totalIncidents}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {selectedMonths} meses observados
            </span>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-[#080c14] border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 block mb-0.5">
              MTTR Médio
            </span>
            <span className="text-lg sm:text-xl font-bold font-mono text-sky-400">
              {avgMttr !== null ? `${avgMttr}m` : "—"}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Tempo Médio de Resolução
            </span>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-[#080c14] border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-mono text-slate-400 block mb-0.5">
              Conformidade Geral
            </span>
            <span
              className={`text-lg sm:text-xl font-bold font-mono flex items-center gap-1.5 ${
                isFullyCompliant ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              <ShieldCheck size={18} />
              <span>{compliancePct !== null ? `${compliancePct}%` : "—"}</span>
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {hasHistory
                ? `${compliantCycles}/${count} ciclos conformes`
                : "Sem ciclos apurados"}
            </span>
          </div>
        </div>

        {/* Gráfico de Barras de Tendência Mensal */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#080c14] border border-white/5 flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <TrendingUp size={13} className="text-emerald-400" />
              <span>Tendência Mensal de Disponibilidade Líquida vs Meta</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {targetPct !== undefined
                ? `Linha de meta: ${targetPct.toFixed(2)}%`
                : "Linha de meta indisponível"}
            </span>
          </div>

          <div className="flex items-end justify-between gap-2.5 sm:gap-4 h-20 sm:h-24 pt-2 px-2">
            {isLoading ? (
              <span className="w-full text-center text-xs font-mono text-slate-500">
                Carregando série histórica...
              </span>
            ) : errorMessage ? (
              <span className="w-full text-center text-xs font-mono text-rose-400">
                {errorMessage}
              </span>
            ) : !hasHistory ? (
              <span className="w-full text-center text-xs font-mono text-slate-500">
                Nenhum ciclo de SLA disponível para o período.
              </span>
            ) : historyItems.map((it) => {
              const heightPct = Math.max(
                15,
                Math.min(100, (it.uptimePct - 99.0) * 100)
              );
              const isOk = it.uptimePct >= it.targetPct;

              return (
                <div
                  key={it.month}
                  className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative"
                >
                  {/* Tooltip Hover */}
                  <div className="absolute -top-7 px-2 py-0.5 rounded bg-black/95 border border-white/10 text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl">
                    {it.cycleLabel}: {it.uptimePct.toFixed(2)}% ({it.status})
                  </div>

                  <div className="w-full max-w-[40px] bg-white/5 rounded-t-lg relative overflow-hidden flex items-end h-full">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        isOk ? "bg-emerald-400" : "bg-rose-500"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 font-medium">
                    {it.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabela Cronológica de SLA - Ciclos Mensais (Ampla, Alta e Blindada contra compressão) */}
        <div className="flex flex-col gap-2 flex-shrink-0 min-h-[250px]">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-mono font-bold text-slate-300">
              Detalhamento dos Ciclos Mensais
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {historyItems.length} {historyItems.length === 1 ? "ciclo listado" : "ciclos listados"}
            </span>
          </div>

          <div className="w-full overflow-x-auto overflow-y-auto h-[230px] sm:h-[260px] rounded-xl border border-white/10 bg-[#080c14] custom-scrollbar shadow-inner">
            <table className="w-full text-left text-xs font-mono border-collapse min-w-[680px]">
              <thead className="sticky top-0 bg-[#080c14] z-10 shadow-sm border-b border-white/10">
                <tr className="text-slate-400 text-[11px]">
                  <th className="py-2.5 px-3.5 font-semibold">Mês / Ciclo</th>
                  <th className="py-2.5 px-3.5 font-semibold">Uptime Líquido</th>
                  <th className="py-2.5 px-3.5 font-semibold">Meta SLA</th>
                  <th className="py-2.5 px-3.5 font-semibold">MTTR</th>
                  <th className="py-2.5 px-3.5 font-semibold">Downtime Penalizado</th>
                  <th className="py-2.5 px-3.5 font-semibold">Isenção RFC</th>
                  <th className="py-2.5 px-3.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      Carregando série histórica de SLA...
                    </td>
                  </tr>
                ) : errorMessage ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-rose-400">
                      {errorMessage}
                    </td>
                  </tr>
                ) : !hasHistory ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      Nenhum ciclo de SLA disponível para o período selecionado.
                    </td>
                  </tr>
                ) : historyItems.map((it) => {
                  const isOk = it.status === "CONFORME";
                  return (
                    <tr
                      key={it.month}
                      className="hover:bg-white/[0.04] transition-colors"
                    >
                      <td className="py-3 px-3.5 font-bold text-white whitespace-nowrap">
                        {it.cycleLabel}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            isOk ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {it.uptimePct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-400 whitespace-nowrap">
                        {it.targetPct.toFixed(2)}%
                      </td>
                      <td className="py-3 px-3.5 text-slate-300 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-500 flex-shrink-0" />
                          <span>{it.mttrMinutes} min</span>
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-300 whitespace-nowrap">
                        {it.unplannedDowntimeMinutes} min
                      </td>
                      <td className="py-3 px-3.5 text-emerald-400 whitespace-nowrap">
                        +{it.exemptedDowntimeMinutes} min
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold ${
                            isOk
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {isOk ? (
                            <CheckCircle2 size={12} className="flex-shrink-0" />
                          ) : (
                            <XCircle size={12} className="flex-shrink-0" />
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
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10 flex-wrap gap-3 flex-shrink-0">
          <span className="text-[10px] sm:text-[11px] font-mono text-slate-500">
            Regra Contratual: Janelas de Manutenção Aprovadas com antecedência mínima de 48h não geram multas.
          </span>
          <button
            type="button"
            data-testid="history-modal-close-bottom-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-mono font-medium text-white transition-colors cursor-pointer"
          >
            Fechar Visualização
          </button>
        </div>
      </div>
    </div>
  );
};
