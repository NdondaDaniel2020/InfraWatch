import React from "react";
import { Check, CheckCircle2, X } from "lucide-react";
import { IncidentItem } from "../../services/incidentsApi";
import { GlpiBadge } from "./GlpiBadge";
import { IncidentTimeline } from "./IncidentTimeline";

export interface IncidentDetailDrawerProps {
  incident: IncidentItem | null;
  onClose: () => void;
  onAckClick: (incident: IncidentItem) => void;
  onResolveClick: (incident: IncidentItem) => void;
  onOpenGlpiTicket: (incidentId: string) => Promise<void> | void;
  isOpeningGlpiId: string | null;
}

/**
 * Slide-Over Drawer de Detalhes do Incidente (Issue #32).
 * Fiel a telas_mockups/14_IncidentDetailDrawer.
 */
export const IncidentDetailDrawer: React.FC<IncidentDetailDrawerProps> = ({
  incident,
  onClose,
  onAckClick,
  onResolveClick,
  onOpenGlpiTicket,
  isOpeningGlpiId,
}) => {
  if (!incident) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" data-testid="incident-drawer-container">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed top-0 right-0 h-full w-[600px] max-w-[96vw] bg-obsidian-900 border-l border-obsidian-800 shadow-2xl flex flex-col font-sans text-slate-100 overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Header da Gaveta */}
        <header className="px-6 pt-5 pb-4 border-b border-obsidian-800 bg-obsidian-950/60 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <span>Incidentes</span>
                <span className="text-slate-600">/</span>
                <span className="text-slate-200 font-semibold">{incident.code}</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold ${
                    incident.severity === "critical"
                      ? "bg-rose-500/15 text-rose-300 border border-rose-500/25"
                      : incident.severity === "degraded"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                  }`}
                >
                  {incident.priority_label}
                </span>
              </div>

              <h2 id="drawer-title" className="text-lg font-bold text-white tracking-tight leading-snug">
                {incident.title}
              </h2>

              <div className="flex items-center gap-2.5 text-xs font-mono text-slate-400 pt-0.5">
                <span className="text-slate-300">{incident.organization_name}</span>
                <span className="text-slate-600">•</span>
                <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Duração: {incident.duration_str}
                </span>
              </div>
            </div>

            <button
              type="button"
              data-testid="btn-close-drawer"
              aria-label="Fechar gaveta de detalhes do incidente"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-obsidian-850 hover:text-white transition-colors shrink-0 cursor-pointer text-slate-400"
            >
              <X size={20} className="shrink-0" aria-hidden="true" />
            </button>
          </div>

          {/* Barra de Ações Operacionais */}
          <div className="flex items-center gap-2.5 mt-4">
            {incident.status === "TRIGGERED" && (
              <button
                type="button"
                onClick={() => {
                  onAckClick(incident);
                  onClose();
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-3.5 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-colors shadow-sm cursor-pointer"
              >
                <Check size={16} className="shrink-0" aria-hidden="true" />
                <span>Reconhecer (Ack)</span>
              </button>
            )}

            {incident.status === "ACKNOWLEDGED" && (
              <button
                type="button"
                onClick={() => {
                  onResolveClick(incident);
                  onClose();
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3.5 rounded-lg flex items-center justify-center gap-1.5 text-xs transition-colors shadow-sm cursor-pointer"
              >
                <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                <span>Resolver Incidente</span>
              </button>
            )}

            <GlpiBadge
              ticketId={incident.glpi_ticket_id}
              incidentId={incident.id}
              onOpenTicket={onOpenGlpiTicket}
              isOpening={isOpeningGlpiId === incident.id}
              isClosed={incident.status === "RESOLVED"}
            />
          </div>
        </header>

        {/* Corpo da Gaveta com a Linha do Tempo e Diagnóstico */}
        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-obsidian-900">
          <IncidentTimeline
            events={incident.timeline}
            targetDeviceName={incident.target_device.name}
            targetDeviceIp={incident.target_device.ip}
          />
        </main>
      </aside>
    </div>
  );
};
