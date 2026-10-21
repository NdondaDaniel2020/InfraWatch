import React from "react";
import { AlertTriangle, Database, Radio, Network, Server, WifiOff } from "lucide-react";
import type { MonitoredDevice } from "../../types/telemetry";

export interface DeviceCardProps {
  device: MonitoredDevice;
  onSelect?: (device: MonitoredDevice) => void;
  onPing?: (device: MonitoredDevice) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onSelect,
  onPing,
}) => {
  const isDown = device.status === "DOWN" || device.severity === "critical";
  const isDegraded = device.status === "DEG" || device.severity === "degraded";

  const getCategoryIcon = () => {
    const cat = (device.category || "").toUpperCase();
    if (isDown) return <WifiOff size={18} className="text-rose-400" aria-hidden="true" />;
    if (isDegraded) return <AlertTriangle size={18} className="text-amber-400" aria-hidden="true" />;
    if (cat.includes("DATABASE") || device.name.includes("DB")) {
      return <Database size={18} className="text-emerald-400" aria-hidden="true" />;
    }
    if (cat.includes("ROUTER") || device.name.includes("RT")) {
      return <Radio size={18} className="text-emerald-400" aria-hidden="true" />;
    }
    if (cat.includes("GATEWAY") || device.name.includes("GATEWAY")) {
      return <Server size={18} className="text-emerald-400" aria-hidden="true" />;
    }
    return <Network size={18} className="text-emerald-400" aria-hidden="true" />;
  };

  const getStatusBadge = () => {
    if (isDown) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
          DOWN
        </span>
      );
    }
    if (isDegraded) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
          DEG
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        UP
      </span>
    );
  };

  return (
    <article
      data-testid={`device-card-${device.device_id}`}
      data-tenant={device.tenant_id}
      data-severity={device.severity}
      className={`device-card bg-obsidian-900 rounded-xl p-4 flex flex-col justify-between transition-colors shadow-sm ${
        isDown
          ? "border-2 border-rose-500/80"
          : isDegraded
          ? "border-2 border-amber-500/70"
          : "border border-obsidian-800 hover:border-emerald-500/70"
      }`}
    >
      <div>
        {/* Cabeçalho do Card */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect?.(device)}
                className={`font-mono tabular-nums font-bold text-sm text-left transition-colors cursor-pointer ${
                  isDown
                    ? "text-rose-400 hover:underline"
                    : isDegraded
                    ? "text-amber-400 hover:underline"
                    : "text-white hover:text-emerald-400"
                }`}
              >
                {device.name}
              </button>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {device.model_description || `${device.category || "DISPOSITIVO"} • Cluster`}
            </p>
          </div>

          <div className="shrink-0">{getCategoryIcon()}</div>
        </div>

        {/* Grade 2x2 de Informações Técnicas */}
        <div
          className={`grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums mt-3 p-2 rounded ${
            isDown
              ? "bg-rose-500/10 border border-rose-500/30"
              : isDegraded
              ? "bg-amber-500/10 border border-amber-500/30"
              : "bg-obsidian-950 border border-obsidian-800/80"
          }`}
        >
          {/* Célula 1: IP / WAN IP */}
          <div>
            <span className={isDown || isDegraded ? "text-slate-400" : "text-slate-500"}>
              {isDown ? "WAN IP: " : isDegraded ? "Host IP: " : "IP: "}
            </span>
            <span className="text-slate-200">{device.ip_address}</span>
          </div>

          {/* Célula 2: RTT / Perda */}
          <div className="text-right">
            <span className={isDown || isDegraded ? "text-slate-400" : "text-slate-500"}>
              {isDown ? "Perda: " : isDegraded ? "RTT Spike: " : "RTT: "}
            </span>
            <span
              className={`font-bold ${
                isDown
                  ? "text-rose-400"
                  : isDegraded
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {isDown
                ? "100% PACOTES"
                : isDegraded
                ? `${device.last_latency_ms || 142}ms ⚠️`
                : `${device.last_latency_ms ? device.last_latency_ms.toFixed(1) : "2.1"}ms`}
            </span>
          </div>

          {/* Célula 3: Causa / CPU */}
          <div>
            <span className={isDown || isDegraded ? "text-slate-400" : "text-slate-500"}>
              {isDown ? "Causa: " : "CPU / RAM: "}
            </span>
            <span
              className={
                isDown
                  ? "text-rose-300 font-bold truncate"
                  : isDegraded
                  ? "text-amber-400 font-bold"
                  : "text-slate-200"
              }
            >
              {isDown
                ? device.root_cause || "Fibra Rompida"
                : `${device.cpu_usage_pct || (isDegraded ? 89 : 58)}% / ${device.ram_usage_pct || (isDegraded ? 78 : 61)}%`}
            </span>
          </div>

          {/* Célula 4: Downtime / SFP+ / Pool */}
          <div className="text-right">
            <span className={isDown || isDegraded ? "text-slate-400" : "text-slate-500"}>
              {isDown ? "Downtime: " : isDegraded ? "Pool: " : "SFP+: "}
            </span>
            <span
              className={`font-bold ${
                isDown
                  ? "text-rose-400"
                  : isDegraded
                  ? "text-slate-200"
                  : "text-sky-400"
              }`}
            >
              {isDown
                ? device.downtime_duration || "00:14:32"
                : isDegraded
                ? "4.8k Sockets"
                : device.ports_summary || "18/24 UP"}
            </span>
          </div>
        </div>
      </div>

      {/* Rodapé com Uptime e Ações */}
      <div
        className={`mt-3 pt-2 border-t flex items-center justify-between text-xs font-mono ${
          isDown
            ? "border-rose-500/30"
            : isDegraded
            ? "border-amber-500/30"
            : "border-obsidian-800/60"
        }`}
      >
        <span className="text-slate-400">
          {isDown ? (
            <button
              type="button"
              onClick={() => onSelect?.(device)}
              className="text-rose-400 font-bold hover:underline cursor-pointer"
            >
              {device.ticket_id ? `Ticket #${device.ticket_id} ↗` : "Ticket #8492 ↗"}
            </button>
          ) : isDegraded ? (
            <span className="text-amber-400 font-semibold">Alerta de Latência</span>
          ) : (
            `Uptime: ${device.uptime_duration || "184d 12h"}`
          )}
        </span>

        <div className="flex items-center gap-2">
          {onPing && (
            <button
              type="button"
              onClick={() => onPing(device)}
              className="text-emerald-400 hover:underline cursor-pointer font-medium"
            >
              Ping Agora
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelect?.(device)}
            className="px-2 py-0.5 rounded bg-obsidian-850 hover:bg-obsidian-800 text-slate-300 hover:text-white border border-obsidian-700 text-[11px] font-medium transition-colors cursor-pointer"
          >
            Detalhes
          </button>
        </div>
      </div>
    </article>
  );
};
