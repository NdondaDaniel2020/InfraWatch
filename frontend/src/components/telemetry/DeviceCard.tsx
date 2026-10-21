import React from "react";
import { AlertTriangle, Database, Radio, Network, Server, WifiOff } from "lucide-react";
import type { MonitoredDevice } from "../../types/telemetry";

export interface DeviceCardProps {
  device: MonitoredDevice;
  onSelect?: (device: MonitoredDevice) => void;
  onPing?: (device: MonitoredDevice) => void;
}

export type NormalizedStatus = "DOWN" | "DEG" | "UP";

export interface StatusVisualConfig {
  cardBorder: string;
  titleColor: string;
  badge: {
    label: string;
    className: string;
  };
  metricsGridBg: string;
  metricsLabelColor: string;
  latencyColor: string;
  footerBorder: string;
  ipLabel: string;
  metric2Label: string;
  getMetric2Value: (device: MonitoredDevice) => string;
  metric3Label: string;
  metric3Color: string;
  getMetric3Value: (device: MonitoredDevice) => string;
  metric4Label: string;
  metric4Color: string;
  getMetric4Value: (device: MonitoredDevice) => string;
  renderFooterStatus: (device: MonitoredDevice, onSelect?: (device: MonitoredDevice) => void) => React.ReactNode;
}

/**
 * Dicionário declarativo de estilos e apresentação orientada a dados (State-Driven Component Pattern).
 * O componente de ativo monitorado se repete e define sua paleta, rótulos e métricas
 * estritamente a partir do estado do dado recebido, eliminando ternários aninhados no JSX.
 */
export const STATUS_VISUALS: Record<NormalizedStatus, StatusVisualConfig> = {
  DOWN: {
    cardBorder: "border-2 border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.12)]",
    titleColor: "text-rose-400 hover:underline",
    badge: {
      label: "DOWN",
      className: "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse",
    },
    metricsGridBg: "bg-rose-500/10 border border-rose-500/30",
    metricsLabelColor: "text-slate-400",
    latencyColor: "text-rose-400",
    footerBorder: "border-rose-500/30",
    ipLabel: "WAN IP: ",
    metric2Label: "Perda: ",
    getMetric2Value: () => "100% PACOTES",
    metric3Label: "Causa: ",
    metric3Color: "text-rose-300 font-bold truncate",
    getMetric3Value: (device) => device.root_cause || "Fibra Rompida",
    metric4Label: "Downtime: ",
    metric4Color: "text-rose-400",
    getMetric4Value: (device) => device.downtime_duration || "00:14:32",
    renderFooterStatus: (device, onSelect) => (
      <button
        type="button"
        onClick={() => onSelect?.(device)}
        className="text-rose-400 font-bold hover:underline cursor-pointer"
      >
        {device.ticket_id ? `Ticket #${device.ticket_id} ↗` : "Ticket #8492 ↗"}
      </button>
    ),
  },
  DEG: {
    cardBorder: "border-2 border-amber-500/70 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
    titleColor: "text-amber-400 hover:underline",
    badge: {
      label: "DEG",
      className: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    },
    metricsGridBg: "bg-amber-500/10 border border-amber-500/30",
    metricsLabelColor: "text-slate-400",
    latencyColor: "text-amber-400",
    footerBorder: "border-amber-500/30",
    ipLabel: "Host IP: ",
    metric2Label: "RTT Spike: ",
    getMetric2Value: (device) => `${device.last_latency_ms || 142}ms ⚠️`,
    metric3Label: "CPU / RAM: ",
    metric3Color: "text-amber-400 font-bold",
    getMetric3Value: (device) => `${device.cpu_usage_pct || 89}% / ${device.ram_usage_pct || 78}%`,
    metric4Label: "Pool: ",
    metric4Color: "text-slate-200",
    getMetric4Value: () => "4.8k Sockets",
    renderFooterStatus: () => (
      <span className="text-amber-400 font-semibold">Alerta de Latência</span>
    ),
  },
  UP: {
    cardBorder: "border border-obsidian-800 hover:border-emerald-500/70",
    titleColor: "text-white hover:text-emerald-400",
    badge: {
      label: "UP",
      className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    },
    metricsGridBg: "bg-obsidian-950 border border-obsidian-800/80",
    metricsLabelColor: "text-slate-500",
    latencyColor: "text-emerald-400",
    footerBorder: "border-obsidian-800/60",
    ipLabel: "IP: ",
    metric2Label: "RTT: ",
    getMetric2Value: (device) => `${device.last_latency_ms ? device.last_latency_ms.toFixed(1) : "2.1"}ms`,
    metric3Label: "CPU / RAM: ",
    metric3Color: "text-slate-200",
    getMetric3Value: (device) => `${device.cpu_usage_pct || 58}% / ${device.ram_usage_pct || 61}%`,
    metric4Label: "SFP+: ",
    metric4Color: "text-sky-400",
    getMetric4Value: (device) => device.ports_summary || "18/24 UP",
    renderFooterStatus: (device) => `Uptime: ${device.uptime_duration || "184d 12h"}`,
  },
};

export const getStatusKey = (device: MonitoredDevice): NormalizedStatus => {
  if (device.status === "DOWN" || device.severity === "critical") return "DOWN";
  if (device.status === "DEG" || device.severity === "degraded") return "DEG";
  return "UP";
};

const getCategoryIcon = (statusKey: NormalizedStatus, category?: string, name?: string) => {
  if (statusKey === "DOWN") return <WifiOff size={18} className="text-rose-400" aria-hidden="true" />;
  if (statusKey === "DEG") return <AlertTriangle size={18} className="text-amber-400" aria-hidden="true" />;
  const cat = (category || "").toUpperCase();
  const n = (name || "").toUpperCase();
  if (cat.includes("DATABASE") || n.includes("DB")) {
    return <Database size={18} className="text-emerald-400" aria-hidden="true" />;
  }
  if (cat.includes("ROUTER") || n.includes("RT")) {
    return <Radio size={18} className="text-emerald-400" aria-hidden="true" />;
  }
  if (cat.includes("GATEWAY") || n.includes("GATEWAY")) {
    return <Server size={18} className="text-emerald-400" aria-hidden="true" />;
  }
  return <Network size={18} className="text-emerald-400" aria-hidden="true" />;
};

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onSelect,
  onPing,
}) => {
  const statusKey = getStatusKey(device);
  const visual = STATUS_VISUALS[statusKey];

  return (
    <article
      data-testid={`device-card-${device.device_id}`}
      data-tenant={device.tenant_id}
      data-severity={device.severity}
      className={`device-card bg-obsidian-900 rounded-xl p-4 flex flex-col justify-between transition-colors shadow-sm ${visual.cardBorder}`}
    >
      <div>
        {/* Cabeçalho do Card */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect?.(device)}
                className={`font-mono tabular-nums font-bold text-sm text-left transition-colors cursor-pointer ${visual.titleColor}`}
              >
                {device.name}
              </button>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${visual.badge.className}`}>
                {visual.badge.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {device.model_description || `${device.category || "DISPOSITIVO"} • Cluster`}
            </p>
          </div>

          <div className="shrink-0">{getCategoryIcon(statusKey, device.category, device.name)}</div>
        </div>

        {/* Grade 2x2 de Informações Técnicas */}
        <div
          className={`grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums mt-3 p-2 rounded ${visual.metricsGridBg}`}
        >
          {/* Célula 1: IP / WAN IP */}
          <div>
            <span className={visual.metricsLabelColor}>{visual.ipLabel}</span>
            <span className="text-slate-200">{device.ip_address}</span>
          </div>

          {/* Célula 2: RTT / Perda */}
          <div className="text-right">
            <span className={visual.metricsLabelColor}>{visual.metric2Label}</span>
            <span className={`font-bold ${visual.latencyColor}`}>
              {visual.getMetric2Value(device)}
            </span>
          </div>

          {/* Célula 3: Causa / CPU */}
          <div>
            <span className={visual.metricsLabelColor}>{visual.metric3Label}</span>
            <span className={visual.metric3Color}>
              {visual.getMetric3Value(device)}
            </span>
          </div>

          {/* Célula 4: Downtime / SFP+ / Pool */}
          <div className="text-right">
            <span className={visual.metricsLabelColor}>{visual.metric4Label}</span>
            <span className={`font-bold ${visual.metric4Color}`}>
              {visual.getMetric4Value(device)}
            </span>
          </div>
        </div>
      </div>

      {/* Rodapé com Uptime e Ações */}
      <div
        className={`mt-3 pt-2 border-t flex items-center justify-between text-xs font-mono ${visual.footerBorder}`}
      >
        <span className="text-slate-400">
          {visual.renderFooterStatus(device, onSelect)}
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
