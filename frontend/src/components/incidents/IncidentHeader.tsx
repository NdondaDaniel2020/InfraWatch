import React from "react";

export type ViewState = "nominal" | "skeleton" | "empty" | "error";

export interface IncidentHeaderProps {
  viewState: ViewState;
  onViewStateChange: (state: ViewState) => void;
  onExportCsv: () => void;
}

/**
 * Cabeçalho e barra superior da tela de Gestão de Incidentes (Issue #32).
 * Contém o seletor canônico de estados de interface (Nominal, Skeleton, Vazio, Erro)
 * e ações rápidas globais (CSV e GLPI Helpdesk).
 */
export const IncidentHeader: React.FC<IncidentHeaderProps> = ({
  viewState,
  onViewStateChange,
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
        {/* Seletor de Estados Canônico (Nominal, Skeleton, Empty, Error) */}
        <div
          className="flex items-center gap-1 bg-obsidian-950 p-1 rounded-lg border border-obsidian-800 text-xs font-mono"
          role="group"
          aria-label="Alternar estados de interface para auditoria"
        >
          <span className="text-slate-500 px-2 text-[11px] uppercase tracking-wider font-semibold">
            Estado:
          </span>
          <button
            type="button"
            onClick={() => onViewStateChange("nominal")}
            data-testid="state-btn-nominal"
            className={`px-2 py-1 rounded font-semibold transition-colors cursor-pointer ${
              viewState === "nominal"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-white hover:bg-obsidian-850"
            }`}
          >
            Nominal
          </button>
          <button
            type="button"
            onClick={() => onViewStateChange("skeleton")}
            data-testid="state-btn-skeleton"
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              viewState === "skeleton"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-obsidian-850"
            }`}
          >
            Skeleton
          </button>
          <button
            type="button"
            onClick={() => onViewStateChange("empty")}
            data-testid="state-btn-empty"
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              viewState === "empty"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-obsidian-850"
            }`}
          >
            Vazio
          </button>
          <button
            type="button"
            onClick={() => onViewStateChange("error")}
            data-testid="state-btn-error"
            className={`px-2 py-1 rounded transition-colors cursor-pointer ${
              viewState === "error"
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold"
                : "text-slate-400 hover:text-white hover:bg-obsidian-850"
            }`}
          >
            Erro SSE
          </button>
        </div>

        <button
          type="button"
          onClick={onExportCsv}
          data-testid="btn-export-csv"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-slate-200 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px] text-slate-400" aria-hidden="true">
            download
          </span>
          <span>Exportar CSV</span>
        </button>

        <a
          href="https://glpi.infrawatch.ao/front/ticket.php"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="btn-glpi-helpdesk-external"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-sky-400 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            open_in_new
          </span>
          <span>GLPI Helpdesk ↗</span>
        </a>
      </div>
    </section>
  );
};
