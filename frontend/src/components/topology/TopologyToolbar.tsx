import React from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Radio,
} from "lucide-react";

export type TopologyStateSimulation = "nominal" | "skeleton" | "empty" | "error";

interface TopologyToolbarProps {
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  stateSimulation: TopologyStateSimulation;
  onStateSimulationChange: (state: TopologyStateSimulation) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  zoomLevel: number;
  isInspectorOpen: boolean;
  onToggleInspector: () => void;
}

export const TopologyToolbar: React.FC<TopologyToolbarProps> = ({
  categoryFilter,
  onCategoryFilterChange,
  stateSimulation,
  onStateSimulationChange,
  onZoomIn,
  onZoomOut,
  onFitView,
  zoomLevel,
  isInspectorOpen,
  onToggleInspector,
}) => {
  return (
    <header
      data-testid="topology-toolbar"
      className="h-11 bg-obsidian-900/90 backdrop-blur border-b border-obsidian-800 px-4 flex items-center justify-between shrink-0 z-30 select-none"
    >
      {/* Esquerda: Breadcrumb NOC */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
          <span>NOC</span>
          <span className="text-slate-600">/</span>
          <span className="text-emerald-400 font-semibold">TOPOLOGIA</span>
        </div>
        <span className="h-3.5 w-px bg-obsidian-800" />
        <span className="text-xs font-sans text-slate-300 font-medium hidden sm:inline">
          Grafo Interativo de Enlaces &amp; Tráfego
        </span>
        <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
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
            Todos (7)
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
            Roteadores (2)
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
            Switches (3)
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
            DB / API (2)
          </button>
        </div>

        {/* Seletor de Estados Canônicos de UI */}
        <div className="flex items-center gap-1 bg-obsidian-950 px-2 py-1 rounded-lg border border-obsidian-800 text-[10px] font-mono">
          <span className="text-slate-400 hidden lg:inline">ESTADO:</span>
          <select
            aria-label="Simular Estado da Topologia"
            value={stateSimulation}
            onChange={(e) => onStateSimulationChange(e.target.value as TopologyStateSimulation)}
            className="bg-transparent text-emerald-400 font-semibold text-[10px] border-none focus:ring-0 p-0 cursor-pointer"
          >
            <option value="nominal" className="bg-obsidian-900 text-slate-200">
              Nominal (Ao Vivo)
            </option>
            <option value="skeleton" className="bg-obsidian-900 text-slate-200">
              Carregando (Skeleton)
            </option>
            <option value="empty" className="bg-obsidian-900 text-slate-200">
              Vazio (Sem Descoberta)
            </option>
            <option value="error" className="bg-obsidian-900 text-slate-200">
              Erro de Coletor (Boundary)
            </option>
          </select>
        </div>

        <span className="h-3.5 w-px bg-obsidian-800 hidden sm:block" />

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
