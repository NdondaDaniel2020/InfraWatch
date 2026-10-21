import React from "react";
import { Link } from "react-router-dom";
import type { IncidentItem, IncidentSeverity } from "../../types/telemetry";

export interface IncidentVisualConfig {
  borderLeft: string;
  badgeClass: string;
  footerTextColor: string;
}

/**
 * Dicionário declarativo de apresentação orientada a dados (State-Driven Component Pattern).
 * A severidade do incidente dita suas bordas, badge e cores, eliminando lógica condicional inline.
 */
export const INCIDENT_VISUALS: Record<IncidentSeverity, IncidentVisualConfig> = {
  critical: {
    borderLeft: "border-l-2 border-rose-500",
    badgeClass: "bg-rose-500/20 text-rose-400 border border-rose-500/40",
    footerTextColor: "text-rose-400 font-bold",
  },
  warning: {
    borderLeft: "border-l-2 border-amber-500",
    badgeClass: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
    footerTextColor: "text-amber-400 font-semibold",
  },
  info: {
    borderLeft: "border-l-2 border-sky-500",
    badgeClass: "bg-sky-500/20 text-sky-400 border border-sky-500/40",
    footerTextColor: "text-sky-400 font-semibold",
  },
};

export interface IncidentCardProps {
  incident: IncidentItem;
  onShowToast?: (text: string, type?: "success" | "warning" | "info") => void;
}

/**
 * Componente individual de incidente preparado para receber dados (Data-Driven Component).
 * Recebe o objeto de incidente e define sua aparência e ações estritamente a partir do dado recebido.
 */
export const IncidentCard: React.FC<IncidentCardProps> = ({
  incident,
  onShowToast,
}) => {
  const visuals = INCIDENT_VISUALS[incident.severity] || INCIDENT_VISUALS.info;

  return (
    <div
      data-testid={`incident-card-${incident.id}`}
      className={`p-3 rounded-lg bg-obsidian-950 ${visuals.borderLeft} border-r border-t border-b border-obsidian-800 flex flex-col gap-2`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${visuals.badgeClass}`}
          >
            {incident.priorityLabel}
          </span>
          <h4 className="text-xs font-bold text-slate-100 mt-1">
            {incident.title}
          </h4>
        </div>
        <span className="text-[10px] text-slate-400 tabular-nums">
          {incident.timeAgo}
        </span>
      </div>

      <p className="text-[11px] text-slate-400 font-sans leading-relaxed m-0">
        {incident.description}
      </p>

      <div className="flex items-center justify-between pt-2 border-t border-obsidian-800/80 text-[10px]">
        <span className={visuals.footerTextColor}>
          {incident.slaOrStatusText}
        </span>

        {incident.actionType === "ack_resolve" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onShowToast?.(
                  `Incidente #${incident.ticketId} reconhecido por ${incident.operatorName || "Operador"}.`,
                  "info"
                )
              }
              className="text-slate-300 hover:text-white underline cursor-pointer"
            >
              ACK
            </button>
            <button
              type="button"
              onClick={() =>
                onShowToast?.(
                  `Protocolo de resolução do incidente #${incident.ticketId} iniciado.`,
                  "success"
                )
              }
              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-obsidian-950 font-bold transition-colors cursor-pointer"
            >
              Resolver
            </button>
          </div>
        ) : (
          <Link to="/incidents" className="text-sky-400 hover:underline">
            Ver Timeline ↗
          </Link>
        )}
      </div>
    </div>
  );
};
