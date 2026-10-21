import React, { useEffect } from "react";
import { RefreshCw, Wrench, X } from "lucide-react";
import type { MonitoredDevice } from "../../types/telemetry";
import { Sparkline } from "./Sparkline";
import { UptimeHistory90d } from "./UptimeHistory90d";

export interface DeviceDetailDrawerProps {
  device: MonitoredDevice | null;
  isOpen: boolean;
  onClose: () => void;
  onPing?: (device: MonitoredDevice) => void;
}

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  device,
  isOpen,
  onClose,
  onPing,
}) => {
  // Fecha a gaveta com ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !device) return null;

  const isDown = device.status === "DOWN" || device.severity === "critical";
  const isDegraded = device.status === "DEG" || device.severity === "degraded";

  return (
    <div
      data-testid="device-detail-drawer-backdrop"
      className="fixed inset-0 bg-obsidian-950/80 backdrop-blur-sm z-[100] flex justify-end animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-device-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        data-testid="device-detail-drawer-content"
        className="w-full max-w-xl h-full bg-obsidian-900 border-l border-obsidian-800 shadow-2xl flex flex-col justify-between overflow-y-auto"
      >
        {/* Header do Drawer */}
        <div className="p-5 border-b border-obsidian-800 flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                {device.category || "DISPOSITIVO"}
              </span>

              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  isDown
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                    : isDegraded
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {device.status}
              </span>
            </div>

            <h2
              id="drawer-device-title"
              className="text-lg font-bold font-mono text-white mt-2 mb-0.5"
            >
              {device.name}
            </h2>
            <p className="text-xs text-slate-400 m-0">
              {device.model_description || "Ativo de Rede Monitorado"} • {device.location || "DC Luanda"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar gaveta de detalhes"
            className="p-1.5 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com Informações Detalhadas */}
        <div className="p-5 flex flex-col gap-5 flex-1">
          {/* Métricas Principais */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
              <div className="text-[10px] font-mono text-slate-400">LATÊNCIA RTT</div>
              <div
                className={`text-lg font-mono font-bold mt-1 ${
                  isDown
                    ? "text-rose-400"
                    : isDegraded
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {device.last_latency_ms !== null && device.last_latency_ms !== undefined
                  ? `${device.last_latency_ms.toFixed(1)}ms`
                  : "--"}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
              <div className="text-[10px] font-mono text-slate-400">PERDA PACOTES</div>
              <div
                className={`text-lg font-mono font-bold mt-1 ${
                  isDown ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {isDown ? "100%" : `${device.last_packet_loss || 0}%`}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
              <div className="text-[10px] font-mono text-slate-400">DISPONIBILIDADE</div>
              <div className="text-lg font-mono font-bold mt-1 text-emerald-400">
                99.98%
              </div>
            </div>
          </div>

          {/* Sparkline de Tendência RTT */}
          <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
            <div className="flex justify-between items-center text-xs font-mono text-slate-400 mb-2.5">
              <span>Série Temporal de Latência (60 minutos)</span>
              <span className="text-emerald-400 font-semibold">TimescaleDB Sincronizado</span>
            </div>
            <Sparkline
              data={device.recent_latency || [2.1, 2.3, 2.0, 2.4, 2.2, 2.1, 2.5, 2.1, 2.0, 2.2]}
              width={520}
              height={50}
              severity={device.severity}
            />
          </div>

          {/* Histórico de Disponibilidade 90 Dias */}
          <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800/80">
            <div className="text-xs font-mono text-slate-400 mb-2">
              Histórico de Disponibilidade Operacional
            </div>
            <UptimeHistory90d
              days={device.availability_90d}
              barCount={30}
              overallUptime={99.98}
            />
          </div>

          {/* Ficha Técnica de Conectividade */}
          <div className="p-4 rounded-xl bg-obsidian-950 border border-obsidian-800/80 text-xs font-mono flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Endereço IP:</span>
              <span className="text-white font-semibold">{device.ip_address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Porta / Protocolo:</span>
              <span className="text-white font-semibold">
                {device.port || 443} / {device.protocol || "ICMP"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Organização / Tenant:</span>
              <span className="text-emerald-400 font-semibold">
                {device.tenant_name || "Unitel Backbone"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Interfaces SFP+:</span>
              <span className="text-sky-400 font-semibold">
                {device.ports_summary || "18/24 UP (LACP Trunk 1)"}
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé com Ações Operacionais */}
        <div className="p-5 border-t border-obsidian-800 bg-obsidian-950/90 flex justify-between items-center gap-3">
          <div className="flex gap-2">
            {onPing && (
              <button
                type="button"
                onClick={() => onPing(device)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Ping Teste</span>
              </button>
            )}

            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-300 hover:text-white text-xs font-mono font-medium transition-colors cursor-pointer"
            >
              <Wrench size={14} />
              <span>Manutenção</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-obsidian-850 hover:bg-obsidian-800 border border-obsidian-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </aside>
    </div>
  );
};
