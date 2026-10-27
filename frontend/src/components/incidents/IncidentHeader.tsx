import React from "react";
import { Download, ExternalLink } from "lucide-react";

export type ViewState = "nominal" | "skeleton" | "empty" | "error";

export interface IncidentHeaderProps {
  viewState?: ViewState;
  onViewStateChange?: (state: ViewState) => void;
  onExportCsv: () => void;
}

/**
 * Cabeçalho e barra superior da tela de Gestão de Incidentes (Issue #32).
 * Contém o seletor canônico de estados de interface (Nominal, Skeleton, Vazio, Erro)
 * e ações rápidas globais (CSV e GLPI Helpdesk).
 */
export const IncidentHeader: React.FC<IncidentHeaderProps> = ({
  onExportCsv,
}) => {
  return (
    <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-obsidian-900 p-4 rounded-xl border border-obsidian-800 shadow-md">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" aria-hidden="true" />
          <h1 className="font-display font-bold text-lg text-white tracking-tight">
            Gestão Operacional de Incidentes
          </h1>
          <span className="px-2 py-0.5 rounded bg-obsidian-850 border border-obsidian-800 text-xs font-mono text-slate-300">
            16:50:13 WAT (Luanda)
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Triagem de alarmes em tempo real, monitoramento de falhas, SLA regressivo e integração com tickets GLPI v9.5.7.
        </p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          type="button"
          onClick={onExportCsv}
          data-testid="btn-export-csv"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-slate-200 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
        >
          <Download size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
          <span>Exportar CSV</span>
        </button>

        <a
          href="https://glpi.infrawatch.ao/front/ticket.php"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="btn-glpi-helpdesk-external"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-sky-400 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <ExternalLink size={16} className="shrink-0" aria-hidden="true" />
          <span>GLPI Helpdesk ↗</span>
        </a>
      </div>
    </section>
  );
};
