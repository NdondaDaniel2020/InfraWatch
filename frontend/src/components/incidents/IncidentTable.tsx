import React from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronRight } from "lucide-react";
import { IncidentItem } from "../../services/incidentsApi";
import { GlpiBadge } from "./GlpiBadge";
import { ViewState } from "./IncidentHeader";

export interface IncidentTableProps {
  incidents: IncidentItem[];
  selectedIds: Set<string>;
  allFilteredSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleRow: (id: string) => void;
  onAckClick: (incident: IncidentItem) => void;
  onResolveClick: (incident: IncidentItem) => void;
  onForensicClick: (incident: IncidentItem) => void;
  onOpenDrawer: (incident: IncidentItem) => void;
  onOpenGlpiTicket: (incidentId: string) => Promise<void> | void;
  isOpeningGlpiId: string | null;
  viewState: ViewState;
  onResetEmptyState: () => void;
}

/**
 * Tabela Operacional de Alta Densidade de Incidentes (Issue #32).
 * Fiel a telas_mockups/06_IncidentsPage.
 */
export const IncidentTable: React.FC<IncidentTableProps> = ({
  incidents,
  selectedIds,
  allFilteredSelected,
  onToggleSelectAll,
  onToggleRow,
  onAckClick,
  onResolveClick,
  onForensicClick,
  onOpenDrawer,
  onOpenGlpiTicket,
  isOpeningGlpiId,
  viewState,
  onResetEmptyState,
}) => {
  return (
    <section
      className="bg-obsidian-900 rounded-xl border border-obsidian-800 overflow-hidden shadow-xl"
      aria-label="Tabela de Incidentes Operacionais"
    >
      {/* ESTADO VAZIO */}
      {(viewState === "empty" || incidents.length === 0) && viewState !== "skeleton" ? (
        <div
          data-testid="empty-state-container"
          className="py-16 px-4 text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 size={32} className="shrink-0" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-bold text-base text-white">
              Nenhum Incidente Ativo no Momento
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Todos os 48 equipamentos e links do cluster <strong className="text-emerald-400 font-mono">LUANDA-01</strong> estão operando com telemetria nominal e latências abaixo de 20ms.
            </p>
          </div>
          <button
            type="button"
            data-testid="btn-empty-reset"
            onClick={onResetEmptyState}
            className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-200 text-xs font-mono transition-colors cursor-pointer"
          >
            Recarregar Dados Reais
          </button>
        </div>
      ) : viewState === "skeleton" ? (
        /* SKELETON LOADER */
        <div data-testid="skeleton-state-container" className="p-6 space-y-4 animate-pulse">
          <div className="h-6 bg-obsidian-800/60 rounded w-1/4" />
          <div className="space-y-3">
            <div className="h-12 bg-obsidian-800/40 rounded w-full" />
            <div className="h-12 bg-obsidian-800/40 rounded w-full" />
            <div className="h-12 bg-obsidian-800/40 rounded w-full" />
            <div className="h-12 bg-obsidian-800/40 rounded w-full" />
          </div>
        </div>
      ) : (
        /* TABELA REAL DE DADOS */
        <div className="overflow-x-auto" id="table-wrapper">
          <table className="w-full text-left border-collapse" id="incidents-table" data-testid="incidents-table">
            <caption className="sr-only">Lista de incidentes operacionais de telemetria</caption>
            <thead>
              <tr className="bg-obsidian-950 border-b border-obsidian-800 text-slate-400 font-mono tabular-nums text-xs uppercase tracking-wider">
                <th scope="col" className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    id="select-all-checkbox"
                    data-testid="select-all-checkbox"
                    checked={allFilteredSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Selecionar todos os incidentes visíveis"
                    className="rounded bg-obsidian-900 border-obsidian-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-obsidian-950 cursor-pointer"
                  />
                </th>
                <th scope="col" className="py-3 px-4">Severidade</th>
                <th scope="col" className="py-3 px-4">Ativo Afetado</th>
                <th scope="col" className="py-3 px-4">Cliente / Org</th>
                <th scope="col" className="py-3 px-4">Início (WAT)</th>
                <th scope="col" className="py-3 px-4">Duração &amp; SLA</th>
                <th scope="col" className="py-3 px-4">Chamado GLPI</th>
                <th scope="col" className="py-3 px-4">Responsável</th>
                <th scope="col" className="py-3 px-4 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-800/60 text-xs" id="incidents-tbody">
              {incidents.map((incident) => {
                const isCritical = incident.severity === "critical";
                const isDegraded = incident.severity === "degraded";
                const isResolved = incident.severity === "resolved";

                const borderClass = isCritical
                  ? "border-l-4 border-l-rose-500 bg-rose-500/5 hover:bg-rose-500/10"
                  : isDegraded
                  ? "border-l-4 border-l-amber-500 bg-amber-500/5 hover:bg-amber-500/10"
                  : "border-l-4 border-l-emerald-500 hover:bg-obsidian-850/50";

                return (
                  <tr
                    key={incident.id}
                    data-testid={`incident-row-${incident.id}`}
                    data-severity={incident.severity}
                    className={`incident-row transition-colors ${borderClass}`}
                  >
                    <td className="py-3.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(incident.id)}
                        onChange={() => onToggleRow(incident.id)}
                        aria-label={`Selecionar incidente ${incident.code}`}
                        data-testid={`checkbox-incident-${incident.id}`}
                        className="incident-checkbox rounded bg-obsidian-900 border-obsidian-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-obsidian-950 cursor-pointer"
                      />
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {isCritical && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" aria-hidden="true" />
                          {incident.priority_label}
                        </span>
                      )}
                      {isDegraded && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" />
                          {incident.priority_label}
                        </span>
                      )}
                      {isResolved && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <Check size={14} className="shrink-0" aria-hidden="true" />
                          {incident.priority_label}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenDrawer(incident)}
                            className="font-mono tabular-nums font-bold text-sm text-white hover:text-emerald-400 transition-colors text-left cursor-pointer"
                          >
                            {incident.target_device.name}
                          </button>
                          <span className="bg-obsidian-850 text-slate-400 px-1.5 py-0.2 rounded text-[11px] font-mono">
                            {incident.target_device.model}
                          </span>
                        </div>
                        <div className="mt-0.5">
                          <span className="font-mono text-[11px] text-emerald-400 bg-obsidian-950 px-1.5 py-0.2 rounded border border-emerald-500/20">
                            {incident.target_device.ip}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{incident.organization_name}</div>
                      <div className="text-slate-400 text-[11px] font-mono">{incident.target_device.location || "NOC Core"}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-mono text-slate-200 font-semibold">{incident.started_at}</div>
                      <div className="text-slate-400 text-[11px]">{incident.code}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span
                          className={`font-mono tabular-nums font-bold text-sm ${
                            isCritical ? "text-rose-400" : isDegraded ? "text-amber-400" : "text-emerald-400"
                          }`}
                        >
                          {incident.duration_str}
                        </span>
                        <span
                          className={`font-mono text-[11px] ${
                            isCritical ? "text-rose-400 font-semibold animate-pulse" : "text-slate-400"
                          }`}
                        >
                          {incident.sla_remaining_str}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <GlpiBadge
                        ticketId={incident.glpi_ticket_id}
                        incidentId={incident.id}
                        onOpenTicket={onOpenGlpiTicket}
                        isOpening={isOpeningGlpiId === incident.id}
                        isClosed={incident.status === "RESOLVED"}
                      />
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {incident.assigned_operator ? (
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-obsidian-850 border border-obsidian-700 text-emerald-400 flex items-center justify-center font-mono font-bold text-[10px]">
                            {incident.assigned_operator.initials}
                          </div>
                          <span className="text-xs text-slate-300">
                            {incident.assigned_operator.name}
                          </span>
                        </div>
                      ) : (
                        <span
                          data-testid={`resp-badge-pending-${incident.id}`}
                          className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-mono"
                        >
                          <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
                          Pendente
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {incident.status === "TRIGGERED" && (
                          <button
                            type="button"
                            data-testid={`btn-ack-${incident.id}`}
                            onClick={() => onAckClick(incident)}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-md text-xs transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer shadow"
                          >
                            Reconhecer (Ack)
                          </button>
                        )}

                        {incident.status === "ACKNOWLEDGED" && (
                          <button
                            type="button"
                            data-testid={`btn-resolve-${incident.id}`}
                            onClick={() => onResolveClick(incident)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1 rounded-md text-xs transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer shadow"
                          >
                            Resolver
                          </button>
                        )}

                        {incident.status === "RESOLVED" && (
                          <button
                            type="button"
                            data-testid={`btn-forensic-${incident.id}`}
                            onClick={() => onForensicClick(incident)}
                            className="border border-obsidian-700 hover:bg-obsidian-850 text-slate-300 px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer"
                          >
                            Relatório Forense
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onOpenDrawer(incident)}
                          data-testid={`btn-open-drawer-${incident.id}`}
                          className="bg-obsidian-850 hover:bg-obsidian-800 text-slate-200 p-1.5 rounded-md border border-obsidian-700 transition-colors cursor-pointer"
                          title="Abrir Slide-Over Drawer de Detalhes"
                          aria-label={`Abrir detalhes do incidente ${incident.code}`}
                        >
                          <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
