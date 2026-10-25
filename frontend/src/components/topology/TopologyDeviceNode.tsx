import React, { memo } from "react";
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

export const TopologyDeviceNode = memo(({ data, selected }: NodeProps) => {
  const device = data as unknown as TopologyDeviceData;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "router":
        return <Router size={18} className="text-emerald-400" />;
      case "switch":
        return <Network size={18} className="text-sky-400" />;
      case "database":
        return <Database size={18} className="text-emerald-400" />;
      case "workload":
        if (device.label.includes("API")) {
          return <Layers size={18} className="text-amber-400" />;
        }
        return <Database size={18} className="text-emerald-400" />;
      default:
        if (device.status === "CRITICAL_DOWN") {
          return <Radio size={18} className="text-rose-400" />;
        }
        return <Server size={18} className="text-slate-300" />;
    }
  };

  const getBorderAndBgStyles = () => {
    if (device.status === "CRITICAL_DOWN") {
      return "border-2 border-rose-500 shadow-rose-950/40 shadow-xl";
    }
    if (device.status === "DEGRADED") {
      return "border-2 border-amber-500/80 shadow-amber-950/30 shadow-xl";
    }
    if (selected) {
      return "border-2 border-emerald-500 ring-2 ring-emerald-500/20 shadow-2xl";
    }
    return "border border-obsidian-800 hover:border-emerald-500/70 shadow-xl";
  };

  const getStatusBadge = () => {
    switch (device.status) {
      case "UP":
        return (
          <span className="flex items-center gap-1 font-mono text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> UP
          </span>
        );
      case "DEGRADED":
        return (
          <span className="flex items-center gap-1 font-mono text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-400 px-1.5 py-0.5 rounded font-bold animate-pulse">
            DEG
          </span>
        );
      case "CRITICAL_DOWN":
        return (
          <span className="flex items-center gap-1 font-mono text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/40 px-1.5 py-0.5 rounded font-bold animate-pulse">
            CRITICAL DOWN
          </span>
        );
      default:
        return (
          <span className="font-mono text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded">
            MAINT
          </span>
        );
    }
  };

  return (
    <article
      data-testid={`topology-node-${device.id}`}
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
