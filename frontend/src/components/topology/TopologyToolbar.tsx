import React from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Building2,
} from "lucide-react";

export type TopologyStateSimulation = "nominal" | "skeleton" | "empty" | "error";

export interface TopologyCategoryCounts {
  all: number;
  router: number;
  switch: number;
  workload: number;
}

export interface OrganizationOption {
  id: string;
  name: string;
  slug?: string;
}

interface TopologyToolbarProps {
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  zoomLevel: number;
  isInspectorOpen: boolean;
  onToggleInspector: () => void;
  categoryCounts?: TopologyCategoryCounts;
  organizations?: OrganizationOption[];
  selectedOrgId?: string | null;
  onSelectOrgId?: (orgId: string) => void;
  isGlobalOperator?: boolean;
  userOrgName?: string | null;
  isLoadingOrganizations?: boolean;
}

export const TopologyToolbar: React.FC<TopologyToolbarProps> = ({
  categoryFilter,
  onCategoryFilterChange,
  onZoomIn,
  onZoomOut,
  onFitView,
  zoomLevel,
  isInspectorOpen,
  onToggleInspector,
  categoryCounts,
  organizations = [],
  selectedOrgId,
  onSelectOrgId,
  isGlobalOperator = false,
  userOrgName,
  isLoadingOrganizations = false,
}) => {
  return (
    <header
      data-testid="topology-toolbar"
      className="h-11 bg-obsidian-900/90 backdrop-blur border-b border-obsidian-800 px-4 flex items-center justify-between shrink-0 z-30 select-none"
    >
      {/* Esquerda: Breadcrumb NOC & Seletor de Organização */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
          <span>NOC</span>
          <span className="text-slate-600">/</span>
          <span className="text-emerald-400 font-semibold">TOPOLOGIA</span>
        </div>
        <span className="h-3.5 w-px bg-obsidian-800 hidden sm:inline" />
        <span className="text-xs font-sans text-slate-300 font-medium hidden sm:inline">
          Grafo Interativo de Enlaces &amp; Tráfego
        </span>

        {/* Seletor de Organização (Multi-Tenant) */}
        {isGlobalOperator && organizations.length > 0 ? (
          <div className="flex items-center gap-1.5 bg-obsidian-950 px-2 py-0.5 rounded border border-obsidian-800 hover:border-obsidian-700 transition-colors">
            <Building2 size={13} className="text-emerald-400 shrink-0" />
            <select
              aria-label="Selecionar Organização"
              data-testid="topology-org-select"
              value={selectedOrgId || ""}
              onChange={(e) => onSelectOrgId?.(e.target.value)}
              disabled={isLoadingOrganizations}
              className="bg-transparent text-slate-200 text-xs font-mono outline-none cursor-pointer max-w-[170px] sm:max-w-[210px] truncate"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id} className="bg-obsidian-950 text-slate-200">
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 bg-obsidian-950 px-2 py-0.5 rounded border border-obsidian-800">
            <Building2 size={13} className="text-slate-400 shrink-0" />
            <span className="font-semibold text-emerald-400 truncate max-w-[180px]">
              {userOrgName || organizations[0]?.name || "Organização"}
            </span>
          </div>
        )}

        <span className="hidden xl:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LLDP/CDP Sincronizado
        </span>
      </div>

      {/* Direita: Filtros de Categoria, Seletor de Estados e Controles de Zoom */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Filtros de Categoria */}
        <div
          className="hidden xl:flex items-center gap-1 bg-obsidian-950 p-0.5 rounded-lg border border-obsidian-800 text-[11px] font-mono"
          role="group"
          aria-label="Filtro de Ativos"
        >
          <button
            type="button"
            onClick={() => onCategoryFilterChange("all")}
            className={`px-2 py-0.5 rounded transition-colors ${
              categoryFilter === "all"
                ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Todos {categoryCounts ? `(${categoryCounts.all})` : ""}
          </button>
          <button
            type="button"
            onClick={() => onCategoryFilterChange("router")}
            className={`px-2 py-0.5 rounded transition-colors ${
              categoryFilter === "router"
                ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Roteadores {categoryCounts ? `(${categoryCounts.router})` : ""}
          </button>
          <button
            type="button"
            onClick={() => onCategoryFilterChange("switch")}
            className={`px-2 py-0.5 rounded transition-colors ${
              categoryFilter === "switch"
                ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Switches {categoryCounts ? `(${categoryCounts.switch})` : ""}
          </button>
          <button
            type="button"
            onClick={() => onCategoryFilterChange("workload")}
            className={`px-2 py-0.5 rounded transition-colors ${
              categoryFilter === "workload"
                ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            DB / API {categoryCounts ? `(${categoryCounts.workload})` : ""}
          </button>
        </div>

        {/* Controles de Zoom & Viewport */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onZoomOut}
            aria-label="Diminuir zoom"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-obsidian-800 transition-colors"
            title="Zoom Menos"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-mono text-slate-300 px-1 font-semibold tabular-nums">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={onZoomIn}
            aria-label="Aumentar zoom"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-obsidian-800 transition-colors"
            title="Zoom Mais"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={onFitView}
            className="px-2 py-0.5 rounded text-slate-300 hover:text-white bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-xs font-mono flex items-center gap-1 transition-colors ml-1"
            title="Recentralizar e enquadrar"
          >
            <Maximize2 size={13} />
            <span className="hidden md:inline">Enquadrar</span>
          </button>

          {/* Botão de Alternar Painel Lateral Inspector */}
          <button
            type="button"
            onClick={onToggleInspector}
            aria-label="Alternar painel de inspeção lateral"
            className="px-2 py-0.5 rounded text-slate-300 hover:text-white bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-800 text-xs font-mono flex items-center gap-1 transition-colors ml-1"
            title="Expandir/Recolher Painel Lateral"
          >
            {isInspectorOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            <span className="hidden xl:inline">Painel</span>
          </button>
        </div>
      </div>
    </header>
  );
};
