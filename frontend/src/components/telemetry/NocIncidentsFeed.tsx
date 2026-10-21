import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { IncidentItem } from "../../types/telemetry";
import { INITIAL_NOC_INCIDENTS } from "../../mocks/nocMocks";
import { IncidentCard } from "./IncidentCard";

export interface NocIncidentsFeedProps {
  incidents?: IncidentItem[];
  onShowToast?: (text: string, type?: "success" | "warning" | "info") => void;
}

/**
 * Container do Feed de Incidentes em Tempo Real.
 * Orquestra a listagem e delega cada incidente para o componente individual IncidentCard.
 */
export const NocIncidentsFeed: React.FC<NocIncidentsFeedProps> = ({
  incidents = INITIAL_NOC_INCIDENTS,
  onShowToast,
}) => {
  const p1Count = incidents.filter((i) => i.severity === "critical").length;

  return (
    <section
      data-testid="incident-feed-card"
      className="bg-obsidian-900 rounded-xl p-5 border border-obsidian-800 flex flex-col gap-4 shadow-sm"
      aria-label="Feed de Incidentes em Tempo Real"
    >
      {/* Header do Feed com contagem dinâmica baseada nos dados */}
      <div className="flex items-center justify-between border-b border-obsidian-800 pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-rose-400" aria-hidden="true" />
          <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider m-0">
            Incident Feed (Ao Vivo)
          </h3>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 tabular-nums">
          {p1Count} P1 ATIVO
        </span>
      </div>

      {/* Lista de Incidentes delegando para o componente que recebe o dado */}
      <div className="space-y-3 font-mono">
        {incidents.map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            onShowToast={onShowToast}
          />
        ))}
      </div>

      <Link
        to="/incidents"
        className="w-full py-2 bg-obsidian-850 hover:bg-obsidian-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono font-medium border border-obsidian-800 transition-colors flex items-center justify-center gap-1.5"
      >
        <span>Abrir Gestão Completa de Incidentes</span>
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
};
