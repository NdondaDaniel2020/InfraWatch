import React from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink } from "lucide-react";
import { getGlpiHelpdeskUrl } from "../../utils/glpi";

export type ViewState = "nominal" | "skeleton" | "empty" | "error";

export interface IncidentHeaderProps {
  viewState?: ViewState;
  onViewStateChange?: (state: ViewState) => void;
  onExportCsv: () => void;
}

/**
 * Cabeçalho e barra superior da tela de Gestão de Incidentes (Issue #32).
 * Contém o breadcrumb tático, título padronizado 2xl e ações rápidas (CSV e GLPI Helpdesk).
 */
export const IncidentHeader: React.FC<IncidentHeaderProps> = ({
  onExportCsv,
}) => {
  return (
    <header
      data-testid="incident-header"
      className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-obsidian-800"
    >
      <div className="flex flex-col gap-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono">
          <Link
            to="/noc"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cockpit NOC
          </Link>
          <span className="text-obsidian-700">/</span>
          <span className="text-rose-400 font-semibold">
            Incidentes &amp; Alarmes
          </span>
        </nav>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" aria-hidden="true" />
          <h1 className="text-2xl font-display font-extrabold text-white tracking-tight">
            Gestão Operacional de Incidentes
          </h1>
          <span className="px-2 py-0.5 rounded bg-obsidian-900 border border-obsidian-800 text-xs font-mono text-slate-300">
            16:50:13 WAT (Luanda)
          </span>
        </div>
        <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
          Triagem de alarmes em tempo real, monitoramento de falhas, SLA regressivo e integração com tickets GLPI v9.5.7.
        </p>
      </div>

      <div className="flex items-center flex-wrap gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onExportCsv}
          data-testid="btn-export-csv"
          className="h-9 px-3 rounded-lg bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-800 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
        >
          <Download size={15} className="text-slate-400 shrink-0" aria-hidden="true" />
          <span>Exportar CSV</span>
        </button>

        <a
          href={getGlpiHelpdeskUrl()}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="btn-glpi-helpdesk-external"
          className="h-9 px-3.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:text-sky-300 text-xs font-medium flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <ExternalLink size={15} className="shrink-0" aria-hidden="true" />
          <span>GLPI Helpdesk ↗</span>
        </a>
      </div>
    </header>
  );
};
