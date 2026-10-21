import React from "react";
import { IncidentSeverity } from "../../services/incidentsApi";

export interface IncidentFilterToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedSeverity: "all" | IncidentSeverity;
  onSeverityChange: (severity: "all" | IncidentSeverity) => void;
  selectedOrg: string;
  onOrgChange: (org: string) => void;
  counts: {
    all: number;
    critical: number;
    degraded: number;
    resolved: number;
  };
}

/**
 * Barra de Filtros e Controles Operacionais de Incidentes (Issue #32).
 * Fiel a telas_mockups/06_IncidentsPage.
 */
export const IncidentFilterToolbar: React.FC<IncidentFilterToolbarProps> = ({
  searchQuery,
  onSearchChange,
  selectedSeverity,
  onSeverityChange,
  selectedOrg,
  onOrgChange,
  counts,
}) => {
  return (
    <section
      className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-obsidian-900/60 p-3 rounded-xl border border-obsidian-800 shadow"
      role="toolbar"
      aria-label="Filtros de incidentes"
    >
      <div className="flex flex-wrap items-center gap-2.5 flex-1">
        {/* Campo de Busca Monospaced */}
        <div className="relative flex items-center bg-obsidian-950 border border-obsidian-800 rounded-lg px-3 py-1.5 w-full sm:w-80 focus-within:border-emerald-500 transition-colors">
          <span className="material-symbols-outlined text-slate-400 text-[18px] mr-2" aria-hidden="true">
            search
          </span>
          <input
            type="text"
            id="filter-search-input"
            data-testid="filter-search-input"
            aria-label="Filtrar incidentes por ativo, IP ou GLPI ID"
            placeholder="Filtrar por ativo, IP ou chamado…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent border-0 p-0 text-xs font-mono text-slate-200 placeholder-slate-500 focus:ring-0 w-full outline-none"
          />
        </div>

        {/* Pills de Severidade */}
        <div
          className="flex items-center gap-1 bg-obsidian-950 p-1 rounded-lg border border-obsidian-800 text-xs font-mono"
          role="group"
          aria-label="Filtrar por severidade"
        >
          <button
            type="button"
            data-testid="filter-severity-all"
            onClick={() => onSeverityChange("all")}
            className={`severity-btn px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
              selectedSeverity === "all"
                ? "bg-obsidian-800 text-white font-bold"
                : "text-slate-400 hover:text-white"
            }`}
            aria-pressed={selectedSeverity === "all"}
          >
            Todos ({counts.all})
          </button>
          <button
            type="button"
            data-testid="filter-severity-critical"
            onClick={() => onSeverityChange("critical")}
            className={`severity-btn px-2.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
              selectedSeverity === "critical"
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold"
                : "text-rose-400 hover:bg-obsidian-850"
            }`}
            aria-pressed={selectedSeverity === "critical"}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Críticos ({counts.critical})
          </button>
          <button
            type="button"
            data-testid="filter-severity-degraded"
            onClick={() => onSeverityChange("degraded")}
            className={`severity-btn px-2.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
              selectedSeverity === "degraded"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold"
                : "text-amber-400 hover:bg-obsidian-850"
            }`}
            aria-pressed={selectedSeverity === "degraded"}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Degradados ({counts.degraded})
          </button>
          <button
            type="button"
            data-testid="filter-severity-resolved"
            onClick={() => onSeverityChange("resolved")}
            className={`severity-btn px-2.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
              selectedSeverity === "resolved"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold"
                : "text-emerald-400 hover:bg-obsidian-850"
            }`}
            aria-pressed={selectedSeverity === "resolved"}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Resolvidos ({counts.resolved})
          </button>
        </div>
      </div>

      {/* Seletores de Organização & Período */}
      <div className="flex items-center gap-2">
        <select
          data-testid="select-organization"
          aria-label="Filtrar por organização cliente"
          value={selectedOrg}
          onChange={(e) => onOrgChange(e.target.value)}
          className="bg-obsidian-950 border border-obsidian-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:border-emerald-500 focus:ring-0 cursor-pointer outline-none"
        >
          <option value="all">Todas as Organizações (Unitel, Banco Sol, Sonangol)</option>
          <option value="Unitel Angola">Unitel Angola</option>
          <option value="Banco Sol">Banco Sol</option>
          <option value="Sonangol Logistics">Sonangol Logistics</option>
        </select>

        <div className="flex items-center gap-1.5 bg-obsidian-950 border border-obsidian-800 text-slate-300 text-xs rounded-lg px-3 py-1.5 font-mono">
          <span className="material-symbols-outlined text-[16px] text-slate-400" aria-hidden="true">
            calendar_month
          </span>
          <span>Hoje (Luanda NOC)</span>
        </div>
      </div>
    </section>
  );
};
