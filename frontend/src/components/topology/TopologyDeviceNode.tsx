import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  Router,
  Network,
  Database,
  Radio,
  Server,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { TopologyDeviceData } from "../../types/topology";

export const TopologyDeviceNode = memo(({ id, data, selected }: NodeProps) => {
  const device = data as unknown as TopologyDeviceData;
  const onNodeSelect = (data as any)?.onSelect;

  const getBorderAndBgStyles = () => {
    if (selected) {
      return "border-2 border-emerald-500 shadow-lg shadow-emerald-950/40";
    }
    switch (device.status) {
      case "CRITICAL_DOWN":
        return "border-2 border-rose-500/80 bg-rose-950/20 shadow-lg shadow-rose-950/30";
      case "DEGRADED":
        return "border-2 border-amber-500/80 bg-amber-950/15 shadow-md shadow-amber-950/20";
      case "MAINTENANCE":
        return "border-2 border-sky-500/60 bg-sky-950/10";
      case "UP":
      default:
        return "border border-obsidian-700/70 hover:border-obsidian-500/80 shadow-md";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "router":
        return <Router className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "switch":
        return <Network className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      case "database":
        return <Database className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      case "gateway":
      case "server":
        return <Server className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case "branch":
        return <Radio className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  const getStatusBadge = () => {
    switch (device.status) {
      case "CRITICAL_DOWN":
        return (
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
            DOWN
          </span>
        );
      case "DEGRADED":
        return (
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            DEG
          </span>
        );
      case "MAINTENANCE":
        return (
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/40">
            MANUT
          </span>
        );
      case "UP":
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            UP
          </span>
        );
    }
  };

  return (
    <article
      data-testid={`topology-node-${device.id || id}`}
      onClick={() => onNodeSelect?.(device.id || id)}
      className={`w-60 bg-obsidian-900 rounded-xl p-3 select-none cursor-pointer transition-colors ${getBorderAndBgStyles()}`}
    >
      {/* Handles para Conexões */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2.5 h-2.5 !bg-obsidian-800 !border-2 !border-emerald-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2.5 h-2.5 !bg-obsidian-800 !border-2 !border-emerald-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="w-2 h-2 !bg-obsidian-800 !border !border-emerald-400"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="w-2 h-2 !bg-obsidian-800 !border !border-emerald-400"
      />

      {/* Header do Card */}
      <div className="flex items-center justify-between border-b border-obsidian-800/80 pb-1.5 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {getCategoryIcon(device.category)}
          <span
            className={`font-mono tabular-nums text-xs font-bold truncate ${
              device.status === "CRITICAL_DOWN"
                ? "text-rose-400"
                : device.status === "DEGRADED"
                ? "text-amber-400"
                : selected
                ? "text-emerald-400"
                : "text-white"
            }`}
          >
            {device.label}
          </span>
        </div>
        {getStatusBadge()}
      </div>

      {/* Métricas e Detalhes Vitais */}
      <div className="space-y-1 font-mono tabular-nums text-[10px]">
        <div className="flex justify-between">
          <span className="text-slate-400">HW / MODELO:</span>
          <span className="text-slate-200 truncate font-semibold max-w-[120px] text-right">
            {device.model}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">IP:</span>
          <span className="text-slate-200 text-right">{device.ip}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">RTT:</span>
          <span
            className={`text-right font-bold ${
              device.status === "CRITICAL_DOWN"
                ? "text-rose-400"
                : device.status === "DEGRADED"
                ? "text-amber-400"
                : "text-emerald-400"
            }`}
          >
            {device.status === "CRITICAL_DOWN" ? "100% PERDA" : `${device.latencyMs}ms`}
          </span>
        </div>
        {device.status !== "CRITICAL_DOWN" && (
          <div className="flex justify-between">
            <span className="text-slate-400">CPU / RAM:</span>
            <span className="text-slate-200 text-right">
              {device.cpuUsage}% / {device.memUsage}%
            </span>
          </div>
        )}
      </div>

      {/* Footer do Card */}
      <div className="mt-2 pt-1.5 border-t border-obsidian-800/80 flex items-center justify-between text-[10px] font-mono tabular-nums">
        {device.status === "CRITICAL_DOWN" ? (
          <span className="text-rose-400 font-bold flex items-center gap-1">
            <AlertTriangle size={12} /> FIBRA ROMPIDA
          </span>
        ) : (
          <span className="text-slate-400">
            {device.portsActiveCount ? `${device.portsActiveCount}x Portas UP` : "Enlace Ativo"}
          </span>
        )}
        <span
          className={
            device.status === "CRITICAL_DOWN"
              ? "text-rose-400"
              : device.status === "DEGRADED"
              ? "text-amber-400"
              : "text-emerald-400 font-semibold"
          }
        >
          {device.traffic || "Nominal"}
        </span>
      </div>
    </article>
  );
});

TopologyDeviceNode.displayName = "TopologyDeviceNode";
